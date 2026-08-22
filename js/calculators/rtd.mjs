// rtd.mjs — RTD resistance <-> temperature.
// Pt100/Pt1000 use the IEC 60751 Callendar-Van Dusen equation (standard).
// Ni100/Cu100 use widely-published quadratic/linear approximations — verify
// against the manufacturer's exact curve for critical applications.

const PT_A = 3.9083e-3;
const PT_B = -5.775e-7;
const PT_C = -4.183e-12; // only used for t < 0 C

export const RTD_TYPES = {
  Pt100: { R0: 100, kind: 'pt' },
  Pt1000: { R0: 1000, kind: 'pt' },
  Ni100: { R0: 100, kind: 'ni', alpha: 5.485e-3, beta: 6.65e-6 },
  Cu100: { R0: 100, kind: 'cu', alpha: 4.27e-3 },
};

function ptResistance(R0, t) {
  if (t >= 0) {
    return R0 * (1 + PT_A * t + PT_B * t * t);
  }
  return R0 * (1 + PT_A * t + PT_B * t * t + PT_C * (t - 100) * t * t * t);
}

/** Temperature -> Resistance */
export function temperatureToResistance(tempC, type = 'Pt100') {
  const def = RTD_TYPES[type];
  if (!def) throw new Error(`Unknown RTD type: ${type}`);
  if (def.kind === 'pt') return ptResistance(def.R0, tempC);
  if (def.kind === 'ni') return def.R0 * (1 + def.alpha * tempC + def.beta * tempC * tempC);
  if (def.kind === 'cu') return def.R0 * (1 + def.alpha * tempC);
  throw new Error('Unsupported RTD kind');
}

/** Resistance -> Temperature (numeric solve, bisection, robust across ranges) */
export function resistanceToTemperature(resistance, type = 'Pt100') {
  const def = RTD_TYPES[type];
  if (!def) throw new Error(`Unknown RTD type: ${type}`);
  let lo = -200;
  let hi = 850;
  let rLo = temperatureToResistance(lo, type);
  let rHi = temperatureToResistance(hi, type);
  if (resistance < rLo || resistance > rHi) {
    throw new Error('Resistance out of supported RTD range (-200 to 850 C)');
  }
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const rMid = temperatureToResistance(mid, type);
    if (Math.abs(rMid - resistance) < 1e-9) return mid;
    if (rMid < resistance) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function formula(type = 'Pt100') {
  if (RTD_TYPES[type]?.kind === 'pt') {
    return 'R(t) = R0·(1 + A·t + B·t²)  [t≥0°C], IEC 60751 Callendar-Van Dusen, A=3.9083e-3, B=-5.775e-7';
  }
  return 'R(t) = R0·(1 + α·t [+ β·t²])  — manufacturer curve approximation';
}
