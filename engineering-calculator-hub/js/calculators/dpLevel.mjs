// dpLevel.mjs — DP flow relationship and hydrostatic / DP level calculations.

/** Flow is proportional to sqrt(DP): flow% = sqrt(DP%) for a linear DP transmitter
 *  with square-root extraction, scaled against a reference max flow at max DP. */
export function flowFromDP(dp, dpMax, flowMax) {
  if (dpMax <= 0) throw new Error('dpMax must be > 0');
  if (dp < 0) throw new Error('dp cannot be negative');
  return flowMax * Math.sqrt(dp / dpMax);
}

export function dpFromFlow(flow, flowMax, dpMax) {
  if (flowMax <= 0) throw new Error('flowMax must be > 0');
  const ratio = flow / flowMax;
  return dpMax * ratio * ratio;
}

/** Hydrostatic pressure from a liquid column: P = rho * g * h */
export function hydrostaticPressurePa(densityKgM3, heightM, g = 9.80665) {
  return densityKgM3 * g * heightM;
}

export function levelFromHydrostaticPressure(pressurePa, densityKgM3, g = 9.80665) {
  if (densityKgM3 <= 0) throw new Error('Density must be > 0');
  return pressurePa / (densityKgM3 * g);
}

/** Open tank DP level transmitter (LP leg vented to atmosphere):
 * Level = DP / (rho * g)
 */
export function openTankLevel(dpPa, densityKgM3, g = 9.80665) {
  return dpPa / (densityKgM3 * g);
}

/** Closed tank with wet leg: DP = rho_process*g*h - rho_wetleg*g*H_wetleg (elevated dry-leg
 * transmitter case). Provide wet-leg height (fixed, fill height) and process density.
 */
export function closedTankWetLegLevel(dpPa, processDensity, wetLegDensity, wetLegHeightM, g = 9.80665) {
  const wetLegPressure = wetLegDensity * g * wetLegHeightM;
  return (dpPa + wetLegPressure) / (processDensity * g);
}

/** Density-compensated interface level for two liquids of different density */
export function interfaceLevel(dpPa, totalHeightM, densityLight, densityHeavy, g = 9.80665) {
  // Simplified two-liquid interface: DP = g*(densityHeavy*h_heavy + densityLight*(H-h_heavy))
  // Solve for h_heavy (height of heavy/lower liquid from the bottom tap)
  const num = dpPa - densityLight * g * totalHeightM;
  const den = g * (densityHeavy - densityLight);
  if (den === 0) throw new Error('Densities must differ for interface calculation');
  return num / den;
}

export function levelPercent(levelValue, minLevel, maxLevel) {
  if (maxLevel === minLevel) throw new Error('maxLevel and minLevel cannot be equal');
  return ((levelValue - minLevel) / (maxLevel - minLevel)) * 100;
}
