// flowEngine.mjs — Power Plant Flow Calculation & Estimation Engine.
//
// Implements three independent flow-estimation methods per the spec, plus a
// comparison/consistency layer:
//   A. DP transmitter / flow-element calculation  (calculateDPFlow)
//   B. Energy/mass balance estimation              (energyBalanceSteamFlow)
//   C. MW-based parameter estimation                (mwBasedFlowEstimate)
//
// This module is purely additive: it reuses the existing engine wherever
// possible (units.mjs for conversions, thermalPlant.js's boiler-duty
// correlation for method B, thermalPlantAdvanced.js's full solver for
// method C) rather than re-deriving them, and does not modify any existing
// exported function's behavior.
//
// Honesty notes carried over from the rest of this app: fluid density here
// uses the ideal gas law for air/steam, clearly labeled as an approximation
// — steam deviates meaningfully from ideal-gas behavior at typical main
// steam conditions (150-300+ bar), so this is adequate for planning-level
// DP flow estimates, not a substitute for IAPWS-IF97 steam tables in a
// custody-transfer or design-grade flow computer.

import * as units from './units.js';
import { estimateEnthalpyRiseKcalKg } from './thermalPlant.js';
import * as tpa from './thermalPlantAdvanced.js';

export const FLOW_ELEMENT_TYPES = ['orifice', 'venturi', 'nozzle', 'pitot', 'v-cone', 'custom'];

/** Typical discharge coefficients by element type — starting points, always
 * user-overridable (spec: never rely on Flow=K√DP with an uncalibrated K). */
export const DEFAULT_CD = {
  orifice: 0.6, venturi: 0.98, nozzle: 0.96, pitot: 0.84, 'v-cone': 0.82, custom: null,
};

export const FLUID_CLASSES = ['liquid', 'gas', 'steam'];

const R_AIR = 287.05; // J/(kg·K) specific gas constant, dry air — standard, high-confidence value
const R_STEAM = 461.5; // J/(kg·K) specific gas constant, water vapor — standard value

/**
 * Ideal-gas density approximation, rho = P/(R×T). Adequate for combustion
 * air (behaves close to ideal gas at typical duct conditions). For steam,
 * this is a labeled APPROXIMATION — real steam deviates substantially from
 * ideal-gas behavior at power-plant pressures; use for planning estimates
 * only.
 */
export function idealGasDensity(pressurePa, tempC, gasConstant = R_AIR) {
  const T = tempC + 273.15;
  if (T <= 0) throw new Error('Temperature must be above absolute zero');
  if (pressurePa <= 0) throw new Error('Pressure must be > 0');
  return pressurePa / (gasConstant * T);
}
export function airDensity(pressurePa, tempC) { return idealGasDensity(pressurePa, tempC, R_AIR); }
export function steamDensityApprox(pressurePa, tempC) { return idealGasDensity(pressurePa, tempC, R_STEAM); }

/** Liquid water density at atmospheric-ish pressure, standard reference
 * table (0-300°C) with linear interpolation — a convenience default for the
 * DP→Flow Wizard's "Water" fluid choice. This is NOT pressure-corrected
 * (liquid density's pressure dependence is small compared to its
 * temperature dependence over this range, a standard simplification) — for
 * precise feedwater/condensate density, override with a value from actual
 * steam tables. */
const WATER_DENSITY_TABLE = [
  [0, 999.8], [20, 998.2], [50, 988.0], [100, 958.0], [150, 917.0],
  [200, 865.0], [250, 799.0], [300, 712.0],
];
export function approxWaterDensity(tempC) {
  if (tempC < 0 || tempC > 300) throw new Error('approxWaterDensity is only valid 0-300°C — supply density directly outside this range');
  for (let i = 0; i < WATER_DENSITY_TABLE.length - 1; i++) {
    const [t0, r0] = WATER_DENSITY_TABLE[i];
    const [t1, r1] = WATER_DENSITY_TABLE[i + 1];
    if (tempC >= t0 && tempC <= t1) {
      const frac = (tempC - t0) / (t1 - t0);
      return r0 + frac * (r1 - r0);
    }
  }
  throw new Error('Unexpected temperature range');
}

/**
 * ISO 5167-style expansion (expansibility) factor for compressible flow
 * through an orifice, approximate form: Y ≈ 1 − (0.41 + 0.35β⁴)×(ΔP/(κ·P₁))
 * — standard first-order approximation; κ (isentropic exponent) ≈ 1.3 for
 * superheated steam, ≈ 1.4 for air, both standard textbook values.
 */
export function expansionFactor(beta, dpPa, upstreamPressurePa, kappa = 1.4) {
  if (upstreamPressurePa <= 0) throw new Error('Upstream pressure must be > 0');
  if (dpPa < 0) throw new Error('DP cannot be negative');
  if (dpPa >= upstreamPressurePa) {
    throw new Error('Differential pressure cannot equal or exceed the upstream absolute pressure — the downstream pressure would be zero or negative.');
  }
  return 1 - (0.41 + 0.35 * Math.pow(beta, 4)) * (dpPa / (kappa * upstreamPressurePa));
}

/**
 * Generalized DP flow-element calculation (method A). Supports orifice,
 * venturi, nozzle, averaging pitot, v-cone, or a custom calibrated element.
 * Does NOT default to a bare Flow=K√DP — Cd is per-element-type (or must be
 * supplied for 'custom'), and expansion factor is applied for compressible
 * fluids (gas/steam), matching the spec's explicit requirement.
 *
 * @param {object} opts
 * @param {'orifice'|'venturi'|'nozzle'|'pitot'|'v-cone'|'custom'} opts.elementType
 * @param {number} opts.dpPa
 * @param {number} opts.upstreamPressurePa
 * @param {number} opts.tempC
 * @param {number} opts.pipeIdM
 * @param {number} opts.boreM — throat/bore diameter (ignored for pitot; use pipeIdM only)
 * @param {'liquid'|'gas'|'steam'} opts.fluidClass
 * @param {number} [opts.densityKgM3] — direct density override (e.g. from a steam table lookup); if omitted, computed via ideal-gas law for gas/steam, or must be supplied for liquid
 * @param {number} [opts.cd] — discharge coefficient override; defaults per elementType
 * @param {number} [opts.viscosityPaS] — for Reynolds number; optional
 * @param {number} [opts.kappa] — isentropic exponent for expansion factor; default 1.4 (air), use ~1.3 for steam
 */
export function calculateDPFlow(opts) {
  const {
    elementType, dpPa, upstreamPressurePa, tempC, pipeIdM, boreM, fluidClass,
    densityKgM3, cd, viscosityPaS, kappa = fluidClass === 'steam' ? 1.3 : 1.4,
  } = opts;
  if (!FLOW_ELEMENT_TYPES.includes(elementType)) throw new Error(`Unknown flow element type: ${elementType}`);
  if (dpPa < 0) throw new Error('DP cannot be negative');
  if (pipeIdM <= 0) throw new Error('Pipe ID must be > 0');
  if (upstreamPressurePa <= 0) throw new Error('Upstream pressure must be > 0');
  if (dpPa >= upstreamPressurePa) {
    throw new Error('Differential pressure cannot equal or exceed the upstream absolute pressure — the downstream pressure would be zero or negative. Check for a units mix-up (e.g. DP in kPa but pressure in Pa) or a pressure reference error.');
  }

  const usedCd = cd ?? DEFAULT_CD[elementType];
  if (usedCd === null || usedCd === undefined) {
    throw new Error(`No default discharge coefficient for '${elementType}' — this element must be individually calibrated; supply cd explicitly.`);
  }

  let density = densityKgM3;
  if (density === undefined || density === null) {
    if (fluidClass === 'liquid') throw new Error('Liquid density must be supplied — no ideal-gas approximation applies to liquids.');
    density = fluidClass === 'steam' ? steamDensityApprox(upstreamPressurePa, tempC) : airDensity(upstreamPressurePa, tempC);
  }

  const beta = elementType === 'pitot' ? null : boreM / pipeIdM;
  if (beta !== null && !(beta > 0 && beta < 1)) throw new Error('Beta ratio must be between 0 and 1');

  const Y = (fluidClass === 'gas' || fluidClass === 'steam') && beta !== null
    ? expansionFactor(beta, dpPa, upstreamPressurePa, kappa)
    : 1;

  let volumetricFlowM3s;
  if (elementType === 'pitot') {
    // Averaging pitot/Annubar: velocity-based, area = full pipe bore
    const velocity = usedCd * Math.sqrt((2 * dpPa) / density);
    const area = (Math.PI / 4) * pipeIdM * pipeIdM;
    volumetricFlowM3s = velocity * area;
  } else {
    const area = (Math.PI / 4) * boreM * boreM;
    const E = 1 / Math.sqrt(1 - Math.pow(beta, 4));
    volumetricFlowM3s = usedCd * E * Y * area * Math.sqrt((2 * dpPa) / density);
  }

  const massFlowKgS = volumetricFlowM3s * density;
  const pipeArea = (Math.PI / 4) * pipeIdM * pipeIdM;
  const velocity = volumetricFlowM3s / pipeArea;
  let reynolds = null;
  if (viscosityPaS) reynolds = (4 * massFlowKgS) / (Math.PI * viscosityPaS * pipeIdM);

  return {
    elementType, beta, cd: usedCd, expansionFactor: Y, density, velocityMs: velocity,
    reynolds, massFlowKgS, volumetricFlowM3s,
    massFlowTh: massFlowKgS * 3.6, volumetricFlowM3h: volumetricFlowM3s * 3600,
    trace: [
      { step: 'DP', value: dpPa, unit: 'Pa' },
      { step: 'Absolute pressure', value: upstreamPressurePa, unit: 'Pa' },
      { step: 'Temperature', value: tempC, unit: '°C' },
      { step: 'Density', value: density, unit: 'kg/m³' },
      { step: 'Pipe area', value: pipeArea, unit: 'm²' },
      { step: 'Beta ratio', value: beta, unit: '-' },
      { step: 'Discharge coefficient (Cd)', value: usedCd, unit: '-' },
      { step: 'Expansion factor (Y)', value: Y, unit: '-' },
      { step: 'Reynolds number', value: reynolds, unit: '-' },
      { step: 'Volumetric flow', value: volumetricFlowM3s, unit: 'm³/s' },
      { step: 'Mass flow', value: massFlowKgS, unit: 'kg/s' },
    ],
  };
}

// ---------------- Method B: Energy/mass balance estimation ----------------

/**
 * Steam flow from fuel energy input and boiler efficiency (method B).
 * Reuses the exact same boiler-duty correlation as the Thermal Plant
 * Estimator (thermalPlant.mjs) rather than re-deriving it.
 */
export function energyBalanceSteamFlow({ fuelFlowKgH, fuelGcvKcalKg, boilerEfficiencyPct, feedwaterTempC, mainSteamPressureBar, mainSteamTempC }) {
  const qFuelKcalH = fuelFlowKgH * fuelGcvKcalKg;
  const qBoilerKcalH = qFuelKcalH * (boilerEfficiencyPct / 100);
  const enthalpyRiseKcalKg = estimateEnthalpyRiseKcalKg(mainSteamPressureBar, mainSteamTempC, feedwaterTempC);
  const steamFlowKgH = qBoilerKcalH / enthalpyRiseKcalKg;
  return {
    qFuelKcalH, qBoilerKcalH, enthalpyRiseKcalKg,
    steamFlowKgH, steamFlowTh: steamFlowKgH / 1000,
    status: 'ENERGY BALANCE ESTIMATE',
  };
}

/** Feedwater from mass balance: steam + blowdown + spray (method B, section 11). */
export function feedwaterMassBalance({ steamFlowTh, blowdownPctOfSteam = 1.5, sprayFlowTh = 0, extractionFlowTh = 0 }) {
  const blowdownTh = steamFlowTh * (blowdownPctOfSteam / 100);
  const feedwaterTh = steamFlowTh + blowdownTh + sprayFlowTh + extractionFlowTh;
  return { steamFlowTh, blowdownTh, sprayFlowTh, extractionFlowTh, feedwaterTh };
}

// ---------------- Combustion: theoretical air, excess air ----------------

/**
 * Theoretical (stoichiometric) O2 and air requirement from ultimate fuel
 * analysis mass fractions (spec section 8). O2_required = 2.667C+8H+S−O
 * (kg O2/kg fuel); Air_theoretical = O2_required / airO2MassFraction
 * (0.232 = standard mass fraction of O2 in air). This is the same underlying
 * O2-mass-balance relationship as the 11.5C+34.5(H−O/8)+4.32S shorthand used
 * elsewhere in this app — both derive from dividing each element's O2
 * demand by air's O2 mass fraction — but the two use independently-rounded
 * conventional coefficients (11.5 ≈ 2.667/0.232, 34.5 ≈ 8/0.232, 4.32 ≈
 * 1/0.232), so they agree to within a fraction of a percent, not bit-for-bit.
 * Shown here in the explicit two-step form the spec asks for, for
 * calculation-trace clarity.
 */
export function theoreticalCombustionAir({ carbonPct, hydrogenPct, oxygenPct = 0, sulfurPct = 0, airO2MassFraction = 0.232 }) {
  const C = carbonPct / 100, H = hydrogenPct / 100, O = oxygenPct / 100, S = sulfurPct / 100;
  const o2RequiredKgPerKgFuel = 2.667 * C + 8 * H + S - O;
  const airTheoreticalKgPerKgFuel = o2RequiredKgPerKgFuel / airO2MassFraction;
  return { o2RequiredKgPerKgFuel, airTheoreticalKgPerKgFuel, airO2MassFraction };
}

export function actualAirFromExcess(airTheoreticalKgPerKgFuel, excessAirPct) {
  return airTheoreticalKgPerKgFuel * (1 + excessAirPct / 100);
}

/** Standard O2 <-> excess air relationship (general combustion approximation,
 * assumes no CO/unburnt fuel in flue gas). The spec correctly warns this is
 * not universal across all fuels/combustion bases without accounting for
 * fuel composition — this is the standard general-purpose approximation,
 * shown with that caveat in the UI rather than silently presented as exact. */
export function excessAirFromO2(o2Pct) { return (o2Pct / (21 - o2Pct)) * 100; }
export function o2FromExcessAir(excessAirPct) { return (21 * excessAirPct) / (100 + excessAirPct); }

// ---------------- Method C: MW-based estimation ----------------

/** Typical fuel GCV by type, kcal/kg (illustrative defaults — always
 * overridable). Mode 3's own solver (thermalPlantAdvanced.mjs) does not
 * currently include fuelGcvKcalKg in its typical-fallback chain — supplying
 * it here keeps the MW-based estimate usable even with MW as the only
 * input, without touching that module's existing behavior. */
const DEFAULT_FUEL_GCV_KCAL_KG = { coal: 4200, oil: 10200, gas: 9000, biomass: 3500, other: 4200 };

/**
 * MW-based flow estimation (method C) — delegates to the existing Mode 3
 * flexible solver (thermalPlantAdvanced.mjs) rather than re-implementing
 * it, then repackages the flow-relevant outputs with a confidence rating
 * based on how many of the key modeling assumptions the user actually
 * supplied themselves (vs. typical/predicted defaults) — per spec section
 * 12, MW alone must never be presented as if exact flows are "known".
 */
export function mwBasedFlowEstimate(grossMW, config, userProvidedKeys = []) {
  const inputs = { grossMW, ...Object.fromEntries(userProvidedKeys.map((k) => [k, config[k]])) };
  if (!userProvidedKeys.includes('fuelGcvKcalKg') && inputs.fuelGcvKcalKg === undefined) {
    inputs.fuelGcvKcalKg = DEFAULT_FUEL_GCV_KCAL_KG[config.fuelType] ?? DEFAULT_FUEL_GCV_KCAL_KG.coal;
  }
  const result = tpa.estimate(inputs, config);
  const keyAssumptions = ['boilerEfficiencyPct', 'turbineEfficiencyPct', 'fuelGcvKcalKg'];
  const providedCount = keyAssumptions.filter((k) => userProvidedKeys.includes(k)).length;
  const confidence = providedCount >= 3 ? 'HIGH' : providedCount >= 1 ? 'MEDIUM' : 'LOW';
  const flows = {};
  for (const key of ['fuelFlowTh', 'mainSteamFlowTh', 'feedwaterFlowTh', 'combustionAirFlowTh', 'primaryAirFlowTh', 'secondaryAirFlowTh', 'flueGasFlowTh']) {
    if (result.parameters[key]) flows[key] = result.parameters[key];
  }
  return { grossMW, flows, confidence, status: 'MW-BASED ESTIMATE', fullResult: result };
}

// ---------------- Comparison & data quality ----------------

/** Compare a flow value across the methods that produced it; deviation is
 * relative to the first ("reference") entry supplied. */
export function compareFlowMethods(entries) {
  // entries: [{ method, value }], first entry is the reference (typically DP-measured)
  if (!entries.length) throw new Error('At least one entry required');
  const ref = entries[0];
  const rows = entries.map((e) => {
    const deviation = ref.value !== 0 ? e.value - ref.value : null;
    const deviationPct = ref.value !== 0 ? (deviation / ref.value) * 100 : null;
    return { ...e, deviation, deviationPct };
  });
  const nonRefDeviations = rows.slice(1).map((r) => Math.abs(r.deviationPct ?? 0));
  const meanDeviationPct = nonRefDeviations.length ? nonRefDeviations.reduce((a, b) => a + b, 0) / nonRefDeviations.length : 0;
  return { rows, meanDeviationPct };
}

/** Automatic flow-consistency check against a user-defined tolerance. Never
 * declares an instrument faulty — lists possible causes instead (spec
 * section 14). */
export function consistencyCheck(measuredValue, estimatedValue, tolerancePct = 5) {
  const deviationPct = measuredValue !== 0 ? ((estimatedValue - measuredValue) / measuredValue) * 100 : 0;
  const withinTolerance = Math.abs(deviationPct) <= tolerancePct;
  return {
    deviationPct, withinTolerance,
    warning: withinTolerance ? null : 'WARNING: deviation exceeds tolerance',
    possibleCauses: withinTolerance ? [] : [
      'DP transmitter calibration/zero error', 'Incorrect density assumption',
      'Incorrect pressure/temperature reading', 'Flow-element coefficient (Cd) error',
      'Instrument calibration overdue', 'Genuine process abnormality',
      'Incorrect plant/assumption configuration in the estimate',
    ],
  };
}

/** Simple 0-100 data quality score from a set of named boolean checks. */
export function dataQualityScore(checks) {
  // checks: { name: boolean } — true = passed
  const entries = Object.entries(checks);
  const passed = entries.filter(([, ok]) => ok).length;
  const score = entries.length ? Math.round((passed / entries.length) * 100) : 0;
  return { score, passed, total: entries.length, failed: entries.filter(([, ok]) => !ok).map(([name]) => name) };
}

export function validateDPFlowInputs({ beta, reynolds, cd, dpPa, densityKgM3 }) {
  return dataQualityScore({
    'Beta ratio in valid range (0.1-0.75)': beta === null || (beta >= 0.1 && beta <= 0.75),
    'Reynolds number turbulent (>4000)': reynolds === null || reynolds > 4000,
    'Discharge coefficient plausible (0.5-1.0)': cd >= 0.5 && cd <= 1.0,
    'DP non-negative': dpPa >= 0,
    'Density positive': densityKgM3 > 0,
    'No impossible (NaN/Infinite) values': [beta, reynolds, cd, dpPa, densityKgM3].every((v) => v === null || Number.isFinite(v)),
  });
}

// ---------------- DP transmitter model (prevents double sqrt extraction) ----------------

/**
 * Models a DP transmitter's DP% -> Flow% relationship, guarding against the
 * classic instrumentation mistake of applying square-root extraction twice
 * (once in the transmitter, once in the DCS/calculator) — spec section 15.
 * Exactly one of sqrtInTransmitter / sqrtInDcs / sqrtInCalculator should be
 * true; this function throws if more than one stage claims to extract.
 */
export function dpTransmitterModel({ lrv, urv, actualDP, sqrtInTransmitter = false, sqrtInDcs = false, sqrtInCalculator = false }) {
  const extractionStages = [sqrtInTransmitter, sqrtInDcs, sqrtInCalculator].filter(Boolean).length;
  if (extractionStages > 1) {
    throw new Error('Double (or triple) square-root extraction detected — exactly one stage (transmitter, DCS, or calculator) should extract the square root, not more than one.');
  }
  const dpPct = ((actualDP - lrv) / (urv - lrv)) * 100;
  const flowPct = extractionStages === 1 ? Math.sqrt(Math.max(0, dpPct) / 100) * 100 : dpPct;
  const mA = 4 + (dpPct / 100) * 16;
  return { dpPct, flowPct, mA, sqrtApplied: extractionStages === 1 };
}

// ---------------- Extended unit tables (spec section 16) ----------------
// Additive extensions of units.js's existing tables — does not modify the
// original exported objects, just builds richer ones locally for flow work.

export const EXTENDED_MASS_FLOW_TO_KGH = {
  ...units.MASS_FLOW_TO_KGH,
  't/day': 1000 / 24,
  'lb/s': 0.45359237 * 3600,
  'lb/min': 0.45359237 * 60,
};

export const EXTENDED_VOL_FLOW_TO_M3H = {
  ...units.VOL_FLOW_TO_M3H,
  'L/h': 0.001,
  'Imperial gpm': 0.272765,
  'ft3/min': 1.699011,
};

export function convertMassFlow(value, from, to) {
  if (!(from in EXTENDED_MASS_FLOW_TO_KGH) || !(to in EXTENDED_MASS_FLOW_TO_KGH)) throw new Error(`Unsupported mass flow unit: ${from} or ${to}`);
  return (value * EXTENDED_MASS_FLOW_TO_KGH[from]) / EXTENDED_MASS_FLOW_TO_KGH[to];
}
export function convertVolFlow(value, from, to) {
  if (!(from in EXTENDED_VOL_FLOW_TO_M3H) || !(to in EXTENDED_VOL_FLOW_TO_M3H)) throw new Error(`Unsupported volumetric flow unit: ${from} or ${to}`);
  return (value * EXTENDED_VOL_FLOW_TO_M3H[from]) / EXTENDED_VOL_FLOW_TO_M3H[to];
}

/** Actual / Normal / Standard flow — explicitly distinct reference
 * conditions (spec section 17: never treat Nm³/h and Sm³/h as identical).
 * Normal conditions conventionally 0°C/101.325kPa; Standard conditions are
 * commonly 15°C or 25°C/101.325kPa depending on industry convention — both
 * reference temperatures must be stated, not assumed. Implemented directly
 * from the ideal gas law (V×P/T = constant) rather than composing with
 * units.js's actualToNormalFlow, which hardcodes a 0°C reference and would
 * double-apply a temperature correction if chained with a different
 * reference temperature here.
 */
export function actualToReferenceFlow(actualM3h, actualTempC, actualPressureKPa, refTempC, refPressureKPa = 101.325) {
  const Tactual = actualTempC + 273.15;
  const Tref = refTempC + 273.15;
  if (Tactual <= 0 || Tref <= 0) throw new Error('Temperatures must be above absolute zero');
  if (actualPressureKPa <= 0 || refPressureKPa <= 0) throw new Error('Pressures must be > 0');
  return actualM3h * (actualPressureKPa / refPressureKPa) * (Tref / Tactual);
}
export function referenceToActualFlow(refM3h, actualTempC, actualPressureKPa, refTempC, refPressureKPa = 101.325) {
  const Tactual = actualTempC + 273.15;
  const Tref = refTempC + 273.15;
  if (Tactual <= 0 || Tref <= 0) throw new Error('Temperatures must be above absolute zero');
  if (actualPressureKPa <= 0 || refPressureKPa <= 0) throw new Error('Pressures must be > 0');
  return refM3h * (refPressureKPa / actualPressureKPa) * (Tactual / Tref);
}
