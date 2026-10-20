/**
 * ISO 5167 differential-pressure flow metering (primary elements).
 *
 * Implements the discharge-coefficient and expansibility equations of
 *   ISO 5167-2 (orifice plate — Reader-Harris/Gallagher),
 *   ISO 5167-3 (ISA 1932 nozzle, long-radius nozzle, Venturi nozzle),
 *   ISO 5167-4 (classical Venturi tube),
 * the mass-flow equation of ISO 5167-1, thermal-expansion correction of the
 * bore and pipe, iterative Reynolds-dependent solution, limits-of-use checks and
 * a GUM-style uncertainty budget.
 *
 * SI units everywhere inside this module: metres, pascals, kg/m³, Pa·s, kg/s.
 * Pure functions; no DOM.
 */

export const ELEMENTS = {
  orifice_corner: { label: 'Orifice plate – corner taps', family: 'orifice', taps: 'corner' },
  orifice_flange: { label: 'Orifice plate – flange taps', family: 'orifice', taps: 'flange' },
  orifice_dd2:    { label: 'Orifice plate – D and D/2 taps', family: 'orifice', taps: 'D' },
  isa1932:        { label: 'ISA 1932 nozzle', family: 'nozzle' },
  long_radius:    { label: 'Long-radius nozzle', family: 'nozzle' },
  venturi_nozzle: { label: 'Venturi nozzle (ISO 5167-3)', family: 'nozzle' },
  venturi_cast:   { label: 'Classical Venturi – as-cast convergent', family: 'venturi', C: 0.984, uC: 0.7 },
  venturi_machined: { label: 'Classical Venturi – machined convergent', family: 'venturi', C: 0.995, uC: 1.0 },
  venturi_welded: { label: 'Classical Venturi – rough-welded convergent', family: 'venturi', C: 0.985, uC: 1.5 },
};

/** Typical linear thermal-expansion coefficients (1/K, 20 °C → T) — user must override for the real material. */
export const MATERIAL_ALPHA = {
  'Stainless steel 304/316 (typical)': 17.0e-6,
  'Carbon steel (typical)': 12.0e-6,
  '1.25Cr-0.5Mo / 2.25Cr-1Mo steel (typical)': 13.0e-6,
  'No correction': 0,
};

const SQRT_PI4 = Math.PI / 4;

/** Dimensions at flowing temperature: d = d20(1+α(T−20)). */
export function thermalDimensions({ d20, D20, tempC, alphaBore = 0, alphaPipe = 0 }) {
  return {
    d: d20 * (1 + alphaBore * (tempC - 20)),
    D: D20 * (1 + alphaPipe * (tempC - 20)),
  };
}

/** Reader-Harris/Gallagher (1998) orifice discharge coefficient, ISO 5167-2:2003. */
export function orificeC(D, d, ReD, taps) {
  const beta = d / D, b2 = beta * beta, b4 = b2 * b2, b8 = b4 * b4;
  let L1, L2p;
  if (taps === 'corner') { L1 = 0; L2p = 0; }
  else if (taps === 'flange') { L1 = L2p = 0.0254 / D; }
  else if (taps === 'D') { L1 = 1; L2p = 0.47; }
  else throw new Error('Unsupported tap arrangement.');
  const invRe = 1 / ReD;
  const A = Math.pow(19000 * beta * invRe, 0.8);
  const M2p = 2 * L2p / (1 - beta);
  const dCup = (0.043 + 0.080 * Math.exp(-10 * L1) - 0.123 * Math.exp(-7 * L1))
    * (1 - 0.11 * A) * b4 / (1 - b4);
  const t1 = Math.max(0, Math.log10(3700 * invRe)); // zero for Re_D > 3700 (always inside the ISO range)
  const dCdown = -0.031 * (M2p - 0.8 * Math.pow(M2p, 1.1)) * Math.pow(beta, 1.3) * (1 + 8 * t1);
  const t2 = Math.max(22.7 - 0.0047 * ReD, Math.pow(1e6 * invRe, 0.3));
  let C = 0.5961 + 0.0261 * b2 - 0.216 * b8
    + 0.000521 * Math.pow(1e6 * beta * invRe, 0.7)
    + (0.0188 + 0.0063 * A) * Math.pow(beta, 3.5) * t2
    + dCup + dCdown;
  if (D < 0.07112) C += 0.011 * (0.75 - beta) * (2.8 - D / 0.0254);
  return C;
}

/** Discharge coefficient for any catalogue element. */
export function dischargeCoefficient(element, D, d, ReD) {
  const el = ELEMENTS[element];
  if (!el) throw new Error('Unknown primary element.');
  const beta = d / D;
  switch (element) {
    case 'orifice_corner':
    case 'orifice_flange':
    case 'orifice_dd2':
      return orificeC(D, d, ReD, el.taps);
    case 'isa1932':
      return 0.9900 - 0.2262 * Math.pow(beta, 4.1)
        - (0.00175 * beta * beta - 0.0033 * Math.pow(beta, 4.15)) * Math.pow(1e6 / ReD, 1.15);
    case 'long_radius':
      return 0.9965 - 0.00653 * Math.sqrt(beta) * Math.sqrt(1e6 / ReD);
    case 'venturi_nozzle':
      return 0.9858 - 0.196 * Math.pow(beta, 4.5);
    default:
      return el.C;
  }
}

/** Expansibility factor ε (1 for incompressible liquids). p1, p2 absolute (Pa), kappa isentropic exponent. */
export function expansibility(element, D, d, p1, p2, kappa) {
  const el = ELEMENTS[element];
  const beta = d / D, b4 = Math.pow(beta, 4);
  const tau = p2 / p1;
  if (!(tau > 0 && tau <= 1)) throw new Error('Downstream pressure must be positive and not above the upstream pressure.');
  if (tau === 1) return 1;
  if (el.family === 'orifice') {
    return 1 - (0.351 + 0.256 * b4 + 0.93 * b4 * b4) * (1 - Math.pow(tau, 1 / kappa));
  }
  const t2k = Math.pow(tau, 2 / kappa);
  const term1 = kappa * t2k / (kappa - 1);
  const term2 = (1 - b4) / (1 - b4 * t2k);
  const term3 = (1 - Math.pow(tau, (kappa - 1) / kappa)) / (1 - tau);
  return Math.sqrt(term1 * term2 * term3);
}

/** ISO 5167-1 mass flow for given C, ε. */
export function massFlowEquation({ C, eps, D, d, dp, rho }) {
  const b4 = Math.pow(d / D, 4);
  return C / Math.sqrt(1 - b4) * eps * SQRT_PI4 * d * d * Math.sqrt(2 * dp * rho);
}

/** Limits-of-use warnings (descriptive strings). */
export function limitsOfUse({ element, D, d, ReD, p1, p2 }) {
  const w = [];
  const beta = d / D, Dmm = D * 1000, dmm = d * 1000;
  const rng = (name, v, lo, hi, unit = '') => {
    if (v < lo || v > hi) w.push(`${name} = ${v.toPrecision(4)}${unit} is outside the ISO range ${lo}–${hi}${unit}.`);
  };
  switch (element) {
    case 'orifice_corner':
    case 'orifice_flange':
    case 'orifice_dd2':
      rng('Bore d', dmm, 12.5, Infinity, ' mm'); rng('Pipe D', Dmm, 50, 1000, ' mm'); rng('β', beta, 0.1, 0.75);
      if (ReD < 5000 || ReD < 170 * beta * beta * Dmm) w.push(`Pipe Reynolds number ${ReD.toExponential(2)} is below the ISO minimum (5000 and 170·β²·D[mm] = ${(170 * beta * beta * Dmm).toFixed(0)}).`);
      break;
    case 'isa1932':
      rng('Pipe D', Dmm, 50, 500, ' mm'); rng('β', beta, 0.3, 0.8);
      if (beta < 0.44) rng('Re_D', ReD, 7e4, 1e7); else rng('Re_D', ReD, 2e4, 1e7);
      break;
    case 'long_radius':
      rng('Pipe D', Dmm, 50, 630, ' mm'); rng('β', beta, 0.2, 0.8); rng('Re_D', ReD, 1e4, 1e7);
      break;
    case 'venturi_nozzle':
      rng('Pipe D', Dmm, 65, 500, ' mm'); rng('β', beta, 0.316, 0.775); rng('Re_D', ReD, 1.5e5, 2e6);
      if (dmm < 50) w.push('Throat diameter is below 50 mm (ISO minimum).');
      break;
    case 'venturi_cast':
      rng('Pipe D', Dmm, 100, 800, ' mm'); rng('β', beta, 0.3, 0.75); rng('Re_D', ReD, 2e5, 2e6);
      break;
    case 'venturi_machined':
      rng('Pipe D', Dmm, 50, 250, ' mm'); rng('β', beta, 0.4, 0.75); rng('Re_D', ReD, 2e5, 1e6);
      break;
    case 'venturi_welded':
      rng('Pipe D', Dmm, 200, 1200, ' mm'); rng('β', beta, 0.4, 0.7); rng('Re_D', ReD, 2e5, 2e6);
      break;
  }
  if (p2 / p1 < 0.75) w.push(`p2/p1 = ${(p2 / p1).toFixed(3)} is below 0.75 — outside the ISO range for the expansibility equations.`);
  return w;
}

/** Relative expanded uncertainty (%) of C as given by ISO 5167 (95 %). */
export function dischargeUncertaintyPct(element, beta) {
  const el = ELEMENTS[element];
  if (el.family === 'orifice') {
    if (beta <= 0.2) return 0.7 - beta;
    if (beta < 0.6) return 0.5;
    return 1.667 * beta - 0.5;
  }
  if (element === 'isa1932') return beta < 0.6 ? 0.8 : 2 * beta - 0.4;
  if (element === 'long_radius') return 2.0;
  if (element === 'venturi_nozzle') return 1.2 + 1.5 * Math.pow(beta, 4);
  return el.uC;
}

/**
 * Forward problem: mass flow from measured Δp.
 * input: { element, D20, d20, tempC, alphaBore, alphaPipe, p1Pa, dpPa, rho, mu, kappa, liquid }
 */
export function solveFlow(inp) {
  const { element, p1Pa, dpPa, rho, mu, kappa } = inp;
  if (!(dpPa > 0)) throw new Error('Differential pressure must be greater than zero.');
  if (!(p1Pa > 0 && dpPa < p1Pa)) throw new Error('Differential pressure must be smaller than the upstream absolute pressure.');
  if (!(rho > 0 && mu > 0)) throw new Error('Density and viscosity must be positive.');
  const { d, D } = thermalDimensions(inp);
  const beta = d / D;
  if (!(beta > 0.05 && beta < 0.9)) throw new Error(`β = ${beta.toFixed(3)} is not a valid diameter ratio.`);
  const eps = inp.liquid ? 1 : expansibility(element, D, d, p1Pa, p1Pa - dpPa, kappa);
  let qm = massFlowEquation({ C: 0.6, eps, D, d, dp: dpPa, rho });
  let C = 0.6, iter = 0;
  for (; iter < 200; iter++) {
    const ReD = 4 * qm / (Math.PI * D * mu);
    C = dischargeCoefficient(element, D, d, ReD);
    const next = massFlowEquation({ C, eps, D, d, dp: dpPa, rho });
    if (Math.abs(next - qm) <= 1e-13 * next) { qm = next; break; }
    qm = next;
  }
  const ReD = 4 * qm / (Math.PI * D * mu);
  const unc = uncertainty({ ...inp, element, D, d, C, eps, dpPa, p1Pa });
  const loss = permanentLoss(element, beta, C, dpPa);
  return {
    dpPa, massFlowKgS: qm, C, epsilon: eps, ReD, beta, dBore: d, dPipe: D, iterations: iter + 1,
    volumeFlowM3S: qm / rho, velocityPipeMs: qm / (rho * Math.PI * D * D / 4),
    permanentLossPa: loss.pa, permanentLossNote: loss.note,
    warnings: limitsOfUse({ element, D, d, ReD, p1: p1Pa, p2: p1Pa - dpPa }),
    uncertainty: unc,
  };
}

/** Inverse: Δp needed for a given mass flow (bisection on Δp). */
export function solveDP(inp) {
  const { qmKgS, p1Pa } = inp;
  if (!(qmKgS > 0)) throw new Error('Mass flow must be greater than zero.');
  let lo = 1e-6, hi = 0.749 * p1Pa;
  const f = (dp) => solveFlow({ ...inp, dpPa: dp }).massFlowKgS - qmKgS;
  if (f(hi) < 0) throw new Error('Required Δp would exceed 25 % of the upstream pressure — choose a larger bore.');
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) hi = mid; else lo = mid;
    if (hi - lo < 1e-12 * hi) break;
  }
  return solveFlow({ ...inp, dpPa: 0.5 * (lo + hi) });
}

/** Inverse: cold (20 °C) bore for a given flow and Δp (bisection on β). */
export function solveBore(inp) {
  const { qmKgS } = inp;
  const f = (d20) => solveFlow({ ...inp, d20 }).massFlowKgS - qmKgS;
  let lo = 0.1 * inp.D20, hi = 0.8 * inp.D20;
  if (f(lo) > 0) throw new Error('Even the smallest bore (β = 0.10) passes more than the target flow at this Δp.');
  if (f(hi) < 0) throw new Error('Even β = 0.80 cannot pass the target flow at this Δp — use a higher Δp or a larger pipe.');
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) hi = mid; else lo = mid;
    if (hi - lo < 1e-14) break;
  }
  const d20 = 0.5 * (lo + hi);
  return { d20, ...solveFlow({ ...inp, d20 }) };
}

/** Permanent pressure loss. Orifice: ISO 5167-2 exact formula. Others: ISO guidance ranges. */
export function permanentLoss(element, beta, C, dp) {
  const el = ELEMENTS[element];
  if (el.family === 'orifice') {
    const b4 = Math.pow(beta, 4), b2 = beta * beta;
    const s = Math.sqrt(1 - b4 * (1 - C * C));
    return { pa: (s - C * b2) / (s + C * b2) * dp, note: 'ISO 5167-2 formula' };
  }
  if (el.family === 'venturi') return { pa: 0.10 * dp, note: 'typical 5–20 % of Δp for a 7°–15° diffuser (guidance)' };
  return { pa: (1 - Math.pow(beta, 1.9)) * dp, note: 'rough estimate (1 − β^1.9)·Δp — ISO gives no formula for nozzles' };
}

/**
 * GUM uncertainty budget. Input uncertainties are relative expanded (95 %, %) values:
 * uD, ud, uDp, uRho (defaults 0). Returns relative expanded uncertainty of the mass flow (%).
 */
export function uncertainty(a) {
  const { element, D, d, dpPa, p1Pa } = a;
  const beta = d / D, b4 = Math.pow(beta, 4);
  const uC = dischargeUncertaintyPct(element, beta);
  const liquid = !!a.liquid;
  const uEps = liquid ? 0 : (ELEMENTS[element].family === 'orifice' ? 4 : 2) * dpPa / p1Pa;
  const sD = 2 * b4 / (1 - b4), sd = 2 / (1 - b4);
  const parts = {
    discharge: uC,
    expansibility: uEps,
    pipeDiameter: sD * (a.uDpct ?? 0),
    boreDiameter: sd * (a.udPct ?? 0),
    differentialPressure: 0.5 * (a.uDpPct ?? 0),
    density: 0.5 * (a.uRhoPct ?? 0),
  };
  const total = Math.sqrt(Object.values(parts).reduce((s, v) => s + v * v, 0));
  return { parts, totalPct: total };
}
