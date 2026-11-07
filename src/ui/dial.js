// One dial: the measured angle is the fill, the commanded angle is the bug.
// Geometry is the shipped one — centre (50,50), r 44, zero at the top.
//
// See docs/DESIGN-NOTES.md § The reading is the fill, the setpoint is the bug

import { setAttr, setStyle } from './dom.js';
import { clampPercent } from '../control-math.js';

const R = 44, CX = 50, CY = 50;

export function arcPoint(v) {
  const a = (90 - (clampPercent(v) / 100) * 90) * Math.PI / 180;
  return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) };
}

export function arcPath(from, to) {
  const a = arcPoint(from), b = arcPoint(to);
  const sweep = to >= from ? 1 : 0;
  return `M${+a.x.toFixed(1)} ${+a.y.toFixed(1)} A${R} ${R} 0 0 ${sweep} ${+b.x.toFixed(1)} ${+b.y.toFixed(1)}`;
}

export function createDial({ fill = null, bug }) {
  // `fill` is optional — the motion panel has no arc. `bug` is not, and the
  // helpers below no-op on a missing element rather than throwing, so without
  // this a mis-wired dial would silently draw nothing forever.
  if (!bug) throw new Error('createDial: bug element is required');
  return {
    show({ measured, commanded, maxAngle = 90 }) {
      const pct = (deg) => (deg == null ? null : clampPercent((deg / maxAngle) * 100));
      const m = pct(measured), c = pct(commanded);
      // Value-keyed: an arc that has not moved is not redrawn. The memo is
      // shared with every other writer of these elements, which is what makes
      // it correct — and what makes it a trap for a writer that goes around it.
      // The motion panel shares this dial and writes the same needle from its
      // own reset; it goes through the helpers too, or that reset would leave
      // the memo holding the old angle and the needle stuck.
      // See docs/DESIGN-NOTES.md § The panels write what changed, and nothing else
      if (fill) setAttr(fill, 'd', m == null ? arcPath(0, 0) : arcPath(0, m));
      setStyle(bug, 'transform', `rotate(${((c ?? 0) / 100) * 90}deg)`);
    },
  };
}
