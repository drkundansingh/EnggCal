// loopUncertainty.js — two calculators that are genuinely awkward to find as
// free, integrated web tools (both are usually solved in homemade
// spreadsheets):
//
//   1. Measurement Loop Uncertainty (RSS error budget across a full loop)
//   2. Control Valve Cavitation / Flashing Predictor
//
// Both use published, standard engineering methods — nothing proprietary and
// nothing invented. Sources are named in the comments on each function.

// ============================================================
// 1. MEASUREMENT LOOP UNCERTAINTY (RSS ERROR BUDGET)
// ============================================================
//
// The core problem: a "±0.1% accurate" transmitter is never the real
// accuracy of the measurement. The delivered number at the operator screen
// carries the sensor error, transmitter reference accuracy, ambient
// temperature effect, static-pressure effect, drift since last calibration,
// and the analogue/digital conversion error of the input card.
//
// Independent, random error terms combine as root-sum-square (RSS), not by
// simple addition — adding them linearly is the classic mistake and badly
// overstates the real uncertainty. Terms that are genuinely systematic
// (a known one-directional bias) should be added arithmetically instead,
// which is why each term is tagged.
//
// Method: standard RSS combination as used in ISA and IEC instrument
// uncertainty practice.

/** How an error term is specified on a datasheet. */
export const ERROR_BASIS = ['% of span', '% of reading', 'engineering units'];

/** Whether a term combines by RSS (random) or adds directly (systematic). */
export const ERROR_KIND = ['random', 'systematic'];

/**
 * Converts one error term to absolute engineering units at a given reading.
 * @param {object} term - { value, basis, kind }
 * @param {number} span - URV - LRV, in engineering units
 * @param {number} reading - the current process value, in engineering units
 */
export function termToAbsolute(term, span, reading) {
  if (!Number.isFinite(term.value) || term.value < 0) {
    throw new Error('Each error term must be a non-negative number.');
  }
  if (!ERROR_BASIS.includes(term.basis)) {
    throw new Error(`Unknown error basis "${term.basis}". Use one of: ${ERROR_BASIS.join(', ')}`);
  }
  if (term.basis === '% of span') return (term.value / 100) * Math.abs(span);
  if (term.basis === '% of reading') return (term.value / 100) * Math.abs(reading);
  return term.value; // already in engineering units
}

/**
 * Combines a list of error terms into a total loop uncertainty.
 *
 * Random terms combine as RSS: sqrt(a^2 + b^2 + ...).
 * Systematic terms add arithmetically, then combine with the RSS result.
 *
 * @param {object} opts
 * @param {number} opts.lrv - lower range value (engineering units)
 * @param {number} opts.urv - upper range value (engineering units)
 * @param {number} opts.reading - process value at which to evaluate
 * @param {Array}  opts.terms - [{ label, value, basis, kind }]
 */
export function loopUncertainty({ lrv, urv, reading, terms }) {
  if (!Number.isFinite(lrv) || !Number.isFinite(urv)) {
    throw new Error('LRV and URV must both be numbers.');
  }
  const span = urv - lrv;
  if (span === 0) throw new Error('Span cannot be zero — URV must differ from LRV.');
  if (!Number.isFinite(reading)) throw new Error('Reading must be a number.');
  if (!Array.isArray(terms) || terms.length === 0) {
    throw new Error('At least one error term is required.');
  }

  const detail = terms.map((t) => {
    const abs = termToAbsolute(t, span, reading);
    return {
      label: t.label || 'Unnamed term',
      value: t.value,
      basis: t.basis,
      kind: ERROR_KIND.includes(t.kind) ? t.kind : 'random',
      absolute: abs,
      // How much this single term contributes to the final RSS total, as a
      // share of the sum of squares — this is what tells you which term is
      // actually worth improving.
      contributionPct: 0, // filled in below
    };
  });

  const randomTerms = detail.filter((d) => d.kind === 'random');
  const systematicTerms = detail.filter((d) => d.kind === 'systematic');

  const sumOfSquares = randomTerms.reduce((acc, d) => acc + d.absolute * d.absolute, 0);
  const rssAbsolute = Math.sqrt(sumOfSquares);
  const systematicAbsolute = systematicTerms.reduce((acc, d) => acc + d.absolute, 0);
  const totalAbsolute = rssAbsolute + systematicAbsolute;

  // Contribution share, computed against the sum of squares for random
  // terms (systematic terms are reported but don't share the RSS budget).
  for (const d of detail) {
    if (d.kind === 'random' && sumOfSquares > 0) {
      d.contributionPct = ((d.absolute * d.absolute) / sumOfSquares) * 100;
    }
  }

  // The dominant term is the single most useful output here: it's the one
  // worth spending money on. Improving anything else barely moves the total.
  const dominant = randomTerms.length
    ? randomTerms.reduce((a, b) => (b.absolute > a.absolute ? b : a))
    : null;

  return {
    span,
    reading,
    rssAbsolute,
    systematicAbsolute,
    totalAbsolute,
    totalPctSpan: (totalAbsolute / Math.abs(span)) * 100,
    // %reading is undefined at a zero reading — report null rather than Infinity.
    totalPctReading: reading !== 0 ? (totalAbsolute / Math.abs(reading)) * 100 : null,
    // Linear (arithmetic) sum of every term, shown only for comparison: this
    // is the overly-pessimistic number you get if you wrongly add all terms.
    linearSumAbsolute: detail.reduce((acc, d) => acc + d.absolute, 0),
    detail,
    dominant,
  };
}

/**
 * Drift is normally quoted per a stated interval (e.g. "±0.1% of span per
 * 12 months"). Real calibration intervals rarely match, so this scales it.
 *
 * Uses the square-root-of-time convention commonly applied to random-walk
 * drift, with a linear option since some manufacturers specify drift as
 * strictly linear with time. The two give meaningfully different answers
 * over long intervals, so the choice is explicit rather than assumed.
 */
export function scaleDrift(quotedDrift, quotedIntervalMonths, actualIntervalMonths, model = 'sqrt') {
  if (!Number.isFinite(quotedDrift) || quotedDrift < 0) throw new Error('Quoted drift must be a non-negative number.');
  if (!Number.isFinite(quotedIntervalMonths) || quotedIntervalMonths <= 0) throw new Error('Quoted drift interval must be greater than zero.');
  if (!Number.isFinite(actualIntervalMonths) || actualIntervalMonths <= 0) throw new Error('Actual calibration interval must be greater than zero.');
  const ratio = actualIntervalMonths / quotedIntervalMonths;
  if (model === 'linear') return quotedDrift * ratio;
  if (model === 'sqrt') return quotedDrift * Math.sqrt(ratio);
  throw new Error('Drift model must be "sqrt" or "linear".');
}

// ============================================================
// 2. CONTROL VALVE CAVITATION / FLASHING PREDICTOR
// ============================================================
//
// Sizing a control valve for capacity (Cv) doesn't tell you whether it will
// destroy itself. A valve can be perfectly sized and still cavitate badly.
//
// Physics, in short:
//  - Liquid accelerating through the valve's vena contracta drops in
//    pressure. If it drops below the fluid's vapour pressure, vapour
//    bubbles form.
//  - If pressure RECOVERS downstream above vapour pressure, those bubbles
//    collapse violently against the valve trim -> CAVITATION (noise,
//    vibration, rapid material loss).
//  - If downstream pressure stays BELOW vapour pressure, the bubbles don't
//    collapse — the fluid stays part-vapour -> FLASHING (erosion further
//    downstream, and choked capacity).
//
// Method follows the standard IEC 60534 / ISA-75 liquid sizing approach:
//   FF (liquid critical pressure ratio factor) = 0.96 - 0.28*sqrt(Pv/Pc)
//   Choked pressure drop:  dP_choked = FL^2 * (P1 - FF*Pv)
//   Service cavitation index:  sigma = (P1 - Pv) / (P1 - P2)
// FL and the cavitation-index limits are VALVE-SPECIFIC and come from the
// manufacturer — this function takes them as inputs and never invents them.

/**
 * Liquid critical pressure ratio factor FF.
 * Standard IEC 60534 / ISA-75 correlation.
 */
export function liquidCriticalPressureRatio(vapourPressure, criticalPressure) {
  if (!Number.isFinite(vapourPressure) || vapourPressure < 0) throw new Error('Vapour pressure must be a non-negative number.');
  if (!Number.isFinite(criticalPressure) || criticalPressure <= 0) throw new Error('Critical pressure must be greater than zero.');
  if (vapourPressure > criticalPressure) throw new Error('Vapour pressure cannot exceed the fluid critical pressure.');
  return 0.96 - 0.28 * Math.sqrt(vapourPressure / criticalPressure);
}

/**
 * Full cavitation / flashing assessment for a liquid service.
 *
 * All pressures must be ABSOLUTE and in the same unit (bar a, psia, kPa a —
 * the analysis is unit-agnostic as long as they're consistent).
 *
 * @param {object} opts
 * @param {number} opts.p1 - valve inlet pressure (absolute)
 * @param {number} opts.p2 - valve outlet pressure (absolute)
 * @param {number} opts.pv - fluid vapour pressure at flowing temperature (absolute)
 * @param {number} opts.pc - fluid thermodynamic critical pressure (absolute)
 * @param {number} opts.fl - liquid pressure recovery factor FL (valve-specific, from manufacturer)
 * @param {number} [opts.sigmaIncipient] - manufacturer's incipient-cavitation index, if known
 * @param {number} [opts.sigmaDamage] - manufacturer's damage-level index, if known
 */
export function cavitationCheck({ p1, p2, pv, pc, fl, sigmaIncipient, sigmaDamage }) {
  if (!Number.isFinite(p1) || p1 <= 0) throw new Error('Inlet pressure P1 must be greater than zero (absolute).');
  if (!Number.isFinite(p2) || p2 < 0) throw new Error('Outlet pressure P2 must be a non-negative number (absolute).');
  if (p2 >= p1) throw new Error('Outlet pressure P2 must be lower than inlet pressure P1.');
  if (!Number.isFinite(pv) || pv < 0) throw new Error('Vapour pressure must be a non-negative number (absolute).');
  if (!Number.isFinite(fl) || fl <= 0 || fl > 1) throw new Error('FL must be greater than zero and no more than 1.');
  if (pv >= p1) throw new Error('Vapour pressure is at or above inlet pressure — the fluid is already boiling at the valve inlet, not a valid liquid sizing case.');

  const ff = liquidCriticalPressureRatio(pv, pc);
  const dpActual = p1 - p2;
  const dpChoked = fl * fl * (p1 - ff * pv);
  const isChoked = dpActual >= dpChoked;

  // Service cavitation index. Higher sigma = further from cavitation.
  const sigmaService = (p1 - pv) / dpActual;

  // Flashing is determined purely by whether downstream pressure sits at or
  // below vapour pressure — it is not a matter of degree like cavitation.
  const isFlashing = p2 <= pv;

  let regime, severity, note;
  if (isFlashing) {
    regime = 'FLASHING';
    severity = 'high';
    note = 'Outlet pressure is at or below vapour pressure, so vapour formed in the valve does not collapse — the two-phase mixture continues downstream. Flashing erodes the valve outlet and downstream piping rather than the trim, is inherently choked, and cannot be designed away by trim selection alone: it usually needs material selection (hardened/erosion-resistant), an expanded outlet, and downstream piping designed for two-phase flow.';
  } else if (Number.isFinite(sigmaDamage) && sigmaService <= sigmaDamage) {
    regime = 'CAVITATION — damage level';
    severity = 'high';
    note = 'Service sigma is at or below the manufacturer\u2019s stated damage index. Expect material loss, noise and vibration in continuous service. Typical remedies: multi-stage/anti-cavitation trim, staged pressure letdown across two valves in series, or relocating the valve to raise back-pressure.';
  } else if (Number.isFinite(sigmaIncipient) && sigmaService <= sigmaIncipient) {
    regime = 'CAVITATION — incipient';
    severity = 'medium';
    note = 'Service sigma is at or below the manufacturer\u2019s incipient-cavitation index: cavitation is beginning. Often tolerable intermittently, but not for continuous duty — audible noise is usually the first field symptom.';
  } else if (isChoked) {
    regime = 'CHOKED FLOW';
    severity = 'medium';
    note = 'The pressure drop meets or exceeds the choked limit, so additional pressure drop will not increase flow. Cavitation indices were not supplied (or are not exceeded), but choked liquid flow in a non-flashing service generally implies significant cavitation is present.';
  } else {
    regime = 'NO CAVITATION PREDICTED';
    severity = 'normal';
    note = 'Operating below the choked limit and above the supplied cavitation indices. Note that without manufacturer sigma values, this only confirms the flow is not choked — it is not a full guarantee of cavitation-free service.';
  }

  const indicesSupplied = Number.isFinite(sigmaIncipient) || Number.isFinite(sigmaDamage);

  return {
    ff,
    dpActual,
    dpChoked,
    isChoked,
    isFlashing,
    sigmaService,
    // Fraction of the choked limit actually being used — a quick margin read.
    chokedRatio: dpActual / dpChoked,
    regime,
    severity,
    note,
    indicesSupplied,
    assumptions: indicesSupplied
      ? 'FL and the sigma indices are valve-specific values taken from the manufacturer\u2019s data.'
      : 'No manufacturer sigma indices were supplied, so only choked-flow and flashing conditions could be evaluated. Cavitation onset genuinely cannot be assessed without valve-specific sigma data — this result is not a cavitation-free confirmation.',
  };
}
