// ctEngine.mjs — current transformer ratio, burden, and knee-point engine.
// Reused by every protection calculator that needs a CT secondary current
// or a stability check (transformer REF, motor, feeder, busbar protection).

export function ctSecondaryCurrent(primaryCurrentA, ctPrimaryA, ctSecondaryA = 1) {
  if (ctPrimaryA <= 0) throw new Error('CT primary rating must be > 0');
  if (ctSecondaryA <= 0) throw new Error('CT secondary rating must be > 0');
  return (primaryCurrentA / ctPrimaryA) * ctSecondaryA;
}

export function totalBurdenVA(relayBurdenVA = 0, cableBurdenVA = 0, otherBurdenVA = 0) {
  return relayBurdenVA + cableBurdenVA + otherBurdenVA;
}

/** Cable (lead) burden from resistance and secondary current: P = I²R per lead,
 * doubled for the go-and-return path (standard single-phase burden loop). */
export function cableBurdenVA(secondaryCurrentA, leadResistanceOhmPerLead, leadCount = 2) {
  return leadCount * secondaryCurrentA * secondaryCurrentA * leadResistanceOhmPerLead;
}

/**
 * Approximate knee-point voltage requirement for a stability-critical scheme
 * (REF, high-impedance differential): Vk >= K × I_fault_secondary × (Rct + 2×Rl),
 * a standard, widely-used rule-of-thumb stability check (K is a scheme
 * stability factor — commonly K≈2 is used as an indicative starting point
 * for high-impedance REF/differential stability; the exact factor depends on
 * the relay manufacturer's stability formula and must be confirmed against
 * the actual relay instruction manual).
 */
export function requiredKneePointVoltage(faultCurrentSecondaryA, ctResistanceOhm, leadResistanceOhm, stabilityFactorK = 2) {
  if (faultCurrentSecondaryA <= 0) throw new Error('Secondary fault current must be > 0');
  return stabilityFactorK * faultCurrentSecondaryA * (ctResistanceOhm + 2 * leadResistanceOhm);
}

/** Basic sufficiency check: does the CT knee-point voltage rating (if known)
 * meet the required value above? Returns a warning if data is missing rather
 * than silently skipping the check. */
export function checkCtSufficiency({ actualKneePointV, requiredKneePointV, ctClass, ctRatedBurdenVA, actualBurdenVA }) {
  const warnings = [];
  if (actualKneePointV === undefined || actualKneePointV === null) {
    warnings.push('CT knee-point voltage not supplied — cannot confirm stability for a differential/REF scheme.');
  } else if (requiredKneePointV !== undefined && actualKneePointV < requiredKneePointV) {
    warnings.push(`CT knee-point voltage (${actualKneePointV} V) is below the estimated requirement (${requiredKneePointV.toFixed(1)} V) — scheme may be unstable on external faults.`);
  }
  if (ctRatedBurdenVA !== undefined && actualBurdenVA !== undefined && actualBurdenVA > ctRatedBurdenVA) {
    warnings.push(`Connected burden (${actualBurdenVA} VA) exceeds the CT's rated burden (${ctRatedBurdenVA} VA) — accuracy may be compromised.`);
  }
  if (!ctClass) warnings.push('CT accuracy class not supplied — protection-class CTs (e.g. 5P20, PS) should be confirmed for protection duties, not metering-class CTs.');
  return { sufficient: warnings.length === 0, warnings };
}
