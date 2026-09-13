// Power plant operational calculations: boiler blowdown rate and cooling
// tower thermal performance -- both genuinely daily-use calculations for
// power plant operators and engineers, distinct from the design-stage
// Thermal Plant Estimator elsewhere in this app.

/** Boiler blowdown rate from steam generation rate and feedwater/boiler
 * water TDS limits. Standard mass-balance formula (conservation of
 * dissolved solids): the TDS entering with feedwater must equal the TDS
 * leaving with blowdown once the boiler is at steady-state TDS. */
export function boilerBlowdownRate({ steamRateKgH, feedwaterTdsPpm, maxBoilerTdsPpm }) {
  if (steamRateKgH <= 0) throw new Error('Steam generation rate must be greater than zero.');
  if (feedwaterTdsPpm < 0 || maxBoilerTdsPpm < 0) throw new Error('TDS values cannot be negative.');
  if (maxBoilerTdsPpm <= feedwaterTdsPpm) throw new Error('Maximum allowable boiler water TDS must be greater than the feedwater TDS \u2014 otherwise no amount of blowdown can control it.');
  const blowdownKgH = (steamRateKgH * feedwaterTdsPpm) / (maxBoilerTdsPpm - feedwaterTdsPpm);
  const blowdownPct = (blowdownKgH / steamRateKgH) * 100;
  const cyclesOfConcentration = maxBoilerTdsPpm / feedwaterTdsPpm;
  return { blowdownKgH, blowdownPct, cyclesOfConcentration };
}

/** Cooling tower thermal performance: range, approach, and effectiveness
 * (also called cooling tower efficiency) against the ambient wet-bulb
 * temperature -- the true thermodynamic limit an evaporative tower can
 * approach but never reach or beat. */
export function coolingTowerPerformance({ hotWaterInC, coldWaterOutC, wetBulbC }) {
  if (coldWaterOutC >= hotWaterInC) throw new Error('Cold water (leaving) temperature must be lower than hot water (entering) temperature.');
  if (coldWaterOutC < wetBulbC) throw new Error('Leaving water temperature cannot be below the wet-bulb temperature \u2014 that is the thermodynamic limit of evaporative cooling, so check the inputs.');
  const range = hotWaterInC - coldWaterOutC;
  const approach = coldWaterOutC - wetBulbC;
  const effectivenessPct = (range / (range + approach)) * 100;
  return { range, approach, effectivenessPct };
}
