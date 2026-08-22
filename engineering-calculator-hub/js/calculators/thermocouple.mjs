// thermocouple.mjs — Temperature <-> mV using a linear Seebeck-coefficient
// approximation around the working range, plus cold-junction compensation.
//
// IMPORTANT: this is a linear approximation for estimation/teaching use.
// Real thermocouples follow NIST ITS-90 polynomial tables which are
// non-linear across the full range. For calibration-grade or safety-critical
// work, use the NIST monograph 175 polynomials or a certified DAQ library.

// Approximate average Seebeck coefficient (µV/°C) and valid range per type.
export const TC_TYPES = {
  J: { seebeck: 52.0, range: [-210, 1200] },
  K: { seebeck: 41.0, range: [-270, 1372] },
  T: { seebeck: 43.0, range: [-270, 400] },
  E: { seebeck: 61.0, range: [-270, 1000] },
  N: { seebeck: 28.0, range: [-270, 1300] },
  R: { seebeck: 6.0, range: [-50, 1768] },
  S: { seebeck: 6.4, range: [-50, 1768] },
  B: { seebeck: 5.0, range: [250, 1820] },
};

function checkType(type) {
  const def = TC_TYPES[type];
  if (!def) throw new Error(`Unknown thermocouple type: ${type}`);
  return def;
}

/** Hot-junction temperature (C) -> mV output, referenced to 0C cold junction */
export function temperatureToMv(tempC, type = 'K') {
  const { seebeck } = checkType(type);
  return (tempC * seebeck) / 1000; // µV/°C -> mV
}

/** Measured mV (0C reference) -> hot junction temperature */
export function mvToTemperature(mv, type = 'K') {
  const { seebeck } = checkType(type);
  return (mv * 1000) / seebeck;
}

/**
 * Cold junction compensation: the transmitter/DAQ measures mV relative to its
 * own terminal (cold junction) temperature, not 0C. Add the equivalent mV of
 * the cold junction temperature to get the 0C-referenced mV, then convert.
 */
export function cjcCompensatedTemperature(measuredMv, coldJunctionTempC, type = 'K') {
  const cjcMv = temperatureToMv(coldJunctionTempC, type);
  const totalMv = measuredMv + cjcMv;
  return mvToTemperature(totalMv, type);
}

/**
 * Inverse of the above: given a desired/actual hot-junction temperature and
 * the known cold-junction (terminal) temperature, what mV would the
 * transmitter/DAQ actually measure? This is the real-world signal a
 * transmitter reports — it's the 0C-referenced mV for the hot junction minus
 * the 0C-referenced mV the cold junction itself contributes.
 */
export function temperatureToMvWithCjc(tempC, coldJunctionTempC, type = 'K') {
  return temperatureToMv(tempC, type) - temperatureToMv(coldJunctionTempC, type);
}

export function formula() {
  return 'mV ≈ (T × Seebeck_coeff) / 1000;  T_actual = mV_to_T(measured_mV + mV_to_T⁻¹(T_cjc))  [linear approx.]';
}
