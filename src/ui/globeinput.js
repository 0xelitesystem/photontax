// BUILDING THE GLOBE INPUT. UI team output, consumed by the RENDER team.
//
// Validated by src/core/contracts/globe.js before it ever leaves this module, so the renderer
// is never handed a scene it would have to sanity check.
//
// THE ONE THING THIS FILE EXISTS TO GET RIGHT. An arc is the GREAT CIRCLE between two
// coordinates: the geometry the floor is computed from, drawn. It is not a route, not a path,
// not a cable, and not where anything travelled. The contract has no waypoints field and
// throws if a caller invents one, and this module never computes an intermediate point of any
// kind. The renderer tessellates the great circle itself, which is a geometric operation on
// two coordinates and not a claim about the network.
//
// Every arc starts at the single observer point. A second origin would imply the page knows
// more than one thing about where the visitor is, and the page knows exactly one thing: which
// Cloudflare facility terminated this connection, which Cloudflare REPORTED about its own
// network. It never geolocates anybody (DESIGN trap 7).
//
// Exactly one arc may be 'worst'. The entire colour budget of the scene exists so that one
// line pops (DESIGN 6.2), and spending it twice spends it on nothing.
//
// Isomorphic: no node:* imports and no DOM.

import { GLOBE_INPUT_SCHEMA, assertGlobeInput } from '../core/contracts/globe.js';
import { endpointById } from '../core/data/endpoints.js';

/** DESIGN 6.5: fill rate, not vertex count, is what melts a phone GPU. Hard cap. */
export const DPR_CAP = 2;

/**
 * The canvas text alternative. DESIGN 6.6: the canvas carries role="img", so it needs a
 * sentence, and that sentence is a SUMMARY rather than a data source. The numbers are in the
 * table, where a screen reader can move through them cell by cell.
 *
 * No figure appears in it, which is deliberate twice over: a summary with a figure in it would
 * be a number with no badge, and a reader who is being read a sentence cannot check a figure
 * anyway.
 *
 * @param {string} observerLabel
 * @param {number} arcCount
 * @param {string|null} worstCity
 * @returns {string}
 */
export function globeAriaSummary(observerLabel, arcCount, worstCity) {
  if (arcCount === 0) {
    return 'A dark globe with coastlines drawn as thin strokes. No measurement has been taken, '
      + 'so no arcs are drawn. This image is decorative and the result is the table below it.';
  }
  const base = 'A dark globe with coastlines drawn as thin strokes. Great circle arcs run from '
    + observerLabel + ' to each measured cloud region, drawn at the shortest distance a cable '
    + 'between those two points could possibly take rather than at any route. Arcs on the far '
    + 'side of the planet are hidden behind it.';
  const worst = worstCity
    ? ' The arc to ' + worstCity + ' is highlighted, because that region carries the largest '
      + 'route surplus in this run.'
    : '';
  return base + worst + ' This image is decorative and the result is the table below it.';
}

/**
 * @typedef {Object} GlobeStateInput
 * @property {{lat:number, lon:number, label:string}|null} observer
 * @property {string[]} arcEndpointIds Endpoints whose arc should be drawn, in draw order.
 * @property {Record<string, number>} [progress] endpointId to 0..1. Missing means 1.
 * @property {string|null} [worstEndpointId]
 * @property {string|null} [selectedEndpointId]
 * @property {'dark'|'light'} theme
 * @property {boolean} reducedMotion
 * @property {boolean} idle
 * @property {boolean} [bloomEnabled]
 * @property {number} [devicePixelRatio]
 */

/**
 * @param {GlobeStateInput} s
 * @returns {import('../core/contracts/globe.js').GlobeInput}
 */
export function buildGlobeInput(s) {
  // Before the button is pressed this page has asked nobody anything, so there is no origin
  // to draw from and no arcs to draw. That state is expressed rather than inflated: the
  // contract carries a null observer and refuses any arc beside it, so the planet is drawn and
  // nothing on it is a place this page made up (DESIGN 5 second 0, trap 7).
  if (!s.observer) {
    if (s.arcEndpointIds.length > 0) {
      throw new TypeError('buildGlobeInput: arcs were asked for with no observer point. Every '
        + 'arc starts at the single observation point.');
    }
    return assertGlobeInput({
      schema: GLOBE_INPUT_SCHEMA,
      observer: null,
      arcs: [],
      theme: s.theme,
      reducedMotion: s.reducedMotion,
      idle: s.idle,
      devicePixelRatioCap: Math.min(DPR_CAP, typeof s.devicePixelRatio === 'number' && s.devicePixelRatio > 0
        ? s.devicePixelRatio
        : DPR_CAP),
      bloomEnabled: s.bloomEnabled === true,
      ariaSummary: globeAriaSummary('', 0, null),
    });
  }

  const worstId = s.worstEndpointId || null;
  const selectedId = s.selectedEndpointId && s.selectedEndpointId !== worstId
    ? s.selectedEndpointId
    : null;

  const arcs = s.arcEndpointIds.map((id) => {
    const e = endpointById(id);
    if (!e) throw new RangeError('buildGlobeInput: unknown endpoint ' + id);
    const progress = s.reducedMotion
      ? 1
      : (s.progress && typeof s.progress[id] === 'number' ? s.progress[id] : 1);
    return {
      endpointId: id,
      from: { lat: s.observer.lat, lon: s.observer.lon },
      to: { lat: e.lat, lon: e.lon },
      state: id === worstId ? 'worst' : (id === selectedId ? 'selected' : 'idle'),
      progress,
      label: 'Great circle from ' + s.observer.label + ' to ' + e.providerRegionName + '.',
    };
  });

  const worst = worstId ? endpointById(worstId) : null;

  return assertGlobeInput({
    schema: GLOBE_INPUT_SCHEMA,
    observer: { lat: s.observer.lat, lon: s.observer.lon, label: s.observer.label },
    arcs,
    theme: s.theme,
    reducedMotion: s.reducedMotion,
    idle: s.idle,
    devicePixelRatioCap: Math.min(DPR_CAP, typeof s.devicePixelRatio === 'number' && s.devicePixelRatio > 0
      ? s.devicePixelRatio
      : DPR_CAP),
    bloomEnabled: s.bloomEnabled === true,
    ariaSummary: globeAriaSummary(s.observer.label, arcs.length, worst ? worst.city : null),
  });
}
