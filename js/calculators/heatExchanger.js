// heatExchanger.js — LMTD and required heat transfer area, the
// calculation missing between the Thermal Plant Estimator (overall plant
// heat balance) and the individual instrumentation calculators: sizing or
// checking an actual heat exchanger from its four terminal temperatures.

// ============================================================
// LOG MEAN TEMPERATURE DIFFERENCE & REQUIRED AREA
// ============================================================
//
//   LMTD = (dT1 - dT2) / ln(dT1/dT2)
//   Q = U * A * F * LMTD  =>  A = Q / (U * F * LMTD)
//
// F (configuration correction factor) is 1.0 only for true counter-current
// or co-current flow. Shell-and-tube and cross-flow exchangers need F < 1
// from the manufacturer's or TEMA/Bowman correction charts for their
// specific pass arrangement -- not reproduced here; supply F directly.

export function lmtd({ hotInC, hotOutC, coldInC, coldOutC, flowArrangement = 'counter-current' }) {
  if (!Number.isFinite(hotInC) || !Number.isFinite(hotOutC) || !Number.isFinite(coldInC) || !Number.isFinite(coldOutC)) {
    throw new Error('All four terminal temperatures are required.');
  }
  if (hotInC <= hotOutC) throw new Error('Hot fluid inlet temperature must be greater than its outlet temperature.');
  if (coldOutC <= coldInC) throw new Error('Cold fluid outlet temperature must be greater than its inlet temperature.');

  let dT1, dT2;
  if (flowArrangement === 'counter-current') {
    dT1 = hotInC - coldOutC;
    dT2 = hotOutC - coldInC;
  } else {
    dT1 = hotInC - coldInC;
    dT2 = hotOutC - coldOutC;
  }
  if (dT1 <= 0 || dT2 <= 0) {
    throw new Error('Temperature cross detected (hot and cold curves cross) \u2014 LMTD is undefined for this arrangement; check the terminal temperatures or flow arrangement.');
  }
  const lmtdC = dT1 === dT2 ? dT1 : (dT1 - dT2) / Math.log(dT1 / dT2);
  return { dT1, dT2, lmtdC };
}

export function heatExchangerArea({ dutyKW, uValueWm2K, lmtdC, correctionFactorF = 1.0 }) {
  if (!(dutyKW > 0)) throw new Error('Heat duty must be greater than zero.');
  if (!(uValueWm2K > 0)) throw new Error('Overall heat transfer coefficient (U) must be greater than zero.');
  if (!(lmtdC > 0)) throw new Error('LMTD must be greater than zero.');
  if (!(correctionFactorF > 0 && correctionFactorF <= 1)) throw new Error('Correction factor F must be between 0 (exclusive) and 1.');
  const areaM2 = (dutyKW * 1000) / (uValueWm2K * correctionFactorF * lmtdC);
  return {
    areaM2,
    note: correctionFactorF < 1
      ? `F = ${correctionFactorF} reduces effective LMTD \u2014 required area is ${((1 / correctionFactorF - 1) * 100).toFixed(0)}% larger than a true counter-current exchanger of the same duty.`
      : 'F = 1.0 assumes true counter-current flow. Shell-and-tube and cross-flow exchangers need F from the manufacturer\u2019s or TEMA correction charts for their specific pass arrangement \u2014 using F = 1.0 for those will undersize the exchanger.',
  };
}
