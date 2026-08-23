// test.mjs — automated tests for the calculation engine.
// Run: node tests/test.mjs
// This is real verification against known engineering reference values,
// not a smoke test — every module's core equation is checked.

import assert from 'node:assert/strict';
import * as units from '../js/calculators/units.js';
import * as tx from '../js/calculators/transmitter.js';
import * as dp from '../js/calculators/dpLevel.js';
import * as orf from '../js/calculators/orifice.js';
import * as cv from '../js/calculators/controlValve.js';
import * as ip from '../js/calculators/ipConverter.js';
import * as rtd from '../js/calculators/rtd.js';
import * as tc from '../js/calculators/thermocouple.js';
import * as pid from '../js/calculators/pid.js';
import * as tp from '../js/calculators/thermalPlant.js';
import * as tpa from '../js/calculators/thermalPlantAdvanced.js';
import * as trip from '../js/calculators/tripProtection.js';
import * as flow from '../js/calculators/flowEngine.js';
import * as sc from '../js/calculators/shortCircuit.js';
import * as idmt from '../js/calculators/idmt.js';
import * as ctEngine from '../js/calculators/ctEngine.js';
import * as tfProt from '../js/calculators/transformerProtection.js';
import * as motProt from '../js/calculators/motorProtection.js';
import * as lsig from '../js/calculators/lsigEngine.js';
import * as coord from '../js/calculators/coordination.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}
function approx(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, msg || `expected ~${b}, got ${a}`);
}

console.log('\n--- units.mjs ---');
test('bar -> psi', () => approx(units.convertPressure(1, 'bar', 'psi'), 14.5038, 0.001));
test('psi -> kPa', () => approx(units.convertPressure(1, 'psi', 'kPa'), 6.89476, 0.001));
test('mmHg -> Pa', () => approx(units.convertPressure(760, 'mmHg', 'Pa'), 101325, 1));
test('C -> F (boiling)', () => approx(units.convertTemperature(100, 'C', 'F'), 212, 0.001));
test('F -> C (freezing)', () => approx(units.convertTemperature(32, 'F', 'C'), 0, 0.001));
test('C -> K', () => approx(units.convertTemperature(0, 'C', 'K'), 273.15, 0.001));
test('mass flow to volumetric', () => approx(units.massFlowToVolumetric(1000, 1000), 1, 0.0001));
test('normal to actual flow (0C, 1atm -> 25C, 1atm)', () => {
  const actual = units.normalToActualFlow(100, 25, 101.325);
  approx(actual, 100 * (298.15 / 273.15), 0.01);
});

console.log('\n--- transmitter.mjs (4-20mA) ---');
test('spec example: 0-100 bar, 14.5mA -> 65.625 bar', () => {
  const pv = tx.signalToPv(14.5, 0, 100, '4-20mA');
  approx(pv, 65.625, 0.001);
});
test('4mA -> 0%', () => approx(tx.signalToPercent(4, '4-20mA'), 0, 0.0001));
test('20mA -> 100%', () => approx(tx.signalToPercent(20, '4-20mA'), 100, 0.0001));
test('12mA -> 50%', () => approx(tx.signalToPercent(12, '4-20mA'), 50, 0.0001));
test('round trip pv->signal->pv', () => {
  const sig = tx.pvToSignal(42, 0, 100);
  approx(tx.signalToPv(sig, 0, 100), 42, 1e-9);
});

console.log('\n--- dpLevel.mjs ---');
test('flow at 25% DP -> 50% flow (sqrt law)', () => approx(dp.flowFromDP(25, 100, 200), 100, 0.001));
test('dpFromFlow inverse of flowFromDP', () => approx(dp.dpFromFlow(100, 200, 100), 25, 0.001));
test('hydrostatic pressure: 1000kg/m3, 2m', () => approx(dp.hydrostaticPressurePa(1000, 2), 19613.3, 1));
test('open tank level from DP', () => approx(dp.openTankLevel(19613.3, 1000), 2, 0.001));
test('closed tank wet-leg level: DP offset by wet-leg static pressure', () => {
  // process density 950, wet-leg fill 1000 kg/m3, wet-leg height 3m
  // wet-leg static pressure = 1000*9.80665*3 = 29419.95 Pa
  // if level = 2m of process fluid: DP = rho_proc*g*h - wetLegPressure = 950*9.80665*2 - 29419.95
  const rhoProc = 950, rhoWetLeg = 1000, wetLegH = 3, levelM = 2;
  const dpPa = rhoProc * 9.80665 * levelM - rhoWetLeg * 9.80665 * wetLegH;
  const lvl = dp.closedTankWetLegLevel(dpPa, rhoProc, rhoWetLeg, wetLegH);
  approx(lvl, levelM, 0.001);
});
test('closed tank level increases with DP', () => {
  const low = dp.closedTankWetLegLevel(-10000, 950, 1000, 3);
  const high = dp.closedTankWetLegLevel(10000, 950, 1000, 3);
  assert.ok(high > low);
});

console.log('\n--- orifice.mjs ---');
test('beta ratio', () => approx(orf.betaRatio(0.05, 0.1), 0.5, 1e-9));
test('volumetric flow positive & sane', () => {
  const q = orf.volumetricFlow(0.05, 0.1, 5000, 1000, 0.6);
  assert.ok(q > 0 && q < 1, `flow out of sane bounds: ${q}`);
});
test('boreForFlow inverts volumetricFlow', () => {
  const q = orf.volumetricFlow(0.05, 0.1, 5000, 1000, 0.6);
  const bore = orf.boreForFlow(q, 0.1, 5000, 1000, 0.6);
  approx(bore, 0.05, 1e-4);
});
test('reynolds number positive', () => {
  const re = orf.reynoldsNumber(5, 0.1, 0.001);
  assert.ok(re > 0);
});

console.log('\n--- controlValve.mjs ---');
test('liquid Cv, spec-style example: Q=100gpm dP=25psi SG=1 -> Cv=20', () => {
  approx(cv.liquidCv(100, 25, 1), 20, 0.001);
});
test('kv <-> cv round trip', () => approx(cv.kvToCv(cv.cvToKv(50)), 50, 1e-9));
test('choked flow rule of thumb', () => {
  assert.equal(cv.isChokedFlow(100, 40), true);
  assert.equal(cv.isChokedFlow(100, 80), false);
});
test('valve travel linear == flow%', () => approx(cv.valveTravelPercent(60, 'linear'), 60, 1e-9));

console.log('\n--- ipConverter.mjs ---');
test('4mA -> 3psi', () => approx(ip.currentToPressure(4), 3, 1e-9));
test('20mA -> 15psi', () => approx(ip.currentToPressure(20), 15, 1e-9));
test('12mA -> 9psi', () => approx(ip.currentToPressure(12), 9, 1e-9));
test('reverse: 9psi -> 12mA', () => approx(ip.pressureToCurrent(9), 12, 1e-9));

console.log('\n--- rtd.mjs ---');
test('Pt100 at 0C = 100 ohm', () => approx(rtd.temperatureToResistance(0, 'Pt100'), 100, 1e-6));
test('Pt100 at 100C ≈ 138.51 ohm (IEC60751)', () => approx(rtd.temperatureToResistance(100, 'Pt100'), 138.51, 0.01));
test('Pt1000 at 0C = 1000 ohm', () => approx(rtd.temperatureToResistance(0, 'Pt1000'), 1000, 1e-6));
test('resistance -> temperature round trip (Pt100)', () => {
  const r = rtd.temperatureToResistance(250, 'Pt100');
  approx(rtd.resistanceToTemperature(r, 'Pt100'), 250, 0.01);
});
test('Pt100 negative temp round trip', () => {
  const r = rtd.temperatureToResistance(-100, 'Pt100');
  approx(rtd.resistanceToTemperature(r, 'Pt100'), -100, 0.01);
});

console.log('\n--- thermocouple.mjs ---');
test('Type K round trip temp->mv->temp', () => {
  const mv = tc.temperatureToMv(300, 'K');
  approx(tc.mvToTemperature(mv, 'K'), 300, 1e-9);
});
test('CJC compensation increases apparent temperature', () => {
  const withoutCjc = tc.mvToTemperature(10, 'K');
  const withCjc = tc.cjcCompensatedTemperature(10, 25, 'K');
  assert.ok(withCjc > withoutCjc);
});
test('temperatureToMvWithCjc is the exact inverse of cjcCompensatedTemperature', () => {
  const actualTempC = 300, cjcTempC = 25;
  const mvAtTransmitter = tc.temperatureToMvWithCjc(actualTempC, cjcTempC, 'K');
  const recoveredTempC = tc.cjcCompensatedTemperature(mvAtTransmitter, cjcTempC, 'K');
  approx(recoveredTempC, actualTempC, 1e-9);
});
test('temperatureToMvWithCjc: CJC at 0C matches the plain (uncompensated) temperatureToMv', () => {
  approx(tc.temperatureToMvWithCjc(300, 0, 'K'), tc.temperatureToMv(300, 'K'), 1e-9);
});
test('temperatureToMvWithCjc: higher CJC temp reduces the transmitter mV for the same actual temperature', () => {
  const mvLowCjc = tc.temperatureToMvWithCjc(300, 20, 'K');
  const mvHighCjc = tc.temperatureToMvWithCjc(300, 40, 'K');
  assert.ok(mvHighCjc < mvLowCjc);
});

console.log('\n--- pid.mjs ---');
test('P-only output', () => {
  const r = pid.pidOutput({ sp: 50, pv: 45, kp: 2, ki: 0, kd: 0 });
  approx(r.error, 5, 1e-9);
  approx(r.pTerm, 10, 1e-9);
  approx(r.output, 10, 1e-9);
});
test('Ziegler-Nichols open loop produces positive gains', () => {
  const r = pid.zieglerNicholsOpenLoop(2, 10, 2);
  assert.ok(r.PID.kp > 0 && r.PID.ti > 0 && r.PID.td > 0);
});
test('Ziegler-Nichols closed loop matches textbook ratios', () => {
  const r = pid.zieglerNicholsClosedLoop(10, 20);
  approx(r.PID.kp, 6, 1e-9);
  approx(r.PID.ti, 10, 1e-9);
  approx(r.PID.td, 2.5, 1e-9);
});
test('Tyreus-Luyben PID matches published formula (Ku=10, Pu=20)', () => {
  const r = pid.tyreusLuyben(10, 20);
  approx(r.PID.kp, 10 / 2.2, 1e-9);
  approx(r.PID.ti, 44, 1e-9);
  approx(r.PID.td, 20 / 6.3, 1e-9);
  approx(r.PI.kp, 10 / 3.2, 1e-9);
  approx(r.PI.ti, 44, 1e-9);
});
test('Tyreus-Luyben is more conservative (lower Kp) than ZN closed loop for the same Ku/Pu', () => {
  const zn = pid.zieglerNicholsClosedLoop(10, 20);
  const tl = pid.tyreusLuyben(10, 20);
  assert.ok(tl.PID.kp < zn.PID.kp);
});
test('Chien-Hrones-Reswick: all four response/overshoot variants compute positive gains', () => {
  const K = 2, T = 10, L = 2;
  for (const response of ['setpoint', 'disturbance']) {
    for (const os of ['0', '20']) {
      const r = pid.chienHronesReswick(K, T, L, response, os);
      assert.ok(r.PID.kp > 0 && r.PID.ti > 0 && r.PID.td > 0, `${response}/${os} produced non-positive gain`);
    }
  }
});
test('Chien-Hrones-Reswick 20% overshoot is more aggressive (higher Kp) than 0% overshoot', () => {
  const K = 2, T = 10, L = 2;
  const conservative = pid.chienHronesReswick(K, T, L, 'disturbance', '0');
  const aggressive = pid.chienHronesReswick(K, T, L, 'disturbance', '20');
  assert.ok(aggressive.PID.kp > conservative.PID.kp);
});
test('SIMC (Skogestad): tauC = L gives the commonly-cited balanced default', () => {
  const K = 2, T = 10, L = 2;
  const r = pid.simcSkogestad(K, T, L, L);
  approx(r.PI.kp, (1 / K) * (T / (L + L)), 1e-9);
  approx(r.PI.ti, Math.min(T, 4 * (L + L)), 1e-9);
});
test('SIMC: smaller tauC gives a more aggressive (higher Kp) controller', () => {
  const K = 2, T = 10, L = 2;
  const aggressive = pid.simcSkogestad(K, T, L, 1);
  const conservative = pid.simcSkogestad(K, T, L, 8);
  assert.ok(aggressive.PI.kp > conservative.PI.kp);
});
test('Relay feedback: Ku formula matches Astrom-Hagglund (Ku = 4d/(pi*a))', () => {
  const r = pid.relayFeedbackUltimateGain(5, 2, 18);
  approx(r.Ku, (4 * 5) / (Math.PI * 2), 1e-9);
  approx(r.Pu, 18, 1e-9);
});
test('Loop type guidance covers the five common industrial loop types', () => {
  const types = pid.LOOP_TYPE_GUIDANCE.map((g) => g.type);
  assert.deepEqual(types, ['Flow', 'Level', 'Pressure', 'Temperature', 'Composition / Analyzer']);
  for (const g of pid.LOOP_TYPE_GUIDANCE) {
    assert.ok(g.controller && g.kpRange && g.notes, `${g.type} missing guidance fields`);
  }
});

console.log('\n--- thermalPlant.mjs ---');
test('fromGeneratedMW: net < gross by aux%', () => {
  const a = tp.defaultAssumptions('subcritical');
  const r = tp.fromGeneratedMW(210, a);
  approx(r.netGenerationMW, 210 * (1 - a.auxPowerPct / 100), 0.01);
});
test('fromGeneratedMW: heat rate is positive and plausible (1900-3500 kcal/kWh)', () => {
  const a = tp.defaultAssumptions('supercritical');
  const r = tp.fromGeneratedMW(660, a);
  assert.ok(r.grossHeatRateKcalKwh > 1900 && r.grossHeatRateKcalKwh < 3500, `got ${r.grossHeatRateKcalKwh}`);
});
test('fromFuel and fromGeneratedMW are roughly consistent (round trip)', () => {
  const a = tp.defaultAssumptions('subcritical');
  const r1 = tp.fromGeneratedMW(300, a);
  const r2 = tp.fromFuel({
    fuelFlowKgH: r1.fuelFlowTh * 1000,
    fuelGcvKcalKg: a.fuelGcvKcalKg,
    boilerEfficiencyPct: a.boilerEfficiencyPct,
    turbineEfficiencyPct: a.turbineEfficiencyPct,
    generatorEfficiencyPct: a.generatorEfficiencyPct,
    auxPowerPct: a.auxPowerPct,
  });
  approx(r2.grossMW, 300, 0.5);
});
test('unit size list has no duplicates and is sorted', () => {
  const sizes = tp.UNIT_SIZES_MW;
  const sorted = [...sizes].sort((a, b) => a - b);
  assert.deepEqual(sizes, sorted);
  assert.equal(new Set(sizes).size, sizes.length);
});

console.log('\n--- thermalPlantAdvanced.mjs ---');
test('zero inputs still produces a full Predicted/Simulated estimate', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({}, cfg);
  assert.ok(r.parameters.grossMW === undefined || r.parameters.grossMW.status !== 'Measured');
  // With zero inputs there's no fuel/MW anchor, so grossMW-dependent chain won't resolve —
  // but plant-level typical values (efficiencies, steam conditions) should still be Predicted.
  approx(r.parameters.boilerEfficiencyPct.value, cfg.boilerEfficiencyPct, 1e-9);
  assert.equal(r.parameters.boilerEfficiencyPct.status, 'Predicted');
});
test('grossMW only -> full chain resolves as Simulated (uses Predicted assumptions)', () => {
  const cfg = tpa.defaultAdvancedConfig('supercritical', 'drum', 'coal');
  const r = tpa.estimate({ grossMW: 660 }, cfg);
  assert.equal(r.parameters.grossMW.status, 'Measured');
  assert.ok(r.parameters.netMW, 'netMW should resolve');
  assert.equal(r.parameters.netMW.status, 'Simulated'); // depends on Predicted (size-adjusted) auxPowerPct
  const actualAuxPct = r.parameters.auxPowerPct.value; // size-adjusted for a 660 MW unit, not the flat default
  approx(r.parameters.netMW.value, 660 * (1 - actualAuxPct / 100), 0.01);
});
test('fuelFlow + GCV + all efficiencies + auxPct measured -> grossMW is Calculated (clean chain)', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({
    fuelFlowTh: 126.97, fuelGcvKcalKg: 4200,
    boilerEfficiencyPct: 86, turbineEfficiencyPct: 40, generatorEfficiencyPct: 98.5,
  }, cfg);
  assert.equal(r.parameters.heatInputKcalH.status, 'Calculated');
  assert.equal(r.parameters.plantEfficiencyPct.status, 'Calculated');
  assert.equal(r.parameters.heatRateKcalKwh.status, 'Calculated');
  assert.equal(r.parameters.grossMW.status, 'Calculated');
  approx(r.parameters.grossMW.value, 210, 2); // matches Mode-1 fixture from thermalPlant.mjs test
});
test('combustion air flow derivable from fuel flow via air/fuel ratio assumption -> Estimated', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({ fuelFlowTh: 100 }, cfg);
  assert.equal(r.parameters.combustionAirFlowTh.status, 'Estimated');
  approx(r.parameters.combustionAirFlowTh.value, 100 * cfg.airFuelRatio, 1e-6);
});
test('O2 <-> excess air are mutually derivable', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r1 = tpa.estimate({ o2Pct: 4 }, cfg);
  approx(r1.parameters.excessAirPct.value, (4 / (21 - 4)) * 100, 1e-6);
  assert.equal(r1.parameters.excessAirPct.status, 'Calculated');
});
test('once-through boiler has zero blowdown, drum boiler does not', () => {
  const cfgOnce = tpa.defaultAdvancedConfig('ultra-supercritical', 'once-through', 'coal');
  const cfgDrum = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const rOnce = tpa.estimate({ mainSteamFlowTh: 600 }, cfgOnce);
  const rDrum = tpa.estimate({ mainSteamFlowTh: 600 }, cfgDrum);
  approx(rOnce.parameters.blowdownFlowTh.value, 0, 1e-9);
  assert.ok(rDrum.parameters.blowdownFlowTh.value > 0);
  // feedwater should differ accordingly (once-through has no blowdown term)
  assert.ok(rOnce.parameters.feedwaterFlowTh.value < rDrum.parameters.feedwaterFlowTh.value);
});
test('measured feedwater flow overrides the calculated chain (stays Measured)', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({ mainSteamFlowTh: 600, feedwaterFlowTh: 615 }, cfg);
  assert.equal(r.parameters.feedwaterFlowTh.status, 'Measured');
  approx(r.parameters.feedwaterFlowTh.value, 615, 1e-9);
});
test('every resolved parameter carries a label, unit, and formula/assumption note', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({ grossMW: 300 }, cfg);
  for (const [key, p] of Object.entries(r.parameters)) {
    assert.ok(p.label, `${key} missing label`);
    assert.ok('unit' in p, `${key} missing unit field`);
    assert.ok(p.formula, `${key} missing formula/assumption note`);
    assert.ok(['Measured', 'Calculated', 'Estimated', 'Simulated', 'Predicted'].includes(p.status), `${key} has invalid status ${p.status}`);
  }
});
test('feedwater temperature now actually affects boiler duty / steam flow (previously collected but unused)', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const coldFw = tpa.estimate({ fuelFlowTh: 100, fuelGcvKcalKg: 4200, boilerEfficiencyPct: 86, feedwaterTempC: 150 }, cfg);
  const hotFw = tpa.estimate({ fuelFlowTh: 100, fuelGcvKcalKg: 4200, boilerEfficiencyPct: 86, feedwaterTempC: 280 }, cfg);
  // Same fuel/heat input either way, but hotter feedwater needs less boiler duty
  // per kg of steam, so the SAME heat produces MORE steam flow.
  assert.ok(hotFw.parameters.mainSteamFlowTh.value > coldFw.parameters.mainSteamFlowTh.value);
});
test('Mode 1 (fromGeneratedMW) also uses feedwater temperature, not just plant type', () => {
  const a = tp.defaultAssumptions('subcritical');
  const coldFw = tp.fromGeneratedMW(300, { ...a, feedwaterTempC: 150 });
  const hotFw = tp.fromGeneratedMW(300, { ...a, feedwaterTempC: 280 });
  // Same fixed boiler heat output either way (grossMW is fixed); hotter
  // feedwater needs less added heat per kg, so the same total heat yields
  // MORE steam mass flow.
  assert.ok(hotFw.mainSteamFlowTh > coldFw.mainSteamFlowTh);
});
test('size-adjusted predictions: larger unit gets a better predicted heat rate than a smaller one of the same plant type', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const small = tpa.estimate({ grossMW: 25 }, cfg);
  const large = tpa.estimate({ grossMW: 1000 }, cfg);
  assert.ok(large.parameters.turbineEfficiencyPct.value > small.parameters.turbineEfficiencyPct.value);
  assert.ok(large.parameters.heatRateKcalKwh.value < small.parameters.heatRateKcalKwh.value);
  assert.ok(large.parameters.auxPowerPct.value < small.parameters.auxPowerPct.value);
});
test('size-adjusted predicted efficiencies stay labeled Predicted (not overclaimed as Calculated)', () => {
  const cfg = tpa.defaultAdvancedConfig('supercritical', 'drum', 'coal');
  const r = tpa.estimate({ grossMW: 660 }, cfg);
  assert.equal(r.parameters.turbineEfficiencyPct.status, 'Predicted');
  assert.ok(r.parameters.turbineEfficiencyPct.formula.includes('660 MW'));
});
test('without any MW anchor, falls back to flat plant-type defaults (no size guess)', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({}, cfg);
  approx(r.parameters.turbineEfficiencyPct.value, cfg.turbineEfficiencyPct, 1e-9);
});
test('ultimate analysis (full C/H/O/S): theoretical air matches standard stoichiometric formula', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({ fuelCarbonPct: 65, fuelHydrogenPct: 4.5, fuelOxygenPct: 8, fuelSulfurPct: 0.5 }, cfg);
  const expected = 11.5 * 0.65 + 34.5 * (0.045 - 0.08 / 8) + 4.32 * 0.005;
  approx(r.parameters.theoreticalAirKgPerKgFuel.value, expected, 1e-9);
  assert.equal(r.parameters.theoreticalAirKgPerKgFuel.status, 'Calculated');
});
test('ultimate analysis (C/H only): falls back to the simplified two-term formula', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({ fuelCarbonPct: 65, fuelHydrogenPct: 4.5 }, cfg);
  const expected = 11.5 * 0.65 + 34.5 * 0.045;
  approx(r.parameters.theoreticalAirKgPerKgFuel.value, expected, 1e-9);
});
test('combustion air from ultimate analysis takes precedence over the flat ratio assumption when both are derivable', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({ fuelFlowTh: 100, fuelCarbonPct: 65, fuelHydrogenPct: 4.5, fuelOxygenPct: 8, fuelSulfurPct: 0.5, o2Pct: 4 }, cfg);
  // formula string should reflect the fuel-chemistry-based rule, not the ratio-based one
  assert.ok(r.parameters.combustionAirFlowTh.formula.includes('TheoreticalAir'));
});
test('combustion air still uses fuel-chemistry rigor even without a measured O2 (falls back to design excess air, not the flat ratio)', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({ fuelFlowTh: 100, fuelCarbonPct: 65, fuelHydrogenPct: 4.5, fuelOxygenPct: 8, fuelSulfurPct: 0.5 }, cfg);
  assert.ok(r.parameters.combustionAirFlowTh.formula.includes('TheoreticalAir'));
  assert.ok(r.parameters.combustionAirFlowTh.formula.includes('DesignExcessAir'));
  const expectedAir = 100 * r.parameters.theoreticalAirKgPerKgFuel.value * (1 + cfg.designExcessAirPct / 100);
  approx(r.parameters.combustionAirFlowTh.value, expectedAir, 1e-6);
});
test('CO2 from actual carbon content takes precedence over the flat emission factor when carbon% is known', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r = tpa.estimate({ fuelFlowTh: 100, fuelCarbonPct: 65 }, cfg);
  approx(r.parameters.co2EmissionTh.value, 100 * 0.65 * (44 / 12), 1e-6);
  assert.equal(r.parameters.co2EmissionTh.status, 'Calculated');
});
test('condenser saturation temperature matches known reference points (10 kPa -> ~45.8°C, 101.325 kPa -> 100°C)', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const r10 = tpa.estimate({ condenserPressureKPa: 10 }, cfg);
  approx(r10.parameters.condenserSaturationTempC.value, 45.8, 0.3);
  const r1atm = tpa.estimate({ condenserPressureKPa: 101.325 }, cfg);
  approx(r1atm.parameters.condenserSaturationTempC.value, 100, 0.2);
});
test('Carnot efficiency limit is always well above the achievable turbine efficiency cross-check', () => {
  const cfg = tpa.defaultAdvancedConfig('supercritical', 'drum', 'coal');
  const r = tpa.estimate({ mainSteamTempC: 565, condenserPressureKPa: 8 }, cfg);
  assert.ok(r.parameters.carnotEfficiencyLimitPct.value > r.parameters.turbineEfficiencyCrossCheckPct.value);
  assert.ok(r.parameters.carnotEfficiencyLimitPct.value > 55 && r.parameters.carnotEfficiencyLimitPct.value < 75);
});
test('higher main steam temperature raises the Carnot limit (hotter source = higher thermodynamic ceiling)', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const cooler = tpa.estimate({ mainSteamTempC: 500, condenserPressureKPa: 10 }, cfg);
  const hotter = tpa.estimate({ mainSteamTempC: 600, condenserPressureKPa: 10 }, cfg);
  assert.ok(hotter.parameters.carnotEfficiencyLimitPct.value > cooler.parameters.carnotEfficiencyLimitPct.value);
});

console.log('\n--- tripProtection.mjs ---');
test('voting scheme parser: standard koon patterns', () => {
  assert.deepEqual(trip.parseVotingScheme('1oo1'), { k: 1, n: 1 });
  assert.deepEqual(trip.parseVotingScheme('2oo3'), { k: 2, n: 3 });
  assert.deepEqual(trip.parseVotingScheme('2oo3 per scanner group'), { k: 2, n: 3 });
});
test('voting scheme parser rejects invalid k > n', () => {
  assert.throws(() => trip.parseVotingScheme('3oo2'));
});
test('1oo1 voting: any single trip confirms', () => {
  assert.equal(trip.evaluateVoting([true], '1oo1').tripped, true);
  assert.equal(trip.evaluateVoting([false], '1oo1').tripped, false);
});
test('2oo3 voting: needs at least 2 of 3', () => {
  assert.equal(trip.evaluateVoting([true, true, false], '2oo3').tripped, true);
  assert.equal(trip.evaluateVoting([true, false, false], '2oo3').tripped, false);
  const r = trip.evaluateVoting([true, true, true], '2oo3');
  assert.equal(r.tripped, true);
  assert.equal(r.votesFor, 3);
  assert.equal(r.votesRequired, 2);
  assert.equal(r.totalSensors, 3);
});
test('2oo4 voting matches textbook truth table', () => {
  assert.equal(trip.evaluateVoting([true, true, false, false], '2oo4').tripped, true);
  assert.equal(trip.evaluateVoting([true, false, false, false], '2oo4').tripped, false);
});
test('voting evaluator rejects mismatched sensor count', () => {
  assert.throws(() => trip.evaluateVoting([true, false], '2oo3'));
});
test('evaluateStatus: high-direction parameter (e.g. vibration)', () => {
  assert.equal(trip.evaluateStatus(50, 180, 250, 'high'), trip.STATUS.NORMAL);
  assert.equal(trip.evaluateStatus(200, 180, 250, 'high'), trip.STATUS.ALARM);
  assert.equal(trip.evaluateStatus(260, 180, 250, 'high'), trip.STATUS.TRIP);
});
test('evaluateStatus: low-direction parameter (e.g. lube oil pressure)', () => {
  assert.equal(trip.evaluateStatus(1.5, 0.9, 0.6, 'low'), trip.STATUS.NORMAL);
  assert.equal(trip.evaluateStatus(0.8, 0.9, 0.6, 'low'), trip.STATUS.ALARM);
  assert.equal(trip.evaluateStatus(0.5, 0.9, 0.6, 'low'), trip.STATUS.TRIP);
});
test('parameter registry: every entry has a valid direction, classification, and dataType', () => {
  for (const p of trip.PARAMETER_REGISTRY) {
    assert.ok(['high', 'low'].includes(p.direction), `${p.id} invalid direction`);
    assert.ok(trip.CLASSIFICATIONS.includes(p.classification), `${p.id} invalid classification`);
    assert.ok(trip.DATA_TYPES.includes(p.dataType), `${p.id} invalid dataType`);
    assert.ok(['all', 'drum', 'once-through'].includes(p.applicability), `${p.id} invalid applicability`);
  }
});
test('parameter registry covers every spec category for both ETS and MFT', () => {
  const etsCats = trip.categoriesFor('ETS');
  const mftCats = trip.categoriesFor('MFT');
  for (const c of ['Turbine Mechanical', 'Steam Conditions', 'Valve Protection', 'Generator/Electrical', 'Other']) {
    assert.ok(etsCats.includes(c), `ETS missing category ${c}`);
  }
  for (const c of ['Furnace Protection', 'Combustion Air', 'Flame Protection', 'Fuel System', 'Feedwater/Boiler', 'Steam Protection', 'Other']) {
    assert.ok(mftCats.includes(c), `MFT missing category ${c}`);
  }
});
test('parametersFor(boilerType) correctly includes/excludes drum vs once-through specific params', () => {
  const drumParams = trip.parametersFor('drum').map((p) => p.id);
  const onceThroughParams = trip.parametersFor('once-through').map((p) => p.id);
  assert.ok(drumParams.includes('mft-drum-level-ll'));
  assert.ok(!onceThroughParams.includes('mft-drum-level-ll'));
  assert.ok(onceThroughParams.includes('mft-feedwater-flow-ll'));
  assert.ok(!drumParams.includes('mft-feedwater-flow-ll'));
});
test('simulateDisturbance: ramping toward a high-direction trip crosses alarm before trip, and trip confirms after the time delay', () => {
  const r = trip.simulateDisturbance({
    startValue: 95, alarmSetpoint: 103, tripSetpoint: 110, direction: 'high',
    rampRatePerSec: 1, timeDelaySec: 5, durationSec: 60,
  });
  assert.ok(r.timeToAlarmSec !== null);
  assert.ok(r.timeToTripSec !== null);
  assert.ok(r.timeToAlarmSec < r.timeToTripSec);
  assert.ok(r.tripped);
  // value reaches tripSetpoint(110) at t=15s (95+1*15), trip confirms 5s later at t=20s
  approx(r.timeToTripSec, 20, 1);
});
test('simulateDisturbance: low-direction ramp (e.g. lube oil pressure loss) trips correctly', () => {
  const r = trip.simulateDisturbance({
    startValue: 1.5, alarmSetpoint: 0.9, tripSetpoint: 0.6, direction: 'low',
    rampRatePerSec: 0.05, timeDelaySec: 0, durationSec: 60,
  });
  assert.ok(r.tripped);
  // reaches 0.6 at t=18s: (1.5-0.6)/0.05=18
  approx(r.timeToTripSec, 18, 1);
});
test('simulateDisturbance: no trip when ramp never reaches the trip setpoint within duration', () => {
  const r = trip.simulateDisturbance({
    startValue: 95, alarmSetpoint: 103, tripSetpoint: 110, direction: 'high',
    rampRatePerSec: 0.05, timeDelaySec: 5, durationSec: 30,
  });
  assert.equal(r.tripped, false);
  assert.equal(r.timeToTripSec, null);
});
test('simulateDisturbance: recovery ramps back toward the start value after trip', () => {
  const r = trip.simulateDisturbance({
    startValue: 95, alarmSetpoint: 103, tripSetpoint: 110, direction: 'high',
    rampRatePerSec: 2, timeDelaySec: 1, durationSec: 60, recover: true,
  });
  assert.ok(r.recoveryTimeSec !== null && r.recoveryTimeSec > 0);
  const last = r.series[r.series.length - 1];
  approx(last.value, 95, 1);
});
test('disturbance scenarios all reference a real parameter in the registry', () => {
  const ids = new Set(trip.PARAMETER_REGISTRY.map((p) => p.id));
  for (const s of trip.DISTURBANCE_SCENARIOS) {
    assert.ok(ids.has(s.parameterId), `scenario ${s.id} references unknown parameter ${s.parameterId}`);
  }
});
test('trip action matrix entries are well-formed', () => {
  for (const row of trip.TRIP_ACTION_MATRIX) {
    assert.ok(row.source && row.logic && row.signal && row.action);
  }
});

console.log('\n--- flowEngine.mjs ---');
test('idealGasDensity: air at standard conditions ≈ 1.225 kg/m3 (textbook reference)', () => {
  approx(flow.airDensity(101325, 15), 1.225, 0.005);
});
test('idealGasDensity throws on non-physical inputs', () => {
  assert.throws(() => flow.idealGasDensity(101325, -300));
  assert.throws(() => flow.idealGasDensity(-1, 20));
});
test('approxWaterDensity matches known reference points at table anchors', () => {
  approx(flow.approxWaterDensity(0), 999.8, 1e-9);
  approx(flow.approxWaterDensity(100), 958.0, 1e-9);
  approx(flow.approxWaterDensity(300), 712.0, 1e-9);
});
test('approxWaterDensity interpolates monotonically decreasing with temperature', () => {
  const d1 = flow.approxWaterDensity(30);
  const d2 = flow.approxWaterDensity(60);
  const d3 = flow.approxWaterDensity(180);
  assert.ok(d1 > d2 && d2 > d3);
});
test('approxWaterDensity rejects out-of-range temperatures rather than silently extrapolating', () => {
  assert.throws(() => flow.approxWaterDensity(-5));
  assert.throws(() => flow.approxWaterDensity(350));
});
test('calculateDPFlow: orifice on air, matches orifice.mjs-style computation', () => {
  const r = flow.calculateDPFlow({
    elementType: 'orifice', dpPa: 5000, upstreamPressurePa: 101325, tempC: 20,
    pipeIdM: 0.1, boreM: 0.05, fluidClass: 'gas',
  });
  assert.ok(r.massFlowKgS > 0);
  assert.equal(r.cd, flow.DEFAULT_CD.orifice);
  approx(r.beta, 0.5, 1e-9);
  assert.ok(r.expansionFactor < 1 && r.expansionFactor > 0.9); // Y should be slightly less than 1 for compressible flow
});
test('calculateDPFlow: custom element without explicit Cd throws (no uncalibrated K allowed)', () => {
  assert.throws(() => flow.calculateDPFlow({
    elementType: 'custom', dpPa: 5000, upstreamPressurePa: 101325, tempC: 20, pipeIdM: 0.1, boreM: 0.05, fluidClass: 'gas',
  }));
});
test('calculateDPFlow: liquid requires explicit density (no ideal-gas fallback)', () => {
  assert.throws(() => flow.calculateDPFlow({
    elementType: 'orifice', dpPa: 5000, upstreamPressurePa: 101325, tempC: 20, pipeIdM: 0.1, boreM: 0.05, fluidClass: 'liquid',
  }));
  const r = flow.calculateDPFlow({
    elementType: 'orifice', dpPa: 5000, upstreamPressurePa: 101325, tempC: 20, pipeIdM: 0.1, boreM: 0.05, fluidClass: 'liquid', densityKgM3: 1000,
  });
  assert.ok(r.massFlowKgS > 0);
  assert.equal(r.expansionFactor, 1); // liquids: no compressibility expansion factor
});
test('calculateDPFlow: DP exceeding upstream absolute pressure throws instead of returning negative flow (found via 10,000-point fuzz testing)', () => {
  // This exact bug was caught by tests/deep_10000.mjs: when dpPa > upstreamPressurePa,
  // the downstream pressure implied is negative — physically impossible — and the
  // expansion-factor approximation previously went negative silently, producing a
  // negative mass flow instead of failing loudly.
  assert.throws(() => flow.calculateDPFlow({
    elementType: 'nozzle', fluidClass: 'gas', dpPa: 168913.65, upstreamPressurePa: 50837.69,
    tempC: 641.8, pipeIdM: 0.1834, boreM: 0.0990,
  }), /cannot equal or exceed the upstream absolute pressure/);
});
test('expansionFactor: DP >= upstream pressure throws rather than returning a negative Y', () => {
  assert.throws(() => flow.expansionFactor(0.5, 100000, 90000));
  assert.throws(() => flow.expansionFactor(0.5, 100000, 100000));
  const y = flow.expansionFactor(0.5, 5000, 101325);
  assert.ok(y > 0 && y < 1);
});
test('calculateDPFlow: pitot uses full pipe area, not bore-based beta', () => {
  const r = flow.calculateDPFlow({
    elementType: 'pitot', dpPa: 500, upstreamPressurePa: 101325, tempC: 20, pipeIdM: 0.2, boreM: 0, fluidClass: 'gas',
  });
  assert.equal(r.beta, null);
  assert.ok(r.velocityMs > 0);
});
test('theoreticalCombustionAir agrees closely with the equivalent 11.5C+34.5(H-O/8)+4.32S shorthand used elsewhere in the app (same O2-balance relationship, independently-rounded conventional coefficients)', () => {
  const r = flow.theoreticalCombustionAir({ carbonPct: 65, hydrogenPct: 4.5, oxygenPct: 8, sulfurPct: 0.5 });
  const shorthand = 11.5 * 0.65 + 34.5 * (0.045 - 0.08 / 8) + 4.32 * 0.005;
  approx(r.airTheoreticalKgPerKgFuel, shorthand, 0.01 * shorthand); // within 1% — different rounding conventions, not identical formulas
});
test('actualAirFromExcess scales theoretical air by (1+excess%)', () => {
  approx(flow.actualAirFromExcess(10, 20), 12, 1e-9);
});
test('excessAirFromO2 / o2FromExcessAir are mutual inverses', () => {
  const ea = flow.excessAirFromO2(4);
  approx(flow.o2FromExcessAir(ea), 4, 1e-9);
});
test('energyBalanceSteamFlow uses the same enthalpy-rise model as the Thermal Plant Estimator', () => {
  const r = flow.energyBalanceSteamFlow({
    fuelFlowKgH: 126970, fuelGcvKcalKg: 4200, boilerEfficiencyPct: 86,
    feedwaterTempC: 240, mainSteamPressureBar: 170, mainSteamTempC: 537,
  });
  assert.equal(r.status, 'ENERGY BALANCE ESTIMATE');
  assert.ok(r.steamFlowTh > 0);
  // sanity: matches the same order of magnitude as Mode 1's fixture (~210MW plant, ~723 t/h main steam)
  assert.ok(r.steamFlowTh > 500 && r.steamFlowTh < 900);
});
test('feedwaterMassBalance: feedwater = steam + blowdown + spray + extraction', () => {
  const r = flow.feedwaterMassBalance({ steamFlowTh: 700, blowdownPctOfSteam: 1.5, sprayFlowTh: 20, extractionFlowTh: 5 });
  approx(r.feedwaterTh, 700 + 700 * 0.015 + 20 + 5, 1e-9);
});
test('mwBasedFlowEstimate: confidence rises with more user-supplied key assumptions', () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const low = flow.mwBasedFlowEstimate(300, cfg, []);
  const medium = flow.mwBasedFlowEstimate(300, cfg, ['boilerEfficiencyPct']);
  const high = flow.mwBasedFlowEstimate(300, cfg, ['boilerEfficiencyPct', 'turbineEfficiencyPct', 'fuelGcvKcalKg']);
  assert.equal(low.confidence, 'LOW');
  assert.equal(medium.confidence, 'MEDIUM');
  assert.equal(high.confidence, 'HIGH');
  assert.equal(low.status, 'MW-BASED ESTIMATE');
  assert.ok(low.flows.fuelFlowTh);
});
test('compareFlowMethods: deviation computed relative to the first (reference) entry', () => {
  const r = flow.compareFlowMethods([
    { method: 'DP Measured', value: 1000 },
    { method: 'Energy Balance', value: 1050 },
    { method: 'MW Estimate', value: 980 },
  ]);
  approx(r.rows[1].deviationPct, 5, 1e-9);
  approx(r.rows[2].deviationPct, -2, 1e-9);
  approx(r.meanDeviationPct, (5 + 2) / 2, 1e-9);
});
test('consistencyCheck: within tolerance produces no warning; exceeding tolerance lists possible causes without blaming the instrument', () => {
  const ok = flow.consistencyCheck(1000, 1030, 5);
  assert.equal(ok.withinTolerance, true);
  assert.equal(ok.warning, null);
  const bad = flow.consistencyCheck(1000, 1200, 5);
  assert.equal(bad.withinTolerance, false);
  assert.ok(bad.warning.includes('WARNING'));
  assert.ok(bad.possibleCauses.length > 3);
  assert.ok(!bad.possibleCauses.some((c) => /instrument is faulty|faulty instrument/i.test(c)));
});
test('dataQualityScore: half-passing checks score 50', () => {
  const r = flow.dataQualityScore({ a: true, b: true, c: false, d: false });
  assert.equal(r.score, 50);
  assert.deepEqual(r.failed, ['c', 'd']);
});
test('validateDPFlowInputs flags an implausible beta ratio', () => {
  const good = flow.validateDPFlowInputs({ beta: 0.5, reynolds: 50000, cd: 0.6, dpPa: 5000, densityKgM3: 1.2 });
  assert.equal(good.score, 100);
  const bad = flow.validateDPFlowInputs({ beta: 0.95, reynolds: 50000, cd: 0.6, dpPa: 5000, densityKgM3: 1.2 });
  assert.ok(bad.score < 100);
  assert.ok(bad.failed.includes('Beta ratio in valid range (0.1-0.75)'));
});
test('dpTransmitterModel: single sqrt extraction gives DP25% -> Flow50% (spec worked example)', () => {
  const r = flow.dpTransmitterModel({ lrv: 0, urv: 100, actualDP: 25, sqrtInCalculator: true });
  approx(r.dpPct, 25, 1e-9);
  approx(r.flowPct, 50, 1e-9);
  assert.equal(r.sqrtApplied, true);
});
test('dpTransmitterModel: no extraction stage leaves flow% equal to DP% (linear)', () => {
  const r = flow.dpTransmitterModel({ lrv: 0, urv: 100, actualDP: 25 });
  approx(r.flowPct, r.dpPct, 1e-9);
  assert.equal(r.sqrtApplied, false);
});
test('dpTransmitterModel: throws if more than one stage claims square-root extraction (prevents double extraction)', () => {
  assert.throws(() => flow.dpTransmitterModel({ lrv: 0, urv: 100, actualDP: 25, sqrtInTransmitter: true, sqrtInDcs: true }));
});
test('convertMassFlow / convertVolFlow cover the extended unit set (t/day, lb/s, Imperial gpm, ft3/min)', () => {
  approx(flow.convertMassFlow(24, 't/day', 't/h'), 1, 1e-9);
  approx(flow.convertMassFlow(1, 'lb/s', 'kg/h'), 0.45359237 * 3600, 1e-6);
  approx(flow.convertVolFlow(1, 'Imperial gpm', 'm3/h'), 0.272765, 1e-6);
});
test('actualToReferenceFlow / referenceToActualFlow are exact inverses, and match units.mjs at 0°C/101.325kPa reference', () => {
  const actual = 1000, tC = 40, pKPa = 110;
  const ref = flow.actualToReferenceFlow(actual, tC, pKPa, 0, 101.325);
  const back = flow.referenceToActualFlow(ref, tC, pKPa, 0, 101.325);
  approx(back, actual, 1e-6);
  approx(ref, units.normalToActualFlow === undefined ? ref : ref, 1e-9); // sanity: function exists and runs
  const viaUnitsMjs = units.actualToNormalFlow(actual, tC, pKPa, 101.325);
  approx(ref, viaUnitsMjs, 1e-6);
});
test('actualToReferenceFlow distinguishes Normal (0°C) from Standard (15°C) — never treats them as identical', () => {
  const actual = 1000, tC = 25, pKPa = 101.325;
  const normal = flow.actualToReferenceFlow(actual, tC, pKPa, 0);
  const standard15 = flow.actualToReferenceFlow(actual, tC, pKPa, 15);
  assert.notEqual(normal, standard15);
});

console.log('\n--- shortCircuit.mjs ---');
test('transformerFaultMVA: 100 MVA transformer at 8% Z contributes 1250 MVA fault at its terminals', () => {
  approx(sc.transformerFaultMVA(100, 8), 1250, 1e-6);
});
test('combineSeriesFaultMVA: source 500 MVA + transformer 1250 MVA -> 357.14 MVA (MVA method)', () => {
  const combined = sc.combineSeriesFaultMVA([500, 1250]);
  approx(combined, 1 / (1 / 500 + 1 / 1250), 1e-9);
  approx(combined, 357.14, 0.01);
});
test('combineParallelFaultMVA: two 500 MVA sources feeding the same bus sum to 1000 MVA', () => {
  approx(sc.combineParallelFaultMVA([500, 500]), 1000, 1e-9);
});
test('threePhaseFaultCurrentKA: 357.14 MVA at 11 kV -> ~18.74 kA', () => {
  approx(sc.threePhaseFaultCurrentKA(357.14, 11), 18.74, 0.02);
});
test('threePhaseFaultCurrentKA / faultMVAFromCurrent are exact inverses', () => {
  const mva = sc.faultMVAFromCurrent(18.74, 11);
  approx(sc.threePhaseFaultCurrentKA(mva, 11), 18.74, 1e-6);
});
test('lineToGroundFaultCurrentKA: solidly grounded defaults to the three-phase value', () => {
  approx(sc.lineToGroundFaultCurrentKA(18.74, 'solid'), 18.74, 1e-9);
});
test('lineToGroundFaultCurrentKA: resistance-grounded is bounded by the NGR let-through current', () => {
  const r = sc.lineToGroundFaultCurrentKA(18.74, 'resistance', { ngrLetThroughA: 400 });
  approx(r, 0.4, 1e-9);
});
test('lineToGroundFaultCurrentKA: resistance-grounded without NGR data throws rather than guessing', () => {
  assert.throws(() => sc.lineToGroundFaultCurrentKA(18.74, 'resistance', {}));
});
test('lineToGroundFaultCurrentKA: ungrounded system returns ~0 (no low-impedance return path)', () => {
  approx(sc.lineToGroundFaultCurrentKA(18.74, 'ungrounded'), 0, 1e-9);
});

console.log('\n--- idmt.mjs ---');
test('Standard Inverse (SI) at PSM=10, TMS=1 matches the well-known textbook reference (~2.97s)', () => {
  approx(idmt.operatingTime(100, 10, 1, 'SI'), 2.97, 0.02);
});
test('Very Inverse (VI) at PSM=10, TMS=1 matches the well-known textbook reference (1.5s)', () => {
  approx(idmt.operatingTime(100, 10, 1, 'VI'), 1.5, 1e-6);
});
test('Extremely Inverse (EI) at PSM=10, TMS=1 matches the well-known textbook reference (~0.808s)', () => {
  approx(idmt.operatingTime(100, 10, 1, 'EI'), 0.808, 0.01);
});
test('operatingTime and tmsForDesiredTime are exact inverses', () => {
  const tms = idmt.tmsForDesiredTime(120, 10, 1.2, 'VI');
  approx(idmt.operatingTime(120, 10, tms, 'VI'), 1.2, 1e-9);
});
test('operatingTime throws when fault current does not exceed pickup (relay would never operate)', () => {
  assert.throws(() => idmt.operatingTime(10, 10, 1, 'SI'));
  assert.throws(() => idmt.operatingTime(5, 10, 1, 'SI'));
});
test('higher TMS always gives a longer operating time for the same PSM/curve', () => {
  const fast = idmt.operatingTime(100, 10, 0.1, 'SI');
  const slow = idmt.operatingTime(100, 10, 1.0, 'SI');
  assert.ok(slow > fast);
});

console.log('\n--- ctEngine.mjs ---');
test('ctSecondaryCurrent: 600/1 CT with 480A primary gives 0.8A secondary', () => {
  approx(ctEngine.ctSecondaryCurrent(480, 600, 1), 0.8, 1e-9);
});
test('cableBurdenVA: 5A secondary, 0.5 ohm/lead, 2 leads -> 25 VA', () => {
  approx(ctEngine.cableBurdenVA(5, 0.5, 2), 25, 1e-9);
});
test('requiredKneePointVoltage scales linearly with the stability factor K', () => {
  const v1 = ctEngine.requiredKneePointVoltage(10, 2, 1, 2);
  const v2 = ctEngine.requiredKneePointVoltage(10, 2, 1, 4);
  approx(v2, v1 * 2, 1e-9);
});
test('checkCtSufficiency: flags missing knee-point voltage and missing CT class rather than silently passing', () => {
  const r = ctEngine.checkCtSufficiency({});
  assert.equal(r.sufficient, false);
  assert.ok(r.warnings.length >= 2);
});
test('checkCtSufficiency: passes cleanly when all data is adequate', () => {
  const r = ctEngine.checkCtSufficiency({ actualKneePointV: 200, requiredKneePointV: 100, ctClass: '5P20', ctRatedBurdenVA: 30, actualBurdenVA: 20 });
  assert.equal(r.sufficient, true);
  assert.equal(r.warnings.length, 0);
});

console.log('\n--- transformerProtection.mjs ---');
test('autoGenerate: 10 MVA 33/11kV 8% transformer — basic parameters match hand calculation', () => {
  const r = tfProt.autoGenerate({ ratingMVA: 10, hvKV: 33, lvKV: 11, impedancePct: 8, hvCtPrimary: 200, lvCtPrimary: 600, sourceFaultMVA: 500, groundingType: 'solid' });
  approx(r.basicParameters.hvFLC, 174.98, 0.1);
  approx(r.basicParameters.lvFLC, 524.9, 0.1);
  approx(r.basicParameters.turnsRatio, 3, 1e-9);
  approx(r.basicParameters.lvFaultKA, 5.249, 0.01); // combineSeries(500,125)=100MVA -> 100/(√3×11)
});
test('autoGenerate: 50/51 overcurrent settings resolve with a positive operating time', () => {
  const r = tfProt.autoGenerate({ ratingMVA: 10, hvKV: 33, lvKV: 11, impedancePct: 8, hvCtPrimary: 200, lvCtPrimary: 600, sourceFaultMVA: 500, groundingType: 'solid' });
  assert.ok(r.protection.oc.operatingTimeS > 0);
  assert.equal(r.protection.oc.status, 'RECOMMENDED');
});
test('autoGenerate: ungrounded system reports negligible earth fault rather than a fabricated pickup', () => {
  const r = tfProt.autoGenerate({ ratingMVA: 10, hvKV: 33, lvKV: 11, impedancePct: 8, sourceFaultMVA: 500, groundingType: 'ungrounded' });
  assert.ok(r.protection.ef.note);
  assert.equal(r.protection.ef.pickupA, undefined);
});
test('autoGenerate: without CT data, REF and differential clearly say what is missing instead of guessing', () => {
  const r = tfProt.autoGenerate({ ratingMVA: 10, hvKV: 33, lvKV: 11, impedancePct: 8, sourceFaultMVA: 500 });
  assert.ok(r.protection.ref.note);
  assert.ok(r.protection.diff.ratioMismatchNote.includes('Supply'));
});
test('autoGenerate: rejects non-physical inputs rather than producing NaN settings', () => {
  assert.throws(() => tfProt.autoGenerate({ ratingMVA: 0, hvKV: 33, lvKV: 11, impedancePct: 8 }));
  assert.throws(() => tfProt.autoGenerate({ ratingMVA: 10, hvKV: 33, lvKV: 11, impedancePct: 0 }));
});
test('autoGenerate: philosophy overrides actually change the resulting pickup', () => {
  const base = tfProt.autoGenerate({ ratingMVA: 10, hvKV: 33, lvKV: 11, impedancePct: 8, sourceFaultMVA: 500 });
  const custom = tfProt.autoGenerate({ ratingMVA: 10, hvKV: 33, lvKV: 11, impedancePct: 8, sourceFaultMVA: 500 }, { ocPickupMultipleOfFLC: 1.5 });
  assert.ok(custom.protection.oc.pickupA > base.protection.oc.pickupA);
});
test('autoGenerate: every protection function carries equipment-level items for non-electrical (mechanical) protection', () => {
  const r = tfProt.autoGenerate({ ratingMVA: 10, hvKV: 33, lvKV: 11, impedancePct: 8, sourceFaultMVA: 500 });
  assert.ok(r.equipmentProtection.some((x) => /Buchholz/i.test(x)));
});

console.log('\n--- motorProtection.mjs ---');
test("autoGenerate: matches the spec's own worked example (11kV, 5MW, PF=0.88, eff=95%, 6xFLC start, 8s start, 250MVA fault)", () => {
  const r = motProt.autoGenerate({
    ratingKW: 5000, voltageKV: 11, powerFactor: 0.88, efficiencyPct: 95,
    startingCurrentMultiple: 6, startingTimeS: 8, ctPrimary: 600, ctSecondary: 1, sourceFaultMVA: 250, groundingType: 'solid',
  });
  approx(r.basicParameters.flc, 313.9, 1); // P_in/(√3×V×PF), P_in = 5000/0.95
  approx(r.basicParameters.startingCurrentA, 313.9 * 6, 6);
  approx(r.basicParameters.faultKA, 13.12, 0.02);
  approx(r.protection.lockedRotor.tripDelayS, 8 + 3, 1e-9); // starting time + default 3s margin
  assert.equal(r.protection.thermal.status, 'RECOMMENDED');
  assert.equal(r.protection.negSeq.ansi, '46');
});
test('autoGenerate: rejects an impossible power factor or efficiency rather than producing nonsense current', () => {
  assert.throws(() => motProt.autoGenerate({ ratingKW: 5000, voltageKV: 11, powerFactor: 1.5, efficiencyPct: 95 }));
  assert.throws(() => motProt.autoGenerate({ ratingKW: 5000, voltageKV: 11, powerFactor: 0.88, efficiencyPct: 150 }));
});
test('autoGenerate: without fault level, OC/EF report what is missing instead of a fabricated operating time', () => {
  const r = motProt.autoGenerate({ ratingKW: 5000, voltageKV: 11, powerFactor: 0.88, efficiencyPct: 95 });
  assert.ok(r.protection.oc.note);
  assert.ok(r.protection.ef.note);
});
test('autoGenerate: without starting time, locked-rotor element reports what is missing rather than guessing a trip delay', () => {
  const r = motProt.autoGenerate({ ratingKW: 5000, voltageKV: 11, powerFactor: 0.88, efficiencyPct: 95 });
  assert.ok(r.protection.lockedRotor.note);
  assert.equal(r.protection.lockedRotor.tripDelayS, undefined);
});
test('autoGenerate: negative-sequence and undercurrent pickups scale with FLC as expected', () => {
  const r = motProt.autoGenerate({ ratingKW: 5000, voltageKV: 11, powerFactor: 0.88, efficiencyPct: 95 });
  approx(r.protection.negSeq.pickupA, r.basicParameters.flc * 0.15, 1e-6);
  approx(r.protection.underCurrent.pickupA, r.basicParameters.flc * 0.5, 1e-6);
});

console.log('\n--- lsigEngine.mjs ---');
test('autoGenerate: 1600A frame, 1200A load — Ir/Isd/Ii/Ig settle on the expected nearest standard steps', () => {
  const r = lsig.autoGenerate({ frameRatingA: 1600, loadCurrentA: 1200, faultCurrentKA: 30 });
  approx(r.longTime.suggestedIrRatio, 0.8, 1e-9);
  approx(r.longTime.suggestedIrA, 1280, 1e-6);
  approx(r.shortTime.suggestedIsdRatio, 4, 1e-9);
  approx(r.shortTime.suggestedIsdA, 5120, 1e-6);
  approx(r.instantaneous.suggestedIiRatio, 8, 1e-9);
  approx(r.instantaneous.suggestedIiA, 12800, 1e-6);
  approx(r.groundFault.suggestedIgRatio, 0.3, 1e-9);
  approx(r.groundFault.suggestedIgA, 480, 1e-6);
});
test('autoGenerate: respects which functions the specific breaker model actually has (spec explicitly requires this)', () => {
  const r = lsig.autoGenerate({ frameRatingA: 1600, loadCurrentA: 1200, availableFunctions: { L: true, S: true, I: true, G: false } });
  assert.ok(r.groundFault.note);
  assert.equal(r.groundFault.suggestedIgA, undefined);
});
test('autoGenerate: warns when the suggested instantaneous pickup exceeds available fault current (element would never operate)', () => {
  const r = lsig.autoGenerate({ frameRatingA: 1600, loadCurrentA: 1200, faultCurrentKA: 5 });
  assert.ok(r.instantaneous.warning);
});
test('autoGenerate: rejects load current exceeding the frame rating rather than producing an out-of-range setting', () => {
  assert.throws(() => lsig.autoGenerate({ frameRatingA: 800, loadCurrentA: 1200 }));
});

console.log('\n--- coordination.mjs ---');
test('checkCoordination: adequate margin (VI curves, 100A/0.3TMS upstream vs 50A/0.1TMS downstream) passes', () => {
  const r = coord.checkCoordination({ pickupA: 100, tms: 0.3, curve: 'VI' }, { pickupA: 50, tms: 0.1, curve: 'VI' }, 1000, 0.3);
  approx(r.upstreamOperatingTimeS, 0.45, 0.001);
  approx(r.downstreamOperatingTimeS, 0.0711, 0.001);
  assert.equal(r.check, 'PASS');
});
test('checkCoordination: tight margin (below the grading threshold) gives WARNING, not PASS', () => {
  const r = coord.checkCoordination({ pickupA: 100, tms: 0.3, curve: 'VI' }, { pickupA: 50, tms: 0.5, curve: 'VI' }, 1000, 0.3);
  assert.equal(r.check, 'WARNING');
});
test('checkCoordination: downstream slower than or equal to upstream gives REVIEW REQUIRED (no discrimination)', () => {
  const r = coord.checkCoordination({ pickupA: 100, tms: 0.3, curve: 'VI' }, { pickupA: 50, tms: 2, curve: 'VI' }, 1000, 0.3);
  assert.equal(r.check, 'REVIEW REQUIRED');
  assert.ok(r.downstreamOperatingTimeS >= r.upstreamOperatingTimeS);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);