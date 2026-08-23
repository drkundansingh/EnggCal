// units.mjs — canonical unit conversion layer.
// All conversions route through one SI base unit per quantity so every
// calculator shares the same numbers. Do not hardcode conversions elsewhere.

export const PRESSURE_TO_PA = {
  Pa: 1,
  kPa: 1e3,
  MPa: 1e6,
  bar: 1e5,
  mbar: 1e2,
  psi: 6894.757293168,
  'kg/cm2': 98066.5,
  mmWC: 9.80665,
  mmH2O: 9.80665,
  inH2O: 249.08891,
  mmHg: 133.322387415,
  inHg: 3386.389,
  atm: 101325,
};

export const TEMP_TO_K = {
  C: (v) => v + 273.15,
  F: (v) => (v - 32) * (5 / 9) + 273.15,
  K: (v) => v,
};
export const TEMP_FROM_K = {
  C: (k) => k - 273.15,
  F: (k) => (k - 273.15) * (9 / 5) + 32,
  K: (k) => k,
};

// Flow: mass units to kg/h, volumetric units to m3/h. Converting between
// mass and volumetric flow requires density (see flow.mjs).
export const MASS_FLOW_TO_KGH = {
  'kg/h': 1,
  'kg/s': 3600,
  't/h': 1000,
  'lb/h': 0.45359237,
};
export const VOL_FLOW_TO_M3H = {
  'm3/h': 1,
  'm3/s': 3600,
  'L/min': 0.06,
  'L/s': 3.6,
  'gpm': 0.2271247,
};

export const LENGTH_TO_M = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
};

export const MASS_TO_KG = {
  kg: 1,
  t: 1000,
  lb: 0.45359237,
};

export const POWER_TO_W = {
  W: 1,
  kW: 1e3,
  MW: 1e6,
  HP: 745.699872,
  'kcal/h': 1.163,
  'BTU/h': 0.29307107,
};

export function convertPressure(value, from, to) {
  if (!(from in PRESSURE_TO_PA) || !(to in PRESSURE_TO_PA)) {
    throw new Error(`Unsupported pressure unit: ${from} or ${to}`);
  }
  const pa = value * PRESSURE_TO_PA[from];
  return pa / PRESSURE_TO_PA[to];
}

export function convertTemperature(value, from, to) {
  if (!(from in TEMP_TO_K) || !(to in TEMP_FROM_K)) {
    throw new Error(`Unsupported temperature unit: ${from} or ${to}`);
  }
  const k = TEMP_TO_K[from](value);
  return TEMP_FROM_K[to](k);
}

export function convertLength(value, from, to) {
  if (!(from in LENGTH_TO_M) || !(to in LENGTH_TO_M)) {
    throw new Error(`Unsupported length unit: ${from} or ${to}`);
  }
  return (value * LENGTH_TO_M[from]) / LENGTH_TO_M[to];
}

export function convertMass(value, from, to) {
  if (!(from in MASS_TO_KG) || !(to in MASS_TO_KG)) {
    throw new Error(`Unsupported mass unit: ${from} or ${to}`);
  }
  return (value * MASS_TO_KG[from]) / MASS_TO_KG[to];
}

export function convertPower(value, from, to) {
  if (!(from in POWER_TO_W) || !(to in POWER_TO_W)) {
    throw new Error(`Unsupported power unit: ${from} or ${to}`);
  }
  return (value * POWER_TO_W[from]) / POWER_TO_W[to];
}

// Mass <-> volumetric flow needs density (kg/m3)
export function massFlowToVolumetric(massFlowKgH, densityKgM3) {
  if (densityKgM3 <= 0) throw new Error('Density must be > 0');
  return massFlowKgH / densityKgM3; // m3/h
}
export function volumetricFlowToMass(volFlowM3H, densityKgM3) {
  if (densityKgM3 <= 0) throw new Error('Density must be > 0');
  return volFlowM3H * densityKgM3; // kg/h
}

// Normal (Nm3/h, 0C/1atm) <-> Actual (m3/h) gas flow correction
export function normalToActualFlow(nm3h, actualTempC, actualPressureKPa, refPressureKPa = 101.325) {
  const T0 = 273.15;
  const T1 = actualTempC + 273.15;
  return nm3h * (T1 / T0) * (refPressureKPa / actualPressureKPa);
}
export function actualToNormalFlow(actualM3h, actualTempC, actualPressureKPa, refPressureKPa = 101.325) {
  const T0 = 273.15;
  const T1 = actualTempC + 273.15;
  return actualM3h * (T0 / T1) * (actualPressureKPa / refPressureKPa);
}
