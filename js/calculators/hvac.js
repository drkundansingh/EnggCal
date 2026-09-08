// hvac.js — HVAC and refrigeration calculations.
//
// Sensible heat load and duct sizing are the standard ASHRAE Fundamentals
// air-side formulas, universally used for load estimation and duct
// design. Both are explicitly SENSIBLE heat only (temperature change) —
// neither includes latent heat (moisture/humidity load), which needs a
// full psychrometric calculation this module does not attempt. A real
// HVAC design (Manual J, Manual D, or equivalent) accounts for latent
// load, solar gain, occupancy, infiltration and duct heat gain/loss on
// top of this — this gives the sensible airflow-temperature relationship
// itself, the core relationship those fuller methods are built on.

// ============================================================
// 1. SENSIBLE HEAT LOAD
// ============================================================
//
// Q(BTU/hr) = 1.08 x CFM x deltaT(F)   [imperial]
// Q(kW)     = 1.2  x (L/s) x deltaT(C) [metric]
// Both constants come directly from air density x specific heat
// (1.08 = 60 min/hr x 0.075 lb/ft3 x 0.24 BTU/lb.F; 1.2 = 1.2 kg/m3 x
// 1.005 kJ/kg.K) -- not empirical fits, and not adjustable "fudge
// factors".

export function sensibleHeatLoadImperial({ cfm, deltaTF }) {
  if (!(cfm > 0)) throw new Error('Airflow (CFM) must be greater than zero.');
  if (!Number.isFinite(deltaTF)) throw new Error('Temperature difference must be a number.');
  const btuPerHr = 1.08 * cfm * deltaTF;
  return { btuPerHr, tons: btuPerHr / 12000, kW: btuPerHr * 0.000293071 };
}

export function sensibleHeatLoadMetric({ litersPerSec, deltaTC }) {
  if (!(litersPerSec > 0)) throw new Error('Airflow (L/s) must be greater than zero.');
  if (!Number.isFinite(deltaTC)) throw new Error('Temperature difference must be a number.');
  const kW = 1.2 * (litersPerSec / 1000) * deltaTC;
  return { kW, btuPerHr: kW / 0.000293071, tons: kW / 3.51685 };
}

// ============================================================
// 2. REFRIGERATION TON CONVERSION
// ============================================================
// 1 ton of refrigeration = 12,000 BTU/hr = 3.5168 kW, defined from the
// latent heat needed to freeze one short ton of 0C water to ice in 24h.

export function tonsToKW(tons) {
  if (!(tons > 0)) throw new Error('Refrigeration tons must be greater than zero.');
  return tons * 3.51685;
}
export function kWToTons(kW) {
  if (!(kW > 0)) throw new Error('Cooling capacity (kW) must be greater than zero.');
  return kW / 3.51685;
}

// ============================================================
// 3. DUCT SIZING — velocity method
// ============================================================
//
// Area = Flow / Velocity, then converted to a round-duct equivalent
// diameter (or left as a required cross-sectional area for a
// rectangular duct of the engineer's own chosen aspect ratio). Target
// velocity is a DESIGN CHOICE driven by noise and pressure-drop
// constraints, not a fixed physical law -- typical ranges (quoted in
// the UI, not hardcoded here) come from ASHRAE Fundamentals guidance by
// duct application (main trunk vs branch vs low-noise spaces).

export function ductSizeImperial({ cfm, velocityFpm }) {
  if (!(cfm > 0)) throw new Error('Airflow (CFM) must be greater than zero.');
  if (!(velocityFpm > 0)) throw new Error('Design velocity must be greater than zero.');
  const areaFt2 = cfm / velocityFpm;
  const roundDiameterIn = Math.sqrt((4 * areaFt2) / Math.PI) * 12;
  return { areaFt2, roundDiameterIn };
}

export function ductSizeMetric({ litersPerSec, velocityMs }) {
  if (!(litersPerSec > 0)) throw new Error('Airflow (L/s) must be greater than zero.');
  if (!(velocityMs > 0)) throw new Error('Design velocity must be greater than zero.');
  const areaM2 = (litersPerSec / 1000) / velocityMs;
  const roundDiameterMm = Math.sqrt((4 * areaM2) / Math.PI) * 1000;
  return { areaM2, roundDiameterMm };
}

// Rectangular duct with a chosen aspect ratio, from a required area
// (either output above) -- solves width x height = area for a given
// height, or vice versa, given one dimension is fixed by ceiling space.
export function rectangularFromArea({ areaM2, fixedHeightM }) {
  if (!(areaM2 > 0)) throw new Error('Required area must be greater than zero.');
  if (!(fixedHeightM > 0)) throw new Error('Fixed height/depth must be greater than zero.');
  return { widthM: areaM2 / fixedHeightM };
}
