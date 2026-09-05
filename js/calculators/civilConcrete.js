// civilConcrete.js — concrete and reinforcement calculations.

const STEEL_DENSITY_KG_M3 = 7850;

// ============================================================
// 1. CONCRETE VOLUME & WEIGHT
// ============================================================

export function concreteVolume({ shape, lengthM, widthM, thicknessM, diameterM, heightM, unitWeightKgM3 = 2400 }) {
  if (!(unitWeightKgM3 > 0)) throw new Error('Unit weight must be greater than zero.');
  let volumeM3;
  if (shape === 'slab-rectangular') {
    if (!(lengthM > 0) || !(widthM > 0) || !(thicknessM > 0)) throw new Error('Length, width and thickness must all be greater than zero.');
    volumeM3 = lengthM * widthM * thicknessM;
  } else if (shape === 'column-rectangular') {
    if (!(widthM > 0) || !(thicknessM > 0) || !(heightM > 0)) throw new Error('Width, thickness and height must all be greater than zero.');
    volumeM3 = widthM * thicknessM * heightM;
  } else if (shape === 'column-circular') {
    if (!(diameterM > 0) || !(heightM > 0)) throw new Error('Diameter and height must both be greater than zero.');
    volumeM3 = (Math.PI / 4) * diameterM ** 2 * heightM;
  } else if (shape === 'footing-rectangular') {
    if (!(lengthM > 0) || !(widthM > 0) || !(thicknessM > 0)) throw new Error('Length, width and thickness must all be greater than zero.');
    volumeM3 = lengthM * widthM * thicknessM;
  } else {
    throw new Error("Shape must be 'slab-rectangular', 'column-rectangular', 'column-circular', or 'footing-rectangular'.");
  }
  return { volumeM3, weightKg: volumeM3 * unitWeightKgM3, weightTonne: (volumeM3 * unitWeightKgM3) / 1000 };
}

// ============================================================
// 2. WATER-CEMENT RATIO
// ============================================================

export function waterCementRatio({ waterKg, cementKg, targetRatio }) {
  const known = [waterKg, cementKg, targetRatio].filter((v) => v !== undefined && v !== null && v !== '').length;
  if (known < 2) throw new Error('Provide any two of water, cement, and target ratio \u2014 the third is calculated.');
  if (waterKg !== undefined && waterKg !== null && waterKg !== '' && cementKg !== undefined && cementKg !== null && cementKg !== '') {
    if (!(waterKg > 0) || !(cementKg > 0)) throw new Error('Water and cement quantities must be greater than zero.');
    return { waterKg, cementKg, ratio: waterKg / cementKg };
  }
  if (targetRatio !== undefined && targetRatio !== null && targetRatio !== '' && cementKg !== undefined && cementKg !== null && cementKg !== '') {
    if (!(targetRatio > 0) || !(cementKg > 0)) throw new Error('Target ratio and cement quantity must be greater than zero.');
    return { waterKg: targetRatio * cementKg, cementKg, ratio: targetRatio };
  }
  if (targetRatio !== undefined && targetRatio !== null && targetRatio !== '' && waterKg !== undefined && waterKg !== null && waterKg !== '') {
    if (!(targetRatio > 0) || !(waterKg > 0)) throw new Error('Target ratio and water quantity must be greater than zero.');
    return { waterKg, cementKg: waterKg / targetRatio, ratio: targetRatio };
  }
  throw new Error('Could not determine which two values were provided.');
}

// ============================================================
// 3. NOMINAL CONCRETE MIX QUANTITIES (IS 456:2000, Table 9)
// ============================================================
//
// Nominal mixes are a fixed-proportion method for ordinary concrete
// (M10-M20), specified BY THE INDIAN STANDARD IS 456:2000. Higher grades
// (M25 and above) are required by IS 456 itself to use design mixes, not
// nominal mixes -- this calculator does not cover those, and does not
// apply to ACI/other codes, which use a different (design-mix) method
// entirely rather than fixed nominal ratios.

export const IS456_NOMINAL_MIXES = {
  M5: { cement: 1, sand: 5, aggregate: 10 },
  M7_5: { cement: 1, sand: 4, aggregate: 8 },
  M10: { cement: 1, sand: 3, aggregate: 6 },
  M15: { cement: 1, sand: 2, aggregate: 4 },
  M20: { cement: 1, sand: 1.5, aggregate: 3 },
};

export function nominalMixQuantities({ grade, wetVolumeM3, dryVolumeFactor = 1.54, cementDensityKgM3 = 1440, cementBagKg = 50 }) {
  const mix = IS456_NOMINAL_MIXES[grade];
  if (!mix) throw new Error(`Unknown nominal mix grade: ${grade}. IS 456 nominal mixes cover M5\u2013M20 only; M25 and above require a design mix.`);
  if (!(wetVolumeM3 > 0)) throw new Error('Wet (finished) concrete volume must be greater than zero.');
  if (!(dryVolumeFactor > 1)) throw new Error('Dry volume factor should be greater than 1 (typically 1.54\u20131.57, accounting for voids between aggregate particles).');

  const sum = mix.cement + mix.sand + mix.aggregate;
  const dryVolumeM3 = wetVolumeM3 * dryVolumeFactor;
  const cementVolumeM3 = dryVolumeM3 * (mix.cement / sum);
  const sandVolumeM3 = dryVolumeM3 * (mix.sand / sum);
  const aggregateVolumeM3 = dryVolumeM3 * (mix.aggregate / sum);
  const cementWeightKg = cementVolumeM3 * cementDensityKgM3;
  const cementBags = cementWeightKg / cementBagKg;

  return {
    mixRatio: `1 : ${mix.sand} : ${mix.aggregate}`,
    dryVolumeM3, cementVolumeM3, sandVolumeM3, aggregateVolumeM3,
    cementWeightKg, cementBags,
    note: 'IS 456:2000 nominal mix, by volume. Real site batching should account for aggregate bulking/moisture content, which this does not adjust for \u2014 treat this as a material quantity ESTIMATE for procurement, not a mix design.',
  };
}

// ============================================================
// 4. REBAR WEIGHT & QUANTITY
// ============================================================

export function rebarWeight({ diameterMm, lengthM, numberOfBars = 1, densityKgM3 = STEEL_DENSITY_KG_M3 }) {
  if (!(diameterMm > 0)) throw new Error('Bar diameter must be greater than zero.');
  if (!(lengthM > 0)) throw new Error('Bar length must be greater than zero.');
  if (!(numberOfBars > 0)) throw new Error('Number of bars must be greater than zero.');
  if (!(densityKgM3 > 0)) throw new Error('Density must be greater than zero.');
  const areaMm2 = (Math.PI / 4) * diameterMm ** 2;
  const volumeM3PerBar = (areaMm2 * 1e-6) * lengthM;
  const weightPerBarKg = volumeM3PerBar * densityKgM3;
  const totalWeightKg = weightPerBarKg * numberOfBars;
  // The familiar site rule-of-thumb, d^2/162 kg/m, for cross-reference.
  const ruleOfThumbKgM = (diameterMm ** 2) / 162;
  return {
    crossSectionAreaMm2: areaMm2, weightPerBarKg, totalWeightKg,
    weightPerMKgM: weightPerBarKg / lengthM, ruleOfThumbKgM,
  };
}
