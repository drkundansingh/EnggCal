// coordination.mjs — protection coordination (selectivity) check.
// Compares two IDMT-protected devices at a common fault current and checks
// the grading margin between them, per spec Section 17.

import * as idmt from './idmt.js';
import { ENGINEERING_CHECK } from './electricalCommon.js';

/**
 * @param upstream { pickupA, tms, curve }
 * @param downstream { pickupA, tms, curve }
 * @param faultCurrentA fault current seen by BOTH devices (typically at the downstream device's location)
 * @param minGradingMarginS typical industry practice is 0.2-0.4s; default 0.3s
 */
export function checkCoordination(upstream, downstream, faultCurrentA, minGradingMarginS = 0.3) {
  const upTime = idmt.operatingTime(faultCurrentA, upstream.pickupA, upstream.tms, upstream.curve);
  const downTime = idmt.operatingTime(faultCurrentA, downstream.pickupA, downstream.tms, downstream.curve);
  const marginS = upTime - downTime;

  let check;
  if (downTime >= upTime) {
    check = ENGINEERING_CHECK.REVIEW_REQUIRED; // downstream is not faster than upstream — no discrimination at all
  } else if (marginS < minGradingMarginS) {
    check = ENGINEERING_CHECK.WARNING; // downstream is faster, but margin is tighter than typical practice
  } else {
    check = ENGINEERING_CHECK.PASS;
  }

  return { upstreamOperatingTimeS: upTime, downstreamOperatingTimeS: downTime, marginS, minGradingMarginS, check };
}
