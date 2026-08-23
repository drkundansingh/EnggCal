// motorProtection.mjs — automatic HT motor protection settings.
// Implements the spec's Section 6 (HT Motor Automatic Protection
// Calculator) and its own worked example (Section 26): an 11kV, 5MW motor.

import { sqrt3, SETTING_STATUS } from './electricalCommon.js';
import * as sc from './shortCircuit.js';
import * as idmt from './idmt.js';
import * as ct from './ctEngine.js';

export function defaultPhilosophy() {
  return {
    thermalOverloadPct: 105,          // 49 thermal overload, typical 100-115% of FLC
    ocPickupMultipleOfFLC: 2.0,       // 50/51 phase OC, set above starting current inrush is handled by 48/51LR; this is the running-fault OC, typical 1.5-2.5x FLC once past LR element
    ocCurve: 'VI',
    ocTMS: 0.2,
    efPickupPctOfFLC: 20,             // 50N/51N EF pickup, typical 10-30% of FLC for HT motors
    efTMS: 0.1,
    negSeqPickupPct: 15,              // 46 negative sequence, typical 10-20% of FLC
    negSeqTimeDelayS: 5,
    lockedRotorTripMarginS: 3,        // 48/51LR trip delay = starting time + margin (typical 2-5s)
    underCurrentPct: 50,              // 37 undercurrent, typical 40-60% of FLC
    underVoltagePct: 80,              // 27 undervoltage, typical 70-85%
    overVoltagePct: 110,              // 59 overvoltage, typical 110-120%
    voltageTimeDelayS: 2,
  };
}

/**
 * @param basic { ratingKW, voltageKV, powerFactor, efficiencyPct, startingCurrentMultiple,
 *   startingTimeS, ctPrimary, ctSecondary, sourceFaultMVA, groundingType, ngrLetThroughA }
 */
export function autoGenerate(basic, philosophy = {}) {
  const p = { ...defaultPhilosophy(), ...philosophy };
  const {
    ratingKW, voltageKV, powerFactor, efficiencyPct,
    startingCurrentMultiple = 6, startingTimeS,
    ctPrimary, ctSecondary = 1, sourceFaultMVA, groundingType = 'solid', ngrLetThroughA,
  } = basic;

  if (ratingKW <= 0) throw new Error('Motor rating (kW) must be > 0');
  if (voltageKV <= 0) throw new Error('Motor voltage must be > 0');
  if (!(powerFactor > 0 && powerFactor <= 1)) throw new Error('Power factor must be between 0 and 1');
  if (!(efficiencyPct > 0 && efficiencyPct <= 100)) throw new Error('Efficiency % must be between 0 and 100');

  // ---- Step 4: basic electrical parameters ----
  const inputKW = ratingKW / (efficiencyPct / 100);
  const flc = (inputKW * 1000) / (sqrt3() * voltageKV * 1000 * powerFactor);
  const startingCurrentA = flc * startingCurrentMultiple;
  const startingKVA = sqrt3() * voltageKV * startingCurrentA;

  let faultKA = null;
  if (sourceFaultMVA) faultKA = sc.threePhaseFaultCurrentKA(sourceFaultMVA, voltageKV);
  const ctSec = ctPrimary ? ct.ctSecondaryCurrent(flc, ctPrimary, ctSecondary) : null;

  // ---- Step 6: protection settings ----
  const thermal = { ansi: '49', overloadPctOfFLC: p.thermalOverloadPct, pickupA: flc * (p.thermalOverloadPct / 100), status: SETTING_STATUS.RECOMMENDED };

  const ocPickupA = flc * p.ocPickupMultipleOfFLC;
  let oc = null;
  if (faultKA) {
    try {
      const t = idmt.operatingTime(faultKA * 1000, ocPickupA, p.ocTMS, p.ocCurve);
      oc = { ansi: '50/51', pickupA: ocPickupA, psm: idmt.psm(faultKA * 1000, ocPickupA), curve: p.ocCurve, tms: p.ocTMS, operatingTimeS: t, status: SETTING_STATUS.RECOMMENDED };
    } catch (e) { oc = { ansi: '50/51', pickupA: ocPickupA, error: e.message }; }
  } else {
    oc = { ansi: '50/51', pickupA: ocPickupA, note: 'Supply system fault level to calculate operating time.', status: SETTING_STATUS.RECOMMENDED };
  }

  const efPickupA = flc * (p.efPickupPctOfFLC / 100);
  let ef = null;
  if (faultKA) {
    const lgFaultKA = sc.lineToGroundFaultCurrentKA(faultKA, groundingType, { ngrLetThroughA });
    if (lgFaultKA > 0) {
      try {
        const t = idmt.operatingTime(lgFaultKA * 1000, efPickupA, p.efTMS, 'VI');
        ef = { ansi: '50N/51N', pickupA: efPickupA, faultKA: lgFaultKA, tms: p.efTMS, operatingTimeS: t, status: SETTING_STATUS.RECOMMENDED };
      } catch (e) { ef = { ansi: '50N/51N', pickupA: efPickupA, error: e.message }; }
    } else {
      ef = { ansi: '50N/51N', note: 'Ungrounded system — earth fault current negligible for a first fault.' };
    }
  } else {
    ef = { ansi: '50N/51N', pickupA: efPickupA, note: 'Supply system fault level and grounding type to calculate operating time.', status: SETTING_STATUS.RECOMMENDED };
  }

  const negSeq = { ansi: '46', pickupPctOfFLC: p.negSeqPickupPct, pickupA: flc * (p.negSeqPickupPct / 100), timeDelayS: p.negSeqTimeDelayS, status: SETTING_STATUS.RECOMMENDED };

  let lockedRotor = { ansi: '48/51LR', startingCurrentA, note: 'Supply starting time to calculate the locked-rotor trip delay.' };
  if (startingTimeS > 0) {
    lockedRotor = {
      ansi: '48/51LR', startingCurrentA, startingTimeS,
      tripDelayS: startingTimeS + p.lockedRotorTripMarginS,
      status: SETTING_STATUS.RECOMMENDED,
    };
  }

  const underCurrent = { ansi: '37', pickupPctOfFLC: p.underCurrentPct, pickupA: flc * (p.underCurrentPct / 100), status: SETTING_STATUS.RECOMMENDED };
  const voltage = {
    ansi: '27/59',
    underVoltagePctOfRated: p.underVoltagePct, overVoltagePctOfRated: p.overVoltagePct,
    timeDelayS: p.voltageTimeDelayS, status: SETTING_STATUS.RECOMMENDED,
  };

  return {
    basicParameters: { flc, startingCurrentA, startingKVA, faultKA, ctSecondaryA: ctSec },
    protection: { thermal, oc, ef, negSeq, lockedRotor, underCurrent, voltage },
    philosophy: p,
  };
}
