// idmt.mjs — IDMT relay operating-time engine.
//
// Standard curve constants per IEC 60255-151 (formerly BS 142 / IEC 60255-3):
// t = TMS × k / (PSM^α − 1), where PSM = I_fault / I_pickup.

export const CURVES = {
  SI: { name: 'Standard Inverse', k: 0.14, alpha: 0.02 },
  VI: { name: 'Very Inverse', k: 13.5, alpha: 1 },
  EI: { name: 'Extremely Inverse', k: 80, alpha: 2 },
  LTI: { name: 'Long-Time Inverse', k: 120, alpha: 1 },
};

export function psm(faultCurrentA, pickupCurrentA) {
  if (pickupCurrentA <= 0) throw new Error('Pickup current must be > 0');
  if (faultCurrentA <= 0) throw new Error('Fault current must be > 0');
  return faultCurrentA / pickupCurrentA;
}

/** Operating time (seconds) for a given pickup, fault current, TMS, and curve. */
export function operatingTime(faultCurrentA, pickupCurrentA, tms, curveKey = 'SI') {
  const curve = CURVES[curveKey];
  if (!curve) throw new Error(`Unknown IDMT curve: ${curveKey}`);
  const m = psm(faultCurrentA, pickupCurrentA);
  if (m <= 1) throw new Error('Fault current must exceed pickup current (PSM must be > 1) for the relay to operate');
  if (tms <= 0) throw new Error('TMS must be > 0');
  return (tms * curve.k) / (Math.pow(m, curve.alpha) - 1);
}

/** Solve for the TMS needed to achieve a desired operating time at a given fault current. */
export function tmsForDesiredTime(faultCurrentA, pickupCurrentA, desiredTimeS, curveKey = 'SI') {
  const curve = CURVES[curveKey];
  if (!curve) throw new Error(`Unknown IDMT curve: ${curveKey}`);
  const m = psm(faultCurrentA, pickupCurrentA);
  if (m <= 1) throw new Error('Fault current must exceed pickup current (PSM must be > 1)');
  if (desiredTimeS <= 0) throw new Error('Desired operating time must be > 0');
  return (desiredTimeS * (Math.pow(m, curve.alpha) - 1)) / curve.k;
}
