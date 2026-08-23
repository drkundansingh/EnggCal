// pid.mjs — standard ISA parallel-form PID calculation and common tuning rules.

/**
 * One-shot PID evaluation (parallel form):
 * Output = Bias + Kp*e + Ki*∫e·dt + Kd*de/dt
 * Here we compute instantaneous P, and I/D terms from provided
 * integral-accumulated-error and error-rate for a single evaluation,
 * which is how a spreadsheet-style "what would the output be" calc works.
 */
export function pidOutput({ sp, pv, kp, ki, kd, integralError = 0, errorRate = 0, bias = 0 }) {
  const error = sp - pv;
  const pTerm = kp * error;
  const iTerm = ki * integralError;
  const dTerm = kd * errorRate;
  const output = bias + pTerm + iTerm + dTerm;
  return { error, pTerm, iTerm, dTerm, output };
}

/** Convert Ki (1/s) <-> Integral time Ti (s): Ki = Kp / Ti */
export function kiFromTi(kp, tiSeconds) {
  if (tiSeconds <= 0) throw new Error('Integral time must be > 0');
  return kp / tiSeconds;
}
export function tiFromKi(kp, ki) {
  if (ki <= 0) throw new Error('Ki must be > 0');
  return kp / ki;
}
/** Kd (s) <-> Derivative time Td (s): Kd = Kp * Td */
export function kdFromTd(kp, tdSeconds) {
  return kp * tdSeconds;
}
export function tdFromKd(kp, kd) {
  if (kp === 0) throw new Error('Kp must be nonzero');
  return kd / kp;
}

/** Ziegler-Nichols open-loop (reaction curve) tuning.
 * Inputs: processGain K, timeConstant T (s), deadTime L (s). */
export function zieglerNicholsOpenLoop(K, T, L) {
  if (L <= 0) throw new Error('Dead time L must be > 0 for ZN open-loop method');
  return {
    P: { kp: T / (K * L) },
    PI: { kp: 0.9 * (T / (K * L)), ti: L / 0.3 },
    PID: { kp: 1.2 * (T / (K * L)), ti: 2 * L, td: 0.5 * L },
  };
}

/** Ziegler-Nichols closed-loop (ultimate gain) tuning.
 * Inputs: ultimate gain Ku, ultimate period Pu (s). */
export function zieglerNicholsClosedLoop(Ku, Pu) {
  return {
    P: { kp: 0.5 * Ku },
    PI: { kp: 0.45 * Ku, ti: Pu / 1.2 },
    PID: { kp: 0.6 * Ku, ti: Pu / 2, td: Pu / 8 },
  };
}

/** Cohen-Coon tuning. Inputs: process gain K, time constant T (s), dead time L (s). */
export function cohenCoon(K, T, L) {
  if (L <= 0) throw new Error('Dead time L must be > 0 for Cohen-Coon method');
  const r = L / T;
  const kp = (1 / (K * r)) * (1.35 + 0.25 * r);
  const ti = L * ((2.5 + 2 * r) / (1 + 0.6 * r));
  const td = L * (0.37 / (1 + 0.2 * r));
  return { PID: { kp, ti, td } };
}

/** IMC / Lambda tuning. Inputs: process gain K, time constant T (s),
 * dead time L (s), closed-loop time constant Lambda (s, tuning aggressiveness). */
export function imcLambda(K, T, L, lambda) {
  if (lambda <= 0) throw new Error('Lambda must be > 0');
  const kp = T / (K * (lambda + L));
  const ti = T;
  const td = (T * L) / (2 * T + L);
  return { PID: { kp, ti, td } };
}

/**
 * Tyreus-Luyben tuning — a deliberately more conservative alternative to
 * Ziegler-Nichols closed-loop, widely preferred in the chemical/process
 * industry because ZN closed-loop is known to be quite oscillatory/underdamped
 * for many real processes. Same inputs as ZN closed-loop (Ku, Pu from a
 * sustained-oscillation or relay test).
 * Reference: Tyreus & Luyben, Ind. Eng. Chem. Res., 1992.
 */
export function tyreusLuyben(Ku, Pu) {
  return {
    PI: { kp: Ku / 3.2, ti: 2.2 * Pu },
    PID: { kp: Ku / 2.2, ti: 2.2 * Pu, td: Pu / 6.3 },
  };
}

/**
 * Chien-Hrones-Reswick (CHR) tuning — from the same reaction-curve data as
 * Ziegler-Nichols open-loop (K, T, L), but with separate rule sets for
 * setpoint-tracking (servo) vs. disturbance-rejection (regulatory) response,
 * each available at 0% overshoot (conservative) or 20% overshoot
 * (faster). This is the classic 1952 CHR table, still one of the most
 * widely cited alternatives to standard Ziegler-Nichols.
 * @param {'setpoint'|'disturbance'} response
 * @param {'0'|'20'} overshootPct
 */
export function chienHronesReswick(K, T, L, response = 'disturbance', overshootPct = '0') {
  if (L <= 0) throw new Error('Dead time L must be > 0 for CHR method');
  const base = T / (K * L);
  const table = {
    disturbance: {
      '0': {
        P: { kp: 0.3 * base },
        PI: { kp: 0.6 * base, ti: 4 * L },
        PID: { kp: 0.95 * base, ti: 2.4 * L, td: 0.42 * L },
      },
      '20': {
        P: { kp: 0.7 * base },
        PI: { kp: 0.7 * base, ti: 2.3 * L },
        PID: { kp: 1.2 * base, ti: 2 * L, td: 0.42 * L },
      },
    },
    setpoint: {
      '0': {
        P: { kp: 0.3 * base },
        PI: { kp: 0.35 * base, ti: 1.2 * T },
        PID: { kp: 0.6 * base, ti: T, td: 0.5 * L },
      },
      '20': {
        P: { kp: 0.7 * base },
        PI: { kp: 0.6 * base, ti: T },
        PID: { kp: 0.95 * base, ti: 1.4 * T, td: 0.47 * L },
      },
    },
  };
  const group = table[response];
  if (!group) throw new Error(`Unknown response type: ${response}`);
  const result = group[overshootPct];
  if (!result) throw new Error(`Unknown overshoot option: ${overshootPct}`);
  return result;
}

/**
 * SIMC (Skogestad Internal Model Control) — a modern, widely-adopted robust
 * PI tuning rule from a first-order-plus-dead-time reaction curve. Popular
 * in the process industry as a more transparent, single-tuning-parameter
 * (tauC) alternative to IMC. tauC (closed-loop time constant) is the one
 * knob: smaller = faster/more aggressive, larger = slower/more robust.
 * A common default is tauC = L (dead time) for a balanced response.
 * Reference: S. Skogestad, "Simple analytic rules for model reduction and
 * PID controller tuning," J. Process Control, 2003.
 */
export function simcSkogestad(K, T, L, tauC) {
  if (tauC + L <= 0) throw new Error('tauC + dead time must be > 0');
  const kp = (1 / K) * (T / (tauC + L));
  const ti = Math.min(T, 4 * (tauC + L));
  return { PI: { kp, ti } };
}

/**
 * Relay-feedback ultimate gain/period estimator (Åström–Hägglund). Instead
 * of manually raising proportional gain until the loop sustains oscillation
 * (which can be slow and risks a large upset), a relay (on/off) test induces
 * a small, bounded, sustained oscillation, from which Ku and Pu are read off
 * directly — this is how most modern DCS/PLC auto-tune features actually
 * work. Feed the resulting Ku, Pu into Ziegler-Nichols closed-loop or
 * Tyreus-Luyben above.
 * @param d relay output amplitude (the on/off step size applied)
 * @param a measured process output (PV) oscillation amplitude
 * @param Pu measured oscillation period (s)
 */
export function relayFeedbackUltimateGain(d, a, Pu) {
  if (a <= 0) throw new Error('Measured PV oscillation amplitude must be > 0');
  if (d <= 0) throw new Error('Relay amplitude must be > 0');
  const Ku = (4 * d) / (Math.PI * a);
  return { Ku, Pu };
}

/** Practical starting-point guidance by loop type — the kind of quick
 * reference an experienced instrument engineer reaches for when there's no
 * time (or need) for a full reaction-curve test. These are commonly cited
 * industry rule-of-thumb ranges, not a substitute for an actual tuning test
 * on the real loop. */
export const LOOP_TYPE_GUIDANCE = [
  {
    type: 'Flow',
    dynamics: 'Fast process, high noise, negligible dead time',
    controller: 'PI (avoid D — amplifies flow noise)',
    kpRange: '0.1 – 0.5',
    tiRange: '0.05 – 0.3 min (3 – 20 s)',
    tdRange: 'Not used',
    notes: 'Tune for noise rejection more than speed — the loop is fast enough that aggressive P gain mainly adds valve wear.',
  },
  {
    type: 'Level',
    dynamics: 'Integrating (no self-regulation), often slow',
    controller: 'P-only (surge/buffer tanks) or PI (tight level control)',
    kpRange: '2 – 10 (often set by desired proportional band %, not tight Kp)',
    tiRange: '1 – 10 min if PI used',
    tdRange: 'Not used',
    notes: 'For surge/buffer vessels, deliberately loose (averaging) level control is often correct — do not over-tune.',
  },
  {
    type: 'Pressure',
    dynamics: 'Moderate speed, gas systems can be fast; liquid header pressure slower',
    controller: 'PI, occasionally PID for large gas volumes with lag',
    kpRange: '2 – 10',
    tiRange: '2 – 10 min',
    tdRange: '0 – 0.5 min if PID used',
    notes: 'Fast gas-pressure loops can behave more like flow loops — check actual process response before assuming this range.',
  },
  {
    type: 'Temperature',
    dynamics: 'Slow, significant dead time and lag typical (heat exchangers, reactors, columns)',
    controller: 'PID — dead time/lag combination usually benefits from derivative action',
    kpRange: '1 – 10 (highly process-dependent)',
    tiRange: '3 – 30 min',
    tdRange: '0.5 – 5 min',
    notes: 'The widest-ranging loop type — always run an actual reaction-curve or relay test rather than relying on this range alone.',
  },
  {
    type: 'Composition / Analyzer',
    dynamics: 'Slow, often significant analyzer transport + cycle-time dead time on top of process dead time',
    controller: 'PI, PID only if analyzer sample time is fast relative to process dynamics',
    kpRange: '0.5 – 5',
    tiRange: '10 – 60 min',
    tdRange: 'Usually 0, unless analyzer is fast',
    notes: 'Analyzer dead time (sample + cycle time) often dominates — check that before tuning as if it were a simple temperature loop.',
  },
];

export const controlLoopStages = [
  'Sensor', 'Transmitter', 'Controller', 'I/P Converter', 'Control Valve', 'Process', 'Feedback',
];
