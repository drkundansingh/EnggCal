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

/** Region 1 specific enthalpy, kJ/kg. p in MPa, T in K. Same dimensionless
 * Gibbs free energy gamma(pi,tau) as v1() above (reusing the identical,
 * already-verified R1_I/R1_J/R1_n coefficient tables) — this is its
 * temperature derivative gamma_tau rather than v1's pressure derivative:
 * h = R*T*tau*gamma_tau (IAPWS-IF97 eq. 9). */
function h1(p, T) {
  const pi = p / 16.53;
  const tau = 1386 / T;
  let gtau = 0;
  for (let i = 0; i < R1_n.length; i++) {
    gtau += R1_n[i] * Math.pow(7.1 - pi, R1_I[i]) * R1_J[i] * Math.pow(tau - 1.222, R1_J[i] - 1);
  }
  return R * T * tau * gtau;
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

/** Region 2 specific enthalpy, kJ/kg. p in MPa, T in K. Same ideal-gas-part
 * plus residual-part split as v2() above (reusing the identical,
 * already-verified R2_n0/R2_J0/R2_I/R2_J/R2_n coefficient tables) — this
 * is the temperature derivative of each part rather than v2's pressure
 * derivative: h = R*T*tau*(gamma0_tau + gammar_tau) (IAPWS-IF97 eq. 15). */
function h2(p, T) {
  const pi = p;
  const tau = 540 / T;
  let g0tau = 0;
  for (let i = 0; i < R2_n0.length; i++) g0tau += R2_n0[i] * R2_J0[i] * Math.pow(tau, R2_J0[i] - 1);
  let grtau = 0;
  for (let i = 0; i < R2_n.length; i++) grtau += R2_n[i] * Math.pow(pi, R2_I[i]) * R2_J[i] * Math.pow(tau - 0.5, R2_J[i] - 1);
  return R * T * tau * (g0tau + grtau);
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
 * Specific enthalpy in kJ/kg for pressure (bar absolute) and temperature
 * (°C) — real IAPWS-IF97, the same Region 1 / Region 2 formulation and
 * coefficient tables as specificVolume() above, not a correlation or
 * approximation. Throws the same way specificVolume() does for a state
 * outside the implemented regions, rather than returning a plausible but
 * wrong number.
 */
export function enthalpy(pressureBarA, tempC) {
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
    throw new Error(`State ${pressureBarA} bar a / ${tempC} °C falls in IAPWS Region 3 (near-critical), which is not implemented. Supply the enthalpy directly from your own steam tables for this condition.`);
  }
  return r === 1 ? h1(p, T) : h2(p, T);
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
  const h = enthalpy(pressureBarA, tempC);
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
  return { densityKgM3: rho, specificVolumeM3Kg: 1 / rho, enthalpyKJKg: h, phase, saturationTempC: tSatC, note };
}

// =====================================================================
// ADDITIONS FOR FLOW-MEASUREMENT WORK
// Everything below is purely additive: it reuses the SAME verified IF97
// Region 1 / Region 2 coefficient tables above and does not change any
// function exported earlier in this file.
//
// WHY: an ISO 5167 differential-pressure flow calculation needs more than
// density. It needs the dynamic VISCOSITY (to get the pipe Reynolds number,
// which sets the discharge coefficient) and the real isentropic exponent
// KAPPA (which sets the expansibility factor for steam). Using a fixed
// "kappa = 1.3" or an ideal-gas density at power-plant conditions is a
// direct, avoidable error in the reported flow.
// =====================================================================

const TC_VISC = 647.096;   // K, IAPWS reference temperature for viscosity
const RHOC_VISC = 322.0;   // kg/m3, IAPWS reference density for viscosity

/** Validate (p, T), pick the IF97 region, return p [MPa], T [K], region. */
function resolveState(pressureBarA, tempC, what) {
  if (!Number.isFinite(pressureBarA) || pressureBarA <= 0) {
    throw new Error('Pressure must be greater than zero (absolute bar).');
  }
  if (!Number.isFinite(tempC)) throw new Error('Temperature must be a number (°C).');
  const p = pressureBarA / 10;
  const T = tempC + 273.15;
  const r = region(p, T);
  if (r === null) {
    throw new Error(`State ${pressureBarA} bar a / ${tempC} °C is outside the IF97 range implemented here (0–100 MPa, 0–800 °C).`);
  }
  if (r === 3) {
    throw new Error(`State ${pressureBarA} bar a / ${tempC} °C falls in IAPWS Region 3 (near-critical), which is not implemented. Supply ${what} directly from your own steam tables for this condition.`);
  }
  return { p, T, r };
}

/** Region 1 dimensionless Gibbs-energy derivatives (IF97 Table 4). */
function r1Derivs(p, T) {
  const pi = p / 16.53;
  const tau = 1386 / T;
  const a = 7.1 - pi;
  const b = tau - 1.222;
  let gp = 0, gpp = 0, gt = 0, gtt = 0, gpt = 0;
  for (let i = 0; i < R1_n.length; i++) {
    const n = R1_n[i], I = R1_I[i], J = R1_J[i];
    gp += -n * I * Math.pow(a, I - 1) * Math.pow(b, J);
    gpp += n * I * (I - 1) * Math.pow(a, I - 2) * Math.pow(b, J);
    gt += n * Math.pow(a, I) * J * Math.pow(b, J - 1);
    gtt += n * Math.pow(a, I) * J * (J - 1) * Math.pow(b, J - 2);
    gpt += -n * I * Math.pow(a, I - 1) * J * Math.pow(b, J - 1);
  }
  return { pi, tau, gp, gpp, gt, gtt, gpt };
}

/** Region 2 dimensionless Gibbs-energy derivatives, ideal + residual (IF97 Tables 11, 12). */
function r2Derivs(p, T) {
  const pi = p;
  const tau = 540 / T;
  const b = tau - 0.5;
  let g0tt = 0;
  for (let i = 0; i < R2_n0.length; i++) g0tt += R2_n0[i] * R2_J0[i] * (R2_J0[i] - 1) * Math.pow(tau, R2_J0[i] - 2);
  let grp = 0, grpp = 0, grtt = 0, grpt = 0;
  for (let i = 0; i < R2_n.length; i++) {
    const n = R2_n[i], I = R2_I[i], J = R2_J[i];
    grp += n * I * Math.pow(pi, I - 1) * Math.pow(b, J);
    grpp += n * I * (I - 1) * Math.pow(pi, I - 2) * Math.pow(b, J);
    grtt += n * Math.pow(pi, I) * J * (J - 1) * Math.pow(b, J - 2);
    grpt += n * I * Math.pow(pi, I - 1) * J * Math.pow(b, J - 1);
  }
  return { pi, tau, g0tt, grp, grpp, grtt, grpt };
}

/** Specific isobaric heat capacity cp, kJ/(kg·K) — IF97 Region 1 or 2. */
export function cp(pressureBarA, tempC) {
  const { p, T, r } = resolveState(pressureBarA, tempC, 'cp');
  if (r === 1) {
    const d = r1Derivs(p, T);
    return -R * d.tau * d.tau * d.gtt;
  }
  const d = r2Derivs(p, T);
  return -R * d.tau * d.tau * (d.g0tt + d.grtt);
}

/** Speed of sound w, m/s — IF97 Region 1 or 2 (Tables 3 and 12). */
export function speedOfSound(pressureBarA, tempC) {
  const { p, T, r } = resolveState(pressureBarA, tempC, 'the speed of sound');
  if (r === 1) {
    const d = r1Derivs(p, T);
    const w2 = (1000 * R * T * d.gp * d.gp) /
      (((d.gp - d.tau * d.gpt) ** 2) / (d.tau * d.tau * d.gtt) - d.gpp);
    return Math.sqrt(w2);
  }
  const d = r2Derivs(p, T);
  const w2 = (1000 * R * T * (1 + 2 * d.pi * d.grp + d.pi * d.pi * d.grp * d.grp)) /
    ((1 - d.pi * d.pi * d.grpp) +
      ((1 + d.pi * d.grp - d.tau * d.pi * d.grpt) ** 2) / (d.tau * d.tau * (d.g0tt + d.grtt)));
  return Math.sqrt(w2);
}

/**
 * Real-fluid isentropic exponent kappa = -(v/p)(dp/dv)_s = rho*w^2/p.
 * This is the kappa ISO 5167 means in its expansibility factor — NOT the
 * ideal-gas heat-capacity ratio. For superheated power-plant steam it sits
 * around 1.28–1.33 and varies with state, so a fixed constant is an error.
 */
export function isentropicExponent(pressureBarA, tempC) {
  const rho = density(pressureBarA, tempC);
  const w = speedOfSound(pressureBarA, tempC);
  return (rho * w * w) / (pressureBarA * 1e5);
}

/**
 * Dynamic viscosity from density and temperature, Pa·s — IAPWS 2008
 * formulation (Release R12-08), industrial form: the critical-enhancement
 * term mu2 is taken as 1, which the release explicitly permits away from the
 * critical point (it is irrelevant at the states reachable in Regions 1 and 2
 * here).
 */
export function viscosityFromDensity(rhoKgM3, TK) {
  const Tr = TK / TC_VISC;
  const Dr = rhoKgM3 / RHOC_VISC;
  const H = [1.67752, 2.20462, 0.6366564, -0.241605];
  let den = 0;
  for (let i = 0; i < 4; i++) den += H[i] / Math.pow(Tr, i);
  const mu0 = 100 * Math.sqrt(Tr) / den;
  const Li = [0, 1, 2, 3, 0, 1, 2, 3, 5, 0, 1, 2, 3, 4, 0, 1, 0, 3, 4, 3, 5];
  const Lj = [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 4, 4, 5, 6, 6];
  const Hij = [0.520094, 0.850895e-1, -0.108374e1, -0.289555, 0.222531, 0.999115,
    0.188797e1, 0.126613e1, 0.120573, -0.281378, -0.906851, -0.772479,
    -0.489837, -0.257040, 0.161913, 0.257399, -0.325372e-1, 0.698452e-1,
    0.872102e-2, -0.435673e-2, -0.593264e-3];
  let s = 0;
  for (let k = 0; k < Hij.length; k++) s += Math.pow(1 / Tr - 1, Li[k]) * Hij[k] * Math.pow(Dr - 1, Lj[k]);
  const mu1 = Math.exp(Dr * s);
  return mu0 * mu1 * 1e-6;
}

/** Dynamic viscosity of water or steam, Pa·s, at (bar a, °C). */
export function viscosity(pressureBarA, tempC) {
  resolveState(pressureBarA, tempC, 'the viscosity');
  return viscosityFromDensity(density(pressureBarA, tempC), tempC + 273.15);
}

/**
 * One call returning everything a DP-flow calculation needs at the upstream
 * tap: density, viscosity, isentropic exponent, plus phase information.
 */
export function fluidProps(pressureBarA, tempC) {
  const st = steamState(pressureBarA, tempC);
  return {
    densityKgM3: st.densityKgM3,
    specificVolumeM3Kg: st.specificVolumeM3Kg,
    enthalpyKJKg: st.enthalpyKJKg,
    cpKJKgK: cp(pressureBarA, tempC),
    speedOfSoundMs: speedOfSound(pressureBarA, tempC),
    isentropicExponent: isentropicExponent(pressureBarA, tempC),
    viscosityPaS: viscosity(pressureBarA, tempC),
    phase: st.phase,
    saturationTempC: st.saturationTempC,
    note: st.note,
  };
}

/**
 * Saturated-liquid / saturated-vapour properties at a given absolute
 * pressure (bar). Used for wet-steam enthalpy (h = hf + x*hfg) in heat
 * balances. Evaluated by forcing Region 1 (liquid) or Region 2 (vapour) at
 * the saturation temperature, exactly as IF97 prescribes.
 */
export function saturation(pressureBarA) {
  if (!Number.isFinite(pressureBarA) || pressureBarA <= 0) throw new Error('Pressure must be greater than zero (absolute bar).');
  const p = pressureBarA / 10;
  const T = tsat(p);   // throws a clear message outside 0.000611–22.064 MPa
  if (T > 623.15) {
    throw new Error(`Saturation at ${pressureBarA} bar a (${(T - 273.15).toFixed(1)} °C) lies in IF97 Region 3 (above 350 °C), which this tool does not implement — saturation properties are limited to about 165.29 bar a.`);
  }
  const hf = h1(p, T), hg = h2(p, T);
  return {
    tsatC: T - 273.15, hfKJKg: hf, hgKJKg: hg, hfgKJKg: hg - hf,
    rhoLiquidKgM3: 1 / v1(p, T), rhoVaporKgM3: 1 / v2(p, T),
  };
}

/** Enthalpy of wet steam, kJ/kg, from pressure (bar a) and dryness fraction x (0–1). */
export function wetSteamEnthalpy(pressureBarA, x) {
  if (!(x >= 0 && x <= 1)) throw new Error('Steam dryness fraction x must be between 0 and 1.');
  const s = saturation(pressureBarA);
  return s.hfKJKg + x * s.hfgKJKg;
}

/**
 * Specific enthalpy of COMPRESSED LIQUID water, kJ/kg, forced to Region 1.
 * Unlike enthalpy(), a liquid exactly at (or numerically a hair above) its
 * saturation temperature is accepted as saturated liquid instead of being
 * flipped to the steam side — which matters for heater drains and condensate,
 * routinely reported right at saturation.
 */
export function liquidEnthalpy(pressureBarA, tempC) {
  if (!Number.isFinite(pressureBarA) || pressureBarA <= 0) throw new Error('Pressure must be greater than zero (absolute bar).');
  if (!Number.isFinite(tempC)) throw new Error('Temperature must be a number (°C).');
  const p = pressureBarA / 10;
  const T = tempC + 273.15;
  if (T < 273.15 || T > 623.15 || p > 100) {
    throw new Error(`Liquid state ${pressureBarA} bar a / ${tempC} °C is outside IF97 Region 1 (0–350 °C, up to 100 MPa).`);
  }
  if (p <= PC) {
    if (p < 0.000611212677) throw new Error(`Pressure ${pressureBarA} bar a is below the triple-point pressure, so liquid water cannot exist there.`);
    const ts = tsat(p);
    if (T > ts + 1e-6) {
      throw new Error(`At ${pressureBarA} bar a the saturation temperature is ${(ts - 273.15).toFixed(2)} °C, so ${tempC} °C is steam, not liquid water.`);
    }
  }
  return h1(p, T);
}

/** Density of COMPRESSED LIQUID water, kg/m³, forced to Region 1 (same saturation tolerance as liquidEnthalpy). */
export function liquidDensity(pressureBarA, tempC) {
  liquidEnthalpy(pressureBarA, tempC); // reuse its validation and clear errors
  return 1 / v1(pressureBarA / 10, tempC + 273.15);
}
