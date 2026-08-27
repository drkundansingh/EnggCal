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
  'BOILER TRIP', 'MFT', 'TURBINE TRIP', 'ETS', 'GENERATOR TRIP', 'AUXILIARY DRIVE',
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
    classification: 'ETS', dataType: 'Public Reference',
    source: 'Corroborated by a US NRC Final Safety Analysis Report: primary overspeed trip typically ~110% of rated speed, emergency/secondary trip ~111%. Broad industry norm, not one specific plant.' },
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
  { id: 'ets-loss-of-excitation', system: 'ETS', category: 'Generator/Electrical', label: 'Loss of Excitation (40)', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 1, voting: '1oo1', tripAction: 'Generator breaker trip, field breaker trip — loss of field causes the machine to run as an induction generator, drawing reactive power and risking rotor overheating and system instability', resetCondition: 'Manual reset after cause identified',
    permissive: 'None — unit protection', classification: 'GENERATOR TRIP', dataType: 'Public Reference' },
  { id: 'ets-negative-sequence-hh', system: 'ETS', category: 'Generator/Electrical', label: 'Negative Sequence / Unbalanced Current (46)', unit: '% I2/IN',
    applicability: 'all', normalMin: 0, normalMax: 6, alarmSetpoint: 8, tripSetpoint: 10, direction: 'high',
    timeDelaySec: 20, voting: '1oo1', tripAction: 'Generator breaker trip — unbalanced phase currents (e.g. from an unbalanced system fault or open phase) induce double-frequency currents in the rotor, causing localized overheating', resetCondition: 'Manual reset after cause identified',
    permissive: 'None — unit protection', classification: 'GENERATOR TRIP', dataType: 'Public Reference' },

  // ---------------- ETS: Other ----------------
  { id: 'ets-instrument-power-loss', system: 'ETS', category: 'Other', label: 'Loss of Critical Instrument Power', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '1oo2', tripAction: 'ETS trip (fail-safe on loss of critical power)', resetCondition: 'Power restored, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-trip-oil-pressure-ll', system: 'ETS', category: 'Turbine Mechanical', label: 'Trip Oil Pressure LOW', unit: 'bar',
    applicability: 'all', normalMin: 8, normalMax: 12, alarmSetpoint: 6, tripSetpoint: 4.5, direction: 'low',
    timeDelaySec: 0, voting: '2oo3', tripAction: 'ETS trip — MSV/CV/RSV/ICV close (dedicated hydraulic trip header, distinct from general lube oil and EH control oil systems)', resetCondition: 'Trip oil pressure restored, manual reset',
    permissive: 'None — safety trip, always active', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-seal-steam-pressure-ll', system: 'ETS', category: 'Turbine Mechanical', label: 'Gland/Seal Steam Pressure LOW', unit: 'bar',
    applicability: 'all', normalMin: 0.1, normalMax: 0.3, alarmSetpoint: 0.05, tripSetpoint: 0.02, direction: 'low',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'ETS trip — loss of shaft seal steam allows air ingress at the shaft glands, collapsing vacuum and risking shaft/packing damage', resetCondition: 'Seal steam pressure restored, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-casing-temp-differential-hh', system: 'ETS', category: 'Turbine Mechanical', label: 'HP/IP Casing Top-Bottom Temperature Differential HIGH', unit: '°C',
    applicability: 'all', normalMin: 0, normalMax: 15, alarmSetpoint: 25, tripSetpoint: 40, direction: 'high',
    timeDelaySec: 10, voting: '1oo2', tripAction: 'ETS trip or runback per C&E — excessive top-bottom differential indicates casing thermal bowing, risking rotor-to-casing rubs on restart', resetCondition: 'Differential normal, manual reset',
    permissive: 'None', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-control-system-failure', system: 'ETS', category: 'Other', label: 'Turbine Control System (DEH/ETS Processor) Failure', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '2oo3', tripAction: 'ETS trip — loss of digital governing/protection processor is treated as an unsafe condition, fail-safe trip', resetCondition: 'Processor/watchdog healthy, manual reset',
    permissive: 'None — safety trip, always active', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'ets-generator-bearing-vibration-hh', system: 'ETS', category: 'Turbine Mechanical', label: 'Generator Bearing Vibration HIGH-HIGH', unit: 'µm',
    applicability: 'all', normalMin: 0, normalMax: 80, alarmSetpoint: 125, tripSetpoint: 200, direction: 'high',
    timeDelaySec: 0, voting: '2oo3', tripAction: 'ETS trip — generator has its own bearings distinct from the turbine shaft train, monitored separately', resetCondition: 'Vibration normal, manual reset',
    permissive: 'None — safety trip, always active', classification: 'ETS', dataType: 'Public Reference' },

  // ---------------- MFT: Furnace Protection ----------------
  { id: 'mft-furnace-pressure-hh', system: 'MFT', category: 'Furnace Protection', label: 'Furnace Pressure HIGH-HIGH', unit: 'mmWC',
    applicability: 'all', normalMin: -10, normalMax: 10, alarmSetpoint: 150, tripSetpoint: 250, direction: 'high',
    timeDelaySec: 8, voting: '2oo3', tripAction: 'MFT — furnace implosion/explosion protection', resetCondition: 'Pressure normal, purge complete, manual reset',
    permissive: 'None — safety trip', classification: 'MFT', dataType: 'OEM Reference',
    source: 'One documented 660MW supercritical boiler (Doosan-supplied): High/Low alarm at +150/\u2212180mmWC for >8s, High-High/Low-Low trip at +250/\u2212250mmWC for >8s, 2/3 voting. Single documented unit, not a cross-OEM standard.' },
  { id: 'mft-furnace-pressure-ll', system: 'MFT', category: 'Furnace Protection', label: 'Furnace Pressure LOW-LOW', unit: 'mmWC',
    applicability: 'all', normalMin: -10, normalMax: 10, alarmSetpoint: -180, tripSetpoint: -250, direction: 'low',
    timeDelaySec: 8, voting: '2oo3', tripAction: 'MFT — implosion protection', resetCondition: 'Pressure normal, purge complete, manual reset',
    permissive: 'None — safety trip', classification: 'MFT', dataType: 'OEM Reference',
    source: 'Same documented 660MW supercritical boiler as the HIGH-HIGH entry above — see that entry for detail.' },
  { id: 'mft-draft-failure', system: 'MFT', category: 'Furnace Protection', label: 'Furnace Draft Failure', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 3, voting: '2oo3', tripAction: 'MFT on sustained draft loss', resetCondition: 'Draft restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-furnace-wall-temp-hh', system: 'MFT', category: 'Furnace Protection', label: 'Furnace Vertical Wall Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 350, normalMax: 440, alarmSetpoint: 460, tripSetpoint: 479, direction: 'high',
    timeDelaySec: 3, voting: '2oo3', tripAction: 'MFT — protect water-wall tube metallurgy from overheating/tube failure risk', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None — safety trip', classification: 'MFT', dataType: 'OEM Reference',
    source: 'One documented 660MW supercritical boiler (Doosan-supplied): furnace vertical wall temperature high for >3s at 479\u00b0C. Single documented unit, not a cross-OEM standard.' },

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
  { id: 'mft-loss-pa-fans', system: 'MFT', category: 'Combustion Air', label: 'Loss of Required PA Fans', unit: 'count running',
    applicability: 'all', normalMin: 1, normalMax: 2, alarmSetpoint: 1, tripSetpoint: 0, direction: 'low',
    timeDelaySec: 3, voting: '1oo2', tripAction: 'MFT on loss of all required PA fans — no primary air means no fuel/air transport to the burners', resetCondition: 'PA fan(s) restored, manual reset',
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
  { id: 'mft-feeder-jam', system: 'MFT', category: 'Fuel System', label: 'Coal Feeder Jam/Stopped (all feeders)', unit: 'count running',
    applicability: 'all', normalMin: 1, normalMax: 6, alarmSetpoint: 1, tripSetpoint: 0, direction: 'low',
    timeDelaySec: 5, voting: '1oo1 (all feeders)', tripAction: 'MFT — a jammed/stopped feeder with its mill still running risks an unmonitored fuel/air ratio and mill fire; loss of all feeders means loss of fuel supply entirely',
    resetCondition: 'A feeder restored, manual reset', permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },

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
  { id: 'mft-economizer-inlet-flow-ll', system: 'MFT', category: 'Feedwater/Boiler', label: 'Economizer Inlet Flow LOW', unit: 't/h',
    applicability: 'all', normalMin: 400, normalMax: 900, alarmSetpoint: 260, tripSetpoint: 223, direction: 'low',
    timeDelaySec: 10, voting: '2oo3', tripAction: 'MFT — protect economizer/water-wall from insufficient flow', resetCondition: 'Flow restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'OEM Reference',
    source: 'One documented 660MW supercritical boiler (Doosan-supplied): economizer inlet flow low for >10s at 223 t/h. Single documented unit — the absolute t/h figure is unit-size-specific and should not be reused as-is for a different unit rating.' },
  { id: 'mft-separator-level-ll', system: 'MFT', category: 'Feedwater/Boiler', label: 'Separator Level LOW-LOW (wet mode)', unit: 'm',
    applicability: 'once-through', normalMin: 5, normalMax: 15, alarmSetpoint: 2, tripSetpoint: 1.1, direction: 'low',
    timeDelaySec: 0, voting: '2oo3', tripAction: 'MFT — once-through boiler wet/dry transition protection (separator level only meaningful in wet/startup mode)', resetCondition: 'Level restored, manual reset',
    permissive: 'Applicable only during wet-mode operation', classification: 'MFT', dataType: 'OEM Reference',
    source: 'One documented 660MW supercritical (once-through) boiler (Doosan-supplied): separator level low-low during wet mode at 1.1m. Single documented unit.' },
  { id: 'mft-separator-level-hh', system: 'MFT', category: 'Feedwater/Boiler', label: 'Separator Level HIGH-HIGH (wet mode)', unit: 'm',
    applicability: 'once-through', normalMin: 5, normalMax: 15, alarmSetpoint: 16.5, tripSetpoint: 17.7, direction: 'high',
    timeDelaySec: 0, voting: '2oo3', tripAction: 'MFT — once-through boiler wet/dry transition protection, prevent water carryover to turbine', resetCondition: 'Level restored, manual reset',
    permissive: 'Applicable only during wet-mode operation', classification: 'MFT', dataType: 'OEM Reference',
    source: 'Same documented 660MW once-through boiler as the separator LOW-LOW entry above: separator level high-high during wet mode at 17.7m.' },
  { id: 'mft-bfp-availability', system: 'MFT', category: 'Feedwater/Boiler', label: 'Boiler Feed Pump Availability', unit: 'count running',
    applicability: 'all', normalMin: 1, normalMax: 3, alarmSetpoint: 1, tripSetpoint: 0, direction: 'low',
    timeDelaySec: 3, voting: '1oo1 (all BFPs)', tripAction: 'MFT on loss of all boiler feed pumps', resetCondition: 'A BFP restored, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },

  // ---------------- MFT: Steam Protection ----------------
  { id: 'mft-main-steam-pressure-hh', system: 'MFT', category: 'Steam Protection', label: 'Main Steam Pressure HIGH-HIGH', unit: 'bar',
    applicability: 'all', normalMin: 150, normalMax: 180, alarmSetpoint: 195, tripSetpoint: 205, direction: 'high',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'MFT — overpressure protection (in addition to safety valves)', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None — safety trip', classification: 'MFT', dataType: 'Public Reference',
    plantTypeVariants: {
      subcritical: { normalMin: 150, normalMax: 175, alarmSetpoint: 185, tripSetpoint: 195 },
      supercritical: { normalMin: 235, normalMax: 250, alarmSetpoint: 260, tripSetpoint: 270 },
      'ultra-supercritical': { normalMin: 260, normalMax: 300, alarmSetpoint: 310, tripSetpoint: 325 },
    } },
  { id: 'mft-superheater-temp-hh', system: 'MFT', category: 'Steam Protection', label: 'Superheater Outlet Temperature HIGH-HIGH', unit: '°C',
    applicability: 'all', normalMin: 500, normalMax: 545, alarmSetpoint: 570, tripSetpoint: 590, direction: 'high',
    timeDelaySec: 20, voting: '2oo3', tripAction: 'MFT — protect superheater tube metallurgy', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'OEM Reference',
    source: 'One documented 660MW supercritical boiler (Doosan-supplied): SH outlet temperature high for >20s at 590\u00b0C. Single documented unit, not a cross-OEM standard. Subcritical/ultra-supercritical tiers are generic industry-typical figures, not from the same source.',
    plantTypeVariants: {
      subcritical: { normalMin: 500, normalMax: 535, alarmSetpoint: 545, tripSetpoint: 555 },
      supercritical: { normalMin: 500, normalMax: 545, alarmSetpoint: 570, tripSetpoint: 590 },
      'ultra-supercritical': { normalMin: 570, normalMax: 605, alarmSetpoint: 615, tripSetpoint: 625 },
    } },
  { id: 'mft-reheater-temp-hh', system: 'MFT', category: 'Steam Protection', label: 'Reheater Outlet Temperature HIGH-HIGH', unit: '°C',
    applicability: 'all', normalMin: 500, normalMax: 545, alarmSetpoint: 570, tripSetpoint: 590, direction: 'high',
    timeDelaySec: 20, voting: '2oo3', tripAction: 'MFT — protect reheater tube metallurgy', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'OEM Reference',
    source: 'Same documented 660MW supercritical boiler as the superheater entry above — RH outlet temperature high for >20s at 590\u00b0C. Subcritical/ultra-supercritical tiers are generic industry-typical figures, not from the same source.',
    plantTypeVariants: {
      subcritical: { normalMin: 500, normalMax: 535, alarmSetpoint: 545, tripSetpoint: 555 },
      supercritical: { normalMin: 500, normalMax: 545, alarmSetpoint: 570, tripSetpoint: 590 },
      'ultra-supercritical': { normalMin: 575, normalMax: 610, alarmSetpoint: 618, tripSetpoint: 628 },
    } },
  { id: 'mft-feedwater-temp-ll', system: 'MFT', category: 'Steam Protection', label: 'Feedwater Temperature LOW', unit: '°C',
    applicability: 'all', normalMin: 250, normalMax: 300, alarmSetpoint: 230, tripSetpoint: 210, direction: 'low',
    timeDelaySec: 10, voting: '2oo3', tripAction: 'MFT/runback — sudden feedwater temperature drop causes severe thermal stress on once-through boiler tubes, especially at USC pressures/wall thicknesses', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference',
    plantTypeVariants: {
      subcritical: { normalMin: 210, normalMax: 250, alarmSetpoint: 190, tripSetpoint: 175 },
      supercritical: { normalMin: 260, normalMax: 290, alarmSetpoint: 240, tripSetpoint: 220 },
      'ultra-supercritical': { normalMin: 290, normalMax: 320, alarmSetpoint: 270, tripSetpoint: 250 },
    } },
  { id: 'mft-attemperation-spray-hh', system: 'MFT', category: 'Steam Protection', label: 'SH/RH Attemperation Spray Flow HIGH', unit: '% of steam flow',
    applicability: 'all', normalMin: 0, normalMax: 8, alarmSetpoint: 12, tripSetpoint: 18, direction: 'high',
    timeDelaySec: 15, voting: '1oo2', tripAction: 'Alarm/runback — sustained high spray flow indicates the boiler cannot control outlet temperature by firing alone, risking tube thermal fatigue; more safety-critical at USC\u2019s tighter metallurgical margins than at subcritical', resetCondition: 'Spray flow normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference',
    plantTypeVariants: {
      subcritical: { normalMin: 0, normalMax: 10, alarmSetpoint: 15, tripSetpoint: 22 },
      supercritical: { normalMin: 0, normalMax: 8, alarmSetpoint: 12, tripSetpoint: 18 },
      'ultra-supercritical': { normalMin: 0, normalMax: 6, alarmSetpoint: 9, tripSetpoint: 14 },
    } },
  { id: 'mft-steam-temp-rate-of-change-hh', system: 'MFT', category: 'Steam Protection', label: 'Main Steam Temperature Rate-of-Change HIGH', unit: '°C/min',
    applicability: 'all', normalMin: 0, normalMax: 3, alarmSetpoint: 5, tripSetpoint: 8, direction: 'high',
    timeDelaySec: 30, voting: '1oo2', tripAction: 'Runback/alarm — rapid temperature ramping causes thermal-fatigue cycling in thick-walled headers and turbine rotors; advanced high-chromium USC alloys generally have tighter allowable ramp rates than conventional subcritical steels', resetCondition: 'Rate normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference',
    plantTypeVariants: {
      subcritical: { normalMin: 0, normalMax: 4, alarmSetpoint: 7, tripSetpoint: 11 },
      supercritical: { normalMin: 0, normalMax: 3, alarmSetpoint: 5, tripSetpoint: 8 },
      'ultra-supercritical': { normalMin: 0, normalMax: 2, alarmSetpoint: 3.5, tripSetpoint: 6 },
    } },
  { id: 'mft-drum-pressure-hh', system: 'MFT', category: 'Steam Protection', label: 'Steam Drum Pressure HIGH-HIGH', unit: 'bar',
    applicability: 'drum', normalMin: 150, normalMax: 178, alarmSetpoint: 188, tripSetpoint: 198, direction: 'high',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'MFT — drum overpressure protection, distinct from and typically set tighter than the main steam line protection downstream (in addition to drum safety valves)', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None — safety trip', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-sh-differential-pressure-hh', system: 'MFT', category: 'Steam Protection', label: 'Superheater/Reheater Differential Pressure HIGH', unit: '% of design',
    applicability: 'all', normalMin: 90, normalMax: 105, alarmSetpoint: 115, tripSetpoint: 130, direction: 'high',
    timeDelaySec: 20, voting: '1oo2', tripAction: 'Alarm/runback — rising differential pressure across a superheater/reheater bank indicates tube blockage or scaling, risking localized overheating downstream of the restriction', resetCondition: 'Differential normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-flue-gas-outlet-temp-hh', system: 'MFT', category: 'Steam Protection', label: 'Flue Gas Outlet Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 120, normalMax: 150, alarmSetpoint: 165, tripSetpoint: 180, direction: 'high',
    timeDelaySec: 30, voting: '1oo2', tripAction: 'Alarm/runback — protects downstream ESP/SCR/ductwork and indicates abnormal combustion or heat-transfer surface fouling; sustained high flue gas temperature also signals falling boiler efficiency', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-economizer-recirc-flow-ll', system: 'MFT', category: 'Feedwater/Boiler', label: 'Economizer Recirculation Flow LOW', unit: '% required',
    applicability: 'once-through', normalMin: 95, normalMax: 105, alarmSetpoint: 70, tripSetpoint: 50, direction: 'low',
    timeDelaySec: 10, voting: '2oo3', tripAction: 'MFT/runback — at low load before minimum through-flow is established, once-through boilers rely on economizer recirculation to prevent steaming/dry-out in the water-wall circuit', resetCondition: 'Flow restored, manual reset',
    permissive: 'Active only below minimum through-flow load, per C&E', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'ets-extraction-nrv-fail', system: 'ETS', category: 'Turbine Mechanical', label: 'Extraction/Bleed Steam Non-Return Valve Fail-to-Close', unit: 'boolean',
    applicability: 'all', normalMin: 0, normalMax: 0, alarmSetpoint: 1, tripSetpoint: 1, direction: 'high',
    timeDelaySec: 0, voting: '1oo1 (per extraction line)', tripAction: 'ETS trip — a failed extraction non-return valve on a turbine trip allows stored steam/water in the feedwater heater and piping to flow back into the turbine, risking water induction and blade damage; these valves are spring-assisted to close on trip and/or high heater level', resetCondition: 'Valve confirmed closed, manual reset',
    permissive: 'None — safety trip', classification: 'ETS', dataType: 'Public Reference' },
  { id: 'mft-fw-heater-level-hh', system: 'MFT', category: 'Feedwater/Boiler', label: 'Feedwater Heater Level HIGH-HIGH', unit: 'mm',
    applicability: 'all', normalMin: -50, normalMax: 50, alarmSetpoint: 100, tripSetpoint: 150, direction: 'high',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'Heater isolation + extraction NRV close — high level risks carrying water into the extraction line and back toward the turbine; each HP heater is monitored independently', resetCondition: 'Level normal, manual reset',
    permissive: 'None — equipment protection', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-deaerator-level-ll', system: 'MFT', category: 'Feedwater/Boiler', label: 'Deaerator Storage Tank Level LOW-LOW', unit: 'mm',
    applicability: 'all', normalMin: -100, normalMax: 100, alarmSetpoint: -250, tripSetpoint: -350, direction: 'low',
    timeDelaySec: 5, voting: '2oo3', tripAction: 'BFP trip — the deaerator storage tank is the sole suction source for the boiler feed pumps; running it dry breaks suction and risks pump cavitation/damage', resetCondition: 'Level restored, manual reset',
    permissive: 'None — pump protection', classification: 'MFT', dataType: 'Public Reference' },
  { id: 'mft-deaerator-pressure-hh', system: 'MFT', category: 'Feedwater/Boiler', label: 'Deaerator Pressure HIGH', unit: 'bar',
    applicability: 'all', normalMin: 4, normalMax: 6, alarmSetpoint: 8.5, tripSetpoint: 10, direction: 'high',
    timeDelaySec: 5, voting: '1oo2', tripAction: 'Auto-dump valve opens to vent to condenser before the safety valve lifts; sustained high pressure alarms/runs back auxiliary steam supply', resetCondition: 'Pressure normal, manual reset',
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

  // ================= AUXILIARY DRIVE PROTECTION =================
  // Individual protection for the major rotating auxiliaries — distinct
  // from the boiler/turbine/generator protection above. Generic, illustrative
  // typical practice (winding/bearing temperature, overload, low flow/suction)
  // — not sourced from any specific OEM's relay or motor protection manual.
  // Downstream boiler-wide consequences (runback/MFT if redundancy is lost)
  // are noted in tripAction but are themselves C&E-dependent.

  // ---------------- FD Fan ----------------
  { id: 'aux-fdfan-winding-temp', system: 'FD Fan', category: 'Auxiliary Drive', label: 'FD Fan Motor Winding Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 120, alarmSetpoint: 130, tripSetpoint: 155, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'FD fan trip — standby FD fan auto-start per interlock; runback/MFT if both FD fans lost, per C&E', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-fdfan-bearing-temp', system: 'FD Fan', category: 'Auxiliary Drive', label: 'FD Fan Bearing Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 85, alarmSetpoint: 90, tripSetpoint: 100, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'FD fan trip — standby FD fan auto-start per interlock', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-fdfan-overload', system: 'FD Fan', category: 'Auxiliary Drive', label: 'FD Fan Motor Overload/Overcurrent', unit: '% FLC',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: 105, tripSetpoint: 115, direction: 'high',
    timeDelaySec: 3, voting: '1oo1', tripAction: 'FD fan trip — standby FD fan auto-start per interlock', resetCondition: 'Current normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },

  // ---------------- ID Fan ----------------
  { id: 'aux-idfan-winding-temp', system: 'ID Fan', category: 'Auxiliary Drive', label: 'ID Fan Motor Winding Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 120, alarmSetpoint: 130, tripSetpoint: 155, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'ID fan trip — standby ID fan auto-start per interlock; MFT if furnace draft cannot be maintained, per C&E', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-idfan-bearing-temp', system: 'ID Fan', category: 'Auxiliary Drive', label: 'ID Fan Bearing Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 85, alarmSetpoint: 90, tripSetpoint: 100, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'ID fan trip — standby ID fan auto-start per interlock', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-idfan-overload', system: 'ID Fan', category: 'Auxiliary Drive', label: 'ID Fan Motor Overload/Overcurrent', unit: '% FLC',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: 105, tripSetpoint: 115, direction: 'high',
    timeDelaySec: 3, voting: '1oo1', tripAction: 'ID fan trip — standby ID fan auto-start per interlock', resetCondition: 'Current normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },

  // ---------------- PA Fan ----------------
  { id: 'aux-pafan-winding-temp', system: 'PA Fan', category: 'Auxiliary Drive', label: 'PA Fan Motor Winding Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 120, alarmSetpoint: 130, tripSetpoint: 155, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'PA fan trip — standby PA fan auto-start per interlock; associated mills may trip if PA header pressure lost, per C&E', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-pafan-overload', system: 'PA Fan', category: 'Auxiliary Drive', label: 'PA Fan Motor Overload/Overcurrent', unit: '% FLC',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: 105, tripSetpoint: 115, direction: 'high',
    timeDelaySec: 3, voting: '1oo1', tripAction: 'PA fan trip — standby PA fan auto-start per interlock', resetCondition: 'Current normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },

  // ---------------- Mill / Pulverizer ----------------
  { id: 'aux-mill-outlet-temp', system: 'Mill', category: 'Auxiliary Drive', label: 'Mill Outlet Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 60, normalMax: 90, alarmSetpoint: 95, tripSetpoint: 105, direction: 'high',
    timeDelaySec: 0, voting: '1oo1 (per mill)', tripAction: 'Mill trip — associated feeder trips; fire/explosion risk protection', resetCondition: 'Temperature normal, manual reset, mill inerted per procedure',
    permissive: 'None — safety trip', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-mill-overload', system: 'Mill', category: 'Auxiliary Drive', label: 'Mill Motor Overload', unit: '% FLC',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: 105, tripSetpoint: 115, direction: 'high',
    timeDelaySec: 3, voting: '1oo1 (per mill)', tripAction: 'Mill trip — associated feeder trips; boiler runback per C&E if firing capacity significantly reduced', resetCondition: 'Current normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-mill-bearing-temp', system: 'Mill', category: 'Auxiliary Drive', label: 'Mill Bearing/Gearbox Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 85, alarmSetpoint: 90, tripSetpoint: 100, direction: 'high',
    timeDelaySec: 0, voting: '1oo1 (per mill)', tripAction: 'Mill trip — associated feeder trips', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },

  // ---------------- APH (Air Preheater) ----------------
  { id: 'aux-aph-diff-pressure', system: 'APH', category: 'Auxiliary Drive', label: 'APH Differential Pressure HIGH', unit: 'mmWC',
    applicability: 'all', normalMin: 100, normalMax: 200, alarmSetpoint: 250, tripSetpoint: 300, direction: 'high',
    timeDelaySec: 5, voting: '1oo2', tripAction: 'APH fire-risk alarm/trip sequence per C&E — potential unit runback; water wash/soot-blow procedure initiated', resetCondition: 'DP normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-aph-bearing-temp', system: 'APH', category: 'Auxiliary Drive', label: 'APH Support/Guide Bearing Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 80, alarmSetpoint: 85, tripSetpoint: 95, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'APH rotation trip — boiler runback per C&E (draft/air-heating impact)', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },

  // ---------------- CW Pump (Circulating Water) ----------------
  { id: 'aux-cwpump-overload', system: 'CW Pump', category: 'Auxiliary Drive', label: 'CW Pump Motor Overload', unit: '% FLC',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: 105, tripSetpoint: 115, direction: 'high',
    timeDelaySec: 3, voting: '1oo1', tripAction: 'CW pump trip — standby CW pump auto-start per interlock; condenser vacuum impact if redundancy lost', resetCondition: 'Current normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-cwpump-bearing-temp', system: 'CW Pump', category: 'Auxiliary Drive', label: 'CW Pump Bearing Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 80, alarmSetpoint: 85, tripSetpoint: 95, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'CW pump trip — standby CW pump auto-start per interlock', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },

  // ---------------- ACW Pump (Auxiliary Cooling Water) ----------------
  { id: 'aux-acwpump-overload', system: 'ACW Pump', category: 'Auxiliary Drive', label: 'ACW Pump Motor Overload', unit: '% FLC',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: 105, tripSetpoint: 115, direction: 'high',
    timeDelaySec: 3, voting: '1oo1', tripAction: 'ACW pump trip — standby ACW pump auto-start per interlock; auxiliary cooling loss risk if redundancy lost', resetCondition: 'Current normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },

  // ---------------- CEP (Condensate Extraction Pump) ----------------
  { id: 'aux-cep-low-hotwell', system: 'CEP', category: 'Auxiliary Drive', label: 'Hotwell Level LOW-LOW (CEP suction)', unit: 'mm',
    applicability: 'all', normalMin: -100, normalMax: 100, alarmSetpoint: -200, tripSetpoint: -300, direction: 'low',
    timeDelaySec: 3, voting: '2oo3', tripAction: 'CEP trip on low suction to prevent cavitation — standby CEP auto-start per interlock', resetCondition: 'Level normal, manual reset',
    permissive: 'None — pump protection', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-cep-overload', system: 'CEP', category: 'Auxiliary Drive', label: 'CEP Motor Overload', unit: '% FLC',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: 105, tripSetpoint: 115, direction: 'high',
    timeDelaySec: 3, voting: '1oo1', tripAction: 'CEP trip — standby CEP auto-start per interlock', resetCondition: 'Current normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },

  // ---------------- MDBFP (Motor-Driven Boiler Feed Pump) ----------------
  { id: 'aux-mdbfp-suction-pressure', system: 'MDBFP', category: 'Auxiliary Drive', label: 'MDBFP Suction Pressure LOW-LOW', unit: 'bar',
    applicability: 'all', normalMin: 5, normalMax: 8, alarmSetpoint: 4, tripSetpoint: 3, direction: 'low',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'MDBFP trip on low suction to prevent cavitation — standby BFP auto-start per interlock; runback if feedwater capacity reduced, per C&E', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None — pump protection', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-mdbfp-thrust-bearing-temp', system: 'MDBFP', category: 'Auxiliary Drive', label: 'MDBFP Thrust Bearing Temperature HIGH', unit: '°C',
    applicability: 'all', normalMin: 40, normalMax: 90, alarmSetpoint: 95, tripSetpoint: 105, direction: 'high',
    timeDelaySec: 0, voting: '1oo1', tripAction: 'MDBFP trip — standby BFP auto-start per interlock', resetCondition: 'Temperature normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-mdbfp-overload', system: 'MDBFP', category: 'Auxiliary Drive', label: 'MDBFP Motor Overload', unit: '% FLC',
    applicability: 'all', normalMin: 0, normalMax: 100, alarmSetpoint: 105, tripSetpoint: 115, direction: 'high',
    timeDelaySec: 3, voting: '1oo1', tripAction: 'MDBFP trip — standby BFP auto-start per interlock', resetCondition: 'Current normal, manual reset',
    permissive: 'None', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-bfp-discharge-pressure-hh', system: 'MDBFP', category: 'Auxiliary Drive', label: 'BFP Discharge Pressure HIGH-HIGH', unit: 'bar',
    applicability: 'all', normalMin: 180, normalMax: 220, alarmSetpoint: 235, tripSetpoint: 250, direction: 'high',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'BFP trip — overpressure protection for the pump and feedwater piping; USC units run feed pumps at much higher discharge pressure than subcritical, so this trip band scales with plant type', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None — pump/piping protection', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference',
    plantTypeVariants: {
      subcritical: { normalMin: 160, normalMax: 190, alarmSetpoint: 200, tripSetpoint: 215 },
      supercritical: { normalMin: 260, normalMax: 290, alarmSetpoint: 300, tripSetpoint: 315 },
      'ultra-supercritical': { normalMin: 290, normalMax: 330, alarmSetpoint: 345, tripSetpoint: 360 },
    } },


  // ---------------- TDBFP (Turbine-Driven Boiler Feed Pump) ----------------
  { id: 'aux-tdbfp-overspeed', system: 'TDBFP', category: 'Auxiliary Drive', label: 'TDBFP Driving Turbine Overspeed', unit: '% rated speed',
    applicability: 'all', normalMin: 95, normalMax: 100, alarmSetpoint: 105, tripSetpoint: 110, direction: 'high',
    timeDelaySec: 0, voting: '2oo3', tripAction: 'TDBFP trip — standby BFP auto-start per interlock; runback if feedwater capacity reduced, per C&E', resetCondition: 'Speed below reset threshold, manual reset',
    permissive: 'None — safety trip', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-tdbfp-lube-oil', system: 'TDBFP', category: 'Auxiliary Drive', label: 'TDBFP Low Lube-Oil Pressure', unit: 'bar',
    applicability: 'all', normalMin: 1.5, normalMax: 3, alarmSetpoint: 1.0, tripSetpoint: 0.7, direction: 'low',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'TDBFP trip — standby BFP auto-start per interlock', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None — safety trip', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
  { id: 'aux-tdbfp-suction-pressure', system: 'TDBFP', category: 'Auxiliary Drive', label: 'TDBFP Suction Pressure LOW-LOW', unit: 'bar',
    applicability: 'all', normalMin: 5, normalMax: 8, alarmSetpoint: 4, tripSetpoint: 3, direction: 'low',
    timeDelaySec: 2, voting: '2oo3', tripAction: 'TDBFP trip on low suction to prevent cavitation — standby BFP auto-start per interlock', resetCondition: 'Pressure normal, manual reset',
    permissive: 'None — pump protection', classification: 'AUXILIARY DRIVE', dataType: 'Public Reference' },
];

export function parametersFor(boilerType) {
  return PARAMETER_REGISTRY.filter((p) => p.applicability === 'all' || p.applicability === boilerType);
}

/**
 * Applies a parameter's plant-type-specific setpoint tier, when it has one
 * (see plantTypeVariants on individual registry entries — currently the
 * main steam-condition parameters where subcritical/supercritical/USC
 * genuinely differ). Falls back to the base entry unchanged for parameters
 * without a variant (most auxiliary-drive and mechanical protections don't
 * meaningfully scale with plant type). Ultra-supercritical is always
 * once-through by design (above the critical point, there is no drum-type
 * liquid/vapor separation) — this function does not enforce that itself,
 * the caller should, since it's a UI/config concern, not a parameter-value one.
 */
export function applyPlantType(param, plantType) {
  const variant = param.plantTypeVariants && param.plantTypeVariants[plantType];
  return variant ? { ...param, ...variant } : param;
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

/**
 * "What happens to each major system" after a turbine trip — general,
 * typical responses. Deliberately not tied to a specific initiating cause;
 * see CAUSE_ACTION_DIARY below for cause-specific rows, and note there too
 * that the exact behavior is always unit/OEM/C&E-specific.
 */
export const GENERAL_SYSTEM_RESPONSE = [
  { system: 'Turbine ETS/TSI', response: 'Trip latches; steam valves close; turbine coasts down' },
  { system: 'Generator', response: 'Generator breaker normally opens for a full turbine trip; excitation/field action depends on protection scheme' },
  { system: 'Boiler', response: 'Usually rapid fuel reduction/runback; MFT if required by C&E' },
  { system: 'Coal mills', response: 'Selected/all mills may trip depending on MFT philosophy and boiler condition' },
  { system: 'FD fans', response: 'Normally continue if boiler remains in service; if MFT occurs, fan operation follows post-MFT logic' },
  { system: 'ID fans', response: 'Normally continue for furnace purge/draft control; post-MFT logic determines final state' },
  { system: 'PA fans', response: 'Continue or trip according to mill/fuel/MFT logic' },
  { system: 'BFP / MDBFP', response: 'Normally continue initially; feedwater control changes with load/boiler state' },
  { system: 'TDBFP', response: 'May continue or trip depending on boiler/turbine-trip cause and C&E' },
  { system: 'CEP', response: 'Normally remains running to maintain condensate/hotwell system' },
  { system: 'CW pumps', response: 'Normally remain running to maintain condenser cooling' },
  { system: 'ACW pumps', response: 'Normally remain running for auxiliary cooling' },
  { system: 'Booster pumps', response: 'Continue according to required auxiliary-system cooling/feedwater logic' },
  { system: 'Condenser', response: 'Vacuum must be maintained; exhaust steam conditions change rapidly' },
  { system: 'HP/LP heaters', response: 'Heater extraction supply disappears; drains/bypass protection operates' },
  { system: 'Deaerator', response: 'Pressure/level control changes; auxiliary steam/source changes' },
  { system: 'HP bypass', response: 'Usually opens to route steam to condenser/reheater, depending on design' },
  { system: 'LP bypass', response: 'May operate depending on turbine/bypass philosophy' },
  { system: 'Main steam', response: 'Turbine admission stops; boiler pressure control/bypass takes over' },
  { system: 'Reheat system', response: 'Reheat steam flow collapses; bypass/protection operates' },
  { system: 'MFT/FSSS', response: 'May trip if the turbine-trip cause is an MFT cause or boiler protection becomes unsafe' },
  { system: 'Flame scanners', response: 'Monitor flame; if fuel is isolated, flame loss is expected' },
  { system: 'Mills/feeders', response: 'Fuel isolation/trip follows MFT or runback logic' },
  { system: 'APH', response: 'Generally continue rotating unless another protection trips them' },
  { system: 'Generator seal oil', response: 'Normally maintained during generator coast-down' },
  { system: 'Generator H\u2082 cooling', response: 'Normally maintained until generator is safely taken out of service' },
  { system: 'Stator cooling water', response: 'Normally maintained during shutdown/coast-down' },
  { system: 'Transformer', response: 'Unit transformer remains energized/de-energized according to breaker/excitation scheme' },
  { system: 'UAT/SAT', response: 'Auxiliary power transfers according to plant electrical scheme' },
  { system: 'Emergency oil/AOP', response: 'Starts automatically if lube-oil pressure falls below its start setting' },
  { system: 'Turning gear', response: 'Engages only after speed/conditions meet permissive requirements' },
];

/**
 * The three general turbine-trip scenarios, as cause-and-effect chains for
 * the diary view. These describe the *shape* of each scenario; the exact
 * wiring for any specific cause must come from the unit's approved C&E.
 */
export const TRIP_SCENARIOS = [
  {
    title: '1. Turbine trip only',
    chain: ['Turbine trip', 'Steam valves CLOSE', 'Generator breaker OPEN', 'Boiler RUNBACK / steam bypass', 'Auxiliaries remain available'],
    note: 'The boiler may remain firing at reduced load if the unit control philosophy permits it.',
  },
  {
    title: '2. Turbine trip + MFT',
    chain: ['Turbine trip', 'MFT', 'Fuel OFF / Mill-feeder trip / Oil valves CLOSE', 'Flame disappears', 'Boiler purge'],
    note: 'The boiler then goes through the prescribed post-MFT purge/restart sequence.',
  },
  {
    title: '3. Turbine trip caused by a serious generator/electrical fault',
    chain: ['87G Generator Differential (example)', 'Generator trip', 'Generator breaker OPEN', 'Excitation trip', 'Turbine trip', 'Boiler runback / MFT', 'Auxiliary power transfer'],
    note: 'The exact sequence depends heavily on whether the initiating protection is 87G, 40, 32, 46, 50/51, 50BF, transformer protection, turbine ETS, overspeed, vacuum, etc.',
  },
];

/**
 * Recommended Cause & Action Diary columns, per the source guidance — the
 * full set a unit's own C&E-derived diary should track. Shown as a template
 * header; only the worked-example rows below (CAUSE_ACTION_DIARY) have
 * actual illustrative values filled in, since the full grid must come from
 * the unit's approved C&E/ETS/FSSS drawings, not be assumed generically.
 */
export const CAUSE_ACTION_DIARY_COLUMNS = [
  'Trip Cause', 'ETS', 'MSV', 'CV', 'RSV/IV', 'Generator Breaker', 'Excitation', 'MFT',
  'Mills', 'FD', 'ID', 'PA', 'BFP', 'CEP', 'CW', 'ACW', 'Bypass', 'HP Heaters', 'UAT/SAT',
  'Emergency Oil', 'Turning Gear',
];

/** Worked example rows for the Cause & Action Diary — illustrative only. */
export const CAUSE_ACTION_DIARY = [
  { cause: 'Overspeed', turbine: 'Trip', generator: 'Breaker open', mft: 'C&E dependent', mills: 'C&E dependent', bfp: 'C&E dependent', cep: 'Run', cw: 'Run', bypass: 'Open' },
  { cause: 'Low lube oil', turbine: 'Trip', generator: 'Breaker open', mft: 'C&E dependent', mills: 'C&E dependent', bfp: 'C&E dependent', cep: 'Run', cw: 'Run', bypass: 'Open' },
  { cause: 'Generator 87G', turbine: 'Trip', generator: 'Breaker open', mft: 'Usually downstream boiler action', mills: 'Fuel reduction/MFT per C&E', bfp: 'Run/trip per C&E', cep: 'Run', cw: 'Run', bypass: 'Open' },
  { cause: 'Turbine vacuum low-low', turbine: 'Trip', generator: 'Breaker open', mft: 'C&E dependent', mills: 'C&E dependent', bfp: 'Run/trip', cep: 'Run', cw: 'Run', bypass: 'Design dependent' },
  { cause: 'Manual turbine trip', turbine: 'Trip', generator: 'Breaker open', mft: 'Usually no automatic MFT unless C&E says so', mills: 'Runback/trip logic', bfp: 'Run', cep: 'Run', cw: 'Run', bypass: 'Open' },
];

/**
 * Master list of initiating trip causes for the full Cause & Effect Matrix —
 * the 26 turbine-trip causes and 21 generator/electrical protection codes.
 * These are the *names* of the causes a real diary should cover; this list
 * does not itself claim any specific plant's response to them — that's what
 * the fillable Trip Diary (CAUSE_ACTION_DIARY, user-entered, in the app) and
 * RESEARCHED_EXAMPLES below are for, kept explicitly separate.
 */
export const MASTER_TRIP_CAUSES = {
  'Turbine': [
    'Turbine overspeed', 'Emergency governor trip', 'Axial displacement', 'Differential expansion',
    'Rotor eccentricity', 'High shaft vibration', 'High bearing vibration', 'High bearing metal temperature',
    'Thrust bearing temperature', 'Low lube-oil pressure', 'Low EH/control oil pressure', 'Low trip-oil pressure',
    'Low condenser vacuum', 'High condenser pressure', 'High exhaust temperature', 'HP exhaust temperature',
    'LP exhaust temperature', 'Manual turbine trip', 'ETS channel failure', 'TSI protection trip',
    'Loss of turbine control', 'Valve position abnormality', 'Main steam protection', 'Reheat steam protection',
    'Turbine differential pressure protection', 'Generator-related turbine trip',
  ],
  'Generator / Electrical': [
    '87G \u2013 Generator differential', '64G \u2013 Generator earth fault', '64F \u2013 Rotor earth fault',
    '40 \u2013 Loss of excitation', '32 \u2013 Reverse power', '46 \u2013 Negative sequence', '27 \u2013 Undervoltage',
    '59 \u2013 Overvoltage', '81U \u2013 Underfrequency', '81O \u2013 Overfrequency', '24 \u2013 V/Hz',
    '78 \u2013 Out-of-step', '21 \u2013 Generator impedance', '50/51 \u2013 Overcurrent', '50N/51N \u2013 Earth fault',
    '50BF \u2013 Breaker failure', '86G \u2013 Generator lockout', '87T \u2013 Transformer differential',
    '64T \u2013 Transformer earth fault', '63 \u2013 Transformer Buchholz/sudden pressure', '86T \u2013 Transformer lockout',
    '87B \u2013 Bus differential',
  ],
};

/** The A\u2013M matrix categories requested for filtering the live diary. */
export const DIARY_CATEGORIES = [
  'A. Turbine Trip', 'B. Generator Trip', 'C. Generator Differential (87G)', 'D. Transformer Trip',
  'E. MFT', 'F. Boiler Trip', 'G. Breaker Failure (50BF)', 'H. Loss of Auxiliary Power',
  'I. Loss of Condenser Vacuum', 'J. Overspeed', 'K. Low Lube Oil', 'L. High Vibration',
  'M. Electrical Protection', 'Other',
];

/**
 * Genuinely-found reference examples from public sources, kept explicitly
 * separate from the user's own live diary entries. Each is paraphrased (not
 * quoted) and attributed. "confidence" reflects how directly sourced vs.
 * general/typical the entry is — never claim these are verified for any
 * specific real plant beyond what's cited.
 */
export const RESEARCHED_EXAMPLES = [
  {
    cause: '87G \u2013 Generator differential',
    category: 'C. Generator Differential (87G)',
    summary: 'Widely documented as an instantaneous, high-speed protection: on a genuine internal stator fault it simultaneously trips the generator breaker, the field/excitation, and the turbine. Typical pickup sensitivity is commonly cited in the 5\u201310% of full-load-current range, or as a percentage-restraint (bias) slope around 15\u201320% \u2014 general industry practice, not one specific plant\u2019s verified setting.',
    oem: 'Multiple (general relay practice)', unitMW: 'Not size-specific', scUsc: 'Not size-specific',
    source: 'relayprotect.com \u2014 Generator Differential Protection Relay (87G); pecplc.com \u2014 Nuisance Generator Differential Protection Trips in Real Time Situations',
    page: 'N/A (web articles)', confidence: 'General/typical \u2014 not a specific plant\u2019s verified setting',
  },
  {
    cause: 'MFT (multiple conditions)',
    category: 'E. MFT',
    summary: 'One publicly shared 660 MW supercritical boiler (Doosan-supplied) training document lists numeric MFT conditions including both ID fans off, both FD fans off, unit air flow below 30% TMCR, all feedwater pumps off for more than 40 seconds, and 2-out-of-3 furnace pressure transmitters reading high/low for more than 8 seconds at approximately +150/\u2013180 mmWC (high\u2013high/low\u2013low at approximately +250/\u2013250 mmWC), among other conditions. This is one specific shared document, not a verified cross-OEM standard \u2014 treat it as illustrative of the type of conditions a real MFT logic covers, not as your own plant\u2019s settings.',
    oem: 'Doosan (as shared in the source)', unitMW: '660', scUsc: 'Supercritical',
    source: 'SlideShare \u2014 "660 MW supercritical boiler" (uploaded training/technical slides)',
    page: 'N/A (slide deck, page numbers not shown)', confidence: 'Single documented unit \u2014 verify independently before use',
  },
  {
    cause: 'Turbine overspeed / multiple turbine trip causes',
    category: 'A. Turbine Trip',
    summary: 'A publicly shared training slide deck lists a KWU (Siemens-legacy) 500 MW steam turbine\u2019s trip causes at a title level \u2014 overspeed (hydraulic and electronic), manual trip, axial shift, HP exhaust temperature high, turbine/generator bearing temperature high, condenser pressure trip, low main oil tank level, low main steam temperature, generator electrical and mechanical protection, MFT relay operated, and HP/IP/LP casing top-bottom differential high, among others \u2014 without published numeric setpoints in what\u2019s publicly visible.',
    oem: 'KWU / Siemens (legacy)', unitMW: '500', scUsc: 'Not stated in source',
    source: 'SlideShare \u2014 "Unit Protection Scheme" (uploaded training slides referencing KWU 500MW, LMZ Russia 660MW, and Harbin 600MW turbines)',
    page: 'N/A (slide deck)', confidence: 'Cause list only \u2014 no numeric setpoints published in this source',
  },
];

/**
 * Sources located during research for this matrix, logged for the user's
 * own follow-up and verification \u2014 not a claim that these are
 * authoritative, current, or complete.
 */
export const SOURCE_REGISTER = [
  { title: 'Generator Differential Protection Relay: Working Principle, Applications, Settings and Engineering Challenges', url: 'https://relayprotect.com/generator-differential-protection-relay/', note: 'General 87G principles and typical settings ranges.' },
  { title: 'Nuisance Generator Differential Protection Trips in Real Time Situations', url: 'http://www.pecplc.com/index.php/articles/nuisance-generator-differential-protection-trips-in-real-time-situations', note: '87G trip behavior (excitation/breaker/turbine) and a real through-fault nuisance-trip case study.' },
  { title: '"Unit Protection Scheme" (uploaded slides referencing KWU 500MW, LMZ Russia 660MW, Harbin 600MW)', url: 'https://slideshare.net/SHIVAJICHOUDHURY/unit-protection-scheme', note: 'Turbine/boiler trip cause lists by unit; largely titles only, few numeric setpoints visible.' },
  { title: '"660 MW supercritical boiler" (uploaded slides, Doosan boiler)', url: 'https://www.slideshare.net/slideshow/660-mw-supercritical-boiler/59314382', note: 'Numeric MFT conditions for one specific 660MW supercritical unit.' },
  { title: 'PCS-985 Generator Transformer Unit Protection Relay', url: 'https://www.electric-valveactuator.com/sale-321211-pcs-985-generator-transformer-unit-protection-relay-87g-differential-protection.html', note: 'Relay function list (ANSI codes) typically bundled in a generator-transformer protection package \u2014 not plant-specific settings.' },
  { title: 'Single Line Diagram for Generator and Gen. Protection & Metering (660 MW)', url: 'https://pdfcoffee.com/single-line-diagram-for-generator-and-gen-protection-amp-metering-660-mw-pdf-free.html', note: 'CT ratios and protection function list for one 660MW generator protection scheme; uploaded document, provenance unverified.' },
  { title: 'Extraction Check Valve / Non-Return Valve product literature', url: 'https://www.s-k.com/valves/check-valves/', note: 'Confirms extraction NRVs are used as turbine bleeder protection with power-assisted close on trip.' },
  { title: 'Steam Supply & Feedwater training text (CANTEACH library)', url: 'https://canteach.candu.org/Content%20Library/19930205.pdf', note: 'Confirms HP heater extraction check valves close on turbine trip and/or high heater level; deaerator storage tank sizing/elevation and minimum feedwater temperature (~130\u00b0C) for boiler protection.' },
  { title: 'Boiler Feed Pump \u2014 ScienceDirect Topics overview', url: 'https://www.sciencedirect.com/topics/engineering/boiler-feed-pump', note: 'Deaerator storage tank as sole BFP suction source and NPSH margin.' },
];
