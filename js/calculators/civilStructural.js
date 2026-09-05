// civilStructural.js — structural engineering calculations.
//
// These are classical linear-elastic (Euler-Bernoulli) beam theory and
// Euler column buckling results — the same equations in every mechanics
// of materials / structural analysis textbook (Hibbeler, Gere & Goodno,
// Timoshenko). They are NOT a substitute for a code-compliant design check
// (AISC 360, ACI 318, IS 800/456, Eurocode) — those add load factors,
// resistance factors, deflection limits, and failure-mode checks well
// beyond a single formula. Every function here computes one well-defined
// mechanics quantity; combining those into an actual code-compliant
// design is the engineer's job, not this calculator's.

const STEEL_DENSITY_KG_M3 = 7850;   // standard structural/reinforcing steel

// ============================================================
// 1. BEAM ANALYSIS — simply supported and cantilever, point load and UDL
// ============================================================

export function beamAnalysis({ support, loadType, spanM, loadN, E_Pa, I_m4 }) {
  if (!(spanM > 0)) throw new Error('Span must be greater than zero.');
  if (!(loadN >= 0)) throw new Error('Load cannot be negative.');
  if (!(E_Pa > 0)) throw new Error('Modulus of elasticity (E) must be greater than zero.');
  if (!(I_m4 > 0)) throw new Error('Moment of inertia (I) must be greater than zero.');
  if (!['simply-supported', 'cantilever'].includes(support)) throw new Error("Support must be 'simply-supported' or 'cantilever'.");
  if (!['point', 'udl'].includes(loadType)) throw new Error("Load type must be 'point' (at midspan / free end) or 'udl'.");

  const L = spanM, EI = E_Pa * I_m4;
  let deflectionM, momentMaxNm, shearMaxN, deflLocation, momentLocation;

  if (support === 'simply-supported' && loadType === 'point') {
    // Point load P at midspan.
    deflectionM = (loadN * L ** 3) / (48 * EI);
    momentMaxNm = (loadN * L) / 4;
    shearMaxN = loadN / 2;
    deflLocation = 'midspan'; momentLocation = 'midspan';
  } else if (support === 'simply-supported' && loadType === 'udl') {
    // loadN is taken as TOTAL load (w * L); convert to w for the formulas.
    const w = loadN / L;
    deflectionM = (5 * w * L ** 4) / (384 * EI);
    momentMaxNm = (w * L ** 2) / 8;
    shearMaxN = (w * L) / 2;
    deflLocation = 'midspan'; momentLocation = 'midspan';
  } else if (support === 'cantilever' && loadType === 'point') {
    // Point load P at the free end.
    deflectionM = (loadN * L ** 3) / (3 * EI);
    momentMaxNm = loadN * L;
    shearMaxN = loadN;
    deflLocation = 'free end'; momentLocation = 'fixed support';
  } else {
    // Cantilever, UDL (loadN = total load).
    const w = loadN / L;
    deflectionM = (w * L ** 4) / (8 * EI);
    momentMaxNm = (w * L ** 2) / 2;
    shearMaxN = w * L;
    deflLocation = 'free end'; momentLocation = 'fixed support';
  }

  return {
    deflectionMm: deflectionM * 1000, deflLocation,
    momentMaxNm, momentMaxKNm: momentMaxNm / 1000, momentLocation,
    shearMaxN, shearMaxKN: shearMaxN / 1000,
  };
}

// ============================================================
// 2. SECTION PROPERTIES — moment of inertia & section modulus
// ============================================================

export function sectionProperties({ shape, widthM, heightM, diameterM, outerDiaM, innerDiaM }) {
  if (!['rectangle', 'circle', 'hollow-circle'].includes(shape)) {
    throw new Error("Shape must be 'rectangle', 'circle', or 'hollow-circle'.");
  }
  let I_m4, S_m3, areaM2;
  if (shape === 'rectangle') {
    if (!(widthM > 0) || !(heightM > 0)) throw new Error('Width and height must both be greater than zero.');
    I_m4 = (widthM * heightM ** 3) / 12;
    S_m3 = (widthM * heightM ** 2) / 6;
    areaM2 = widthM * heightM;
  } else if (shape === 'circle') {
    if (!(diameterM > 0)) throw new Error('Diameter must be greater than zero.');
    I_m4 = (Math.PI * diameterM ** 4) / 64;
    S_m3 = (Math.PI * diameterM ** 3) / 32;
    areaM2 = (Math.PI * diameterM ** 2) / 4;
  } else {
    if (!(outerDiaM > 0) || !(innerDiaM >= 0)) throw new Error('Outer diameter must be greater than zero; inner diameter cannot be negative.');
    if (innerDiaM >= outerDiaM) throw new Error('Inner diameter must be less than outer diameter.');
    I_m4 = (Math.PI * (outerDiaM ** 4 - innerDiaM ** 4)) / 64;
    S_m3 = I_m4 / (outerDiaM / 2);
    areaM2 = (Math.PI / 4) * (outerDiaM ** 2 - innerDiaM ** 2);
  }
  return {
    momentOfInertiaM4: I_m4, momentOfInertiaMm4: I_m4 * 1e12,
    sectionModulusM3: S_m3, sectionModulusMm3: S_m3 * 1e9,
    areaM2, areaMm2: areaM2 * 1e6,
  };
}

// ============================================================
// 3. COLUMN BUCKLING — Euler critical load & slenderness ratio
// ============================================================
//
// End-condition K factors are the standard, universally published Euler
// values (AISC/textbook): pinned-pinned 1.0, fixed-free 2.0,
// fixed-pinned ~0.7 (0.699, commonly rounded 0.70-0.80 depending on end
// fixity assumptions), fixed-fixed 0.5. Real column design (AISC 360,
// IS 800 etc.) uses these as a STARTING point inside a full capacity
// check with safety/resistance factors -- this gives the elastic
// buckling load itself, not a code-compliant allowable load.

export const END_CONDITIONS = {
  'pinned-pinned': { k: 1.0, label: 'Pinned \u2013 Pinned' },
  'fixed-free': { k: 2.0, label: 'Fixed \u2013 Free' },
  'fixed-pinned': { k: 0.7, label: 'Fixed \u2013 Pinned' },
  'fixed-fixed': { k: 0.5, label: 'Fixed \u2013 Fixed' },
};

export function columnBuckling({ endCondition, lengthM, E_Pa, I_m4, areaM2 }) {
  const cond = END_CONDITIONS[endCondition];
  if (!cond) throw new Error(`Unknown end condition: ${endCondition}`);
  if (!(lengthM > 0)) throw new Error('Column length must be greater than zero.');
  if (!(E_Pa > 0)) throw new Error('Modulus of elasticity (E) must be greater than zero.');
  if (!(I_m4 > 0)) throw new Error('Moment of inertia (I) must be greater than zero.');
  if (!(areaM2 > 0)) throw new Error('Cross-sectional area must be greater than zero.');

  const effectiveLengthM = cond.k * lengthM;
  const criticalLoadN = (Math.PI ** 2 * E_Pa * I_m4) / effectiveLengthM ** 2;
  const radiusOfGyrationM = Math.sqrt(I_m4 / areaM2);
  const slendernessRatio = effectiveLengthM / radiusOfGyrationM;
  const criticalStressPa = criticalLoadN / areaM2;

  return {
    kFactor: cond.k, effectiveLengthM,
    criticalLoadN, criticalLoadKN: criticalLoadN / 1000,
    radiusOfGyrationM, radiusOfGyrationMm: radiusOfGyrationM * 1000,
    slendernessRatio, criticalStressPa, criticalStressMPa: criticalStressPa / 1e6,
    note: slendernessRatio < 30
      ? 'Slenderness ratio below ~30 typically means the column is "short" \u2014 it will likely fail by material crushing before it buckles elastically, so Euler\u2019s formula alone overstates its capacity. A real design check needs the appropriate short/intermediate-column code provisions.'
      : 'Euler\u2019s formula assumes perfectly elastic, initially straight, centrally loaded behaviour \u2014 it does not include a safety factor or account for material yielding, initial crookedness, or eccentricity, all of which a real design code separately requires.',
  };
}

// ============================================================
// 4. COMBINED AXIAL & BENDING STRESS
// ============================================================

export function combinedStress({ axialLoadN, bendingMomentNm, areaM2, sectionModulusM3 }) {
  if (!(areaM2 > 0)) throw new Error('Cross-sectional area must be greater than zero.');
  if (!(sectionModulusM3 > 0)) throw new Error('Section modulus must be greater than zero.');
  const axialStressPa = axialLoadN / areaM2;
  const bendingStressPa = bendingMomentNm / sectionModulusM3;
  return {
    axialStressPa, axialStressMPa: axialStressPa / 1e6,
    bendingStressPa, bendingStressMPa: bendingStressPa / 1e6,
    maxCombinedStressMPa: (axialStressPa + bendingStressPa) / 1e6,
    minCombinedStressMPa: (axialStressPa - bendingStressPa) / 1e6,
  };
}

// ============================================================
// 5. STEEL WEIGHT — bars, plates, pipes (from first principles: density x volume)
// ============================================================

export function steelWeight({ shape, lengthM, diameterMm, widthMm, thicknessMm, outerDiaMm, wallThicknessMm, densityKgM3 = STEEL_DENSITY_KG_M3 }) {
  if (!(lengthM > 0)) throw new Error('Length must be greater than zero.');
  if (!(densityKgM3 > 0)) throw new Error('Density must be greater than zero.');
  let areaMm2;
  if (shape === 'round-bar') {
    if (!(diameterMm > 0)) throw new Error('Diameter must be greater than zero.');
    areaMm2 = (Math.PI / 4) * diameterMm ** 2;
  } else if (shape === 'flat-plate') {
    if (!(widthMm > 0) || !(thicknessMm > 0)) throw new Error('Width and thickness must both be greater than zero.');
    areaMm2 = widthMm * thicknessMm;
  } else if (shape === 'pipe') {
    if (!(outerDiaMm > 0) || !(wallThicknessMm > 0)) throw new Error('Outer diameter and wall thickness must both be greater than zero.');
    if (wallThicknessMm * 2 >= outerDiaMm) throw new Error('Wall thickness is too large for the given outer diameter.');
    const innerDiaMm = outerDiaMm - 2 * wallThicknessMm;
    areaMm2 = (Math.PI / 4) * (outerDiaMm ** 2 - innerDiaMm ** 2);
  } else {
    throw new Error("Shape must be 'round-bar', 'flat-plate', or 'pipe'.");
  }
  const volumeM3 = (areaMm2 * 1e-6) * lengthM;
  const weightKg = volumeM3 * densityKgM3;
  return { crossSectionAreaMm2: areaMm2, volumeM3, weightKg, weightPerMKgM: weightKg / lengthM };
}
