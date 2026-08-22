// thermalPlantAdvanced.mjs — flexible, partial-input thermal plant estimator.
//
// This is ADDITIVE to thermalPlant.mjs (Mode 1 "MW → Parameters" and Mode 2
// "Fuel → Generation" are untouched). This module implements a third mode:
// the user supplies ANY subset of available operating parameters, and a
// forward-chaining engineering solver (mass balance / energy balance /
// standard combustion & thermodynamic relationships) derives everything it
// can from what was actually given, before falling back to configurable
// plant-type assumptions for anything left unresolved.
//
// Every output carries one of five statuses so nothing is ever presented as
// more certain than it is:
//   Measured   — the user entered this value directly.
//   Calculated — derived from Measured/Calculated inputs via a direct
//                physical law or mass/energy balance (no assumption used).
//   Estimated  — derived from Measured/Calculated inputs PLUS a configurable
//                engineering assumption (a ratio, coefficient, or typical
//                split) — one hop away from real plant data.
//   Simulated  — derived by the same rules, but the chain also passes
//                through at least one Estimated/Simulated/Predicted value —
//                i.e. a modeled result, not a one-hop estimate.
//   Predicted  — no rule could derive it from anything the user entered, so
//                it's a typical/statistical value for a plant of this type,
//                size, and boiler configuration (a lookup, not a calculation).
//
// Nothing here is a hardcoded "answer" for a specific plant — Predicted
// values come from `defaultAdvancedConfig()`, which the caller/UI should let
// the user override, exactly like Mode 1/2's assumptions.

import { defaultAssumptions, PLANT_TYPES, sizeAdjustedDefaults } from './thermalPlant.mjs';

export { PLANT_TYPES };
export const BOILER_TYPES = ['drum', 'once-through'];

const KCAL_PER_KWH = 860.42;

/** Human-readable label + unit for every parameter this solver knows about.
 * Drives both the input form and the result table in the UI. */
export const PARAM_META = {
  grossMW: { label: 'Gross generation', unit: 'MW' },
  netMW: { label: 'Net generation', unit: 'MW' },
  auxMW: { label: 'Auxiliary power', unit: 'MW' },
  auxPowerPct: { label: 'Auxiliary power', unit: '%' },
  turbinePowerMW: { label: 'Turbine power', unit: 'MW' },
  fuelFlowTh: { label: 'Fuel flow', unit: 't/h' },
  fuelGcvKcalKg: { label: 'Fuel GCV/NCV', unit: 'kcal/kg' },
  heatInputKcalH: { label: 'Fuel heat input', unit: 'kcal/h' },
  boilerHeatOutputKcalH: { label: 'Boiler heat output', unit: 'kcal/h' },
  boilerEfficiencyPct: { label: 'Boiler efficiency', unit: '%' },
  turbineEfficiencyPct: { label: 'Turbine (cycle) efficiency', unit: '%' },
  generatorEfficiencyPct: { label: 'Generator efficiency', unit: '%' },
  plantEfficiencyPct: { label: 'Overall plant efficiency', unit: '%' },
  heatRateKcalKwh: { label: 'Heat rate', unit: 'kcal/kWh' },
  specificFuelConsumptionKgKwh: { label: 'Specific fuel consumption', unit: 'kg/kWh' },
  co2EmissionTh: { label: 'CO₂ emission', unit: 't/h' },
  mainSteamFlowTh: { label: 'Main steam flow', unit: 't/h' },
  mainSteamPressureBar: { label: 'Main steam pressure', unit: 'bar' },
  mainSteamTempC: { label: 'Main steam temperature', unit: '°C' },
  reheatPressureBar: { label: 'Reheat pressure', unit: 'bar' },
  reheatTempC: { label: 'Reheat temperature', unit: '°C' },
  feedwaterFlowTh: { label: 'Feedwater flow', unit: 't/h' },
  feedwaterTempC: { label: 'Feedwater temperature', unit: '°C' },
  sprayWaterFlowTh: { label: 'Spray-water flow', unit: 't/h' },
  blowdownFlowTh: { label: 'Blowdown flow', unit: 't/h' },
  condenserPressureKPa: { label: 'Condenser pressure', unit: 'kPa' },
  o2Pct: { label: 'O₂ (flue gas)', unit: '%' },
  excessAirPct: { label: 'Excess air', unit: '%' },
  combustionAirFlowTh: { label: 'Combustion air flow', unit: 't/h' },
  primaryAirFlowTh: { label: 'Primary air flow', unit: 't/h' },
  secondaryAirFlowTh: { label: 'Secondary air flow', unit: 't/h' },
  flueGasFlowTh: { label: 'Flue gas flow', unit: 't/h' },
  furnacePressureMmWC: { label: 'Furnace pressure', unit: 'mmWC' },
  fuelCarbonPct: { label: 'Fuel carbon content (as-fired)', unit: '%' },
  fuelHydrogenPct: { label: 'Fuel hydrogen content (as-fired)', unit: '%' },
  fuelOxygenPct: { label: 'Fuel oxygen content (as-fired)', unit: '%' },
  fuelSulfurPct: { label: 'Fuel sulfur content (as-fired)', unit: '%' },
  theoreticalAirKgPerKgFuel: { label: 'Theoretical (stoichiometric) air requirement', unit: 'kg/kg fuel' },
  condenserSaturationTempC: { label: 'Condenser saturation temperature', unit: '°C' },
  carnotEfficiencyLimitPct: { label: 'Carnot efficiency limit (thermodynamic ceiling)', unit: '%' },
  turbineEfficiencyCrossCheckPct: { label: 'Turbine efficiency — independent cross-check', unit: '%' },
};

/** User-enterable inputs (a subset of PARAM_META — the rest are outputs-only). */
export const INPUT_KEYS = [
  'grossMW', 'fuelFlowTh', 'fuelGcvKcalKg', 'combustionAirFlowTh', 'mainSteamFlowTh',
  'mainSteamPressureBar', 'mainSteamTempC', 'reheatPressureBar', 'reheatTempC',
  'feedwaterFlowTh', 'feedwaterTempC', 'condenserPressureKPa', 'o2Pct',
  'furnacePressureMmWC', 'boilerEfficiencyPct', 'turbineEfficiencyPct',
];

/** Optional ultimate (elemental) fuel analysis inputs — as-fired mass %.
 * When all four are supplied, combustion air and CO2 are computed from
 * actual fuel chemistry via standard stoichiometry instead of a typical
 * air/fuel ratio and emission factor, which is meaningfully more accurate
 * whenever a fuel analysis is available (this is how real boiler combustion
 * calculations are normally done). Shown as a separate optional group in
 * the UI since most users won't have a lab analysis on hand. */
export const ULTIMATE_ANALYSIS_KEYS = ['fuelCarbonPct', 'fuelHydrogenPct', 'fuelOxygenPct', 'fuelSulfurPct'];

/** The full set of parameters this module will attempt to report on. */
export const OUTPUT_KEYS = Object.keys(PARAM_META);

/**
 * Default configurable assumptions — typical values by plant type, boiler
 * type, and fuel. ALL of these are meant to be shown to and overridable by
 * the user (spec #20): they are starting points, not guaranteed values.
 */
export function defaultAdvancedConfig(plantType = 'subcritical', boilerType = 'drum', fuelType = 'coal') {
  const base = defaultAssumptions(plantType);
  const co2Factor = fuelType === 'gas' ? 2.75 : (fuelType === 'oil' ? 3.15 : 2.42);
  return {
    plantType,
    boilerType,
    fuelType,
    // typical fallback values (used only if the user leaves the field blank
    // AND no rule can derive it from other supplied data) — status "Predicted"
    boilerEfficiencyPct: base.boilerEfficiencyPct,
    turbineEfficiencyPct: base.turbineEfficiencyPct,
    generatorEfficiencyPct: base.generatorEfficiencyPct,
    auxPowerPct: base.auxPowerPct,
    mainSteamPressureBar: base.mainSteamPressureBar,
    mainSteamTempC: base.mainSteamTempC,
    reheatTempC: base.reheatTempC,
    feedwaterTempC: base.feedwaterTempC,
    condenserPressureKPa: base.condenserPressureKPa,
    furnacePressureMmWC: boilerType === 'once-through' ? -3 : -4, // typical balanced-draft band
    // pure engineering-assumption knobs used INSIDE rules (ratios/splits),
    // not standalone typical values:
    airFuelRatio: fuelType === 'gas' ? 16 : (fuelType === 'oil' ? 13.8 : 6.8), // kg air / kg fuel
    primaryAirFractionPct: 22, // typical PA share of total combustion air, pulverized coal
    sprayWaterPctOfMainSteam: 3, // typical desuperheater spray, % of main steam flow
    blowdownPct: boilerType === 'once-through' ? 0 : 1.5, // % of steam flow, drum boilers only
    reheatPressureRatio: 0.22, // typical reheat/main-steam pressure ratio
    co2FactorKgPerKgFuel: co2Factor,
    designExcessAirPct: fuelType === 'gas' ? 10 : (fuelType === 'oil' ? 15 : 20), // typical design excess air, used only if O2 isn't measured/derivable
    carnotFractionAchieved: 0.62, // rule-of-thumb: modern reheat Rankine cycles achieve ~60-65% of the Carnot limit
  };
}

// ---------- Forward-chaining rule set ----------
// Every rule: derive `out` from `inputs` (other parameter keys). `kind`:
//  'law'        — pure mass/energy balance or thermodynamic identity
//  'assumption' — also consumes one or more `usesConfig` knobs
const RULES = [
  { out: 'plantEfficiencyPct', inputs: ['boilerEfficiencyPct', 'turbineEfficiencyPct', 'generatorEfficiencyPct'], kind: 'law',
    formula: 'η_plant = η_boiler × η_turbine × η_gen',
    compute: (v) => (v.boilerEfficiencyPct * v.turbineEfficiencyPct * v.generatorEfficiencyPct) / 10000 },
  { out: 'heatRateKcalKwh', inputs: ['plantEfficiencyPct'], kind: 'law',
    formula: 'HR = 860.42 / η_plant',
    compute: (v) => KCAL_PER_KWH / (v.plantEfficiencyPct / 100) },
  { out: 'heatInputKcalH', inputs: ['fuelFlowTh', 'fuelGcvKcalKg'], kind: 'law',
    formula: 'Q_fuel = FuelFlow × GCV',
    compute: (v) => v.fuelFlowTh * 1000 * v.fuelGcvKcalKg },
  { out: 'fuelFlowTh', inputs: ['heatInputKcalH', 'fuelGcvKcalKg'], kind: 'law',
    formula: 'FuelFlow = Q_fuel / GCV',
    compute: (v) => v.heatInputKcalH / (1000 * v.fuelGcvKcalKg) },
  { out: 'grossMW', inputs: ['heatInputKcalH', 'heatRateKcalKwh'], kind: 'law',
    formula: 'GrossMW = Q_fuel / (1000 × HR)',
    compute: (v) => v.heatInputKcalH / (1000 * v.heatRateKcalKwh) },
  { out: 'heatInputKcalH', inputs: ['grossMW', 'heatRateKcalKwh'], kind: 'law',
    formula: 'Q_fuel = GrossMW × 1000 × HR',
    compute: (v) => v.grossMW * 1000 * v.heatRateKcalKwh },
  { out: 'netMW', inputs: ['grossMW', 'auxPowerPct'], kind: 'assumption',
    formula: 'NetMW = GrossMW × (1 − Aux%)',
    compute: (v) => v.grossMW * (1 - v.auxPowerPct / 100) },
  { out: 'grossMW', inputs: ['netMW', 'auxPowerPct'], kind: 'assumption',
    formula: 'GrossMW = NetMW / (1 − Aux%)',
    compute: (v) => v.netMW / (1 - v.auxPowerPct / 100) },
  { out: 'auxMW', inputs: ['grossMW', 'netMW'], kind: 'law',
    formula: 'AuxMW = GrossMW − NetMW',
    compute: (v) => v.grossMW - v.netMW },
  { out: 'turbinePowerMW', inputs: ['grossMW', 'generatorEfficiencyPct'], kind: 'assumption',
    formula: 'TurbinePower = GrossMW / η_gen',
    compute: (v) => v.grossMW / (v.generatorEfficiencyPct / 100) },
  { out: 'specificFuelConsumptionKgKwh', inputs: ['fuelFlowTh', 'grossMW'], kind: 'law',
    formula: 'SFC = FuelFlow(t/h) / GrossMW(MW)  [≡ kg/kWh]',
    compute: (v) => v.fuelFlowTh / v.grossMW },
  { out: 'co2EmissionTh', inputs: ['fuelFlowTh', 'fuelCarbonPct'], kind: 'law',
    formula: 'CO2 = FuelFlow × (C%/100) × (44/12)  [stoichiometric, from actual carbon content]',
    compute: (v) => v.fuelFlowTh * (v.fuelCarbonPct / 100) * (44 / 12) },
  { out: 'co2EmissionTh', inputs: ['fuelFlowTh'], kind: 'assumption',
    formula: 'CO2 = FuelFlow × EmissionFactor(fuel)',
    compute: (v, cfg) => v.fuelFlowTh * cfg.co2FactorKgPerKgFuel },
  { out: 'boilerHeatOutputKcalH', inputs: ['heatInputKcalH', 'boilerEfficiencyPct'], kind: 'law',
    formula: 'Q_boiler = Q_fuel × η_boiler',
    compute: (v) => v.heatInputKcalH * (v.boilerEfficiencyPct / 100) },
  { out: 'enthalpyRiseKcalKg', inputs: ['mainSteamPressureBar', 'mainSteamTempC', 'feedwaterTempC'], kind: 'assumption',
    formula: 'Δh ≈ [620 + 0.35×(T−500) + 0.05×(P−150)] − (T_fw − 240)×cp_water  [correlation + feedwater correction, not full IAPWS-IF97]',
    compute: (v) => {
      const base = 620 + (v.mainSteamTempC - 500) * 0.35 + (v.mainSteamPressureBar - 150) * 0.05;
      const fwCorrection = (v.feedwaterTempC - 240) * 1.0; // cp_water ≈ 1 kcal/kg·°C
      return Math.max(400, base - fwCorrection);
    } },
  { out: 'mainSteamFlowTh', inputs: ['boilerHeatOutputKcalH', 'enthalpyRiseKcalKg'], kind: 'law',
    formula: 'SteamFlow = Q_boiler / Δh',
    compute: (v) => v.boilerHeatOutputKcalH / (v.enthalpyRiseKcalKg * 1000) },
  { out: 'sprayWaterFlowTh', inputs: ['mainSteamFlowTh'], kind: 'assumption',
    formula: 'Spray = SteamFlow × Spray%',
    compute: (v, cfg) => v.mainSteamFlowTh * (cfg.sprayWaterPctOfMainSteam / 100) },
  { out: 'blowdownFlowTh', inputs: ['mainSteamFlowTh'], kind: 'assumption',
    formula: 'Blowdown = SteamFlow × Blowdown%  (0 for once-through boilers)',
    compute: (v, cfg) => (cfg.boilerType === 'once-through' ? 0 : v.mainSteamFlowTh * (cfg.blowdownPct / 100)) },
  { out: 'feedwaterFlowTh', inputs: ['mainSteamFlowTh', 'sprayWaterFlowTh', 'blowdownFlowTh'], kind: 'law',
    formula: 'FW = SteamFlow + Spray + Blowdown',
    compute: (v) => v.mainSteamFlowTh + v.sprayWaterFlowTh + v.blowdownFlowTh },
  { out: 'reheatPressureBar', inputs: ['mainSteamPressureBar'], kind: 'assumption',
    formula: 'P_reheat ≈ Ratio × P_mainsteam',
    compute: (v, cfg) => v.mainSteamPressureBar * cfg.reheatPressureRatio },
  { out: 'theoreticalAirKgPerKgFuel', inputs: ['fuelCarbonPct', 'fuelHydrogenPct', 'fuelOxygenPct', 'fuelSulfurPct'], kind: 'law',
    formula: 'Air_theoretical = 11.5×C + 34.5×(H − O/8) + 4.32×S  [mass fractions; standard combustion stoichiometry]',
    compute: (v) => 11.5 * (v.fuelCarbonPct / 100) + 34.5 * ((v.fuelHydrogenPct / 100) - (v.fuelOxygenPct / 100) / 8) + 4.32 * (v.fuelSulfurPct / 100) },
  { out: 'theoreticalAirKgPerKgFuel', inputs: ['fuelCarbonPct', 'fuelHydrogenPct'], kind: 'law',
    formula: 'Air_theoretical ≈ 11.5×C + 34.5×H  [mass fractions; O/S terms omitted — not supplied]',
    compute: (v) => 11.5 * (v.fuelCarbonPct / 100) + 34.5 * (v.fuelHydrogenPct / 100) },
  { out: 'excessAirPct', inputs: ['o2Pct'], kind: 'law',
    formula: 'EA% = O2 / (21 − O2) × 100',
    compute: (v) => (v.o2Pct / (21 - v.o2Pct)) * 100 },
  { out: 'o2Pct', inputs: ['excessAirPct'], kind: 'law',
    formula: 'O2% = 21 × EA / (100 + EA)',
    compute: (v) => (21 * v.excessAirPct) / (100 + v.excessAirPct) },
  { out: 'combustionAirFlowTh', inputs: ['fuelFlowTh', 'theoreticalAirKgPerKgFuel', 'excessAirPct'], kind: 'law',
    formula: 'Air = FuelFlow × TheoreticalAir/kgFuel × (1 + ExcessAir%/100)  [from actual fuel chemistry + measured/derived excess air]',
    compute: (v) => v.fuelFlowTh * v.theoreticalAirKgPerKgFuel * (1 + v.excessAirPct / 100) },
  { out: 'combustionAirFlowTh', inputs: ['fuelFlowTh', 'theoreticalAirKgPerKgFuel'], kind: 'assumption',
    formula: 'Air = FuelFlow × TheoreticalAir/kgFuel × (1 + DesignExcessAir%/100)  [from actual fuel chemistry, typical design excess air]',
    compute: (v, cfg) => v.fuelFlowTh * v.theoreticalAirKgPerKgFuel * (1 + cfg.designExcessAirPct / 100) },
  { out: 'combustionAirFlowTh', inputs: ['fuelFlowTh'], kind: 'assumption',
    formula: 'Air = FuelFlow × Air/Fuel ratio',
    compute: (v, cfg) => v.fuelFlowTh * cfg.airFuelRatio },
  { out: 'fuelFlowTh', inputs: ['combustionAirFlowTh'], kind: 'assumption',
    formula: 'FuelFlow = Air / (Air/Fuel ratio)',
    compute: (v, cfg) => v.combustionAirFlowTh / cfg.airFuelRatio },
  { out: 'primaryAirFlowTh', inputs: ['combustionAirFlowTh'], kind: 'assumption',
    formula: 'PA = TotalAir × PA%',
    compute: (v, cfg) => v.combustionAirFlowTh * (cfg.primaryAirFractionPct / 100) },
  { out: 'secondaryAirFlowTh', inputs: ['combustionAirFlowTh', 'primaryAirFlowTh'], kind: 'law',
    formula: 'SA = TotalAir − PA',
    compute: (v) => v.combustionAirFlowTh - v.primaryAirFlowTh },
  { out: 'flueGasFlowTh', inputs: ['combustionAirFlowTh', 'fuelFlowTh'], kind: 'law',
    formula: 'FlueGas ≈ Air + Fuel  (mass balance, ash/moisture neglected)',
    compute: (v) => v.combustionAirFlowTh + v.fuelFlowTh },
  { out: 'condenserSaturationTempC', inputs: ['condenserPressureKPa'], kind: 'law',
    formula: 'Antoine equation (water, 1-100°C range): T = B/(A − log₁₀(P_mmHg)) − C,  A=8.07131, B=1730.63, C=233.426',
    compute: (v) => {
      const pMmHg = v.condenserPressureKPa * 7.50062;
      if (pMmHg <= 0) throw new Error('Condenser pressure must be > 0');
      return 1730.63 / (8.07131 - Math.log10(pMmHg)) - 233.426;
    } },
  { out: 'carnotEfficiencyLimitPct', inputs: ['mainSteamTempC', 'condenserSaturationTempC'], kind: 'law',
    formula: 'η_Carnot = [1 − (T_cond+273.15)/(T_steam+273.15)] × 100  — absolute thermodynamic ceiling, not the actual achievable cycle efficiency',
    compute: (v) => (1 - (v.condenserSaturationTempC + 273.15) / (v.mainSteamTempC + 273.15)) * 100 },
  { out: 'turbineEfficiencyCrossCheckPct', inputs: ['carnotEfficiencyLimitPct'], kind: 'assumption',
    formula: 'η_turbine,crosscheck ≈ η_Carnot × FractionAchieved  — independent sanity check against the primary turbine efficiency estimate; large disagreement is worth investigating, not a hard error',
    compute: (v, cfg) => v.carnotEfficiencyLimitPct * cfg.carnotFractionAchieved },
];

function ruleStatus(rule, inputStatuses) {
  const allClean = inputStatuses.every((s) => s === 'Measured' || s === 'Calculated');
  if (rule.kind === 'law') return allClean ? 'Calculated' : 'Simulated';
  return allClean ? 'Estimated' : 'Simulated';
}

function runRulesToFixpoint(known, config) {
  let changed = true;
  let pass = 0;
  while (changed && pass < 15) {
    changed = false;
    pass++;
    for (const rule of RULES) {
      if (known[rule.out]) continue;
      if (!rule.inputs.every((k) => known[k])) continue;
      const v = {};
      for (const k of rule.inputs) v[k] = known[k].value;
      let value;
      try { value = rule.compute(v, config); } catch (e) { continue; }
      if (!Number.isFinite(value)) continue;
      const status = ruleStatus(rule, rule.inputs.map((k) => known[k].status));
      known[rule.out] = { value, status, formula: rule.formula };
      changed = true;
    }
  }
  return known;
}

/**
 * Main entry point. `rawInputs` is a partial object keyed by INPUT_KEYS —
 * omit or leave blank any parameter the user didn't provide. `config` comes
 * from `defaultAdvancedConfig()`, with any fields the user overrode.
 *
 * Returns { parameters: { key: { value, status, formula, label, unit } } }.
 */
export function estimate(rawInputs, config) {
  const known = {};
  for (const [k, raw] of Object.entries(rawInputs || {})) {
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    known[k] = { value, status: 'Measured', formula: 'User-entered value' };
  }

  // Phase 1: derive everything possible purely from what the user gave us.
  runRulesToFixpoint(known, config);

  // Phase 2: fill remaining gaps with typical (Predicted) values, then let
  // the rules run again so anything downstream of a Predicted value can
  // resolve too (correctly landing on "Simulated" via ruleStatus above).
  //
  // Where we have a real capacity figure to anchor to (the user gave grossMW
  // directly, or netMW directly which we can back out grossMW from using the
  // flat aux% default as a first-pass estimate), the four capacity-sensitive
  // typical values (turbine/boiler/generator efficiency, aux power) are
  // refined by unit size via sizeAdjustedDefaults() instead of the flat
  // plant-type-only default — see thermalPlant.mjs for what that is and
  // is not (documented industry trend data, not a live "world" lookup).
  let mwHint = null;
  if (known.grossMW && known.grossMW.status === 'Measured') {
    mwHint = known.grossMW.value;
  } else if (known.netMW && known.netMW.status === 'Measured') {
    mwHint = known.netMW.value / (1 - config.auxPowerPct / 100);
  }
  const sizeNote = mwHint
    ? `Typical value interpolated for a ~${Math.round(mwHint)} MW ${config.plantType} / ${config.boilerType}-boiler plant (capacity-efficiency trend)`
    : `Typical value for a ${config.plantType} / ${config.boilerType}-boiler plant of this size — not derived from entered data`;
  const sizeAdjusted = mwHint ? sizeAdjustedDefaults(mwHint, config.plantType) : null;

  const typicalFallback = {
    boilerEfficiencyPct: sizeAdjusted ? sizeAdjusted.boilerEfficiencyPct : config.boilerEfficiencyPct,
    turbineEfficiencyPct: sizeAdjusted ? sizeAdjusted.turbineEfficiencyPct : config.turbineEfficiencyPct,
    generatorEfficiencyPct: sizeAdjusted ? sizeAdjusted.generatorEfficiencyPct : config.generatorEfficiencyPct,
    auxPowerPct: sizeAdjusted ? sizeAdjusted.auxPowerPct : config.auxPowerPct,
    mainSteamPressureBar: config.mainSteamPressureBar,
    mainSteamTempC: config.mainSteamTempC,
    reheatTempC: config.reheatTempC,
    feedwaterTempC: config.feedwaterTempC,
    condenserPressureKPa: config.condenserPressureKPa,
    furnacePressureMmWC: config.furnacePressureMmWC,
    excessAirPct: config.designExcessAirPct,
  };
  const sizeSensitiveKeys = new Set(['boilerEfficiencyPct', 'turbineEfficiencyPct', 'generatorEfficiencyPct', 'auxPowerPct']);
  for (let round = 0; round < 3; round++) {
    let addedFallback = false;
    for (const [key, val] of Object.entries(typicalFallback)) {
      if (!known[key] && Number.isFinite(val)) {
        known[key] = { value: val, status: 'Predicted', formula: sizeSensitiveKeys.has(key) ? sizeNote : `Typical value for a ${config.plantType} / ${config.boilerType}-boiler plant of this size — not derived from entered data` };
        addedFallback = true;
      }
    }
    runRulesToFixpoint(known, config);
    if (!addedFallback) break;
  }

  const parameters = {};
  for (const key of OUTPUT_KEYS) {
    if (known[key]) {
      const meta = PARAM_META[key] || { label: key, unit: '' };
      parameters[key] = { ...known[key], label: meta.label, unit: meta.unit };
    }
  }
  return { parameters, config };
}
