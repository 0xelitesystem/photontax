// THE RENDER PORT. The UI talks to this file and to nothing else in the globe.
//
// src/ui/ports.js publishes a renderer port shaped `{ mount(node), update(globeInput) }` and
// src/ui/adapters.js fills it from whatever module the build hands over. The globe itself is
// built around a pull model instead: `createGlobe(container, { getInput })` calls back for the
// current scene whenever it needs one, which is what lets it run frames only while something
// is actually moving. Those two shapes are both right for their own side and neither is the
// other, so this file is the adapter between them and it is the entire contents of src/render.
//
// WHY THE PLANET IS PAINTED AT MOUNT, BEFORE ANY GlobeInput ARRIVES. DESIGN 5 second 0: "The
// page is already painted. A dark globe, slowly rotating... Nothing has touched the network."
// The UI mounts the renderer during boot, long before the reader has pressed anything, so at
// that moment there is no observation point and no arc. The contract in
// src/core/contracts/globe.js expresses that state as `observer: null`, and refuses any arc
// beside it. So `mount()` paints the bare planet immediately and `update()` replaces the scene
// when the page finally has one. Nothing here invents a coordinate to have something to draw
// (DESIGN trap 7).
//
// WHAT THIS FILE MAY NOT DO, and none of it is hypothetical:
//
//   It opens no connection. The coastline is bundled in src/globe/coastline-data.js, the
//   geometry is arithmetic, and there is not a URL in the whole subtree. Every network call in
//   this product lives inside src/measure, whose hosts are literals that scripts/gate-csp.mjs
//   compares against the page's own Content-Security-Policy (DESIGN trap 1).
//
//   It renders no figure. A GlobeInput is geometry and a text alternative. Every millisecond a
//   reader sees is in the table, where it goes through the claim badge system (DESIGN 6.6).
//
//   It draws no route. An arc is the great circle between two coordinates, which is the
//   geometry the floor is computed from, drawn. The contract throws on a waypoint.
//
// Browser only.

import { assertGlobeInput } from '../core/contracts/globe.js';
import { createGlobe, GLOBE_CSS, DEVICE_PIXEL_RATIO_CAP } from '../globe/index.js';
import { replayGlobeInput } from '../globe/replay.js';
import { prefersReducedMotion } from '../globe/a11y.js';

export { GLOBE_CSS as RENDER_CSS, CONTEXT_LOST_NOTICE, FALLBACK_NOTICE } from '../globe/index.js';
export { COASTLINE_ATTRIBUTION, COASTLINE_STATS } from '../globe/coastline.js';
export { globeContrastReport, GLOBE_TEXT_PAIRS } from '../globe/palette.js';
export { replayGlobeInput, REPLAY_CAMERA, REPLAY_VIEWPORT } from '../globe/replay.js';

/**
 * The scene before anything has been measured: a planet, no observation point, no arcs.
 *
 * The theme is read off the document element, which src/ui/main.js sets before it mounts
 * anything, so the first painted frame is already in the reader's theme rather than flashing
 * the other one. Reduced motion is read from the platform for the same reason.
 *
 * @param {Document} doc
 * @param {Window|null} win
 * @returns {import('../core/contracts/globe.js').GlobeInput}
 */
export function idleGlobeInput(doc, win) {
  const theme = doc.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const reduced = prefersReducedMotion(win);
  return assertGlobeInput({
    schema: 1,
    observer: null,
    arcs: [],
    theme,
    reducedMotion: reduced,
    idle: false,
    devicePixelRatioCap: Math.min(
      DEVICE_PIXEL_RATIO_CAP,
      (win && win.devicePixelRatio > 0) ? win.devicePixelRatio : DEVICE_PIXEL_RATIO_CAP,
    ),
    bloomEnabled: false,
    ariaSummary: 'A dark globe with coastlines drawn as thin strokes. No measurement has been '
      + 'taken, so no arcs are drawn. This image is decorative and the result is the table '
      + 'below it.',
  });
}

/** @type {{update:Function, destroy:Function, backend:string, camera:Function, probe:object}|null} */
let globe = null;
/** @type {import('../core/contracts/globe.js').GlobeInput|null} */
let current = null;
/** @type {((endpointId:string) => void)|null} */
let selectHandler = null;
/** True under ?replay=1. The scene is then fixed and update() leaves it alone. */
let replayLocked = false;

/**
 * Mount the globe into a container and paint it at once.
 *
 * Throws if the browser refuses a WebGL2 context AND the SVG fallback cannot be built either.
 * A refused context on its own is not an error: src/globe/index.js falls back to the flat map
 * in the same palette with the same keyboard path, and reports `backend: 'svg'`. The UI names
 * a thrown failure on the page rather than leaving a black box (DESIGN 6.5).
 *
 * @param {HTMLElement} container
 * @returns {{backend:'webgl2'|'svg'}}
 */
export function mount(container) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new TypeError('render.mount: expected an element to mount into');
  }
  const doc = container.ownerDocument;
  const win = doc.defaultView;

  // DESIGN 8.5: ?replay=1 is a fixed camera over a fixed set of arcs, so that a capture taken
  // now and a capture taken in two years are the same image. It replaces the scene the page
  // would otherwise build, which is why it is read here and not in the UI.
  const search = win && win.location ? win.location.search : '';
  replayLocked = new URLSearchParams(search || '').get('replay') === '1';
  const replay = replayLocked;

  current = replay
    ? assertGlobeInput(replayGlobeInput({
      theme: doc.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    }))
    : idleGlobeInput(doc, win);

  globe = createGlobe(container, {
    getInput: () => current,
    onSelect: (endpointId) => { if (selectHandler) selectHandler(endpointId); },
    doc,
    win,
  });

  return { backend: globe.backend };
}

/**
 * Replace the scene. Called by the UI on every state change: an observation point appearing,
 * an arc landing, the worst row changing, the theme flipping, the run going idle.
 *
 * Under ?replay=1 this is a no op, because the whole point of the replay flag is that the
 * scene does not depend on what this particular machine measured.
 *
 * @param {import('../core/contracts/globe.js').GlobeInput} globeInput
 */
export function update(globeInput) {
  const next = assertGlobeInput(globeInput);
  if (replayLocked) return;
  current = next;
  if (globe) globe.update();
}

/**
 * Register the click handler for an arc or a keyboard entry. The globe reports an endpoint id
 * and nothing else, so it cannot tell the page anything the page did not already give it.
 * @param {(endpointId:string) => void} fn
 */
export function onSelect(fn) {
  selectHandler = typeof fn === 'function' ? fn : null;
}

/**
 * Which backend was chosen at mount. 'svg' means the browser refused a WebGL2 context.
 * Use currentBackend() for what is on screen now: a context can be taken away at any time.
 */
export function backend() {
  return globe ? globe.backend : null;
}

/** What is drawing RIGHT NOW, after any context loss. */
export function currentBackend() {
  return globe && globe.currentBackend ? globe.currentBackend() : backend();
}

/** The frame time probe. DESIGN 6.5 gates any extra fill rate behind it. */
export function frameProbe() {
  return globe ? globe.probe : null;
}

/** Tear the globe down. The page never calls this; a test does. */
export function destroy() {
  if (globe) globe.destroy();
  globe = null;
  current = null;
  selectHandler = null;
  replayLocked = false;
}
