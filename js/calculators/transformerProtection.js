// transformerProtection.mjs — automatic transformer protection settings.
// Combines shortCircuit.mjs + idmt.mjs + ctEngine.mjs. Implements the
// spec's Section 5 (Transformer Automatic Protection Calculator).
//
// Every "philosophy" number below (pickup multiples, thermal thresholds,
// etc.) is a widely-used typical starting point, always shown alongside the
// assumption used, and tagged RECOMMENDED rather than CALCULATED — the
// distinction the spec explicitly requires (Section 22).
//
// The differential (87T) and on-load tap-changer AVR parameter names and
// structure are aligned to a real numerical transformer protection relay
// (ABB Relion RET620/630 series) — two independently settable differential
// stages (a stabilized/biased low-set stage plus an instantaneous
// high-set stage, the high-set specified by ABB at <25ms operate time for
// severe internal faults) and standard AVR target/bandwidth/time-delay
// settings for a motor-driven on-load tap changer, verified against ABB's
// own published RET620 documentation during development.

import { sqrt3, SETTING_STATUS } from './electricalCommon.js';
import * as sc from './shortCircuit.js';
import * as idmt from './idmt.js';
import * as ct from './ctEngine.js';

export function defaultPhilosophy() {
  return {
    ocPickupMultipleOfFLC: 1.2,       // 50/51 phase OC pickup, typical 1.1-1.3x FLC
    ocCurve: 'VI',
    ocTMS: 0.3,
    efPickupPctOfFLC: 30,             // 50N/51N EF pickup, typical 20-40% of FLC
    efCurve: 'VI',
    efTMS: 0.2,
    diffLowOperatePctIr: 20,          // 87T stabilized/biased low-set stage, %Ir -- ABB RET620 typical 15-30%
    diffSlopePct: 25,                 // 87T differential slope (restraint characteristic), typical 20-30%
    diffHighOperatePctIr: 800,        // 87T instantaneous high-set stage, %Ir -- clears severe internal faults in <25ms regardless of harmonic content, ABB typical 500-1000%
    refStabilityFactorK: 2,
    thermalAlarmPct: 105,             // 49 thermal alarm, typical 100-110% of rating
    thermalTripPct: 120,              // 49 thermal trip, typical 115-130% of rating
    voltsPerHertzAlarmPct: 110,       // 24 V/Hz alarm, typical 105-110%
    voltsPerHertzTripPct: 120,        // 24 V/Hz trip, typical 118-125%
    voltsPerHertzTripDelayS: 6,
    avrTargetPct: 100,                // AVR target LV bus voltage, % of rated -- the on-load tap changer's regulation setpoint
    avrBandwidthPct: 1.5,             // AVR bandwidth/deadband, typical 1-2% -- the tap changer does not operate for excursions within this band, avoiding tap "hunting"
    avrTimeDelayS: 30,                // AVR initial time delay before the first tap command, typical 20-60s -- rides through short voltage dips without unnecessary tap operations
    avrTapStepPct: 1.25,              // typical OLTC step size, commonly 1.25-2.5% per tap for HT/MV distribution transformers
  };
}

/**
 * @param basic { ratingMVA, hvKV, lvKV, impedancePct, hvCtPrimary, hvCtSecondary,
 *   lvCtPrimary, lvCtSecondary, sourceFaultMVA, groundingType, ngrLetThroughA }
 * @param philosophy overrides for defaultPhilosophy()
 */
export function autoGenerate(basic, philosophy = {}) {
  const p = { ...defaultPhilosophy(), ...philosophy };
  const {
    ratingMVA, hvKV, lvKV, impedancePct,
    hvCtPrimary, hvCtSecondary = 1, lvCtPrimary, lvCtSecondary = 1,
    sourceFaultMVA, groundingType = 'solid', ngrLetThroughA,
  } = basic;

  if (!(ratingMVA > 0)) throw new Error('Transformer rating (MVA) must be > 0');
  if (!(hvKV > 0 && lvKV > 0)) throw new Error('HV and LV voltages must be > 0');
  if (!(impedancePct > 0)) throw new Error('Transformer impedance % must be > 0');

  // ---- Step 4: basic electrical parameters ----
  const hvFLC = (ratingMVA * 1e6) / (sqrt3() * hvKV * 1e3);
  const lvFLC = (ratingMVA * 1e6) / (sqrt3() * lvKV * 1e3);
  const turnsRatio = hvKV / lvKV;

  const txFaultMVA = sc.transformerFaultMVA(ratingMVA, impedancePct);
  let hvSideFaultMVA = txFaultMVA;
  let lvSideFaultMVA = txFaultMVA;
  if (sourceFaultMVA) {
    hvSideFaultMVA = sourceFaultMVA; // fault ON the HV bus feeding this transformer
    lvSideFaultMVA = sc.combineSeriesFaultMVA([sourceFaultMVA, txFaultMVA]); // fault on LV side, looking back through the transformer
  }
  const hvFaultKA = sc.threePhaseFaultCurrentKA(hvSideFaultMVA, hvKV);
  const lvFaultKA = sc.threePhaseFaultCurrentKA(lvSideFaultMVA, lvKV);

  const hvCtSec = hvCtPrimary ? ct.ctSecondaryCurrent(hvFLC, hvCtPrimary, hvCtSecondary) : null;
  const lvCtSec = lvCtPrimary ? ct.ctSecondaryCurrent(lvFLC, lvCtPrimary, lvCtSecondary) : null;
  const hvCtFaultSec = hvCtPrimary ? ct.ctSecondaryCurrent(hvFaultKA * 1000, hvCtPrimary, hvCtSecondary) : null;

  // ---- Step 5/6: applicable protection + settings (LV side, most common relay location) ----
  const ocPickupA = lvFLC * (p.ocPickupMultipleOfFLC);
  const ocFaultA = lvFaultKA * 1000;
  let oc = null;
  try {
    const t = idmt.operatingTime(ocFaultA, ocPickupA, p.ocTMS, p.ocCurve);
    oc = { ansi: '50/51', pickupA: ocPickupA, psm: idmt.psm(ocFaultA, ocPickupA), curve: p.ocCurve, tms: p.ocTMS, operatingTimeS: t, status: SETTING_STATUS.RECOMMENDED };
  } catch (e) { oc = { ansi: '50/51', error: e.message }; }

  const efPickupA = lvFLC * (p.efPickupPctOfFLC / 100);
  const lgFaultKA = sc.lineToGroundFaultCurrentKA(lvFaultKA, groundingType, { ngrLetThroughA });
  let ef = null;
  if (lgFaultKA > 0) {
    try {
      const t = idmt.operatingTime(lgFaultKA * 1000, efPickupA, p.efTMS, p.efCurve);
      ef = { ansi: '50N/51N', pickupA: efPickupA, faultKA: lgFaultKA, psm: idmt.psm(lgFaultKA * 1000, efPickupA), curve: p.efCurve, tms: p.efTMS, operatingTimeS: t, status: SETTING_STATUS.RECOMMENDED };
    } catch (e) { ef = { ansi: '50N/51N', pickupA: efPickupA, faultKA: lgFaultKA, error: e.message }; }
  } else {
    ef = { ansi: '50N/51N', note: 'Ungrounded system — earth fault current negligible for a first fault; consider sensitive earth fault or ungrounded-system alarming instead.' };
  }

  const diff = {
    ansi: '87T',
    hvCtSecondaryA: hvCtSec, lvCtSecondaryA: lvCtSec,
    ratioMismatchNote: hvCtSec && lvCtSec ? `HV/LV CT secondary ratio is ${(hvCtSec / lvCtSec).toFixed(3)} at rated load — vector-group and ratio compensation (relay-configured) must match the transformer's actual vector group, not assumed here.` : 'Supply both HV and LV CT ratios to check differential balance.',
    // Two independently settable stages, matching real numerical
    // transformer relay practice: a stabilized/biased low-set stage that
    // stays secure through CT saturation and ratio-mismatch error during
    // heavy through-faults, plus an unrestrained instantaneous high-set
    // stage for severe internal faults, set well above any credible
    // through-fault or inrush current so it only ever sees a genuine
    // internal fault.
    lowSetOperatePctIr: p.diffLowOperatePctIr,
    slopePct: p.diffSlopePct,
    highSetOperatePctIr: p.diffHighOperatePctIr,
    highSetTypicalOperateTimeMs: 25,
    status: SETTING_STATUS.RECOMMENDED,
  };

  const ref = hvCtSec ? {
    ansi: '64REF',
    requiredKneePointV: ct.requiredKneePointVoltage(hvCtFaultSec, basic.ctResistanceOhm ?? 2, basic.leadResistanceOhm ?? 1, p.refStabilityFactorK),
    status: SETTING_STATUS.RECOMMENDED,
  } : { ansi: '64REF', note: 'Supply HV CT ratio and fault current to estimate the required knee-point voltage.' };

  const thermal = {
    ansi: '49',
    alarmPctOfRating: p.thermalAlarmPct,
    tripPctOfRating: p.thermalTripPct,
    status: SETTING_STATUS.RECOMMENDED,
  };

  // On-load tap-changer automatic voltage regulation -- only meaningful
  // for a transformer actually fitted with a motor-driven OLTC, which
  // basic.hasOltc makes an explicit choice rather than an assumption.
  const avr = basic.hasOltc ? {
    function: 'AVR (on-load tap changer)',
    targetPct: p.avrTargetPct, bandwidthPct: p.avrBandwidthPct,
    timeDelayS: p.avrTimeDelayS, tapStepPct: p.avrTapStepPct,
    note: 'Bandwidth is a deadband, not a trip setting — the tap changer only operates once the LV bus voltage excursion exceeds it, avoiding unnecessary tap "hunting" on normal load swings. Confirm the tap step % against the transformer\u2019s actual nameplate tap chart; this is a typical value, not read from a specific transformer.',
    status: SETTING_STATUS.RECOMMENDED,
  } : { function: 'AVR (on-load tap changer)', note: 'Not applicable — this transformer was specified without an on-load tap changer.' };

  const overfluxing = {
    ansi: '24',
    alarmPct: p.voltsPerHertzAlarmPct,
    tripPct: p.voltsPerHertzTripPct,
    tripDelayS: p.voltsPerHertzTripDelayS,
    status: SETTING_STATUS.RECOMMENDED,
  };

  const equipmentProtection = ['Buchholz relay', 'Sudden pressure relay', 'Pressure relief device', 'Oil temperature indicator/trip', 'Winding temperature indicator/trip', 'Cooling (fan/pump) failure alarm'];

  return {
    basicParameters: { hvFLC, lvFLC, turnsRatio, hvFaultKA, lvFaultKA, hvCtSecondaryA: hvCtSec, lvCtSecondaryA: lvCtSec },
    protection: { oc, ef, diff, ref, thermal, overfluxing, avr },
    equipmentProtection,
    philosophy: p,
  };
}
