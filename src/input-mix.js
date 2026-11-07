// Per-axis arbitration between the physical pad and the on-screen controls.
// Pure: no DOM, no BLE, no timers.
//
// See docs/DESIGN-NOTES.md § Arbitration is per axis, and engagement is post-deadzone

export function createInputMix({ deadzone = 0 } = {}) {
  const touch = new Map();   // axis -> value
  const seq = new Map();     // axis -> { pad, touch } engagement order
  let tick = 0;

  const dz = () => (typeof deadzone === 'function' ? deadzone() : deadzone);
  // `resolve` read `seq.get(axis) ?? {}` without storing it, so the record has
  // to be created before it can be mutated in place.
  const record = (axis) => {
    let s = seq.get(axis);
    if (!s) { s = { pad: 0, touch: 0 }; seq.set(axis, s); }
    return s;
  };
  const past = (v) => Math.abs(v) > dz();

  return {
    setTouch(axis, value) {
      if (!touch.has(axis) || !past(touch.get(axis))) {
        if (past(value)) record(axis).touch = ++tick;
      }
      touch.set(axis, value);
    },

    releaseTouch(axis) {
      touch.delete(axis);
      const s = seq.get(axis);
      if (s) s.touch = 0;
    },

    releaseAll() {
      touch.clear();
      for (const s of seq.values()) s.touch = 0;
    },

    // Mutates the stored record rather than replacing it: `resolve` runs once
    // per axis per frame from the poll loop, and the spread allocated a fresh
    // object on each of those. Nothing outside this closure holds a reference.
    resolve(axis, padValue) {
      const s = record(axis);
      if (past(padValue)) { if (!s.pad) s.pad = ++tick; }
      else s.pad = 0;

      const t = touch.get(axis);
      const touchLive = t !== undefined && past(t);
      if (!touchLive) return padValue;

      return (s.touch ?? 0) >= (s.pad ?? 0) ? t : padValue;
    },

    engaged(axis) {
      const t = touch.get(axis);
      return t !== undefined && past(t);
    },

    anyEngaged() {
      for (const v of touch.values()) if (past(v)) return true;
      return false;
    },
  };
}
