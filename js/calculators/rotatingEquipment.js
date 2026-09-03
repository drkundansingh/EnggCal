// rotatingEquipment.js — pump, fan and bearing calculations for real
// plant rotating machinery work.

// ============================================================
// 1. CENTRIFUGAL PUMP: NPSH AVAILABLE & AFFINITY LAWS
// ============================================================

/**
 * NPSH available at the pump suction, in meters of head.
 * NPSHa = (source pressure - vapor pressure) / (rho*g) + static head - friction loss
 * Static head is POSITIVE for flooded suction (source above pump
 * centerline), NEGATIVE for suction lift (source below pump centerline).
 */
export function npshAvailable({
  sourcePressureBarA, vaporPressureBarA, specificGravity,
  staticHeadM, frictionLossM,
}) {
  if (!(sourcePressureBarA > 0)) throw new Error('Source pressure must be greater than zero (absolute).');
  if (!(vaporPressureBarA >= 0)) throw new Error('Vapor pressure cannot be negative.');
  if (!(specificGravity > 0)) throw new Error('Specific gravity must be greater than zero.');
  if (!(frictionLossM >= 0)) throw new Error('Friction loss cannot be negative.');
  if (sourcePressureBarA <= vaporPressureBarA) {
    throw new Error('Source pressure must exceed vapor pressure, or the fluid is already boiling at the source.');
  }
  // 1 bar = 10.197 m of head for water (SG=1); scales inversely with SG.
  const pressureHeadM = ((sourcePressureBarA - vaporPressureBarA) * 10.197) / specificGravity;
  const npshaM = pressureHeadM + staticHeadM - frictionLossM;
  return {
    pressureHeadM, npshaM,
    note: npshaM <= 0 ? 'NPSH available is zero or negative \u2014 the pump cannot run without cavitating under these conditions.' : undefined,
  };
}

/** Compares NPSH available against NPSH required (from the pump curve) with margin. */
export function npshMarginCheck(npshAvailableM, npshRequiredM, marginM = 0.6) {
  if (!(npshAvailableM > -1e9)) throw new Error('NPSH available must be a number.');
  if (!(npshRequiredM > 0)) throw new Error('NPSH required (from the pump curve) must be greater than zero.');
  if (!(marginM >= 0)) throw new Error('Margin cannot be negative.');
  const marginActualM = npshAvailableM - npshRequiredM;
  return {
    marginActualM,
    adequate: marginActualM >= marginM,
    note: marginActualM < 0
      ? 'NPSHa is BELOW NPSHr \u2014 the pump will cavitate. Increase source elevation/pressure, reduce suction friction loss, or select a pump with lower NPSHr.'
      : marginActualM < marginM
        ? `Margin is only ${marginActualM.toFixed(2)} m, below the commonly used ${marginM} m minimum \u2014 acceptable in some services but worth reviewing against the specific pump vendor's recommendation.`
        : 'Margin meets the commonly used minimum. Hydraulic institute guidance for critical services may call for a larger margin \u2014 check vendor and site standards.',
  };
}

/**
 * Pump affinity laws for a fixed impeller diameter, speed change only:
 *   Q2/Q1 = N2/N1        H2/H1 = (N2/N1)^2        P2/P1 = (N2/N1)^3
 */
export function pumpAffinityLaws({ flowM3H, headM, powerKw, speedRpm1, speedRpm2 }) {
  if (!(flowM3H > 0)) throw new Error('Flow rate must be greater than zero.');
  if (!(headM > 0)) throw new Error('Head must be greater than zero.');
  if (!(speedRpm1 > 0)) throw new Error('Original speed must be greater than zero.');
  if (!(speedRpm2 > 0)) throw new Error('New speed must be greater than zero.');
  const ratio = speedRpm2 / speedRpm1;
  return {
    ratio,
    flowM3H2: flowM3H * ratio,
    headM2: headM * ratio * ratio,
    powerKw2: powerKw > 0 ? powerKw * ratio * ratio * ratio : null,
    note: 'Valid for a FIXED impeller diameter with speed as the only change (e.g. VFD speed adjustment) \u2014 a different relationship applies for impeller trimming at constant speed.',
  };
}

// ============================================================
// 2. FAN / BLOWER: AFFINITY LAWS & SHAFT POWER
// ============================================================

/** Same structural form as the pump affinity laws, for fan speed change at constant air density. */
export function fanAffinityLaws({ flowM3S, pressurePa, powerKw, speedRpm1, speedRpm2 }) {
  if (!(flowM3S > 0)) throw new Error('Flow rate must be greater than zero.');
  if (!(pressurePa > 0)) throw new Error('Pressure must be greater than zero.');
  if (!(speedRpm1 > 0)) throw new Error('Original speed must be greater than zero.');
  if (!(speedRpm2 > 0)) throw new Error('New speed must be greater than zero.');
  const ratio = speedRpm2 / speedRpm1;
  return {
    ratio,
    flowM3S2: flowM3S * ratio,
    pressurePa2: pressurePa * ratio * ratio,
    powerKw2: powerKw > 0 ? powerKw * ratio * ratio * ratio : null,
    note: 'Valid at constant air density \u2014 a significant temperature or altitude change between the two conditions invalidates this simple ratio.',
  };
}

/** Fan shaft (brake) power from flow, total pressure rise, and efficiency. */
export function fanShaftPower({ flowM3S, pressureRisePa, totalEfficiencyPct }) {
  if (!(flowM3S > 0)) throw new Error('Flow rate must be greater than zero.');
  if (!(pressureRisePa > 0)) throw new Error('Pressure rise must be greater than zero.');
  if (!(totalEfficiencyPct > 0 && totalEfficiencyPct <= 100)) throw new Error('Efficiency must be between 0 and 100%.');
  const aeroPowerKw = (flowM3S * pressureRisePa) / 1000;
  const shaftPowerKw = aeroPowerKw / (totalEfficiencyPct / 100);
  return { aeroPowerKw, shaftPowerKw };
}

// ============================================================
// 3. ROLLING ELEMENT BEARING L10 LIFE (ISO 281)
// ============================================================
//
//   L10 (millions of revolutions) = (C/P)^p
//   p = 3 for ball bearings, 10/3 for roller bearings
//   L10h (hours) = L10 * 1e6 / (60 * N)

export function bearingL10Life({ dynamicLoadRatingKn, equivalentLoadKn, bearingType = 'ball', speedRpm }) {
  if (!(dynamicLoadRatingKn > 0)) throw new Error('Dynamic load rating C must be greater than zero.');
  if (!(equivalentLoadKn > 0)) throw new Error('Equivalent dynamic load P must be greater than zero.');
  if (!(speedRpm > 0)) throw new Error('Rotational speed must be greater than zero.');
  if (!['ball', 'roller'].includes(bearingType)) throw new Error("Bearing type must be 'ball' or 'roller'.");
  const p = bearingType === 'ball' ? 3 : 10 / 3;
  const l10MillionRev = Math.pow(dynamicLoadRatingKn / equivalentLoadKn, p);
  const l10Hours = (l10MillionRev * 1e6) / (60 * speedRpm);
  return {
    exponentP: p, l10MillionRev, l10Hours,
    l10Years8760h: l10Hours / 8760,
    note: 'L10 is the life 90% of an identical population of bearings will exceed under this load \u2014 a statistical rating, not a guaranteed individual bearing life. Contamination, lubrication and misalignment can reduce actual life well below L10.',
  };
}

// ============================================================
// 4. PUMP HYDRAULIC / BRAKE / MOTOR POWER (ABSOLUTE, NOT SCALED)
// ============================================================
//
// The affinity laws above only SCALE a power value you already have from
// one speed to another. This calculates absolute power from first
// principles for a new duty point -- the calculation actually needed to
// size a motor for a pump that doesn't have a prior operating point to
// scale from.
//
//   Hydraulic power (W) = rho * g * Q * H
//   Brake power = hydraulic power / pump efficiency
//   Motor input power = brake power / motor efficiency

const G_GRAVITY = 9.80665; // m/s^2

export function pumpPower({ flowM3H, headM, specificGravity, pumpEfficiencyPct, motorEfficiencyPct }) {
  if (!(flowM3H > 0)) throw new Error('Flow rate must be greater than zero.');
  if (!(headM > 0)) throw new Error('Head must be greater than zero.');
  if (!(specificGravity > 0)) throw new Error('Specific gravity must be greater than zero.');
  if (!(pumpEfficiencyPct > 0 && pumpEfficiencyPct <= 100)) throw new Error('Pump efficiency must be between 0 and 100%.');
  const densityKgM3 = specificGravity * 1000;
  const flowM3S = flowM3H / 3600;
  const hydraulicPowerW = densityKgM3 * G_GRAVITY * flowM3S * headM;
  const brakePowerKw = (hydraulicPowerW / 1000) / (pumpEfficiencyPct / 100);
  let motorInputKw = null;
  if (motorEfficiencyPct !== undefined && motorEfficiencyPct !== null && motorEfficiencyPct !== '') {
    if (!(motorEfficiencyPct > 0 && motorEfficiencyPct <= 100)) throw new Error('Motor efficiency must be between 0 and 100%.');
    motorInputKw = brakePowerKw / (motorEfficiencyPct / 100);
  }
  return {
    hydraulicPowerKw: hydraulicPowerW / 1000,
    brakePowerKw,
    motorInputKw,
    note: 'Add a service factor / sizing margin per site practice before selecting an actual motor rating \u2014 this is the calculated duty point, not a motor nameplate recommendation.',
  };
}
