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
  and: {
    label: 'AND', category: 'logic', inputs: { min: 2, max: 6 },
    params: [],
    description: 'TRUE only when ALL inputs are TRUE (>= 0.5).',
    compute(inputs) { return inputs.every((v) => v >= 0.5) ? 1 : 0; },
  },
  or: {
    label: 'OR', category: 'logic', inputs: { min: 2, max: 6 },
    params: [],
    description: 'TRUE when ANY input is TRUE (>= 0.5).',
    compute(inputs) { return inputs.some((v) => v >= 0.5) ? 1 : 0; },
  },
  not: {
    label: 'NOT', category: 'logic', inputs: { min: 1, max: 1 },
    params: [],
    description: 'Inverts its single input.',
    compute(inputs) { return inputs[0] >= 0.5 ? 0 : 1; },
  },
  comparator: {
    label: 'Comparator (>)', category: 'logic', inputs: { min: 2, max: 2 },
    params: [],
    description: 'TRUE when input 1 is greater than input 2 \u2014 wire a constant setpoint into input 2 for a fixed-setpoint trip.',
    compute(inputs) { return inputs[0] > inputs[1] ? 1 : 0; },
  },
  lag: {
    label: 'Lag (1st order)', category: 'dynamic', dynamic: true, inputs: { min: 1, max: 1 },
    params: [{ id: 'tau', label: 'Time constant \u03c4 (s)', default: 10 }],
    description: 'First-order time lag \u2014 the standard SAMA symbol for a thermal, sensor, or process time constant. Output chases the input exponentially, reaching ~63% of a step change after one \u03c4.',
    createState(params) { return new Lag(Math.max(params.tau ?? 10, 0.01), 0); },
    stepCompute(state, inputs, params, dt) { state.tau = Math.max(params.tau ?? 10, 0.01); return state.step(inputs[0], dt); },
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
    label: 'SR Latch', category: 'dynamic', dynamic: true, inputs: { min: 2, max: 2 },
    params: [],
    description: 'Set-Reset memory latch \u2014 input 1 is Set, input 2 is Reset. Output goes TRUE when Set is TRUE, goes FALSE when Reset is TRUE, and HOLDS its last value when both are FALSE. Reset-dominant: if both are TRUE at once, the output goes FALSE.',
    createState() { return { out: 0 }; },
    stepCompute(state, inputs) {
      if (inputs[1] >= 0.5) state.out = 0;
      else if (inputs[0] >= 0.5) state.out = 1;
      return state.out;
    },
  },
  timeDelay: {
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
  di: {
    label: 'DI (Digital Input)', category: 'io', inputs: { min: 0, max: 0 },
    params: [{ id: 'state', label: 'State (0=OFF, 1=ON)', default: 0 }],
    description: 'Field digital input terminal \u2014 represents a real ON/OFF signal (limit switch, permissive contact, etc.) entering the logic. Has no inputs of its own; its value is the field state you set directly.',
    compute(inputs, params) { return params.state >= 0.5 ? 1 : 0; },
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
    label: 'DO (Digital Output)', category: 'io', inputs: { min: 1, max: 1 },
    params: [],
    description: 'Field digital output terminal \u2014 represents a real ON/OFF signal (starting a pump, energizing a solenoid) leaving the logic. Displays its input rounded to ON/OFF; wire the logic that should drive it into this block.',
    compute(inputs) { return inputs[0] >= 0.5 ? 1 : 0; },
  },
  ao_: {
    label: 'AO (Analog Output)', category: 'io', inputs: { min: 1, max: 1 },
    params: [],
    description: 'Field analog output terminal \u2014 represents a real continuous signal (e.g. a 4-20 mA output to a control valve) leaving the logic. Displays its input value unchanged; wire the logic that should drive it into this block.',
    compute(inputs) { return inputs[0]; },
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
