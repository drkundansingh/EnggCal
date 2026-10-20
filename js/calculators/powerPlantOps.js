// Power plant operational calculations: boiler blowdown rate, cooling
// tower thermal performance, daily MIS performance indicators, cooling
// tower water balance, feedwater heater performance, DM plant resin
// regeneration frequency, coal/fuel handling, and combustion emission
// rate -- all genuinely daily-use calculations for power plant operators,
// shift engineers, water treatment chemists, and fuel/commercial staff,
// distinct from the design-stage Thermal Plant Estimator elsewhere in
// this app.

import { tsat } from './steamTable.js';

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

/** Daily/period plant performance indicators, the standard set every
 * thermal station reports in its shift log and MIS return: Plant Load
 * Factor (PLF), Plant Availability Factor (PAF), Auxiliary Power
 * Consumption (APC%), and -- where fuel consumption is supplied --
 * Specific Coal/Oil Consumption. Every figure here is a direct ratio of
 * measured quantities (no assumed coefficient anywhere), so accuracy
 * depends only on the accuracy of the metered inputs.
 *
 * PLF follows the CEA (Central Electricity Authority, India) convention
 * of using GROSS generation against installed capacity -- some
 * utilities instead track PLF on a net basis; if that is your plant's
 * convention, pass net generation in place of gross. */
export function plantPerformanceIndicators({ installedCapacityMW, periodHours, grossGenerationMWh, netGenerationMWh, hoursAvailable, coalConsumedT, oilConsumedKL }) {
  if (installedCapacityMW <= 0) throw new Error('Installed capacity must be greater than zero.');
  if (periodHours <= 0) throw new Error('Period (hours) must be greater than zero.');
  if (grossGenerationMWh < 0 || netGenerationMWh < 0) throw new Error('Generation cannot be negative.');
  if (netGenerationMWh > grossGenerationMWh) throw new Error('Net generation cannot exceed gross generation — auxiliary power consumption cannot be negative.');
  if (hoursAvailable < 0 || hoursAvailable > periodHours) throw new Error('Hours available must be between 0 and the period length.');

  const auxEnergyMWh = grossGenerationMWh - netGenerationMWh;
  const apcPct = grossGenerationMWh > 0 ? (auxEnergyMWh / grossGenerationMWh) * 100 : 0;
  const plfPct = (grossGenerationMWh / (installedCapacityMW * periodHours)) * 100;
  const pafPct = (hoursAvailable / periodHours) * 100;

  let sccKgKwh = null;
  if (coalConsumedT !== undefined && coalConsumedT !== null && coalConsumedT !== '') {
    if (coalConsumedT < 0) throw new Error('Coal consumed cannot be negative.');
    if (netGenerationMWh <= 0) throw new Error('Net generation must be greater than zero to compute specific coal consumption.');
    sccKgKwh = coalConsumedT / netGenerationMWh; // (t × 1000 kg/t) / (MWh × 1000 kWh/MWh) = t/MWh, numerically identical to kg/kWh
  }
  let socMlKwh = null;
  if (oilConsumedKL !== undefined && oilConsumedKL !== null && oilConsumedKL !== '') {
    if (oilConsumedKL < 0) throw new Error('Oil consumed cannot be negative.');
    if (netGenerationMWh <= 0) throw new Error('Net generation must be greater than zero to compute specific oil consumption.');
    socMlKwh = (oilConsumedKL * 1000) / netGenerationMWh; // (kL × 1,000,000 mL/kL) / (MWh × 1000 kWh/MWh) = kL×1000/MWh, in mL/kWh
  }

  return { auxEnergyMWh, apcPct, plfPct, pafPct, sccKgKwh, socMlKwh };
}

/** Cooling tower water balance: makeup water demand from evaporation,
 * drift, and blowdown -- the three losses a circulating water system
 * must replace. Evaporation is derived from a genuine heat balance
 * (heat rejected ÷ latent heat of vaporization), not an empirical
 * correlation, so its accuracy depends only on the stated latent-heat
 * assumption (adjustable -- the default is a typical value across the
 * ~25–45°C range most cooling towers actually operate in; the true
 * value varies a few percent with actual water temperature). Blowdown
 * then follows the SAME dissolved-solids mass balance already used by
 * the Boiler Blowdown Rate calculator, generalized to also carry off
 * drift's share of solids. */
export function coolingTowerMakeupWater({ circulatingWaterFlowM3H, rangeC, cyclesOfConcentration, driftLossPct = 0.01, latentHeatKcalKg = 580 }) {
  if (circulatingWaterFlowM3H <= 0) throw new Error('Circulating water flow must be greater than zero.');
  if (rangeC <= 0) throw new Error('Range (temperature drop across the tower) must be greater than zero.');
  if (cyclesOfConcentration <= 1) throw new Error('Cycles of concentration must be greater than 1 — at exactly 1, blowdown would need to be infinite to hold circulating water TDS steady.');
  if (driftLossPct < 0) throw new Error('Drift loss cannot be negative.');
  if (latentHeatKcalKg <= 0) throw new Error('Latent heat of vaporization must be greater than zero.');

  const circulatingWaterFlowKgH = circulatingWaterFlowM3H * 1000; // water density ≈ 1000 kg/m³
  const evaporationLossKgH = (circulatingWaterFlowKgH * rangeC) / latentHeatKcalKg; // heat rejected (kcal/h, Cp=1 kcal/kg°C) ÷ latent heat (kcal/kg)
  const driftLossKgH = circulatingWaterFlowKgH * (driftLossPct / 100);
  // Dissolved-solids mass balance: Makeup×C_m = (Blowdown+Drift)×C_cw, with
  // C_cw = COC×C_m and Makeup = Evaporation+Drift+Blowdown, solved for Blowdown.
  const blowdownKgH = evaporationLossKgH / (cyclesOfConcentration - 1) - driftLossKgH;
  if (blowdownKgH < 0) throw new Error('Drift loss alone already exceeds what this cycles-of-concentration limit allows — increase cycles of concentration or reduce drift loss.');
  const makeupKgH = evaporationLossKgH + driftLossKgH + blowdownKgH;
  const toM3H = (kgH) => kgH / 1000;
  return {
    evaporationLossKgH, driftLossKgH, blowdownKgH, makeupKgH,
    evaporationLossM3H: toM3H(evaporationLossKgH), driftLossM3H: toM3H(driftLossKgH), blowdownM3H: toM3H(blowdownKgH), makeupM3H: toM3H(makeupKgH),
  };
}

/** Feedwater heater performance: Terminal Temperature Difference (TTD)
 * and Drain Cooler Approach (DCA), the two numbers a heater's
 * performance is monitored against on every real DCS/shift log. TTD
 * uses the SAME IAPWS-IF97 saturation-temperature routine already
 * verified for the Steam Properties calculator elsewhere in this app,
 * not a separate/independent implementation. Rising TTD over time
 * (extraction steam pressure and feedwater outlet unchanged) indicates
 * tube-side fouling or heater flooding; rising DCA indicates a
 * degraded drain cooling zone. */
export function feedwaterHeaterPerformance({ extractionSteamPressureBar, feedwaterOutletTempC, feedwaterInletTempC, drainOutletTempC }) {
  if (extractionSteamPressureBar <= 0) throw new Error('Extraction steam pressure must be greater than zero.');
  const satTempC = tsat(extractionSteamPressureBar / 10) - 273.15; // tsat() takes MPa and returns K
  const ttdC = satTempC - feedwaterOutletTempC;
  const dcaC = drainOutletTempC - feedwaterInletTempC;
  return { satTempC, ttdC, dcaC };
}

/** DM (demineralized water) plant softener/cation resin bed run length
 * before regeneration is required, from a straight hardness-load mass
 * balance: how much dissolved hardness (as CaCO₃) the resin can hold,
 * divided by how fast raw water delivers hardness to it. The same
 * "throughput between regenerations" every DM plant/water treatment
 * operator schedules regeneration shifts around. */
export function resinBedRegenerationFrequency({ resinVolumeM3, exchangeCapacityKgM3AsCaCO3, rawWaterFlowM3H, rawWaterHardnessPpm }) {
  if (resinVolumeM3 <= 0) throw new Error('Resin bed volume must be greater than zero.');
  if (exchangeCapacityKgM3AsCaCO3 <= 0) throw new Error('Resin exchange capacity must be greater than zero.');
  if (rawWaterFlowM3H <= 0) throw new Error('Raw water flow must be greater than zero.');
  if (rawWaterHardnessPpm <= 0) throw new Error('Raw water hardness must be greater than zero.');

  const totalCapacityG = exchangeCapacityKgM3AsCaCO3 * 1000 * resinVolumeM3; // kg/m³ × 1000 g/kg × m³ = g (as CaCO3)
  const hardnessLoadGH = rawWaterFlowM3H * rawWaterHardnessPpm; // m³/h × mg/L(=g/m³) = g/h
  const runHours = totalCapacityG / hardnessLoadGH;
  const throughputM3 = runHours * rawWaterFlowM3H;
  return { totalCapacityG, hardnessLoadGH, runHours, throughputM3 };
}

/** Gross (GCV) to Net (NCV) calorific value conversion for solid/liquid
 * fuels: NCV is GCV less the latent heat carried away as unrecovered
 * water vapor -- both the fuel's own inherent moisture, and the water
 * formed by combustion of its hydrogen content (each kg of hydrogen
 * burns to 9 kg of water). The latent heat figure is stated explicitly
 * and adjustable rather than buried in a fixed constant, since it is
 * itself a reference-condition convention, not a universal physical
 * constant. */
export function gcvToNcv({ gcvKcalKg, hydrogenPct, moisturePct, latentHeatKcalKg = 584.9 }) {
  if (gcvKcalKg <= 0) throw new Error('GCV must be greater than zero.');
  if (hydrogenPct < 0 || moisturePct < 0) throw new Error('Hydrogen % and moisture % cannot be negative.');
  const totalWaterFractionPct = moisturePct + 9 * hydrogenPct;
  const ncvKcalKg = gcvKcalKg - latentHeatKcalKg * (totalWaterFractionPct / 100);
  return { ncvKcalKg, totalWaterFractionPct };
}

/** Daily coal (or other solid fuel) requirement and remaining stock
 * cover, from specific coal consumption and net generation — the same
 * SCC the Plant Performance Indicators calculator above produces, so
 * the two are meant to be used together (SCC from a completed period,
 * applied here to plan the next one). Pure unit-rate arithmetic, no
 * assumed coefficients. */
export function coalRequirementAndStock({ sccKgKwh, netGenerationMWh, currentStockT }) {
  if (sccKgKwh <= 0) throw new Error('Specific coal consumption must be greater than zero.');
  if (netGenerationMWh < 0) throw new Error('Net generation cannot be negative.');
  if (currentStockT < 0) throw new Error('Current stock cannot be negative.');
  const coalRequiredT = sccKgKwh * netGenerationMWh; // kg/kWh × MWh(=1000 kWh) / 1000 kg/t — the two factors of 1000 cancel
  const daysOfCover = coalRequiredT > 0 ? currentStockT / coalRequiredT : Infinity;
  return { coalRequiredT, daysOfCover };
}

/** Combustion-derived CO2 and SO2 emission rate from fuel ultimate
 * analysis (carbon and sulfur content) and fuel firing rate — exact
 * stoichiometric mass ratios (complete combustion: C+O2→CO2,
 * S+O2→SO2), the same molecular-weight ratios (44/12 and 64/32)
 * already used internally by the Boiler Efficiency (Indirect Method)
 * calculator's combustion mass balance elsewhere in this app, surfaced
 * here as a standalone emission-rate figure. Deliberately does NOT
 * attempt to calculate NOx or particulate (SPM) emissions: unlike CO2/SO2,
 * those depend on combustion technology, flame temperature, staging, and
 * pollution-control equipment (ESP, FGD, SCR/SNCR) rather than fuel
 * composition alone, so a fuel-analysis calculation cannot honestly
 * produce them — real plants measure NOx/SPM directly with a CEMS
 * (Continuous Emission Monitoring System), not by calculation. */
export function combustionEmissionRate({ fuelFlowTh, carbonPct, sulfurPct }) {
  if (fuelFlowTh <= 0) throw new Error('Fuel flow must be greater than zero.');
  if (carbonPct < 0 || sulfurPct < 0) throw new Error('Carbon % and sulfur % cannot be negative.');
  const co2EmissionTh = fuelFlowTh * (carbonPct / 100) * (44 / 12);
  const so2EmissionTh = fuelFlowTh * (sulfurPct / 100) * (64 / 32);
  return { co2EmissionTh, so2EmissionTh };
}
