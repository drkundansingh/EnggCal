// civilGeotech.js — geotechnical engineering calculations.
//
// Rankine earth pressure theory (1857) and the soil phase-relationship
// definitions (void ratio, porosity, degree of saturation) are exact,
// universal soil mechanics fundamentals -- not code-dependent, and not
// approximations of something more complex. Rankine theory itself DOES
// carry real assumptions, stated per function below: it assumes a
// cohesionless (or optionally cohesive) soil, a vertical wall, a
// horizontal or defined-slope backfill, and no wall friction -- a real
// retaining wall design (Coulomb theory, or a full geotechnical study)
// accounts for wall friction and other geometry Rankine theory ignores.

// ============================================================
// 1. RANKINE ACTIVE & PASSIVE EARTH PRESSURE
// ============================================================

export function rankineEarthPressure({ frictionAngleDeg, cohesionKPa = 0, depthM, unitWeightKNm3, surchargeKPa = 0 }) {
  if (!(frictionAngleDeg >= 0 && frictionAngleDeg < 90)) throw new Error('Friction angle must be between 0 and 90 degrees.');
  if (!(cohesionKPa >= 0)) throw new Error('Cohesion cannot be negative.');
  if (!(depthM >= 0)) throw new Error('Depth cannot be negative.');
  if (!(unitWeightKNm3 > 0)) throw new Error('Soil unit weight must be greater than zero.');
  if (!(surchargeKPa >= 0)) throw new Error('Surcharge cannot be negative.');

  const phi = (frictionAngleDeg * Math.PI) / 180;
  const Ka = Math.pow(Math.tan(Math.PI / 4 - phi / 2), 2);
  const Kp = Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);

  const verticalStressKPa = unitWeightKNm3 * depthM + surchargeKPa;
  // Rankine with cohesion: active pressure is REDUCED by 2c*sqrt(Ka);
  // passive pressure is INCREASED by 2c*sqrt(Kp).
  const activePressureKPa = Math.max(0, Ka * verticalStressKPa - 2 * cohesionKPa * Math.sqrt(Ka));
  const passivePressureKPa = Kp * verticalStressKPa + 2 * cohesionKPa * Math.sqrt(Kp);

  // Depth of the tension crack (where active pressure would be zero /
  // negative) for a cohesive soil -- a real, commonly checked quantity.
  const tensionCrackDepthM = cohesionKPa > 0
    ? (2 * cohesionKPa) / (unitWeightKNm3 * Math.sqrt(Ka))
    : 0;

  return {
    Ka, Kp, verticalStressKPa, activePressureKPa, passivePressureKPa, tensionCrackDepthM,
    note: 'Rankine theory: cohesionless or cohesive soil, vertical wall face, horizontal backfill, no wall friction. A real retaining wall design should also check Coulomb theory (accounts for wall friction and backfill slope) and overall stability, not pressure alone.',
  };
}

// ============================================================
// 2. SOIL PHASE RELATIONSHIPS
// ============================================================
//
// e = Vv/Vs (void ratio); n = Vv/V (porosity); S = Vw/Vv (degree of
// saturation). These three are related by n = e/(1+e) regardless of the
// soil type -- exact definitions, not empirical correlations.

export function soilPhaseRelationships({ voidRatio, porosity, degreeOfSaturationPct, waterContentPct, specificGravity = 2.65 }) {
  let e, n;
  if (voidRatio !== undefined && voidRatio !== null && voidRatio !== '') {
    if (!(voidRatio >= 0)) throw new Error('Void ratio cannot be negative.');
    e = voidRatio; n = e / (1 + e);
  } else if (porosity !== undefined && porosity !== null && porosity !== '') {
    if (!(porosity >= 0 && porosity < 1)) throw new Error('Porosity must be between 0 and 1 (as a fraction, not a percentage).');
    n = porosity; e = n / (1 - n);
  } else {
    throw new Error('Provide either void ratio or porosity.');
  }

  let bulkDensityInfo = null;
  if (degreeOfSaturationPct !== undefined && degreeOfSaturationPct !== null && degreeOfSaturationPct !== '' && specificGravity > 0) {
    const S = degreeOfSaturationPct / 100;
    if (!(S >= 0 && S <= 1)) throw new Error('Degree of saturation must be between 0 and 100%.');
    // Unit weight of water = 9.81 kN/m3.
    const gammaBulk = ((specificGravity + S * e) / (1 + e)) * 9.81;
    bulkDensityInfo = { degreeOfSaturationFraction: S, bulkUnitWeightKNm3: gammaBulk };
  }

  return { voidRatio: e, porosity: n, ...bulkDensityInfo };
}

// ============================================================
// 3. TOTAL & EFFECTIVE STRESS (OVERBURDEN)
// ============================================================
//
// Terzaghi's effective stress principle: sigma' = sigma - u. Total stress
// from self-weight of soil layers above; pore pressure from the water
// table depth. This is the universal starting point for settlement,
// bearing capacity, and slope stability calculations.

export function effectiveStress({ depthM, waterTableDepthM, unitWeightAboveWaterKNm3, unitWeightBelowWaterKNm3 }) {
  if (!(depthM >= 0)) throw new Error('Depth must be zero or greater.');
  if (!(waterTableDepthM >= 0)) throw new Error('Water table depth cannot be negative.');
  if (!(unitWeightAboveWaterKNm3 > 0)) throw new Error('Unit weight above the water table must be greater than zero.');

  const GAMMA_W = 9.81; // kN/m3
  let totalStressKPa, porePressureKPa;

  if (depthM <= waterTableDepthM) {
    totalStressKPa = unitWeightAboveWaterKNm3 * depthM;
    porePressureKPa = 0;
  } else {
    if (!(unitWeightBelowWaterKNm3 > 0)) throw new Error('Unit weight below the water table must be greater than zero when depth exceeds the water table.');
    const aboveM = waterTableDepthM;
    const belowM = depthM - waterTableDepthM;
    totalStressKPa = unitWeightAboveWaterKNm3 * aboveM + unitWeightBelowWaterKNm3 * belowM;
    porePressureKPa = GAMMA_W * belowM;
  }
  const effectiveStressKPa = totalStressKPa - porePressureKPa;
  return { totalStressKPa, porePressureKPa, effectiveStressKPa };
}
