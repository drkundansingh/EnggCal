// electricalDesign.js — electrical design calculators that complement the
// existing protection engines. These cover the everyday sizing and
// verification work an industrial/power-plant electrical engineer does.
//
// Every method here is a published, standard engineering calculation:
//   - Voltage drop from conductor R and X with load power factor
//   - Adiabatic short-circuit withstand (the k·√t method, IEC 60949 /
//     IEC 60364-5-54 form) for cables and earthing conductors
//   - Motor starting voltage dip from source and motor kVA
//   - Power factor correction from the tan(phi) difference
//   - Battery sizing from duty cycle, temperature and ageing factors
//
// Nothing here is proprietary and no manufacturer tables are reproduced.
// Where a real design needs a manufacturer/standard table (base ampacity,
// battery cell capacity curves, k-factors for exotic insulation), the
// function takes it as an INPUT rather than inventing it.

import { sqrt3 } from './electricalCommon.js';

// ============================================================
// 1. CABLE VOLTAGE DROP
// ============================================================

export const SYSTEM_TYPES = ['three-phase', 'single-phase', 'dc'];

/**
 * Voltage drop along a cable run.
 *
 * Three-phase:  Vdrop = √3 · I · L · (R·cosφ + X·sinφ)
 * Single-phase: Vdrop = 2  · I · L · (R·cosφ + X·sinφ)   (out and back)
 * DC:           Vdrop = 2  · I · L · R                    (no reactance)
 *
 * R and X are per-unit-length values for ONE conductor, in ohms per km,
 * exactly as cable manufacturers publish them.
 *
 * @param {object} o
 * @param {number} o.currentA      - load current, amps
 * @param {number} o.lengthM       - route length, metres (one way)
 * @param {number} o.rOhmPerKm     - conductor resistance, ohm/km
 * @param {number} o.xOhmPerKm     - conductor reactance, ohm/km (0 for DC)
 * @param {number} o.voltageV      - nominal system voltage, volts
 * @param {string} o.systemType    - one of SYSTEM_TYPES
 * @param {number} [o.parallelRuns=1] - number of cables per phase in parallel
 * @param {number} [o.powerFactor=0.85]
 */
export function voltageDrop({
  currentA, lengthM, rOhmPerKm, xOhmPerKm = 0, voltageV,
  systemType = 'three-phase', parallelRuns = 1, powerFactor = 0.85,
}) {
  if (!(currentA > 0)) throw new Error('Load current must be greater than zero.');
  if (!(lengthM > 0)) throw new Error('Cable length must be greater than zero.');
  if (!(rOhmPerKm > 0)) throw new Error('Conductor resistance (ohm/km) must be greater than zero.');
  if (!(voltageV > 0)) throw new Error('System voltage must be greater than zero.');
  if (!SYSTEM_TYPES.includes(systemType)) throw new Error(`System type must be one of: ${SYSTEM_TYPES.join(', ')}`);
  if (!(parallelRuns >= 1)) throw new Error('Parallel runs must be at least 1.');
  if (!(powerFactor > 0 && powerFactor <= 1)) throw new Error('Power factor must be greater than 0 and no more than 1.');

  // Paralleling cables divides the effective impedance per phase.
  const r = (rOhmPerKm / parallelRuns) * (lengthM / 1000);
  const x = (xOhmPerKm / parallelRuns) * (lengthM / 1000);

  const cosPhi = powerFactor;
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));

  let dropV;
  if (systemType === 'three-phase') {
    dropV = sqrt3() * currentA * (r * cosPhi + x * sinPhi);
  } else if (systemType === 'single-phase') {
    dropV = 2 * currentA * (r * cosPhi + x * sinPhi);
  } else {
    dropV = 2 * currentA * r; // DC: resistance only
  }

  const dropPct = (dropV / voltageV) * 100;
  return {
    dropV,
    dropPct,
    receivingEndV: voltageV - dropV,
    resistanceOhm: r,
    reactanceOhm: x,
    // Loss in the cable itself — often the bigger deal on long runs, and
    // the reason voltage-drop-driven upsizing frequently pays for itself.
    lossW: (systemType === 'three-phase' ? 3 : 2) * currentA * currentA * (systemType === 'three-phase' ? r : r),
  };
}

// ============================================================
// 2. CABLE AMPACITY DERATING
// ============================================================

/**
 * Applies derating factors to a cable's base (tabulated) ampacity.
 *
 * The base rating MUST come from the applicable standard or manufacturer
 * table for the specific cable construction and installation method — it
 * is an input here, never invented. This function applies the factors.
 *
 * Derated ampacity = base × ambient × grouping × soil × depth × other
 */
export function deratedAmpacity({
  baseAmpacityA,
  ambientFactor = 1, groupingFactor = 1,
  soilResistivityFactor = 1, depthFactor = 1, otherFactor = 1,
  designCurrentA,
}) {
  if (!(baseAmpacityA > 0)) throw new Error('Base ampacity must be greater than zero — take it from the applicable cable table.');
  const factors = { ambientFactor, groupingFactor, soilResistivityFactor, depthFactor, otherFactor };
  for (const [k, v] of Object.entries(factors)) {
    if (!(v > 0 && v <= 1.5)) throw new Error(`${k} must be greater than 0 and no more than 1.5 (got ${v}).`);
  }
  const total = ambientFactor * groupingFactor * soilResistivityFactor * depthFactor * otherFactor;
  const derated = baseAmpacityA * total;

  let check = null, utilisationPct = null;
  if (designCurrentA !== undefined && designCurrentA !== null) {
    if (!(designCurrentA > 0)) throw new Error('Design current must be greater than zero.');
    utilisationPct = (designCurrentA / derated) * 100;
    check = designCurrentA <= derated ? 'ADEQUATE' : 'UNDERSIZED';
  }

  return { totalDeratingFactor: total, deratedAmpacityA: derated, utilisationPct, check, factors };
}

// ============================================================
// 3. SHORT-CIRCUIT WITHSTAND (ADIABATIC)
// ============================================================

/**
 * Minimum conductor cross-section to survive a fault, by the standard
 * adiabatic method:
 *
 *     S = I · √t / k
 *
 * where k depends on conductor material, insulation, and the initial and
 * final permitted temperatures. k is supplied as an input because it is
 * defined by the applicable standard for the specific cable construction.
 *
 * The method assumes the fault is short enough that no heat leaves the
 * conductor (adiabatic). That assumption is normally taken as valid for
 * faults up to about 5 seconds; beyond that it is conservative in the
 * wrong direction and a non-adiabatic method should be used instead.
 */
export function adiabaticMinimumCsa({ faultCurrentA, faultDurationS, kFactor, actualCsaMm2 }) {
  if (!(faultCurrentA > 0)) throw new Error('Fault current must be greater than zero.');
  if (!(faultDurationS > 0)) throw new Error('Fault duration must be greater than zero.');
  if (!(kFactor > 0)) throw new Error('k factor must be greater than zero — take it from the applicable standard for this conductor/insulation combination.');

  const minCsaMm2 = (faultCurrentA * Math.sqrt(faultDurationS)) / kFactor;

  let check = null, marginPct = null;
  if (actualCsaMm2 !== undefined && actualCsaMm2 !== null) {
    if (!(actualCsaMm2 > 0)) throw new Error('Actual conductor CSA must be greater than zero.');
    marginPct = ((actualCsaMm2 - minCsaMm2) / minCsaMm2) * 100;
    check = actualCsaMm2 >= minCsaMm2 ? 'ADEQUATE' : 'INADEQUATE';
  }

  // Withstand current the actual conductor can take for this duration.
  const withstandA = actualCsaMm2 ? (kFactor * actualCsaMm2) / Math.sqrt(faultDurationS) : null;

  return {
    minCsaMm2,
    actualCsaMm2: actualCsaMm2 ?? null,
    marginPct,
    check,
    withstandA,
    adiabaticValid: faultDurationS <= 5,
    note: faultDurationS > 5
      ? 'Fault duration exceeds ~5 s, where the adiabatic assumption (no heat leaving the conductor) stops being appropriate. Use a non-adiabatic method for durations this long.'
      : 'Adiabatic assumption is appropriate for this fault duration.',
  };
}

// ============================================================
// 4. MOTOR STARTING VOLTAGE DIP
// ============================================================

/**
 * Voltage dip at the bus when a large motor is started direct-on-line.
 *
 * Simple, standard source-impedance divider:
 *   V_dip_pu = kVA_start / (kVA_start + MVA_fault·1000)
 *
 * This is the classic first-pass check. It assumes a stiff source behind
 * a single impedance and ignores intervening transformer/cable impedance
 * detail, motor dynamics, and any starting method other than DOL — so it
 * is a screening calculation, not a substitute for a transient study.
 */
export function motorStartingDip({
  motorKW, voltageKV, startingCurrentMultiple = 6,
  powerFactor = 0.85, efficiencyPct = 95,
  sourceFaultMVA, startingPowerFactor = 0.2,
  permittedDipPct = 15,
}) {
  if (!(motorKW > 0)) throw new Error('Motor rating (kW) must be greater than zero.');
  if (!(voltageKV > 0)) throw new Error('Voltage must be greater than zero.');
  if (!(sourceFaultMVA > 0)) throw new Error('Source fault level (MVA) must be greater than zero.');
  if (!(powerFactor > 0 && powerFactor <= 1)) throw new Error('Power factor must be greater than 0 and no more than 1.');
  if (!(efficiencyPct > 0 && efficiencyPct <= 100)) throw new Error('Efficiency must be between 0 and 100%.');

  // Full-load and starting apparent power.
  const ratedKVA = motorKW / (powerFactor * (efficiencyPct / 100));
  const flcA = (ratedKVA * 1000) / (sqrt3() * voltageKV * 1000);
  const startingKVA = ratedKVA * startingCurrentMultiple;
  const startingCurrentA = flcA * startingCurrentMultiple;

  const sourceKVA = sourceFaultMVA * 1000;
  const dipPu = startingKVA / (startingKVA + sourceKVA);
  const dipPct = dipPu * 100;
  const residualVoltagePct = 100 - dipPct;

  // Motor torque falls with the SQUARE of voltage — the reason a dip that
  // looks survivable for the bus can still stall the motor being started.
  const torquePct = residualVoltagePct * residualVoltagePct / 100;

  return {
    ratedKVA, flcA, startingKVA, startingCurrentA,
    dipPct, residualVoltagePct, torqueAtDipPct: torquePct,
    permittedDipPct,
    check: dipPct <= permittedDipPct ? 'ACCEPTABLE' : 'EXCEEDS LIMIT',
    startingPowerFactor,
    note: dipPct > permittedDipPct
      ? `The dip of ${dipPct.toFixed(1)}% exceeds the permitted ${permittedDipPct}%. Options: a stiffer supply, a reduced-voltage or soft starter, a VFD, or starting the motor against a lighter load. Note also that available torque falls to about ${torquePct.toFixed(0)}% of full-voltage torque, since torque varies with the square of voltage.`
      : `Dip is within the permitted ${permittedDipPct}%. Available starting torque is about ${torquePct.toFixed(0)}% of full-voltage torque \u2014 confirm that still exceeds the driven load's breakaway torque.`,
  };
}

// ============================================================
// 5. POWER FACTOR CORRECTION
// ============================================================

/**
 * Capacitor kVAr needed to move from an existing to a target power factor.
 *
 *   kVAr = kW · (tan φ₁ − tan φ₂)
 */
export function powerFactorCorrection({ loadKW, existingPF, targetPF, voltageKV, frequencyHz = 50 }) {
  if (!(loadKW > 0)) throw new Error('Load (kW) must be greater than zero.');
  if (!(existingPF > 0 && existingPF < 1)) throw new Error('Existing power factor must be greater than 0 and less than 1.');
  if (!(targetPF > 0 && targetPF <= 1)) throw new Error('Target power factor must be greater than 0 and no more than 1.');
  if (targetPF <= existingPF) throw new Error('Target power factor must be higher than the existing power factor.');

  const phi1 = Math.acos(existingPF);
  const phi2 = Math.acos(targetPF);
  const tan1 = Math.tan(phi1);
  const tan2 = Math.tan(phi2);
  const kvarRequired = loadKW * (tan1 - tan2);

  const kvaBefore = loadKW / existingPF;
  const kvaAfter = loadKW / targetPF;
  const currentReductionPct = ((kvaBefore - kvaAfter) / kvaBefore) * 100;

  // Capacitance, if a voltage is supplied (three-phase star-equivalent).
  let capacitanceUF = null;
  if (voltageKV > 0) {
    const v = voltageKV * 1000;
    capacitanceUF = (kvarRequired * 1000) / (2 * Math.PI * frequencyHz * v * v) * 1e6;
  }

  return {
    kvarRequired,
    kvarBefore: loadKW * tan1,
    kvarAfter: loadKW * tan2,
    kvaBefore, kvaAfter,
    currentReductionPct,
    capacitanceUF,
    // Released capacity is the practical selling point: correcting PF frees
    // up transformer and cable capacity that reactive current was consuming.
    releasedKVA: kvaBefore - kvaAfter,
  };
}

// ============================================================
// 6. BATTERY / DC SYSTEM SIZING
// ============================================================

/**
 * Battery capacity for a DC duty cycle.
 *
 * Follows the standard sizing structure: take the worst-case duty-cycle
 * demand, then apply temperature correction, an ageing margin (batteries
 * are sized to still perform at end of life, typically 80% capacity), and
 * a design margin.
 *
 * The cell's capacity-vs-discharge-rate behaviour is manufacturer data and
 * is NOT modelled here — this sizes the required Ah, which you then match
 * against a real cell datasheet at the correct discharge rate.
 */
export function batterySizing({
  loadSteps, temperatureFactor = 1.0, ageingFactor = 1.25,
  designMargin = 1.10, systemVoltageV, cellVoltageV = 2.0,
}) {
  if (!Array.isArray(loadSteps) || loadSteps.length === 0) {
    throw new Error('At least one load step is required (each with a current in amps and a duration in minutes).');
  }
  for (const s of loadSteps) {
    if (!(s.currentA > 0)) throw new Error('Every load step needs a current greater than zero.');
    if (!(s.durationMin > 0)) throw new Error('Every load step needs a duration greater than zero.');
  }
  if (!(temperatureFactor > 0)) throw new Error('Temperature factor must be greater than zero.');
  if (!(ageingFactor >= 1)) throw new Error('Ageing factor must be at least 1.0.');
  if (!(designMargin >= 1)) throw new Error('Design margin must be at least 1.0.');

  const totalDurationMin = loadSteps.reduce((a, s) => a + s.durationMin, 0);
  // Ampere-hours actually demanded by the duty cycle.
  const dutyAh = loadSteps.reduce((a, s) => a + (s.currentA * s.durationMin) / 60, 0);
  const peakCurrentA = Math.max(...loadSteps.map((s) => s.currentA));

  const correctedAh = dutyAh * temperatureFactor * ageingFactor * designMargin;

  let cellCount = null;
  if (systemVoltageV > 0 && cellVoltageV > 0) {
    cellCount = Math.ceil(systemVoltageV / cellVoltageV);
  }

  return {
    dutyAh,
    requiredAh: correctedAh,
    totalDurationMin,
    peakCurrentA,
    temperatureFactor, ageingFactor, designMargin,
    combinedFactor: temperatureFactor * ageingFactor * designMargin,
    cellCount,
    note: 'This is the required capacity in ampere-hours. Match it against a real cell datasheet AT THE CORRECT DISCHARGE RATE — a cell rated 100 Ah at the 10-hour rate delivers considerably less over a 1-minute high-current step, and that rate effect is manufacturer-specific data not modelled here.',
  };
}

// ============================================================
// 7. TRANSFORMER LOADING & LOSSES
// ============================================================

/**
 * Transformer loading, efficiency and loss breakdown at a given load.
 *
 * No-load (iron) losses are constant; load (copper) losses vary with the
 * square of load. That is why peak efficiency occurs where the two are
 * equal, usually well below full load.
 */
export function transformerLoading({
  ratingKVA, loadKVA, noLoadLossW, fullLoadLossW, powerFactor = 0.9,
}) {
  if (!(ratingKVA > 0)) throw new Error('Transformer rating (kVA) must be greater than zero.');
  if (!(loadKVA >= 0)) throw new Error('Load (kVA) cannot be negative.');
  if (!(noLoadLossW >= 0)) throw new Error('No-load loss cannot be negative.');
  if (!(fullLoadLossW >= 0)) throw new Error('Full-load copper loss cannot be negative.');
  if (!(powerFactor > 0 && powerFactor <= 1)) throw new Error('Power factor must be greater than 0 and no more than 1.');

  const loadingPu = loadKVA / ratingKVA;
  const copperLossW = fullLoadLossW * loadingPu * loadingPu;
  const totalLossW = noLoadLossW + copperLossW;
  const outputW = loadKVA * 1000 * powerFactor;
  const efficiencyPct = outputW > 0 ? (outputW / (outputW + totalLossW)) * 100 : 0;

  // Peak efficiency is where copper loss equals iron loss.
  const optimalLoadingPu = fullLoadLossW > 0 ? Math.sqrt(noLoadLossW / fullLoadLossW) : 0;

  return {
    loadingPct: loadingPu * 100,
    copperLossW, noLoadLossW, totalLossW,
    efficiencyPct,
    optimalLoadingPct: optimalLoadingPu * 100,
    optimalLoadKVA: optimalLoadingPu * ratingKVA,
    check: loadingPu > 1 ? 'OVERLOADED' : loadingPu > 0.8 ? 'HIGH LOADING' : 'NORMAL',
    // Annual energy lost, useful for the economic case on transformer choice.
    annualLossKWh: (totalLossW / 1000) * 8760,
  };
}
