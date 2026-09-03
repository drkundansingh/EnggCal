// loopDynamics.js — a small, real dynamic simulation core for the control
// loop visualisations.
//
// WHY THIS EXISTS
// The original loop visualisations were algebraic: move a slider and every
// value jumped instantly to a new steady state. That is not how a plant
// behaves, and it hides the very things these loops exist to manage —
// lag, dead time, integrating level, inverse response, overshoot and
// integral windup.
//
// HONEST SCOPE
// These are first-order-plus-dead-time (FOPDT) models — the standard
// engineering approximation used for control design and tuning. They
// reproduce the behaviour that actually matters (which way the level moves
// first, whether air genuinely leads fuel, whether the cascade catches a
// disturbance before the outlet sees it).
//
// They are NOT a plant thermodynamic model. The TIME CONSTANTS are typical
// published magnitudes for each process, not values from any specific
// unit — a 660 MW boiler and a 210 MW boiler have genuinely different
// dynamics, and both differ from yours. Treat the SHAPE of the response as
// the accurate part and the exact seconds as illustrative.

/** First-order lag: dy/dt = (u - y)/tau. The workhorse process block. */
export class Lag {
  constructor(tau, initial = 0) {
    if (!(tau > 0)) throw new Error('Lag time constant must be greater than zero.');
    this.tau = tau;
    this.y = initial;
  }
  step(u, dt) {
    // Exact discrete solution of the first-order ODE — stable at any dt,
    // unlike naive Euler which oscillates or diverges as dt approaches tau.
    const alpha = 1 - Math.exp(-dt / this.tau);
    this.y += alpha * (u - this.y);
    return this.y;
  }
  reset(v = 0) { this.y = v; return this; }
}

/** Pure dead time (transport delay) via a circular buffer. */
export class DeadTime {
  constructor(delaySec, dt, initial = 0) {
    this.n = Math.max(1, Math.round(delaySec / dt));
    this.buf = new Array(this.n).fill(initial);
    this.i = 0;
  }
  step(u) {
    const out = this.buf[this.i];
    this.buf[this.i] = u;
    this.i = (this.i + 1) % this.n;
    return out;
  }
  reset(v = 0) { this.buf.fill(v); this.i = 0; return this; }
}

/**
 * Pure integrator with limits: dy/dt = k*u.
 * This is what makes level control fundamentally different from flow or
 * temperature control — a level has no self-regulation, so any sustained
 * imbalance between in and out ramps it without limit.
 */
export class Integrator {
  constructor(gain = 1, initial = 0, min = -Infinity, max = Infinity) {
    this.k = gain; this.y = initial; this.min = min; this.max = max;
  }
  step(u, dt) {
    this.y = Math.min(this.max, Math.max(this.min, this.y + this.k * u * dt));
    return this.y;
  }
  reset(v = 0) { this.y = v; return this; }
}

/** Rate-of-change limiter — real actuators cannot slew instantly. */
export class RateLimit {
  constructor(ratePerSec, initial = 0) { this.rate = ratePerSec; this.y = initial; }
  step(u, dt) {
    const maxStep = this.rate * dt;
    this.y += Math.min(maxStep, Math.max(-maxStep, u - this.y));
    return this.y;
  }
  reset(v = 0) { this.y = v; return this; }
}

/**
 * PI/PID controller with:
 *  - output clamping
 *  - anti-windup by integral clamping (the integral stops accumulating
 *    while the output is saturated AND the error would push it further out)
 *  - derivative on measurement, so a setpoint step gives no derivative kick
 *  - optional reverse action
 *
 * Anti-windup is not a nicety. Without it a controller that saturates
 * during a large upset winds its integral far past what the process needs,
 * then holds the valve at the limit long after the error has cleared —
 * a real and common cause of overshoot in the field.
 */
export class PID {
  constructor({ kp, ki = 0, kd = 0, outMin = 0, outMax = 100, reverse = false, initialOutput = 0 }) {
    this.kp = kp; this.ki = ki; this.kd = kd;
    this.outMin = outMin; this.outMax = outMax;
    this.reverse = reverse;
    this.integral = initialOutput;
    this.prevPv = null;
    this.out = initialOutput;
    this.saturated = false;
    this.error = 0;
  }
  step(sp, pv, dt) {
    // Remember the last SP/PV so the UI can display what the controller is
    // actually comparing, rather than just its output number.
    this.sp = sp; this.pv = pv;
    let err = sp - pv;
    if (this.reverse) err = -err;

    const p = this.kp * err;

    let d = 0;
    if (this.kd > 0 && this.prevPv !== null && dt > 0) {
      const dPv = (pv - this.prevPv) / dt;
      d = -this.kd * (this.reverse ? -dPv : dPv);
    }
    this.prevPv = pv;

    const trialIntegral = this.integral + this.ki * err * dt;
    const trialOut = p + trialIntegral + d;

    if (trialOut > this.outMax) {
      this.out = this.outMax;
      this.saturated = true;
      // Only let the integral move if it is coming back OUT of saturation.
      if (err < 0) this.integral = trialIntegral;
    } else if (trialOut < this.outMin) {
      this.out = this.outMin;
      this.saturated = true;
      if (err > 0) this.integral = trialIntegral;
    } else {
      this.integral = trialIntegral;
      this.out = trialOut;
      this.saturated = false;
    }
    this.error = err;
    return this.out;
  }
  reset(output = 0) {
    this.integral = output; this.prevPv = null; this.out = output; this.saturated = false;
    return this;
  }
}

/**
 * Inverse response (right-half-plane zero) — the mathematical form of
 * shrink and swell.
 *
 * A drum level responds to a steam demand increase by first RISING (bubbles
 * expand as pressure drops) before eventually FALLING (the boiler is
 * actually losing mass). Modelled as a fast positive path summed with a
 * slower opposing path.
 *
 * This is exactly why a naive single-element level controller does the
 * wrong thing at the worst possible moment, and reproducing it is the most
 * important single dynamic in this whole set of loops.
 */
export class InverseResponse {
  constructor({ fastGain, fastTau, slowGain, slowTau }) {
    this.fast = new Lag(fastTau, 0);
    this.slow = new Lag(slowTau, 0);
    this.fastGain = fastGain;
    this.slowGain = slowGain;
  }
  step(u, dt) {
    return this.fast.step(u, dt) * this.fastGain + this.slow.step(u, dt) * this.slowGain;
  }
  reset() { this.fast.reset(0); this.slow.reset(0); return this; }
}

/** Clamp helper. */
export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
