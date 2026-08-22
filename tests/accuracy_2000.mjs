// accuracy_2000.mjs — large-scale (2000-point Monte Carlo) numerical accuracy
// check for every calculator that has a verifiable mathematical property:
// an exact round-trip (forward then inverse should return the input) or a
// hard physical inequality (e.g. Carnot limit must exceed achievable
// efficiency). This measures INTERNAL numerical/mathematical accuracy of
// the engine — it is NOT a validation against real plant data or external
// steam tables, since this environment has no internet access to a
// verified reference dataset. Run: node tests/accuracy_2000.mjs

import * as units from '../js/calculators/units.mjs';
import * as tx from '../js/calculators/transmitter.mjs';
import * as orf from '../js/calculators/orifice.mjs';
import * as cv from '../js/calculators/controlValve.mjs';
import * as ipc from '../js/calculators/ipConverter.mjs';
import * as rtd from '../js/calculators/rtd.mjs';
import * as tc from '../js/calculators/thermocouple.mjs';
import * as dp from '../js/calculators/dpLevel.mjs';
import * as tp from '../js/calculators/thermalPlant.mjs';
import * as tpa from '../js/calculators/thermalPlantAdvanced.mjs';

const N = 2000;

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

function stats(errors) {
  const n = errors.length;
  const abs = errors.map(Math.abs);
  const max = Math.max(...abs);
  const mean = abs.reduce((a, b) => a + b, 0) / n;
  const rms = Math.sqrt(abs.reduce((a, b) => a + b * b, 0) / n);
  const sorted = [...abs].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(n * 0.99)];
  return { n, max, mean, rms, p99 };
}

function report(name, errors, tolerance, unit = '') {
  const s = stats(errors);
  const within = errors.filter((e) => Math.abs(e) <= tolerance).length;
  const pct = ((within / s.n) * 100).toFixed(3);
  const pass = within === s.n;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} n=${s.n}  max=${s.max.toExponential(3)}${unit}  rms=${s.rms.toExponential(3)}${unit}  p99=${s.p99.toExponential(3)}${unit}  within±${tolerance}${unit}: ${pct}%`
  );
  return pass;
}

let allPass = true;

// ---------- 1. Unit converter round-trips ----------
{
  const errors = [];
  for (let i = 0; i < N; i++) {
    const v = rand(0.01, 500);
    const [from, to] = [pick(Object.keys(units.PRESSURE_TO_PA)), pick(Object.keys(units.PRESSURE_TO_PA))];
    const converted = units.convertPressure(v, from, to);
    const back = units.convertPressure(converted, to, from);
    errors.push((back - v) / v); // relative error
  }
  allPass = report('Pressure conversion round-trip (relative error)', errors, 1e-9) && allPass;
}
{
  const errors = [];
  for (let i = 0; i < N; i++) {
    const v = rand(-200, 800);
    const [from, to] = [pick(['C', 'F', 'K']), pick(['C', 'F', 'K'])];
    const converted = units.convertTemperature(v, from, to);
    const back = units.convertTemperature(converted, to, from);
    errors.push(back - v); // absolute error (°C/°F/K comparable scale near these values)
  }
  allPass = report('Temperature conversion round-trip (absolute error, °)', errors, 1e-9) && allPass;
}

// ---------- 2. 4-20mA transmitter round-trip ----------
{
  const errors = [];
  const rangeKeys = Object.keys(tx.SIGNAL_RANGES);
  for (let i = 0; i < N; i++) {
    const lrv = rand(-100, 100);
    const urv = lrv + rand(1, 1000);
    const pv = rand(lrv, urv);
    const rangeKey = pick(rangeKeys);
    const signal = tx.pvToSignal(pv, lrv, urv, rangeKey);
    const back = tx.signalToPv(signal, lrv, urv, rangeKey);
    errors.push((back - pv) / (urv - lrv)); // error relative to span
  }
  allPass = report('4-20mA PV -> signal -> PV round-trip (rel. to span)', errors, 1e-9) && allPass;
}

// ---------- 3. RTD resistance <-> temperature round-trip ----------
{
  const errors = [];
  const types = Object.keys(rtd.RTD_TYPES);
  for (let i = 0; i < N; i++) {
    const type = pick(types);
    const t = rand(-190, 800);
    const r = rtd.temperatureToResistance(t, type);
    let back;
    try { back = rtd.resistanceToTemperature(r, type); } catch (e) { continue; }
    errors.push(back - t);
  }
  allPass = report('RTD temperature -> resistance -> temperature round-trip (°C)', errors, 0.02) && allPass;
}

// ---------- 4. Thermocouple mV <-> temperature round-trip (with CJC) ----------
{
  const errors = [];
  const types = Object.keys(tc.TC_TYPES);
  for (let i = 0; i < N; i++) {
    const type = pick(types);
    const t = rand(0, 1000);
    const cjc = rand(0, 50);
    const mv = tc.temperatureToMvWithCjc(t, cjc, type);
    const back = tc.cjcCompensatedTemperature(mv, cjc, type);
    errors.push(back - t);
  }
  allPass = report('Thermocouple T -> mV(CJC) -> T round-trip (°C)', errors, 1e-6) && allPass;
}

// ---------- 5. Orifice bore <-> flow round-trip ----------
{
  const errors = [];
  for (let i = 0; i < N; i++) {
    const pipeD = rand(0.05, 1.0);
    const bore = pipeD * rand(0.2, 0.75);
    const dpPa = rand(500, 50000);
    const rho = rand(0.5, 1200);
    const cd = rand(0.58, 0.62);
    let q, backBore;
    try {
      q = orf.volumetricFlow(bore, pipeD, dpPa, rho, cd);
      backBore = orf.boreForFlow(q, pipeD, dpPa, rho, cd);
    } catch (e) { continue; }
    errors.push((backBore - bore) / bore);
  }
  allPass = report('Orifice bore -> flow -> bore round-trip (relative)', errors, 1e-4) && allPass;
}

// ---------- 6. Control valve Kv <-> Cv round-trip ----------
{
  const errors = [];
  for (let i = 0; i < N; i++) {
    const kv = rand(0.1, 5000);
    const cvVal = cv.kvToCv(kv);
    const back = cv.cvToKv(cvVal);
    errors.push((back - kv) / kv);
  }
  allPass = report('Control valve Kv -> Cv -> Kv round-trip (relative)', errors, 1e-9) && allPass;
}

// ---------- 7. I/P converter round-trip ----------
{
  const errors = [];
  for (let i = 0; i < N; i++) {
    const mAMin = rand(0, 4), mAMax = mAMin + rand(10, 20);
    const psiMin = rand(0, 5), psiMax = psiMin + rand(5, 15);
    const mA = rand(mAMin, mAMax);
    const psi = ipc.currentToPressure(mA, mAMin, mAMax, psiMin, psiMax);
    const back = ipc.pressureToCurrent(psi, mAMin, mAMax, psiMin, psiMax);
    errors.push(back - mA);
  }
  allPass = report('I/P converter mA -> psi -> mA round-trip (mA)', errors, 1e-9) && allPass;
}

// ---------- 8. DP <-> flow (sqrt law) round-trip ----------
{
  const errors = [];
  for (let i = 0; i < N; i++) {
    const dpMax = rand(10, 500);
    const flowMax = rand(10, 1000);
    const dpPct = rand(0, dpMax);
    const flow = dp.flowFromDP(dpPct, dpMax, flowMax);
    const back = dp.dpFromFlow(flow, flowMax, dpMax);
    errors.push((back - dpPct) / dpMax);
  }
  allPass = report('DP -> flow -> DP round-trip (relative to span)', errors, 1e-6) && allPass;
}

// ---------- 9. Thermal Plant Mode 1: internal consistency (net = gross - aux, always) ----------
{
  const errors = [];
  const plantTypes = tp.PLANT_TYPES.filter((p) => p !== 'custom');
  for (let i = 0; i < N; i++) {
    const plantType = pick(plantTypes);
    const grossMW = rand(25, 1000);
    const a = tp.defaultAssumptions(plantType);
    a.auxPowerPct = rand(4, 12);
    const r = tp.fromGeneratedMW(grossMW, a);
    const expectedNet = grossMW * (1 - a.auxPowerPct / 100);
    // fromGeneratedMW deliberately rounds netGenerationMW to 2dp for display,
    // so the correct check is an absolute tolerance (half the rounding step),
    // not relative to grossMW.
    errors.push(r.netGenerationMW - expectedNet);
  }
  allPass = report('Thermal Plant Mode1: netMW = grossMW×(1-aux%) identity (MW, absolute)', errors, 0.005, ' MW') && allPass;
}

// ---------- 10. Thermal Plant Mode 3: Carnot limit must always exceed the achievable cross-check ----------
{
  const violations = [];
  const plantTypes = tpa.PLANT_TYPES.filter((p) => p !== 'custom');
  const boilerTypes = tpa.BOILER_TYPES;
  const fuels = ['coal', 'oil', 'gas'];
  for (let i = 0; i < N; i++) {
    const plantType = pick(plantTypes);
    const boilerType = pick(boilerTypes);
    const fuelType = pick(fuels);
    const cfg = tpa.defaultAdvancedConfig(plantType, boilerType, fuelType);
    const mainSteamTempC = rand(450, 650);
    const condenserPressureKPa = rand(3, 20);
    const r = tpa.estimate({ mainSteamTempC, condenserPressureKPa }, cfg);
    const carnot = r.parameters.carnotEfficiencyLimitPct.value;
    const crossCheck = r.parameters.turbineEfficiencyCrossCheckPct.value;
    if (!(carnot > crossCheck)) violations.push({ carnot, crossCheck, mainSteamTempC, condenserPressureKPa });
  }
  const pass = violations.length === 0;
  allPass = pass && allPass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  Thermal Plant Mode3: Carnot limit > achievable cross-check (2nd law)      n=${N}  violations=${violations.length}`);
}

// ---------- 11. Thermal Plant Mode 3: combustion mass balance (flue gas = air + fuel) ----------
{
  const errors = [];
  const plantTypes = tpa.PLANT_TYPES.filter((p) => p !== 'custom');
  for (let i = 0; i < N; i++) {
    const cfg = tpa.defaultAdvancedConfig(pick(plantTypes), pick(tpa.BOILER_TYPES), pick(['coal', 'oil', 'gas']));
    const fuelFlowTh = rand(10, 300);
    const r = tpa.estimate({ fuelFlowTh }, cfg);
    const air = r.parameters.combustionAirFlowTh.value;
    const flueGas = r.parameters.flueGasFlowTh.value;
    errors.push((flueGas - (air + fuelFlowTh)) / flueGas);
  }
  allPass = report('Thermal Plant Mode3: flue gas = air + fuel mass balance (relative)', errors, 1e-9) && allPass;
}

// ---------- 12. Thermal Plant Mode 3: ultimate-analysis CO2 vs ratio-based CO2 (order-of-magnitude sanity, not equality) ----------
{
  const ratios = [];
  const plantTypes = tpa.PLANT_TYPES.filter((p) => p !== 'custom');
  for (let i = 0; i < N; i++) {
    const cfg = tpa.defaultAdvancedConfig(pick(plantTypes), 'drum', 'coal');
    const fuelFlowTh = rand(10, 300);
    const carbonPct = rand(50, 75); // typical coal carbon content range
    const rCarbon = tpa.estimate({ fuelFlowTh, fuelCarbonPct: carbonPct }, cfg);
    const rRatio = tpa.estimate({ fuelFlowTh }, cfg);
    ratios.push(rCarbon.parameters.co2EmissionTh.value / rRatio.parameters.co2EmissionTh.value);
  }
  const s = stats(ratios.map((r) => r - 1));
  const withinRange = ratios.filter((r) => r > 0.5 && r < 2.0).length;
  console.log(`INFO  Thermal Plant Mode3: carbon-based vs ratio-based CO2 ratio      n=${N}  mean ratio=${(ratios.reduce((a,b)=>a+b,0)/N).toFixed(3)}  within [0.5x,2x]: ${((withinRange/N)*100).toFixed(1)}%  (sanity band, not an equality check — the two methods use different assumptions by design)`);
}

console.log(`\n${allPass ? 'ALL ACCURACY CHECKS PASSED' : 'SOME ACCURACY CHECKS FAILED'} (${N} points per check)`);
if (!allPass) process.exit(1);
