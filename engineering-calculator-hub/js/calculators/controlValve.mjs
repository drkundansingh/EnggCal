// controlValve.mjs — simplified ISA-75.01 style valve sizing for liquids,
// gas, and steam. These are preliminary sizing estimates — final valve
// selection MUST be verified against the manufacturer's sizing software,
// which accounts for FL, Fd, piping geometry factors, and choked-flow limits.

/** Liquid Cv (US units): Cv = Q(gpm) / sqrt(dP(psi) / SG) */
export function liquidCv(flowGpm, dpPsi, sg) {
  if (dpPsi <= 0) throw new Error('Pressure drop must be > 0');
  if (sg <= 0) throw new Error('Specific gravity must be > 0');
  return flowGpm / Math.sqrt(dpPsi / sg);
}

/** Liquid Cv from metric inputs: Q in m3/h, dP in bar, SG dimensionless.
 * Kv = Q(m3/h) * sqrt(SG / dP(bar));  Cv = 1.156 * Kv
 */
export function liquidKv(flowM3h, dpBar, sg) {
  if (dpBar <= 0) throw new Error('Pressure drop must be > 0');
  if (sg <= 0) throw new Error('Specific gravity must be > 0');
  return flowM3h * Math.sqrt(sg / dpBar);
}
export function kvToCv(kv) {
  return kv * 1.156;
}
export function cvToKv(cv) {
  return cv / 1.156;
}

/**
 * Simplified gas Cv (non-choked, US units, ISA approximate form):
 * Cv = Q(scfh) / (1360 * sqrt(dP*(P1+P2) / SG_gas))   [approx., P in psia]
 * Use only for preliminary sizing; verify choked-flow (P2 < ~0.5*P1) separately.
 */
export function gasCv(flowScfh, p1Psia, p2Psia, sgGas, tempR = 520) {
  if (p1Psia <= p2Psia) throw new Error('Upstream pressure must exceed downstream pressure');
  const dp = p1Psia - p2Psia;
  const denom = 1360 * Math.sqrt((dp * (p1Psia + p2Psia)) / (sgGas * tempR / 520));
  return flowScfh / denom;
}

/** Simplified steam Cv (non-choked, US units, lb/h):
 * Cv = W / (2.1 * sqrt(dP*(P1+P2)))   [approx., W in lb/h, P in psia]
 */
export function steamCv(flowLbH, p1Psia, p2Psia) {
  if (p1Psia <= p2Psia) throw new Error('Upstream pressure must exceed downstream pressure');
  const dp = p1Psia - p2Psia;
  return flowLbH / (2.1 * Math.sqrt(dp * (p1Psia + p2Psia)));
}

export function isChokedFlow(p1Psia, p2Psia) {
  // Rule-of-thumb critical pressure ratio check for preliminary screening
  return p2Psia < 0.5 * p1Psia;
}

/** Estimate valve travel % from installed characteristic (simplified, ideal curves) */
export function valveTravelPercent(flowPercent, characteristic = 'linear', rangeability = 30) {
  const x = Math.max(0, Math.min(100, flowPercent)) / 100;
  switch (characteristic) {
    case 'linear':
      return x * 100;
    case 'equal-percentage':
      return (Math.log(x * (rangeability - 1) + 1) / Math.log(rangeability)) * 100;
    case 'quick-opening':
      return Math.sqrt(x) * 100;
    default:
      throw new Error(`Unknown characteristic: ${characteristic}`);
  }
}

export function formulas() {
  return {
    liquidUS: 'Cv = Q(gpm) / √(ΔP(psi) / SG)',
    liquidMetric: 'Kv = Q(m³/h) · √(SG / ΔP(bar));  Cv = 1.156 · Kv',
    gasApprox: 'Cv ≈ Q(scfh) / [1360 · √(ΔP·(P1+P2) / SG)]  (non-choked, preliminary)',
    steamApprox: 'Cv ≈ W(lb/h) / [2.1 · √(ΔP·(P1+P2))]  (non-choked, preliminary)',
  };
}
