// transformerProtection.mjs — automatic transformer protection settings.
// Combines shortCircuit.mjs + idmt.mjs + ctEngine.mjs. Implements the
// spec's Section 5 (Transformer Automatic Protection Calculator).
//
// Every "philosophy" number below (pickup multiples, thermal thresholds,
// etc.) is a widely-used typical starting point, always shown alongside the
// assumption used, and tagged RECOMMENDED rather than CALCULATED — the
// distinction the spec explicitly requires (Section 22).

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
    diffSlopePct: 25,                 // 87T differential slope, typical 20-30%
    refStabilityFactorK: 2,
    thermalAlarmPct: 105,             // 49 thermal alarm, typical 100-110% of rating
    thermalTripPct: 120,              // 49 thermal trip, typical 115-130% of rating
    voltsPerHertzAlarmPct: 110,       // 24 V/Hz alarm, typical 105-110%
    voltsPerHertzTripPct: 120,        // 24 V/Hz trip, typical 118-125%
    voltsPerHertzTripDelayS: 6,
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

  if (ratingMVA <= 0) throw new Error('Transformer rating (MVA) must be > 0');
  if (hvKV <= 0 || lvKV <= 0) throw new Error('HV and LV voltages must be > 0');
  if (impedancePct <= 0) throw new Error('Transformer impedance % must be > 0');

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
    slopePct: p.diffSlopePct,
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
    protection: { oc, ef, diff, ref, thermal, overfluxing },
    equipmentProtection,
    philosophy: p,
  };
}
