// piping.js — process piping calculations for real plant/industrial use.
//
// Three genuinely everyday calculations that were missing from this app
// entirely: how much pressure a line of pipe actually drops, how thick the
// pipe wall needs to be to hold a given pressure, and how big a relief
// valve orifice needs to be. All three come up constantly in real plant
// engineering and none of them were covered by the instrumentation or
// electrical modules already in this app.

// ============================================================
// 1. PIPE PRESSURE DROP (Darcy-Weisbach)
// ============================================================
//
// dP = f * (L/D) * (rho * v^2) / 2
// Friction factor f from the Colebrook-White equation, solved via the
// Swamee-Jain explicit approximation (avoids an iterative solve, and is
// accurate to within ~1% of Colebrook-White across the turbulent range
// it's valid for).

/** Reynolds number for flow in a circular pipe. */
export function reynoldsNumber(velocityMs, diameterM, densityKgM3, viscosityPaS) {
  if (!(velocityMs >= 0)) throw new Error('Velocity cannot be negative.');
  if (!(diameterM > 0)) throw new Error('Diameter must be greater than zero.');
  if (!(densityKgM3 > 0)) throw new Error('Density must be greater than zero.');
  if (!(viscosityPaS > 0)) throw new Error('Viscosity must be greater than zero.');
  return (densityKgM3 * velocityMs * diameterM) / viscosityPaS;
}

/**
 * Darcy friction factor via the Swamee-Jain explicit approximation to
 * Colebrook-White. Valid for turbulent flow, Re 5000-1e8 and relative
 * roughness 1e-6 to 5e-2 -- the range essentially all plant piping falls
 * in. For laminar flow (Re < 2300) uses the exact f = 64/Re instead.
 */
export function frictionFactor(reynolds, roughnessM, diameterM) {
  if (!(reynolds > 0)) throw new Error('Reynolds number must be greater than zero.');
  if (!(roughnessM >= 0)) throw new Error('Roughness cannot be negative.');
  if (!(diameterM > 0)) throw new Error('Diameter must be greater than zero.');
  if (reynolds < 2300) return 64 / reynolds;
  const relRough = roughnessM / diameterM;
  const term = relRough / 3.7 + 5.74 / Math.pow(reynolds, 0.9);
  return 0.25 / Math.pow(Math.log10(term), 2);
}

/**
 * Full pressure drop calculation for a straight run of pipe.
 * @param {object} o
 * @param {number} o.flowM3S - volumetric flow rate, m³/s
 * @param {number} o.diameterM - pipe internal diameter, m
 * @param {number} o.lengthM - pipe length, m
 * @param {number} o.densityKgM3 - fluid density, kg/m³
 * @param {number} o.viscosityPaS - dynamic viscosity, Pa·s
 * @param {number} [o.roughnessM=0.000045] - absolute roughness, m (default: commercial steel)
 * @param {number} [o.fittingsK=0] - sum of K (resistance coefficient) for fittings/valves in the run
 */
export function pipePressureDrop({
  flowM3S, diameterM, lengthM, densityKgM3, viscosityPaS,
  roughnessM = 0.000045, fittingsK = 0,
}) {
  if (!(flowM3S > 0)) throw new Error('Flow rate must be greater than zero.');
  if (!(diameterM > 0)) throw new Error('Pipe diameter must be greater than zero.');
  if (!(lengthM > 0)) throw new Error('Pipe length must be greater than zero.');
  if (!(densityKgM3 > 0)) throw new Error('Density must be greater than zero.');
  if (!(viscosityPaS > 0)) throw new Error('Viscosity must be greater than zero.');
  if (!(fittingsK >= 0)) throw new Error('Fittings K cannot be negative.');

  const area = (Math.PI / 4) * diameterM * diameterM;
  const velocity = flowM3S / area;
  const re = reynoldsNumber(velocity, diameterM, densityKgM3, viscosityPaS);
  const f = frictionFactor(re, roughnessM, diameterM);
  const dynamicPressure = 0.5 * densityKgM3 * velocity * velocity;
  const frictionDropPa = f * (lengthM / diameterM) * dynamicPressure;
  const fittingsDropPa = fittingsK * dynamicPressure;
  const totalDropPa = frictionDropPa + fittingsDropPa;

  return {
    velocityMs: velocity,
    reynolds: re,
    flowRegime: re < 2300 ? 'laminar' : re < 4000 ? 'transitional' : 'turbulent',
    frictionFactor: f,
    frictionDropPa, fittingsDropPa, totalDropPa,
    totalDropBar: totalDropPa / 1e5,
    totalDropPer100m: (frictionDropPa / lengthM) * 100,
    note: velocity > 6
      ? `Velocity ${velocity.toFixed(1)} m/s is above the ~6 m/s guideline commonly used for liquid lines \u2014 check for erosion/noise risk and consider a larger line size.`
      : 'Velocity is within typical guideline range for liquid piping.',
  };
}

// ============================================================
// 2. PIPE WALL THICKNESS (ASME B31.3, Para. 304.1.2)
// ============================================================
//
//   t = P*D / (2*(S*E*W + P*Y))
//   T = (t + c) / (1 - mill tolerance)
//
// Y = 0.4 for ferritic/austenitic steel below the creep range (< 482 degC
// / 900 degF) -- the case that covers most ordinary process piping. Above
// that, Y increases with temperature per B31.3 Table 304.1.1, which this
// does not embed (few plants operate carbon steel piping in the creep
// range without an existing engineering basis to draw Y from directly).
// Valid only while t < D/6 and P/(S*E) <= 0.385, per the code itself --
// outside that range B31.3 requires a different (thick-wall) procedure.

export function pipeWallThickness({
  designPressureMPa, outsideDiameterMm, allowableStressMPa,
  jointEfficiencyE = 1.0, weldFactorW = 1.0, yCoefficient = 0.4,
  corrosionAllowanceMm = 0, millTolerancePct = 12.5,
}) {
  if (!(designPressureMPa > 0)) throw new Error('Design pressure must be greater than zero.');
  if (!(outsideDiameterMm > 0)) throw new Error('Outside diameter must be greater than zero.');
  if (!(allowableStressMPa > 0)) throw new Error('Allowable stress must be greater than zero.');
  if (!(jointEfficiencyE > 0 && jointEfficiencyE <= 1)) throw new Error('Joint efficiency E must be between 0 and 1.');
  if (!(weldFactorW > 0 && weldFactorW <= 1)) throw new Error('Weld strength reduction factor W must be between 0 and 1.');
  if (!(corrosionAllowanceMm >= 0)) throw new Error('Corrosion allowance cannot be negative.');
  if (!(millTolerancePct > 0 && millTolerancePct < 100)) throw new Error('Mill tolerance must be between 0 and 100%.');

  const pOverSE = designPressureMPa / (allowableStressMPa * jointEfficiencyE);
  const thinWallValid = pOverSE <= 0.385;

  const t = (designPressureMPa * outsideDiameterMm) /
    (2 * (allowableStressMPa * jointEfficiencyE * weldFactorW + designPressureMPa * yCoefficient));
  const tMin = t + corrosionAllowanceMm;
  const nominalThickness = tMin / (1 - millTolerancePct / 100);
  const dOverT = outsideDiameterMm / t;

  return {
    pressureDesignThicknessMm: t,
    minRequiredThicknessMm: tMin,
    nominalThicknessMm: nominalThickness,
    dOverT,
    thinWallValid,
    note: !thinWallValid
      ? `P/(S\u00b7E) = ${pOverSE.toFixed(3)} exceeds the 0.385 limit where this simplified thin-wall equation applies \u2014 ASME B31.3 requires the thick-wall procedure (Para. 304.1.2(3)) for this case, not this formula.`
      : `Y = ${yCoefficient} applies below the creep range (< 482\u00b0C / 900\u00b0F for ferritic steel). Select the next standard schedule/thickness AT OR ABOVE the nominal thickness shown \u2014 never round down.`,
  };
}

// ============================================================
// 3. RELIEF VALVE (PSV) SIZING \u2014 API 520 PART I (PRELIMINARY)
// ============================================================
//
// PRELIMINARY SCREENING ONLY. This implements the core gas/vapor and
// liquid orifice-area equations from API 520 Part I -- it does NOT
// implement the full current-edition procedure: no fire-case heat input
// (API 521), no two-phase/flashing (Annex C omega method), no iterative
// viscosity correction, and the backpressure/combination correction
// factors (Kb, Kw, Kc, Kv) default to 1.0 rather than being read from the
// actual API 520 correction curves for your specific valve and
// installation. A real PSV is sized with manufacturer-certified capacity
// data as part of a documented relief scenario study (HAZOP-driven),
// reviewed by a process safety engineer -- this estimates the order of
// magnitude for a preliminary check, nothing more.

const GAS_CONSTANT_C = {
  // C values from API 520, indexed by ratio of specific heats k. Widely
  // published table; interpolated linearly between listed points.
  1.001: 315, 1.10: 328, 1.20: 335, 1.26: 343, 1.30: 347, 1.40: 356, 1.50: 364, 1.60: 371, 1.80: 384, 2.00: 395,
};
function gasConstantC(k) {
  const keys = Object.keys(GAS_CONSTANT_C).map(Number).sort((a, b) => a - b);
  if (k <= keys[0]) return GAS_CONSTANT_C[keys[0]];
  if (k >= keys[keys.length - 1]) return GAS_CONSTANT_C[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    if (k >= keys[i] && k <= keys[i + 1]) {
      const frac = (k - keys[i]) / (keys[i + 1] - keys[i]);
      return GAS_CONSTANT_C[keys[i]] + frac * (GAS_CONSTANT_C[keys[i + 1]] - GAS_CONSTANT_C[keys[i]]);
    }
  }
  return 345; // fallback, near the middle of the table
}

/** Gas/vapor relief orifice area, API 520 Part I core equation. */
export function reliefValveGas({
  reliefRateLbHr, molecularWeight, specificHeatRatioK, temperatureF, compressibilityZ = 1.0,
  setPressurePsig, overpressurePct = 10, backpressurePsig = 0, atmosphericPsi = 14.7,
  dischargeCoeffKd = 0.975, backpressureKb = 1.0, combinationKc = 1.0,
}) {
  if (!(reliefRateLbHr > 0)) throw new Error('Relief rate must be greater than zero.');
  if (!(molecularWeight > 0)) throw new Error('Molecular weight must be greater than zero.');
  if (!(specificHeatRatioK > 1)) throw new Error('Ratio of specific heats k must be greater than 1.');
  if (!(setPressurePsig > 0)) throw new Error('Set pressure must be greater than zero.');
  if (!(overpressurePct >= 0)) throw new Error('Overpressure cannot be negative.');
  if (!(dischargeCoeffKd > 0 && dischargeCoeffKd <= 1)) throw new Error('Discharge coefficient must be between 0 and 1.');

  const relievingPressurePsig = setPressurePsig * (1 + overpressurePct / 100);
  const p1Psia = relievingPressurePsig + atmosphericPsi;
  const tRankine = temperatureF + 459.67;
  const c = gasConstantC(specificHeatRatioK);

  const requiredAreaIn2 = (reliefRateLbHr / (c * dischargeCoeffKd * p1Psia * backpressureKb * combinationKc))
    * Math.sqrt(tRankine * compressibilityZ / molecularWeight);

  return {
    relievingPressurePsig, p1Psia, tRankine, gasConstantC: c,
    requiredAreaIn2, requiredAreaMm2: requiredAreaIn2 * 645.16,
    note: 'PRELIMINARY estimate only \u2014 core API 520 Part I equation with Kb=Kc=1.0 assumed unless entered. Not a substitute for the full current-edition sizing procedure, manufacturer certified capacity data, or a documented relief scenario review.',
  };
}

/** Liquid relief orifice area, API 520 Part I core equation. */
export function reliefValveLiquid({
  flowRateGpm, specificGravity, setPressurePsig, overpressurePct = 10, backpressurePsig = 0,
  dischargeCoeffKd = 0.65, backpressureKw = 1.0, viscosityKv = 1.0, combinationKc = 1.0,
}) {
  if (!(flowRateGpm > 0)) throw new Error('Flow rate must be greater than zero.');
  if (!(specificGravity > 0)) throw new Error('Specific gravity must be greater than zero.');
  if (!(setPressurePsig > 0)) throw new Error('Set pressure must be greater than zero.');
  if (!(overpressurePct >= 0)) throw new Error('Overpressure cannot be negative.');
  if (!(dischargeCoeffKd > 0 && dischargeCoeffKd <= 1)) throw new Error('Discharge coefficient must be between 0 and 1.');

  const relievingPressurePsig = setPressurePsig * (1 + overpressurePct / 100);
  const deltaPPsi = relievingPressurePsig - backpressurePsig;
  if (!(deltaPPsi > 0)) throw new Error('Relieving pressure must exceed backpressure (\u0394P must be positive).');

  const requiredAreaIn2 = (flowRateGpm / (38 * dischargeCoeffKd * backpressureKw * viscosityKv * combinationKc))
    * Math.sqrt(specificGravity / deltaPPsi);

  return {
    relievingPressurePsig, deltaPPsi,
    requiredAreaIn2, requiredAreaMm2: requiredAreaIn2 * 645.16,
    note: 'PRELIMINARY estimate only \u2014 core API 520 Part I liquid equation with Kw=Kv=Kc=1.0 assumed unless entered (Kv in particular requires an iterative check against Reynolds number for viscous fluids). Not a substitute for the full sizing procedure or manufacturer certified data.',
  };
}
