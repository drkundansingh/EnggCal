// tripProtection.mjs — Turbine & Boiler Trip / Protection system engine.
//
// UNIVERSAL by design: nothing here is hardcoded as "the" trip setting for
// any real plant. The PARAMETER_REGISTRY below holds generic, illustrative
// industry-typical values for education/reference — every value is
// explicitly tagged dataType: 'Public Reference' (meaning: a commonly-used
// generic figure, not sourced from a specific OEM's proprietary manual) and
// is designed to be overridden by the user's own plant data, which is
// always tagged 'User Configured' and always takes precedence for display
// and simulation once entered.
//
// This module does not verify or claim to reproduce any real OEM's actual
// proprietary setpoint documents (BHEL, Siemens Energy, GE Vernova,
// Mitsubishi Power, or otherwise) — this environment has no internet access
// to such documents, and presenting invented numbers as real OEM data would
// be dishonest. The "OEM Reference" selector changes attribution/labeling
// context for the user's own engineering workflow; it does not claim to be
// verified manufacturer data. See spec section 12/15 disclaimers, mirrored
// in the UI.

export const PLANT_TYPES = ['subcritical', 'supercritical', 'ultra-supercritical'];
export const BOILER_TYPES = ['drum', 'once-through'];
export const FUEL_TYPES = ['coal', 'gas', 'oil', 'biomass', 'other'];
export const OEM_REFERENCE_PROFILES = [
  'Generic / Illustrative',
  'BHEL-style (illustrative)',
  'Siemens Energy-style (illustrative)',
  'GE Vernova-style (illustrative)',
  'Mitsubishi Power-style (illustrative)',
  'Custom',
];

export const VOTING_SCHEMES = ['1oo1', '1oo2', '2oo2', '2oo3', '2oo4', 'custom'];

export const STATUS = { NORMAL: 'NORMAL', ALARM: 'ALARM', TRIP: 'TRIP' };

export const CLASSIFICATIONS = [
  'ALARM', 'WARNING', 'INTERLOCK', 'PERMISSIVE', 'RUNBACK', 'LOAD LIMIT',
  'BOILER TRIP', 'MFT', 'TURBINE TRIP', 'ETS', 'GENERATOR TRIP',
];

export const DATA_TYPES = ['Public Reference', 'OEM Reference', 'User Configured', 'Calculated', 'Simulated'];

/**
 * Parameter registry — a representative, extensible set spanning every
 * category in the spec (ETS: mechanical/steam/valve/electrical/other; MFT:
 * furnace/air/flame/fuel/feedwater-boiler/steam/other). This is NOT a claim
 * of covering every conceivable plant signal — real DCS/SIS configurations
 * run to hundreds of points — it's a solid representative first version,
 * same scoping approach as the rest of this app.
 *
 * Fields:
 *   id, system ('ETS'|'MFT'), category (subgroup), label, unit,
 *   applicability ('all'|'drum'|'once-through'),
 *   normalMin/normalMax, alarmSetpoint, tripSetpoint, direction ('high'|'low'),
 *   timeDelaySec, voting, tripAction, resetCondition, permissive,
 *   classification (one of CLASSIFICATIONS), dataType.
 */
export const PARAMETER_REGISTRY = [
  // ---------------- ETS: Turbine Mechanical Protection ----------------
  { id: 'ets-overspeed', system: 'ETS', category: 'Turbine Mechanical', label: 'Turbine Speed (Overspeed)', unit: '% rated speed',
    applicability: 'all', normalMin: 95, normalMax: 100, alarmSetpoint: 103, tripSetpoint: 110, direction: 'high',
    timeDelaySec: 0, voting: '2oo3', tripAction: 'ETS trip — MSV/CV/RSV/ICV close, generator breaker trip',
    resetCondition: 'Speed below reset threshold and manual reset', permissive: 'None — safety trip, always active',
    classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-vibration', system: 'ETS', category: 'Turbine Mechanical', label: 'Shaft Vibration', unit: 'µm (pk-pk)',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: 180, tripSetpoint: 250, direction: 'high',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'ETS trip', resetCondition: 'Vibration normal, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-axial-displacement', system: 'ETS', category: 'Turbine Mechanical', label: 'Axial (Thrust) Displacement', unit: 'mm',
    applicability: 'all', normalMin: -0.3, normalMax: 0.3, alarmSetpoint: 0.6, tripSetpoint: 0.9, direction: 'high',
    timeDelaySec: 1, voting: '2oo3', tripAction: 'ETS trip', resetCondition: 'Displacement normal, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-bearing-temp', system: 'ETS', category: 'Turbine Mechanical', label: 'Bearing Metal Temperature', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 90, alarmSetpoint: 105, tripSetpoint: 115, direction: 'high',
    timeDelaySec: 3, voting: '2oo3', tripAction: 'ETS trip', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-exhaust-hood-temp', system: 'ETS', category: 'Turbine Mechanical', label: 'Exhaust Hood Temperature', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 60, alarmSetpoint: 90, tripSetpoint: 120, direction: 'high',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'ETS trip, exhaust hood spray active', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-diff-expansion', system: 'ETS', category: 'Turbine Mechanical', label: 'Rotor/Casing Differential Expansion', unit: 'mm',
    applicability: 'all', normalMin: -2, normalMax: 2, alarmSetpoint: 4, tripSetpoint: 6, direction: 'high',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'ETS trip', resetCondition: 'Differential expansion normal, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-lube-oil-pressure', system: 'ETS', category: 'Turbine Mechanical', label: 'Lube Oil Pressure', unit: 'bar',
    applicability: 'all', normalMin: 1.2, normalMax: 2.0, alarmSetpoint: 0.9, tripSetpoint: 0.6, direction: 'low',
    timeDelaySec: 0, voting: '2oo3', tripAction: 'ETS trip, turning gear/AC-DC oil pump sequence per plant logic', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None — safety trip', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-ehc-oil-pressure', system: 'ETS', category: 'Turbine Mechanical', label: 'EHC / Control Oil Pressure', unit: 'bar',
    applicability: 'all', normalMin: 100, normalMax: 140, alarmSetpoint: 90, tripSetpoint: 70, direction: 'low',
    timeDelaySec: 1, voting: '2oo3', tripAction: 'ETS trip — valves fail closed on loss of EHC pressure', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-water-induction', system: 'ETS', category: 'Turbine Mechanical', label: 'Water Induction Protection', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '1oo2', tripAction: 'ETS trip, drains open per water induction logic', resetCondition: 'Manual reset after drain/verification',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-manual-trip', system: 'ETS', category: 'Turbine Mechanical', label: 'Manual Emergency Trip Pushbutton', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'Immediate ETS trip', resetCondition: 'Manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },

  // ---------------- ETS: Steam Conditions ----------------
  { id: 'ets-condenser-vacuum', system: 'ETS', category: 'Steam Conditions', label: 'Condenser Pressure (Vacuum Loss)', unit: 'kPa',
    applicability: 'all', normalMin: 4, normalMax: 12, alarmSetpoint: 20, tripSetpoint: 30, direction: 'high',
    timeDelaySec: 3, voting: '2oo3', tripAction: 'ETS trip on low vacuum', resetCondition: 'Vacuum restored, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-main-steam-temp-high', system: 'ETS', category: 'Steam Conditions', label: 'Main Steam Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 500, normalMax: 545, alarmSetpoint: 555, tripSetpoint: 565, direction: 'high',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'ETS trip (some plants: runback first, per configuration)', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },

  // ---------------- ETS: Valve Protection ----------------
  { id: 'ets-msv-position', system: 'ETS', category: 'Valve Protection', label: 'Main Stop Valve Position Disagreement', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 2, voting: '1oo2', tripAction: 'ETS trip on valve disagreement/closure failure', resetCondition: 'Manual reset after verification',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },

  // ---------------- ETS: Generator/Electrical Protection ----------------
  { id: 'ets-gen-differential', system: 'ETS', category: 'Generator/Electrical', label: 'Generator Differential Protection', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'Generator + ETS trip, breaker open', resetCondition: 'Manual reset after fault clearance',
    permissive: 'None — unit protection', classification: 'GENERATOR TRIP', dataType: 'Public Reference' },
  { id: 'ets-reverse-power', system: 'ETS', category: 'Generator/Electrical', label: 'Reverse Power', unit: '% rated MW',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: -0.5, tripSetpoint: -2, direction: 'low',
    timeDelaySec: 30, voting: '2oo3', tripAction: 'Generator breaker trip (motoring protection)', resetCondition: 'Manual reset',
    permissive: 'None', classification: 'GENERATOR TRIP', dataType: 'Public Reference' },
  { id: 'ets-loss-of-sync', system: 'ETS', category: 'Generator/Electrical', label: 'Loss of Synchronism', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'Generator breaker trip, ETS trip per plant logic', resetCondition: 'Manual reset',
    permissive: 'None', classification: 'GENERATOR TRIP', dataType: 'Public Reference' },

  // ---------------- ETS: Other ----------------
  { id: 'ets-instrument-power-loss', system: 'ETS', category: 'Other', label: 'Loss of Critical Instrument Power', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '1oo2', tripAction: 'ETS trip (fail-safe on loss of critical power)', resetCondition: 'Power restored, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },

  // ---------------- MFT: Furnace Protection ----------------
  { id: 'mft-furnace-pressure-hh', system: 'MFT', category: 'Furnace Protection', label: 'Furnace Pressure HIGH-HIGH', unit: 'mmWC',
    applicability: 'all', normalMin: -10, normalMax: 10, alarmSetpoint: 60, tripSetpoint: 100, direction: 'high',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'MFT — furnace implosion/explosion protection', resetCondition: 'Pressure normal, purge complete, manual reset',
    permissive: 'None — safety trip', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-furnace-pressure-ll', system: 'MFT', category: 'Furnace Protection', label: 'Furnace Pressure LOW-LOW', unit: 'mmWC',
    applicability: 'all', normalMin: -10, normalMax: 10, alarmSetpoint: -60, tripSetpoint: -100, direction: 'low',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'MFT — implosion protection', resetCondition: 'Pressure normal, purge complete, manual reset',
    permissive: 'None — safety trip', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-draft-failure', system: 'MFT', category: 'Furnace Protection', label: 'Furnace Draft Failure', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 3, voting: '2oo3', tripAction: 'MFT on sustained draft loss', resetCondition: 'Draft restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },

  // ---------------- MFT: Combustion Air ----------------
  { id: 'mft-total-air-ll', system: 'MFT', category: 'Combustion Air', label: 'Total Combustion Air LOW-LOW', unit: '% required',
    applicability: 'all', normalMin: 100, normalMax: 130, alarmSetpoint: 80, tripSetpoint: 60, direction: 'low',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'MFT — insufficient air for fuel being fired', resetCondition: 'Air flow restored, manual reset',
    permissive: 'Air flow permissive required before fuel admission', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-loss-fd-fans', system: 'MFT', category: 'Combustion Air', label: 'Loss of Required FD Fans', unit: 'count running',
    applicability: 'all', normalMin: 1, normalMax: 2, alarmSetpoint: 1, tripSetpoint: 0, direction: 'low',
    timeDelaySec: 3, voting: '1oo2', tripAction: 'MFT on loss of all required FD fans', resetCondition: 'FD fan(s) restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-loss-id-fans', system: 'MFT', category: 'Combustion Air', label: 'Loss of Required ID Fans', unit: 'count running',
    applicability: 'all', normalMin: 1, normalMax: 2, alarmSetpoint: 1, tripSetpoint: 0, direction: 'low',
    timeDelaySec: 3, voting: '1oo2', tripAction: 'MFT on loss of all required ID fans', resetCondition: 'ID fan(s) restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },

  // ---------------- MFT: Flame Protection ----------------
  { id: 'mft-loss-all-flame', system: 'MFT', category: 'Flame Protection', label: 'Loss of All Flame', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 1, voting: '2oo3 per scanner group', tripAction: 'MFT — total fuel isolation, purge sequence per plant BMS/FSSS logic',
    resetCondition: 'Purge complete, manual reset, re-ignition permissives satisfied', permissive: 'None — safety trip',
    classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-hazardous-partial-flame-loss', system: 'MFT', category: 'Flame Protection', label: 'Hazardous Partial Flame Loss', unit: '% burners lit',
    applicability: 'all', normalMin: 100, normalMax: 100, alarmSetpoint: 70, tripSetpoint: 50, direction: 'low',
    timeDelaySec: 2, voting: 'Per BMS zone logic', tripAction: 'MFT if configured proportion of burners lost simultaneously',
    resetCondition: 'Manual reset, re-light permissives satisfied', permissive: 'Ignition source available for re-light',
    classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-ignition-failure', system: 'MFT', category: 'Flame Protection', label: 'Ignition Failure', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 10, voting: '1oo1 per igniter, per BMS logic', tripAction: 'Fuel valve for that burner/trial fails closed; MFT if within trip window per BMS logic',
    resetCondition: 'Manual reset', permissive: 'Purge complete before trial for ignition', classification: 'MFT', dataType: 'Public Reference' },

  // ---------------- MFT: Fuel System ----------------
  { id: 'mft-loss-all-fuel', system: 'MFT', category: 'Fuel System', label: 'Loss of All Fuel', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'MFT — no fuel admission possible', resetCondition: 'Fuel supply restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-fuel-pressure-abnormal', system: 'MFT', category: 'Fuel System', label: 'Fuel Pressure Abnormal', unit: 'bar',
    applicability: 'all', normalMin: 15, normalMax: 25, alarmSetpoint: 10, tripSetpoint: 6, direction: 'low',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'MFT on sustained low fuel pressure', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-mill-trip', system: 'MFT', category: 'Fuel System', label: 'All Mills/Pulverizers Tripped', unit: 'count running',
    applicability: 'all', normalMin: 1, normalMax: 6, alarmSetpoint: 1, tripSetpoint: 0, direction: 'low',
    timeDelaySec: 5, voting: '1oo1 (all mills)', tripAction: 'MFT on loss of all fuel-feeding mills (coal-fired units)',
    resetCondition: 'A mill restored, manual reset', permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },

  // ---------------- MFT: Feedwater / Boiler Protection ----------------
  { id: 'mft-drum-level-ll', system: 'MFT', category: 'Feedwater/Boiler', label: 'Drum Level LOW-LOW', unit: 'mm',
    applicability: 'drum', normalMin: -100, normalMax: 100, alarmSetpoint: -200, tripSetpoint: -300, direction: 'low',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'MFT — protect against dry firing/tube damage', resetCondition: 'Level restored, manual reset',
    permissive: 'None — safety trip', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-drum-level-hh', system: 'MFT', category: 'Feedwater/Boiler', label: 'Drum Level HIGH-HIGH', unit: 'mm',
    applicability: 'drum', normalMin: -100, normalMax: 100, alarmSetpoint: 200, tripSetpoint: 300, direction: 'high',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'MFT — protect turbine from water carryover', resetCondition: 'Level restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-feedwater-flow-ll', system: 'MFT', category: 'Feedwater/Boiler', label: 'Feedwater Flow LOW-LOW', unit: '% required',
    applicability: 'once-through', normalMin: 95, normalMax: 105, alarmSetpoint: 70, tripSetpoint: 50, direction: 'low',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'MFT — protect water-wall tubes (once-through boilers have no drum buffer)',
    resetCondition: 'Flow restored, manual reset', permissive: 'Minimum flow permissive required before/during firing',
    classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-bfp-availability', system: 'MFT', category: 'Feedwater/Boiler', label: 'Boiler Feed Pump Availability', unit: 'count running',
    applicability: 'all', normalMin: 1, normalMax: 3, alarmSetpoint: 1, tripSetpoint: 0, direction: 'low',
    timeDelaySec: 3, voting: '1oo1 (all BFPs)', tripAction: 'MFT on loss of all boiler feed pumps', resetCondition: 'A BFP restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },

  // ---------------- MFT: Steam Protection ----------------
  { id: 'mft-main-steam-pressure-hh', system: 'MFT', category: 'Steam Protection', label: 'Main Steam Pressure HIGH-HIGH', unit: 'bar',
    applicability: 'all', normalMin: 150, normalMax: 180, alarmSetpoint: 195, tripSetpoint: 205, direction: 'high',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'MFT — overpressure protection (in addition to safety valves)', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None — safety trip', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-superheater-temp-hh', system: 'MFT', category: 'Steam Protection', label: 'Superheater Outlet Temperature HIGH-HIGH', unit: '°C',
    applicability: 'all', normalMin: 500, normalMax: 545, alarmSetpoint: 560, tripSetpoint: 575, direction: 'high',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'MFT — protect superheater tube metallurgy', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-reheater-temp-hh', system: 'MFT', category: 'Steam Protection', label: 'Reheater Outlet Temperature HIGH-HIGH', unit: '°C',
    applicability: 'all', normalMin: 500, normalMax: 545, alarmSetpoint: 560, tripSetpoint: 575, direction: 'high',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'MFT — protect reheater tube metallurgy', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },

  // ---------------- MFT: Other ----------------
  { id: 'mft-instrument-air-failure', system: 'MFT', category: 'Other', label: 'Critical Instrument Air Failure', unit: 'bar',
    applicability: 'all', normalMin: 6, normalMax: 8, alarmSetpoint: 4.5, tripSetpoint: 3.5, direction: 'low',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'MFT — pneumatic dampers/valves fail-safe on loss of air', resetCondition: 'Air pressure restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-manual-trip', system: 'MFT', category: 'Other', label: 'Manual MFT Pushbutton', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'Immediate MFT', resetCondition: 'Manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
];

export function parametersFor(boilerType) {
  return PARAMETER_REGISTRY.filter((p) => p.applicability === 'all' || p.applicability === boilerType);
}

export function categoriesFor(system) {
  return [...new Set(PARAMETER_REGISTRY.filter((p) => p.system === system).map((p) => p.category))];
}

// ---------------- Voting logic ----------------

/** Parse a voting scheme string like "2oo3" -> { k: 2, n: 3 }. Free-text
 * schemes (e.g. "2oo3 per scanner group") fall back to the leading koon
 * pattern if present, else null (informational-only, not evaluable). */
export function parseVotingScheme(scheme) {
  const m = /^(\d+)oo(\d+)/.exec(String(scheme).trim());
  if (!m) return null;
  const k = Number(m[1]);
  const n = Number(m[2]);
  if (!(k > 0 && n > 0 && k <= n)) throw new Error(`Invalid voting scheme: ${scheme}`);
  return { k, n };
}

/**
 * Evaluate a k-out-of-n voting scheme against a set of boolean sensor
 * trip flags. Returns whether the vote confirms a trip, and the tally.
 */
export function evaluateVoting(trippedFlags, scheme) {
  const parsed = typeof scheme === 'string' ? parseVotingScheme(scheme) : scheme;
  if (!parsed) throw new Error(`Cannot evaluate non-standard voting scheme: ${scheme}`);
  const { k, n } = parsed;
  if (trippedFlags.length !== n) {
    throw new Error(`Voting scheme ${k}oo${n} expects ${n} sensor inputs, got ${trippedFlags.length}`);
  }
  const votesFor = trippedFlags.filter(Boolean).length;
  return { tripped: votesFor >= k, votesFor, votesRequired: k, totalSensors: n };
}

/** Compare a value against alarm/trip setpoints given a direction, return STATUS. */
export function evaluateStatus(value, alarmSetpoint, tripSetpoint, direction) {
  if (direction === 'high') {
    if (value >= tripSetpoint) return STATUS.TRIP;
    if (value >= alarmSetpoint) return STATUS.ALARM;
    return STATUS.NORMAL;
  }
  if (direction === 'low') {
    if (value <= tripSetpoint) return STATUS.TRIP;
    if (value <= alarmSetpoint) return STATUS.ALARM;
    return STATUS.NORMAL;
  }
  throw new Error(`Unknown direction: ${direction}`);
}

// ---------------- Disturbance simulator ----------------

/**
 * Simulate a linear ramp disturbance against a parameter's alarm/trip
 * setpoints, with a confirmation time delay before the trip is considered
 * confirmed (matching real trip logic: sustained deviation, not an instant
 * blip, is what actually trips the plant), then an optional recovery ramp
 * back toward normal.
 *
 * @param {object} opts
 * @param {number} opts.startValue
 * @param {number} opts.alarmSetpoint
 * @param {number} opts.tripSetpoint
 * @param {'high'|'low'} opts.direction
 * @param {number} opts.rampRatePerSec — magnitude of change per second toward the trip direction
 * @param {number} opts.timeDelaySec — confirmation delay before a sustained trip-level deviation is confirmed
 * @param {number} [opts.durationSec=120]
 * @param {number} [opts.stepSec=1]
 * @param {boolean} [opts.recover=true] — after trip confirms, ramp back toward startValue
 */
export function simulateDisturbance(opts) {
  const {
    startValue, alarmSetpoint, tripSetpoint, direction, rampRatePerSec,
    timeDelaySec, durationSec = 120, stepSec = 1, recover = true,
  } = opts;
  if (rampRatePerSec <= 0) throw new Error('rampRatePerSec must be > 0');
  const sign = direction === 'high' ? 1 : -1;

  const series = [];
  let value = startValue;
  let t = 0;
  let timeToAlarmSec = null;
  let tripSetpointCrossedAtSec = null;
  let timeToTripSec = null;
  let tripped = false;
  let recovering = false;
  let recoveryStartSec = null;
  let recoveryTimeSec = null;
  let maxDeviation = 0;

  while (t <= durationSec) {
    const status = evaluateStatus(value, alarmSetpoint, tripSetpoint, direction);
    if (status === STATUS.ALARM && timeToAlarmSec === null) timeToAlarmSec = t;
    if (status === STATUS.TRIP && tripSetpointCrossedAtSec === null) tripSetpointCrossedAtSec = t;

    if (!tripped && tripSetpointCrossedAtSec !== null && t - tripSetpointCrossedAtSec >= timeDelaySec) {
      tripped = true;
      timeToTripSec = tripSetpointCrossedAtSec + timeDelaySec;
    }

    maxDeviation = Math.max(maxDeviation, Math.abs(value - startValue));

    series.push({ t, value, status, tripped });

    if (tripped && recover && !recovering) {
      recovering = true;
      recoveryStartSec = t;
    }

    if (recovering) {
      value -= sign * rampRatePerSec * stepSec; // ramp back toward start
      if ((sign > 0 && value <= startValue) || (sign < 0 && value >= startValue)) {
        value = startValue;
        if (recoveryTimeSec === null) recoveryTimeSec = t - recoveryStartSec;
      }
    } else {
      value += sign * rampRatePerSec * stepSec;
    }
    t += stepSec;
  }

  return {
    series, timeToAlarmSec, timeToTripSec,
    tripDelaySec: timeDelaySec, maxDeviation, recoveryTimeSec,
    tripped,
  };
}

/** Illustrative disturbance scenario presets — link a scenario to a
 * representative parameter and a plausible default ramp rate. Ramp rates are
 * illustrative for simulation/training purposes, not measured plant data. */
export const DISTURBANCE_SCENARIOS = [
  { id: 'turbine-speed-increase', label: 'Turbine speed increase', parameterId: 'ets-overspeed', rampRatePerSec: 0.8 },
  { id: 'furnace-pressure-increase', label: 'Furnace pressure increase', parameterId: 'mft-furnace-pressure-hh', rampRatePerSec: 4 },
  { id: 'furnace-pressure-decrease', label: 'Furnace pressure decrease', parameterId: 'mft-furnace-pressure-ll', rampRatePerSec: 4 },
  { id: 'loss-of-flame', label: 'Loss of flame', parameterId: 'mft-loss-all-flame', rampRatePerSec: 1 },
  { id: 'loss-of-fd-fan', label: 'Loss of FD fan', parameterId: 'mft-loss-fd-fans', rampRatePerSec: 1 },
  { id: 'loss-of-id-fan', label: 'Loss of ID fan', parameterId: 'mft-loss-id-fans', rampRatePerSec: 1 },
  { id: 'low-feedwater-flow', label: 'Low feedwater flow', parameterId: 'mft-feedwater-flow-ll', rampRatePerSec: 2 },
  { id: 'low-drum-level', label: 'Low drum level', parameterId: 'mft-drum-level-ll', rampRatePerSec: 8 },
  { id: 'high-steam-temperature', label: 'High steam temperature', parameterId: 'mft-superheater-temp-hh', rampRatePerSec: 0.3 },
  { id: 'low-condenser-vacuum', label: 'Low condenser vacuum', parameterId: 'ets-condenser-vacuum', rampRatePerSec: 0.5 },
  { id: 'low-lube-oil-pressure', label: 'Low lube-oil pressure', parameterId: 'ets-lube-oil-pressure', rampRatePerSec: 0.03 },
  { id: 'high-vibration', label: 'High vibration', parameterId: 'ets-vibration', rampRatePerSec: 5 },
  { id: 'high-axial-displacement', label: 'High axial displacement', parameterId: 'ets-axial-displacement', rampRatePerSec: 0.02 },
  { id: 'generator-fault', label: 'Generator fault', parameterId: 'ets-gen-differential', rampRatePerSec: 1 },
  { id: 'manual-emergency-trip', label: 'Manual emergency trip', parameterId: 'ets-manual-trip', rampRatePerSec: 1 },
];

/** Trip Action Matrix — illustrative examples. The spec is explicit that the
 * exact valve/isolation sequence is plant-specific and must be configurable;
 * these rows are worked examples, not a universal sequence claim. */
export const TRIP_ACTION_MATRIX = [
  { source: 'Turbine Overspeed', logic: 'Overspeed protection, 2oo3 speed probes', signal: 'ETS Trip',
    action: 'Main stop valves close → Control valves close → Intercept/reheat valves close → Steam admission isolated → Turbine trip' },
  { source: 'Loss of All Flame', logic: 'Flame protection logic (BMS/FSSS)', signal: 'MFT',
    action: 'Fuel isolation → Boiler fuel admission stopped → Post-trip purge initiated per plant configuration' },
  { source: 'Drum Level LOW-LOW', logic: '2oo3 level transmitters', signal: 'MFT',
    action: 'Fuel isolation → Feedwater control per plant post-trip logic → Drain/vent sequence per plant configuration' },
  { source: 'Furnace Pressure HIGH-HIGH', logic: '2oo3 pressure transmitters', signal: 'MFT',
    action: 'Fuel isolation → FD/ID fan runback or trip per plant configuration → Furnace purge sequence' },
  { source: 'Generator Differential Protection', logic: 'Unit protection relay, typically 1oo1 dedicated protection', signal: 'Generator Trip + ETS',
    action: 'Generator breaker opens → Turbine trip (ETS) → Excitation trip → Unit isolated from grid' },
  { source: 'Low Lube Oil Pressure', logic: '2oo3 pressure transmitters', signal: 'ETS Trip',
    action: 'Turbine trip → AC/DC emergency oil pump auto-start sequence → Turning gear engagement per plant logic' },
];
