// Functional Safety / SIL Verification calculations per IEC 61508-6 Annex B
// simplified equations (low-demand mode). These are the standard textbook
// simplified formulas widely used for a first-pass PFDavg check; a full
// verification for an actual safety instrumented function should also
// confirm architectural constraints (SFF/HFT per IEC 61511 Route 1H/2H),
// systematic capability, and use manufacturer SIL-certified failure data.

export const SIL_TABLE = [
  { sil: 4, lo: 1e-5, hi: 1e-4, rrfLo: 10000, rrfHi: 100000 },
  { sil: 3, lo: 1e-4, hi: 1e-3, rrfLo: 1000, rrfHi: 10000 },
  { sil: 2, lo: 1e-3, hi: 1e-2, rrfLo: 100, rrfHi: 1000 },
  { sil: 1, lo: 1e-2, hi: 1e-1, rrfLo: 10, rrfHi: 100 },
];

/** Which SIL band (low-demand mode) a PFDavg falls into, or null if it
 * doesn't meet even SIL 1 (PFDavg >= 0.1). */
export function silForPfd(pfdAvg) {
  for (const row of SIL_TABLE) {
    if (pfdAvg >= row.lo && pfdAvg < row.hi) return row.sil;
  }
  if (pfdAvg < SIL_TABLE[0].lo) return 4; // better than the SIL 4 band's lower bound still reports as SIL 4 (IEC 61508 doesn't define bands above it)
  return 0; // PFDavg >= 0.1: does not meet SIL 1
}

/** PFDavg for a 1oo1 (single-channel, no redundancy) architecture. */
export function pfd1oo1({ lambdaDU, ti }) {
  return lambdaDU * ti / 2;
}

/** PFDavg for a 1oo2 (redundant, either channel can trip) architecture.
 * Independent-failure term uses the standard time-averaged (lambda*TI)^2/3
 * form; beta is the common-cause failure fraction (IEC 61508-6 Annex D),
 * which bypasses the redundancy since it fails both channels at once. */
export function pfd1oo2({ lambdaDU, ti, beta = 0 }) {
  const independent = Math.pow((1 - beta) * lambdaDU * ti, 2) / 3;
  const commonCause = beta * lambdaDU * ti / 2;
  return independent + commonCause;
}

/** PFDavg for a 2oo3 (two-out-of-three voting) architecture. */
export function pfd2oo3({ lambdaDU, ti, beta = 0 }) {
  const independent = Math.pow((1 - beta) * lambdaDU * ti, 2);
  const commonCause = beta * lambdaDU * ti / 2;
  return independent + commonCause;
}

const ARCHITECTURES = {
  '1oo1': { label: '1oo1 (single channel)', hft: 0, compute: pfd1oo1 },
  '1oo2': { label: '1oo2 (redundant, either trips)', hft: 1, compute: pfd1oo2 },
  '2oo3': { label: '2oo3 (voted redundancy)', hft: 1, compute: pfd2oo3 },
};

export { ARCHITECTURES };

/** Full subsystem PFDavg + SIL lookup for one architecture. lambdaDU is
 * per hour; ti (proof-test interval) is also in hours. beta (0-1) only
 * applies to 1oo2/2oo3. */
export function evaluateSubsystem({ architecture, lambdaDU, tiHours, beta = 0 }) {
  const arch = ARCHITECTURES[architecture];
  if (!arch) throw new Error(`Unknown architecture: ${architecture}`);
  if (lambdaDU < 0) throw new Error('Dangerous undetected failure rate cannot be negative.');
  if (tiHours <= 0) throw new Error('Proof test interval must be greater than zero.');
  if (beta < 0 || beta > 1) throw new Error('Beta (common cause factor) must be between 0 and 1.');
  const pfdAvg = arch.compute({ lambdaDU, ti: tiHours, beta });
  return { architecture, label: arch.label, hft: arch.hft, pfdAvg, sil: silForPfd(pfdAvg), rrf: pfdAvg > 0 ? 1 / pfdAvg : Infinity };
}

/** Combines sensor + logic solver + final element subsystem PFDavgs into
 * the overall SIF PFDavg (subsystems in series: probabilities simply add
 * for small values, the standard low-demand approximation) and looks up
 * the resulting achievable SIL. */
export function evaluateSIF(subsystems) {
  const totalPfd = subsystems.reduce((sum, s) => sum + s.pfdAvg, 0);
  return { totalPfd, sil: silForPfd(totalPfd), rrf: totalPfd > 0 ? 1 / totalPfd : Infinity };
}
