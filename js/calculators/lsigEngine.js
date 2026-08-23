// lsigEngine.mjs — LT ACB/MCCB LSIG (Long-time/Short-time/Instantaneous/
// Ground-fault) automatic setting suggestion engine. Implements spec
// Section 9. Explicitly does NOT assume every breaker supports every
// function — each function's availability is a caller-supplied flag.

import { SETTING_STATUS } from './electricalCommon.js';

/** Standard-ish LSIG multiplier steps commonly offered on electronic trip
 * units — illustrative, typical steps, NOT specific to any one manufacturer.
 * The UI should let the user pick the closest step their actual breaker offers. */
export const TYPICAL_STEPS = {
  longTimeIr: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],           // × breaker frame/sensor rating
  shortTimeIsd: [1.5, 2, 2.5, 3, 4, 5, 6, 8, 10],             // × Ir
  instantaneousIi: [2, 3, 4, 5, 6, 8, 10, 12],                // × frame rating (when fixed) or × Ir
  groundFaultIg: [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0],         // × frame rating
};

function nearestStep(steps, target) {
  return steps.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), steps[0]);
}

/**
 * @param opts { frameRatingA, loadCurrentA, faultCurrentKA, availableFunctions: {L,S,I,G} }
 */
export function autoGenerate(opts) {
  const { frameRatingA, loadCurrentA, faultCurrentKA, availableFunctions = { L: true, S: true, I: true, G: true } } = opts;
  if (frameRatingA <= 0) throw new Error('Breaker frame rating must be > 0');
  if (loadCurrentA <= 0) throw new Error('Load current must be > 0');
  if (loadCurrentA > frameRatingA) throw new Error('Load current exceeds the breaker frame rating — select a larger frame or check the input');

  const result = {};

  if (availableFunctions.L) {
    const irRatio = Math.min(1.0, Math.max(0.4, (loadCurrentA / frameRatingA) * 1.05)); // ~5% margin above load, clamped to typical range
    const selectedIrRatio = nearestStep(TYPICAL_STEPS.longTimeIr, irRatio);
    result.longTime = {
      ansi: '49/51 (L)', calculatedIrRatio: irRatio, calculatedIrA: irRatio * frameRatingA,
      suggestedIrRatio: selectedIrRatio, suggestedIrA: selectedIrRatio * frameRatingA,
      delayBandNote: 'Long-time delay band selection depends on cable/equipment thermal withstand — set from the manufacturer\'s available delay bands.',
      availableSteps: TYPICAL_STEPS.longTimeIr, status: SETTING_STATUS.RECOMMENDED,
    };
  } else {
    result.longTime = { ansi: '49/51 (L)', note: 'Not available on the selected breaker model.' };
  }

  if (availableFunctions.S && result.longTime.suggestedIrA) {
    const isdRatio = 4; // typical starting point, well clear of inrush/starting transients
    const selectedIsdRatio = nearestStep(TYPICAL_STEPS.shortTimeIsd, isdRatio);
    result.shortTime = {
      ansi: '50/51 (S)', suggestedIsdRatio: selectedIsdRatio, suggestedIsdA: selectedIsdRatio * result.longTime.suggestedIrA,
      availableSteps: TYPICAL_STEPS.shortTimeIsd, status: SETTING_STATUS.RECOMMENDED,
    };
  } else if (availableFunctions.S) {
    result.shortTime = { ansi: '50/51 (S)', note: 'Long-time (L) setting must resolve first — Isd is set as a multiple of Ir.' };
  } else {
    result.shortTime = { ansi: '50/51 (S)', note: 'Not available on the selected breaker model.' };
  }

  if (availableFunctions.I) {
    const iiRatio = 8; // typical starting point for instantaneous, above short-time pickup
    const selectedIiRatio = nearestStep(TYPICAL_STEPS.instantaneousIi, iiRatio);
    result.instantaneous = {
      ansi: '50 (I)', suggestedIiRatio: selectedIiRatio, suggestedIiA: selectedIiRatio * frameRatingA,
      availableSteps: TYPICAL_STEPS.instantaneousIi, status: SETTING_STATUS.RECOMMENDED,
    };
    if (faultCurrentKA && result.instantaneous.suggestedIiA / 1000 > faultCurrentKA) {
      result.instantaneous.warning = `Suggested Ii (${(result.instantaneous.suggestedIiA / 1000).toFixed(2)} kA) exceeds the available fault current (${faultCurrentKA} kA) — instantaneous element may never operate for a bolted fault at this location; consider a lower step.`;
    }
  } else {
    result.instantaneous = { ansi: '50 (I)', note: 'Not available on the selected breaker model.' };
  }

  if (availableFunctions.G) {
    const igRatio = 0.3; // typical starting point, below the long-time pickup, above normal unbalance/leakage
    const selectedIgRatio = nearestStep(TYPICAL_STEPS.groundFaultIg, igRatio);
    result.groundFault = {
      ansi: '50N/51N (G)', suggestedIgRatio: selectedIgRatio, suggestedIgA: selectedIgRatio * frameRatingA,
      availableSteps: TYPICAL_STEPS.groundFaultIg, status: SETTING_STATUS.RECOMMENDED,
    };
  } else {
    result.groundFault = { ansi: '50N/51N (G)', note: 'Not available on the selected breaker model.' };
  }

  return result;
}
