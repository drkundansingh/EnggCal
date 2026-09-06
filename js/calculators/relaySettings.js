// relaySettings.js — a realistic multi-stage overcurrent relay setting
// calculator, matching how a real numerical relay (ABB REF615/620/630
// series, Siemens SIPROTEC 7SJ/7SC series, and equivalents) is actually
// configured — not just a bare IDMT time-current curve.
//
// WHAT MAKES THIS "REALISTIC" RATHER THAN JUST IDMT MATH
//
// A real feeder relay is never set in raw primary amps. Every setting is
// entered in the relay's own units — almost always MULTIPLES OF ITS RATED
// CURRENT (In, typically 1 A or 5 A secondary) — and the engineer works
// out the corresponding primary current separately for documentation.
// Getting the CT ratio wrong, or confusing primary and secondary values,
// is a genuinely common and consequential real-world settings error. This
// module carries both values through every stage explicitly rather than
// letting them get silently conflated.
//
// A real feeder relay also normally has THREE overcurrent stages, not one:
//   Stage 1 (I>)   - inverse-time (IDMT), the main time-graded protection
//   Stage 2 (I>>)  - definite-time high-set, fast clearance of close-in
//                    faults, set above maximum through-fault / inrush
//   Stage 3 (I>>>) - instantaneous (no intentional delay), set above the
//                    maximum fault current the relay could ever see so it
//                    only operates for a genuine internal/close-in fault
//
// ABB and Siemens both implement this same IEC-style I>/I>>/I>>> naming
// for their European/IEC-market relays (REF615, SIPROTEC 7SJ) and support
// both IEC 60255 and IEEE C37.112 curve families from idmt.js. Where the
// two vendors' terminology genuinely differs is noted in the label text
// returned by this module (e.g. ABB's DEF615/REF615 uses "IDMT/DT" mode
// selection per stage; Siemens SIPROTEC uses similar per-stage curve
// selection under a different menu structure) — this module does not
// claim to reproduce either manufacturer's proprietary software UI, only
// the standard IEC parameter set both are built on.

import * as idmt from './idmt.js';

/** Relay rated current, the near-universal secondary CT standards. */
export const RATED_CURRENTS_A = [1, 5];

/**
 * Converts a primary current to relay per-unit (multiples of In) and back,
 * given the CT ratio and the relay's rated current.
 */
export function primaryToPu(primaryA, ctRatioPrimaryA, ctRatioSecondaryA, relayInA) {
  if (!(primaryA >= 0)) throw new Error('Primary current cannot be negative.');
  if (!(ctRatioPrimaryA > 0)) throw new Error('CT primary rating must be greater than zero.');
  if (!(ctRatioSecondaryA > 0)) throw new Error('CT secondary rating must be greater than zero.');
  if (!(relayInA > 0)) throw new Error('Relay rated current In must be greater than zero.');
  const secondaryA = primaryA * (ctRatioSecondaryA / ctRatioPrimaryA);
  return secondaryA / relayInA;
}

export function puToPrimary(pu, ctRatioPrimaryA, ctRatioSecondaryA, relayInA) {
  if (!(pu >= 0)) throw new Error('Per-unit value cannot be negative.');
  if (!(ctRatioPrimaryA > 0) || !(ctRatioSecondaryA > 0)) throw new Error('CT ratio values must be greater than zero.');
  if (!(relayInA > 0)) throw new Error('Relay rated current In must be greater than zero.');
  const secondaryA = pu * relayInA;
  return secondaryA * (ctRatioPrimaryA / ctRatioSecondaryA);
}

/**
 * Full three-stage overcurrent relay setting calculation.
 *
 * @param {object} o
 * @param {number} o.ctPrimaryA - CT primary rating, A
 * @param {number} o.ctSecondaryA - CT secondary rating, A (1 or 5)
 * @param {number} o.relayInA - relay rated current, A (usually equals ctSecondaryA)
 * @param {number} o.fullLoadCurrentA - feeder full load current, A (primary)
 * @param {number} o.maxThroughFaultA - largest current the feeder must NOT
 *   trip fast for (downstream fault contribution, motor starting, transformer
 *   inrush, cold-load pickup) — I>> must clear this, primary A
 * @param {number} o.maxFaultCurrentA - maximum fault current the relay
 *   could ever see for a fault genuinely on its own protected zone —
 *   I>>> is set above this so it never overreaches into the next zone, primary A
 * @param {number} o.pickupMarginPct - I> pickup margin above full load (default 20%)
 * @param {number} o.stage2MarginPct - I>> margin above max through-fault (default 25%)
 * @param {number} o.stage3MarginPct - I>>> margin above max fault current (default 20%)
 * @param {string} o.curveKey - IDMT curve for Stage 1, from idmt.CURVES
 * @param {number} o.desiredStage1TimeS - Stage 1 operating time target at maxFaultCurrentA
 * @param {number} o.stage2DelayS - Stage 2 definite-time delay, s
 * @param {number} [o.minFaultCurrentA] - smallest fault current the relay must
 *   actually detect and clear (often a far-end or minimum-plant-condition
 *   fault, well below maxFaultCurrentA) -- primary A. Optional, but a real
 *   setting exercise is incomplete without this sensitivity check: a
 *   relay set only against the MAXIMUM fault can still be blind to a
 *   legitimate but smaller fault elsewhere in its zone.
 * @param {number} [o.minSensitivityRatio=2.0] - commonly used minimum
 *   acceptable ratio of minFaultCurrentA to Stage 1 pickup for reliable
 *   operation. Cited practice varies by source/utility (some use lower
 *   values); 2.0 is a widely used conservative default, not a universal
 *   fixed law -- adjust to your own protection philosophy or grading
 *   guide.
 */
export function relaySettings({
  ctPrimaryA, ctSecondaryA, relayInA,
  fullLoadCurrentA, maxThroughFaultA, maxFaultCurrentA,
  pickupMarginPct = 20, stage2MarginPct = 25, stage3MarginPct = 20,
  curveKey = 'SI', desiredStage1TimeS = 0.3, stage2DelayS = 0.15,
  minFaultCurrentA = null, minSensitivityRatio = 2.0,
}) {
  if (!(ctPrimaryA > 0)) throw new Error('CT primary rating must be greater than zero.');
  if (!(ctSecondaryA > 0)) throw new Error('CT secondary rating must be greater than zero.');
  if (!(relayInA > 0)) throw new Error('Relay rated current must be greater than zero.');
  if (!(fullLoadCurrentA > 0)) throw new Error('Full load current must be greater than zero.');
  if (!(maxThroughFaultA > 0)) throw new Error('Max through-fault / inrush current must be greater than zero.');
  if (!(maxFaultCurrentA > 0)) throw new Error('Max fault current must be greater than zero.');
  if (!(maxFaultCurrentA >= maxThroughFaultA)) {
    throw new Error('Max fault current must be at least the max through-fault current \u2014 the fault level cannot be lower than a through-fault the relay must ride through.');
  }
  const curve = idmt.CURVES[curveKey];
  if (!curve) throw new Error(`Unknown curve: ${curveKey}`);

  // ---- Stage 1 (I>) — IDMT, pickup above full load with margin ----
  const stage1PickupA = fullLoadCurrentA * (1 + pickupMarginPct / 100);
  const stage1PickupPu = primaryToPu(stage1PickupA, ctPrimaryA, ctSecondaryA, relayInA);
  const stage1M = idmt.psm(maxFaultCurrentA, stage1PickupA);
  let stage1Tms = null, stage1OperTime = null;
  if (stage1M > 1) {
    stage1Tms = idmt.tmsForDesiredTime(maxFaultCurrentA, stage1PickupA, desiredStage1TimeS, curveKey);
    stage1OperTime = idmt.operatingTime(maxFaultCurrentA, stage1PickupA, stage1Tms, curveKey);
  }

  // ---- Stage 2 (I>>) — definite time, above max through-fault / inrush ----
  const stage2PickupA = maxThroughFaultA * (1 + stage2MarginPct / 100);
  const stage2PickupPu = primaryToPu(stage2PickupA, ctPrimaryA, ctSecondaryA, relayInA);
  const stage2ClearsFault = stage2PickupA < maxFaultCurrentA;

  // ---- Stage 3 (I>>>) — instantaneous, above max fault current ----
  const stage3PickupA = maxFaultCurrentA * (1 + stage3MarginPct / 100);
  const stage3PickupPu = primaryToPu(stage3PickupA, ctPrimaryA, ctSecondaryA, relayInA);

  const warnings = [];
  if (stage1M <= 1) {
    warnings.push('Stage 1 (I>) pickup is at or above the maximum fault current supplied \u2014 the IDMT stage would never operate for this fault. Check the fault current or reduce the pickup margin.');
  }
  if (!stage2ClearsFault) {
    warnings.push('Stage 2 (I>>) pickup is at or above the maximum fault current \u2014 it would never pick up. The through-fault/inrush current may be too close to the fault level for a meaningful high-set stage; consider omitting Stage 2 for this feeder.');
  }
  if (stage2PickupPu > 40 || stage3PickupPu > 40) {
    warnings.push('A per-unit pickup above ~40\u00d7In is outside the setting range of most numerical relays \u2014 check the CT ratio and rated current selection.');
  }

  // ---- Sensitivity check: can Stage 1 actually SEE the smallest fault it
  // is meant to clear? Setting a relay against the maximum fault alone
  // and never checking the minimum is a genuinely common real-world
  // oversight -- a relay that never sees a legitimate smaller fault
  // provides no protection for it at all, regardless of how well-graded
  // the time-current curve looks on paper. ----
  let sensitivity = null;
  if (minFaultCurrentA !== null && minFaultCurrentA !== undefined && minFaultCurrentA !== '') {
    if (!(minFaultCurrentA > 0)) throw new Error('Minimum fault current must be greater than zero.');
    const sensitivityRatio = minFaultCurrentA / stage1PickupA;
    const adequate = sensitivityRatio >= minSensitivityRatio;
    sensitivity = { minFaultCurrentA, sensitivityRatio, minSensitivityRatio, adequate };
    if (!adequate) {
      if (sensitivityRatio <= 1) {
        warnings.push(`Stage 1 (I>) pickup (${stage1PickupA.toFixed(1)} A) is at or ABOVE the minimum fault current (${minFaultCurrentA.toFixed(1)} A) supplied \u2014 the relay would never see this fault at all. This is not a marginal sensitivity issue; it is a real protection gap that needs a lower pickup or a different protection scheme for this fault condition.`);
      } else {
        warnings.push(`Sensitivity ratio at the minimum fault (${sensitivityRatio.toFixed(2)}\u00d7) is below the ${minSensitivityRatio}\u00d7 target \u2014 the relay would technically operate, but slowly and close to its pickup threshold, where CT error and system variation matter most. Consider a lower pickup margin if load current allows it.`);
      }
    }
  }

  return {
    stage1: { pickupA: stage1PickupA, pickupPu: stage1PickupPu, curve: curve.name, tms: stage1Tms, operatingTimeS: stage1OperTime, psmAtMaxFault: stage1M },
    stage2: { pickupA: stage2PickupA, pickupPu: stage2PickupPu, delayS: stage2DelayS, clearsMaxFault: stage2ClearsFault },
    stage3: { pickupA: stage3PickupA, pickupPu: stage3PickupPu, delayS: 0 },
    ctRatio: `${ctPrimaryA}/${ctSecondaryA} A`,
    relayInA,
    sensitivity,
    warnings,
  };
}
