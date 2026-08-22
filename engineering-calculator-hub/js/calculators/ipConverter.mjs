// ipConverter.mjs — I/P transducer: current <-> pneumatic pressure, linear scaling.

export function currentToPressure(mA, mAMin = 4, mAMax = 20, psiMin = 3, psiMax = 15) {
  if (mAMax === mAMin) throw new Error('mA range cannot be zero span');
  const pct = (mA - mAMin) / (mAMax - mAMin);
  return psiMin + pct * (psiMax - psiMin);
}

export function pressureToCurrent(psi, mAMin = 4, mAMax = 20, psiMin = 3, psiMax = 15) {
  if (psiMax === psiMin) throw new Error('psi range cannot be zero span');
  const pct = (psi - psiMin) / (psiMax - psiMin);
  return mAMin + pct * (mAMax - mAMin);
}

export function formula() {
  return 'Output = OutMin + [(Input − InMin)/(InMax − InMin)] × (OutMax − OutMin)';
}
