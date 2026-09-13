import { Lag, DeadTime, Integrator, RateLimit, PID } from './loopDynamics.js';

// samaLogic.js — SAMA-standard logic/function blocks (ISA/SAMA PMC 22.1
// style symbols, as used throughout combustion and boiler control logic
// diagrams) and a simple, explicit chain evaluator.
//
// Scope: covers the ALGEBRAIC and BOOLEAN SAMA blocks (summers, selectors,
// limiters, bias, gain, AND/OR/NOT, comparators) that make up the great
// majority of real interlock and permissive logic, PLUS the standard
// dynamic/time-based SAMA blocks (lag, lead-lag, integrator, rate limit,
// dead time, PID) needed for genuine control-loop behavior. Dynamic
// blocks reuse the SAME Lag/Integrator/RateLimit/DeadTime/PID classes
// already verified throughout the Control Loops section -- not
// reimplemented, so their correctness inherits directly from that
// existing, tested code.

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
/** The real 4-20mA loop current corresponding to an engineering value
 * within its calibrated [lo, hi] span -- 4mA at the low end, 20mA at
 * the high end, linear in between, exactly how a real transmitter or
 * positioner's loop current relates to its calibrated range. */
export function milliamps(value, lo, hi) {
  if (hi === lo) return 12; // a zero-span range has no meaningful slope; report the mid-scale value rather than dividing by zero
  const pu = clamp((value - lo) / (hi - lo), 0, 1);
  return 4 + pu * 16;
}

// Each block type: id, label, category ('analog' | 'logic' | 'dynamic'),
// how many inputs it takes (fixed number, or {min,max} for a variable
// count), its parameter schema (for the UI to render fields).
//
// STATIC blocks (analog/logic) have a pure compute(inputs, params) ->
// number function -- output depends only on the CURRENT inputs, safe to
// evaluate in any single instant with no history.
//
// DYNAMIC blocks additionally set dynamic:true and provide:
//   createState(params, dt) -> a fresh stateful instance (called once,
//     when the block is added or the simulation is reset)
//   stepCompute(state, inputs, params, dt) -> number, advances that
//     instance by one time step and returns its new output. Calling this
//     repeatedly with dt seconds between calls IS what makes it dynamic;
//     unlike a static block, the same inputs can give a different output
//     depending on the block's accumulated history.
//
// Analog blocks work in real-valued signals; logic blocks treat any
// input >= 0.5 as TRUE (matching how a boolean is commonly represented
// on a 0/1 analog signal in real PLC/DCS logic), and output 1 (true) or
// 0 (false).

export const SAMA_BLOCK_TYPES = {
  summer: {
    label: 'Summer (\u03a3)', category: 'analog', inputs: { min: 2, max: 6 },
    params: [{ id: 'bias', label: 'Bias', default: 0 }],
    description: 'Weighted sum of its inputs, plus a bias. Each input has its own +/- gain (sign), the standard SAMA summing junction.',
    compute(inputs, params, gains) {
      const g = gains && gains.length === inputs.length ? gains : inputs.map(() => 1);
      return inputs.reduce((sum, v, i) => sum + v * g[i], 0) + (params.bias || 0);
    },
  },
  average: {
    label: 'Averaging (\u03a3/n)', category: 'analog', inputs: { min: 2, max: 6 },
    params: [],
    description: 'The algebraic sum of its inputs divided by the number of inputs: m = (x\u2081 + x\u2082 + ... + x\u2099) / n. The standard SAMA averaging junction \u2014 distinct from Summer, which does not divide by the input count.',
    compute(inputs) { return inputs.reduce((sum, v) => sum + v, 0) / inputs.length; },
  },
  gain: {
    label: 'Gain (K)', category: 'analog', inputs: { min: 1, max: 1 },
    params: [{ id: 'k', label: 'Gain (K)', default: 1 }],
    description: 'Multiplies its single input by a constant K.',
    compute(inputs, params) { return inputs[0] * (params.k ?? 1); },
  },
  bias: {
    label: 'Bias (+/-)', category: 'analog', inputs: { min: 1, max: 1 },
    params: [{ id: 'offset', label: 'Offset', default: 0 }],
    description: 'Adds a fixed offset to its input.',
    compute(inputs, params) { return inputs[0] + (params.offset ?? 0); },
  },
  multiply: {
    label: 'Multiply (\u00d7)', category: 'analog', inputs: { min: 2, max: 2 },
    params: [],
    description: 'Product of its two inputs.',
    compute(inputs) { return inputs[0] * inputs[1]; },
  },
  divide: {
    label: 'Divide (\u00f7)', category: 'analog', inputs: { min: 2, max: 2 },
    inputLabels: ['Numerator', 'Denominator'],
    params: [],
    description: 'First input divided by the second.',
    compute(inputs) {
      if (inputs[1] === 0) throw new Error('Divide block: divisor (input 2) is zero.');
      return inputs[0] / inputs[1];
    },
  },
  highSelect: {
    label: 'High Select (>)', category: 'analog', inputs: { min: 2, max: 6 },
    params: [],
    description: 'Outputs the HIGHEST of its inputs \u2014 the standard SAMA high-select used to make one demand win.',
    compute(inputs) { return Math.max(...inputs); },
  },
  lowSelect: {
    label: 'Low Select (<)', category: 'analog', inputs: { min: 2, max: 6 },
    params: [],
    description: 'Outputs the LOWEST of its inputs.',
    compute(inputs) { return Math.min(...inputs); },
  },
  highLimit: {
    label: 'High Limit', category: 'analog', inputs: { min: 1, max: 1 },
    params: [{ id: 'limit', label: 'Upper limit', default: 100 }],
    description: 'Clamps the input so it can never exceed the set limit.',
    compute(inputs, params) { return Math.min(inputs[0], params.limit ?? 100); },
  },
  lowLimit: {
    label: 'Low Limit', category: 'analog', inputs: { min: 1, max: 1 },
    params: [{ id: 'limit', label: 'Lower limit', default: 0 }],
    description: 'Clamps the input so it can never fall below the set limit.',
    compute(inputs, params) { return Math.max(inputs[0], params.limit ?? 0); },
  },
  deadband: {
    label: 'Deadband', category: 'analog', inputs: { min: 1, max: 1 },
    params: [{ id: 'band', label: 'Deadband (\u00b1)', default: 1 }],
    description: 'Outputs zero for any input within +/- the deadband of zero; passes the input through unchanged outside that band.',
    compute(inputs, params) {
      const band = Math.abs(params.band ?? 1);
      return Math.abs(inputs[0]) <= band ? 0 : inputs[0];
    },
  },
  sqrt: {
    label: 'Square Root', category: 'analog', inputs: { min: 1, max: 1 },
    params: [],
    description: 'Square root extractor \u2014 the classic SAMA symbol for linearizing a DP flow signal.',
    compute(inputs) {
      if (inputs[0] < 0) throw new Error('Square Root block: input is negative.');
      return Math.sqrt(inputs[0]);
    },
  },
  power: {
    label: 'Exponential (x\u207f)', category: 'analog', inputs: { min: 1, max: 1 },
    params: [{ id: 'n', label: 'Exponent (n)', default: 2 }],
    description: 'Raises its input to a power: m = x\u207f. Covers both a squaring/cubing block (n=2, n=3) and, with a fractional exponent, a general root extractor \u2014 n=0.5 is equivalent to the dedicated Square Root block above.',
    compute(inputs, params) {
      const n = params.n ?? 2;
      if (inputs[0] < 0 && !Number.isInteger(n)) throw new Error('Exponential block: a fractional exponent needs a non-negative input.');
      return Math.pow(inputs[0], n);
    },
  },
  functionBlock: {
    label: 'Function (f(x))', category: 'analog', inputs: { min: 1, max: 1 },
    params: [
      { id: 'x1', label: 'Point 1 \u2014 x', default: 0 }, { id: 'y1', label: 'Point 1 \u2014 y', default: 0 },
      { id: 'x2', label: 'Point 2 \u2014 x', default: 25 }, { id: 'y2', label: 'Point 2 \u2014 y', default: 25 },
      { id: 'x3', label: 'Point 3 \u2014 x', default: 50 }, { id: 'y3', label: 'Point 3 \u2014 y', default: 50 },
      { id: 'x4', label: 'Point 4 \u2014 x', default: 75 }, { id: 'y4', label: 'Point 4 \u2014 y', default: 75 },
      { id: 'x5', label: 'Point 5 \u2014 x', default: 100 }, { id: 'y5', label: 'Point 5 \u2014 y', default: 100 },
    ],
    description: 'The standard\u2019s Nonlinear Function, m = f(x): a 5-point piecewise-linear characterizer, the real technique used to linearize a nonlinear sensor curve or shape a control valve\u2019s installed characteristic (e.g. converting a linear controller output into an equal-percentage or quick-opening valve response). Set the five (x, y) points to describe the curve; the output linearly interpolates between whichever two points the input falls between, and holds flat at the first or last point\u2019s y value below or above the defined range \u2014 the default points describe a straight y=x line, so an unconfigured block passes its input through unchanged until you shape a real curve.',
    compute(inputs, params) {
      const x = inputs[0];
      const pts = [
        { x: params.x1 ?? 0, y: params.y1 ?? 0 }, { x: params.x2 ?? 25, y: params.y2 ?? 25 },
        { x: params.x3 ?? 50, y: params.y3 ?? 50 }, { x: params.x4 ?? 75, y: params.y4 ?? 75 },
        { x: params.x5 ?? 100, y: params.y5 ?? 100 },
      ].sort((a, b) => a.x - b.x);
      if (x <= pts[0].x) return pts[0].y;
      if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
      for (let i = 0; i < pts.length - 1; i++) {
        if (x >= pts[i].x && x <= pts[i + 1].x) {
          const span = pts[i + 1].x - pts[i].x;
          const frac = span === 0 ? 0 : (x - pts[i].x) / span;
          return pts[i].y + frac * (pts[i + 1].y - pts[i].y);
        }
      }
      return pts[pts.length - 1].y;
    },
  },
  and: {
    signalType: 'digital',
    label: 'AND', category: 'logic', inputs: { min: 2, max: 6 },
    params: [],
    description: 'TRUE only when ALL inputs are TRUE (>= 0.5).',
    compute(inputs) { return inputs.every((v) => v >= 0.5) ? 1 : 0; },
  },
  or: {
    signalType: 'digital',
    label: 'OR', category: 'logic', inputs: { min: 2, max: 6 },
    params: [],
    description: 'TRUE when ANY input is TRUE (>= 0.5).',
    compute(inputs) { return inputs.some((v) => v >= 0.5) ? 1 : 0; },
  },
  not: {
    signalType: 'digital',
    label: 'NOT', category: 'logic', inputs: { min: 1, max: 1 },
    params: [],
    description: 'Inverts its single input.',
    compute(inputs) { return inputs[0] >= 0.5 ? 0 : 1; },
  },
  comparator: {
    signalType: 'digital',
    label: 'Comparator (>)', category: 'logic', inputs: { min: 2, max: 2 },
    inputLabels: ['A', 'B'],
    params: [],
    description: 'TRUE when input 1 is greater than input 2 \u2014 wire a constant setpoint into input 2 for a fixed-setpoint trip.',
    compute(inputs) { return inputs[0] > inputs[1] ? 1 : 0; },
  },
  transfer: {
    label: 'Transfer (T)', category: 'analog', inputs: { min: 3, max: 3 },
    inputLabels: ['Auto', 'Manual', 'Select'],
    params: [],
    description: 'The real manual/auto control station (drawn as a diamond in the actual standard): outputs the Auto signal when Select is FALSE, or the Manual signal when Select is TRUE, with the switch state set by external means \u2014 an operator flipping a station between automatic control and manual override, without any bump calculation modeled here (a real station also tracks the unselected input so the transfer is bumpless; this block reports the ideal switched value only).',
    compute(inputs) { return inputs[2] >= 0.5 ? inputs[1] : inputs[0]; },
  },
  lag: {
    label: 'Lag (1st order)', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [{ id: 'tau', label: 'Time constant \u03c4 (s)', default: 10 }],
    description: 'First-order time lag \u2014 the standard SAMA symbol for a thermal, sensor, or process time constant. Output chases the input exponentially, reaching ~63% of a step change after one \u03c4.',
    createState(params) { return new Lag(Math.max(params.tau ?? 10, 0.01), 0); },
    stepCompute(state, inputs, params, dt) { state.tau = Math.max(params.tau ?? 10, 0.01); return state.step(inputs[0], dt); },
  },
  derivative: {
    label: 'Derivative (d/dt)', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [{ id: 'td', label: 'Derivative time T\u1d05 (s)', default: 1 }],
    description: 'Output proportional to the rate of change of the input: m = T\u1d05 \u00b7 dx/dt, the standalone SAMA derivative function (distinct from a PID\u2019s built-in D term). A pure derivative reacts instantly to a step change in the input and is genuinely noise-sensitive \u2014 exactly like a real derivative element, which is why real controllers almost always filter it; this block implements the standard\u2019s ideal, unfiltered definition.',
    createState() { return { prevInput: null }; },
    stepCompute(state, inputs, params, dt) {
      const td = params.td ?? 1;
      if (state.prevInput === null) { state.prevInput = inputs[0]; return 0; }
      const rate = (inputs[0] - state.prevInput) / dt;
      state.prevInput = inputs[0];
      return td * rate;
    },
  },
  leadLag: {
    label: 'Lead-Lag', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [{ id: 'leadT', label: 'Lead time (s)', default: 5 }, { id: 'lagT', label: 'Lag time (s)', default: 20 }],
    description: 'Standard dynamic compensator (1+T\u2097\u2091\u2090\u2094s)/(1+T\u2097\u2090\u2093s) \u2014 speeds up (lead) or slows down (lag) a signal\u2019s response while keeping steady-state gain of exactly 1. Implemented as a lag filter plus a proportional lead boost, the standard noise-avoiding DCS realization.',
    createState() { return { yLag: 0 }; },
    stepCompute(state, inputs, params, dt) {
      const lagT = Math.max(params.lagT ?? 20, 0.01), leadT = params.leadT ?? 5;
      const alpha = 1 - Math.exp(-dt / lagT);
      state.yLag += alpha * (inputs[0] - state.yLag);
      return state.yLag + (leadT / lagT) * (inputs[0] - state.yLag);
    },
  },
  integrator: {
    label: 'Integrator (\u222b)', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [{ id: 'gain', label: 'Gain', default: 1 }, { id: 'min', label: 'Output min', default: 0 }, { id: 'max', label: 'Output max', default: 100 }],
    description: 'Integrates its input over time \u2014 the standard SAMA symbol for level, inventory, or any accumulating quantity with no self-regulation.',
    createState(params) { return new Integrator(params.gain ?? 1, 0, params.min ?? -Infinity, params.max ?? Infinity); },
    stepCompute(state, inputs, params, dt) {
      state.k = params.gain ?? 1; state.min = params.min ?? -Infinity; state.max = params.max ?? Infinity;
      return state.step(inputs[0], dt);
    },
  },
  rateLimit: {
    label: 'Rate Limiter', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [{ id: 'rate', label: 'Max rate (units/s)', default: 5 }],
    description: 'Limits how fast its output can change \u2014 the standard SAMA symbol for a real actuator or setpoint that cannot slew instantly.',
    createState(params) { return new RateLimit(Math.abs(params.rate ?? 5), 0); },
    stepCompute(state, inputs, params, dt) { state.rate = Math.abs(params.rate ?? 5); return state.step(inputs[0], dt); },
  },
  deadTime: {
    label: 'Dead Time', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [{ id: 'delay', label: 'Delay (s)', default: 5 }],
    description: 'Pure transport delay \u2014 the input reappears unchanged after the set delay, the standard SAMA symbol for pipeline or conveyor transport lag.',
    createState(params, dt) { return new DeadTime(Math.max(params.delay ?? 5, dt), dt, 0); },
    stepCompute(state, inputs) { return state.step(inputs[0]); },
  },
  pid: {
    label: 'PID Controller', category: 'dynamic', dynamic: true, inputs: { min: 2, max: 2 },
    inputLabels: ['SP', 'PV'],
    params: [
      { id: 'kp', label: 'Kp', default: 1 }, { id: 'ki', label: 'Ki', default: 0.1 }, { id: 'kd', label: 'Kd', default: 0 },
      { id: 'outMin', label: 'Output min', default: 0 }, { id: 'outMax', label: 'Output max', default: 100 },
    ],
    description: 'Full PID controller \u2014 input 1 is the setpoint (SP), input 2 is the process value (PV). Reuses the same anti-windup PID class used throughout every Control Loops simulation.',
    createState(params) {
      return new PID({ kp: params.kp ?? 1, ki: params.ki ?? 0.1, kd: params.kd ?? 0, outMin: params.outMin ?? 0, outMax: params.outMax ?? 100, initialOutput: params.outMin ?? 0 });
    },
    stepCompute(state, inputs, params, dt) {
      state.kp = params.kp ?? 1; state.ki = params.ki ?? 0.1; state.kd = params.kd ?? 0;
      state.outMin = params.outMin ?? 0; state.outMax = params.outMax ?? 100;
      return state.step(inputs[0], inputs[1], dt);
    },
  },
  srLatch: {
    signalType: 'digital',
    label: 'SR Latch (Reset-Dominant)', category: 'dynamic', dynamic: true, inputs: { min: 2, max: 2 },
    inputLabels: ['Set', 'Reset'],
    params: [],
    description: 'Set-Reset memory latch \u2014 input 1 is Set, input 2 is Reset. Output goes TRUE when Set is TRUE, goes FALSE when Reset is TRUE, and HOLDS its last value when both are FALSE. Reset-dominant (the standard\u2019s "R\u2080 dominant" memory): if both are TRUE at once, the output goes FALSE \u2014 the standard choice for a stop/trip circuit, where a simultaneous start-and-stop command should always stop, never start.',
    createState() { return { out: 0 }; },
    stepCompute(state, inputs) {
      if (inputs[1] >= 0.5) state.out = 0;
      else if (inputs[0] >= 0.5) state.out = 1;
      return state.out;
    },
  },
  srLatchSetDominant: {
    signalType: 'digital',
    label: 'SR Latch (Set-Dominant)', category: 'dynamic', dynamic: true, inputs: { min: 2, max: 2 },
    inputLabels: ['Set', 'Reset'],
    params: [],
    description: 'The same Set-Reset memory as the Reset-dominant latch above, but with the priority reversed (the standard\u2019s "S\u2080 dominant" memory): if Set and Reset are both TRUE at once, the output goes TRUE. Genuinely useful for the opposite real case \u2014 a permissive or enable latch where you want a simultaneous set-and-clear command to favor staying enabled rather than clearing.',
    createState() { return { out: 0 }; },
    stepCompute(state, inputs) {
      if (inputs[0] >= 0.5) state.out = 1;
      else if (inputs[1] >= 0.5) state.out = 0;
      return state.out;
    },
  },
  timeDelay: {
    signalType: 'digital',
    label: 'Time Delay (TON/TOF)', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [{ id: 'delaySec', label: 'Delay (s)', default: 5 }, { id: 'mode', label: 'Mode', default: 0, options: [{ value: 0, label: 'ON-delay (delays TRUE)' }, { value: 1, label: 'OFF-delay (delays FALSE)' }] }],
    description: 'Delays a boolean transition by a set time \u2014 the standard interlock pattern for "confirm this has been true for N seconds before acting." ON-delay (mode 0) delays the TRUE transition; the timer resets if the input drops before the delay completes. OFF-delay (mode 1) delays the FALSE transition instead.',
    createState() { return { elapsed: 0, out: 0 }; },
    stepCompute(state, inputs, params, dt) {
      const delaySec = Math.max(params.delaySec ?? 5, 0);
      const onDelay = (params.mode ?? 0) < 0.5;
      const inputBool = inputs[0] >= 0.5;
      if (onDelay) {
        if (inputBool) { state.elapsed = Math.min(delaySec, state.elapsed + dt); state.out = state.elapsed >= delaySec ? 1 : 0; }
        else { state.elapsed = 0; state.out = 0; }
      } else {
        if (inputBool) { state.elapsed = 0; state.out = 1; }
        else { state.elapsed = Math.min(delaySec, state.elapsed + dt); state.out = state.elapsed >= delaySec ? 0 : 1; }
      }
      return state.out;
    },
  },
  pulseTimer: {
    signalType: 'digital',
    label: 'Pulse Timer (one-shot)', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [{ id: 'pulseDurSec', label: 'Pulse duration (s)', default: 2 }],
    description: 'Outputs a single fixed-duration TRUE pulse on each rising edge of its input, then returns to FALSE on its own regardless of what the input does afterward \u2014 the standard "momentary output" pattern (e.g. pulsing a solenoid for exactly N seconds). Needs a new rising edge to retrigger; holding the input TRUE does not extend or repeat the pulse.',
    createState() { return { prevInput: false, pulsing: false, elapsed: 0 }; },
    stepCompute(state, inputs, params, dt) {
      const pulseDurSec = Math.max(params.pulseDurSec ?? 2, 0);
      const inputBool = inputs[0] >= 0.5;
      const risingEdge = inputBool && !state.prevInput;
      state.prevInput = inputBool;
      if (risingEdge && !state.pulsing) { state.pulsing = true; state.elapsed = 0; }
      const out = state.pulsing ? 1 : 0; // captured before advancing, so THIS step still reports active for its full duration
      if (state.pulsing) {
        state.elapsed += dt;
        if (state.elapsed >= pulseDurSec) state.pulsing = false;
      }
      return out;
    },
  },
  toggle: {
    signalType: 'digital',
    label: 'Toggle (Alternator)', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [],
    description: 'Flips its output between 0 and 1 on each rising edge of its input \u2014 the real duty/standby alternation pattern used to swap which pump or fan takes the lead role each time it starts, so run-hours stay balanced across redundant equipment instead of always loading the same machine. Holding the input high does not re-toggle; it needs a fresh rising edge, exactly like a real pump-alternator relay.',
    createState() { return { out: 0, prevInput: 0 }; },
    stepCompute(state, inputs) {
      const rising = inputs[0] >= 0.5 && state.prevInput < 0.5;
      if (rising) state.out = state.out >= 0.5 ? 0 : 1;
      state.prevInput = inputs[0];
      return state.out;
    },
  },
  counter: {
    label: 'Counter', category: 'dynamic', dynamic: true, inputs: { min: 2, max: 2 },
    inputLabels: ['Count', 'Reset'],
    params: [],
    description: 'Counts rising edges on its Count input \u2014 motor starts, batch cycles, alarm occurrences \u2014 and holds the running total until Reset goes TRUE, which zeroes it (reset-dominant, like the SR Latch: if both are TRUE at once, the count clears).',
    createState() { return { count: 0, prevCount: 0 }; },
    stepCompute(state, inputs) {
      if (inputs[1] >= 0.5) { state.count = 0; state.prevCount = 0; return state.count; }
      const rising = inputs[0] >= 0.5 && state.prevCount < 0.5;
      if (rising) state.count += 1;
      state.prevCount = inputs[0];
      return state.count;
    },
  },
  peakHold: {
    label: 'Peak Hold (Max)', category: 'dynamic', dynamic: true, inputs: { min: 2, max: 2 },
    inputLabels: ['Value', 'Reset'],
    params: [],
    description: 'Holds the highest Value seen since the last Reset \u2014 the real pattern behind a peak-demand meter or a "highest alarm reading since last acknowledged" indicator. Reset does not clear to zero; it restarts tracking from whatever Value is present at that instant, so the output is never a meaningless dip to zero right after a reset.',
    createState() { return { peak: -Infinity }; },
    stepCompute(state, inputs) {
      if (inputs[1] >= 0.5) { state.peak = inputs[0]; return state.peak; }
      state.peak = Math.max(state.peak, inputs[0]);
      return state.peak;
    },
  },
  pulseGenerator: {
    signalType: 'digital',
    label: 'Pulse Generator', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    inputLabels: ['Enable'],
    params: [
      { id: 'onTimeSec', label: 'ON time (s)', default: 1 },
      { id: 'offTimeSec', label: 'OFF time (s)', default: 1 },
    ],
    description: 'A free-running repeating pulse train (a PLC-style clock pulse), NOT the same thing as the Pulse Timer above \u2014 that one fires a single pulse per trigger edge, this one cycles ON/OFF continuously on its own with independently settable ON and OFF times, for as long as Enable is TRUE. The real uses: exercising a Counter or Toggle block with a steady stream of pulses without manually clicking a DI over and over, or simulating a periodic real-world signal such as a turbine flow meter\u2019s pulse output or a panel indicator\u2019s blink rate. Enable FALSE holds the output at 0 and resets the cycle, so re-enabling always starts on a fresh ON phase rather than resuming mid-cycle.',
    createState() { return { elapsed: 0, phaseOn: true }; },
    stepCompute(state, inputs, params, dt) {
      const onTimeSec = Math.max(params.onTimeSec ?? 1, dt);
      const offTimeSec = Math.max(params.offTimeSec ?? 1, dt);
      if (inputs[0] < 0.5) { state.elapsed = 0; state.phaseOn = true; return 0; }
      const out = state.phaseOn ? 1 : 0;
      state.elapsed += dt;
      const limit = state.phaseOn ? onTimeSec : offTimeSec;
      if (state.elapsed >= limit) { state.elapsed -= limit; state.phaseOn = !state.phaseOn; }
      return out;
    },
  },
  ramp: {
    label: 'Ramp Generator (f(t))', category: 'dynamic', dynamic: true, inputs: { min: 2, max: 2 },
    inputLabels: ['Enable', 'Target'],
    params: [{ id: 'rate', label: 'Rate (units/s)', default: 1 }],
    description: 'The standard SAMA time-function generator, m = f(t): while Enable is TRUE, the output ramps toward Target at the set Rate and then holds there \u2014 it does not overshoot or oscillate, it simply stops changing once it arrives. The real use: testing how downstream control responds to a slowly-changing setpoint or process value instead of an instant step, e.g. ramping a turbine\u2019s target load or a furnace\u2019s target temperature the way a real operator or startup sequencer would, rather than snapping it to a new value immediately. Enable FALSE freezes the output at its current value \u2014 it does not reset to zero \u2014 so pausing and resuming continues the ramp from wherever it left off.',
    createState() { return { value: 0 }; },
    stepCompute(state, inputs, params, dt) {
      if (inputs[0] < 0.5) return state.value;
      const rate = Math.max(params.rate ?? 1, 0);
      const step = rate * dt;
      const target = inputs[1];
      if (state.value < target) state.value = Math.min(target, state.value + step);
      else if (state.value > target) state.value = Math.max(target, state.value - step);
      return state.value;
    },
  },
  di: {
    signalType: 'digital',
    label: 'DI (Digital Input)', category: 'io', inputs: { min: 0, max: 0 },
    params: [{ id: 'state', label: 'State (0=OFF, 1=ON)', default: 0 }],
    description: 'Field digital input terminal \u2014 represents a real ON/OFF signal (limit switch, permissive contact, etc.) entering the logic. Has no inputs of its own; its value is the field state you set directly.',
    compute(inputs, params) { return params.state >= 0.5 ? 1 : 0; },
  },
  manualValue: {
    label: 'Manual Value (A)', category: 'analog', inputs: { min: 0, max: 0 },
    params: [{ id: 'value', label: 'Value (+/-)', default: 0 }],
    description: 'The standard\u2019s Variable Signal Generator (m = A): a manually-set number, positive or negative, with no calibrated range or process-parameter meaning attached \u2014 unlike an AI field terminal, which represents a real transmitter clamped to its calibrated span. Use this for a plain manual entry, bias reference, or test value that should pass straight through to whatever it\u2019s wired into.',
    compute(inputs, params) { return params.value ?? 0; },
  },
  tagRef: {
    label: 'Tag Reference', category: 'analog', inputs: { min: 0, max: 0 },
    params: [],
    description: 'A real DCS-style cross-reference \u2014 the SAME instrument tag used on one page (e.g. an AI transmitter, a computed setpoint) can be read here on any OTHER page without redrawing the wiring, exactly like placing the same tag on multiple graphics or control schemes in a real distributed control system. Its value is kept in sync from wherever that tag is actually computed; if the source page has not been run, the value shown is whatever it last was, not a live guarantee.',
    compute(inputs, params) { return params.value ?? 0; },
  },
  ai: {
    label: 'AI (Analog Input)', category: 'io', inputs: { min: 0, max: 0 },
    params: [
      { id: 'paramType', label: 'Process parameter', default: 'generic', options: [
        { value: 'generic', label: 'Generic' }, { value: 'temperature', label: 'Temperature (\u00b0C)' }, { value: 'pressure', label: 'Pressure (bar)' },
        { value: 'speed', label: 'Speed (RPM)' }, { value: 'vibration', label: 'Vibration (mm/s)' }, { value: 'level', label: 'Level (%)' }, { value: 'flow', label: 'Flow (t/h)' },
      ] },
      { id: 'min', label: 'Range minimum', default: 0 },
      { id: 'max', label: 'Range maximum', default: 100 },
      { id: 'sliderEnabled', label: 'Enable live slider (simulation mode)', default: 0, type: 'boolean' },
      { id: 'value', label: 'Field value', default: 0, sliderWhen: 'sliderEnabled', sliderMin: 'min', sliderMax: 'max' },
    ],
    description: 'Field analog input terminal \u2014 represents a real continuous signal (e.g. a 4-20 mA transmitter reading, already converted to engineering units) entering the logic. Define its process parameter and its calibrated range (min/max) the way a real transmitter has one; the value is always clamped to that range, the same way a real signal cannot read outside its calibrated span. Turning on the live slider lets you drag the value between min and max while a simulation runs, instead of typing a number \u2014 useful for exploring how downstream logic responds as a process value moves through its full range.',
    compute(inputs, params) { return clamp(params.value ?? 0, Math.min(params.min ?? 0, params.max ?? 100), Math.max(params.min ?? 0, params.max ?? 100)); },
  },
  do_: {
    signalType: 'digital',
    label: 'DO (Digital Output)', category: 'io', inputs: { min: 1, max: 1 },
    params: [],
    description: 'Field digital output terminal \u2014 represents a real ON/OFF signal (starting a pump, energizing a solenoid) leaving the logic. Displays its input rounded to ON/OFF; wire the logic that should drive it into this block.',
    compute(inputs) { return inputs[0] >= 0.5 ? 1 : 0; },
  },
  ao_: {
    label: 'AO (Analog Output)', category: 'io', inputs: { min: 1, max: 1 },
    params: [
      { id: 'min', label: 'Range minimum', default: 0 },
      { id: 'max', label: 'Range maximum', default: 100 },
    ],
    description: 'Field analog output terminal \u2014 represents a real continuous signal (e.g. a 4-20 mA output to a control valve) leaving the logic. Define its calibrated range (min/max) the way a real output card channel is scaled; the value is clamped to that range and the equivalent 4-20 mA loop current is shown alongside it, since that is genuinely what travels down the wire to the field device.',
    compute(inputs, params = {}) { return clamp(inputs[0], Math.min(params.min ?? 0, params.max ?? 100), Math.max(params.min ?? 0, params.max ?? 100)); },
  },
  motor: {
    signalType: 'digital',
    label: 'Motor (M)', category: 'finalControl', inputs: { min: 1, max: 1 },
    params: [],
    description: 'A real final controlling element \u2014 a motor started/stopped by a run command (limit switch, contactor auxiliary, whatever your logic decides). Shown RUNNING (green, filled) or STOPPED (gray) based on its input, and passes the same value through so you can still monitor or chain off it, the way a real motor auxiliary contact feeds back into other logic.',
    compute(inputs) { return inputs[0] >= 0.5 ? 1 : 0; },
  },
  controlValve: {
    label: 'Control Valve', category: 'finalControl', inputs: { min: 1, max: 1 },
    params: [],
    description: 'A real modulating final control element \u2014 a control valve driven to a continuous 0-100% position by its input (typically a PID or manual station output), not just open/closed. The valve\u2019s drawn opening fills to match the live position, and the value passes through unchanged for monitoring or chaining.',
    compute(inputs) { return inputs[0]; },
  },
  sov: {
    signalType: 'digital',
    label: 'SOV (Solenoid Valve)', category: 'finalControl', inputs: { min: 1, max: 1 },
    params: [],
    description: 'A real solenoid-operated on/off valve \u2014 genuinely discrete, unlike a control valve: it is either fully OPEN or fully CLOSED, energized directly by a digital command (a permissive satisfied, an interlock cleared). Shown OPEN (green) or CLOSED (gray), and passes the same value through for monitoring or chaining.',
    compute(inputs) { return inputs[0] >= 0.5 ? 1 : 0; },
  },
  bulb: {
    signalType: 'digital',
    label: 'Indicator Lamp', category: 'finalControl', inputs: { min: 1, max: 1 },
    params: [],
    description: 'A real panel indicator lamp \u2014 lit (bright amber) when its input is TRUE, dark (dim gray) when FALSE, the standard status/alarm indication on a control panel or annunciator. Passes the same value through for monitoring or chaining.',
    compute(inputs) { return inputs[0] >= 0.5 ? 1 : 0; },
  },
};

export const SAMA_BLOCK_IDS = Object.keys(SAMA_BLOCK_TYPES);

/**
 * Evaluate an ordered array of block configs. Each block config:
 *   { id, type, params, gains?, inputs: [{source:'const', value} | {source:'block', blockId}] }
 * Blocks may only reference the OUTPUT of a block that appears EARLIER
 * in the array (a forward reference or self-reference is rejected) --
 * this keeps evaluation a single deterministic left-to-right pass with
 * no cycle-detection needed, matching how a SAMA diagram is drawn and
 * read (signals flow left to right, never backward into an earlier
 * summing junction on the same page).
 * Returns a Map from block id -> { value, error }.
 */
export function evaluateChain(blocks) {
  const outputs = new Map();
  const seenIds = new Set();
  for (const block of blocks) {
    if (seenIds.has(block.id)) throw new Error(`Duplicate block id: ${block.id}`);
    seenIds.add(block.id);
    const def = SAMA_BLOCK_TYPES[block.type];
    if (!def) throw new Error(`Unknown block type: ${block.type}`);
    try {
      const inputValues = block.inputs.map((inp) => {
        if (inp.source === 'const') return Number(inp.value);
        if (inp.source === 'block') {
          if (!outputs.has(inp.blockId)) {
            throw new Error(`References block "${inp.blockId}" which has not been evaluated yet (must appear earlier in the chain).`);
          }
          const upstream = outputs.get(inp.blockId);
          if (upstream.error) throw new Error(`Upstream block "${inp.blockId}" has an error.`);
          return upstream.value;
        }
        throw new Error(`Unknown input source: ${inp.source}`);
      });
      const n = inputValues.length;
      if (n < def.inputs.min || n > def.inputs.max) {
        throw new Error(`${def.label} expects ${def.inputs.min === def.inputs.max ? def.inputs.min : `${def.inputs.min}-${def.inputs.max}`} input(s), got ${n}.`);
      }
      if (def.dynamic) {
        throw new Error(`${def.label} is a dynamic block and has no single "instant" value — switch this diagram to Simulation mode to run it over time.`);
      }
      const value = def.compute(inputValues, block.params || {}, block.gains);
      outputs.set(block.id, { value, error: null });
    } catch (e) {
      outputs.set(block.id, { value: null, error: e.message });
    }
  }
  return outputs;
}

/** True if any block in the chain is a dynamic (time-based) block —
 * such a chain has no meaningful single-instant value and must be run
 * with LogicSimulation instead of evaluateChain. */
export function hasDynamicBlocks(blocks) {
  return blocks.some((b) => SAMA_BLOCK_TYPES[b.type] && SAMA_BLOCK_TYPES[b.type].dynamic);
}

/**
 * Returns a copy of `blocks` reordered so every block's dependencies
 * appear before it (a standard Kahn's-algorithm topological sort),
 * or null if the wiring contains a genuine cycle.
 *
 * This exists because evaluateChain (and, for the parts of a chain it
 * cannot resolve with one-step-delayed feedback, LogicSimulation too)
 * needs blocks in dependency order to evaluate correctly in one pass.
 * A sequential, list-based UI naturally keeps blocks in that order as
 * you add them; a free-form canvas where blocks can be created and
 * wired in any order does not, and a user has no reason to expect that
 * WHERE they dropped a block, or which order they wired it in, should
 * matter -- so this call re-establishes a valid evaluation order
 * regardless of how the blocks array happens to be arranged, rather
 * than asking the diagram's array order to just happen to already be
 * correct. A genuine cycle (only meaningful for a chain WITH a dynamic
 * block, where feedback is valid) is left to LogicSimulation's
 * one-step-delay handling instead -- see orderForSimulation below.
 */
export function orderForEvaluation(blocks) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const inDegree = new Map(blocks.map((b) => [b.id, 0]));
  const dependents = new Map(blocks.map((b) => [b.id, []]));
  for (const b of blocks) {
    for (const inp of b.inputs) {
      if (inp.source === 'block' && byId.has(inp.blockId)) {
        inDegree.set(b.id, inDegree.get(b.id) + 1);
        dependents.get(inp.blockId).push(b.id);
      }
    }
  }
  const queue = blocks.filter((b) => inDegree.get(b.id) === 0).map((b) => b.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const depId of dependents.get(id)) {
      inDegree.set(depId, inDegree.get(depId) - 1);
      if (inDegree.get(depId) === 0) queue.push(depId);
    }
  }
  if (order.length !== blocks.length) return null; // a cycle involves at least one remaining block
  return order.map((id) => byId.get(id));
}

/**
 * Same idea, but for LogicSimulation's use: if the wiring is a genuine
 * cycle (only ever valid when a dynamic block is present to break it
 * with a one-step delay), this returns the ORIGINAL array unchanged
 * rather than failing -- LogicSimulation.step() already knows how to
 * resolve that case correctly. A cycle-free chain still gets properly
 * ordered, which avoids introducing an unnecessary one-step delay on
 * a connection that could otherwise be resolved within the same step.
 */
export function orderForSimulation(blocks) {
  return orderForEvaluation(blocks) || blocks;
}

/**
 * Time-stepped simulation of a block chain that may contain dynamic
 * (lag, integrator, rate limit, dead time, PID) blocks alongside static
 * ones. Each dynamic block gets ONE persistent state instance, created
 * when the simulation is constructed (or explicitly reset), which
 * carries its history across calls to step() — this is what makes it
 * genuinely dynamic rather than a fresh instant evaluation each time.
 * Static blocks in the same chain are simply recomputed fresh every
 * step from that step's current input values, exactly as evaluateChain
 * would, so a chain can freely mix both kinds of block.
 */
export class LogicSimulation {
  constructor(blocks, dt) {
    this.blocks = blocks;
    this.dt = dt;
    this.time = 0;
    this._buildStates();
  }
  _buildStates() {
    this.states = new Map();
    for (const block of this.blocks) {
      const def = SAMA_BLOCK_TYPES[block.type];
      if (def && def.dynamic) this.states.set(block.id, def.createState(block.params || {}, this.dt));
    }
  }
  /** Recreate every dynamic block's state from scratch and zero the clock —
   * use this when the user changes the diagram's structure, not merely
   * an input value, since the old states would otherwise no longer
   * correspond to the new wiring. */
  reset() { this.time = 0; this._buildStates(); }
  step() {
    const dt = this.dt;
    this.time += dt;
    const outputs = new Map();
    const prior = this.lastOutputs || new Map();
    const seenIds = new Set();
    for (const block of this.blocks) {
      if (seenIds.has(block.id)) throw new Error(`Duplicate block id: ${block.id}`);
      seenIds.add(block.id);
      const def = SAMA_BLOCK_TYPES[block.type];
      if (!def) throw new Error(`Unknown block type: ${block.type}`);
      try {
        const inputValues = block.inputs.map((inp) => {
          if (inp.source === 'const') return Number(inp.value);
          if (inp.source === 'block') {
            // A reference to a block ALREADY computed this step is the
            // normal, forward-in-time case -- use its fresh value.
            if (outputs.has(inp.blockId)) {
              const upstream = outputs.get(inp.blockId);
              if (upstream.error) throw new Error(`Upstream block "${inp.blockId}" has an error.`);
              return upstream.value;
            }
            // A reference to a block that has NOT been computed yet this
            // step is a closed-loop feedback path -- e.g. a PID whose PV
            // comes from a process block that itself is driven by the
            // PID's own output. That is a genuine algebraic loop, not a
            // mistake: real closed-loop control is inherently circular.
            // Resolve it with a one-step-delayed (previous-step) value,
            // the standard way a single, ordered pass through a network
            // handles a feedback loop -- mathematically valid as long as
            // dt is small relative to the loop's own time constants,
            // exactly the assumption every block here already makes.
            if (prior.has(inp.blockId)) {
              const upstream = prior.get(inp.blockId);
              return upstream.error ? 0 : upstream.value;
            }
            // First step ever, referencing a block with no history yet
            // (even one step behind) -- start from a neutral 0 rather
            // than reject the wiring outright.
            return 0;
          }
          throw new Error(`Unknown input source: ${inp.source}`);
        });
        const n = inputValues.length;
        if (n < def.inputs.min || n > def.inputs.max) {
          throw new Error(`${def.label} expects ${def.inputs.min === def.inputs.max ? def.inputs.min : `${def.inputs.min}-${def.inputs.max}`} input(s), got ${n}.`);
        }
        const value = def.dynamic
          ? def.stepCompute(this.states.get(block.id), inputValues, block.params || {}, dt)
          : def.compute(inputValues, block.params || {}, block.gains);
        outputs.set(block.id, { value, error: null });
      } catch (e) {
        outputs.set(block.id, { value: null, error: e.message });
      }
    }
    this.lastOutputs = outputs;
    return outputs;
  }
}
