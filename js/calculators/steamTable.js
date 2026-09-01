// steamTable.js — real steam properties from IAPWS-IF97.
//
// WHY THIS EXISTS
// The flow engine previously used an ideal-gas approximation for steam
// density. That is fine for low-pressure steam and increasingly wrong as
// pressure rises: at main-steam conditions the compressibility factor is
// well below 1, so ideal gas can overstate density by tens of percent —
// and since DP flow scales with sqrt(density), that error goes straight
// into the flow number.
//
// This module implements the IAPWS Industrial Formulation 1997:
//   Region 1 — compressed / subcooled liquid water
//   Region 2 — superheated steam (and the saturated-vapour side)
//   Region 4 — the saturation line, p_sat(T) and T_sat(p)
//
// Verified in tests against the official IF97 reference values.
//
// SCOPE, HONESTLY
// Regions 3 (near-critical) and 5 (very high temperature, >800 °C) are NOT
// implemented. Region 3 matters above ~350 °C near the saturation line and
// for supercritical conditions between roughly 386–450 °C at 22–100 bar.
// Calls landing there return an explicit out-of-range error rather than a
// silently wrong number — a wrong density is far more dangerous than a
// refusal, because it produces a plausible-looking flow.

const R = 0.461526;      // kJ/(kg·K), specific gas constant for water
const TC = 647.096;      // K, critical temperature
const PC = 22.064;       // MPa, critical pressure

// ---------- Region 1: compressed liquid ----------
const R1_I = [0,0,0,0,0,0,0,0,1,1,1,1,1,1,2,2,2,2,2,3,3,3,4,4,4,5,8,8,21,23,29,30,31,32];
const R1_J = [-2,-1,0,1,2,3,4,5,-9,-7,-1,0,1,3,-3,0,1,3,17,-4,0,6,-5,-2,10,-8,-11,-6,-29,-31,-38,-39,-40,-41];
const R1_n = [
  1.4632971213167e-01, -8.4548187169114e-01, -3.7563603672040e+00,  3.3855169168385e+00,
 -9.5791963387872e-01,  1.5772038513228e-01, -1.6616417199501e-02,  8.1214629983568e-04,
  2.8319080123804e-04, -6.0706301565874e-04, -1.8990068218419e-02, -3.2529748770505e-02,
 -2.1841717175414e-02, -5.2838357969930e-05, -4.7184321073267e-04, -3.0001780793026e-04,
  4.7661393906987e-05, -4.4141845330846e-06, -7.2694996297594e-16, -3.1679644845054e-05,
 -2.8270797985312e-06, -8.5205128120103e-10, -2.2425281908000e-06, -6.5171222895601e-07,
 -1.4341729937924e-13, -4.0516996860117e-07, -1.2734301741641e-09, -1.7424871230634e-10,
 -6.8762131295531e-19,  1.4478307828521e-20,  2.6335781662795e-23, -1.1947622640071e-23,
  1.8228094581404e-24, -9.3537087292458e-26,
];

/** Region 1 specific volume, m³/kg. p in MPa, T in K. */
function v1(p, T) {
  const pi = p / 16.53;
  const tau = 1386 / T;
  let gp = 0;
  for (let i = 0; i < R1_n.length; i++) {
    gp += -R1_n[i] * R1_I[i] * Math.pow(7.1 - pi, R1_I[i] - 1) * Math.pow(tau - 1.222, R1_J[i]);
  }
  return (R * T / (p * 1000)) * pi * gp;
}

// ---------- Region 2: superheated steam ----------
const R2_J0 = [0, 1, -5, -4, -3, -2, -1, 2, 3];
const R2_n0 = [
  -9.6927686500217, 10.086655968018, -0.005608791128302, 0.071452738081455,
  -0.40710498223928, 1.4240819171444, -4.383951131945, -0.28408632460772,
  0.021268463753307,
];
const R2_I = [1,1,1,1,1,2,2,2,2,2,3,3,3,3,3,4,4,4,5,6,6,6,7,7,7,8,8,9,10,10,10,16,16,18,20,20,20,21,22,23,24,24,24];
const R2_J = [0,1,2,3,6,1,2,4,7,36,0,1,3,6,35,1,2,3,7,3,16,35,0,11,25,8,36,13,4,10,14,29,50,57,20,35,48,21,53,39,26,40,58];
const R2_n = [
 -1.7731742473213e-03, -1.7834862292358e-02, -4.5996013696365e-02, -5.7581259083432e-02,
 -5.0325278727930e-02, -3.3032641670203e-05, -1.8948987516315e-04, -3.9392777243355e-03,
 -4.3797295650573e-02, -2.6674547914087e-05,  2.0481737692309e-08,  4.3870667284435e-07,
 -3.2277677238570e-05, -1.5033924542148e-03, -4.0668253562649e-02, -7.8847309559367e-10,
  1.2790717852285e-08,  4.8225372718507e-07,  2.2922076337661e-06, -1.6714766451061e-11,
 -2.1171472321355e-03, -2.3895741934104e+01, -5.9059564324270e-18, -1.2621808899101e-06,
 -3.8946842435739e-02,  1.1256211360459e-11, -8.2311340897998e+00,  1.9809712802088e-08,
  1.0406965210174e-19, -1.0234747095929e-13, -1.0018179379511e-09, -8.0882908646985e-11,
  1.0693031879409e-01, -3.3662250574171e-01,  8.9185845355421e-25,  3.0629316876232e-13,
 -4.2002467698208e-06, -5.9056029685639e-26,  3.7826947613457e-06, -1.2768608934681e-15,
  7.3087610595061e-29,  5.5414715350778e-17, -9.4369707241210e-07,
];

/** Region 2 specific volume, m³/kg. p in MPa, T in K. */
function v2(p, T) {
  const pi = p;               // p* = 1 MPa
  const tau = 540 / T;
  const g0p = 1 / pi;
  let grp = 0;
  for (let i = 0; i < R2_n.length; i++) {
    grp += R2_n[i] * R2_I[i] * Math.pow(pi, R2_I[i] - 1) * Math.pow(tau - 0.5, R2_J[i]);
  }
  return (R * T / (p * 1000)) * pi * (g0p + grp);
}

// ---------- Region 4: saturation line ----------
const R4_n = [
  1167.0521452767, -724213.16703206, -17.073846940092, 12020.82470247,
  -3232555.0322333, 14.91510861353, -4823.2657361591, 405113.40542057,
  -0.23855557567849, 650.17534844798,
];

/** Saturation pressure in MPa for a temperature in K (IF97 eq. 30). */
export function psat(T) {
  if (!(T >= 273.15 && T <= TC)) {
    throw new Error(`Saturation temperature ${(T - 273.15).toFixed(1)} °C is outside the valid range (0 to 373.95 °C).`);
  }
  const th = T + R4_n[8] / (T - R4_n[9]);
  const A = th * th + R4_n[0] * th + R4_n[1];
  const B = R4_n[2] * th * th + R4_n[3] * th + R4_n[4];
  const C = R4_n[5] * th * th + R4_n[6] * th + R4_n[7];
  return Math.pow((2 * C) / (-B + Math.sqrt(B * B - 4 * A * C)), 4);
}

/** Saturation temperature in K for a pressure in MPa (IF97 eq. 31). */
export function tsat(p) {
  if (!(p >= 0.000611212677 && p <= PC)) {
    throw new Error(`Saturation pressure ${p.toFixed(4)} MPa is outside the valid range (0.000611 to 22.064 MPa).`);
  }
  const beta = Math.pow(p, 0.25);
  const E = beta * beta + R4_n[2] * beta + R4_n[5];
  const F = R4_n[0] * beta * beta + R4_n[3] * beta + R4_n[6];
  const G = R4_n[1] * beta * beta + R4_n[4] * beta + R4_n[7];
  const D = (2 * G) / (-F - Math.sqrt(F * F - 4 * E * G));
  return (R4_n[9] + D - Math.sqrt(Math.pow(R4_n[9] + D, 2) - 4 * (R4_n[8] + R4_n[9] * D))) / 2;
}

/** Region 2/3 boundary (IF97 eq. 5): pressure in MPa for T in K. */
function b23p(T) {
  return 0.34805185628969e3 - 0.11671859879975e1 * T + 0.10192970039326e-2 * T * T;
}

/**
 * Which IF97 region does (p, T) fall in?
 * Returns 1, 2, 3 (unsupported), or 4 (on the saturation line).
 */
export function region(pMPa, TK) {
  if (TK < 273.15 || TK > 1073.15) return null;
  if (pMPa <= 0 || pMPa > 100) return null;
  if (TK <= 623.15) {
    const ps = psat(TK);
    return pMPa > ps ? 1 : 2;      // liquid above the saturation line, steam below
  }
  if (TK <= 863.15) {
    return pMPa > b23p(TK) ? 3 : 2;   // region 3 is not implemented
  }
  return 2;
}

/**
 * Specific volume in m³/kg for pressure (bar absolute) and temperature (°C).
 * Throws with a clear message if the state falls in an unimplemented region,
 * rather than returning a plausible but wrong number.
 */
export function specificVolume(pressureBarA, tempC) {
  if (!Number.isFinite(pressureBarA) || pressureBarA <= 0) {
    throw new Error('Pressure must be greater than zero (absolute bar).');
  }
  if (!Number.isFinite(tempC)) throw new Error('Temperature must be a number (°C).');
  const p = pressureBarA / 10;     // bar -> MPa
  const T = tempC + 273.15;
  const r = region(p, T);
  if (r === null) {
    throw new Error(`State ${pressureBarA} bar a / ${tempC} °C is outside the IF97 range implemented here (0–100 MPa, 0–800 °C).`);
  }
  if (r === 3) {
    throw new Error(`State ${pressureBarA} bar a / ${tempC} °C falls in IAPWS Region 3 (near-critical), which is not implemented. Supply the density directly from your own steam tables for this condition.`);
  }
  return r === 1 ? v1(p, T) : v2(p, T);
}

/** Density in kg/m³ for pressure (bar absolute) and temperature (°C). */
export function density(pressureBarA, tempC) {
  return 1 / specificVolume(pressureBarA, tempC);
}

/**
 * Density with an explicit phase check, for flow work.
 * Returns the density plus whether the state is superheated steam,
 * subcooled water, or sitting essentially on the saturation line — where a
 * DP flow measurement is unreliable because the quality is unknown.
 */
export function steamState(pressureBarA, tempC) {
  const p = pressureBarA / 10;
  const T = tempC + 273.15;
  const rho = density(pressureBarA, tempC);
  let tSatC = null;
  try { tSatC = tsat(p) - 273.15; } catch { /* above critical pressure */ }

  let phase, note = '';
  if (tSatC === null) {
    phase = 'supercritical';
    note = 'Above the critical pressure there is no distinct phase change.';
  } else if (tempC > tSatC + 1) {
    phase = 'superheated steam';
    note = `Superheat is ${(tempC - tSatC).toFixed(1)} °C above saturation (${tSatC.toFixed(1)} °C).`;
  } else if (tempC < tSatC - 1) {
    phase = 'subcooled water';
    note = `Subcooled by ${(tSatC - tempC).toFixed(1)} °C below saturation (${tSatC.toFixed(1)} °C).`;
  } else {
    phase = 'saturated / wet';
    note = `Within 1 °C of saturation (${tSatC.toFixed(1)} °C). Density is very sensitive here and steam quality is unknown, so a DP flow reading in this region should be treated as indicative only.`;
  }
  return { densityKgM3: rho, specificVolumeM3Kg: 1 / rho, phase, saturationTempC: tSatC, note };
}
