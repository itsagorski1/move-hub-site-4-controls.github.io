// Pure control-input math: deadzone, response curve, axis mapping. No DOM.

export function applyDeadzone(value, threshold = 0.15) {
  const a = Math.abs(value);
  if (a <= threshold) return 0;
  const scaled = (a - threshold) / (1 - threshold);
  return Math.sign(value) * scaled;
}

// A motor percentage, bounded. Rounding is the caller's: the hub's encoders
// want a truncated value and the combined frame wants a rounded one, and
// folding either in here would silently change one of them.
export function clampPercent(value) {
  return Math.max(-100, Math.min(100, value));
}

// A unit interval, with a finite guard that does NOT coerce: anything that is
// not already a finite number is zero, a string included. That strictness is
// the mixer's, and it is load-bearing — a test pins it — so this helper keeps
// it rather than quietly widening what reaches the motor.
//
// Named for what it does rather than for where it started. `clampAudible` in
// the haptics driver is the neighbouring one: it coerces AND applies a
// perceptual floor. Two functions, two names, two behaviours — which is the
// whole point, since all three of these once shared one name.
// See docs/DESIGN-NOTES.md § One name for one behaviour
export function clampUnit(value) {
  return Number.isFinite(value) ? (value > 0 ? (value < 1 ? value : 1) : 0) : 0;
}

export function expCurve(value, exponent = 2) {
  return Math.sign(value) * Math.pow(Math.abs(value), exponent);
}

export function axisToSpeed(axis) {
  return Math.round(expCurve(applyDeadzone(axis)) * 100);
}

export function axisToSteer(axis) {
  return Math.round(expCurve(applyDeadzone(axis)) * 100);
}

// Above this speed the stop is staged: coast to shed energy, then brake.
// See docs/DESIGN-NOTES.md § Braking from speed browns out the hub
export function needsStagedBrake(lastSpeed, threshold = 50) {
  return Math.abs(lastSpeed ?? 0) > threshold;
}

// Below `min` a motor only stalls and buzzes, so treat it as a stop.
// See docs/DESIGN-NOTES.md § Below the stall threshold, jitter re-triggers the staged brake
export function applyMinPower(value, min) {
  return Math.abs(value) < min ? 0 : value;
}
