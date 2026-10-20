/**
 * Power-plant flow calculations other than DP metering.
 * All thermodynamic properties come from the IAPWS-IF97 implementation in steamTable.js
 * (Regions 1, 2 and 4; Region 3 is refused there with an explicit error).
 *
 * Units: pressure bar absolute, temperature °C, enthalpy kJ/kg, flow kg/s unless stated.
 */
import * as ST from './steamTable.js';

const R_UNIV = 8.314462618; // J/(mol·K), CODATA 2018

/* ------------------------------------------------------------------ */
/* 1. Turbine stage-group flow – Stodola ellipse law                  */
/* ------------------------------------------------------------------ */

/**
 * Stodola: ṁ = K·√( (p1² − p2²) / (p1·v1) ).
 * K is fixed from one reference (design / heat-balance / test) operating point.
 */
export function stodolaConstant({ p1Bar, p2Bar, t1C, flowKgS }) {
  chkStage({ p1Bar, p2Bar });
  const v1 = ST.specificVolume(p1Bar, t1C);
  return flowKgS / Math.sqrt((p1Bar * p1Bar - p2Bar * p2Bar) / (p1Bar * v1));
}

export function stodolaFlow({ ref, p1Bar, p2Bar, t1C, stages }) {
  chkStage({ p1Bar, p2Bar });
  const K = stodolaConstant(ref);
  const v1 = ST.specificVolume(p1Bar, t1C);
  const flow = K * Math.sqrt((p1Bar * p1Bar - p2Bar * p2Bar) / (p1Bar * v1));
  const critical = p2Bar / p1Bar;
  return {
    flowKgS: flow, K, v1M3Kg: v1, pressureRatio: critical,
    flowRatioToRef: flow / ref.flowKgS,
    warnings: (stages !== undefined && stages < 4 && critical < 0.55)
      ? ['A group of fewer than 4 stages at p2/p1 < 0.55 may be at or near choked flow, where the ellipse law no longer holds — treat the result with caution.'] : [],
  };
}

/** Inlet pressure that passes a target flow with downstream pressure and inlet temperature given (bisection). */
export function stodolaInletPressure({ ref, flowKgS, p2Bar, t1C }) {
  const flowAt = (p) => stodolaFlow({ ref, p1Bar: p, p2Bar, t1C }).flowKgS;
  let lo = p2Bar * 1.0001, hi = null;
  for (let p = p2Bar * 1.01; p <= 1000; p *= 1.25) {
    let fl;
    try { fl = flowAt(p); } catch (e) { break; } // left the IF97 range implemented here
    if (fl >= flowKgS) { hi = p; break; }
    lo = p;
  }
  if (hi === null) throw new Error('The target flow cannot be reached with an inlet pressure inside the IAPWS-IF97 range implemented here (Regions 1/2, up to the Region 3 boundary at this temperature).');
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (flowAt(mid) > flowKgS) hi = mid; else lo = mid;
    if (hi - lo < 1e-12 * hi) break;
  }
  return 0.5 * (lo + hi);
}

function chkStage({ p1Bar, p2Bar }) {
  if (!(p1Bar > 0 && p2Bar >= 0 && p1Bar > p2Bar)) throw new Error('Inlet pressure must be greater than outlet pressure (both absolute, bar).');
}

/* ------------------------------------------------------------------ */
/* 2. Heat-balance flows                                              */
/* ------------------------------------------------------------------ */

/** Specific enthalpy of a steam/wet-steam stream (kJ/kg). Pass x for saturated mixtures. */
export function steamEnthalpy(pBar, tC, x) {
  if (x !== undefined && x !== null && x !== '') return ST.wetSteamEnthalpy(pBar, x);
  return ST.enthalpy(pBar, tC);
}

/**
 * Closed feedwater heater, extraction steam flow.
 * Energy balance on the shell: ṁext(h_ext − h_drain) + ṁcascade(h_casc − h_drain) = ṁfw(h_fw,out − h_fw,in)/η
 * η = fraction of the heat released that reaches the feedwater (radiation loss, ~0.99–1.0).
 */
export function heaterExtractionFlow(a) {
  const fwOut = ST.liquidEnthalpy(a.fwPressureBar, a.fwOutC);
  const fwIn = ST.liquidEnthalpy(a.fwPressureBar, a.fwInC);
  if (!(a.fwOutC > a.fwInC)) throw new Error('Feedwater outlet temperature must be above the inlet temperature.');
  const hExt = steamEnthalpy(a.extPressureBar, a.extTempC, a.extX);
  const hDrain = ST.liquidEnthalpy(a.shellPressureBar ?? a.extPressureBar, a.drainC);
  const eta = a.efficiency ?? 1;
  const cascade = a.cascadeFlowKgS || 0;
  const hCasc = cascade > 0 ? ST.liquidEnthalpy(a.cascadePressureBar, a.cascadeC) : 0;
  const duty = a.fwFlowKgS * (fwOut - fwIn) / eta;
  const hExtDrop = hExt - hDrain;
  if (!(hExtDrop > 0)) throw new Error('Extraction steam enthalpy is not above the drain enthalpy — check the states.');
  const ext = (duty - cascade * (hCasc - hDrain)) / hExtDrop;
  if (!(ext > 0)) throw new Error('The cascaded drain alone already supplies more than the required duty — no extraction steam is needed (check inputs).');
  const tsat = ST.saturation(a.extPressureBar).tsatC;
  return {
    extractionFlowKgS: ext, dutyKW: duty, hFwOut: fwOut, hFwIn: fwIn, hExt, hDrain,
    drainFlowKgS: ext + cascade, ttdC: tsat - a.fwOutC, dcaC: a.drainC - a.fwInC, satTempC: tsat,
    extractionPctOfFw: 100 * ext / a.fwFlowKgS,
  };
}

/** Same balance solved the other way: feedwater flow from a measured extraction flow. */
export function heaterFeedwaterFlow(a) {
  if (!(a.fwOutC > a.fwInC)) throw new Error('Feedwater outlet temperature must be above the inlet temperature.');
  const fwOut = ST.liquidEnthalpy(a.fwPressureBar, a.fwOutC);
  const fwIn = ST.liquidEnthalpy(a.fwPressureBar, a.fwInC);
  const hExt = steamEnthalpy(a.extPressureBar, a.extTempC, a.extX);
  const hDrain = ST.liquidEnthalpy(a.shellPressureBar ?? a.extPressureBar, a.drainC);
  const eta = a.efficiency ?? 1;
  const cascade = a.cascadeFlowKgS || 0;
  const hCasc = cascade > 0 ? ST.liquidEnthalpy(a.cascadePressureBar, a.cascadeC) : 0;
  const heatIn = a.extractionFlowKgS * (hExt - hDrain) + cascade * (hCasc - hDrain);
  const fw = heatIn * eta / (fwOut - fwIn);
  const tsat = ST.saturation(a.extPressureBar).tsatC;
  return {
    feedwaterFlowKgS: fw, dutyKW: heatIn, hFwOut: fwOut, hFwIn: fwIn, hExt, hDrain,
    ttdC: tsat - a.fwOutC, dcaC: a.drainC - a.fwInC, satTempC: tsat,
  };
}

/**
 * Desuperheater spray water.
 * ṁsteam·h_in + ṁspray·h_spray = (ṁsteam + ṁspray)·h_out
 */
export function desuperheaterSpray(a) {
  const hIn = ST.enthalpy(a.inPressureBar, a.inTempC);
  const outP = a.outPressureBar ?? a.inPressureBar;
  const hOut = ST.enthalpy(outP, a.outTempC);
  const hSp = ST.liquidEnthalpy(a.sprayPressureBar ?? outP, a.sprayTempC);
  if (!(hIn > hOut)) throw new Error('Outlet temperature must be lower than the inlet (enthalpy must fall).');
  if (!(hOut > hSp)) throw new Error('Spray water enthalpy must be below the outlet steam enthalpy.');
  const spray = a.steamFlowKgS * (hIn - hOut) / (hOut - hSp);
  const tsat = ST.saturation(outP).tsatC;
  const margin = a.outTempC - tsat;
  const warnings = [];
  if (margin < 0) warnings.push('Outlet temperature is below saturation — the stream would be wet steam; this superheated-steam balance does not apply.');
  else if (margin < 15) warnings.push(`Outlet superheat is only ${margin.toFixed(1)} °C. Operators typically keep roughly 10–15 °C or more above saturation to ensure the spray is fully evaporated (typical practice — confirm against the desuperheater maker's minimum).`);
  return { sprayFlowKgS: spray, outletFlowKgS: a.steamFlowKgS + spray, hIn, hOut, hSpray: hSp, outletSuperheatC: margin, satTempC: tsat, warnings };
}

/**
 * Condenser cooling-water flow from the steam-side heat load.
 * Q = ṁsteam·(h_exhaust − h_condensate);  ṁcw = Q / (h_cw,out − h_cw,in) with IF97 liquid enthalpies.
 */
export function condenserCoolingWater(a) {
  const hEx = a.exhaustX !== undefined && a.exhaustX !== null && a.exhaustX !== ''
    ? ST.wetSteamEnthalpy(a.condPressureBar, a.exhaustX)
    : ST.enthalpy(a.condPressureBar, a.exhaustTempC);
  const sat = ST.saturation(a.condPressureBar);
  const hCond = ST.liquidEnthalpy(a.condPressureBar, a.condensateC ?? sat.tsatC);
  const q = a.steamFlowKgS * (hEx - hCond);
  const cwP = a.cwPressureBar ?? 3;
  const dh = ST.liquidEnthalpy(cwP, a.cwOutC) - ST.liquidEnthalpy(cwP, a.cwInC);
  if (!(a.cwOutC > a.cwInC)) throw new Error('Cooling-water outlet must be warmer than the inlet.');
  if (!(a.cwOutC < sat.tsatC)) throw new Error(`Cooling-water outlet must stay below the condensing temperature (${sat.tsatC.toFixed(2)} °C).`);
  const m = q / (a.heatLossFrac ? dh * (1 - a.heatLossFrac) : dh);
  const rho = ST.liquidDensity(cwP, 0.5 * (a.cwInC + a.cwOutC));
  const ttd = sat.tsatC - a.cwOutC, itd = sat.tsatC - a.cwInC, rise = a.cwOutC - a.cwInC;
  const lmtd = (ttd === itd) ? ttd : (itd - ttd) / Math.log(itd / ttd);
  return {
    cwFlowKgS: m, cwFlowM3H: m / rho * 3600, heatLoadMW: q / 1000, hExhaust: hEx, hCondensate: hCond,
    satTempC: sat.tsatC, ttdC: ttd, itdC: itd, rangeC: rise, lmtdC: lmtd,
    ntuLike: rise / lmtd, cwDensity: rho, waterToSteamRatio: m / a.steamFlowKgS,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Tracer dilution                                                  */
/* ------------------------------------------------------------------ */

/**
 * Constant-rate injection: Q = q·(C1 − C2)/(C2 − C0)
 * q injection flow, C1 injected concentration, C2 downstream plateau, C0 background.
 * Standard uncertainties are relative (%), combined by first-order GUM propagation.
 */
export function tracerConstantRate({ q, c1, c2, c0 = 0, uQ = 0, uC1 = 0, uC2 = 0, uC0 = 0 }) {
  if (!(c2 > c0)) throw new Error('Downstream concentration must exceed the background concentration.');
  if (!(c1 > c2)) throw new Error('Injected concentration must exceed the downstream concentration.');
  const Q = q * (c1 - c2) / (c2 - c0);
  // absolute sensitivities
  const dq = (uQ / 100) * q, d1 = (uC1 / 100) * c1, d2 = (uC2 / 100) * c2, d0 = (uC0 / 100) * Math.max(c0, 0);
  const sq = (c1 - c2) / (c2 - c0), s1 = q / (c2 - c0);
  const s2 = q * (-(c2 - c0) - (c1 - c2)) / Math.pow(c2 - c0, 2);
  const s0 = q * (c1 - c2) / Math.pow(c2 - c0, 2);
  const u = Math.sqrt((sq * dq) ** 2 + (s1 * d1) ** 2 + (s2 * d2) ** 2 + (s0 * d0) ** 2);
  return { flow: Q, dilutionRatio: (c1 - c2) / (c2 - c0), uAbs: u, uPct: 100 * u / Q, warnings: c2 - c0 < 0.05 * c2 ? ['Plateau is within 5 % of background — background uncertainty dominates.'] : [] };
}

/** Slug (gulp) injection: Q = M / ∫(C − C0) dt, trapezoid rule. times in s, conc in mass/vol (consistent with M). */
export function tracerSlug({ massInjected, times, conc, c0 = 0 }) {
  if (!Array.isArray(times) || times.length !== conc.length || times.length < 3) throw new Error('Provide at least three (time, concentration) pairs.');
  for (let i = 1; i < times.length; i++) if (!(times[i] > times[i - 1])) throw new Error('Times must be strictly increasing.');
  let area = 0;
  for (let i = 1; i < times.length; i++) area += 0.5 * ((conc[i] - c0) + (conc[i - 1] - c0)) * (times[i] - times[i - 1]);
  if (!(area > 0)) throw new Error('Area under the response curve must be positive.');
  const warnings = [];
  const peak = Math.max(...conc) - c0;
  if ((conc[conc.length - 1] - c0) > 0.02 * peak) warnings.push('Last sample is still above 2 % of the peak — the tail is truncated, so flow will read high. Extend the record.');
  return { flow: massInjected / area, area, peak, warnings };
}

/* ------------------------------------------------------------------ */
/* 4. Pitot-tube duct traverse (EPA Method 1 / 2 / 3)                  */
/* ------------------------------------------------------------------ */

const M_CO2 = 44.009, M_O2 = 31.998, M_N2 = 28.013, M_CO = 28.010, M_H2O = 18.015;

/** Equal-area traverse positions along one diameter, as distance from the wall in % of the diameter. */
export function circularTraversePoints(pointsPerDiameter) {
  const N = pointsPerDiameter;
  if (!(N >= 4 && N % 2 === 0)) throw new Error('Points per diameter must be an even number ≥ 4.');
  const half = [];
  for (let i = 1; i <= N / 2; i++) half.push(50 * (1 - Math.sqrt((2 * i - 1) / N)));
  return [...half, ...half.map((x) => 100 - x)].sort((a, b) => a - b);
}

/** Dry molecular weight from Orsat dry volume percentages (CO2, O2, CO); balance taken as N2. */
export function dryMolecularWeight({ co2, o2, co = 0 }) {
  const n2 = 100 - co2 - o2 - co;
  if (n2 < 0) throw new Error('CO2 + O2 + CO cannot exceed 100 %.');
  return (co2 * M_CO2 + o2 * M_O2 + co * M_CO + n2 * M_N2) / 100;
}

/**
 * Duct flow from pitot readings. dpPa: velocity-head readings (Pa) at each point.
 * v_i = Cp·√(2·Δp_i/ρ); mean velocity is the arithmetic mean of the point velocities (not √(mean Δp)).
 */
export function pitotTraverse(a) {
  const dps = a.dpPa;
  if (!Array.isArray(dps) || dps.length < 4) throw new Error('Enter at least four velocity-head readings.');
  if (dps.some((x) => !(x >= 0))) throw new Error('Velocity-head readings cannot be negative.');
  const Md = a.dryMW ?? dryMolecularWeight({ co2: a.co2, o2: a.o2, co: a.co });
  const bws = (a.moisturePct || 0) / 100;
  if (!(bws >= 0 && bws < 0.5)) throw new Error('Moisture must be between 0 and 50 %.');
  const Ms = Md * (1 - bws) + M_H2O * bws;
  const Pabs = a.baroPa + a.staticPa;
  const Tk = a.tempC + 273.15;
  const rho = Pabs * Ms * 1e-3 / (R_UNIV * Tk);
  const cp = a.cp ?? 0.84;
  const v = dps.map((d) => cp * Math.sqrt(2 * d / rho));
  const vMean = v.reduce((s, x) => s + x, 0) / v.length;
  const area = a.areaM2;
  const Qact = vMean * area;
  const stdT = (a.stdTempC ?? 20) + 273.15, stdP = a.stdPressurePa ?? 101325;
  const Qstd = Qact * (1 - bws) * (stdT / Tk) * (Pabs / stdP);
  const Qnorm = Qact * (1 - bws) * (273.15 / Tk) * (Pabs / 101325);
  // EPA constant-form cross-check (Method 2 Eq. 2-7), Kp = 34.97 m/s·√[(g/g-mol)(mmHg)/((K)(mmH2O))]
  const mmH2O = dps.map((d) => d / 9.80665), pmm = Pabs / 133.322387415;
  const avgSqrt = mmH2O.reduce((s, d) => s + Math.sqrt(d), 0) / mmH2O.length;
  const vEpa = 34.97 * cp * avgSqrt * Math.sqrt(Tk / (pmm * Ms));
  const warnings = [];
  const vmax = Math.max(...v), vmin = Math.min(...v);
  if (vmin / vmax < 0.1) warnings.push('Some points read less than 10 % of the maximum — profile is strongly distorted; check the traverse location.');
  if (rho > 0 && vMean < 3) warnings.push('Mean velocity is below ≈3 m/s: a standard pitot is unreliable at very low velocity-head (EPA Method 2 warns below ≈ 0.3 mm H₂O).');
  return { Md, Ms, rho, pointVelocities: v, meanVelocity: vMean, qActualM3S: Qact, qStdDryM3S: Qstd, qNormDryM3S: Qnorm, massFlowKgS: rho * Qact, vEpaCrossCheck: vEpa, warnings };
}

/* ------------------------------------------------------------------ */
/* 5. Ultrasonic transit-time                                          */
/* ------------------------------------------------------------------ */

/**
 * Path velocity v = L/(2·cosφ) · (t_up − t_down)/(t_up·t_down); sound speed c = (L/2)(1/t_down + 1/t_up).
 * Q = k·v·A, k = hydraulic (profile) correction between path velocity and area-mean velocity.
 */
export function ultrasonicFlow({ pathLengthM, angleDeg, tUpS, tDownS, innerDiameterM, k = 1, waterPressureBar, waterTempC }) {
  if (!(tUpS > tDownS)) throw new Error('Upstream transit time must be longer than downstream transit time.');
  const phi = angleDeg * Math.PI / 180;
  const v = pathLengthM / (2 * Math.cos(phi)) * (tUpS - tDownS) / (tUpS * tDownS);
  const c = 0.5 * pathLengthM * (1 / tDownS + 1 / tUpS);
  const A = Math.PI * innerDiameterM * innerDiameterM / 4;
  const out = { pathVelocity: v, soundSpeed: c, areaM2: A, flowM3S: k * v * A, meanVelocity: k * v, warnings: [] };
  if (waterPressureBar && waterTempC !== undefined && waterTempC !== null) {
    const w = ST.speedOfSound(waterPressureBar, waterTempC);
    out.expectedSoundSpeed = w; out.soundSpeedDeviationPct = 100 * (c - w) / w;
    if (Math.abs(out.soundSpeedDeviationPct) > 1) out.warnings.push('Measured sound speed differs from the IF97 value by more than 1 % — check temperature, path length or transit-time offsets (cable/electronics delay).');
  }
  if (k === 1) out.warnings.push('k = 1.00: the path velocity is not corrected for the velocity profile. For a single-path meter use the maker\'s Reynolds-dependent factor (typically ≈0.90–0.96 for turbulent flow).');
  return out;
}
