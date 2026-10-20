// Density correction per recognised standards.
//  * Moist air: CIPM-2007 equation (Picard et al., Metrologia 45 (2008) 149) - Z, enhancement factor f, humidity.
//  * Water / steam: IAPWS-IF97 (see steamTable.js).
//  * Other gases: real-gas density rho = p*M/(Z*R*T) with Z from the Papay correlation (valid roughly Pr<15, 1.2<Tr<2.4;
//    outside this a warning is returned) - ISO 5167-1 requires the density at the upstream tap to be the real one.
//  * Base-condition volumes: Qb = Qf * (p/pb) * (Tb/T) * (Zb/Z)  (AGA 3 / ISO 5167 practice, ISO 13443 standard reference conditions).
import * as steam from './steamTable.js';

const R_UNIV = 8.314472;      // J/(mol K) CIPM-2007
const M_AIR = 28.96546e-3;    // kg/mol dry air
const M_WATER = 18.01528e-3;

export const GASES = {
  air:      { label: 'Air',                M: 28.9647, Tc: 132.5,  Pc: 37.66e5, kappa: 1.4, mu0: 18.27, T0: 291.15, S: 120 },
  nitrogen: { label: 'Nitrogen',           M: 28.0134, Tc: 126.2,  Pc: 33.98e5, kappa: 1.4, mu0: 17.81, T0: 300.55, S: 111 },
  oxygen:   { label: 'Oxygen',             M: 31.9988, Tc: 154.6,  Pc: 50.43e5, kappa: 1.4, mu0: 20.18, T0: 292.25, S: 127 },
  co2:      { label: 'Carbon dioxide',     M: 44.0095, Tc: 304.13, Pc: 73.77e5, kappa: 1.29, mu0: 14.8, T0: 293.15, S: 240 },
  methane:  { label: 'Methane',            M: 16.0425, Tc: 190.56, Pc: 45.99e5, kappa: 1.31, mu0: 10.96, T0: 273.15, S: 197 },
  hydrogen: { label: 'Hydrogen',           M: 2.01588, Tc: 33.19,  Pc: 13.13e5, kappa: 1.41, mu0: 8.76, T0: 293.85, S: 72 },
  flue:     { label: 'Flue gas (typical coal, approx.)', M: 30.2, Tc: 135, Pc: 38e5, kappa: 1.35, mu0: 18.0, T0: 291.15, S: 125 },
};

/** Water vapour saturation pressure in Pa (IF97), valid 0.01-350 C. */
export function saturationPressurePa(tC) {
  if (!(tC > 0 && tC <= 350)) throw new Error('Saturation pressure only defined 0-350 C');
  return steam.psat(tC + 273.15) * 1e6; // psat returns MPa
}

/** Moist-air density, CIPM-2007. p [Pa], t [C], rh in 0..1. Returns {density, Z, xv, f}. */
export function moistAirDensity(pPa, tC, rh = 0) {
  if (!(pPa > 0)) throw new Error('Pressure must be > 0');
  if (!(rh >= 0 && rh <= 1)) throw new Error('Relative humidity must be 0-100 %');
  if (!(tC >= -50 && tC <= 1000)) throw new Error('Air density correlation supported -50 to 1000 C');
  if (rh > 0 && !(tC >= 0 && tC <= 350)) throw new Error('Humidity correction needs 0-350 C (water saturation pressure range); use RH = 0 for dry air outside it');
  const T = tC + 273.15;
  let xv = 0, f = 1;
  if (rh > 0) {
    f = 1.00062 + 3.14e-8 * pPa + 5.6e-7 * tC * tC;
    xv = Math.min(rh * f * saturationPressurePa(tC) / pPa, 0.999);
  }
  const a0 = 1.58123e-6, a1 = -2.9331e-8, a2 = 1.1043e-10, b0 = 5.707e-6, b1 = -2.051e-8,
    c0 = 1.9898e-4, c1 = -2.376e-6, d = 1.83e-11, e = -0.765e-8;
  const Z = 1 - (pPa / T) * (a0 + a1 * tC + a2 * tC * tC + (b0 + b1 * tC) * xv + (c0 + c1 * tC) * xv * xv)
    + (pPa * pPa / (T * T)) * (d + e * xv * xv);
  const density = (pPa * M_AIR) / (Z * R_UNIV * T) * (1 - xv * (1 - M_WATER / M_AIR));
  return { density, Z, xv, f };
}

/** Papay compressibility factor. */
export function zPapay(pPa, tC, gas) {
  const g = typeof gas === 'string' ? GASES[gas] : gas;
  if (!g) throw new Error('Unknown gas');
  const Tr = (tC + 273.15) / g.Tc, Pr = pPa / g.Pc;
  const Z = 1 - 3.52 * Pr * Math.exp(-2.260 * Tr) + 0.274 * Pr * Pr * Math.exp(-1.878 * Tr);
  const warning = (Tr < 1.2 || Tr > 2.4 || Pr > 15)
    ? `Reduced state Tr=${Tr.toFixed(2)}, Pr=${Pr.toFixed(2)} is outside the Papay range (Tr 1.2-2.4, Pr<15) - enter Z or density from a gas-property package.` : null;
  return { Z, Tr, Pr, warning };
}

/** Real-gas density. gas: key of GASES or {M,Tc,Pc}; zOverride optional. */
export function realGasDensity(pPa, tC, gas = 'air', zOverride) {
  if (!(pPa > 0)) throw new Error('Pressure must be > 0');
  const g = typeof gas === 'string' ? GASES[gas] : gas;
  if (!g) throw new Error('Unknown gas');
  const T = tC + 273.15;
  if (!(T > 0)) throw new Error('Temperature must be above absolute zero');
  const zr = zOverride > 0 ? { Z: zOverride, warning: null } : zPapay(pPa, tC, g);
  return { density: pPa * g.M * 1e-3 / (zr.Z * R_UNIV * T), Z: zr.Z, warning: zr.warning };
}

/**
 * Best-available flowing density for the calculators.
 * kind: 'water'|'steam' -> IF97; 'air' -> CIPM-2007 moist air; otherwise real gas.
 * pPa absolute.
 */
export function flowingDensity({ kind, pPa, tC, rh = 0, gas = 'air', z }) {
  if (kind === 'water' || kind === 'steam') {
    const s = steam.steamState(pPa / 1e5, tC);
    return { density: s.densityKgM3, method: 'IAPWS-IF97 real-fluid density', standard: 'IAPWS-IF97', phase: s.phase, note: s.note };
  }
  if (kind === 'air' && !(z > 0)) {
    const m = moistAirDensity(pPa, tC, rh);
    return { density: m.density, Z: m.Z, method: `Moist air, Z=${m.Z.toFixed(5)}, RH=${(rh * 100).toFixed(0)} %`, standard: 'CIPM-2007' };
  }
  const r = realGasDensity(pPa, tC, kind === 'air' ? 'air' : gas, z);
  return { density: r.density, Z: r.Z, method: `Real gas rho=pM/(ZRT), Z=${r.Z.toFixed(5)}`, standard: 'ISO 5167-1 / Papay Z', note: r.warning };
}

/** Flowing volume -> base-condition volume with Z. Base default 15 C / 101.325 kPa (ISO 13443). */
export function flowingToBaseVolume(qFlow, pPa, tC, Z = 1, pBasePa = 101325, tBaseC = 15, Zb = 1) {
  return qFlow * (pPa / pBasePa) * ((tBaseC + 273.15) / (tC + 273.15)) * (Zb / Z);
}

/** Density compensation of a DP transmitter calibrated at design density: Q = Q_indicated*sqrt(rho/rho_design). */
export function designDensityFactor(rhoActual, rhoDesign) {
  if (!(rhoActual > 0 && rhoDesign > 0)) throw new Error('Densities must be > 0');
  return Math.sqrt(rhoActual / rhoDesign);
}

/** Gas dynamic viscosity in micro-Pa.s from Sutherland's law (reference mu0 at T0, constant S); pressure effect neglected below ~10 bar. */
export function gasViscosityMicroPaS(tC, gas = 'air') {
  const g = typeof gas === 'string' ? GASES[gas] : gas;
  if (!g || !g.mu0) throw new Error('No viscosity data for this gas');
  const T = tC + 273.15;
  return g.mu0 * Math.pow(T / g.T0, 1.5) * (g.T0 + g.S) / (T + g.S);
}
