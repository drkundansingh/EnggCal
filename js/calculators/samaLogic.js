// samaLogic.js — SAMA-standard logic/function blocks (ISA/SAMA PMC 22.1
// style symbols, as used throughout combustion and boiler control logic
// diagrams) and a simple, explicit chain evaluator.
//
// Scope: this covers the ALGEBRAIC and BOOLEAN SAMA blocks (summers,
// selectors, limiters, bias, gain, AND/OR/NOT, comparators) that make up
// the great majority of real interlock and permissive logic diagrams.
// True dynamic blocks (lag, integrator, rate limiter) are deliberately
// NOT included here — those need a time-stepped simulation, which is
// exactly what the existing Control Loops section already provides for
// real, complete control loops. This tool is for the static/algebraic
// logic a user builds and wires themselves.

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Each block type: id, label, category ('analog' | 'logic'), how many
// inputs it takes (fixed number, or {min,max} for a variable count),
// its parameter schema (for the UI to render fields), and a pure
// compute(inputs, params) -> number function. Analog blocks work in
// real-valued signals; logic blocks treat any input >= 0.5 as TRUE
// (matching how a boolean is commonly represented on a 0/1 analog
// signal in real PLC/DCS logic), and output 1 (true) or 0 (false).

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
      const value = def.compute(inputValues, block.params || {}, block.gains);
      outputs.set(block.id, { value, error: null });
    } catch (e) {
      outputs.set(block.id, { value: null, error: e.message });
    }
  }
  return outputs;
}
