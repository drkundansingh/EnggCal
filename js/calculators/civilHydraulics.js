// civilHydraulics.js — open channel and weir flow.
//
// Manning's equation (1889) is the standard uniform-flow formula for open
// channels, universally used and taught. The rectangular sharp-crested
// weir formula (Francis) applies specifically to that weir type -- a
// V-notch, Cipolletti, or broad-crested weir each use a DIFFERENT
// formula, not implemented here.

// ============================================================
// 1. MANNING'S EQUATION — open channel flow
// ============================================================

export const MANNING_N = {
  'concrete (smooth)': 0.012, 'concrete (rough)': 0.017,
  'earth channel (clean)': 0.022, 'earth channel (weedy)': 0.030,
  'gravel bed': 0.025, 'brick': 0.015, 'PVC/plastic pipe': 0.010,
};

export function manningFlow({ channelShape, bottomWidthM, sideSlopeH, flowDepthM, manningN, longitudinalSlope }) {
  if (!(flowDepthM > 0)) throw new Error('Flow depth must be greater than zero.');
  if (!(manningN > 0)) throw new Error("Manning's roughness coefficient (n) must be greater than zero.");
  if (!(longitudinalSlope > 0)) throw new Error('Channel (longitudinal) slope must be greater than zero.');

  let areaM2, wettedPerimeterM;
  if (channelShape === 'rectangular') {
    if (!(bottomWidthM > 0)) throw new Error('Bottom width must be greater than zero.');
    areaM2 = bottomWidthM * flowDepthM;
    wettedPerimeterM = bottomWidthM + 2 * flowDepthM;
  } else if (channelShape === 'trapezoidal') {
    if (!(bottomWidthM > 0)) throw new Error('Bottom width must be greater than zero.');
    if (!(sideSlopeH >= 0)) throw new Error('Side slope (horizontal per 1 vertical) cannot be negative.');
    areaM2 = (bottomWidthM + sideSlopeH * flowDepthM) * flowDepthM;
    wettedPerimeterM = bottomWidthM + 2 * flowDepthM * Math.sqrt(1 + sideSlopeH ** 2);
  } else {
    throw new Error("Channel shape must be 'rectangular' or 'trapezoidal'.");
  }

  const hydraulicRadiusM = areaM2 / wettedPerimeterM;
  const velocityMs = (1 / manningN) * hydraulicRadiusM ** (2 / 3) * Math.sqrt(longitudinalSlope);
  const flowM3s = velocityMs * areaM2;

  return { areaM2, wettedPerimeterM, hydraulicRadiusM, velocityMs, flowM3s, flowLs: flowM3s * 1000 };
}

// ============================================================
// 2. RECTANGULAR SHARP-CRESTED WEIR (Francis formula, suppressed weir)
// ============================================================

export function weirFlow({ crestLengthM, headM, contracted = false }) {
  if (!(crestLengthM > 0)) throw new Error('Weir crest length must be greater than zero.');
  if (!(headM > 0)) throw new Error('Head over the weir must be greater than zero.');
  const effectiveLengthM = contracted ? crestLengthM - 0.2 * headM : crestLengthM;
  if (!(effectiveLengthM > 0)) throw new Error('Effective crest length is zero or negative \u2014 the head is too large relative to the crest length for the end-contraction correction.');
  const flowM3s = 1.84 * effectiveLengthM * headM ** 1.5;
  return {
    effectiveLengthM, flowM3s, flowLs: flowM3s * 1000,
    note: 'Francis formula for a rectangular, sharp-crested weir only. V-notch, Cipolletti, and broad-crested weirs use different formulas \u2014 do not apply this to those.',
  };
}
