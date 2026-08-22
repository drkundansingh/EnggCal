// transmitter.mjs — universal signal <-> engineering value scaling.
// Supports 4-20mA, 0-20mA, 1-5V, 0-10V linear transmitters.

export const SIGNAL_RANGES = {
  '4-20mA': { lo: 4, hi: 20, unit: 'mA' },
  '0-20mA': { lo: 0, hi: 20, unit: 'mA' },
  '1-5V': { lo: 1, hi: 5, unit: 'V' },
  '0-10V': { lo: 0, hi: 10, unit: 'V' },
};

/** Engineering units commonly assigned to a transmitter's process value,
 * grouped by measurement discipline, for the range/unit selector. This is a
 * display/labeling list only (the transmitter math is unit-agnostic linear
 * scaling) — it does not perform unit conversion; use units.mjs for that. */
export const ENGINEERING_UNIT_GROUPS = {
  Pressure: ['bar', 'mbar', 'kPa', 'MPa', 'Pa', 'psi', 'kg/cm²', 'mmWC', 'mmH2O', 'inH2O', 'mmHg', 'inHg', 'atm'],
  Temperature: ['°C', '°F', 'K'],
  Flow: ['m³/h', 'm³/s', 'L/min', 'L/s', 'GPM', 'kg/h', 'kg/s', 't/h', 'Nm³/h', 'Sm³/h'],
  Level: ['mm', 'cm', 'm', 'ft', 'in', '%'],
  'Analytical': ['pH', 'ppm', 'mg/L', '%O2', '%CO2', 'µS/cm', 'NTU'],
  Electrical: ['V', 'mV', 'A', 'mA', 'kW', 'MW', 'Hz', 'RPM'],
  Other: ['%', 'mm/s', 'g', 'custom'],
};

function assertRange(rangeKey) {
  const r = SIGNAL_RANGES[rangeKey];
  if (!r) throw new Error(`Unknown signal range: ${rangeKey}`);
  return r;
}

/** Engineering value -> percent of span, given LRV/URV */
export function pvToPercent(pv, lrv, urv) {
  if (urv === lrv) throw new Error('URV and LRV cannot be equal');
  return ((pv - lrv) / (urv - lrv)) * 100;
}

/** Percent -> engineering value */
export function percentToPv(pct, lrv, urv) {
  return lrv + (pct / 100) * (urv - lrv);
}

/** Percent -> signal (mA or V) for the given range */
export function percentToSignal(pct, rangeKey = '4-20mA') {
  const { lo, hi } = assertRange(rangeKey);
  return lo + (pct / 100) * (hi - lo);
}

/** Signal -> percent */
export function signalToPercent(signal, rangeKey = '4-20mA') {
  const { lo, hi } = assertRange(rangeKey);
  if (hi === lo) throw new Error('Invalid signal range');
  return ((signal - lo) / (hi - lo)) * 100;
}

/** Engineering value -> signal, straight through */
export function pvToSignal(pv, lrv, urv, rangeKey = '4-20mA') {
  const pct = pvToPercent(pv, lrv, urv);
  return percentToSignal(pct, rangeKey);
}

/** Signal -> engineering value */
export function signalToPv(signal, lrv, urv, rangeKey = '4-20mA') {
  const pct = signalToPercent(signal, rangeKey);
  return percentToPv(pct, lrv, urv);
}

export function formula(rangeKey = '4-20mA') {
  const { lo, hi, unit } = assertRange(rangeKey);
  return `PV = LRV + [(Signal − ${lo}${unit}) / (${hi}${unit} − ${lo}${unit})] × (URV − LRV)`;
}
