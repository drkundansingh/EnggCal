// shortCircuit.mjs — short-circuit (fault) calculation engine.
//
// Uses the standard "MVA method" for combining series fault contributions —
// a well-established, widely-taught simplification of full impedance-based
// fault analysis (equivalent to combining per-unit impedances on a common
// base, just expressed as MVA instead). It is a preliminary/planning-level
// method: it treats the network as radial and ignores X/R angle differences
// between contributions (a full IEC 60909 study also computes peak/breaking
// currents using X/R ratios and correction factors, which this simplified
// engine does not attempt to reproduce). Good enough for the preliminary
// protection-setting calculations this module exists for — not a substitute
// for a full short-circuit study.

import { sqrt3 } from './electricalCommon.js';

/** Fault MVA contributed by a source given directly as a fault MVA (e.g. from a utility). */
export function sourceFaultMVA(mva) {
  if (mva <= 0) throw new Error('Source fault MVA must be > 0');
  return mva;
}

/** Fault MVA contributed by a transformer, referred to its own terminals:
 * MVA_fault = Rated_MVA / (%Z/100). A transformer with a lower %Z lets
 * through more fault current, hence a HIGHER contributed fault MVA. */
export function transformerFaultMVA(ratedMVA, impedancePct) {
  if (ratedMVA <= 0) throw new Error('Transformer MVA must be > 0');
  if (impedancePct <= 0) throw new Error('Transformer impedance % must be > 0');
  return ratedMVA / (impedancePct / 100);
}

/** Combine two or more series fault-MVA contributions (MVA method):
 * 1/MVA_total = sum(1/MVA_i). Matches how impedances in series combine. */
export function combineSeriesFaultMVA(mvaContributions) {
  if (!mvaContributions.length) throw new Error('At least one contribution required');
  const sumReciprocal = mvaContributions.reduce((sum, mva) => {
    if (mva <= 0) throw new Error('Each fault MVA contribution must be > 0');
    return sum + 1 / mva;
  }, 0);
  return 1 / sumReciprocal;
}

/** Combine parallel fault-MVA contributions (e.g. two transformers feeding
 * the same bus, or motor fault contribution added to the source): MVA_total = sum(MVA_i). */
export function combineParallelFaultMVA(mvaContributions) {
  if (!mvaContributions.length) throw new Error('At least one contribution required');
  return mvaContributions.reduce((sum, mva) => sum + mva, 0);
}

/** Three-phase symmetrical fault current (kA) at a bus of a given line voltage (kV),
 * from the fault MVA available at that bus. */
export function threePhaseFaultCurrentKA(faultMVA, kV) {
  if (faultMVA <= 0) throw new Error('Fault MVA must be > 0');
  if (kV <= 0) throw new Error('Voltage must be > 0');
  return faultMVA / (sqrt3() * kV);
}

export function faultMVAFromCurrent(faultCurrentKA, kV) {
  return sqrt3() * kV * faultCurrentKA;
}

/**
 * Approximate line-to-ground fault current, since a full zero-sequence
 * network study is out of scope here. For solidly grounded HV systems, LG
 * fault current is commonly of the same order as (sometimes exceeding) the
 * three-phase fault — this returns the three-phase value unless a specific
 * ratio or resistance-grounded let-through current is supplied, in which
 * case the resistance-grounded figure (bounded by the NGR) is used, which
 * is the more accurate and common real-world input for those systems.
 */
export function lineToGroundFaultCurrentKA(threePhaseFaultKA, groundingType, options = {}) {
  if (groundingType === 'resistance' || groundingType === 'reactance') {
    if (!(options.ngrLetThroughA > 0)) {
      throw new Error('Resistance/reactance-grounded systems require the NGR (neutral grounding resistor/reactor) let-through current in amps');
    }
    return options.ngrLetThroughA / 1000; // A -> kA
  }
  if (groundingType === 'ungrounded') {
    return 0; // negligible fault current path for a true first ground fault on an ungrounded system
  }
  const ratio = options.lgToThreePhaseRatio ?? 1.0; // solidly grounded: commonly approximated ~= 3-phase
  return threePhaseFaultKA * ratio;
}
