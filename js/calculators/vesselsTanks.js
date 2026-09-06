// vesselsTanks.js — storage tank volume and pressure vessel wall stress.

// ============================================================
// 1. HORIZONTAL CYLINDRICAL TANK — PARTIAL VOLUME
// ============================================================
//
// Classic tank-dipping / strapping-chart geometry: the liquid cross-
// section at fill depth h is a circular segment, not a simple fraction of
// the circle area -- which is exactly why tank levels don't read linearly
// against volume for a horizontal cylinder. Exact geometry, no
// approximation, and no allowance for dished/domed end caps (those add a
// small extra volume this does not include).

export function horizontalTankVolume({ diameterM, lengthM, fillDepthM }) {
  if (!(diameterM > 0)) throw new Error('Tank diameter must be greater than zero.');
  if (!(lengthM > 0)) throw new Error('Tank (shell) length must be greater than zero.');
  if (!(fillDepthM >= 0)) throw new Error('Fill depth cannot be negative.');
  const r = diameterM / 2;
  if (!(fillDepthM <= diameterM)) throw new Error('Fill depth cannot exceed the tank diameter.');

  const totalVolumeM3 = Math.PI * r ** 2 * lengthM;
  let filledVolumeM3;
  if (fillDepthM <= 0) {
    filledVolumeM3 = 0;
  } else if (fillDepthM >= diameterM) {
    filledVolumeM3 = totalVolumeM3;
  } else {
    const theta = 2 * Math.acos((r - fillDepthM) / r);
    const segmentAreaM2 = (r ** 2 * (theta - Math.sin(theta))) / 2;
    filledVolumeM3 = segmentAreaM2 * lengthM;
  }
  return {
    totalVolumeM3, filledVolumeM3,
    fillPct: (filledVolumeM3 / totalVolumeM3) * 100,
    note: 'End caps (dished/domed heads) are not included \u2014 this is shell volume only. A real strapping table also accounts for head volume, which becomes proportionally significant on shorter vessels.',
  };
}

// ============================================================
// 2. VERTICAL TANK — VOLUME (cylindrical shell + optional heads)
// ============================================================

export function verticalTankVolume({ diameterM, cylinderHeightM, headType = 'flat' }) {
  if (!(diameterM > 0)) throw new Error('Tank diameter must be greater than zero.');
  if (!(cylinderHeightM > 0)) throw new Error('Cylinder (shell) height must be greater than zero.');
  if (!['flat', 'hemispherical', 'conical'].includes(headType)) {
    throw new Error("Head type must be 'flat', 'hemispherical', or 'conical'.");
  }
  const r = diameterM / 2;
  const cylinderVolumeM3 = Math.PI * r ** 2 * cylinderHeightM;
  let headVolumeM3 = 0;
  if (headType === 'hemispherical') {
    // Two hemispherical heads (top + bottom) = one full sphere's volume.
    headVolumeM3 = (4 / 3) * Math.PI * r ** 3;
  } else if (headType === 'conical') {
    // Two cones, each with height = radius (a common approximation when a
    // specific cone angle isn't given) -- state this plainly rather than
    // silently assuming it.
    headVolumeM3 = 2 * (1 / 3) * Math.PI * r ** 2 * r;
  }
  return {
    cylinderVolumeM3, headVolumeM3, totalVolumeM3: cylinderVolumeM3 + headVolumeM3,
    note: headType === 'conical'
      ? 'Conical head volume assumes cone height equal to the tank radius (a 45\u00b0 cone half-angle) \u2014 for a different cone angle, calculate that head volume separately and add it to the cylinder volume shown here.'
      : headType === 'hemispherical'
        ? 'ASME F&D (2:1 semi-elliptical) heads, the more common real vessel head type, hold LESS volume than true hemispherical heads \u2014 this will overstate volume for that case. Use hemispherical only when the heads genuinely are hemispherical.'
        : undefined,
  };
}

// ============================================================
// 3. THIN-WALL PRESSURE VESSEL — ASME VIII DIV. 1, UG-27
// ============================================================
//
// t = PR / (SE - 0.6P)   [circumferential/hoop stress governs; this is
// almost always the limiting case over the longitudinal stress equation,
// which allows roughly double the pressure for the same thickness]
//
// This is the actual ASME Section VIII Division 1 formula (not the
// further-simplified textbook thin-wall approximation P·D/2t, which
// omits the 0.6P term and becomes progressively less accurate as
// thickness increases relative to radius).

export function vesselWallThickness({ designPressureMPa, insideRadiusMm, allowableStressMPa, jointEfficiencyE = 1.0, corrosionAllowanceMm = 0 }) {
  if (!(designPressureMPa > 0)) throw new Error('Design pressure must be greater than zero.');
  if (!(insideRadiusMm > 0)) throw new Error('Inside radius must be greater than zero.');
  if (!(allowableStressMPa > 0)) throw new Error('Allowable stress must be greater than zero.');
  if (!(jointEfficiencyE > 0 && jointEfficiencyE <= 1)) throw new Error('Joint efficiency E must be between 0 and 1.');
  if (!(corrosionAllowanceMm >= 0)) throw new Error('Corrosion allowance cannot be negative.');

  const denom = allowableStressMPa * jointEfficiencyE - 0.6 * designPressureMPa;
  if (!(denom > 0)) throw new Error('Design pressure is too high relative to allowable stress and joint efficiency \u2014 the circumferential stress equation has no valid (positive) solution here. This usually means a higher stress material, thicker starting assumption, or a different vessel category is needed.');

  const tCircumferentialMm = (designPressureMPa * insideRadiusMm) / denom;
  const tLongitudinalMm = (designPressureMPa * insideRadiusMm) / (2 * allowableStressMPa * jointEfficiencyE + 0.4 * designPressureMPa);
  const governingMm = Math.max(tCircumferentialMm, tLongitudinalMm);
  const totalMm = governingMm + corrosionAllowanceMm;

  return {
    tCircumferentialMm, tLongitudinalMm, governingMm, totalMm,
    governingCase: tCircumferentialMm >= tLongitudinalMm ? 'circumferential (hoop) stress' : 'longitudinal stress',
    note: 'ASME Section VIII Division 1, UG-27 thin-wall formula (P/SE \u2264 0.385 for this equation to apply). This does not cover external pressure/buckling, nozzle reinforcement, or thick-wall (Division 2/Appendix 1) cases \u2014 real vessel design needs the full code applied by a qualified pressure vessel engineer.',
  };
}
