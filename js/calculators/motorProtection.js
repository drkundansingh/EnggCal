// motorProtection.mjs — automatic HT motor protection settings.
// Implements the spec's Section 6 (HT Motor Automatic Protection
// Calculator) and its own worked example (Section 26): an 11kV, 5MW motor.
//
// Parameter names, setting ranges, and function structure are aligned to
// a real numerical motor protection relay (ABB Relion REM620 series,
// ANSI application) -- the IEC 61850 function block names (MPTTR,
// JAMPTOC, STTPMSU, PREVPTOC, LOFLPTUC, MPDIF...) and their documented
// setting ranges, verified against ABB's own published REM620 product
// guide during development, not invented for this app. A real relay's
// menu structure and exact defaults vary by firmware version and by the
// engineer's own protection philosophy; this calculator's job is to
// compute a legitimate, physically correct starting point in the same
// units and with the same parameter names the relay itself uses, not to
// reproduce one exact factory default set.

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
    negSeqCoolingTimeS: 60,           // MNSPTOC "Cooling time" -- how fast the negative-sequence thermal memory decays once the unbalance clears (ABB range 5-7200s)
    lockedRotorTripMarginS: 3,        // 48/51LR trip delay = starting time + margin (typical 2-5s)
    restartInhibitTimeMin: 15,        // STTPMSU "Restart inhibit time" -- blocks an immediate restart after a stop/trip so the rotor can cool (ABB range 0-250 min); typical HT motor practice is 10-20 min
    underCurrentLowPct: 30,           // LOFLPTUC "Start value low" -- typically a no-load/loss-of-load floor
    underCurrentHighPct: 50,          // LOFLPTUC "Start value high" -- typically the main 37 undercurrent pickup, 40-60% of FLC
    underVoltagePct: 80,              // 27 undervoltage, typical 70-85%
    overVoltagePct: 110,              // 59 overvoltage, typical 110-120%
    voltageTimeDelayS: 2,
    jamMultipleOfFLC: 1.8,            // JAMPTOC -- a sudden current rise while RUNNING (not starting); set BELOW the OC pickup above so jam protection catches this fault mode faster/more sensitively than waiting for the slower OC stage, typical 1.5-2x FLC
    jamDelayS: 2,
    phaseReversalPct: 20,             // PREVPTOC -- typically a low, fixed threshold; ABB range 0.05-1.00 x In
    thermalTimeConstantNormalS: 600,  // MPTTR "Time constant normal" -- running thermal time constant, ABB range 80-4000s; frame-size dependent, this is a mid-range HT motor default
    thermalTimeConstantStartS: 30,    // MPTTR "Time constant start" -- much shorter, since heating during starting is dominated by rotor I2R, not the steady-state running thermal model
    thermalAlarmPct: 80,              // MPTTR "Alarm thermal value" -- % of the thermal trip threshold at which to alarm
    thermalRestartPct: 60,            // MPTTR "Restart thermal value" -- must cool back below this % before a restart is permitted
    diffLowOperatePctIr: 20,          // MPDIF "Low operate value" -- biased/stabilized stage, %Ir, for motors large enough to justify differential CTs at both ends
    diffHighOperatePctIr: 500,        // MPDIF "High operate value" -- instantaneous unstabilized stage, %Ir
  };
}

/**
 * Thermal replica trip time from a cold start, the standard IEC
 * 60255-149 / IEC 60255-8 style IEC form: t = tau * ln[k^2/(k^2 - k_th^2)],
 * where k is the sustained overload in per-unit of In and k_th is the
 * thermal trip threshold in the same units. Verified against expected
 * physical behavior during development: a 150% FLC sustained overload
 * against a 115% threshold and a 600s time constant gives ~530s (a
 * plausible few-minute HT motor overload trip time); 600% FLC (starting-
 * current scale) against the same threshold gives ~22s, consistent with
 * typical HT motor starting-time limits.
 * @returns {number} trip time, s, or Infinity if the current never
 *   reaches the thermal threshold (no trip).
 */
export function thermalTripTimeS(overloadPu, thresholdPu, tauS) {
  if (!(overloadPu > 0)) throw new Error('Overload current (per-unit) must be greater than zero.');
  if (!(thresholdPu > 0)) throw new Error('Thermal trip threshold (per-unit) must be greater than zero.');
  if (!(tauS > 0)) throw new Error('Thermal time constant must be greater than zero.');
  const ratio = (overloadPu * overloadPu) / (overloadPu * overloadPu - thresholdPu * thresholdPu);
  if (ratio <= 1) return Infinity;
  return tauS * Math.log(ratio);
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

  if (!(ratingKW > 0)) throw new Error('Motor rating (kW) must be > 0');
  if (!(voltageKV > 0)) throw new Error('Motor voltage must be > 0');
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
  // 49M — full thermal replica model, not just a flat threshold: a
  // real relay integrates I²t over time with a decaying memory (time
  // constant), so it correctly permits a brief overload but still trips
  // well before a sustained one causes real winding damage.
  const thermalThresholdPu = p.thermalOverloadPct / 100;
  const thermalTripAtFLC = thermalTripTimeS(1.2, thermalThresholdPu, p.thermalTimeConstantNormalS); // representative: trip time at 120% FLC sustained
  const thermal = {
    ansi: '49M', overloadFactor: thermalThresholdPu, alarmPct: p.thermalAlarmPct, restartPct: p.thermalRestartPct,
    timeConstantNormalS: p.thermalTimeConstantNormalS, timeConstantStartS: p.thermalTimeConstantStartS,
    overloadTripTime: Number.isFinite(thermalTripAtFLC) ? `${thermalTripAtFLC.toFixed(1)} s at 120% FLC sustained` : 'never trips at 120% FLC \u2014 raise the overload factor closer to 1.20 if this current level should be cleared',
    status: SETTING_STATUS.RECOMMENDED,
  };

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

  const negSeq = {
    ansi: '46M', pickupPctOfFLC: p.negSeqPickupPct, pickupA: flc * (p.negSeqPickupPct / 100),
    timeDelayS: p.negSeqTimeDelayS, coolingTimeS: p.negSeqCoolingTimeS, status: SETTING_STATUS.RECOMMENDED,
  };

  let lockedRotor = { ansi: '48/51LR', startingCurrentA, restartInhibitTimeMin: p.restartInhibitTimeMin, note: 'Supply starting time to calculate the locked-rotor trip delay.' };
  if (startingTimeS > 0) {
    lockedRotor = {
      ansi: '48/51LR', startingCurrentA, startingTimeS,
      tripDelayS: startingTimeS + p.lockedRotorTripMarginS,
      restartInhibitTimeMin: p.restartInhibitTimeMin,
      status: SETTING_STATUS.RECOMMENDED,
    };
  }

  // 37 — loss-of-load/undercurrent, two levels the way a real relay
  // (ABB LOFLPTUC) sets it: a low floor for genuine no-load/loss-of-
  // load detection, and a higher level for the main undercurrent alarm.
  const underCurrent = {
    ansi: '37', pickupLowPctOfFLC: p.underCurrentLowPct, pickupLowA: flc * (p.underCurrentLowPct / 100),
    pickupHighPctOfFLC: p.underCurrentHighPct, pickupHighA: flc * (p.underCurrentHighPct / 100),
    status: SETTING_STATUS.RECOMMENDED,
  };
  const voltage = {
    ansi: '27/59',
    underVoltagePctOfRated: p.underVoltagePct, overVoltagePctOfRated: p.overVoltagePct,
    timeDelayS: p.voltageTimeDelayS, status: SETTING_STATUS.RECOMMENDED,
  };

  // Motor load jam protection (JAMPTOC) — a sudden current rise while
  // the motor is already RUNNING (a mechanical jam: conveyor, crusher,
  // agitator), genuinely distinct from locked-rotor-at-start protection
  // above: it must sit above full load but well below the OC pickup, so
  // it trips well before the slower 50/51 stage for exactly this fault mode.
  const jam = { ansi: 'JAM', pickupMultipleOfFLC: p.jamMultipleOfFLC, pickupA: flc * p.jamMultipleOfFLC, delayS: p.jamDelayS, status: SETTING_STATUS.RECOMMENDED };

  // Phase reversal protection (PREVPTOC) — prevents the motor from ever
  // being started in the wrong rotational direction (a real and
  // consequential risk after any supply cable work), by checking phase
  // sequence rather than magnitude.
  const phaseReversal = { ansi: 'PREV', pickupPctOfFLC: p.phaseReversalPct, note: 'Trips on incorrect phase sequence at start, independent of current magnitude — guards against reversed rotation after cable or supply work.', status: SETTING_STATUS.RECOMMENDED };

  // Motor differential protection (87M) — only genuinely applicable
  // when CTs are fitted at BOTH the terminal and neutral (star) ends of
  // the motor winding, which in practice means larger HT motors; shown
  // as a recommendation, not assumed to be fitted.
  const motorDiff = {
    ansi: '87M', lowOperatePctIr: p.diffLowOperatePctIr, highOperatePctIr: p.diffHighOperatePctIr,
    applicable: ratingKW >= 1500,
    note: ratingKW >= 1500
      ? 'Motor differential protection is commonly justified at this rating, provided CTs are fitted at both the terminal and neutral (star) ends of the winding.'
      : 'Motor differential protection is typically reserved for larger HT motors (roughly 1.5 MW and above) where the CTs at both winding ends are justified; for this rating, the 50/51 and 46 stages above are the primary short-circuit and unbalance protection.',
    status: SETTING_STATUS.RECOMMENDED,
  };

  return {
    basicParameters: { flc, startingCurrentA, startingKVA, faultKA, ctSecondaryA: ctSec },
    protection: { thermal, oc, ef, negSeq, lockedRotor, underCurrent, voltage, jam, phaseReversal, motorDiff },
    philosophy: p,
  };
}
