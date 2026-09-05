// civilSurveying.js — surveying and earthwork calculations.

// ============================================================
// 1. AREA — triangle and trapezoid
// ============================================================

export function triangleArea({ baseM, heightM }) {
  if (!(baseM > 0)) throw new Error('Base must be greater than zero.');
  if (!(heightM > 0)) throw new Error('Height must be greater than zero.');
  return { areaM2: 0.5 * baseM * heightM };
}

export function trapezoidArea({ side1M, side2M, heightM }) {
  if (!(side1M > 0) || !(side2M > 0)) throw new Error('Both parallel sides must be greater than zero.');
  if (!(heightM > 0)) throw new Error('Height (perpendicular distance between the parallel sides) must be greater than zero.');
  return { areaM2: ((side1M + side2M) / 2) * heightM };
}

// ============================================================
// 2. SLOPE / GRADIENT
// ============================================================

export function slopeCalc({ riseM, runM }) {
  if (!(runM > 0)) throw new Error('Horizontal run must be greater than zero.');
  const ratio = riseM / runM;
  return {
    slopePct: ratio * 100,
    slopeAngleDeg: (Math.atan(ratio) * 180) / Math.PI,
    slopeRatio: `1 : ${(runM / riseM).toFixed(2)}`,
  };
}

// ============================================================
// 3. CUT & FILL — average end area method
// ============================================================
//
// V = ((A1 + A2) / 2) * L -- the standard, universally taught
// approximation for earthwork volume between two cross-sections. It is
// explicitly an APPROXIMATION: the prismoidal formula is more accurate
// when the cross-section shape varies significantly along the length,
// which the average-end-area method does not correct for.

export function cutFillVolume({ area1M2, area2M2, distanceM }) {
  if (!(area1M2 >= 0) || !(area2M2 >= 0)) throw new Error('Cross-sectional areas cannot be negative.');
  if (!(distanceM > 0)) throw new Error('Distance between sections must be greater than zero.');
  const volumeM3 = ((area1M2 + area2M2) / 2) * distanceM;
  return {
    volumeM3,
    note: 'Average end area method \u2014 a standard approximation, not exact for cross-sections that change shape significantly over the interval. The prismoidal formula is more accurate for those cases.',
  };
}
