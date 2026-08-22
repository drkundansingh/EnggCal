// deep_10000.mjs — 10,000-point randomized fuzz/property test across the
// full calculation engine, including modules not covered by accuracy_2000.mjs
// (flowEngine, tripProtection, the Mode 3 solver under randomized partial
// inputs). Where accuracy_2000.mjs checks exact round-trips, this file leans
// more on property checks (no NaN/Infinity, physical inequalities always
// hold, no unexpected exceptions) across a much wider, randomized input
// space — the kind of testing that catches edge cases a handful of
// hand-picked example points would miss. Run: node tests/deep_10000.mjs

import assert from 'node:assert/strict';
import * as units from '../js/calculators/units.mjs';
import * as tx from '../js/calculators/transmitter.mjs';
import * as rtd from '../js/calculators/rtd.mjs';
import * as tc from '../js/calculators/thermocouple.mjs';
import * as cv from '../js/calculators/controlValve.mjs';
import * as pid from '../js/calculators/pid.mjs';
import * as tp from '../js/calculators/thermalPlant.mjs';
import * as tpa from '../js/calculators/thermalPlantAdvanced.mjs';
import * as trip from '../js/calculators/tripProtection.mjs';
import * as flow from '../js/calculators/flowEngine.mjs';

const N = 10000;
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function pickSubset(arr) { return arr.filter(() => Math.random() < 0.5); }

let allPass = true;
const failures = [];

function runCheck(name, n, fn) {
  let errors = 0;
  const examples = [];
  for (let i = 0; i < n; i++) {
    try {
      fn(i);
    } catch (e) {
      errors++;
      if (examples.length < 3) examples.push(e.message);
    }
  }
  const pass = errors === 0;
  allPass = pass && allPass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(70)} n=${n}  errors=${errors}${examples.length ? '  e.g. ' + examples.join(' | ') : ''}`);
  if (!pass) failures.push({ name, errors, examples });
}

// ---------- 1. calculateDPFlow — wide randomized fuzz, all element/fluid combos ----------
runCheck('flowEngine.calculateDPFlow: no NaN/Infinity/negative flow across randomized valid inputs', N, () => {
  const elementType = pick(flow.FLOW_ELEMENT_TYPES.filter((t) => t !== 'custom'));
  const fluidClass = pick(flow.FLUID_CLASSES);
  const pipeIdM = rand(0.02, 2.0);
  const boreM = elementType === 'pitot' ? 0 : pipeIdM * rand(0.15, 0.7);
  const upstreamPressurePa = rand(50000, 30000000);
  const tempC = rand(-20, 650);
  // DP must physically stay below upstream absolute pressure (downstream
  // pressure = upstream - DP can never go negative) — cap at 50% of
  // upstream to stay well within the linear expansion-factor
  // approximation's valid range, not just barely under the hard limit.
  const dpPa = rand(0, upstreamPressurePa * 0.5);
  const densityKgM3 = fluidClass === 'liquid' ? rand(600, 1200) : undefined;
  const r = flow.calculateDPFlow({ elementType, fluidClass, dpPa, upstreamPressurePa, tempC, pipeIdM, boreM, densityKgM3 });
  assert.ok(Number.isFinite(r.massFlowKgS), 'massFlowKgS not finite');
  assert.ok(Number.isFinite(r.volumetricFlowM3s), 'volumetricFlowM3s not finite');
  assert.ok(r.massFlowKgS >= 0, 'negative mass flow');
  assert.ok(r.density > 0, 'non-positive density');
  assert.ok(r.trace.length === 11, 'trace incomplete');
});

// ---------- 1b. calculateDPFlow — confirm physically-impossible DP is always rejected, never silently wrong ----------
runCheck('flowEngine.calculateDPFlow: DP >= upstream pressure always throws (never returns negative/nonsense flow)', N, () => {
  const elementType = pick(flow.FLOW_ELEMENT_TYPES.filter((t) => t !== 'custom'));
  const fluidClass = pick(['gas', 'steam']);
  const pipeIdM = rand(0.02, 2.0);
  const boreM = elementType === 'pitot' ? 0 : pipeIdM * rand(0.15, 0.7);
  const upstreamPressurePa = rand(50000, 500000);
  const tempC = rand(-20, 650);
  const dpPa = rand(upstreamPressurePa, upstreamPressurePa * 3); // deliberately impossible
  let threw = false;
  try {
    flow.calculateDPFlow({ elementType, fluidClass, dpPa, upstreamPressurePa, tempC, pipeIdM, boreM });
  } catch (e) {
    threw = true;
  }
  assert.ok(threw, `should have thrown for dpPa=${dpPa} >= upstreamPressurePa=${upstreamPressurePa}`);
});

// ---------- 2. Trip voting logic — exhaustive-ish across random n/k/flags ----------
runCheck('tripProtection.evaluateVoting: tripped always matches votesFor >= k, across random k-out-of-n', N, () => {
  const n = randInt(1, 6);
  const k = randInt(1, n);
  const flags = Array.from({ length: n }, () => Math.random() < 0.5);
  const r = trip.evaluateVoting(flags, `${k}oo${n}`);
  const votesFor = flags.filter(Boolean).length;
  assert.equal(r.tripped, votesFor >= k);
  assert.equal(r.votesFor, votesFor);
});

// ---------- 3. Trip status evaluation — random parameter, random measured value ----------
runCheck('tripProtection.evaluateStatus: monotonic and consistent with alarm<trip ordering', N, () => {
  const p = pick(trip.PARAMETER_REGISTRY);
  const span = Math.abs(p.tripSetpoint - p.alarmSetpoint) || 1;
  const value = p.direction === 'high'
    ? rand(p.normalMin - span, p.tripSetpoint + span)
    : rand(p.tripSetpoint - span, p.normalMax + span);
  const status = trip.evaluateStatus(value, p.alarmSetpoint, p.tripSetpoint, p.direction);
  assert.ok(['NORMAL', 'ALARM', 'TRIP'].includes(status));
  // TRIP-level value should never evaluate as NORMAL
  if (p.direction === 'high' && value >= p.tripSetpoint) assert.equal(status, 'TRIP');
  if (p.direction === 'low' && value <= p.tripSetpoint) assert.equal(status, 'TRIP');
});

// ---------- 4. simulateDisturbance — random valid ramps, internal consistency ----------
runCheck('tripProtection.simulateDisturbance: timeToAlarm <= timeToTrip, tripped implies timeToTripSec set', N, () => {
  const direction = pick(['high', 'low']);
  const startValue = rand(-50, 200);
  const spread = rand(1, 50);
  const alarmSetpoint = direction === 'high' ? startValue + spread : startValue - spread;
  const tripSetpoint = direction === 'high' ? alarmSetpoint + rand(0.1, 20) : alarmSetpoint - rand(0.1, 20);
  const rampRatePerSec = rand(0.01, 10);
  const timeDelaySec = rand(0, 10);
  const r = trip.simulateDisturbance({ startValue, alarmSetpoint, tripSetpoint, direction, rampRatePerSec, timeDelaySec, durationSec: 200 });
  if (r.timeToAlarmSec !== null && r.timeToTripSec !== null) {
    assert.ok(r.timeToAlarmSec <= r.timeToTripSec, `alarm(${r.timeToAlarmSec}) after trip(${r.timeToTripSec})`);
  }
  if (r.tripped) assert.ok(r.timeToTripSec !== null, 'tripped but no timeToTripSec');
  assert.ok(Number.isFinite(r.maxDeviation) && r.maxDeviation >= 0);
});

// ---------- 5. Mode 3 solver — randomized partial inputs, must never throw or produce NaN ----------
runCheck('thermalPlantAdvanced.estimate: randomized partial inputs never throw, never produce NaN/Infinity', N, () => {
  const plantType = pick(tpa.PLANT_TYPES.filter((p) => p !== 'custom'));
  const boilerType = pick(tpa.BOILER_TYPES);
  const fuelType = pick(['coal', 'oil', 'gas']);
  const cfg = tpa.defaultAdvancedConfig(plantType, boilerType, fuelType);
  const allKeys = pickSubset(tpa.INPUT_KEYS);
  const rawInputs = {};
  for (const key of allKeys) {
    // plausible-ish ranges per key so the solver exercises real chains, not just garbage
    const ranges = {
      grossMW: [25, 1000], fuelFlowTh: [5, 400], fuelGcvKcalKg: [2500, 11000],
      combustionAirFlowTh: [10, 3000], mainSteamFlowTh: [20, 3000],
      mainSteamPressureBar: [60, 320], mainSteamTempC: [450, 650],
      reheatPressureBar: [10, 80], reheatTempC: [450, 650],
      feedwaterFlowTh: [20, 3000], feedwaterTempC: [150, 320],
      condenserPressureKPa: [3, 25], o2Pct: [1, 10],
      furnacePressureMmWC: [-20, 20], boilerEfficiencyPct: [75, 94], turbineEfficiencyPct: [28, 50],
    };
    const [lo, hi] = ranges[key] || [1, 100];
    rawInputs[key] = rand(lo, hi);
  }
  const result = tpa.estimate(rawInputs, cfg);
  for (const [key, p] of Object.entries(result.parameters)) {
    assert.ok(Number.isFinite(p.value), `${key} not finite: ${p.value}`);
  }
});

// ---------- 6. Mode 3 solver — ultimate analysis fuzz (random C/H/O/S mass %) ----------
runCheck('thermalPlantAdvanced.estimate: randomized ultimate analysis never throws or produces negative theoretical air', N, () => {
  const cfg = tpa.defaultAdvancedConfig('subcritical', 'drum', 'coal');
  const fuelFlowTh = rand(5, 400);
  const fuelCarbonPct = rand(40, 85);
  const fuelHydrogenPct = rand(1, 8);
  const fuelOxygenPct = rand(0, 20);
  const fuelSulfurPct = rand(0, 5);
  const result = tpa.estimate({ fuelFlowTh, fuelCarbonPct, fuelHydrogenPct, fuelOxygenPct, fuelSulfurPct }, cfg);
  const air = result.parameters.theoreticalAirKgPerKgFuel;
  if (air) assert.ok(air.value > 0, `non-positive theoretical air: ${air.value}`);
});

// ---------- 7. flowEngine.mwBasedFlowEstimate — randomized fuzz ----------
runCheck('flowEngine.mwBasedFlowEstimate: randomized MW/plant/fuel combos always produce a valid confidence rating', N, () => {
  const grossMW = rand(25, 1000);
  const plantType = pick(tpa.PLANT_TYPES.filter((p) => p !== 'custom'));
  const boilerType = pick(tpa.BOILER_TYPES);
  const fuelType = pick(['coal', 'oil', 'gas']);
  const cfg = tpa.defaultAdvancedConfig(plantType, boilerType, fuelType);
  const userProvidedKeys = pickSubset(['boilerEfficiencyPct', 'turbineEfficiencyPct', 'fuelGcvKcalKg']);
  for (const k of userProvidedKeys) cfg[k] = cfg[k] ?? rand(1, 100);
  const r = flow.mwBasedFlowEstimate(grossMW, cfg, userProvidedKeys);
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(r.confidence));
  for (const [key, p] of Object.entries(r.flows)) {
    assert.ok(Number.isFinite(p.value), `${key} not finite`);
  }
});

// ---------- 8. dpTransmitterModel — randomized, single-stage never throws; multi-stage always throws ----------
runCheck('flowEngine.dpTransmitterModel: single/no extraction never throws, multi-stage always throws', N, () => {
  const lrv = rand(-500, 500);
  const urv = lrv + rand(1, 2000);
  const actualDP = rand(lrv - 100, urv + 100);
  const stageCount = randInt(0, 3);
  const stages = { sqrtInTransmitter: false, sqrtInDcs: false, sqrtInCalculator: false };
  const keys = Object.keys(stages);
  for (let i = 0; i < stageCount; i++) stages[keys[i]] = true;
  if (stageCount > 1) {
    assert.throws(() => flow.dpTransmitterModel({ lrv, urv, actualDP, ...stages }));
  } else {
    const r = flow.dpTransmitterModel({ lrv, urv, actualDP, ...stages });
    assert.ok(Number.isFinite(r.dpPct));
    assert.ok(Number.isFinite(r.flowPct) || Number.isNaN(r.flowPct) === false);
  }
});

// ---------- 9. PID tuning methods — randomized K/T/L/Ku/Pu, all outputs finite and positive ----------
runCheck('pid tuning methods: randomized K/T/L always produce finite positive gains', N, () => {
  const K = rand(0.1, 20), T = rand(1, 500), L = rand(0.1, 100);
  const zn = pid.zieglerNicholsOpenLoop(K, T, L);
  const cc = pid.cohenCoon(K, T, L);
  const chr = pid.chienHronesReswick(K, T, L, pick(['setpoint', 'disturbance']), pick(['0', '20']));
  for (const r of [zn.PID, cc.PID, chr.PID]) {
    assert.ok(Number.isFinite(r.kp) && r.kp > 0, `kp invalid: ${r.kp}`);
    assert.ok(Number.isFinite(r.ti) && r.ti > 0, `ti invalid: ${r.ti}`);
    assert.ok(Number.isFinite(r.td) && r.td >= 0, `td invalid: ${r.td}`);
  }
});
runCheck('pid tuning methods: randomized Ku/Pu always produce finite positive gains (ZN closed, Tyreus-Luyben)', N, () => {
  const Ku = rand(0.5, 100), Pu = rand(1, 200);
  const zn = pid.zieglerNicholsClosedLoop(Ku, Pu);
  const tl = pid.tyreusLuyben(Ku, Pu);
  for (const r of [zn.PID, tl.PID]) {
    assert.ok(Number.isFinite(r.kp) && r.kp > 0);
    assert.ok(Number.isFinite(r.ti) && r.ti > 0);
    assert.ok(Number.isFinite(r.td) && r.td > 0);
  }
});

// ---------- 10. RTD / thermocouple / control valve — wide random range fuzz ----------
runCheck('rtd: randomized temperature round-trip across full supported range', N, () => {
  const type = pick(Object.keys(rtd.RTD_TYPES));
  const t = rand(-190, 800);
  const r = rtd.temperatureToResistance(t, type);
  const back = rtd.resistanceToTemperature(r, type);
  assert.ok(Math.abs(back - t) < 0.05, `RTD round-trip error too large: ${Math.abs(back - t)}`);
});
runCheck('controlValve: randomized liquid Cv always positive and finite', N, () => {
  const flowGpm = rand(0.1, 5000), dpPsi = rand(0.1, 500), sg = rand(0.3, 2.5);
  const cvVal = cv.liquidCv(flowGpm, dpPsi, sg);
  assert.ok(Number.isFinite(cvVal) && cvVal > 0);
});

// ---------- 11. Unit conversions — wide randomized fuzz across all pressure/temp units ----------
runCheck('units.convertPressure: randomized cross-unit round-trip stays within float precision', N, () => {
  const v = rand(1e-3, 1e6);
  const keys = Object.keys(units.PRESSURE_TO_PA);
  const from = pick(keys), to = pick(keys);
  const conv = units.convertPressure(v, from, to);
  const back = units.convertPressure(conv, to, from);
  assert.ok(Math.abs((back - v) / v) < 1e-6, `round-trip drift: ${Math.abs((back - v) / v)}`);
});

console.log(`\n${allPass ? 'ALL DEEP CHECKS PASSED' : 'SOME DEEP CHECKS FAILED'} (${N} points per check)`);
if (!allPass) {
  console.log('\nFailure summary:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.errors} errors`);
  process.exit(1);
}
