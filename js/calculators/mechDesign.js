// mechDesign.js — machine design calculations: fasteners, gears, belts.

// ============================================================
// 1. BOLT TORQUE & PRELOAD
// ============================================================
//
// T = K x D x F -- the standard, universally used fastener torque-tension
// relationship (Shigley's Mechanical Engineering Design; every major
// fastener manufacturer's engineering data). K (the "nut factor") is NOT
// a universal constant -- it depends on lubrication, plating and thread
// condition, and genuinely varies roughly 0.10-0.20+ between a
// well-lubricated and a dry, as-received bolt. Because of that, this
// takes K, diameter and target clamp force as direct inputs rather than
// assuming one "correct" K -- the formula is exact; the K-factor is a
// property of the actual bolt and lubrication condition, supplied by the
// user or the bolt's own datasheet.

export function boltTorque({ nutFactorK, diameterM, clampForceN }) {
  if (!(nutFactorK > 0)) throw new Error('Nut factor K must be greater than zero (typically 0.10-0.20).');
  if (!(diameterM > 0)) throw new Error('Bolt diameter must be greater than zero.');
  if (!(clampForceN > 0)) throw new Error('Target clamp force must be greater than zero.');
  return { torqueNm: nutFactorK * diameterM * clampForceN };
}

// Standard ISO metric bolt tensile stress areas (ISO 724) and property
// class proof stresses (ISO 898-1) -- published, tabulated reference
// values, not derived or estimated. Covers the most common sizes/grades;
// a size or grade outside this table should be looked up from the
// bolt's own standard rather than guessed.
export const ISO_BOLT_STRESS_AREA_MM2 = {
  M6: 20.1, M8: 36.6, M10: 58.0, M12: 84.3, M14: 115, M16: 157, M20: 245, M24: 353,
};
export const ISO_PROPERTY_CLASS_PROOF_MPA = {
  '4.6': 225, '8.8': 660, '10.9': 940, '12.9': 1100,
};

export function boltClampForceFromGrade({ size, propertyClass, targetPctOfProof = 75 }) {
  const areaMm2 = ISO_BOLT_STRESS_AREA_MM2[size];
  const proofMpa = ISO_PROPERTY_CLASS_PROOF_MPA[propertyClass];
  if (!areaMm2) throw new Error(`Unknown bolt size: ${size}. Covered sizes: ${Object.keys(ISO_BOLT_STRESS_AREA_MM2).join(', ')}.`);
  if (!proofMpa) throw new Error(`Unknown property class: ${propertyClass}. Covered classes: ${Object.keys(ISO_PROPERTY_CLASS_PROOF_MPA).join(', ')}.`);
  if (!(targetPctOfProof > 0 && targetPctOfProof <= 100)) throw new Error('Target percentage of proof load must be between 0 and 100.');
  const proofLoadN = areaMm2 * proofMpa; // MPa = N/mm^2, area in mm^2 -> N directly
  const clampForceN = proofLoadN * (targetPctOfProof / 100);
  return { areaMm2, proofMpa, proofLoadN, clampForceN };
}

// ============================================================
// 2. GEAR RATIO & SPEED/TORQUE
// ============================================================
//
// Gear ratio = N1/N2 = D2/D1 = T2/T1 (speed inversely proportional to
// pitch diameter and to the tooth count ratio; torque scales the
// opposite way, ignoring mesh losses). Exact kinematic/ideal relationship
// -- a real gearbox torque output is reduced by mesh efficiency, not
// included here.

export function gearRatio({ teethDriving, teethDriven }) {
  if (!(teethDriving > 0) || !(teethDriven > 0)) throw new Error('Tooth counts must both be greater than zero.');
  return { ratio: teethDriven / teethDriving };
}

export function gearOutputSpeed({ inputRpm, teethDriving, teethDriven }) {
  if (!(inputRpm > 0)) throw new Error('Input speed must be greater than zero.');
  if (!(teethDriving > 0) || !(teethDriven > 0)) throw new Error('Tooth counts must both be greater than zero.');
  const ratio = teethDriven / teethDriving;
  return { ratio, outputRpm: inputRpm / ratio };
}

export function gearOutputTorque({ inputTorqueNm, teethDriving, teethDriven, meshEfficiencyPct = 100 }) {
  if (!(inputTorqueNm > 0)) throw new Error('Input torque must be greater than zero.');
  if (!(teethDriving > 0) || !(teethDriven > 0)) throw new Error('Tooth counts must both be greater than zero.');
  if (!(meshEfficiencyPct > 0 && meshEfficiencyPct <= 100)) throw new Error('Mesh efficiency must be between 0 and 100%.');
  const ratio = teethDriven / teethDriving;
  const idealOutputTorqueNm = inputTorqueNm * ratio;
  return { ratio, idealOutputTorqueNm, actualOutputTorqueNm: idealOutputTorqueNm * (meshEfficiencyPct / 100) };
}

// ============================================================
// 3. BELT / PULLEY SPEED RATIO
// ============================================================
//
// N1 x D1 = N2 x D2 (belt surface speed is the same at both pulleys,
// assuming no belt slip) -- standard, exact kinematic relationship.

export function beltPulleySpeed({ inputRpm, drivingDiameterMm, drivenDiameterMm }) {
  if (!(inputRpm > 0)) throw new Error('Input (driving pulley) speed must be greater than zero.');
  if (!(drivingDiameterMm > 0) || !(drivenDiameterMm > 0)) throw new Error('Both pulley diameters must be greater than zero.');
  const ratio = drivenDiameterMm / drivingDiameterMm;
  const outputRpm = inputRpm * drivingDiameterMm / drivenDiameterMm;
  const beltSpeedMPerMin = Math.PI * (drivingDiameterMm / 1000) * inputRpm;
  return { ratio, outputRpm, beltSpeedMPerMin };
}
