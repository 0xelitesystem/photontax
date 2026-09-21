// The globe, assembled. GLOBE team. DESIGN 5, 6.1, 6.2, 6.5, 6.6.
//
// One entry point. Give it a container and a way to read the current GlobeInput, and it mounts
// a canvas, a keyboard path over every endpoint, and a polite live region, or, if WebGL2 is
// not available, the SVG map from ./fallback.js in the same palette with the same keyboard
// path. It never fetches anything: the coastline is bundled, so first paint happens before any
// network call, which is the promise DESIGN 5 opens with.
//
// THE RENDER LOOP IS OFF BY DEFAULT AND THAT IS THE MOBILE STRATEGY. DESIGN 6.5 names thermal
// throttle as the second of three mobile risks and gives the fix: stop the loop entirely when
// idle and when the document is hidden, redraw on interaction only. A still globe at zero
// frames per second is visually identical to a still globe at sixty and costs nothing. So this
// module runs frames only while something is actually moving: the idle rotation, a camera
// tween, an arc drawing in, or the flow. Under prefers-reduced-motion none of those exist and
// the loop never starts at all.
//
// Browser only.

import { assertGlobeInput } from '../core/contracts/globe.js';
import { buildScene } from './scene.js';
import { getWebGl2, createGlobeRenderer } from './renderer.js';
import { fallbackSpec, mountSpec } from './fallback.js';
import { advanceIdleSpin, clampCamera, createCamera, lerpCamera } from './camera.js';
import {
  createEndpointList, createLiveRegion, describeScene, focusEntry, handleGlobeKey, navEntries,
  prefersReducedMotion,
} from './a11y.js';

export { fallbackSpec, mountSpec } from './fallback.js';
export { buildScene } from './scene.js';
// src/globe/raster.js is NOT re exported here. It is a CPU reference rasterizer used by the
// test suite and by scripts/globe-validate.mjs, both of which import it directly. Re exporting
// it put the whole rasterizer into the shipped page, where nothing calls it: measured at 2806 B
// gzipped of dead weight against a payload that is a gate (DESIGN 6.3).
export { replayGlobeInput, REPLAY_CAMERA, REPLAY_VIEWPORT } from './replay.js';
export { COASTLINE_ATTRIBUTION, COASTLINE_STATS } from './coastline.js';
export { globeContrastReport, GLOBE_TEXT_PAIRS } from './palette.js';
export { KEY_HELP, navEntries, describeScene } from './a11y.js';

/** Hard ceiling on the device pixel ratio. The contract caps it too; this is the local guard. */
export const DEVICE_PIXEL_RATIO_CAP = 2;

/** Frames the probe must see under the budget before bloom is even offered. DESIGN 6.5. */
export const PROBE_FRAMES = 30;

/** The frame budget, milliseconds. Sixty frames per second. */
export const FRAME_BUDGET_MS = 1000 / 60;

/** Camera tween length in seconds. Zero under reduced motion, which skips the tween entirely. */
export const TWEEN_SECONDS = 0.45;

/**
 * The stylesheet for the parts of the page this module creates. Token references only: there
 * is not a single colour value in it, which is what keeps every colour in the globe region one
 * the contrast gate has already checked.
 */
export const GLOBE_CSS = `
[data-globe-root] { position: relative; display: block; }
[data-globe-root] canvas { display: block; width: 100%; height: 100%; touch-action: none; }
[data-globe-root] canvas:focus-visible { outline: 2px solid var(--text-accent); outline-offset: 2px; }
[data-globe-endpoints] { list-style: none; margin: 0; padding: 0; }
[data-globe-endpoints] button {
  display: flex; gap: 0.75rem; align-items: baseline; width: 100%;
  background: var(--surface-raised); color: var(--text-ink);
  border: 1px solid var(--line-rule); border-radius: 2px;
  padding: 0.4rem 0.6rem; font: inherit; text-align: left; cursor: pointer;
}
[data-globe-endpoints] button:focus-visible { outline: 2px solid var(--text-accent); outline-offset: 2px; }
[data-globe-endpoints] [data-endpoint-state-text] { color: var(--text-ink-soft); }
[data-globe-endpoints] [data-endpoint-state-text="worst"] { color: var(--text-accent); }
[data-globe-fallback] { display: block; width: 100%; height: auto; background: var(--surface-base); }
[data-globe-notice] { color: var(--text-ink); background: var(--surface-base); margin: 0 0 0.5rem; }
[data-globe-attribution] { color: var(--text-ink-faint); background: var(--surface-raised); }
@media (prefers-reduced-motion: reduce) {
  [data-globe-root] * { animation: none !important; transition: none !important; }
}
`;

/** Shown above the SVG map. Never a black box: say what happened and what is on screen. */
export const FALLBACK_NOTICE = 'This browser has no WebGL2, so the globe is drawn as a flat map '
  + 'instead. It is the same coastline data and the same great circles. Every measured value is '
  + 'in the table below, which is unaffected.';

/**
 * Shown when a context that DID exist goes away underneath us.
 *
 * This is a different sentence from the one above on purpose, because it is a different fact.
 * A browser with no WebGL2 never had a globe; a browser that loses its context had one and
 * stopped. Both end at the same flat map, and neither is allowed to be a silent empty box.
 *
 * It is not hypothetical and it is not rare. A GPU reset, a driver update, a machine waking
 * from sleep, too many live contexts in other tabs, or a software rasteriser that cannot
 * allocate a buffer will all do it. It was hit on the first real browser run of this page: the
 * context was created, reported itself healthy, and then came back with isContextLost() true
 * and a zero by zero drawing buffer, and the page showed an empty rectangle where the globe
 * should be for as long as anybody left it open.
 */
export const CONTEXT_LOST_NOTICE = 'The browser took this page WebGL context away, which it is '
  + 'allowed to do at any time, so the globe is drawn as a flat map instead. It is the same '
  + 'coastline data and the same great circles. Every measured value is in the table below, '
  + 'which is unaffected.';

/**
 * A frame time probe. DESIGN 6.5 gates any extra fill rate behind clearing the budget over
 * PROBE_FRAMES consecutive frames, and the gate is one directional: a single slow frame resets
 * the run. Bloom stays off until the probe says otherwise, and the probe never turns it on by
 * itself, because that decision belongs to the caller.
 */
export function createFrameProbe() {
  let run = 0;
  let cleared = false;
  return {
    /** @param {number} frameMs */
    sample(frameMs) {
      if (frameMs <= FRAME_BUDGET_MS) {
        run += 1;
        if (run >= PROBE_FRAMES) cleared = true;
      } else {
        run = 0;
      }
      return cleared;
    },
    get cleared() { return cleared; },
    get run() { return run; },
    reset() { run = 0; cleared = false; },
  };
}

/**
 * Mount the globe.
 *
 * @param {HTMLElement} container
 * @param {Object} opts
 * @param {() => import('../core/contracts/globe.js').GlobeInput} opts.getInput Called on every
 *   state change and at the start of every frame. Cheap: the caller keeps the object.
 * @param {(endpointId:string) => void} [opts.onSelect]
 * @param {Document} [opts.doc]
 * @param {Window} [opts.win]
 * @returns {{
 *   update: () => void,
 *   destroy: () => void,
 *   backend: 'webgl2'|'svg',
 *   camera: () => import('./camera.js').CameraState,
 *   probe: ReturnType<typeof createFrameProbe>,
 * }}
 */
export function createGlobe(container, opts) {
  const doc = opts.doc || container.ownerDocument;
  const win = opts.win || doc.defaultView;
  const getInput = opts.getInput;
  const onSelect = opts.onSelect || (() => {});

  container.setAttribute('data-globe-root', 'globe');

  const live = createLiveRegion(doc);
  container.appendChild(live);

  let input = assertGlobeInput(getInput());
  // A camera angle is not a claim about the world, so the default view is just a view.
  let camera = createCamera(input.observer === null
    ? null
    : { lat: input.observer.lat, lon: input.observer.lon });
  let tweenFrom = null;
  let tweenTo = null;
  let tweenElapsed = 0;
  let interacted = false;
  let running = false;
  let rafId = 0;
  let lastTime = 0;
  let clock = 0;
  const probe = createFrameProbe();

  const canvas = doc.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', input.ariaSummary || describeScene(input));
  canvas.tabIndex = 0;

  let gl = getWebGl2(canvas);
  /** @type {'webgl2'|'svg'} */
  const backend = gl ? 'webgl2' : 'svg';
  let renderer = null;
  /** @type {Element|null} */
  let fallbackEl = null;

  if (gl) {
    renderer = createGlobeRenderer(gl);
    container.appendChild(canvas);
  } else {
    const notice = doc.createElement('p');
    notice.setAttribute('data-globe-notice', 'no-webgl2');
    notice.textContent = FALLBACK_NOTICE;
    container.appendChild(notice);
    fallbackEl = mountSpec(doc, fallbackSpec(input));
    container.appendChild(fallbackEl);
  }

  const nav = createEndpointList(doc, {
    onFocus: (entry) => {
      interacted = true;
      const r = focusEntry(camera, entry);
      startTween(r.camera);
      announce(r.announce);
    },
    onSelect: (entry) => onSelect(entry.id),
    onKey: (key) => {
      const r = handleGlobeKey(camera, key);
      if (!r.handled) return false;
      interacted = true;
      camera = r.camera;
      tweenFrom = null;
      announce(r.announce);
      requestFrame();
      return true;
    },
  });
  nav.setEntries(navEntries(input));
  container.appendChild(nav.element);

  const onCanvasKey = (ev) => {
    const r = handleGlobeKey(camera, ev.key);
    if (!r.handled) return;
    ev.preventDefault();
    interacted = true;
    camera = r.camera;
    tweenFrom = null;
    announce(r.announce);
    requestFrame();
  };
  canvas.addEventListener('keydown', onCanvasKey);

  // The event fires before the next frame would, so this is the path that normally catches it.
  // preventDefault is what tells the browser a restore is worth attempting; this page does not
  // attempt one, but suppressing the default is still the correct signal and costs nothing.
  const onContextLost = (evt) => {
    evt.preventDefault();
    fallBackToFlatMap(CONTEXT_LOST_NOTICE);
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  const onVisibility = () => {
    if (doc.hidden) stop();
    else requestFrame();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  /** @param {string} text */
  function announce(text) {
    live.textContent = text;
  }

  /** @param {import('./camera.js').CameraState} target */
  function startTween(target) {
    if (input.reducedMotion || prefersReducedMotion(win)) {
      camera = clampCamera(target);
      tweenFrom = null;
      requestFrame();
      return;
    }
    tweenFrom = camera;
    tweenTo = clampCamera(target);
    tweenElapsed = 0;
    requestFrame();
  }

  function viewport() {
    const dpr = Math.min(
      DEVICE_PIXEL_RATIO_CAP,
      input.devicePixelRatioCap,
      (win && win.devicePixelRatio) || 1,
    );
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
    const cssW = Math.max(1, Math.round(rect.width || container.clientWidth || 1));
    const cssH = Math.max(1, Math.round(rect.height || container.clientHeight || cssW));
    return { widthPx: Math.round(cssW * dpr), heightPx: Math.round(cssH * dpr), dpr };
  }

  /** True while anything in the scene is actually moving. */
  function needsFrames() {
    if (input.idle) return false;
    if (doc.hidden) return false;
    if (tweenFrom) return true;
    if (input.reducedMotion) return false;
    if (!interacted) return true;                       // the idle rotation
    return input.arcs.some((a) => a.progress < 1);      // the draw in
  }

  /**
   * Give up on WebGL and switch to the flat map, once, for good.
   *
   * Not a retry. A lost context can be restored, and handling restoration properly means
   * rebuilding every buffer, texture, shader and program from scratch: real work, for a globe
   * this page has already said is decorative. The honest cheap answer is the fallback that
   * already exists for the browser that never had a context at all, plus a sentence saying
   * which of the two happened.
   *
   * @param {string} notice
   */
  function fallBackToFlatMap(notice) {
    if (fallbackEl) return;
    stop();
    if (renderer) { try { renderer.destroy(); } catch { /* the context is already gone */ } }
    renderer = null;
    gl = null;
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    const p = doc.createElement('p');
    p.setAttribute('data-globe-notice', 'context-lost');
    p.textContent = notice;
    container.insertBefore(p, nav.element);
    fallbackEl = mountSpec(doc, fallbackSpec(input));
    container.insertBefore(fallbackEl, nav.element);
    announce(notice);
  }

  function drawOnce() {
    // A context can be taken away between one frame and the next, and a draw against a lost
    // context is a silent no op that leaves the last frame, or nothing at all, on screen.
    if (gl && gl.isContextLost && gl.isContextLost()) {
      fallBackToFlatMap(CONTEXT_LOST_NOTICE);
      return;
    }
    if (!renderer || !gl) {
      if (fallbackEl && fallbackEl.parentNode) {
        const next = mountSpec(doc, fallbackSpec(input));
        fallbackEl.parentNode.replaceChild(next, fallbackEl);
        fallbackEl = next;
      }
      return;
    }
    const v = viewport();
    renderer.resize(v.widthPx, v.heightPx);
    const scene = buildScene(input, {
      camera,
      widthPx: v.widthPx,
      heightPx: v.heightPx,
      devicePixelRatio: v.dpr,
      timeSeconds: clock,
    });
    renderer.render(scene);
  }

  function frame(now) {
    rafId = 0;
    const dt = lastTime ? Math.min(0.25, (now - lastTime) / 1000) : 0;
    if (lastTime) probe.sample(now - lastTime);
    lastTime = now;
    clock += dt;

    if (tweenFrom && tweenTo) {
      tweenElapsed += dt;
      const t = Math.min(1, tweenElapsed / TWEEN_SECONDS);
      camera = lerpCamera(tweenFrom, tweenTo, easeInOut(t));
      if (t >= 1) { tweenFrom = null; tweenTo = null; }
    } else {
      camera = advanceIdleSpin(camera, dt, {
        reducedMotion: input.reducedMotion || prefersReducedMotion(win),
        interacted,
      });
    }

    drawOnce();

    if (needsFrames()) schedule();
    else running = false;
  }

  function schedule() {
    if (rafId || !win || typeof win.requestAnimationFrame !== 'function') return;
    running = true;
    rafId = win.requestAnimationFrame(frame);
  }

  function requestFrame() {
    if (input.idle || doc.hidden) { drawOnce(); return; }
    if (!running) { lastTime = 0; schedule(); } else schedule();
  }

  function stop() {
    if (rafId && win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(rafId);
    rafId = 0;
    running = false;
  }

  /** Re read the input and redraw. The caller calls this on every state change. */
  function update() {
    input = assertGlobeInput(getInput());
    canvas.setAttribute('aria-label', input.ariaSummary || describeScene(input));
    nav.setEntries(navEntries(input));
    if (input.idle) { stop(); drawOnce(); return; }
    requestFrame();
  }

  function destroy() {
    stop();
    canvas.removeEventListener('keydown', onCanvasKey);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    doc.removeEventListener('visibilitychange', onVisibility);
    nav.destroy();
    if (renderer) renderer.destroy();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (nav.element.parentNode) nav.element.parentNode.removeChild(nav.element);
    if (live.parentNode) live.parentNode.removeChild(live);
    if (fallbackEl && fallbackEl.parentNode) fallbackEl.parentNode.removeChild(fallbackEl);
  }

  // First paint, synchronously, before any frame is scheduled and before anything has touched
  // the network. DESIGN 5 second 0: the page is already painted.
  drawOnce();
  if (needsFrames()) schedule();

  return {
    update,
    destroy,
    backend,
    /** What is on screen NOW, which is not always what was on screen at mount. */
    currentBackend: () => (gl && renderer ? 'webgl2' : 'svg'),
    camera: () => camera,
    probe,
  };
}

/** @param {number} t */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
