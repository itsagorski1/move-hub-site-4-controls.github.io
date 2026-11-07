// Pure gamepad mapping: W3C "standard mapping" indices and action bindings.
// No DOM, no BLE.

import { clampPercent } from './control-math.js';

export const BUTTON_NAMES = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
  'Back', 'Start', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Guide',
];
export const AXIS_NAMES = ['L-Stick X', 'L-Stick Y', 'R-Stick X', 'R-Stick Y'];

// Every action the car exposes. `kind` decides how the raw source is read:
//   'axis'   -> continuous -1..1
//   'pair'   -> positive source minus negative source (triggers)
//   'button' -> boolean pressed
// `modes` is the drive modes an action commands anything in. It is what the
// mapping panel filters on: a binding outside the shown mode is kept and
// dimmed, never dropped.
// See docs/DESIGN-NOTES.md § The mapping panel names controls, not indices
export const DRIVE_MODES = ['playvm', 'linked', 'independent', 'tracked'];
const ANY = DRIVE_MODES;
const WHEELED = ['playvm', 'linked', 'independent'];

export const ACTIONS = [
  { id: 'steer', label: 'Steer', kind: 'axis', group: 'drive', modes: WHEELED },
  { id: 'throttle', label: 'Throttle A', kind: 'pair', group: 'drive', modes: WHEELED },
  { id: 'throttleB', label: 'Throttle B', kind: 'axis', group: 'drive', modes: ['independent'] },
  { id: 'tankTurn', label: 'Tank turn', kind: 'axis', group: 'drive', modes: ['tracked'] },
  { id: 'tankThrottle', label: 'Tank throttle', kind: 'axis', group: 'drive', modes: ['tracked'] },
  { id: 'tankSteer', label: 'Steer motor — raw', kind: 'axis', group: 'drive', modes: ['tracked'] },
  { id: 'brake', label: 'Brake', kind: 'button', group: 'drive', modes: ANY },
  { id: 'driveModeToggle', label: 'Toggle linked/independent drive', kind: 'button', group: 'setup', modes: ANY },
  { id: 'steerModeToggle', label: 'Toggle raw/steer mode', kind: 'button', group: 'setup', modes: ANY },
  { id: 'steerZero', label: 'Set steering zero', kind: 'button', group: 'setup', modes: ANY },
  { id: 'ledCycle', label: 'Cycle RGB LED', kind: 'button', group: 'lights', modes: ANY },
  { id: 'lightsToggle', label: 'All lights on/off', kind: 'button', group: 'lights', modes: ANY },
  { id: 'lamp1', label: 'Lamp 1', kind: 'button', group: 'lights', modes: ANY },
  { id: 'lamp2', label: 'Lamp 2', kind: 'button', group: 'lights', modes: ANY },
  { id: 'lamp3', label: 'Lamp 3', kind: 'button', group: 'lights', modes: ANY },
  { id: 'lamp4', label: 'Lamp 4', kind: 'button', group: 'lights', modes: ANY },
  { id: 'lamp5', label: 'Lamp 5', kind: 'button', group: 'lights', modes: ANY },
  { id: 'lamp6', label: 'Lamp 6', kind: 'button', group: 'lights', modes: ANY },
  { id: 'trimLeft', label: 'Trim steer left', kind: 'button', group: 'drive', modes: ANY },
  { id: 'trimRight', label: 'Trim steer right', kind: 'button', group: 'drive', modes: ANY },
  // Analog: the trigger's travel is the braking force, not an on/off.
  // See docs/DESIGN-NOTES.md § Proportional braking is an experiment, not a fact
];

// A pair action is two assignable halves: one control commands each direction.
// The halves are what the panel offers, so a gripper's open and close can sit
// on different shoulders without either being "the pair".
const HALF_LABELS = {
  throttle: ['Throttle A — forward', 'Throttle A — reverse'],
};

// One assignable entry per thing a control can be given. `key` is what the
// panel stores: an action id, or `id:pos` / `id:neg` for a pair half.
export function assignable() {
  const out = [];
  for (const a of ACTIONS) {
    if (a.kind !== 'pair') {
      out.push({ key: a.id, actionId: a.id, side: null, label: a.label, kind: a.kind, group: a.group, modes: a.modes });
      continue;
    }
    const [posLabel, negLabel] = HALF_LABELS[a.id] || [`${a.label} +`, `${a.label} −`];
    out.push({ key: `${a.id}:pos`, actionId: a.id, side: 'pos', label: posLabel, kind: a.kind, group: a.group, modes: a.modes });
    out.push({ key: `${a.id}:neg`, actionId: a.id, side: 'neg', label: negLabel, kind: a.kind, group: a.group, modes: a.modes });
  }
  return out;
}

// Backward-compatible: existing maps store one binding; multi-control maps store up to four.
export function sourcesOf(binding) {
  return Array.isArray(binding) ? binding.filter(Boolean) : binding ? [binding] : [];
}

function sourceOf(map, entry) {
  const b = map[entry.actionId];
  return entry.side ? b?.[entry.side] ?? null : b ?? null;
}

function isSame(a, b) {
  return !!a && !!b && a.type === b.type && a.index === b.index;
}

function matches(a, b, mod = null) {
  return isSame(a, b) && (a.mod ?? null) === mod;
}

// Return up to four sources, discarding the oldest when all slots are used.
function appendSource(existing, src) {
  const values = sourcesOf(existing).filter((b) => !matches(b, src, src.mod ?? null));
  values.push(src);
  return values.length === 1 ? values[0] : values.slice(-4);
}

// The panel reads the map backwards: for a control, what does it do? The map
// itself stays action-keyed, because that is what resolveActions reads on the
// hot path.
//
// A list, not one entry: the right stick's Y axis carries throttle B and the
// arm, deliberately, because only one of them commands anything in any given
// drive mode.
// See docs/DESIGN-NOTES.md § The right stick's Y axis is shared, and that is fine
export function bindingsOf(map, control, mod = null) {
  return assignable().filter((e) => {
    const src = sourceOf(map, e);
    return sourcesOf(src).some((s) => matches(s, control.source, mod));
  });
}

// Assigning moves the action off whatever else held it, and leaves the rest of
// this control's actions alone.
export function assignControl(map, control, key, mod = null) {
  const next = structuredClone(map);
  const entry = assignable().find((e) => e.key === key);
  if (!entry) return next;
  const src = { ...control.source };
  // The stick's negative-up correction rides the binding for the same reason
  // the defaults carry it: readSource is a lookup, not a policy.
  if (src.type === 'axis' && control.invertY) src.invert = true;
  if (mod != null) src.mod = mod;
  if (entry.side) {
    const cur = next[entry.actionId];
    next[entry.actionId] = { pos: cur?.pos ?? null, neg: cur?.neg ?? null, [entry.side]: appendSource(cur?.[entry.side], src) };
  } else {
    next[entry.actionId] = appendSource(next[entry.actionId], src);
  }
  return next;
}

// Take one action off a control, leaving anything else it carries.
export function unassign(map, key) {
  const next = structuredClone(map);
  const entry = assignable().find((e) => e.key === key);
  if (entry) clearEntry(next, entry);
  return next;
}

// Remove only this physical source from this action, not its other binding.
export function unassignControl(map, control, key, mod = null) {
  const next = structuredClone(map);
  const entry = assignable().find((e) => e.key === key);
  if (!entry) return next;
  const remove = (binding) => collapse(sourcesOf(binding).filter(
    (src) => !matches(src, control.source, mod)));
  const original = next[entry.actionId];
  if (entry.side) {
    if (!original) return next;
    const pos = entry.side === 'pos' ? remove(original.pos) : original.pos ?? null;
    const neg = entry.side === 'neg' ? remove(original.neg) : original.neg ?? null;
    next[entry.actionId] = pos || neg ? { pos, neg } : null;
  } else {
    next[entry.actionId] = remove(original);
  }
  return next;
}

export function clearControl(map, control, mod = null) {
  const next = structuredClone(map);
  clearIn(next, control.source, mod);
  return next;
}

// A modifier is a button, held. Turning one on empties that button of its own
// bindings — a shift key that also does something is a shift key nobody trusts.
// Turning it off takes its whole layer with it.
// See docs/DESIGN-NOTES.md § A modifier is a held button, not a mode
export function setModifier(map, control, on) {
  const next = structuredClone(map);
  const mods = new Set(modifiersOf(next));
  if (control.source.type !== 'button') return next;
  if (on) {
    mods.add(control.source.index);
    for (const mod of [null, ...mods]) clearIn(next, control.source, mod);
  } else {
    mods.delete(control.source.index);
    for (const action of ACTIONS) {
      const b = next[action.id];
      if (!b) continue;
      if (action.kind === 'pair') {
        const pos = withoutModifier(b.pos, control.source.index);
        const neg = withoutModifier(b.neg, control.source.index);
        next[action.id] = pos || neg ? { pos, neg } : null;
      } else {
        next[action.id] = withoutModifier(b, control.source.index);
      }
    }
  }
  next.modifiers = [...mods].sort((a, b) => a - b);
  return next;
}

function collapse(items) {
  return items.length === 0 ? null : items.length === 1 ? items[0] : items;
}
function withoutModifier(binding, mod) {
  return collapse(sourcesOf(binding).filter((src) => src.mod !== mod));
}
function clearEntry(map, entry) {
  const b = map[entry.actionId];
  if (!b) return;
  if (!entry.side) { map[entry.actionId] = null; return; }
  const pos = entry.side === 'pos' ? null : b.pos ?? null;
  const neg = entry.side === 'neg' ? null : b.neg ?? null;
  map[entry.actionId] = pos || neg ? { pos, neg } : null;
}
function clearIn(map, source, mod = null) {
  const remove = (binding) => collapse(sourcesOf(binding).filter((b) => !matches(b, source, mod)));
  for (const a of ACTIONS) {
    const b = map[a.id];
    if (!b) continue;
    if (a.kind === 'pair') {
      const pos = remove(b.pos);
      const neg = remove(b.neg);
      map[a.id] = pos || neg ? { pos, neg } : null;
    } else {
      map[a.id] = remove(b);
    }
  }
}

// See docs/DESIGN-NOTES.md § The default bindings follow driving-game convention
export const DEFAULT_MAP = {
  steer: { type: 'axis', index: 0 },
  // Left stick Y, not the triggers: one stick drives and steers, which is what
  // a phone-sized model in the middle of a room actually wants. Stick Y is
  // negative-up in the standard mapping, hence the inversion.
  throttle: { pos: { type: 'axis', index: 1, invert: true }, neg: null },
  // Stick Y is negative-up in the standard mapping, so inverted for up = forward.
  throttleB: { type: 'axis', index: 3, invert: true },
  // Tracked mode: X counter-rotates the tracks, Y drives them. Deliberately NOT
  // inverted despite negative-up — tankMix and the mirrored-motor inversion
  // flip it back. See docs/DESIGN-NOTES.md § Tracked mode needs a mirrored drive motor to make sense
  tankTurn: { type: 'axis', index: 0 },
  tankThrottle: { type: 'axis', index: 1 },
  // RIGHT stick, and it must stay off the left one.
  // See docs/DESIGN-NOTES.md § The steering motor gets its own stick in tracked mode
  tankSteer: { type: 'axis', index: 2 },
  brake: { type: 'button', index: 0 },           // A — Forza handbrake slot
  // LT, read as pressure. Kept alongside the A-button brake rather than
  // replacing it, so the two can be felt against each other on one drive.
  steerModeToggle: { type: 'button', index: 1 }, // B
  driveModeToggle: { type: 'button', index: 9 }, // Start — mode switches
  steerZero: { type: 'button', index: 8 },       // Back — destructive, hold-guarded
  ledCycle: { type: 'button', index: 3 },        // Y — cosmetic
  lightsToggle: { type: 'button', index: 15 },   // D-Right — GTA headlights slot
  lamp1: { type: 'button', index: 12 },          // D-Up
  lamp2: { type: 'button', index: 13 },          // D-Down
  lamp3: { type: 'button', index: 14 },          // D-Left
  lamp4: { type: 'button', index: 2 },           // X
  lamp5: { type: 'button', index: 10 },          // L3
  lamp6: { type: 'button', index: 11 },          // R3
  trimLeft: { type: 'button', index: 4 },        // LB
  trimRight: { type: 'button', index: 5 },       // RB
};

// Actions destructive mid-drive: held, not tapped. Milliseconds.
export const HOLD_ACTIONS = { steerZero: 1000 };

export function readSource(gp, src) {
  if (!src) return 0;
  let v;
  if (src.type === 'axis') v = gp.axes[src.index] ?? 0;
  else v = gp.buttons[src.index]?.value ?? 0;
  return src.invert ? -v : v;
}

// `into` lets the poll loop hand in a buffer it owns rather than allocate one
// object with a key per action on every frame. Every key is written
// unconditionally, so a reused object never carries a value from last frame.
// Modifiers: a button that, while held, gives the other controls a second set
// of bindings. Stored as button indices on the map, so a layer with nothing in
// it yet still survives a reload.
// See docs/DESIGN-NOTES.md § A modifier is a held button, not a mode
export function modifiersOf(map) {
  return Array.isArray(map?.modifiers) ? map.modifiers : EMPTY;
}
const EMPTY = [];

// Scratch, reused every frame: the loop runs at 60 Hz and a modifier held down
// is the common case, not the rare one.
const heldMods = [];
const shadowed = new Set();
const sourceKey = (src) => (src.type === 'axis' ? 1000 + src.index : src.index);

// Which sources the held modifiers take over. Only walked while something is
// held, so the ordinary frame pays one array check for all of this.
function shadowFrame(gp, map) {
  heldMods.length = 0;
  shadowed.clear();
  const mods = modifiersOf(map);
  for (let i = 0; i < mods.length; i++) {
    if ((gp.buttons[mods[i]]?.value ?? 0) > 0.5) heldMods.push(mods[i]);
  }
  if (!heldMods.length) return false;
  // A held modifier commands nothing itself — it is the shift key.
  for (let i = 0; i < heldMods.length; i++) shadowed.add(heldMods[i]);
  for (const action of ACTIONS) {
    const b = map[action.id];
    if (!b) continue;
    const values = action.kind === 'pair'
      ? [...sourcesOf(b.pos), ...sourcesOf(b.neg)] : sourcesOf(b);
    for (const src of values) {
      if (src.mod != null && heldMods.includes(src.mod)) shadowed.add(sourceKey(src));
    }
  }
  return true;
}

// A binding reads zero unless its layer is the live one: a modified binding
// needs its modifier held, and a plain one is displaced by any modified binding
// on the same control.
function live(src, layered) {
  if (!src) return false;
  if (src.mod != null) return layered && heldMods.includes(src.mod);
  return !(layered && shadowed.has(sourceKey(src)));
}

export function resolveActions(gp, map, into = {}) {
  const out = into;
  const layered = shadowFrame(gp, map);
  const strongest = (binding) => {
    let result = 0;
    for (const src of sourcesOf(binding)) {
      if (!live(src, layered)) continue;
      const value = readSource(gp, src);
      if (Math.abs(value) > Math.abs(result)) result = value;
    }
    return result || 0;
  };
  for (const action of ACTIONS) {
    const binding = map[action.id];
    if (action.kind === 'pair') {
      out[action.id] = (strongest(binding?.pos) - strongest(binding?.neg)) || 0;
    } else if (action.kind === 'axis') {
      out[action.id] = strongest(binding);
    } else {
      out[action.id] = sourcesOf(binding).some((src) => live(src, layered) && readSource(gp, src) > 0.5);
    }
  }
  return out;
}

export function learnBinding(gp, prev, threshold = 0.5) {
  for (let i = 0; i < gp.buttons.length; i++) {
    const now = gp.buttons[i].value;
    const was = prev?.buttons?.[i] ?? 0;
    if (now > 0.5 && was <= 0.5) return { type: 'button', index: i };
  }
  for (let i = 0; i < gp.axes.length; i++) {
    const now = gp.axes[i] ?? 0;
    const was = prev?.axes?.[i] ?? 0;
    if (Math.abs(now) > threshold && Math.abs(now - was) > threshold) return { type: 'axis', index: i };
  }
  return null;
}

export function sourceLabel(src) {
  if (!src) return '—';
  if (Array.isArray(src)) return src.map(sourceLabel).join(' / ');
  if (src.type === 'axis') return `${AXIS_NAMES[src.index] ?? 'Axis ' + src.index}${src.invert ? ' (inv)' : ''}`;
  return BUTTON_NAMES[src.index] ?? `Btn ${src.index}`;
}

// Tank / skid-steer mixing from a single stick, using WPILib's desaturation:
// inputs are scaled down BEFORE summing, not clipped after.
// See docs/DESIGN-NOTES.md § Tank mixing desaturates instead of clipping
export function tankMix(throttle, turn) {
  const t = clampPercent(throttle) / 100;
  const s = clampPercent(turn) / 100;
  const greater = Math.max(Math.abs(t), Math.abs(s));
  const lesser = Math.abs(t) + Math.abs(s) - greater;
  const saturated = greater > 0 ? (lesser / greater) + 1 : 1;
  const ts = t / saturated;
  const ss = s / saturated;
  return { left: Math.round((ts + ss) * 100), right: Math.round((ts - ss) * 100) };
}
