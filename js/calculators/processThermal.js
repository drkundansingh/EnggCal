// processThermal.js — insulation heat loss, thermal expansion, gas
// compression work. Standard heat transfer and thermodynamics equations.

// ============================================================
// 1. PIPE/VESSEL INSULATION HEAT LOSS (cylindrical, steady-state)
// ============================================================
//
// 1D steady-state radial conduction through a cylindrical insulation
// layer, in series with convective heat transfer from the insulation
// surface to ambient air -- the standard textbook thermal-resistance
// network for insulated pipe (Incropera, Holman). Ignores axial
// conduction, radiation, and any jacket/cladding thermal resistance.

export function insulationHeatLoss({ pipeOutsideDiaMm, insulationThicknessMm, thermalConductivityWmK, surfaceHeatTransferCoeffWm2K, pipeTempC, ambientTempC }) {
  if (!(pipeOutsideDiaMm > 0)) throw new Error('Pipe outside diameter must be greater than zero.');
  if (!(insulationThicknessMm > 0)) throw new Error('Insulation thickness must be greater than zero.');
  if (!(thermalConductivityWmK > 0)) throw new Error('Insulation thermal conductivity (k) must be greater than zero.');
  if (!(surfaceHeatTransferCoeffWm2K > 0)) throw new Error('Surface heat transfer coefficient (h) must be greater than zero.');

  const rInM = (pipeOutsideDiaMm / 2) / 1000;
  const rOutM = rInM + insulationThicknessMm / 1000;
  const deltaT = pipeTempC - ambientTempC;

  const rInsulation = Math.log(rOutM / rInM) / (2 * Math.PI * thermalConductivityWmK);
  const rConvection = 1 / (surfaceHeatTransferCoeffWm2K * 2 * Math.PI * rOutM);
  const heatLossWm = deltaT / (rInsulation + rConvection);
  const surfaceTempC = ambientTempC + heatLossWm * rConvection;

  return {
    rInsulationMK_W: rInsulation, rConvectionMK_W: rConvection,
    heatLossWm, surfaceTempC, outsideDiaWithInsulationMm: rOutM * 2000,
    note: 'Steady-state 1D radial conduction + surface convection only \u2014 does not include radiation heat loss (significant at higher surface temperatures) or thermal bridging at supports, flanges and fittings, which real installations always have.',
  };
}

// ============================================================
// 2. THERMAL (LINEAR) EXPANSION
// ============================================================

export const LINEAR_EXPANSION_COEFF = {
  'Carbon steel': 12.0e-6, 'Stainless steel (304/316)': 17.3e-6,
  'Copper': 17.0e-6, 'Aluminum': 23.1e-6, 'Cast iron': 10.5e-6,
  'PVC': 52.0e-6, 'HDPE': 140.0e-6,
};

export function thermalExpansion({ originalLengthM, coeffPerC, tempChangeC }) {
  if (!(originalLengthM > 0)) throw new Error('Original length must be greater than zero.');
  if (!(coeffPerC > 0)) throw new Error('Coefficient of linear thermal expansion must be greater than zero.');
  const expansionM = originalLengthM * coeffPerC * tempChangeC;
  return {
    expansionMm: expansionM * 1000,
    finalLengthM: originalLengthM + expansionM,
  };
}

// ============================================================
// 3. GAS COMPRESSION WORK (ideal gas, isothermal & adiabatic/polytropic)
// ============================================================
//
//   Isothermal:  W = nRT \u00b7 ln(P2/P1)
//   Adiabatic/polytropic: W = [n/(n-1)] \u00b7 nRT1 \u00b7 [(P2/P1)^((n-1)/n) - 1]
//
// Ideal-gas, reversible compression work -- a theoretical bound, useful
// for estimating compressor power, not a substitute for a manufacturer's
// actual compressor performance curve (which includes real mechanical
// and volumetric efficiency losses).

export function gasCompressionWork({ moleFlowMolS, massFlowKgS, molecularWeightGMol, tempInK, p1Bar, p2Bar, polytropicIndex = 1.4, mode = 'adiabatic' }) {
  let molFlow = moleFlowMolS;
  if ((molFlow === undefined || molFlow === null || molFlow === '') && massFlowKgS !== undefined && massFlowKgS !== null && massFlowKgS !== '') {
    if (!(massFlowKgS > 0)) throw new Error('Mass flow rate must be greater than zero.');
    if (!(molecularWeightGMol > 0)) throw new Error('Molecular weight must be greater than zero to convert mass flow to molar flow.');
    molFlow = (massFlowKgS * 1000) / molecularWeightGMol; // kg/s -> g/s -> mol/s
  }
  if (!(molFlow > 0)) throw new Error('Provide either molar flow rate, or mass flow rate with molecular weight.');
  if (!(tempInK > 0)) throw new Error('Inlet temperature (absolute) must be greater than zero.');
  if (!(p1Bar > 0) || !(p2Bar > 0)) throw new Error('Both pressures must be greater than zero.');
  if (!(p2Bar > p1Bar)) throw new Error('Outlet pressure must be greater than inlet pressure for compression.');
  if (mode === 'adiabatic' && !(polytropicIndex > 1)) throw new Error('Polytropic/adiabatic index (n) must be greater than 1.');

  const R = 8.314; // J/(mol.K)
  const ratio = p2Bar / p1Bar;
  let workJPerMol;
  if (mode === 'isothermal') {
    workJPerMol = R * tempInK * Math.log(ratio);
  } else {
    const n = polytropicIndex;
    workJPerMol = (n / (n - 1)) * R * tempInK * (Math.pow(ratio, (n - 1) / n) - 1);
  }
  const powerW = workJPerMol * molFlow;
  return {
    workJPerMol, powerW, powerKW: powerW / 1000, moleFlowUsedMolS: molFlow,
    note: mode === 'isothermal'
      ? 'Isothermal work is the theoretical MINIMUM for a given compression ratio \u2014 real machines run closer to adiabatic/polytropic, needing more power than this.'
      : 'Ideal-gas reversible compression work \u2014 excludes real compressor mechanical and volumetric efficiency losses. Actual shaft power is higher; use a manufacturer\u2019s performance curve for a real machine.',
  };
}
