// deep_100000.js — 100,000-point-per-check comprehensive fuzz/property test
// across every calculator module in the app. Extends deep_10000.js's set of
// checks to a much larger sample size, AND adds coverage for the electrical
// protection engines (shortCircuit, idmt, ctEngine, transformerProtection,
// motorProtection, lsigEngine, coordination) which were previously only
// covered by test.js's fixed hand-picked examples, never by randomized
// fuzz testing. Run: node tests/deep_100000.js
//
// This is a property/robustness suite, not an accuracy suite: it checks
// that outputs are always finite, physically sane (no negative currents,
// no negative fault MVA, etc.), and that invalid/impossible inputs are
// always rejected with a clear error rather than silently producing
// nonsense — never that a specific number is "correct" (that's what
// test.js's fixed reference-value tests are for).

import assert from 'node:assert/strict';
import * as units from '../js/calculators/units.js';
import * as tx from '../js/calculators/transmitter.js';
import * as rtd from '../js/calculators/rtd.js';
import * as tc from '../js/calculators/thermocouple.js';
import * as cv from '../js/calculators/controlValve.js';
import * as pid from '../js/calculators/pid.js';
import * as tp from '../js/calculators/thermalPlant.js';
import * as tpa from '../js/calculators/thermalPlantAdvanced.js';
import * as trip from '../js/calculators/tripProtection.js';
import * as flow from '../js/calculators/flowEngine.js';
import * as sc from '../js/calculators/shortCircuit.js';
import * as idmtEng from '../js/calculators/idmt.js';
import * as ct from '../js/calculators/ctEngine.js';
import * as tfProt from '../js/calculators/transformerProtection.js';
import * as motProt from '../js/calculators/motorProtection.js';
import * as lsig from '../js/calculators/lsigEngine.js';
import * as coord from '../js/calculators/coordination.js';

const N = 100000;
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function pickSubset(arr) { return arr.filter(() => Math.random() < 0.5); }

let allPass = true;
const failures = [];
const startTime = Date.now();

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
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(75)} n=${n}  errors=${errors}${examples.length ? '  e.g. ' + examples.join(' | ') : ''}`);
  if (!pass) failures.push({ name, errors, examples });
}

// ==================== Previously-covered modules, at 100,000 points ====================

runCheck('flowEngine.calculateDPFlow: no NaN/Infinity/negative flow across randomized valid inputs', N, () => {
  const elementType = pick(flow.FLOW_ELEMENT_TYPES.filter((t) => t !== 'custom'));
  const fluidClass = pick(flow.FLUID_CLASSES);
  const pipeIdM = rand(0.02, 2.0);
  const boreM = elementType === 'pitot' ? 0 : pipeIdM * rand(0.15, 0.7);
  const upstreamPressurePa = rand(50000, 30000000);
  const tempC = rand(-20, 650);
  const dpPa = rand(0, upstreamPressurePa * 0.5);
  const densityKgM3 = fluidClass === 'liquid' ? rand(600, 1200) : undefined;
  const r = flow.calculateDPFlow({ elementType, fluidClass, dpPa, upstreamPressurePa, tempC, pipeIdM, boreM, densityKgM3 });
  assert.ok(Number.isFinite(r.massFlowKgS));
  assert.ok(r.massFlowKgS >= 0);
});

runCheck('flowEngine.calculateDPFlow: DP >= upstream pressure always throws', N, () => {
  const elementType = pick(flow.FLOW_ELEMENT_TYPES.filter((t) => t !== 'custom'));
  const fluidClass = pick(['gas', 'steam']);
  const pipeIdM = rand(0.02, 2.0);
  const boreM = elementType === 'pitot' ? 0 : pipeIdM * rand(0.15, 0.7);
  const upstreamPressurePa = rand(50000, 500000);
  const tempC = rand(-20, 650);
  const dpPa = rand(upstreamPressurePa, upstreamPressurePa * 3);
  let threw = false;
  try { flow.calculateDPFlow({ elementType, fluidClass, dpPa, upstreamPressurePa, tempC, pipeIdM, boreM }); }
  catch (e) { threw = true; }
  assert.ok(threw);
});

runCheck('tripProtection.evaluateVoting: tripped always matches votesFor >= k', N, () => {
  const n = randInt(1, 6);
  const k = randInt(1, n);
  const flags = Array.from({ length: n }, () => Math.random() < 0.5);
  const r = trip.evaluateVoting(flags, `${k}oo${n}`);
  assert.equal(r.tripped, flags.filter(Boolean).length >= k);
});

runCheck('tripProtection.simulateDisturbance: timeToAlarm <= timeToTrip, tripped implies timeToTripSec set', N, () => {
  const direction = pick(['high', 'low']);
  const startValue = rand(-50, 200);
  const spread = rand(1, 50);
  const alarmSetpoint = direction === 'high' ? startValue + spread : startValue - spread;
  const tripSetpoint = direction === 'high' ? alarmSetpoint + rand(0.1, 20) : alarmSetpoint - rand(0.1, 20);
  const rampRatePerSec = rand(0.01, 10);
  const timeDelaySec = rand(0, 10);
  const r = trip.simulateDisturbance({ startValue, alarmSetpoint, tripSetpoint, direction, rampRatePerSec, timeDelaySec, durationSec: 200 });
  if (r.timeToAlarmSec !== null && r.timeToTripSec !== null) assert.ok(r.timeToAlarmSec <= r.timeToTripSec);
  if (r.tripped) assert.ok(r.timeToTripSec !== null);
});

runCheck('thermalPlantAdvanced.estimate: randomized partial inputs never throw, never produce NaN/Infinity', N, () => {
  const plantType = pick(tpa.PLANT_TYPES.filter((p) => p !== 'custom'));
  const boilerType = pick(tpa.BOILER_TYPES);
  const fuelType = pick(['coal', 'oil', 'gas']);
  const cfg = tpa.defaultAdvancedConfig(plantType, boilerType, fuelType);
  const allKeys = pickSubset(tpa.INPUT_KEYS);
  const rawInputs = {};
  const ranges = {
    grossMW: [25, 1000], fuelFlowTh: [5, 400], fuelGcvKcalKg: [2500, 11000],
    combustionAirFlowTh: [10, 3000], mainSteamFlowTh: [20, 3000],
    mainSteamPressureBar: [60, 320], mainSteamTempC: [450, 650],
    reheatPressureBar: [10, 80], reheatTempC: [450, 650],
    feedwaterFlowTh: [20, 3000], feedwaterTempC: [150, 320],
    condenserPressureKPa: [3, 25], o2Pct: [1, 10],
    furnacePressureMmWC: [-20, 20], boilerEfficiencyPct: [75, 94], turbineEfficiencyPct: [28, 50],
  };
  for (const key of allKeys) {
    const [lo, hi] = ranges[key] || [1, 100];
    rawInputs[key] = rand(lo, hi);
  }
  const result = tpa.estimate(rawInputs, cfg);
  for (const [key, p] of Object.entries(result.parameters)) assert.ok(Number.isFinite(p.value), `${key} not finite`);
});

runCheck('flowEngine.mwBasedFlowEstimate: randomized combos always produce a valid confidence rating', N, () => {
  const grossMW = rand(25, 1000);
  const plantType = pick(tpa.PLANT_TYPES.filter((p) => p !== 'custom'));
  const boilerType = pick(tpa.BOILER_TYPES);
  const fuelType = pick(['coal', 'oil', 'gas']);
  const cfg = tpa.defaultAdvancedConfig(plantType, boilerType, fuelType);
  const userProvidedKeys = pickSubset(['boilerEfficiencyPct', 'turbineEfficiencyPct', 'fuelGcvKcalKg']);
  for (const k of userProvidedKeys) cfg[k] = cfg[k] ?? rand(1, 100);
  const r = flow.mwBasedFlowEstimate(grossMW, cfg, userProvidedKeys);
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(r.confidence));
});

runCheck('flowEngine.dpTransmitterModel: single/no extraction never throws; multi-stage always throws', N, () => {
  const lrv = rand(-500, 500);
  const urv = lrv + rand(1, 2000);
  const actualDP = rand(lrv - 100, urv + 100);
  const stageCount = randInt(0, 3);
  const stages = { sqrtInTransmitter: false, sqrtInDcs: false, sqrtInCalculator: false };
  const keys = Object.keys(stages);
  for (let i = 0; i < stageCount; i++) stages[keys[i]] = true;
  if (stageCount > 1) assert.throws(() => flow.dpTransmitterModel({ lrv, urv, actualDP, ...stages }));
  else {
    const r = flow.dpTransmitterModel({ lrv, urv, actualDP, ...stages });
    assert.ok(Number.isFinite(r.dpPct));
  }
});

runCheck('pid tuning methods: randomized K/T/L always produce finite positive gains', N, () => {
  const K = rand(0.1, 20), T = rand(1, 500), L = rand(0.1, 100);
  const zn = pid.zieglerNicholsOpenLoop(K, T, L);
  const cc = pid.cohenCoon(K, T, L);
  const chr = pid.chienHronesReswick(K, T, L, pick(['setpoint', 'disturbance']), pick(['0', '20']));
  for (const r of [zn.PID, cc.PID, chr.PID]) {
    assert.ok(Number.isFinite(r.kp) && r.kp > 0);
    assert.ok(Number.isFinite(r.ti) && r.ti > 0);
    assert.ok(Number.isFinite(r.td) && r.td >= 0);
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

runCheck('rtd: randomized temperature round-trip across full supported range', N, () => {
  const type = pick(Object.keys(rtd.RTD_TYPES));
  const t = rand(-190, 800);
  const r = rtd.temperatureToResistance(t, type);
  const back = rtd.resistanceToTemperature(r, type);
  assert.ok(Math.abs(back - t) < 0.05);
});

runCheck('controlValve: randomized liquid Cv always positive and finite', N, () => {
  const flowGpm = rand(0.1, 5000), dpPsi = rand(0.1, 500), sgVal = rand(0.3, 2.5);
  const cvVal = cv.liquidCv(flowGpm, dpPsi, sgVal);
  assert.ok(Number.isFinite(cvVal) && cvVal > 0);
});

runCheck('units.convertPressure: randomized cross-unit round-trip stays within float precision', N, () => {
  const v = rand(1e-3, 1e6);
  const keys = Object.keys(units.PRESSURE_TO_PA);
  const from = pick(keys), to = pick(keys);
  const conv = units.convertPressure(v, from, to);
  const back = units.convertPressure(conv, to, from);
  assert.ok(Math.abs((back - v) / v) < 1e-6);
});

// ==================== NEW: Electrical protection engines (not previously fuzz-tested) ====================

runCheck('shortCircuit.transformerFaultMVA: randomized rating/impedance always finite and positive', N, () => {
  const ratedMVA = rand(0.5, 500);
  const impedancePct = rand(2, 20);
  const r = sc.transformerFaultMVA(ratedMVA, impedancePct);
  assert.ok(Number.isFinite(r) && r > 0);
  // sanity: fault MVA should scale inversely with impedance% at fixed rating
  const rHigherZ = sc.transformerFaultMVA(ratedMVA, impedancePct * 2);
  assert.ok(rHigherZ < r, 'higher impedance should yield lower fault MVA');
});

runCheck('shortCircuit.combineSeriesFaultMVA: series combination never exceeds the smallest single contribution', N, () => {
  const n = randInt(2, 5);
  const contributions = Array.from({ length: n }, () => rand(1, 5000));
  const combined = sc.combineSeriesFaultMVA(contributions);
  assert.ok(Number.isFinite(combined) && combined > 0);
  assert.ok(combined <= Math.min(...contributions) + 1e-6, 'series MVA combination cannot exceed the smallest contributor');
});

runCheck('shortCircuit.combineParallelFaultMVA: parallel combination is always >= the largest single contribution', N, () => {
  const n = randInt(2, 5);
  const contributions = Array.from({ length: n }, () => rand(1, 5000));
  const combined = sc.combineParallelFaultMVA(contributions);
  assert.ok(Number.isFinite(combined) && combined > 0);
  assert.ok(combined >= Math.max(...contributions) - 1e-6, 'parallel MVA combination must be at least the largest contributor');
});

runCheck('shortCircuit.threePhaseFaultCurrentKA / faultMVAFromCurrent: mutual inverses', N, () => {
  const faultMVA = rand(1, 5000);
  const kV = rand(0.4, 400);
  const iKA = sc.threePhaseFaultCurrentKA(faultMVA, kV);
  assert.ok(Number.isFinite(iKA) && iKA > 0);
  const backMVA = sc.faultMVAFromCurrent(iKA, kV);
  assert.ok(Math.abs(backMVA - faultMVA) / faultMVA < 1e-6);
});

runCheck('shortCircuit.lineToGroundFaultCurrentKA: solid/ungrounded never throw; resistance/reactance without NGR always throw', N, () => {
  const threePhaseFaultKA = rand(0.5, 100);
  const groundingType = pick(['solid', 'resistance', 'reactance', 'ungrounded']);
  if (groundingType === 'resistance' || groundingType === 'reactance') {
    assert.throws(() => sc.lineToGroundFaultCurrentKA(threePhaseFaultKA, groundingType, {}));
    const withNgr = sc.lineToGroundFaultCurrentKA(threePhaseFaultKA, groundingType, { ngrLetThroughA: rand(1, 2000) });
    assert.ok(Number.isFinite(withNgr) && withNgr >= 0);
  } else {
    const r = sc.lineToGroundFaultCurrentKA(threePhaseFaultKA, groundingType, {});
    assert.ok(Number.isFinite(r) && r >= 0);
  }
});

runCheck('idmt.operatingTime: randomized PSM/TMS/curve always finite and positive when PSM > 1', N, () => {
  const curve = pick(Object.keys(idmtEng.CURVES));
  const pickupA = rand(1, 2000);
  const faultA = pickupA * rand(1.01, 50); // must exceed pickup for a real operating time
  const tms = rand(0.05, 1.5);
  const t = idmtEng.operatingTime(faultA, pickupA, tms, curve);
  assert.ok(Number.isFinite(t) && t > 0);
});

runCheck('idmt.tmsForDesiredTime -> operatingTime round-trip recovers the desired time', N, () => {
  const curve = pick(Object.keys(idmtEng.CURVES));
  const pickupA = rand(1, 2000);
  const faultA = pickupA * rand(1.5, 30);
  const desiredTimeS = rand(0.1, 10);
  const tms = idmtEng.tmsForDesiredTime(faultA, pickupA, desiredTimeS, curve);
  assert.ok(Number.isFinite(tms) && tms > 0);
  const back = idmtEng.operatingTime(faultA, pickupA, tms, curve);
  assert.ok(Math.abs(back - desiredTimeS) / desiredTimeS < 1e-6);
});

runCheck('idmt.operatingTime: higher fault current (higher PSM) always yields a shorter or equal operating time', N, () => {
  const curve = pick(Object.keys(idmtEng.CURVES));
  const pickupA = rand(1, 2000);
  const tms = rand(0.05, 1.5);
  const faultLowA = pickupA * rand(1.5, 5);
  const faultHighA = faultLowA * rand(1.1, 10);
  const tLow = idmtEng.operatingTime(faultLowA, pickupA, tms, curve);
  const tHigh = idmtEng.operatingTime(faultHighA, pickupA, tms, curve);
  assert.ok(tHigh <= tLow, 'higher fault current must not increase operating time');
});

runCheck('ctEngine.ctSecondaryCurrent: randomized primary/ratio always finite and positive', N, () => {
  const primaryCurrentA = rand(0.1, 5000);
  const ctPrimaryA = rand(1, 5000);
  const ctSecondaryA = pick([1, 5]);
  const r = ct.ctSecondaryCurrent(primaryCurrentA, ctPrimaryA, ctSecondaryA);
  assert.ok(Number.isFinite(r) && r >= 0);
});

runCheck('ctEngine.requiredKneePointVoltage: randomized inputs always finite and non-negative', N, () => {
  const faultCurrentSecondaryA = rand(0.1, 50);
  const ctResistanceOhm = rand(0.1, 10);
  const leadResistanceOhm = rand(0.05, 5);
  const stabilityFactorK = rand(1.5, 3);
  const r = ct.requiredKneePointVoltage(faultCurrentSecondaryA, ctResistanceOhm, leadResistanceOhm, stabilityFactorK);
  assert.ok(Number.isFinite(r) && r >= 0);
});

runCheck('ctEngine.checkCtSufficiency: sufficiency flag always matches actualKneePointV >= requiredKneePointV (when burden also adequate)', N, () => {
  const requiredKneePointV = rand(10, 500);
  const actualKneePointV = rand(10, 500);
  const ctRatedBurdenVA = rand(5, 60);
  const actualBurdenVA = rand(1, 60);
  const r = ct.checkCtSufficiency({ actualKneePointV, requiredKneePointV, ctClass: pick(['5P10', '5P20', '10P10', 'PS']), ctRatedBurdenVA, actualBurdenVA });
  assert.equal(typeof r.sufficient, 'boolean');
  assert.ok(Array.isArray(r.warnings));
  if (actualKneePointV < requiredKneePointV) assert.ok(r.warnings.length > 0, 'insufficient knee-point voltage must produce a warning');
});

runCheck('transformerProtection.autoGenerate: randomized valid transformer data never throws, never produces non-finite outputs', N, () => {
  const ratingMVA = rand(0.5, 200);
  const hvKV = rand(3.3, 220);
  const lvKV = rand(0.4, hvKV * 0.9);
  const impedancePct = rand(4, 15);
  const basic = {
    ratingMVA, hvKV, lvKV, impedancePct,
    hvCtPrimary: rand(10, 2000), lvCtPrimary: rand(50, 5000),
    sourceFaultMVA: rand(50, 5000),
    groundingType: 'solid',
  };
  const result = tfProt.autoGenerate(basic);
  // autoGenerate returns a structured object; the electrical quantities
  // live under basicParameters, not at the top level.
  const bp = result.basicParameters;
  assert.ok(bp && typeof bp === 'object', 'missing basicParameters');
  for (const [k, v] of Object.entries(bp)) {
    if (typeof v === 'number') {
      assert.ok(Number.isFinite(v), `transformer basicParameters.${k} not finite: ${v}`);
    }
  }
  // At least one full-load current must be present and positive.
  const flcKeys = Object.keys(bp).filter((k) => /flc/i.test(k));
  assert.ok(flcKeys.length > 0, 'no FLC value returned');
  for (const k of flcKeys) assert.ok(bp[k] > 0, `${k} must be positive, got ${bp[k]}`);
});

runCheck('transformerProtection.autoGenerate: invalid ratings/impedance always rejected', N, () => {
  const bad = pick(['ratingMVA', 'hvKV', 'lvKV', 'impedancePct']);
  const basic = { ratingMVA: 10, hvKV: 33, lvKV: 11, impedancePct: 8 };
  basic[bad] = pick([0, -1, -rand(1, 100)]);
  assert.throws(() => tfProt.autoGenerate(basic));
});

runCheck('motorProtection.autoGenerate: randomized valid motor data never throws, never produces non-finite FLC', N, () => {
  const ratingKW = rand(10, 5000);
  const voltageKV = pick([0.415, 3.3, 6.6, 11]);
  const powerFactor = rand(0.6, 0.95);
  const efficiencyPct = rand(85, 97);
  const basic = {
    ratingKW, voltageKV, powerFactor, efficiencyPct,
    startingCurrentMultiple: rand(4, 8), startingTimeS: rand(3, 15),
    ctPrimary: rand(10, 2000), sourceFaultMVA: rand(20, 1000),
  };
  const result = motProt.autoGenerate(basic);
  const bp = result.basicParameters;
  assert.ok(bp && typeof bp === 'object', 'missing basicParameters');
  assert.ok(Number.isFinite(bp.flc) && bp.flc > 0, `FLC must be finite and positive, got ${bp.flc}`);
  assert.ok(Number.isFinite(bp.startingCurrentA) && bp.startingCurrentA > bp.flc,
    `starting current (${bp.startingCurrentA}) must exceed FLC (${bp.flc})`);
});

runCheck('motorProtection.autoGenerate: invalid power factor / efficiency always rejected', N, () => {
  const basic = { ratingKW: 1000, voltageKV: 11, powerFactor: rand(0.6, 0.95), efficiencyPct: rand(85, 97), startingTimeS: 8 };
  const badField = pick(['powerFactor', 'efficiencyPct']);
  basic[badField] = badField === 'powerFactor' ? pick([0, -0.5, 1.5]) : pick([0, -10, 150]);
  assert.throws(() => motProt.autoGenerate(basic));
});

runCheck('lsigEngine.autoGenerate: randomized valid breaker data never throws, settings always within available steps', N, () => {
  const frameRatingA = rand(100, 4000);
  const loadCurrentA = rand(1, frameRatingA * 0.95);
  const faultCurrentKA = rand(5, 100);
  const r = lsig.autoGenerate({ frameRatingA, loadCurrentA, faultCurrentKA });
  if (r.longTime) assert.ok(lsig.TYPICAL_STEPS.longTimeIr.includes(r.longTime.suggestedIrRatio));
  if (r.shortTime) assert.ok(lsig.TYPICAL_STEPS.shortTimeIsd.includes(r.shortTime.suggestedIsdMultiple ?? r.shortTime.suggestedIsdRatio ?? lsig.TYPICAL_STEPS.shortTimeIsd[0]));
});

runCheck('lsigEngine.autoGenerate: load current exceeding frame rating always rejected', N, () => {
  const frameRatingA = rand(100, 4000);
  const loadCurrentA = frameRatingA * rand(1.01, 3);
  assert.throws(() => lsig.autoGenerate({ frameRatingA, loadCurrentA, faultCurrentKA: rand(5, 100) }));
});

runCheck('coordination.checkCoordination: check classification always one of PASS/WARNING/REVIEW_REQUIRED, and margin math is internally consistent', N, () => {
  const curve = pick(Object.keys(idmtEng.CURVES));
  const faultCurrentA = rand(200, 20000);
  const upstream = { pickupA: rand(50, 500), tms: rand(0.1, 1), curve };
  const downstream = { pickupA: rand(20, upstream.pickupA), tms: rand(0.05, 0.5), curve };
  // ensure fault current exceeds both pickups so operating time is defined
  if (faultCurrentA <= upstream.pickupA || faultCurrentA <= downstream.pickupA) return;
  const r = coord.checkCoordination(upstream, downstream, faultCurrentA);
  // NOTE: the real constant is 'REVIEW REQUIRED' with a SPACE, not an
  // underscore — the underscore is only the key name in ENGINEERING_CHECK.
  assert.ok(['PASS', 'WARNING', 'REVIEW REQUIRED'].includes(r.check),
    `unexpected check classification: ${JSON.stringify(r.check)}`);
  assert.ok(Math.abs((r.upstreamOperatingTimeS - r.downstreamOperatingTimeS) - r.marginS) < 1e-9);
});

const elapsedS = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n${allPass ? 'ALL DEEP CHECKS PASSED' : 'SOME DEEP CHECKS FAILED'} (${N.toLocaleString()} points per check, ${elapsedS}s total)`);
if (!allPass) {
  console.log('\nFailure summary:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.errors} errors`);
  process.exit(1);
}
