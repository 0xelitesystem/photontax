// Accessibility for the globe. GLOBE team. DESIGN 6.6.
//
// THE CANVAS IS DECORATIVE AND THE DOM IS AUTHORITATIVE. That sentence is the whole design and
// everything here follows from it. The canvas carries role="img" and a text summary. It holds
// no information a reader can only get by looking at it. The measured values live in the
// table the UI team owns, every one of them carrying a MEASURED, REPORTED, COMPUTED or
// INFERRED badge, and a reader who never sees the canvas loses the animation and loses nothing
// else.
//
// What this module adds on top of that is the KEYBOARD PATH OVER THE GEOMETRY, which is the
// one thing the canvas does carry: which endpoints exist, which one the accent is on, and
// where the camera is pointing. Every endpoint is reachable with Tab. Arrow keys rotate, plus
// and minus zoom, Home resets. Focusing an endpoint drives the camera to it, so a keyboard
// reader gets the same tour a mouse reader gets, and the move is announced through a polite
// live region.
//
// WHY THE ANNOUNCEMENTS CARRY NO NUMBERS. Every figure this product shows a reader goes
// through the claim badge system, which cannot produce text without a provenance badge. A
// camera bearing is not a claim about the world, so it is described in words. That keeps the
// rule absolute: if it has digits, it has a badge, with no exception carved out for the part
// nobody looks at.
//
// Browser only from createEndpointList down. Everything above it is pure and tested in Node.

import { cameraKey, cameraOver } from './camera.js';
import { assertGlobeInput } from '../core/contracts/globe.js';

/**
 * @typedef {Object} NavEntry
 * @property {string} id 'observer', or an endpointId.
 * @property {{lat:number, lon:number}} coord
 * @property {string} label
 * @property {'observer'|'idle'|'selected'|'worst'} state
 * @property {string} stateText Spelled out, never colour alone. DESIGN 6.6, trap 19.
 */

/** Spelled out, so the emphasis the accent carries visually is carried in words too. */
export const STATE_TEXT = Object.freeze({
  observer: 'the observation point',
  idle: 'measured region',
  selected: 'selected',
  worst: 'highlighted, the largest surplus over the floor',
});

/**
 * The tab order over the scene. The observer first, then the arcs in the order the input gave
 * them, which is the order the table is in, so Tab walks the globe and the table together.
 *
 * @param {import('../core/contracts/globe.js').GlobeInput} input
 * @returns {NavEntry[]}
 */
export function navEntries(input) {
  const gi = assertGlobeInput(input);
  /** @type {NavEntry[]} */
  const out = gi.observer === null ? [] : [{
    id: 'observer',
    coord: { lat: gi.observer.lat, lon: gi.observer.lon },
    label: gi.observer.label,
    state: 'observer',
    stateText: STATE_TEXT.observer,
  }];
  for (const arc of gi.arcs) {
    out.push({
      id: arc.endpointId,
      coord: { lat: arc.to.lat, lon: arc.to.lon },
      label: arc.label,
      state: arc.state,
      stateText: STATE_TEXT[arc.state],
    });
  }
  return out;
}

/**
 * The single sentence a screen reader receives for the whole scene, built from the same data
 * the picture is built from rather than written by hand, so the two cannot describe different
 * scenes. The caller is free to pass its own ariaSummary; this is what the globe offers when
 * it is asked to describe itself.
 *
 * @param {import('../core/contracts/globe.js').GlobeInput} input
 * @returns {string}
 */
export function describeScene(input) {
  const entries = navEntries(input);
  if (entries.length === 0) {
    return 'A globe with coastlines drawn as thin strokes. Nothing has been measured, so no '
      + 'observation point is plotted and no arcs are drawn. The globe is decorative. Every '
      + 'value, with its provenance, is in the table.';
  }
  const arcs = entries.slice(1);
  const worst = arcs.find((e) => e.state === 'worst');
  const parts = [];
  parts.push('A globe showing great circles from ' + entries[0].label + ' to '
    + numberFreeCount(arcs.length) + ' cloud regions.');
  if (worst) parts.push('One is highlighted: ' + worst.label);
  parts.push('The globe is decorative. Every value, with its provenance, is in the table.');
  return parts.join(' ');
}

/**
 * Counts in words rather than digits.
 *
 * Not a style preference. The badge gate refuses a digit in a rendered text node that has no
 * provenance attribute on it, and the count of arcs on the canvas is not a claim about the
 * world that could carry one. Spelling it out keeps the rule absolute instead of carving out
 * an exception for the case nobody was going to check.
 *
 * @param {number} n
 * @returns {string}
 */
export function numberFreeCount(n) {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
    'eighteen', 'nineteen', 'twenty'];
  return words[n] || 'several';
}

/**
 * Does this environment ask for reduced motion? DESIGN 6.6 kills the flow animation, the
 * rotation and every camera tween when it does, and cuts to the final state.
 *
 * Returns false when there is no matchMedia, which is the conservative answer for a browser
 * old enough not to have it: the contract still forces every arc to progress 1 whenever the
 * caller sets reducedMotion, so a false here cannot animate something that was told not to.
 *
 * @param {{matchMedia?: (q:string) => {matches:boolean}}} [win]
 * @returns {boolean}
 */
export function prefersReducedMotion(win) {
  const w = win || (typeof globalThis !== 'undefined' ? globalThis : undefined);
  if (!w || typeof w.matchMedia !== 'function') return false;
  try {
    return w.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * The keyboard contract, as data, so the list below and the help text a reader can call up are
 * the same list. DESIGN 6.6.
 */
export const KEY_HELP = Object.freeze([
  Object.freeze({ keys: 'Tab', does: 'Move to the next endpoint. The view follows.' }),
  Object.freeze({ keys: 'Left and Right', does: 'Rotate the globe west and east.' }),
  Object.freeze({ keys: 'Up and Down', does: 'Rotate the globe north and south.' }),
  Object.freeze({ keys: 'Plus and Minus', does: 'Zoom in and out.' }),
  Object.freeze({ keys: 'Home', does: 'Reset the view.' }),
  Object.freeze({ keys: 'Enter or Space', does: 'Select the focused endpoint.' }),
]);

/**
 * Handle a key for the globe region. Pure: the caller owns the camera and decides what to do
 * with the result, which is what lets the whole keyboard surface be tested without a browser.
 *
 * @param {import('./camera.js').CameraState} camera
 * @param {string} key
 * @returns {{camera:import('./camera.js').CameraState, announce:string, handled:true}
 *          | {handled:false}}
 */
export function handleGlobeKey(camera, key) {
  const moved = cameraKey(camera, key);
  if (!moved) return { handled: false };
  return { camera: moved.camera, announce: moved.announce, handled: true };
}

/**
 * What focusing an endpoint does: drive the camera to it and say so.
 * @param {import('./camera.js').CameraState} camera
 * @param {NavEntry} entry
 */
export function focusEntry(camera, entry) {
  return {
    camera: cameraOver(camera, entry.coord),
    announce: 'Showing ' + entry.label + ' ' + entry.stateText + '.',
  };
}

/* ---------------------------------------------------------------------------------------
 * The DOM half. Everything above this line runs in Node and is tested there.
 * ------------------------------------------------------------------------------------- */

/**
 * A polite live region. One per globe. Camera moves and selections announce through it.
 * @param {Document} doc
 * @returns {HTMLElement}
 */
export function createLiveRegion(doc) {
  const el = doc.createElement('p');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.setAttribute('data-globe-live', 'camera');
  // Visually hidden rather than display:none, because a region that is not rendered is not
  // announced by several screen readers.
  el.style.position = 'absolute';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.overflow = 'hidden';
  el.style.clip = 'rect(0 0 0 0)';
  el.style.clipPath = 'inset(50%)';
  el.style.whiteSpace = 'nowrap';
  return el;
}

/**
 * The keyboard path over the endpoints.
 *
 * Every entry is its own focusable control, so Tab reaches all of them and a reader who tabs
 * past the globe is not trapped in it. Focus drives the camera as a side effect, which is what
 * DESIGN 6.6 asks for: a keyboard reader gets the same tour.
 *
 * @param {Document} doc
 * @param {Object} handlers
 * @param {(entry:NavEntry) => void} handlers.onFocus
 * @param {(entry:NavEntry) => void} handlers.onSelect
 * @param {(key:string) => boolean} handlers.onKey Return true when the key was consumed.
 * @returns {{element:HTMLElement, setEntries:(entries:NavEntry[]) => void, destroy:() => void}}
 */
export function createEndpointList(doc, handlers) {
  const list = doc.createElement('ul');
  list.setAttribute('data-globe-endpoints', 'list');
  list.setAttribute('aria-label', 'Endpoints on the globe. Focus one to bring it into view.');

  /** @type {(() => void)[]} */
  const cleanups = [];

  function clear() {
    for (const off of cleanups) off();
    cleanups.length = 0;
    while (list.firstChild) list.removeChild(list.firstChild);
  }

  /** @param {NavEntry[]} entries */
  function setEntries(entries) {
    clear();
    for (const entry of entries) {
      const li = doc.createElement('li');
      const button = doc.createElement('button');
      button.type = 'button';
      button.setAttribute('data-endpoint-id', entry.id);
      button.setAttribute('data-endpoint-state', entry.state);
      // Prose only. The label arrives from the contract and the state is spelled out, which is
      // DESIGN 6.6 and trap 19: emphasis is never carried by colour alone.
      const name = doc.createElement('span');
      name.textContent = entry.label;
      const state = doc.createElement('span');
      state.setAttribute('data-endpoint-state-text', entry.state);
      state.textContent = entry.stateText;
      button.appendChild(name);
      button.appendChild(state);

      const onFocus = () => handlers.onFocus(entry);
      const onClick = () => handlers.onSelect(entry);
      const onKeyDown = (ev) => {
        if (handlers.onKey(ev.key)) ev.preventDefault();
      };
      button.addEventListener('focus', onFocus);
      button.addEventListener('click', onClick);
      button.addEventListener('keydown', onKeyDown);
      cleanups.push(() => {
        button.removeEventListener('focus', onFocus);
        button.removeEventListener('click', onClick);
        button.removeEventListener('keydown', onKeyDown);
      });

      li.appendChild(button);
      list.appendChild(li);
    }
  }

  return { element: list, setEntries, destroy: clear };
}
