// Crash guard toggle and its reaction mode. Off by default: it costs an
// accelerometer subscription.
//
// The label is rendered from the guard, never from the click that caused it —
// the guard is armed and disarmed by things other than this button, and macros
// take its mode for the length of a run.
// See docs/DESIGN-NOTES.md § The filtering happens in the hub, not here
// See docs/DESIGN-NOTES.md § The crash guard's mode belongs on screen

import { $, setToggle } from './dom.js';

const MODE_KEY = 'lego-collision-mode-v1';
const COLLISION_MODES = ['abort', 'stop', 'notify', 'off'];
export const COLLISION_MODE_DEFAULT = 'stop';

function loadCollisionMode() {
  try {
    const saved = JSON.parse(localStorage.getItem(MODE_KEY) || 'null');
    return COLLISION_MODES.includes(saved) ? saved : COLLISION_MODE_DEFAULT;
  } catch { return COLLISION_MODE_DEFAULT; }
}

function saveMode(mode) {
  try { localStorage.setItem(MODE_KEY, JSON.stringify(mode)); } catch { /* ignore */ }
}

export function initCollisionPanel(hub) {
  const btn = $('collision');
  const modeSel = $('collision-mode');
  let mode = loadCollisionMode();
  // The guard the panel last pushed its mode into. A fresh guard arrives on
  // every connect and starts on its own constructor default.
  let applied = null;

  const apply = () => {
    const guard = hub.collision;
    if (!guard || applied === guard) return;
    guard.setMode(mode);
    applied = guard;
  };

  const sync = () => {
    apply();
    const guard = hub.collision;
    const armed = guard?.armed ?? false;
    btn.textContent = `crash guard: ${armed ? 'ON' : 'OFF'}`;
    setToggle(btn, armed);
    // A macro owns the mode while it runs, so the guard is the source of truth
    // once one exists.
    if (modeSel) modeSel.value = guard?.mode ?? mode;
  };

  btn.addEventListener('click', async () => {
    const guard = hub.collision;
    if (!guard) return;
    if (guard.armed) await guard.disarm();
    else await guard.arm();
    sync();
  });

  modeSel?.addEventListener('change', () => {
    const next = COLLISION_MODES.includes(modeSel.value) ? modeSel.value : COLLISION_MODE_DEFAULT;
    mode = next;
    saveMode(mode);
    hub.collision?.setMode(mode);
    sync();
  });

  if (modeSel) modeSel.value = mode;

  return {
    sync,
    reset: () => { applied = null; sync(); },
  };
}
