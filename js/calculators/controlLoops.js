// controlLoops.js — the major control loops of a thermal power plant,
// defined as node/edge graphs so they can be drawn and animated.
//
// Every loop structure here is taken from published control-engineering
// descriptions, not invented. Sources are named per loop in `sources`.
// Setpoint VALUES are illustrative starting points for the simulation —
// real setpoints are plant-specific and come from the unit's own design
// documents. The STRUCTURE (what feeds what, which blocks exist, cascade
// vs feedforward vs select) is the part that is genuinely standard.
//
// Node types drive how each block is drawn:
//   sensor      — a measurement (transmitter)
//   controller  — a PID block
//   compute     — a function block (sum, multiply, select, ratio, f(x))
//   actuator    — a final control element (valve, damper, drive)
//   process     — the physical process being controlled
//   demand      — an external demand/setpoint input

import { Lag, DeadTime, Integrator, RateLimit, PID, InverseResponse, clamp } from './loopDynamics.js';

export const LOOP_IDS = [
  'drum-level-3e',
  'combustion-cross-limit',
  'steam-temp-cascade',
  'mill-control',
  'furnace-draft',
  'coordinated-master',
  'turbine-bypass',
  'deaerator-level',
  'hp-heater-level',
  'condenser-hotwell',
  'avr-excitation',
];

export const CONTROL_LOOPS = {

  // ------------------------------------------------------------------
  'drum-level-3e': {
    name: 'Three-Element Drum Level Control',
    system: 'Feedwater',
    difficulty: 'Core',
    why: 'The single most important — and most misunderstood — loop on a drum boiler. Level must be held tight: too low uncovers tubes and overheats them, too high carries water into the turbine.',
    problem: 'Shrink and swell. When steam demand suddenly rises, drum pressure drops, steam bubbles expand, and the level appears to RISE even though the boiler is actually losing water. A naive level controller reads "high level" and closes the feedwater valve — exactly the wrong action, at exactly the wrong moment.',
    solution: 'Feed the steam flow FORWARD into the level loop so the controller anticipates the demand change instead of reacting to a misleading level signal, and CASCADE the level controller onto a fast feedwater flow loop so supply-pressure disturbances are caught before they ever affect level.',
    elements: [
      'Element 1 — Drum level (the controlled variable)',
      'Element 2 — Steam flow (the disturbance, fed forward)',
      'Element 3 — Feedwater flow (the fast inner loop)',
    ],
    nodes: [
      { id: 'lt', type: 'sensor', label: 'LT', sub: 'Drum level', x: 60, y: 60 },
      { id: 'ft-steam', type: 'sensor', label: 'FT', sub: 'Steam flow', x: 60, y: 155 },
      { id: 'ft-fw', type: 'sensor', label: 'FT', sub: 'Feedwater flow', x: 60, y: 250 },
      { id: 'lic', type: 'controller', label: 'LIC', sub: 'Level PID (master)', x: 215, y: 60 },
      { id: 'sum', type: 'compute', label: 'Σ', sub: 'Level MV + steam FF', x: 375, y: 105 },
      { id: 'fic', type: 'controller', label: 'FIC', sub: 'Flow PID (slave)', x: 530, y: 155 },
      { id: 'fcv', type: 'actuator', label: 'FCV', sub: 'Feedwater valve', x: 690, y: 155 },
      { id: 'drum', type: 'process', label: 'DRUM', sub: 'Steam drum', x: 690, y: 60 },
    ],
    edges: [
      { from: 'lt', to: 'lic', label: 'PV' },
      { from: 'lic', to: 'sum', label: 'MV' },
      { from: 'ft-steam', to: 'sum', label: 'feedforward', style: 'ff' },
      { from: 'sum', to: 'fic', label: 'SP (cascade)', style: 'cascade' },
      { from: 'ft-fw', to: 'fic', label: 'PV' },
      { from: 'fic', to: 'fcv', label: 'MV' },
      { from: 'fcv', to: 'drum', label: 'feedwater' },
      { from: 'drum', to: 'lt', label: 'level', style: 'feedback' },
    ],
    // Live simulation: how the loop responds to a steam demand change.
    sim: {
      inputLabel: 'Steam demand (% MCR)',
      inputMin: 20, inputMax: 100, inputDefault: 60,
      run(steamDemand) {
        // Shrink/swell: a step up in demand transiently swells the level.
        const swell = (steamDemand - 60) * 0.06;
        const levelPV = 0 + swell;
        const levelSP = 0;
        // Level PID trims; steam flow feeds forward as the bulk demand.
        const levelTrim = (levelSP - levelPV) * 1.8;
        const ffDemand = steamDemand;
        const fwSP = Math.max(0, ffDemand + levelTrim);
        const fwPV = fwSP * 0.98; // slave loop tracks closely
        const valve = Math.min(100, Math.max(0, fwSP * 0.95));
        return {
          nodeValues: {
            'lt': `${levelPV >= 0 ? '+' : ''}${levelPV.toFixed(0)} mm`,
            'ft-steam': `${steamDemand.toFixed(0)} %`,
            'ft-fw': `${fwPV.toFixed(0)} %`,
            'lic': `trim ${levelTrim >= 0 ? '+' : ''}${levelTrim.toFixed(1)}`,
            'sum': `${fwSP.toFixed(0)} %`,
            'fic': `err ${(fwSP - fwPV).toFixed(1)}`,
            'fcv': `${valve.toFixed(0)} % open`,
            'drum': `${levelPV >= 0 ? '+' : ''}${levelPV.toFixed(0)} mm`,
          },
          insight: Math.abs(swell) > 1.5
            ? `Steam demand moved away from normal, so the drum level is showing ${swell > 0 ? 'SWELL (reads high)' : 'SHRINK (reads low)'}. Notice the feedwater demand still follows steam flow through the feedforward path — a single-element controller would be ${swell > 0 ? 'closing' : 'opening'} the valve right now, which is backwards.`
            : 'Steady load. Level is on setpoint and feedwater flow matches steam flow — the level PID is only trimming for small errors.',
        };
      },
    },
    sources: [
      'Yokogawa/MG SC200 three-element drum level application note (cascade + feedforward structure)',
      'Cross Company — Three Element Drum Level Control',
      'WARE — 3-Element Steam Drum Level Control (shrink/swell explanation)',
    ],
  },

  // ------------------------------------------------------------------
  'combustion-cross-limit': {
    name: 'Combustion Control with Cross-Limiting',
    system: 'Boiler / Firing',
    difficulty: 'Advanced',
    why: 'This is the loop that keeps the furnace from ever running fuel-rich. It is a safety architecture as much as a control strategy.',
    problem: 'If fuel increases before air does, the furnace goes fuel-rich — incomplete combustion, unburnt fuel accumulating in the furnace, and a genuine explosion hazard. If air lags on the way down, you waste heat up the stack.',
    solution: 'Cross-limiting. A HIGH select on the air demand and a LOW select on the fuel demand mean air always LEADS fuel on a load increase, and fuel always LEADS air on a load decrease. The furnace physically cannot go fuel-rich through normal control action — the selectors make it structurally impossible, not merely unlikely.',
    elements: [
      'Air leads on the way UP (high select on air)',
      'Fuel leads on the way DOWN (low select on fuel)',
      'O₂ trim fine-tunes the ratio for efficiency',
    ],
    nodes: [
      { id: 'master', type: 'demand', label: 'BOILER MASTER', sub: 'Firing rate demand', x: 60, y: 150 },
      { id: 'hs', type: 'compute', label: 'HIGH<br/>SELECT', sub: 'Air demand', x: 250, y: 70 },
      { id: 'ls', type: 'compute', label: 'LOW<br/>SELECT', sub: 'Fuel demand', x: 250, y: 240 },
      { id: 'ratio', type: 'compute', label: '×', sub: 'Air/fuel ratio', x: 400, y: 70 },
      { id: 'o2', type: 'controller', label: 'O₂ TRIM', sub: 'Excess air PID', x: 400, y: 155 },
      { id: 'aic', type: 'controller', label: 'AIC', sub: 'Air flow PID', x: 555, y: 70 },
      { id: 'fic', type: 'controller', label: 'FIC', sub: 'Fuel flow PID', x: 555, y: 240 },
      { id: 'damper', type: 'actuator', label: 'FD FAN', sub: 'Damper / IGV', x: 710, y: 70 },
      { id: 'feeder', type: 'actuator', label: 'FEEDER', sub: 'Coal / fuel valve', x: 710, y: 240 },
      { id: 'ft-air', type: 'sensor', label: 'FT', sub: 'Air flow', x: 555, y: 150 },
      { id: 'ft-fuel', type: 'sensor', label: 'FT', sub: 'Fuel flow', x: 555, y: 320 },
    ],
    edges: [
      { from: 'master', to: 'hs', label: 'demand' },
      { from: 'master', to: 'ls', label: 'demand' },
      { from: 'ft-fuel', to: 'hs', label: 'fuel flow (cross-limit)', style: 'crosslimit' },
      { from: 'ft-air', to: 'ls', label: 'air flow (cross-limit)', style: 'crosslimit' },
      { from: 'hs', to: 'ratio', label: '' },
      { from: 'o2', to: 'ratio', label: 'trim', style: 'ff' },
      { from: 'ratio', to: 'aic', label: 'SP' },
      { from: 'ls', to: 'fic', label: 'SP' },
      { from: 'ft-air', to: 'aic', label: 'PV', style: 'feedback' },
      { from: 'ft-fuel', to: 'fic', label: 'PV', style: 'feedback' },
      { from: 'aic', to: 'damper', label: 'MV' },
      { from: 'fic', to: 'feeder', label: 'MV' },
    ],
    sim: {
      inputLabel: 'Firing rate demand (%)',
      inputMin: 30, inputMax: 100, inputDefault: 70,
      run(demand, prev = 70) {
        const rising = demand > prev;
        // Cross-limiting: air demand = max(demand, fuel flow); fuel = min(demand, air flow)
        const fuelFlow = rising ? prev : demand;
        const airFlow = rising ? demand : prev;
        const airDemand = Math.max(demand, fuelFlow);
        const fuelDemand = Math.min(demand, airFlow);
        return {
          nodeValues: {
            'master': `${demand.toFixed(0)} %`,
            'hs': `${airDemand.toFixed(0)} %`,
            'ls': `${fuelDemand.toFixed(0)} %`,
            'ratio': `${(airDemand * 1.15).toFixed(0)} %`,
            'o2': `3.2 % O₂`,
            'aic': `SP ${(airDemand * 1.15).toFixed(0)}`,
            'fic': `SP ${fuelDemand.toFixed(0)}`,
            'damper': `${Math.min(100, airDemand * 1.05).toFixed(0)} %`,
            'feeder': `${fuelDemand.toFixed(0)} %`,
            'ft-air': `${airFlow.toFixed(0)} %`,
            'ft-fuel': `${fuelFlow.toFixed(0)} %`,
          },
          insight: `Air demand is the HIGHER of (firing demand, actual fuel flow) = ${airDemand.toFixed(0)}%. Fuel demand is the LOWER of (firing demand, actual air flow) = ${fuelDemand.toFixed(0)}%. Whichever way the load moves, air is always on the safe side of fuel — that is the whole point of the two selectors.`,
        };
      },
    },
    sources: [
      'Yokogawa YS1700 Boiler Combustion Control application note (high/low select cross-limiting)',
      'Control Guru — Ratio with Cross-Limiting Override Control of a Combustion Process',
      'MG SC200 ratio with cross-limiting override application note',
    ],
  },

  // ------------------------------------------------------------------
  'steam-temp-cascade': {
    name: 'Superheater Steam Temperature (Cascade Attemperation)',
    system: 'Steam',
    difficulty: 'Advanced',
    why: 'Steam temperature must be held within a narrow band: too high damages superheater tubes and the turbine, too low risks moisture in the last turbine stages and costs efficiency.',
    problem: 'The superheater is a huge thermal mass. Spray water added at the attemperator takes a long time to show up as a temperature change at the outlet — a long dead time and lag that makes a single PID loop either sluggish or unstable.',
    solution: 'Cascade. An outer (master) PID watches the final superheater outlet temperature and sets the target for an inner (slave) PID that watches the temperature right AFTER the spray nozzle. The inner loop sees spray changes almost immediately, so it absorbs the disturbance long before the outer loop would have noticed.',
    elements: [
      'Master PID — final SH outlet temperature (slow, accurate)',
      'Slave PID — attemperator outlet temperature (fast, responsive)',
      'Saturation-temperature limit — protects against spraying below saturation',
    ],
    nodes: [
      { id: 'tt-out', type: 'sensor', label: 'TT', sub: 'Final SH outlet temp', x: 60, y: 60 },
      { id: 'tic-master', type: 'controller', label: 'TIC-M', sub: 'Master PID', x: 225, y: 60 },
      { id: 'maxsel', type: 'compute', label: 'MAX<br/>SELECT', sub: 'vs sat. temp limit', x: 390, y: 60 },
      { id: 'satcalc', type: 'compute', label: 'f(x)', sub: 'Sat. temp from pressure', x: 390, y: 155 },
      { id: 'tic-slave', type: 'controller', label: 'TIC-S', sub: 'Slave PID', x: 555, y: 60 },
      { id: 'tt-spray', type: 'sensor', label: 'TT', sub: 'After spray nozzle', x: 555, y: 155 },
      { id: 'spray', type: 'actuator', label: 'SPRAY<br/>VALVE', sub: 'Attemperator', x: 710, y: 60 },
      { id: 'sh', type: 'process', label: 'SUPER<br/>HEATER', sub: 'Thermal mass + lag', x: 710, y: 250 },
    ],
    edges: [
      { from: 'tt-out', to: 'tic-master', label: 'PV' },
      { from: 'tic-master', to: 'maxsel', label: 'MV' },
      { from: 'satcalc', to: 'maxsel', label: 'min limit', style: 'ff' },
      { from: 'maxsel', to: 'tic-slave', label: 'SP (cascade)', style: 'cascade' },
      { from: 'tt-spray', to: 'tic-slave', label: 'PV' },
      { from: 'tic-slave', to: 'spray', label: 'MV' },
      { from: 'spray', to: 'sh', label: 'spray water' },
      { from: 'sh', to: 'tt-out', label: 'outlet temp', style: 'feedback' },
    ],
    sim: {
      inputLabel: 'Final SH outlet temperature (°C)',
      inputMin: 520, inputMax: 580, inputDefault: 540,
      run(outletTemp) {
        const sp = 540;
        const err = outletTemp - sp;
        const masterMV = 300 + err * 2.5; // slave SP, °C after spray
        const satTemp = 340; // illustrative saturation temperature limit
        const slaveSP = Math.max(satTemp, masterMV);
        const limited = masterMV < satTemp;
        const sprayPct = Math.min(100, Math.max(0, 30 + err * 4));
        return {
          nodeValues: {
            'tt-out': `${outletTemp.toFixed(0)} °C`,
            'tic-master': `err ${err >= 0 ? '+' : ''}${err.toFixed(0)} °C`,
            'satcalc': `${satTemp} °C`,
            'maxsel': `${slaveSP.toFixed(0)} °C`,
            'tic-slave': `SP ${slaveSP.toFixed(0)} °C`,
            'tt-spray': `${(slaveSP - 2).toFixed(0)} °C`,
            'spray': `${sprayPct.toFixed(0)} % open`,
            'sh': `${outletTemp.toFixed(0)} °C`,
          },
          insight: limited
            ? `The master is asking for an attemperator outlet BELOW saturation temperature (${satTemp} °C). The MAX select has clamped it — this is the protection that stops the spray from putting water, not steam, into the superheater.`
            : err > 3
              ? 'Outlet temperature is above setpoint, so the master is driving the slave setpoint down and the spray valve is opening. Note the slave reacts to the spray almost immediately, while the outlet temperature will take minutes to follow.'
              : err < -3
                ? 'Outlet is below setpoint — spray is being cut back. Watch that the slave loop responds first; the outlet only catches up after the superheater thermal lag.'
                : 'On setpoint. The cascade is holding, with the slave loop absorbing small spray-water disturbances before they ever reach the outlet.',
        };
      },
    },
    sources: [
      'ScienceDirect — superheated steam temperature control (two-stage attemperation, cascade with saturation-temperature max select)',
      'HRSG superheater cascade control study (arXiv 2512.00990)',
      'InstrumentationTools — Superheated Steam Temperature Control System',
    ],
  },

  // ------------------------------------------------------------------
  'furnace-draft': {
    name: 'Furnace Draft Control',
    system: 'Air & Flue Gas',
    difficulty: 'Core',
    why: 'The furnace must be held at a slight negative pressure. Positive pressure blows hot flue gas and flame out of inspection doors; too negative risks implosion of the furnace casing.',
    problem: 'The ID fan and FD fan are fighting over the same furnace. Change the FD fan for combustion air, and the furnace pressure moves — a strong, fast interaction between two separate control loops.',
    solution: 'Feedforward coupling. The FD fan (air flow) demand is fed forward directly into the ID fan demand, so the ID fan starts moving at the same instant the FD fan does, rather than waiting for the pressure error to appear. The draft PID then only has to trim the small residual.',
    elements: [
      'Furnace pressure PID (the trim)',
      'Air flow feedforward from the FD fan (the bulk action)',
      'ID fan damper / IGV / VFD as final element',
    ],
    nodes: [
      { id: 'pt', type: 'sensor', label: 'PT', sub: 'Furnace pressure', x: 60, y: 70 },
      { id: 'pic', type: 'controller', label: 'PIC', sub: 'Draft PID', x: 235, y: 70 },
      { id: 'ff-air', type: 'demand', label: 'FD FAN<br/>DEMAND', sub: 'Air flow feedforward', x: 235, y: 190 },
      { id: 'sum', type: 'compute', label: 'Σ', sub: 'FF + trim', x: 425, y: 130 },
      { id: 'idfan', type: 'actuator', label: 'ID FAN', sub: 'Damper / IGV / VFD', x: 610, y: 130 },
      { id: 'furnace', type: 'process', label: 'FURNACE', sub: 'Draft', x: 610, y: 30 },
    ],
    edges: [
      { from: 'pt', to: 'pic', label: 'PV' },
      { from: 'pic', to: 'sum', label: 'trim' },
      { from: 'ff-air', to: 'sum', label: 'feedforward', style: 'ff' },
      { from: 'sum', to: 'idfan', label: 'MV' },
      { from: 'idfan', to: 'furnace', label: 'flue gas out' },
      { from: 'furnace', to: 'pt', label: 'pressure', style: 'feedback' },
    ],
    sim: {
      inputLabel: 'FD fan / air flow demand (%)',
      inputMin: 30, inputMax: 100, inputDefault: 65,
      run(airDemand) {
        const sp = -5; // mmWC, slightly negative
        // Without FF the pressure would swing hard; FF keeps the error small.
        const residualErr = (airDemand - 65) * 0.04;
        const pv = sp + residualErr;
        const trim = (sp - pv) * 3;
        const idDemand = airDemand + trim;
        return {
          nodeValues: {
            'pt': `${pv.toFixed(1)} mmWC`,
            'pic': `trim ${trim >= 0 ? '+' : ''}${trim.toFixed(1)}`,
            'ff-air': `${airDemand.toFixed(0)} %`,
            'sum': `${idDemand.toFixed(0)} %`,
            'idfan': `${Math.min(100, idDemand).toFixed(0)} %`,
            'furnace': `${pv.toFixed(1)} mmWC`,
          },
          insight: Math.abs(residualErr) > 0.6
            ? `Air flow has moved, and the ID fan demand followed it almost instantly through the feedforward path — the draft PID is only trimming ${trim >= 0 ? '+' : ''}${trim.toFixed(1)}%. Without that feedforward, the pressure would swing far harder before the PID caught it.`
            : 'Balanced draft. ID and FD fans are matched, and the furnace is sitting just below atmospheric as designed.',
        };
      },
    },
    sources: [
      'Standard balanced-draft control practice (ID/FD feedforward coupling); NFPA 85 furnace pressure protection context',
    ],
  },

  // ------------------------------------------------------------------
  'coordinated-master': {
    name: 'Coordinated Master Control (Unit Load)',
    system: 'Unit',
    difficulty: 'Advanced',
    why: 'The boiler and turbine must be commanded together. This is the loop that decides whether the boiler follows the turbine, the turbine follows the boiler, or both move as one.',
    problem: 'The turbine responds in seconds; the boiler responds in minutes. Command them independently and either main steam pressure collapses (turbine opened too fast) or load response is uselessly slow (waiting for the boiler).',
    solution: 'Coordinated control. A unit master takes the load demand and splits it into a boiler demand and a turbine demand, with main steam pressure error trimming BOTH so the two stay matched. The mode selector determines which side leads.',
    elements: [
      'Boiler-follow — turbine leads on load, boiler catches up (fast response, pressure swings)',
      'Turbine-follow — boiler leads, turbine holds pressure (stable pressure, slow load)',
      'Coordinated — both move together, pressure error trims both',
    ],
    nodes: [
      { id: 'demand', type: 'demand', label: 'LOAD<br/>DEMAND', sub: 'MW target / grid AGC', x: 60, y: 130 },
      { id: 'pt-steam', type: 'sensor', label: 'PT', sub: 'Main steam pressure', x: 60, y: 250 },
      { id: 'master', type: 'controller', label: 'UNIT<br/>MASTER', sub: 'Coordinated logic', x: 240, y: 130 },
      { id: 'pic', type: 'controller', label: 'PIC', sub: 'Steam pressure PID', x: 240, y: 250 },
      { id: 'boiler-dmd', type: 'compute', label: 'BOILER<br/>DEMAND', sub: 'Firing rate', x: 435, y: 60 },
      { id: 'turb-dmd', type: 'compute', label: 'TURBINE<br/>DEMAND', sub: 'Valve position', x: 435, y: 210 },
      { id: 'firing', type: 'actuator', label: 'FIRING', sub: 'To combustion control', x: 630, y: 60 },
      { id: 'gv', type: 'actuator', label: 'GOV<br/>VALVES', sub: 'Turbine admission', x: 630, y: 210 },
    ],
    edges: [
      { from: 'demand', to: 'master', label: 'MW demand' },
      { from: 'pt-steam', to: 'pic', label: 'PV' },
      { from: 'pic', to: 'master', label: 'pressure error', style: 'feedback' },
      { from: 'master', to: 'boiler-dmd', label: '' },
      { from: 'master', to: 'turb-dmd', label: '' },
      { from: 'pic', to: 'boiler-dmd', label: 'trim', style: 'ff' },
      { from: 'pic', to: 'turb-dmd', label: 'trim', style: 'ff' },
      { from: 'boiler-dmd', to: 'firing', label: '' },
      { from: 'turb-dmd', to: 'gv', label: '' },
    ],
    sim: {
      inputLabel: 'Unit load demand (% MCR)',
      inputMin: 40, inputMax: 100, inputDefault: 75,
      run(loadDemand) {
        const spPress = 170; // bar, illustrative
        // Boiler lags the demand; pressure error is the symptom.
        const boilerActual = 75 + (loadDemand - 75) * 0.6;
        const pressErr = (boilerActual - loadDemand) * 0.8;
        const pv = spPress + pressErr;
        return {
          nodeValues: {
            'demand': `${loadDemand.toFixed(0)} %`,
            'pt-steam': `${pv.toFixed(1)} bar`,
            'master': `${loadDemand.toFixed(0)} %`,
            'pic': `err ${pressErr >= 0 ? '+' : ''}${pressErr.toFixed(1)} bar`,
            'boiler-dmd': `${(loadDemand - pressErr * 0.5).toFixed(0)} %`,
            'turb-dmd': `${(loadDemand + pressErr * 0.3).toFixed(0)} %`,
            'firing': `${(loadDemand - pressErr * 0.5).toFixed(0)} %`,
            'gv': `${(loadDemand + pressErr * 0.3).toFixed(0)} %`,
          },
          insight: Math.abs(pressErr) > 1.5
            ? `Load demand has moved faster than the boiler can follow, so main steam pressure is ${pressErr > 0 ? 'above' : 'below'} setpoint by ${Math.abs(pressErr).toFixed(1)} bar. The pressure error is trimming BOTH demands — pushing firing ${pressErr > 0 ? 'down' : 'up'} and easing the governor valves the other way to protect pressure while load catches up.`
            : 'Load and firing are matched, main steam pressure is on setpoint. This is coordinated control doing its job — boiler and turbine moving as one machine.',
        };
      },
    },
    sources: [
      'Standard coordinated boiler-turbine control practice (boiler-follow / turbine-follow / coordinated modes)',
    ],
  },

  // ------------------------------------------------------------------
  'deaerator-level': {
    name: 'Deaerator Level & Pressure Control',
    system: 'Feedwater',
    difficulty: 'Core',
    why: 'The deaerator storage tank is the ONLY suction source for the boiler feed pumps. Lose its level and you lose BFP suction — cavitation and pump damage follow within seconds.',
    problem: 'Level and pressure interact. Pegging steam holds the deaerator pressure that provides BFP suction head, but changing that pressure also changes how much the stored water flashes, which moves the level.',
    solution: 'Two loops that must be understood together: a level loop throttling condensate makeup, and a pressure loop on the pegging steam supply. Both feed the same vessel, and the pressure loop directly protects the NPSH margin the feed pumps depend on.',
    elements: [
      'Level control — condensate makeup valve',
      'Pressure control — pegging steam valve',
      'Both protect BFP suction (NPSH margin)',
    ],
    nodes: [
      { id: 'lt', type: 'sensor', label: 'LT', sub: 'Storage tank level', x: 60, y: 60 },
      { id: 'pt', type: 'sensor', label: 'PT', sub: 'Deaerator pressure', x: 60, y: 215 },
      { id: 'lic', type: 'controller', label: 'LIC', sub: 'Level PID', x: 250, y: 60 },
      { id: 'pic', type: 'controller', label: 'PIC', sub: 'Pressure PID', x: 250, y: 215 },
      { id: 'lcv', type: 'actuator', label: 'LCV', sub: 'Condensate makeup', x: 440, y: 60 },
      { id: 'pcv', type: 'actuator', label: 'PCV', sub: 'Pegging steam', x: 440, y: 215 },
      { id: 'da', type: 'process', label: 'DEAERATOR', sub: 'Storage tank', x: 630, y: 135 },
      { id: 'bfp', type: 'process', label: 'BFP', sub: 'Suction (NPSH)', x: 630, y: 280 },
    ],
    edges: [
      { from: 'lt', to: 'lic', label: 'PV' },
      { from: 'pt', to: 'pic', label: 'PV' },
      { from: 'lic', to: 'lcv', label: 'MV' },
      { from: 'pic', to: 'pcv', label: 'MV' },
      { from: 'lcv', to: 'da', label: 'makeup' },
      { from: 'pcv', to: 'da', label: 'pegging steam' },
      { from: 'da', to: 'lt', label: 'level', style: 'feedback' },
      { from: 'da', to: 'pt', label: 'pressure', style: 'feedback' },
      { from: 'da', to: 'bfp', label: 'suction head' },
    ],
    sim: {
      inputLabel: 'Feedwater draw-off (% of normal)',
      inputMin: 40, inputMax: 130, inputDefault: 100,
      run(drawOff) {
        const levelErr = -(drawOff - 100) * 0.08;
        const makeup = Math.min(100, Math.max(0, drawOff + levelErr * -2));
        const press = 5.0 - (drawOff - 100) * 0.004;
        const npsh = 12 + (press - 5.0) * 8 + levelErr * 0.5;
        return {
          nodeValues: {
            'lt': `${levelErr >= 0 ? '+' : ''}${levelErr.toFixed(0)} mm`,
            'pt': `${press.toFixed(2)} bar`,
            'lic': `err ${levelErr >= 0 ? '+' : ''}${levelErr.toFixed(1)}`,
            'pic': `err ${(5.0 - press).toFixed(2)}`,
            'lcv': `${makeup.toFixed(0)} % open`,
            'pcv': `${Math.min(100, Math.max(0, 45 + (5.0 - press) * 60)).toFixed(0)} % open`,
            'da': `${press.toFixed(2)} bar`,
            'bfp': `NPSH ${npsh.toFixed(1)} m`,
          },
          insight: npsh < 8
            ? `NPSH margin has fallen to ${npsh.toFixed(1)} m. This is the failure path that matters: low deaerator level or pressure starves the feed pumps, and BFP cavitation follows. Watch the pegging steam valve opening to defend pressure.`
            : drawOff > 110
              ? 'High feedwater draw-off. The makeup valve has opened to hold level, and pegging steam is defending the pressure that gives the feed pumps their suction head.'
              : 'Stable. Level and pressure both on setpoint, and the feed pumps have comfortable NPSH margin.',
        };
      },
    },
    sources: [
      'Standard deaerator level/pressure control practice; BFP NPSH dependency per boiler feed pump suction references',
    ],
  },

  // ------------------------------------------------------------------
  'mill-control': {
    name: 'Mill / Pulverizer Control',
    system: 'Fuel',
    difficulty: 'Advanced',
    why: 'The mill has to grind coal AND dry it AND transport it to the burners, all at once. Three interlinked controls handle it, and getting the balance wrong risks a mill fire.',
    problem: 'Coal feed sets the heat input, but primary air does two competing jobs at the same time: it carries pulverised coal to the burners AND dries it. Push the outlet temperature up for better drying and you approach the coal\u2019s ignition point inside the mill. Run it too cool and wet coal packs and blocks the pipes.',
    solution: 'Three coordinated controls: feeder speed sets coal flow, a PA flow loop holds the coal/air ratio needed for transport, and a mill outlet temperature loop blends HOT and COLD primary air to hit a drying temperature that stays safely below the ignition risk band.',
    elements: [
      'Feeder speed \u2014 sets coal flow to the mill',
      'PA flow \u2014 holds the coal/air ratio for pipe transport',
      'Hot/cold PA damper blending \u2014 controls mill outlet temperature',
    ],
    nodes: [
      { id: 'fuel-dmd', type: 'demand', label: 'FUEL<br/>DEMAND', sub: 'From boiler master', x: 55, y: 60 },
      { id: 'feeder', type: 'actuator', label: 'FEEDER', sub: 'Coal flow', x: 235, y: 60 },
      { id: 'ratio', type: 'compute', label: '\u00d7', sub: 'Coal/air ratio f(x)', x: 415, y: 60 },
      { id: 'pa-fic', type: 'controller', label: 'FIC', sub: 'PA flow PID', x: 590, y: 60 },
      { id: 'pa-damper', type: 'actuator', label: 'PA<br/>DAMPER', sub: 'Total PA flow', x: 760, y: 60 },
      { id: 'tt-out', type: 'sensor', label: 'TT', sub: 'Mill outlet temp', x: 55, y: 230 },
      { id: 'tic', type: 'controller', label: 'TIC', sub: 'Outlet temp PID', x: 235, y: 230 },
      { id: 'split', type: 'compute', label: 'SPLIT', sub: 'Hot/cold PA blend', x: 415, y: 230 },
      { id: 'hot-damper', type: 'actuator', label: 'HOT PA', sub: 'From air heater', x: 590, y: 175 },
      { id: 'cold-damper', type: 'actuator', label: 'COLD PA', sub: 'Tempering air', x: 590, y: 285 },
      { id: 'mill', type: 'process', label: 'MILL', sub: 'Grind + dry + transport', x: 760, y: 230 },
    ],
    edges: [
      { from: 'fuel-dmd', to: 'feeder', label: 'demand' },
      { from: 'feeder', to: 'ratio', label: 'coal flow' },
      { from: 'ratio', to: 'pa-fic', label: 'PA SP', style: 'cascade' },
      { from: 'pa-fic', to: 'pa-damper', label: 'MV' },
      { from: 'pa-damper', to: 'mill', label: 'primary air' },
      { from: 'feeder', to: 'mill', label: 'coal' },
      { from: 'tt-out', to: 'tic', label: 'PV' },
      { from: 'tic', to: 'split', label: 'MV' },
      { from: 'split', to: 'hot-damper', label: 'open' },
      { from: 'split', to: 'cold-damper', label: 'close', style: 'crosslimit' },
      { from: 'hot-damper', to: 'mill', label: '' },
      { from: 'cold-damper', to: 'mill', label: '' },
      { from: 'mill', to: 'tt-out', label: 'outlet temp', style: 'feedback' },
    ],
    sim: {
      inputLabel: 'Mill loading (% of rated coal flow)',
      inputMin: 30, inputMax: 100, inputDefault: 70,
      run(loading) {
        const paFlow = 25 + loading * 0.75;            // PA follows coal via ratio f(x)
        const ratio = paFlow / Math.max(1, loading);   // coal/air ratio
        const outletTemp = 78 + (loading - 70) * 0.14; // heavier load = harder to dry
        const tempSP = 80;
        const err = tempSP - outletTemp;
        const hotPct = Math.min(100, Math.max(0, 55 + err * 6));
        return {
          nodeValues: {
            'fuel-dmd': `${loading.toFixed(0)} %`,
            'feeder': `${loading.toFixed(0)} %`,
            'ratio': `${ratio.toFixed(2)} air/coal`,
            'pa-fic': `SP ${paFlow.toFixed(0)} %`,
            'pa-damper': `${Math.min(100, paFlow).toFixed(0)} %`,
            'tt-out': `${outletTemp.toFixed(1)} \u00b0C`,
            'tic': `err ${err >= 0 ? '+' : ''}${err.toFixed(1)} \u00b0C`,
            'split': `hot ${hotPct.toFixed(0)}%`,
            'hot-damper': `${hotPct.toFixed(0)} % open`,
            'cold-damper': `${(100 - hotPct).toFixed(0)} % open`,
            'mill': `${outletTemp.toFixed(1)} \u00b0C`,
          },
          insight: outletTemp > 88
            ? `Mill outlet temperature is ${outletTemp.toFixed(1)} \u00b0C and climbing toward the range where coal dust in the mill becomes a genuine fire risk. The controller is closing hot PA and opening tempering air \u2014 this is the loop that protects against a mill fire.`
            : loading < 45
              ? `Low mill loading. Note the PA flow does NOT fall proportionally \u2014 there is a minimum PA flow that must be maintained regardless of coal flow, or the pulverised coal settles out and blocks the burner pipes.`
              : `Balanced. PA flow is tracking coal flow at a ratio of ${ratio.toFixed(2)}, and the hot/cold air blend is holding outlet temperature at the drying setpoint.`,
        };
      },
    },
    sources: [
      'Standard pulverizer control practice (feeder speed, PA/coal ratio, hot/cold tempering air blending for outlet temperature)',
      'Mill outlet temperature limits relate to coal volatile content and mill fire protection \u2014 actual setpoints are coal- and OEM-specific',
    ],
  },

  // ------------------------------------------------------------------
  'turbine-bypass': {
    name: 'HP / LP Turbine Bypass Control',
    system: 'Steam',
    difficulty: 'Advanced',
    why: 'The bypass is what lets the boiler keep running when the turbine cannot take the steam \u2014 during start-up, and in the seconds after a turbine trip or load rejection.',
    problem: 'On a turbine trip the governor valves slam shut. The boiler is still firing and still making full steam flow with nowhere to go. Without somewhere for that steam to be routed, main steam pressure spikes to the safety valves within seconds and the whole unit has to be shut down.',
    solution: 'A fast pressure-control bypass. HP bypass dumps main steam to the cold reheat line, LP bypass dumps hot reheat steam straight to the condenser, and both spray-attemperate so the condenser is never hit with steam it cannot handle. On a trip the bypass opens in a fast-acting mode rather than waiting for normal PID action.',
    elements: [
      'HP bypass \u2014 main steam to cold reheat, pressure controlled',
      'LP bypass \u2014 hot reheat to condenser, with desuperheating spray',
      'Fast-open on turbine trip; modulating pressure control on start-up',
    ],
    nodes: [
      { id: 'pt-ms', type: 'sensor', label: 'PT', sub: 'Main steam pressure', x: 55, y: 60 },
      { id: 'trip', type: 'demand', label: 'TURBINE<br/>TRIP', sub: 'Fast-open signal', x: 55, y: 215 },
      { id: 'pic-hp', type: 'controller', label: 'PIC-HP', sub: 'HP bypass PID', x: 240, y: 60 },
      { id: 'hs', type: 'compute', label: 'HIGH<br/>SELECT', sub: 'PID vs fast-open', x: 425, y: 135 },
      { id: 'hp-bp', type: 'actuator', label: 'HP<br/>BYPASS', sub: 'To cold reheat', x: 610, y: 60 },
      { id: 'spray1', type: 'actuator', label: 'SPRAY', sub: 'HP BP desuperheat', x: 610, y: 175 },
      { id: 'pic-lp', type: 'controller', label: 'PIC-LP', sub: 'LP bypass PID', x: 240, y: 320 },
      { id: 'lp-bp', type: 'actuator', label: 'LP<br/>BYPASS', sub: 'To condenser', x: 610, y: 320 },
      { id: 'cond', type: 'process', label: 'CONDENSER', sub: 'Must accept the dump', x: 790, y: 320 },
    ],
    edges: [
      { from: 'pt-ms', to: 'pic-hp', label: 'PV' },
      { from: 'pic-hp', to: 'hs', label: 'MV' },
      { from: 'trip', to: 'hs', label: 'fast-open', style: 'crosslimit' },
      { from: 'hs', to: 'hp-bp', label: 'demand' },
      { from: 'hs', to: 'spray1', label: 'spray demand', style: 'ff' },
      { from: 'trip', to: 'pic-lp', label: 'fast-open', style: 'crosslimit' },
      { from: 'pic-lp', to: 'lp-bp', label: 'MV' },
      { from: 'lp-bp', to: 'cond', label: 'steam dump' },
      { from: 'hp-bp', to: 'pt-ms', label: 'pressure relief', style: 'feedback' },
    ],
    sim: {
      inputLabel: 'Turbine load accepted (% \u2014 drag to 0 to simulate a trip)',
      inputMin: 0, inputMax: 100, inputDefault: 80,
      run(turbineLoad) {
        const tripped = turbineLoad < 5;
        const bypassDemand = Math.max(0, 100 - turbineLoad);
        const pressErr = tripped ? 8 : bypassDemand * 0.05;
        const press = 170 + pressErr;
        const hpOpen = tripped ? 100 : Math.min(100, bypassDemand * 0.9);
        return {
          nodeValues: {
            'pt-ms': `${press.toFixed(1)} bar`,
            'trip': tripped ? 'TRIPPED' : 'healthy',
            'pic-hp': `err +${pressErr.toFixed(1)}`,
            'hs': `${hpOpen.toFixed(0)} %`,
            'hp-bp': `${hpOpen.toFixed(0)} % open`,
            'spray1': `${(hpOpen * 0.6).toFixed(0)} % open`,
            'pic-lp': tripped ? 'FAST OPEN' : `${(hpOpen * 0.9).toFixed(0)} %`,
            'lp-bp': `${(tripped ? 100 : hpOpen * 0.9).toFixed(0)} % open`,
            'cond': tripped ? 'full dump' : `${(hpOpen * 0.9).toFixed(0)} % dump`,
          },
          insight: tripped
            ? 'TURBINE TRIP. The fast-open signal has bypassed normal PID action through the high select \u2014 both bypasses are driven wide open immediately. The boiler keeps firing, steam routes around the turbine to the condenser, and main steam pressure is held off the safety valves. This is what lets a unit survive a turbine trip without a full boiler shutdown.'
            : turbineLoad < 50
              ? 'The turbine is taking only part of the steam flow, so the bypass is modulating to take the rest and hold main steam pressure \u2014 the normal situation during a start-up before the turbine is fully loaded.'
              : 'The turbine is accepting most of the steam. The bypass is nearly shut and simply holding main steam pressure at setpoint.',
        };
      },
    },
    sources: [
      'Standard HP/LP turbine bypass practice (pressure control, fast-open on trip, desuperheating before the condenser)',
    ],
  },

  // ------------------------------------------------------------------
  'hp-heater-level': {
    name: 'HP Heater Level Control (3-Element)',
    system: 'Feedwater Heaters',
    difficulty: 'Core',
    why: 'A flooded HP heater is one of the classic routes to destroying a turbine \u2014 water gets back up the extraction line and into the machine.',
    problem: 'Heater level must sit in a narrow band. Too low and the drain cooler section is uncovered, so live steam blows through into the drain line. Too high and the tube bundle floods, heat transfer collapses, and \u2014 far worse \u2014 water can back up the extraction line toward the turbine.',
    solution: 'Three-element control, structurally the same idea as drum level: extraction steam flow is fed FORWARD (it predicts the condensing rate), and the level controller cascades onto the drain valve. A separate high-high level trip closes the extraction non-return valve and isolates the heater entirely \u2014 the level loop is control, the trip is protection, and they are deliberately independent.',
    elements: [
      'Level \u2014 the controlled variable',
      'Extraction steam flow \u2014 fed forward (predicts condensing rate)',
      'Drain flow \u2014 the manipulated variable',
      'Independent HH trip \u2014 closes the extraction NRV (protection, not control)',
    ],
    nodes: [
      { id: 'lt', type: 'sensor', label: 'LT', sub: 'Heater shell level', x: 55, y: 60 },
      { id: 'ft-extr', type: 'sensor', label: 'FT', sub: 'Extraction steam flow', x: 55, y: 165 },
      { id: 'lic', type: 'controller', label: 'LIC', sub: 'Level PID', x: 240, y: 60 },
      { id: 'sum', type: 'compute', label: '\u03a3', sub: 'Level MV + FF', x: 425, y: 110 },
      { id: 'lcv', type: 'actuator', label: 'LCV', sub: 'Normal drain valve', x: 610, y: 110 },
      { id: 'heater', type: 'process', label: 'HP<br/>HEATER', sub: 'Shell side', x: 790, y: 60 },
      { id: 'hh-trip', type: 'compute', label: 'LEVEL HH<br/>TRIP', sub: 'Independent protection', x: 240, y: 275 },
      { id: 'nrv', type: 'actuator', label: 'EXTR<br/>NRV', sub: 'Isolates the heater', x: 610, y: 275 },
    ],
    edges: [
      { from: 'lt', to: 'lic', label: 'PV' },
      { from: 'lic', to: 'sum', label: 'MV' },
      { from: 'ft-extr', to: 'sum', label: 'feedforward', style: 'ff' },
      { from: 'sum', to: 'lcv', label: 'demand' },
      { from: 'lcv', to: 'heater', label: 'drain out' },
      { from: 'heater', to: 'lt', label: 'level', style: 'feedback' },
      { from: 'lt', to: 'hh-trip', label: 'HH', style: 'crosslimit' },
      { from: 'hh-trip', to: 'nrv', label: 'close', style: 'crosslimit' },
      { from: 'nrv', to: 'heater', label: 'isolate' },
    ],
    sim: {
      inputLabel: 'Heater level (mm from normal)',
      inputMin: -200, inputMax: 260, inputDefault: 0,
      run(level) {
        const hhTrip = 150;
        const tripped = level >= hhTrip;
        const drainOpen = Math.min(100, Math.max(0, 45 + level * 0.3));
        return {
          nodeValues: {
            'lt': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'ft-extr': `${(70 + level * 0.05).toFixed(0)} %`,
            'lic': `err ${(-level).toFixed(0)} mm`,
            'sum': `${drainOpen.toFixed(0)} %`,
            'lcv': `${drainOpen.toFixed(0)} % open`,
            'heater': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'hh-trip': tripped ? 'TRIPPED' : `armed (${hhTrip} mm)`,
            'nrv': tripped ? 'CLOSED' : 'open',
          },
          insight: tripped
            ? `Level has reached the HIGH-HIGH trip at ${hhTrip} mm. The extraction non-return valve has closed and the heater is isolated. Notice this happened through the INDEPENDENT protection path \u2014 not through the level controller. That separation is deliberate: if the control loop itself is what failed, protection must not depend on it.`
            : level > 80
              ? 'Level is high and the drain valve is driving open. If the level keeps rising, the independent HH trip will isolate the heater before water can back up the extraction line toward the turbine.'
              : level < -100
                ? 'Level is low. Push it much lower and the drain cooler section uncovers, letting live steam blow through into the drain line \u2014 which erodes the drain valve and the downstream piping.'
                : 'Level on setpoint. The drain valve is modulating with extraction flow fed forward, so the loop anticipates changes in condensing rate rather than chasing them.',
        };
      },
    },
    sources: [
      'Standard HP/LP feedwater heater level control practice (3-element with extraction flow feedforward)',
      'Extraction non-return valve closure on high heater level \u2014 turbine water induction protection (consistent with the extraction NRV entry in this app\u2019s trip registry)',
    ],
  },

  // ------------------------------------------------------------------
  'condenser-hotwell': {
    name: 'Condenser Hotwell Level Control',
    system: 'Condensate',
    difficulty: 'Core',
    why: 'The hotwell is the cycle\u2019s water buffer. It absorbs every mismatch between what the turbine exhausts and what the feedwater system draws \u2014 and it feeds the condensate pumps.',
    problem: 'Two failure modes in opposite directions. Level too low and the condensate pumps lose suction and cavitate. Level too high and the tube bundle floods, condenser performance collapses, and backpressure rises \u2014 costing turbine output immediately.',
    solution: 'A level controller that splits its output across two ranges: on falling level it opens makeup from the storage tank, and on rising level it opens the dump/reject valve back to storage. A single controller drives both, with a deliberate deadband between them so the two valves never fight each other.',
    elements: [
      'Level PID with split-range output',
      'Makeup valve \u2014 opens on falling level',
      'Reject/dump valve \u2014 opens on rising level',
      'Deadband between them so they never fight',
    ],
    nodes: [
      { id: 'lt', type: 'sensor', label: 'LT', sub: 'Hotwell level', x: 55, y: 130 },
      { id: 'lic', type: 'controller', label: 'LIC', sub: 'Level PID', x: 250, y: 130 },
      { id: 'split', type: 'compute', label: 'SPLIT<br/>RANGE', sub: 'With deadband', x: 445, y: 130 },
      { id: 'makeup', type: 'actuator', label: 'MAKEUP', sub: 'From storage tank', x: 640, y: 55 },
      { id: 'reject', type: 'actuator', label: 'REJECT', sub: 'Dump to storage', x: 640, y: 210 },
      { id: 'hotwell', type: 'process', label: 'HOTWELL', sub: 'Cycle water buffer', x: 830, y: 130 },
      { id: 'cep', type: 'process', label: 'CEP', sub: 'Suction (NPSH)', x: 830, y: 265 },
    ],
    edges: [
      { from: 'lt', to: 'lic', label: 'PV' },
      { from: 'lic', to: 'split', label: 'MV' },
      { from: 'split', to: 'makeup', label: '0\u201345 %' },
      { from: 'split', to: 'reject', label: '55\u2013100 %' },
      { from: 'makeup', to: 'hotwell', label: 'in' },
      { from: 'reject', to: 'hotwell', label: 'out' },
      { from: 'hotwell', to: 'lt', label: 'level', style: 'feedback' },
      { from: 'hotwell', to: 'cep', label: 'suction head' },
    ],
    sim: {
      inputLabel: 'Hotwell level (mm from normal)',
      inputMin: -350, inputMax: 300, inputDefault: 0,
      run(level) {
        const mv = 50 - level * 0.14;              // PID output, 50% = deadband centre
        const makeup = mv < 45 ? Math.min(100, (45 - mv) * 2.2) : 0;
        const reject = mv > 55 ? Math.min(100, (mv - 55) * 2.2) : 0;
        const npsh = 9 + level * 0.012;
        return {
          nodeValues: {
            'lt': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'lic': `MV ${mv.toFixed(0)} %`,
            'split': makeup > 0 ? 'makeup band' : reject > 0 ? 'reject band' : 'deadband',
            'makeup': `${makeup.toFixed(0)} % open`,
            'reject': `${reject.toFixed(0)} % open`,
            'hotwell': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'cep': `NPSH ${npsh.toFixed(1)} m`,
          },
          insight: npsh < 6
            ? `Hotwell level is low and CEP NPSH margin has fallen to ${npsh.toFixed(1)} m. Makeup is wide open, but if level keeps dropping the condensate pumps will cavitate \u2014 this is the failure path that matters on the low side.`
            : level > 150
              ? 'Level is high and the reject valve is dumping back to storage. Left unchecked, a flooded tube bundle degrades the condenser and drives turbine backpressure up, which costs output straight away.'
              : makeup === 0 && reject === 0
                ? 'Level is inside the deadband, so BOTH valves are shut. That gap is deliberate \u2014 without it, makeup and reject would sit partly open at the same time, endlessly cycling water back and forth.'
                : 'Level is off setpoint and the split-range output is correcting it with one valve only \u2014 never both at once.',
        };
      },
    },
    sources: [
      'Standard condenser hotwell level control practice (split-range makeup/reject with deadband)',
      'CEP NPSH dependency on hotwell level \u2014 consistent with the hotwell low-low trip entry in this app\u2019s registry',
    ],
  },

  // ------------------------------------------------------------------
  'avr-excitation': {
    name: 'AVR / Excitation Control (Generator Voltage)',
    system: 'Generator',
    difficulty: 'Advanced',
    why: 'The only loop on this list that controls the ELECTRICAL machine. It sets generator terminal voltage off-line, and reactive power once synchronised \u2014 and it carries the limiters that keep the machine inside its capability curve.',
    problem: 'The same controller has to do two quite different jobs. Before synchronising, it holds terminal voltage so the machine can be matched to the grid. After the breaker closes, the grid fixes the voltage \u2014 so the same control action now pushes reactive power (MVAr) instead. Push too far either way and you damage the machine.',
    solution: 'A voltage PID driving field current, wrapped in a set of limiters that override it: OEL caps field current (rotor thermal limit), UEL stops under-excitation (stator end-core heating and loss of synchronism risk), and a V/Hz limiter protects against over-fluxing at low speed. The limiters take precedence over the AVR \u2014 they are not suggestions.',
    elements: [
      'AVR voltage PID \u2014 the main loop',
      'OEL (over-excitation limiter) \u2014 rotor thermal protection',
      'UEL (under-excitation limiter) \u2014 stator end-core and stability protection',
      'V/Hz limiter \u2014 over-fluxing protection at low speed',
      'PSS \u2014 damps power oscillations on the grid',
    ],
    nodes: [
      { id: 'vt', type: 'sensor', label: 'VT', sub: 'Terminal voltage', x: 55, y: 70 },
      { id: 'sp', type: 'demand', label: 'VOLTAGE<br/>SETPOINT', sub: 'Operator / AVR SP', x: 55, y: 195 },
      { id: 'avr', type: 'controller', label: 'AVR', sub: 'Voltage PID', x: 245, y: 130 },
      { id: 'limiters', type: 'compute', label: 'LIMITERS', sub: 'OEL / UEL / V-Hz', x: 435, y: 130 },
      { id: 'pss', type: 'controller', label: 'PSS', sub: 'Power system stabiliser', x: 435, y: 265 },
      { id: 'exciter', type: 'actuator', label: 'EXCITER', sub: 'Field current', x: 625, y: 130 },
      { id: 'gen', type: 'process', label: 'GENERATOR', sub: 'Field \u2192 V and MVAr', x: 815, y: 130 },
      { id: 'ct', type: 'sensor', label: 'CT', sub: 'Stator / field current', x: 625, y: 265 },
    ],
    edges: [
      { from: 'vt', to: 'avr', label: 'PV' },
      { from: 'sp', to: 'avr', label: 'SP' },
      { from: 'avr', to: 'limiters', label: 'MV' },
      { from: 'pss', to: 'limiters', label: 'damping', style: 'ff' },
      { from: 'limiters', to: 'exciter', label: 'limited MV', style: 'crosslimit' },
      { from: 'exciter', to: 'gen', label: 'field current' },
      { from: 'gen', to: 'vt', label: 'terminal V', style: 'feedback' },
      { from: 'ct', to: 'limiters', label: 'current feedback', style: 'feedback' },
      { from: 'gen', to: 'ct', label: '' },
    ],
    sim: {
      inputLabel: 'Excitation / reactive load (% of rated field current)',
      inputMin: 40, inputMax: 130, inputDefault: 85,
      run(field) {
        const oel = 110, uel = 55;
        const oelActive = field >= oel;
        const uelActive = field <= uel;
        const limited = Math.min(oel, Math.max(uel, field));
        const mvar = (limited - 80) * 4.5;
        const terminalV = 100 + (limited - 85) * 0.12;
        return {
          nodeValues: {
            'vt': `${terminalV.toFixed(1)} %`,
            'sp': `100.0 %`,
            'avr': `err ${(100 - terminalV).toFixed(2)} %`,
            'limiters': oelActive ? 'OEL ACTIVE' : uelActive ? 'UEL ACTIVE' : 'not limiting',
            'pss': 'damping',
            'exciter': `${limited.toFixed(0)} % field`,
            'gen': `${mvar >= 0 ? '+' : ''}${mvar.toFixed(0)} MVAr`,
            'ct': `${limited.toFixed(0)} %`,
          },
          insight: oelActive
            ? `The OVER-EXCITATION LIMITER has taken control and clamped field current at ${oel}%. The AVR is still asking for more, but the limiter overrides it \u2014 sustained over-excitation overheats the rotor winding. Note this is a LIMITER (it holds the machine at the boundary), not a trip; the loss-of-field and over-excitation protections sit behind it as separate trips.`
            : uelActive
              ? `The UNDER-EXCITATION LIMITER is active at ${uel}%. Running too far under-excited heats the stator end-core and moves the machine toward the stability limit \u2014 the region where loss of synchronism becomes a real risk.`
              : mvar > 60
                ? `Over-excited: the machine is exporting ${mvar.toFixed(0)} MVAr to the grid (supporting system voltage). Field current has headroom before the OEL.`
                : mvar < -40
                  ? `Under-excited: the machine is absorbing ${Math.abs(mvar).toFixed(0)} MVAr. Watch the margin to the UEL \u2014 this is the direction that leads toward the stability limit.`
                  : 'Normal excitation. Terminal voltage on setpoint, reactive load modest, and no limiter is active.',
        };
      },
    },
    sources: [
      'Standard AVR/excitation control architecture (voltage PID with OEL, UEL and V/Hz limiters, plus PSS)',
      'Limiter functions relate to the generator capability curve; loss-of-excitation (40) and over-excitation protections are separate trips \u2014 see this app\u2019s trip registry',
    ],
  },

};

/** Node type -> display colour token and shape hint, used by the renderer. */
/**
 * DYNAMIC SIMULATION MODELS
 * =========================
 * Each factory returns a stateful simulator: call step(dt, input) at a
 * fixed timestep and it advances the real process and controller dynamics,
 * returning live node values plus a trended primary variable.
 *
 * These are first-order-plus-dead-time process approximations with real PI
 * controllers, anti-windup and actuator rate limits. They reproduce the
 * behaviour that actually matters on each loop: which way the level moves
 * first, whether air genuinely leads fuel, and whether the cascade catches
 * a disturbance before the outlet ever sees it.
 *
 * TIME CONSTANTS are typical published magnitudes, not values from any one
 * unit. The SHAPE of the response is the accurate part; treat the exact
 * seconds as illustrative.
 */
export const LOOP_DYNAMICS = {

  // Drum level: an INTEGRATING process with inverse response (shrink/swell).
  'drum-level-3e': () => {
    const swell = new InverseResponse({ fastGain: 2.2, fastTau: 6, slowGain: -2.2, slowTau: 45 });
    const fwValve = new Lag(3, 60);
    const fwFlow = new Lag(2, 60);
    const levelInt = new Integrator(0.55, 0, -400, 400);
    const lic = new PID({ kp: 0.9, ki: 0.020, outMin: -40, outMax: 40, initialOutput: 0 });
    const fic = new PID({ kp: 1.1, ki: 0.55, outMin: 0, outMax: 100, initialOutput: 60 });
    let steamPrev = 60;
    return {
      trendLabel: 'Drum level (mm)', setpoint: 0,
      step(dt, steamDemand) {
        const dSteam = (steamDemand - steamPrev) / dt;
        steamPrev = steamDemand;
        // Shrink/swell is driven by the RATE of steam demand change.
        const swellMm = swell.step(dSteam, dt);
        const level = levelInt.y + swellMm;
        const trim = lic.step(0, level, dt);
        const fwSP = clamp(steamDemand + trim, 0, 100);
        const fwCmd = fic.step(fwSP, fwFlow.y, dt);
        const valve = fwValve.step(fwCmd, dt);
        const fw = fwFlow.step(valve, dt);
        levelInt.step((fw - steamDemand) / 100, dt);
        return {
          trend: level,
          nodeValues: {
            'lt': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'ft-steam': `${steamDemand.toFixed(0)} %`,
            'ft-fw': `${fw.toFixed(1)} %`,
            'lic': `trim ${trim >= 0 ? '+' : ''}${trim.toFixed(1)}${lic.saturated ? ' SAT' : ''}`,
            'sum': `${fwSP.toFixed(1)} %`,
            'fic': `err ${(fwSP - fw).toFixed(2)}`,
            'fcv': `${valve.toFixed(1)} % open`,
            'drum': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
          },
          insight: Math.abs(swellMm) > 1.2
            ? `SHRINK/SWELL ACTIVE \u2014 the level is reading ${swellMm > 0 ? 'HIGH (swell)' : 'LOW (shrink)'} by about ${Math.abs(swellMm).toFixed(1)} mm purely from the density change. The drum mass has not actually moved that way. A single-element controller would react to this false signal and drive feedwater the WRONG way; watch feedwater instead follow steam flow through the feedforward path.`
            : Math.abs(level) > 12
              ? `Level ${level > 0 ? 'above' : 'below'} setpoint by ${Math.abs(level).toFixed(0)} mm; the master is trimming feedwater. Level is an INTEGRATING process \u2014 it will not settle on its own, only the controller brings it back.`
              : 'Level stable at setpoint. Feedwater is matching steam flow, with the master PI trimming only small residual errors.',
        };
      },
    };
  },

  // Combustion: cross-limiting with genuinely different fuel and air dynamics.
  'combustion-cross-limit': () => {
    // Fuel is SLOW (mill grinding + transport); air is FAST (damper/fan).
    // That asymmetry is precisely why cross-limiting is needed.
    const fuelLag = new Lag(45, 70);
    const airLag = new Lag(5, 70);
    const fuelRate = new RateLimit(3, 70);
    const airRate = new RateLimit(25, 70);
    const aic = new PID({ kp: 3.0, ki: 1.4, outMin: 0, outMax: 100, initialOutput: 70 });
    const fic = new PID({ kp: 1.0, ki: 0.22, outMin: 0, outMax: 100, initialOutput: 70 });
    const o2Lag = new Lag(20, 3.2);
    return {
      trendLabel: 'Air minus fuel (%)', setpoint: 0,
      step(dt, demand) {
        const airFlow = airLag.y, fuelFlow = fuelLag.y;
        // HIGH select on air, plus the excess-air margin real schemes carry
        // so air flow stays strictly ABOVE fuel flow rather than merely equal.
        const airDemand = Math.max(demand, fuelFlow) * 1.04;
        const fuelDemand = Math.min(demand, airFlow);   // LOW select on fuel
        const airCmd = airRate.step(aic.step(airDemand, airFlow, dt), dt);
        const fuelCmd = fuelRate.step(fic.step(fuelDemand, fuelFlow, dt), dt);
        const air = airLag.step(airCmd, dt);
        const fuel = fuelLag.step(fuelCmd, dt);
        const ratio = fuel > 0.1 ? air / fuel : 2;
        const o2 = o2Lag.step(clamp((ratio - 1) * 21 + 1.2, 0.2, 12), dt);
        return {
          trend: air - fuel,
          nodeValues: {
            'master': `${demand.toFixed(0)} %`,
            'hs': `${airDemand.toFixed(1)} %`,
            'ls': `${fuelDemand.toFixed(1)} %`,
            'ratio': `${(airDemand * 1.15).toFixed(1)} %`,
            'o2': `${o2.toFixed(2)} % O\u2082`,
            'aic': `SP ${airDemand.toFixed(1)}`,
            'fic': `SP ${fuelDemand.toFixed(1)}`,
            'damper': `${airCmd.toFixed(1)} %`,
            'feeder': `${fuelCmd.toFixed(1)} %`,
            'ft-air': `${air.toFixed(1)} %`,
            'ft-fuel': `${fuel.toFixed(1)} %`,
          },
          insight: fuel > air
            ? `WARNING \u2014 fuel (${fuel.toFixed(1)}%) has moved ahead of air (${air.toFixed(1)}%). With the selectors working correctly this should not occur.`
            : air - fuel > 2
              ? `Air is LEADING fuel by ${(air - fuel).toFixed(1)}% \u2014 exactly what the HIGH select on air is for. The fuel path is far slower (mill lag ~45 s) than the air path (~5 s), so fuel cannot overrun air on a load increase.`
              : `Air ${air.toFixed(1)}%, fuel ${fuel.toFixed(1)}%, excess O\u2082 ${o2.toFixed(1)}%. Air remains on the safe side of fuel.`,
        };
      },
    };
  },

  // Steam temperature: cascade beating a large lag plus dead time.
  'steam-temp-cascade': () => {
    const sprayValve = new Lag(4, 30);
    const attempTemp = new Lag(12, 340);
    const shDead = new DeadTime(25, 0.1, 540);
    const shLag = new Lag(90, 540);
    // Master is DIRECT acting: a hotter outlet must LOWER the slave target.
    const master = new PID({ kp: 1.4, ki: 0.030, outMin: 280, outMax: 420, initialOutput: 340 });
    // Slave is REVERSE acting: a hotter attemperator outlet needs MORE spray.
    const slave = new PID({ kp: 1.6, ki: 0.09, outMin: 0, outMax: 100, initialOutput: 30, reverse: true });
    return {
      trendLabel: 'SH outlet temperature (\u00b0C)', setpoint: 540,
      step(dt, sp) {
        const outlet = shLag.y;
        const masterMV = master.step(sp, outlet, dt);
        const satTemp = 340;
        const slaveSP = Math.max(satTemp, masterMV);
        const limited = masterMV < satTemp;
        const sprayCmd = slave.step(slaveSP, attempTemp.y, dt);
        const spray = sprayValve.step(sprayCmd, dt);
        const attemp = attempTemp.step(420 - spray * 1.0, dt);
        shLag.step(shDead.step(attemp) + 200, dt);
        return {
          trend: outlet,
          nodeValues: {
            'tt-out': `${outlet.toFixed(1)} \u00b0C`,
            'tic-master': `err ${(sp - outlet).toFixed(1)} \u00b0C${master.saturated ? ' SAT' : ''}`,
            'satcalc': `${satTemp} \u00b0C`,
            'maxsel': `${slaveSP.toFixed(0)} \u00b0C`,
            'tic-slave': `SP ${slaveSP.toFixed(0)} \u00b0C`,
            'tt-spray': `${attemp.toFixed(1)} \u00b0C`,
            'spray': `${spray.toFixed(1)} % open`,
            'sh': `${outlet.toFixed(1)} \u00b0C`,
          },
          insight: limited
            ? `The MAX SELECT has clamped the slave setpoint at saturation temperature (${satTemp} \u00b0C) \u2014 the protection that stops the attemperator spraying water, rather than steam, into the superheater.`
            : `Outlet ${outlet.toFixed(1)} \u00b0C against setpoint ${sp} \u00b0C. Watch the sequence: the spray valve moves, the attemperator outlet (${attemp.toFixed(0)} \u00b0C) responds within seconds, but the final outlet only follows after ~25 s of transport delay plus a 90 s thermal lag. That gap is exactly why the cascade exists.`,
        };
      },
    };
  },

  // Mill: slow grinding dynamics with an outlet-temperature loop.
  'mill-control': () => {
    const feeder = new RateLimit(2, 70);
    const millLag = new Lag(70, 70);
    const paLag = new Lag(10, 77.5);
    const tempLag = new Lag(45, 80);
    const paPid = new PID({ kp: 1.1, ki: 0.30, outMin: 20, outMax: 100, initialOutput: 77.5 });
    const tempPid = new PID({ kp: 2.0, ki: 0.06, outMin: 0, outMax: 100, initialOutput: 55 });
    return {
      trendLabel: 'Mill outlet temperature (\u00b0C)', setpoint: 80,
      step(dt, loading) {
        const coalCmd = feeder.step(loading, dt);
        const coal = millLag.step(coalCmd, dt);
        const paSP = clamp(25 + coal * 0.75, 25, 100);   // minimum PA floor
        const paCmd = paPid.step(paSP, paLag.y, dt);
        const pa = paLag.step(paCmd, dt);
        const hotPct = tempPid.step(80, tempLag.y, dt);
        const temp = tempLag.step(45 + hotPct * 0.55 - (coal - 70) * 0.12, dt);
        const ratio = coal > 1 ? pa / coal : 2;
        return {
          trend: temp,
          nodeValues: {
            'fuel-dmd': `${loading.toFixed(0)} %`,
            'feeder': `${coalCmd.toFixed(1)} %`,
            'ratio': `${ratio.toFixed(2)} air/coal`,
            'pa-fic': `SP ${paSP.toFixed(1)} %`,
            'pa-damper': `${paCmd.toFixed(1)} %`,
            'tt-out': `${temp.toFixed(1)} \u00b0C`,
            'tic': `err ${(80 - temp).toFixed(2)} \u00b0C${tempPid.saturated ? ' SAT' : ''}`,
            'split': `hot ${hotPct.toFixed(0)}%`,
            'hot-damper': `${hotPct.toFixed(1)} % open`,
            'cold-damper': `${(100 - hotPct).toFixed(1)} % open`,
            'mill': `${temp.toFixed(1)} \u00b0C`,
          },
          insight: temp > 88
            ? `Mill outlet at ${temp.toFixed(1)} \u00b0C, climbing toward the range where coal dust in the mill becomes a fire risk. The controller is closing hot air and opening tempering air.`
            : paSP <= 26
              ? `PA flow is on its MINIMUM floor (${paSP.toFixed(0)}%) even though coal flow is only ${coal.toFixed(0)}%. Below this floor pulverised coal settles out and blocks the burner pipes \u2014 PA does not scale down proportionally with load.`
              : `Coal ${coal.toFixed(0)}%, PA ${pa.toFixed(0)}%, ratio ${ratio.toFixed(2)}. Note the mill lag (~70 s): the feeder has already moved, but coal actually reaching the burners is still catching up.`,
        };
      },
    };
  },

  // Furnace draft: fast loop with strong FD-fan feedforward.
  'furnace-draft': () => {
    const idFan = new Lag(4, 65);
    const furnace = new Lag(2.5, -5);
    // REVERSE acting: pressure ABOVE setpoint (too positive) needs MORE ID fan.
    const pic = new PID({ kp: 2.2, ki: 0.9, outMin: -30, outMax: 30, initialOutput: 0, reverse: true });
    return {
      trendLabel: 'Furnace pressure (mmWC)', setpoint: -5,
      step(dt, airDemand) {
        const trim = pic.step(-5, furnace.y, dt);
        const idCmd = clamp(airDemand + trim, 0, 100);
        const id = idFan.step(idCmd, dt);
        const press = furnace.step(-5 + (airDemand - id) * 0.9, dt);
        return {
          trend: press,
          nodeValues: {
            'pt': `${press.toFixed(2)} mmWC`,
            'pic': `trim ${trim >= 0 ? '+' : ''}${trim.toFixed(2)}${pic.saturated ? ' SAT' : ''}`,
            'ff-air': `${airDemand.toFixed(0)} %`,
            'sum': `${idCmd.toFixed(1)} %`,
            'idfan': `${id.toFixed(1)} %`,
            'furnace': `${press.toFixed(2)} mmWC`,
          },
          insight: press > 0
            ? `FURNACE PRESSURE HAS GONE POSITIVE (${press.toFixed(1)} mmWC). Hot flue gas and flame can be pushed out through inspection doors and seals. The ID fan is being driven up to recover.`
            : press < -18
              ? `Draft strongly negative (${press.toFixed(1)} mmWC) \u2014 the implosion direction. Furnace casings are far weaker this way than most people expect.`
              : `Draft ${press.toFixed(1)} mmWC, near the \u22125 mmWC setpoint. The ID fan is tracking the FD fan almost instantly through the feedforward path; the PI is trimming only ${trim.toFixed(1)}%.`,
        };
      },
    };
  },

  // Coordinated master: fast turbine against a slow boiler.
  'coordinated-master': () => {
    const boiler = new Lag(180, 75);   // boiler energy release: minutes
    const turbine = new Lag(4, 75);    // governor valves: seconds
    const pressInt = new Integrator(0.055, 170, 120, 220);
    const pic = new PID({ kp: 2.0, ki: 0.10, outMin: -25, outMax: 25, initialOutput: 0, reverse: true });
    return {
      trendLabel: 'Main steam pressure (bar)', setpoint: 170,
      step(dt, loadDemand) {
        const press = pressInt.y;
        const pTrim = pic.step(170, press, dt);
        // Low pressure (negative pTrim) must RAISE firing and EASE the
        // governor valves; getting these two signs the wrong way round
        // turns the loop into positive feedback and the pressure runs away.
        const boilerDemand = clamp(loadDemand - pTrim, 0, 110);
        const turbDemand = clamp(loadDemand + pTrim * 0.6, 0, 110);
        const b = boiler.step(boilerDemand, dt);
        const tb = turbine.step(turbDemand, dt);
        pressInt.step((b - tb) / 100, dt);
        return {
          trend: press,
          nodeValues: {
            'demand': `${loadDemand.toFixed(0)} %`,
            'pt-steam': `${press.toFixed(2)} bar`,
            'master': `${loadDemand.toFixed(0)} %`,
            'pic': `err ${(170 - press).toFixed(2)} bar${pic.saturated ? ' SAT' : ''}`,
            'boiler-dmd': `${boilerDemand.toFixed(1)} %`,
            'turb-dmd': `${turbDemand.toFixed(1)} %`,
            'firing': `${b.toFixed(1)} %`,
            'gv': `${tb.toFixed(1)} %`,
          },
          insight: Math.abs(press - 170) > 1.5
            ? `Main steam pressure is ${Math.abs(press - 170).toFixed(1)} bar ${press > 170 ? 'ABOVE' : 'BELOW'} setpoint. The turbine (4 s) moves far faster than the boiler (180 s), so energy in and energy out are mismatched \u2014 and steam pressure is the integral of that mismatch. The pressure PI is trimming both demands to close the gap.`
            : `Load ${loadDemand.toFixed(0)}%, firing ${b.toFixed(0)}%, valves ${tb.toFixed(0)}%, pressure ${press.toFixed(1)} bar. Boiler and turbine matched \u2014 coordinated control working as intended.`,
        };
      },
    };
  },

  // Turbine bypass: fast-acting, with a genuine transient on trip.
  'turbine-bypass': () => {
    const hpValve = new Lag(2.5, 10);
    const lpValve = new Lag(2.5, 9);
    const pressInt = new Integrator(1.1, 170, 120, 240);
    const pic = new PID({ kp: 2.6, ki: 0.5, outMin: 0, outMax: 100, initialOutput: 10, reverse: true });
    return {
      trendLabel: 'Main steam pressure (bar)', setpoint: 170,
      step(dt, turbineLoad) {
        const tripped = turbineLoad < 5;
        const press = pressInt.y;
        const pidOut = pic.step(170, press, dt);
        // HIGH SELECT: fast-open overrides normal PID action on a trip.
        const demand = tripped ? Math.max(pidOut, 100) : pidOut;
        const hp = hpValve.step(demand, dt);
        const lp = lpValve.step(demand * 0.9, dt);
        // Bypass is sized for essentially full boiler flow — that is what
        // lets the unit ride through a turbine trip without shutting down.
        pressInt.step((100 - turbineLoad - hp * 1.02) / 100, dt);
        return {
          trend: press,
          nodeValues: {
            'pt-ms': `${press.toFixed(2)} bar`,
            'trip': tripped ? 'TRIPPED' : 'healthy',
            'pic-hp': `err ${(170 - press).toFixed(2)}${pic.saturated ? ' SAT' : ''}`,
            'hs': `${demand.toFixed(1)} %`,
            'hp-bp': `${hp.toFixed(1)} % open`,
            'spray1': `${(hp * 0.6).toFixed(1)} % open`,
            'pic-lp': tripped ? 'FAST OPEN' : `${(demand * 0.9).toFixed(1)} %`,
            'lp-bp': `${lp.toFixed(1)} % open`,
            'cond': tripped ? 'full dump' : `${lp.toFixed(0)} % dump`,
          },
          insight: tripped
            ? `TURBINE TRIP. The fast-open signal has overridden the PID through the HIGH SELECT and both bypasses are driving wide open. Watch the trend: pressure rises as the governor valves slam shut, then the bypass catches it before the safety valves lift. Without the bypass this excursion would keep going.`
            : press > 174
              ? `Pressure rising \u2014 the turbine is not taking all the steam the boiler is making, and the bypass is opening to absorb the surplus.`
              : `Turbine taking ${turbineLoad.toFixed(0)}%, bypass ${hp.toFixed(0)}% open, pressure ${press.toFixed(1)} bar. Normal modulating control.`,
        };
      },
    };
  },

  // Deaerator: two interacting integrating loops.
  'deaerator-level': () => {
    const lvlInt = new Integrator(0.7, 0, -600, 600);
    const makeupV = new Lag(4, 100);
    const pressLag = new Lag(30, 5.0);
    const peggingV = new Lag(6, 45);
    const lic = new PID({ kp: 1.4, ki: 0.10, outMin: 0, outMax: 100, initialOutput: 100 });
    const pic = new PID({ kp: 8, ki: 1.2, outMin: 0, outMax: 100, initialOutput: 45 });
    return {
      trendLabel: 'Deaerator level (mm)', setpoint: 0,
      step(dt, drawOff) {
        const level = lvlInt.y;
        const mk = makeupV.step(lic.step(0, level, dt), dt);
        lvlInt.step((mk - drawOff) / 100, dt);
        const pg = peggingV.step(pic.step(5.0, pressLag.y, dt), dt);
        const press = pressLag.step(3.2 + pg * 0.042 - (drawOff - 100) * 0.004, dt);
        const npsh = 12 + (press - 5.0) * 8 + level * 0.006;
        return {
          trend: level,
          nodeValues: {
            'lt': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'pt': `${press.toFixed(3)} bar`,
            'lic': `err ${(-level).toFixed(1)}${lic.saturated ? ' SAT' : ''}`,
            'pic': `err ${(5.0 - press).toFixed(3)}`,
            'lcv': `${mk.toFixed(1)} % open`,
            'pcv': `${pg.toFixed(1)} % open`,
            'da': `${press.toFixed(3)} bar`,
            'bfp': `NPSH ${npsh.toFixed(2)} m`,
          },
          insight: npsh < 8
            ? `NPSH MARGIN DOWN TO ${npsh.toFixed(1)} m. The feed pumps are approaching cavitation. Deaerator level and pressure both feed BFP suction head \u2014 lose either and the pumps suffer within seconds.`
            : Math.abs(level) > 120
              ? `Level ${level > 0 ? 'high' : 'low'} at ${level.toFixed(0)} mm. This is an INTEGRATING process \u2014 makeup is ${mk.toFixed(0)}% against a draw-off of ${drawOff.toFixed(0)}%, and until those balance the level keeps moving.`
              : `Level ${level.toFixed(0)} mm, pressure ${press.toFixed(2)} bar, NPSH margin ${npsh.toFixed(1)} m. Stable, with comfortable pump suction head.`,
        };
      },
    };
  },

  // HP heater level: integrating, with an independent HH trip.
  'hp-heater-level': () => {
    const lvlInt = new Integrator(1.0, 0, -400, 400);
    const drainV = new Lag(3, 45);
    const lic = new PID({ kp: 1.1, ki: 0.16, outMin: 0, outMax: 100, initialOutput: 45 });
    let tripped = false;
    return {
      trendLabel: 'Heater level (mm)', setpoint: 0,
      step(dt, extractionFlow) {
        const level = lvlInt.y;
        if (level >= 150) tripped = true;
        if (tripped && level < 60) tripped = false;   // reset with hysteresis
        const cmd = lic.step(0, level, dt);
        const drain = drainV.step(cmd, dt);
        const condensing = tripped ? 0 : extractionFlow * 0.85;
        lvlInt.step((condensing - drain * 0.85) / 30, dt);
        return {
          trend: level,
          nodeValues: {
            'lt': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'ft-extr': `${extractionFlow.toFixed(0)} %`,
            'lic': `err ${(-level).toFixed(1)}${lic.saturated ? ' SAT' : ''}`,
            'sum': `${cmd.toFixed(1)} %`,
            'lcv': `${drain.toFixed(1)} % open`,
            'heater': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'hh-trip': tripped ? 'TRIPPED' : 'armed (150 mm)',
            'nrv': tripped ? 'CLOSED' : 'open',
          },
          insight: tripped
            ? `HIGH-HIGH TRIP OPERATED. The extraction non-return valve has closed and the heater is isolated. This acted through the INDEPENDENT protection path, not the level controller \u2014 deliberately so, because if the control loop is what failed, protection must not depend on it.`
            : level > 90
              ? `Level ${level.toFixed(0)} mm and rising toward the 150 mm HH trip, drain valve at ${drain.toFixed(0)}%. If the drain cannot keep up, the trip isolates the heater before water can back up the extraction line into the turbine.`
              : `Level ${level.toFixed(0)} mm, drain valve ${drain.toFixed(0)}%, extraction ${extractionFlow.toFixed(0)}%. Under control.`,
        };
      },
    };
  },

  // Hotwell: split-range with a genuine deadband.
  'condenser-hotwell': () => {
    const lvlInt = new Integrator(0.5, 0, -500, 500);
    const mkV = new Lag(4, 0);
    const rjV = new Lag(4, 0);
    const lic = new PID({ kp: 0.55, ki: 0.05, outMin: 0, outMax: 100, initialOutput: 50 });
    return {
      trendLabel: 'Hotwell level (mm)', setpoint: 0,
      step(dt, imbalance) {
        const level = lvlInt.y;
        const mv = lic.step(0, level, dt);
        const mkCmd = mv < 45 ? clamp((45 - mv) * 2.2, 0, 100) : 0;
        const rjCmd = mv > 55 ? clamp((mv - 55) * 2.2, 0, 100) : 0;
        const mk = mkV.step(mkCmd, dt);
        const rj = rjV.step(rjCmd, dt);
        lvlInt.step((mk - rj - imbalance) / 100, dt);
        const npsh = 9 + level * 0.012;
        const inDead = mkCmd === 0 && rjCmd === 0;
        return {
          trend: level,
          nodeValues: {
            'lt': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'lic': `MV ${mv.toFixed(1)} %${lic.saturated ? ' SAT' : ''}`,
            'split': inDead ? 'DEADBAND' : mk > rj ? 'makeup band' : 'reject band',
            'makeup': `${mk.toFixed(1)} % open`,
            'reject': `${rj.toFixed(1)} % open`,
            'hotwell': `${level >= 0 ? '+' : ''}${level.toFixed(0)} mm`,
            'cep': `NPSH ${npsh.toFixed(2)} m`,
          },
          insight: npsh < 6
            ? `CEP NPSH margin down to ${npsh.toFixed(1)} m. Makeup is at ${mk.toFixed(0)}% but level is still falling \u2014 the condensate pumps are heading toward cavitation.`
            : inDead
              ? `Level ${level.toFixed(0)} mm sits inside the DEADBAND, so BOTH valves are shut. That gap is deliberate: without it, makeup and reject would both sit part-open and cycle water back and forth continuously.`
              : `Level ${level.toFixed(0)} mm, ${mk > rj ? 'makeup ' + mk.toFixed(0) + '%' : 'reject ' + rj.toFixed(0) + '%'}. Only one valve acts at a time \u2014 never both.`,
        };
      },
    };
  },

  // AVR: fast electrical loop with hard limiters.
  'avr-excitation': () => {
    const exciter = new Lag(0.35, 85);
    const genV = new Lag(1.2, 100);
    const avr = new PID({ kp: 22, ki: 45, outMin: 40, outMax: 140, initialOutput: 85 });
    return {
      trendLabel: 'Terminal voltage (%)', setpoint: 100,
      step(dt, reactiveDemand) {
        const oel = 110, uel = 55;
        const vTerm = genV.y;
        const avrOut = avr.step(100, vTerm - (reactiveDemand - 85) * 0.10, dt);
        const oelActive = avrOut >= oel, uelActive = avrOut <= uel;
        const limited = clamp(avrOut, uel, oel);   // limiters override the AVR
        const field = exciter.step(limited, dt);
        genV.step(100 + (field - 85) * 0.12 - (reactiveDemand - 85) * 0.02, dt);
        const mvar = (field - 80) * 4.5;
        return {
          trend: vTerm,
          nodeValues: {
            'vt': `${vTerm.toFixed(2)} %`,
            'sp': '100.00 %',
            'avr': `err ${(100 - vTerm).toFixed(3)} %${avr.saturated ? ' SAT' : ''}`,
            'limiters': oelActive ? 'OEL ACTIVE' : uelActive ? 'UEL ACTIVE' : 'not limiting',
            'pss': 'damping',
            'exciter': `${field.toFixed(2)} % field`,
            'gen': `${mvar >= 0 ? '+' : ''}${mvar.toFixed(1)} MVAr`,
            'ct': `${field.toFixed(1)} %`,
          },
          insight: oelActive
            ? `OVER-EXCITATION LIMITER ACTIVE \u2014 field current clamped at ${oel}%. The AVR is still calling for more, but the limiter overrides it; sustained over-excitation overheats the rotor winding. This is a LIMITER holding the machine at its boundary, not a trip \u2014 loss-of-field and over-excitation protections sit behind it separately.`
            : uelActive
              ? `UNDER-EXCITATION LIMITER ACTIVE at ${uel}%. Running too far under-excited heats the stator end-core and moves the machine toward its stability limit.`
              : `Terminal voltage ${vTerm.toFixed(2)}%, field ${field.toFixed(0)}%, ${mvar >= 0 ? 'exporting' : 'absorbing'} ${Math.abs(mvar).toFixed(0)} MVAr. Notice how fast this loop is compared with every thermal loop \u2014 the exciter time constant is well under a second.`,
        };
      },
    };
  },
};

export const NODE_STYLES = {
  sensor: { color: 'var(--cyan)', shape: 'circle', hint: 'Measurement / transmitter' },
  controller: { color: 'var(--amber)', shape: 'rect', hint: 'PID controller' },
  compute: { color: 'var(--blue)', shape: 'diamond', hint: 'Function block (sum, select, ratio, f(x))' },
  actuator: { color: 'var(--green)', shape: 'rect', hint: 'Final control element' },
  process: { color: 'var(--text-faint)', shape: 'rect', hint: 'Physical process' },
  demand: { color: 'var(--red)', shape: 'rect', hint: 'External demand / setpoint' },
};

/** Edge style -> colour and dash pattern. */
export const EDGE_STYLES = {
  normal: { color: 'var(--line)', dash: '', label: 'Signal' },
  feedback: { color: 'var(--cyan)', dash: '4 3', label: 'Measurement feedback' },
  cascade: { color: 'var(--amber)', dash: '', label: 'Cascade setpoint' },
  ff: { color: 'var(--blue)', dash: '6 3', label: 'Feedforward' },
  crosslimit: { color: 'var(--red)', dash: '6 3', label: 'Cross-limit' },
};
