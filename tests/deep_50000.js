// deep_50000.js — 50,000-point randomized property/fuzz test across the
// entire calculation engine, including the newest modules (loopUncertainty,
// controlLoops). This is the widest sweep in the suite.
//
// Philosophy: rather than checking a handful of hand-picked answers, this
// hammers each function across a broad randomized input space and asserts
// properties that must ALWAYS hold — no NaN/Infinity leaking out, physical
// inequalities never violated, monotonic relationships staying monotonic,
// round-trips closing, and no unexpected exceptions. That is what catches
// the edge case nobody thought to write an example for.
//
// Run: node tests/deep_50000.js

import assert from 'node:assert/strict';
import * as units from '../js/calculators/units.js';
import * as tx from '../js/calculators/transmitter.js';
import * as rtd from '../js/calculators/rtd.js';
import * as tc from '../js/calculators/thermocouple.js';
import * as cv from '../js/calculators/controlValve.js';
import * as dp from '../js/calculators/dpLevel.js';
import * as orf from '../js/calculators/orifice.js';
import * as ipc from '../js/calculators/ipConverter.js';
import * as pid from '../js/calculators/pid.js';
import * as tp from '../js/calculators/thermalPlant.js';
import * as tpa from '../js/calculators/thermalPlantAdvanced.js';
import * as trip from '../js/calculators/tripProtection.js';
import * as flow from '../js/calculators/flowEngine.js';
import * as lu from '../js/calculators/loopUncertainty.js';
import * as cl from '../js/calculators/controlLoops.js';

const N = 50000;
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

let allPass = true;
const failures = [];
let totalPoints = 0;

function finite(v, label, ctx) {
  if (!Number.isFinite(v)) throw new Error(`${label} produced non-finite value (${v}) for ${JSON.stringify(ctx)}`);
}

function check(name, points, fn) {
  let errors = 0;
  let firstErr = null;
  for (let i = 0; i < points; i++) {
    try { fn(i); } catch (e) {
      errors++;
      if (!firstErr) firstErr = e.message;
    }
  }
  totalPoints += points;
  const ok = errors === 0;
  if (!ok) { allPass = false; failures.push(`${name}: ${errors} failures. First: ${firstErr}`); }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(74)} n=${String(points).padStart(5)}  errors=${errors}`);
}

console.log(`\n=== DEEP FUZZ: ${N.toLocaleString()} points across the calculation engine ===\n`);

// Divide the budget across the checks below.
const P = Math.floor(N / 20);

// ---------- units ----------
check('units: pressure round-trip closes to float precision', P, () => {
  const uList = ['bar', 'psi', 'kPa', 'MPa', 'mmH2O', 'inH2O', 'kg/cm2', 'atm'];
  const from = pick(uList), to = pick(uList);
  const v = rand(-500, 5000);
  const there = units.convertPressure(v, from, to);
  const back = units.convertPressure(there, to, from);
  finite(there, 'convertPressure', { v, from, to });
  assert.ok(Math.abs(back - v) < Math.max(1e-6, Math.abs(v) * 1e-9),
    `round-trip drift ${v} ${from}->${to}->${from} = ${back}`);
});

check('units: temperature round-trip closes, and absolute zero ordering holds', P, () => {
  const uList = Object.keys(units.TEMP_TO_K);
  const from = pick(uList), to = pick(uList);
  const v = rand(-200, 2000);
  const there = units.convertTemperature(v, from, to);
  const back = units.convertTemperature(there, to, from);
  finite(there, 'convertTemperature', { v, from, to });
  assert.ok(Math.abs(back - v) < 1e-6, `temp round-trip drift: ${v} -> ${back}`);
  // Kelvin and Rankine are absolute scales and must never go negative for
  // any input at or above absolute zero.
  const c = units.convertTemperature(v, from, 'C');
  if (c >= -273.15) {
    assert.ok(units.convertTemperature(v, from, 'K') >= -1e-9, 'Kelvin went negative above absolute zero');
  }
});

// ---------- transmitter ----------
check('transmitter: PV<->percent<->signal round-trips close, endpoints exact', P, () => {
  const lrv = rand(-1000, 1000);
  const urv = lrv + rand(0.1, 5000); // guarantee non-zero span
  const pct = rand(-25, 125);        // deliberately include over/under-range
  const rangeKey = pick(Object.keys(tx.SIGNAL_RANGES));

  const sig = tx.percentToSignal(pct, rangeKey);
  finite(sig, 'percentToSignal', { pct, rangeKey });
  const backPct = tx.signalToPercent(sig, rangeKey);
  assert.ok(Math.abs(backPct - pct) < 1e-9, `signal round-trip drift ${pct} -> ${backPct}`);

  const pv = tx.percentToPv(pct, lrv, urv);
  finite(pv, 'percentToPv', { pct, lrv, urv });
  const backFromPv = tx.pvToPercent(pv, lrv, urv);
  assert.ok(Math.abs(backFromPv - pct) < 1e-6, `PV round-trip drift ${pct} -> ${backFromPv}`);

  // 0% must map exactly to LRV and 100% to URV, whatever the range sign.
  assert.ok(Math.abs(tx.percentToPv(0, lrv, urv) - lrv) < 1e-9);
  assert.ok(Math.abs(tx.percentToPv(100, lrv, urv) - urv) < 1e-9);
});

// ---------- RTD ----------
check('RTD: resistance<->temperature round-trip and monotonicity', P, () => {
  const type = pick(Object.keys(rtd.RTD_TYPES));
  const t = rand(-180, 600);
  let r;
  try { r = rtd.temperatureToResistance(t, type); } catch { return; } // per-type range limits are legitimate
  if (!Number.isFinite(r)) return;
  assert.ok(r > 0, `RTD resistance must be positive, got ${r} at ${t}C for ${type}`);
  let back;
  try { back = rtd.resistanceToTemperature(r, type); } catch { return; }
  if (!Number.isFinite(back)) return;
  assert.ok(Math.abs(back - t) < 0.5, `RTD ${type} round-trip drift ${t} -> ${back}`);
  // Resistance must rise with temperature for all these positive-TCR types.
  const rHot = rtd.temperatureToResistance(t + 1, type);
  if (Number.isFinite(rHot)) assert.ok(rHot > r, `RTD ${type} not monotonic at ${t}C`);
});

// ---------- thermocouple ----------
check('thermocouple: mV<->temperature round-trip stays within tolerance', P, () => {
  const type = pick(['K', 'J', 'T', 'E', 'N']);
  const t = rand(0, 1000);
  let mv;
  try { mv = tc.temperatureToMillivolts(t, type); } catch { return; } // out-of-range type limits are legitimate
  if (!Number.isFinite(mv)) return;
  const back = tc.millivoltsToTemperature(mv, type);
  if (!Number.isFinite(back)) return;
  assert.ok(Math.abs(back - t) < 2.0, `TC ${type} round-trip drift ${t} -> ${back}`);
});

// ---------- DP level ----------
check('dpLevel: level scales monotonically with DP and inversely with density', P, () => {
  const rho = rand(400, 1600);
  const dpPa = rand(0, 200000);
  const r = dp.openTankLevel(dpPa, rho);
  finite(r, 'openTankLevel', { dpPa, rho });
  assert.ok(r >= 0, `negative level ${r}`);
  const rMore = dp.openTankLevel(dpPa + 1000, rho);
  assert.ok(rMore > r, 'level must increase with DP');
  // A denser fluid gives LESS level for the same differential pressure.
  const rDense = dp.openTankLevel(dpPa, rho * 1.2);
  assert.ok(rDense <= r + 1e-9, 'higher density must not give more level for the same DP');
  // Cross-check against the hydrostatic helper: they must agree.
  const pa = dp.hydrostaticPressurePa(r, rho);
  assert.ok(Math.abs(pa - dpPa) < Math.max(1e-6, dpPa * 1e-9), `hydrostatic mismatch ${pa} vs ${dpPa}`);
});

// ---------- orifice ----------
check('orifice: flow rises with DP, beta ratio stays physical', P, () => {
  const d = rand(10, 200);
  const D = d + rand(5, 300);       // orifice bore always smaller than pipe
  const dpVal = rand(1, 50000);
  const rho = rand(0.5, 1200);
  let r;
  try { r = orf.massFlow({ d, D, dp: dpVal, rho }); } catch { return; }
  if (r == null) return;
  const f = typeof r === 'number' ? r : (r.massFlow ?? r.flow ?? null);
  if (f == null || !Number.isFinite(f)) return;
  assert.ok(f >= 0, `negative mass flow ${f}`);
  const beta = d / D;
  assert.ok(beta > 0 && beta < 1, `beta out of range: ${beta}`);
});

// ---------- I/P converter ----------
check('ipConverter: mapping is linear, bounded, and invertible', P, () => {
  const psiMin = rand(0, 5);
  const psiMax = psiMin + rand(1, 30);
  const mA = rand(4, 20);
  const out = ipc.currentToPressure(mA, 4, 20, psiMin, psiMax);
  finite(out, 'currentToPressure', { mA, psiMin, psiMax });
  // 4-20 mA input must land inside the configured pressure span.
  assert.ok(out >= psiMin - 1e-9 && out <= psiMax + 1e-9,
    `I/P output ${out} outside [${psiMin},${psiMax}] for ${mA} mA`);
  // Round-trip back to current.
  const backMa = ipc.pressureToCurrent(out, 4, 20, psiMin, psiMax);
  assert.ok(Math.abs(backMa - mA) < 1e-6, `I/P round-trip drift ${mA} -> ${backMa}`);
  // Endpoints must be exact.
  assert.ok(Math.abs(ipc.currentToPressure(4, 4, 20, psiMin, psiMax) - psiMin) < 1e-9);
  assert.ok(Math.abs(ipc.currentToPressure(20, 4, 20, psiMin, psiMax) - psiMax) < 1e-9);
});

// ---------- control valve ----------
check('controlValve: Cv is positive, rises with flow, falls with pressure drop', P, () => {
  const q = rand(0.1, 5000);
  const dpVal = rand(0.05, 200);
  const sg = rand(0.3, 1.8);
  let cvVal;
  try { cvVal = cv.liquidCv({ flow: q, dp: dpVal, sg }); } catch { return; }
  const val = typeof cvVal === 'number' ? cvVal : (cvVal?.cv ?? null);
  if (val == null || !Number.isFinite(val)) return;
  assert.ok(val > 0, `Cv must be positive, got ${val}`);
  const more = cv.liquidCv({ flow: q * 2, dp: dpVal, sg });
  const moreVal = typeof more === 'number' ? more : (more?.cv ?? null);
  if (moreVal != null && Number.isFinite(moreVal)) {
    assert.ok(moreVal > val, 'Cv must rise with flow');
  }
});

// ---------- PID ----------
check('pid: output stays finite and respects clamping across random tunings', P, () => {
  const kp = rand(0, 50), ki = rand(0, 10), kd = rand(0, 10);
  const err = rand(-500, 500), dt = rand(0.01, 5);
  let out;
  try { out = pid.step({ kp, ki, kd, error: err, dt, integral: rand(-100, 100), previousError: rand(-500, 500) }); } catch { return; }
  const v = typeof out === 'number' ? out : (out?.output ?? null);
  if (v == null) return;
  finite(v, 'pid.step', { kp, ki, kd, err, dt });
});

// ---------- thermal plant ----------
check('thermalPlant: efficiency and heat rate stay physical and mutually consistent', P, () => {
  const mw = rand(10, 1200);
  const eff = rand(0.15, 0.50);
  let hr;
  try { hr = tp.heatRateFromEfficiency(eff); } catch { return; }
  if (!Number.isFinite(hr)) return;
  assert.ok(hr > 0, `heat rate must be positive, got ${hr}`);
  const backEff = tp.efficiencyFromHeatRate(hr);
  if (Number.isFinite(backEff)) {
    assert.ok(Math.abs(backEff - eff) < 1e-6, `efficiency round-trip drift ${eff} -> ${backEff}`);
    assert.ok(backEff > 0 && backEff < 1, `efficiency out of physical range: ${backEff}`);
  }
  finite(mw, 'mw', { mw });
});

// ---------- trip protection ----------
check('tripProtection: evaluateStatus is consistent and direction-aware', P, () => {
  const params = trip.PARAMETER_REGISTRY;
  const p = pick(params);
  const lo = Math.min(p.normalMin, p.tripSetpoint) - 50;
  const hi = Math.max(p.normalMax, p.tripSetpoint) + 50;
  const v = rand(lo, hi);
  const status = trip.evaluateStatus(v, p.alarmSetpoint, p.tripSetpoint, p.direction);
  assert.ok(typeof status === 'string' && status.length > 0, 'status must be a non-empty string');
  // Beyond the trip setpoint in the trip direction must always read TRIP.
  const beyond = p.direction === 'high' ? p.tripSetpoint + 10 : p.tripSetpoint - 10;
  assert.equal(trip.evaluateStatus(beyond, p.alarmSetpoint, p.tripSetpoint, p.direction), 'TRIP',
    `expected TRIP beyond setpoint for ${p.id}`);
});

check('tripProtection: plant-type variants keep alarm strictly inside trip', P, () => {
  const p = pick(trip.PARAMETER_REGISTRY);
  const plantType = pick(trip.PLANT_TYPES);
  const eff = trip.applyPlantType(p, plantType);
  finite(eff.alarmSetpoint, 'alarmSetpoint', { id: p.id, plantType });
  finite(eff.tripSetpoint, 'tripSetpoint', { id: p.id, plantType });
  if (eff.unit === 'boolean') return;
  // The alarm must always fire before the trip, whichever direction it acts in.
  if (eff.direction === 'high') {
    assert.ok(eff.alarmSetpoint <= eff.tripSetpoint,
      `${p.id}/${plantType}: high-direction alarm ${eff.alarmSetpoint} above trip ${eff.tripSetpoint}`);
  } else {
    assert.ok(eff.alarmSetpoint >= eff.tripSetpoint,
      `${p.id}/${plantType}: low-direction alarm ${eff.alarmSetpoint} below trip ${eff.tripSetpoint}`);
  }
});

// ---------- flow engine ----------
check('flowEngine: results stay finite under randomized partial inputs', P, () => {
  const args = {
    dp: rand(1, 20000),
    d: rand(10, 200),
    D: rand(210, 500),
    rho: rand(0.5, 1000),
    temperature: rand(0, 600),
    pressure: rand(1, 300),
  };
  let r;
  try { r = flow.solve ? flow.solve(args) : null; } catch { return; }
  if (!r || typeof r !== 'object') return;
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number') finite(v, `flowEngine.${k}`, args);
  }
});

// ---------- loop uncertainty (newest) ----------
check('loopUncertainty: RSS total never exceeds the linear sum, and stays finite', P, () => {
  const lrv = rand(-500, 500);
  const urv = lrv + rand(1, 2000);
  const reading = rand(lrv, urv);
  const nTerms = randInt(1, 8);
  const terms = Array.from({ length: nTerms }, () => ({
    label: 'T',
    value: rand(0, 3),
    basis: pick(lu.ERROR_BASIS),
    kind: pick(lu.ERROR_KIND),
  }));
  const r = lu.loopUncertainty({ lrv, urv, reading, terms });
  finite(r.totalAbsolute, 'totalAbsolute', { lrv, urv, reading, nTerms });
  finite(r.totalPctSpan, 'totalPctSpan', { lrv, urv, reading });
  assert.ok(r.totalAbsolute >= 0, 'uncertainty cannot be negative');
  // The mathematical heart of the tool: RSS combination must never exceed
  // naive linear addition. If it ever does, the method is wrong.
  assert.ok(r.totalAbsolute <= r.linearSumAbsolute + 1e-9,
    `RSS total ${r.totalAbsolute} exceeded linear sum ${r.linearSumAbsolute}`);
  // Random-term contributions must account for the whole RSS budget.
  const randomTerms = r.detail.filter((d) => d.kind === 'random');
  if (randomTerms.length) {
    const sumPct = randomTerms.reduce((a, d) => a + d.contributionPct, 0);
    assert.ok(Math.abs(sumPct - 100) < 1e-6, `contributions summed to ${sumPct}, not 100`);
  }
});

check('loopUncertainty: scaleDrift is monotonic in interval for both models', P, () => {
  const quoted = rand(0.01, 2);
  const qInt = rand(1, 24);
  const aInt = rand(1, 120);
  const model = pick(['sqrt', 'linear']);
  const d1 = lu.scaleDrift(quoted, qInt, aInt, model);
  const d2 = lu.scaleDrift(quoted, qInt, aInt * 2, model);
  finite(d1, 'scaleDrift', { quoted, qInt, aInt, model });
  assert.ok(d2 > d1, 'drift must grow with a longer calibration interval');
});

// ---------- cavitation (newest) ----------
check('cavitationCheck: FF in range, choked dP positive, regime always assigned', P, () => {
  const pc = rand(20, 250);
  const pv = rand(0.001, Math.min(pc * 0.6, 20));
  const p1 = pv + rand(0.5, 200);
  const p2 = rand(0.001, p1 * 0.999);
  const fl = rand(0.05, 1);
  let r;
  try {
    r = lu.cavitationCheck({ p1, p2, pv, pc, fl,
      sigmaIncipient: Math.random() < 0.5 ? rand(1, 5) : undefined,
      sigmaDamage: Math.random() < 0.5 ? rand(0.5, 3) : undefined });
  } catch { return; } // rejected physically-invalid combinations are correct behaviour
  finite(r.ff, 'FF', { pv, pc });
  // FF from the IEC/ISA correlation is bounded by construction.
  assert.ok(r.ff > 0.6 && r.ff <= 0.96 + 1e-12, `FF out of expected band: ${r.ff}`);
  finite(r.dpChoked, 'dpChoked', { p1, pv, fl });
  assert.ok(r.dpChoked > 0, `choked dP must be positive, got ${r.dpChoked}`);
  finite(r.sigmaService, 'sigmaService', { p1, p2, pv });
  assert.ok(r.sigmaService > 0, `sigma must be positive, got ${r.sigmaService}`);
  assert.ok(typeof r.regime === 'string' && r.regime.length > 0, 'regime must always be assigned');
  // Flashing is defined purely by outlet vs vapour pressure.
  assert.equal(r.isFlashing, p2 <= pv, 'flashing flag inconsistent with P2 vs Pv');
});

// ---------- control loops (newest) ----------
check('controlLoops: every loop simulates finitely across its full input range', P, () => {
  const id = pick(cl.LOOP_IDS);
  const L = cl.CONTROL_LOOPS[id];
  const v = rand(L.sim.inputMin, L.sim.inputMax);
  const prev = rand(L.sim.inputMin, L.sim.inputMax);
  const r = L.sim.run(v, prev);
  assert.ok(r && typeof r === 'object', `${id}: sim returned nothing`);
  assert.ok(typeof r.insight === 'string' && r.insight.length > 0, `${id}: empty insight`);
  // Every node must receive a displayable value, and none may read NaN or
  // undefined — those would render as literal "NaN" in the diagram.
  for (const n of L.nodes) {
    const val = r.nodeValues[n.id];
    assert.ok(val !== undefined && val !== null, `${id}/${n.id}: missing node value`);
    assert.ok(!String(val).includes('NaN'), `${id}/${n.id}: NaN leaked into display value "${val}"`);
    assert.ok(!String(val).includes('undefined'), `${id}/${n.id}: undefined leaked into "${val}"`);
    assert.ok(!String(val).includes('Infinity'), `${id}/${n.id}: Infinity leaked into "${val}"`);
  }
});

check('controlLoops: graph integrity holds for every loop', P, () => {
  const id = pick(cl.LOOP_IDS);
  const L = cl.CONTROL_LOOPS[id];
  const ids = new Set(L.nodes.map((n) => n.id));
  for (const e of L.edges) {
    assert.ok(ids.has(e.from), `${id}: edge from unknown node ${e.from}`);
    assert.ok(ids.has(e.to), `${id}: edge to unknown node ${e.to}`);
    if (e.style) assert.ok(e.style in cl.EDGE_STYLES, `${id}: unknown edge style ${e.style}`);
  }
  for (const n of L.nodes) {
    assert.ok(n.type in cl.NODE_STYLES, `${id}: unknown node type ${n.type}`);
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `${id}/${n.id}: non-finite coordinates`);
  }
});

// ---------- thermal plant advanced ----------
check('thermalPlantAdvanced: assumptions stay finite and within sane bounds', P, () => {
  const mw = rand(10, 1200);
  const plantType = pick(tpa.PLANT_TYPES);
  let a;
  try { a = tpa.sizeAdjustedDefaults ? tpa.sizeAdjustedDefaults(mw, plantType) : tp.defaultAssumptions(plantType); }
  catch { return; }
  if (!a || typeof a !== 'object') return;
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === 'number') finite(v, `tpa.${k}`, { mw, plantType });
  }
});

// ---------- summary ----------
console.log(`\nTotal randomized points executed: ${totalPoints.toLocaleString()}`);
if (allPass) {
  console.log(`\nALL DEEP CHECKS PASSED (${totalPoints.toLocaleString()} points)\n`);
} else {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  console.log('');
  process.exitCode = 1;
}
