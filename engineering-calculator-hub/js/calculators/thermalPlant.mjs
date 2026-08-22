// thermalPlant.mjs — Thermal power plant performance ESTIMATOR.
//
// Design intent (per spec #20): engineering equations are separated from
// plant-specific assumptions. `defaultAssumptions()` returns typical values
// by plant type; the caller (UI) should let the user override every one of
// them before calculating, and the result must echo back which assumptions
// were used. Nothing here is a hardcoded "answer" — every output is derived
// from the equations below applied to the supplied assumptions.

export const UNIT_SIZES_MW = [25, 50, 100, 125, 200, 210, 250, 300, 500, 600, 660, 800, 1000];

export const PLANT_TYPES = ['subcritical', 'supercritical', 'ultra-supercritical', 'custom'];

/** Typical design steam conditions and efficiency ranges by plant type.
 * These are TYPICAL/INDICATIVE starting points, not guaranteed values —
 * always let the user override them with actual design data.
 *
 * NOTE on turbineEfficiencyPct: this represents the overall turbine-cycle
 * (Rankine cycle, thermal-to-mechanical) conversion efficiency at the given
 * steam conditions — not just blade/stage isentropic efficiency — because
 * that is the figure that actually drives plant heat rate. Typical values
 * are ~38-47% depending on steam conditions and reheat/regeneration design. */
export function defaultAssumptions(plantType = 'subcritical') {
  const table = {
    subcritical: {
      mainSteamPressureBar: 170, mainSteamTempC: 537, reheatTempC: 537,
      condenserPressureKPa: 10, feedwaterTempC: 240,
      boilerEfficiencyPct: 86, turbineEfficiencyPct: 40, generatorEfficiencyPct: 98.5,
      auxPowerPct: 8.5, fuelGcvKcalKg: 4200, fuelType: 'coal',
    },
    supercritical: {
      mainSteamPressureBar: 247, mainSteamTempC: 565, reheatTempC: 593,
      condenserPressureKPa: 8, feedwaterTempC: 275,
      boilerEfficiencyPct: 88, turbineEfficiencyPct: 43, generatorEfficiencyPct: 98.7,
      auxPowerPct: 7.5, fuelGcvKcalKg: 4200, fuelType: 'coal',
    },
    'ultra-supercritical': {
      mainSteamPressureBar: 290, mainSteamTempC: 600, reheatTempC: 620,
      condenserPressureKPa: 6, feedwaterTempC: 300,
      boilerEfficiencyPct: 90, turbineEfficiencyPct: 46, generatorEfficiencyPct: 98.9,
      auxPowerPct: 6.5, fuelGcvKcalKg: 4200, fuelType: 'coal',
    },
    custom: {
      mainSteamPressureBar: 170, mainSteamTempC: 537, reheatTempC: 537,
      condenserPressureKPa: 10, feedwaterTempC: 240,
      boilerEfficiencyPct: 86, turbineEfficiencyPct: 40, generatorEfficiencyPct: 98.5,
      auxPowerPct: 8.5, fuelGcvKcalKg: 4200, fuelType: 'coal',
    },
  };
  return table[plantType] ?? table.custom;
}

const KCAL_PER_KWH = 860.42; // thermodynamic equivalent, 1 kWh = 860.42 kcal

/**
 * Boiler duty per kg of steam (h_main_steam - h_feedwater), kcal/kg.
 * Correlation-based, calibrated at a reference feedwater temperature, then
 * corrected for actual feedwater temperature using cp_water ≈ 1 kcal/kg·°C.
 * Exported so other modules (e.g. the Flow Calculator) can reuse the exact
 * same boiler-duty model instead of re-deriving it. Not a substitute for
 * IAPWS-IF97 steam tables — see README "Engineering accuracy notes".
 */
export function estimateEnthalpyRiseKcalKg(mainSteamPressureBar, mainSteamTempC, feedwaterTempC) {
  const REF_FEEDWATER_TEMP_C = 240;
  const CP_WATER_KCAL_PER_KG_C = 1.0;
  const baseEnthalpyRiseKcalKg = 620 + (mainSteamTempC - 500) * 0.35 + (mainSteamPressureBar - 150) * 0.05;
  const feedwaterCorrectionKcalKg = (feedwaterTempC - REF_FEEDWATER_TEMP_C) * CP_WATER_KCAL_PER_KG_C;
  return Math.max(400, baseEnthalpyRiseKcalKg - feedwaterCorrectionKcalKg);
}

/**
 * Mode 1: Generated MW -> full parameter estimate.
 * All efficiencies chain multiplicatively to a plant (overall) efficiency,
 * from which heat rate, fuel flow, and steam flow are derived.
 */
export function fromGeneratedMW(grossMW, assumptions) {
  const {
    boilerEfficiencyPct, turbineEfficiencyPct, generatorEfficiencyPct,
    auxPowerPct, fuelGcvKcalKg, mainSteamPressureBar, mainSteamTempC,
    reheatTempC, condenserPressureKPa, feedwaterTempC,
  } = assumptions;

  const boilerEff = boilerEfficiencyPct / 100;
  const turbineEff = turbineEfficiencyPct / 100;
  const genEff = generatorEfficiencyPct / 100;
  const auxFrac = auxPowerPct / 100;

  const netMW = grossMW * (1 - auxFrac);
  const auxMW = grossMW - netMW;

  // Overall plant (cycle) efficiency = boiler * turbine * generator
  const plantEfficiency = boilerEff * turbineEff * genEff;
  if (plantEfficiency <= 0) throw new Error('Combined efficiency must be > 0');

  // Heat rate (gross), kcal/kWh = 860.42 / overall efficiency
  const grossHeatRateKcalKwh = KCAL_PER_KWH / plantEfficiency;
  // Net heat rate accounts for auxiliary consumption (net output is smaller for same fuel input)
  const netHeatRateKcalKwh = grossHeatRateKcalKwh / (1 - auxFrac);

  // Fuel heat input (kcal/h) = gross MW * 1000 kW/MW * grossHeatRate(kcal/kWh)
  const fuelHeatInputKcalH = grossMW * 1000 * grossHeatRateKcalKwh;
  const fuelFlowKgH = fuelHeatInputKcalH / fuelGcvKcalKg;
  const fuelFlowTh = fuelFlowKgH / 1000;

  // Boiler heat output = fuel heat input * boiler efficiency
  const boilerHeatOutputKcalH = fuelHeatInputKcalH * boilerEff;

  // Enthalpy rise (boiler duty per kg steam) = h_main_steam - h_feedwater.
  // Extracted into a shared, exported helper (estimateEnthalpyRiseKcalKg
  // below) so the Flow Calculator module can reuse the exact same
  // correlation instead of duplicating it — this call produces byte-for-byte
  // the same result as the inline formula it replaced.
  const approxEnthalpyRiseKcalKg = estimateEnthalpyRiseKcalKg(mainSteamPressureBar, mainSteamTempC, feedwaterTempC);
  const mainSteamFlowKgH = boilerHeatOutputKcalH / approxEnthalpyRiseKcalKg;
  const mainSteamFlowTh = mainSteamFlowKgH / 1000;
  const feedwaterFlowTh = mainSteamFlowTh * 1.02; // + ~2% for blowdown/spray, indicative

  // Specific fuel consumption (kg fuel / kWh, gross)
  const sfcKgPerKwh = fuelFlowKgH / (grossMW * 1000);

  // CO2 emission (indicative): coal ~ 2.42-2.86 kgCO2/kg fuel depending on carbon
  // content; using a representative factor for bituminous coal as a placeholder.
  const co2FactorKgPerKgFuel = assumptions.fuelType === 'gas' ? 2.75 : (assumptions.fuelType === 'oil' ? 3.15 : 2.42);
  const co2EmissionTh = (fuelFlowKgH * co2FactorKgPerKgFuel) / 1000;

  return {
    inputs: { grossMW, ...assumptions },
    grossGenerationMW: grossMW,
    netGenerationMW: round(netMW),
    auxiliaryPowerMW: round(auxMW),
    boilerLoadPct: 100, // by definition at this operating point (full duty for the given MW)
    mainSteamFlowTh: round(mainSteamFlowTh),
    feedwaterFlowTh: round(feedwaterFlowTh),
    mainSteamPressureBar,
    mainSteamTempC,
    reheatSteamPressureBar: round(mainSteamPressureBar * 0.22), // typical RH pressure ~20-25% of MS pressure
    reheatSteamTempC: reheatTempC,
    feedwaterTempC,
    condenserPressureKPa,
    fuelFlowTh: round(fuelFlowTh),
    fuelHeatInputKcalH: round(fuelHeatInputKcalH),
    boilerEfficiencyPct,
    turbineEfficiencyPct,
    generatorEfficiencyPct,
    plantEfficiencyPct: round(plantEfficiency * 100, 2),
    grossHeatRateKcalKwh: round(grossHeatRateKcalKwh),
    netHeatRateKcalKwh: round(netHeatRateKcalKwh),
    specificFuelConsumptionKgKwh: round(sfcKgPerKwh, 4),
    co2EmissionTh: round(co2EmissionTh),
    estimated: true,
  };
}

/** Mode 2: Fuel -> Generation */
export function fromFuel({ fuelFlowKgH, fuelGcvKcalKg, boilerEfficiencyPct, turbineEfficiencyPct, generatorEfficiencyPct, auxPowerPct }) {
  const boilerEff = boilerEfficiencyPct / 100;
  const turbineEff = turbineEfficiencyPct / 100;
  const genEff = generatorEfficiencyPct / 100;
  const auxFrac = auxPowerPct / 100;

  const thermalInputKcalH = fuelFlowKgH * fuelGcvKcalKg;
  const usefulBoilerHeatKcalH = thermalInputKcalH * boilerEff;
  const turbinePowerKcalH = usefulBoilerHeatKcalH * turbineEff;
  const generatorOutputKcalH = turbinePowerKcalH * genEff;
  const grossMW = generatorOutputKcalH / KCAL_PER_KWH / 1000;
  const auxMW = grossMW * auxFrac;
  const netMW = grossMW - auxMW;

  const plantEff = boilerEff * turbineEff * genEff;
  const heatRateKcalKwh = KCAL_PER_KWH / plantEff;
  const sfcKgPerKwh = fuelFlowKgH / (grossMW * 1000);

  return {
    thermalInputKcalH: round(thermalInputKcalH),
    usefulBoilerHeatKcalH: round(usefulBoilerHeatKcalH),
    grossMW: round(grossMW, 3),
    auxiliaryMW: round(auxMW, 3),
    netMW: round(netMW, 3),
    heatRateKcalKwh: round(heatRateKcalKwh),
    specificFuelConsumptionKgKwh: round(sfcKgPerKwh, 4),
    estimated: true,
  };
}

/**
 * Capacity-based efficiency trend adjustment. This encodes well-documented,
 * general industry patterns — NOT a live "lookup of all data in the world":
 * larger thermal units are consistently more efficient than smaller ones of
 * the same basic technology, because auxiliary/parasitic losses shrink as a
 * fraction of output, blade heights and reheat/regeneration staging that are
 * only economical at scale become feasible, and condenser/cooling systems
 * scale more efficiently. Returns a factor roughly in [-1, +1], referenced
 * at 300 MW (a common mid-size benchmark unit), using a log scale since the
 * efficiency gain from capacity flattens out at the high end.
 */
export function sizeAdjustmentFactor(mw) {
  const REF_MW = 300;
  const clamped = Math.max(25, Math.min(1000, mw));
  return Math.log(clamped / REF_MW) / Math.log(1000 / 25);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Plant-type defaults, refined by unit capacity. Plant type (subcritical /
 * supercritical / ultra-supercritical) still sets the primary efficiency
 * ceiling via steam conditions; capacity applies a secondary, bounded
 * adjustment on top of that, consistent with published heat-rate curves
 * (e.g. a 25 MW subcritical unit typically running well below a 1000 MW
 * ultra-supercritical unit's heat rate even accounting for plant type alone).
 */
export function sizeAdjustedDefaults(mw, plantType = 'subcritical') {
  const base = defaultAssumptions(plantType);
  const factor = sizeAdjustmentFactor(mw);
  return {
    ...base,
    turbineEfficiencyPct: clamp(base.turbineEfficiencyPct + factor * 4, 28, 48),
    boilerEfficiencyPct: clamp(base.boilerEfficiencyPct + factor * 2, 80, 91),
    generatorEfficiencyPct: clamp(base.generatorEfficiencyPct + factor * 0.6, 97, 99),
    auxPowerPct: clamp(base.auxPowerPct - factor * 2.5, 5, 11),
  };
}

function round(v, dp = 2) {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}
