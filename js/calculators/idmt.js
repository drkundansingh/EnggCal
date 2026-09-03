// idmt.mjs — IDMT relay operating-time engine.
//
// Two independent curve families, both genuinely used by real numerical
// relays (including ABB and Siemens): IEC 60255-151 and IEEE C37.112-2018.
// A real relay lets the engineer pick either family from a menu -- this
// module supports both rather than assuming one.
//
// IEC 60255-151:  t = TMS × k / (PSM^α − 1)
// IEEE C37.112:   t = TD  × (A / (M^p − 1) + B)
//
// IEEE constants are Table 1 of IEEE Std C37.112-2018, quoted directly
// from the standard (not re-derived) and sanity-checked against known
// curve shapes: time must fall monotonically as the current multiple
// rises, which all three do.

export const CURVES = {
  SI: { name: 'IEC Standard Inverse', family: 'IEC', k: 0.14, alpha: 0.02 },
  VI: { name: 'IEC Very Inverse', family: 'IEC', k: 13.5, alpha: 1 },
  EI: { name: 'IEC Extremely Inverse', family: 'IEC', k: 80, alpha: 2 },
  LTI: { name: 'IEC Long-Time Inverse', family: 'IEC', k: 120, alpha: 1 },
  MI_IEEE: { name: 'IEEE Moderately Inverse', family: 'IEEE', A: 0.0515, B: 0.1140, p: 0.0200 },
  VI_IEEE: { name: 'IEEE Very Inverse', family: 'IEEE', A: 19.61, B: 0.4910, p: 2.0000 },
  EI_IEEE: { name: 'IEEE Extremely Inverse', family: 'IEEE', A: 28.2, B: 0.1217, p: 2.0000 },
};

export function psm(faultCurrentA, pickupCurrentA) {
  if (pickupCurrentA <= 0) throw new Error('Pickup current must be > 0');
  if (faultCurrentA <= 0) throw new Error('Fault current must be > 0');
  return faultCurrentA / pickupCurrentA;
}

/** Operating time (seconds) for a given pickup, fault current, TMS/TD, and curve. */
export function operatingTime(faultCurrentA, pickupCurrentA, tms, curveKey = 'SI') {
  const curve = CURVES[curveKey];
  if (!curve) throw new Error(`Unknown IDMT curve: ${curveKey}`);
  const m = psm(faultCurrentA, pickupCurrentA);
  if (m <= 1) throw new Error('Fault current must exceed pickup current (PSM must be > 1) for the relay to operate');
  if (tms <= 0) throw new Error('TMS/TD must be > 0');
  if (curve.family === 'IEEE') {
    return tms * (curve.A / (Math.pow(m, curve.p) - 1) + curve.B);
  }
  return (tms * curve.k) / (Math.pow(m, curve.alpha) - 1);
}

/** Solve for the TMS/TD needed to achieve a desired operating time at a given fault current. */
export function tmsForDesiredTime(faultCurrentA, pickupCurrentA, desiredTimeS, curveKey = 'SI') {
  const curve = CURVES[curveKey];
  if (!curve) throw new Error(`Unknown IDMT curve: ${curveKey}`);
  const m = psm(faultCurrentA, pickupCurrentA);
  if (m <= 1) throw new Error('Fault current must exceed pickup current (PSM must be > 1)');
  if (desiredTimeS <= 0) throw new Error('Desired operating time must be > 0');
  if (curve.family === 'IEEE') {
    return desiredTimeS / (curve.A / (Math.pow(m, curve.p) - 1) + curve.B);
  }
  return (desiredTimeS * (Math.pow(m, curve.alpha) - 1)) / curve.k;
}
