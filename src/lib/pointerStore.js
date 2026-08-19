// Remote presenter pointer lives outside React so ~20 Hz updates
// do not re-render the viewer, overlays, or FAB.

let pointer = null;
let pending = null;
let rafId = 0;
const listeners = new Set();

function pointersEqual(a, b) {
  return (
    a &&
    b &&
    a.viewport === b.viewport &&
    a.coord?.[0] === b.coord?.[0] &&
    a.coord?.[1] === b.coord?.[1] &&
    a.coord?.[2] === b.coord?.[2]
  );
}

function flush() {
  rafId = 0;
  const next = pending;
  pending = null;
  if (pointersEqual(pointer, next)) return;
  pointer = next;
  listeners.forEach((fn) => fn(pointer));
}

export function setRemotePointer(next) {
  pending = next;
  if (rafId) return;
  rafId = requestAnimationFrame(flush);
}

export function getRemotePointer() {
  return pending ?? pointer;
}

export function subscribeRemotePointer(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
