// orifice.mjs — orifice plate flow calculation, simplified ISO 5167 form.
// This is an engineering ESTIMATE using a constant discharge coefficient.
// For custody-transfer or design-grade sizing, use full ISO 5167 iterative
// Cd/epsilon correlations and a certified sizing tool.

const PI = Math.PI;

/** Beta ratio = orifice bore / pipe internal diameter */
export function betaRatio(boreD, pipeD) {
  if (pipeD <= 0) throw new Error('Pipe diameter must be > 0');
  return boreD / pipeD;
}

/**
 * Volumetric flow through a square-edged concentric orifice (incompressible fluid).
 * Q = C * E * (pi/4) * d^2 * sqrt(2*dP / rho)
 * where E = 1/sqrt(1 - beta^4) is the velocity-of-approach factor.
 * @param dBoreM orifice bore diameter, m
 * @param pipeDM pipe internal diameter, m
 * @param dpPa differential pressure, Pa
 * @param densityKgM3 fluid density at flowing conditions, kg/m3
 * @param Cd discharge coefficient (default 0.6, typical for square-edged orifice, high Re)
 */
export function volumetricFlow(dBoreM, pipeDM, dpPa, densityKgM3, Cd = 0.6) {
  if (dpPa < 0) throw new Error('Differential pressure cannot be negative');
  if (densityKgM3 <= 0) throw new Error('Density must be > 0');
  const beta = betaRatio(dBoreM, pipeDM);
  if (beta <= 0 || beta >= 1) throw new Error('Beta ratio must be between 0 and 1');
  const E = 1 / Math.sqrt(1 - Math.pow(beta, 4));
  const area = (PI / 4) * dBoreM * dBoreM;
  const q = Cd * E * area * Math.sqrt((2 * dpPa) / densityKgM3); // m3/s
  return q;
}

export function massFlow(dBoreM, pipeDM, dpPa, densityKgM3, Cd = 0.6) {
  const qM3s = volumetricFlow(dBoreM, pipeDM, dpPa, densityKgM3, Cd);
  return qM3s * densityKgM3; // kg/s
}

/** Reynolds number: Re = 4 * massFlowKgS / (pi * mu * pipeDM) */
export function reynoldsNumber(massFlowKgS, pipeDM, viscosityPaS) {
  if (viscosityPaS <= 0) throw new Error('Viscosity must be > 0');
  return (4 * massFlowKgS) / (PI * viscosityPaS * pipeDM);
}

/** Solve required bore diameter for a target volumetric flow (m3/s), iterative
 * because E depends on beta which depends on bore. Converges quickly. */
export function boreForFlow(targetQM3s, pipeDM, dpPa, densityKgM3, Cd = 0.6) {
  if (targetQM3s <= 0) throw new Error('Target flow must be > 0');
  let bore = pipeDM * 0.5; // initial guess, beta = 0.5
  for (let i = 0; i < 50; i++) {
    const beta = betaRatio(bore, pipeDM);
    const E = 1 / Math.sqrt(1 - Math.pow(beta, 4));
    const area = (targetQM3s) / (Cd * E * Math.sqrt((2 * dpPa) / densityKgM3));
    const newBore = Math.sqrt((4 * area) / PI);
    if (Math.abs(newBore - bore) < 1e-9) {
      bore = newBore;
      break;
    }
    bore = newBore;
  }
  if (bore >= pipeDM) {
    throw new Error('No physical solution: required bore exceeds pipe diameter — increase DP or reduce flow');
  }
  return bore;
}

export function formula() {
  return 'Q = Cd · E · (π/4)·d² · √(2·ΔP/ρ),  E = 1/√(1−β⁴),  β = d/D';
}
