// boilerEfficiency.js — boiler efficiency by the indirect (heat loss)
// method, the standard procedure taught and used across the industry
// (ASME PTC 4.1 in the US, BEE India's standard energy-audit procedure,
// equivalent to BS 845 / DIN 1942 internationally). Genuinely different
// from an assumed efficiency % elsewhere in this app: every loss is
// computed from the fuel's ultimate analysis and measured flue gas data.
//
// Losses computed: L1 (dry flue gas), L2 (H2 in fuel), L3 (moisture in
// fuel), L4 (moisture in combustion air), L5 (CO / incomplete
// combustion), L6 (surface radiation & convection, user-supplied — this
// genuinely requires either a surface survey or a size-based chart, not
// something derivable from fuel analysis), L7/L8 (unburnt carbon in fly
// ash / bottom ash, user-supplied — requires ash sampling and lab
// analysis, only applicable to solid fuel).
//
// Formulas verified against multiple independent published sources
// during development (all mutually consistent) and cross-checked against
// a classic textbook reference problem (theoretical air for a 70.5% C /
// 4.5% H2 / 6% O2 / 3% S coal comes to 9.61 kg/kg, matching the expected
// 9-11 kg/kg range for bituminous coal), plus a full synthetic case
// where every individual loss landed within its typically-quoted range.

/** Theoretical (stoichiometric) air requirement, kg air / kg fuel, from
 * the fuel's ultimate analysis (mass %). Standard combustion
 * stoichiometry formula used throughout boiler-efficiency practice. */
export function theoreticalAirKgPerKgFuel(carbonPct, hydrogenPct, oxygenPct, sulfurPct) {
  return (11.6 * carbonPct + 34.8 * (hydrogenPct - oxygenPct / 8) + 4.35 * sulfurPct) / 100;
}

/** Excess air % from measured dry-basis O2% in the flue gas. */
export function excessAirPctFromO2(o2Pct) {
  if (!(o2Pct >= 0 && o2Pct < 21)) throw new Error('Flue gas O2% must be between 0 and 21.');
  return (o2Pct / (21 - o2Pct)) * 100;
}

/** Mass of dry flue gas, kg / kg fuel burnt — a first-principles mass
 * balance: CO2 and SO2 produced from the fuel's carbon and sulfur, plus
 * the nitrogen and un-used (excess) oxygen carried through from the
 * actual air supplied. Air is treated as 77% N2 / 23% O2 by mass, the
 * standard approximation used throughout this method. */
export function dryFlueGasMassKgPerKgFuel(carbonPct, sulfurPct, nitrogenPct, theoreticalAirKgKg, excessAirPct) {
  const aasKgKg = theoreticalAirKgKg * (1 + excessAirPct / 100);
  const massCO2 = (carbonPct / 100) * (44 / 12);
  const massSO2 = (sulfurPct / 100) * (64 / 32);
  const massN2 = nitrogenPct / 100 + 0.77 * aasKgKg;
  const massExcessO2 = 0.23 * (aasKgKg - theoreticalAirKgKg);
  return { aasKgKg, massCO2, massSO2, massN2, massExcessO2, totalKgKg: massCO2 + massSO2 + massN2 + massExcessO2 };
}

const LATENT_HEAT_WATER_KCAL_KG = 584; // latent heat of water at the standard reference temperature used throughout this method
const CP_SUPERHEATED_STEAM = 0.45;     // kcal/kg.C, standard value used for the water-vapor sensible-heat term in L2/L3/L4
const CP_FLUE_GAS = 0.23;              // kcal/kg.C, standard typical value for dry flue gas

/**
 * Full boiler efficiency by the indirect (heat-loss) method.
 *
 * Note on GCV vs NCV: this returns efficiency on a GCV (gross/higher
 * heating value) basis, the standard basis for this method. Fuels with
 * a high hydrogen content (natural gas especially) genuinely show a
 * noticeably lower GCV-basis efficiency than the NCV-basis figure often
 * quoted for them -- the latent heat carried away as water vapor from
 * hydrogen combustion (L2) is real and unavoidable on a GCV basis. A gas
 * boiler reported as "90% efficient" is very often an NCV-basis figure;
 * the same boiler's GCV-basis efficiency is typically several points
 * lower. Neither figure is wrong -- they are different, both legitimate
 * accounting conventions, and this calculator is explicit that its
 * result is GCV-basis so the two are never silently conflated.
 *
 * @param {object} p
 * @param {number} p.carbonPct, p.hydrogenPct, p.oxygenPct, p.nitrogenPct, p.sulfurPct, p.moisturePct, p.ashPct - fuel ultimate analysis, mass % (should sum to ~100)
 * @param {number} p.gcvKcalKg - fuel gross calorific value, kcal/kg
 * @param {number} p.fluO2Pct - measured dry-basis O2% in flue gas
 * @param {number} [p.fluCOPct] - measured CO% in flue gas (for L5); omit or 0 if not measured/negligible
 * @param {number} p.flueGasTempC - flue gas exit temperature, deg C
 * @param {number} p.ambientTempC - ambient (combustion air) temperature, deg C
 * @param {number} [p.humidityFactorKgKg] - kg moisture / kg dry air in the combustion air; default 0.02 (a typical value)
 * @param {number} p.surfaceLossPct - L6, radiation & convection loss, % (user-supplied; genuinely requires a surface survey or manufacturer's chart)
 * @param {number} [p.flyAshUnburntPct] - L7, unburnt-carbon loss in fly ash, % (user-supplied; solid fuel only, requires ash sampling)
 * @param {number} [p.bottomAshUnburntPct] - L8, unburnt-carbon loss in bottom ash, % (user-supplied; solid fuel only)
 */
export function boilerEfficiencyIndirect(p) {
  const {
    carbonPct, hydrogenPct, oxygenPct, nitrogenPct, sulfurPct, moisturePct,
    gcvKcalKg, fluO2Pct, fluCOPct = 0, flueGasTempC, ambientTempC,
    humidityFactorKgKg = 0.02, surfaceLossPct, flyAshUnburntPct = 0, bottomAshUnburntPct = 0,
  } = p;

  if (!(gcvKcalKg > 0)) throw new Error('Fuel GCV must be greater than zero.');
  if (!(flueGasTempC > ambientTempC)) throw new Error('Flue gas temperature must be above ambient temperature.');

  const theoreticalAirKgKg = theoreticalAirKgPerKgFuel(carbonPct, hydrogenPct, oxygenPct, sulfurPct);
  const excessAirPct = excessAirPctFromO2(fluO2Pct);
  const dryGas = dryFlueGasMassKgPerKgFuel(carbonPct, sulfurPct, nitrogenPct, theoreticalAirKgKg, excessAirPct);
  const dT = flueGasTempC - ambientTempC;

  const L1 = (dryGas.totalKgKg * CP_FLUE_GAS * dT) / gcvKcalKg * 100;
  const L2 = ((9 * hydrogenPct / 100) * (LATENT_HEAT_WATER_KCAL_KG + CP_SUPERHEATED_STEAM * dT)) / gcvKcalKg * 100;
  const L3 = ((moisturePct / 100) * (LATENT_HEAT_WATER_KCAL_KG + CP_SUPERHEATED_STEAM * dT)) / gcvKcalKg * 100;
  const L4 = (dryGas.aasKgKg * humidityFactorKgKg * CP_SUPERHEATED_STEAM * dT) / gcvKcalKg * 100;
  // L5: heat lost because some carbon burned to CO instead of fully to CO2 -- 5654 kcal/kg is the
  // standard, widely-published heat-loss figure per kg of carbon converted to CO rather than CO2.
  const fluCO2Pct = Math.max(0.1, 21 - fluO2Pct - fluCOPct); // approximate, standard Orsat-style dry-gas relation
  const L5 = fluCOPct > 0 ? ((fluCOPct / (fluCOPct + fluCO2Pct)) * (carbonPct / 100) * 5654) / gcvKcalKg * 100 : 0;
  const L6 = surfaceLossPct ?? 0;
  const L7 = flyAshUnburntPct;
  const L8 = bottomAshUnburntPct;

  const totalLossPct = L1 + L2 + L3 + L4 + L5 + L6 + L7 + L8;
  const efficiencyPct = 100 - totalLossPct;

  return {
    theoreticalAirKgKg, excessAirPct, actualAirSuppliedKgKg: dryGas.aasKgKg,
    dryFlueGasMassKgKg: dryGas.totalKgKg,
    L1, L2, L3, L4, L5, L6, L7, L8, totalLossPct, efficiencyPct,
  };
}
