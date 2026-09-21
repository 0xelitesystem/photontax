// THE OBSERVER POINT. DESIGN 2.2, DESIGN 2.4, trap 7.
//
// Every distance in this product is measured from one point, and the honesty of the whole page
// rests on where that point came from. The measurement contract allows exactly two answers and
// no third:
//
//   cloudflare-colo       REPORTED. The serving edge named the facility that terminated this
//                         connection, and this product holds a coordinate for that facility
//                         that it can cite.
//   visitor-picked-city   INFERRED. The reader chose a city. The page says so, in those words,
//                         next to the number.
//
// There is no address lookup branch in this file and there is no country centroid branch,
// because both produce a coordinate that describes nobody. The page never plots the reader.
//
// In V1 the first branch cannot fire, because colo-sites.js ships empty for the reasons
// recorded in its header. The branch is written, tested and ready, and the run says out loud
// which branch it took rather than letting a reader assume the stronger one.
//
// Isomorphic: no node:* imports and no DOM.

import { assertObserver } from '../core/contracts/measurement.js';
import { assertCoord } from '../core/geo.js';
import { COLO_SITES, coloSiteFor } from './colo-sites.js';
import { RUN_NOTICES } from './reasons.js';

/**
 * @typedef {Object} ObserverResolution
 * @property {import('../core/contracts/measurement.js').Observer|null} observer
 * @property {boolean} needsCityPick True when nothing can be measured or computed until the
 *   reader chooses a city. The page asks. It does not guess (trap 7).
 * @property {string|null} reportedColo The facility code, when one was reported, even if no
 *   coordinate for it exists. It is a fact the edge stated and it is shown either way.
 * @property {import('./trace.js').RunNotice[]} notices
 */

/**
 * Decide the observer point from what is actually known.
 *
 * @param {Object} input
 * @param {import('./trace.js').ReportedConnection|import('./trace.js').TraceUnavailable|null} input.trace
 * @param {boolean} [input.traceAttempted] False when the facility endpoint was deliberately
 *   NOT called, which happens on the run that measures: by then the reader has already chosen
 *   a city, so there is nothing the facility could tell this page that would change the
 *   observer point. A run that did not ask must not report that the answer did not arrive.
 * @param {{lat: number, lon: number, label: string}|null} [input.pickedCity] The city the reader
 *   chose, from the bundled list. Never derived from an address.
 * @param {readonly import('./colo-sites.js').ColoSite[]} [input.coloSites]
 * @returns {ObserverResolution}
 */
export function resolveObserver(input) {
  const sites = input.coloSites || COLO_SITES;
  const trace = input.trace;
  /** @type {import('./trace.js').RunNotice[]} */
  const notices = [];
  const reportedColo = trace !== null && trace.ok === true ? trace.colo : null;

  if (trace !== null && trace.ok === true) {
    const site = coloSiteFor(trace.colo, sites);
    if (site) {
      const observer = assertObserver({
        source: 'cloudflare-colo',
        colo: site.colo,
        label: site.label,
        lat: site.lat,
        lon: site.lon,
        badge: 'REPORTED',
      });
      return { observer, needsCityPick: false, reportedColo, notices };
    }
    notices.push({
      id: 'COLO_WITHOUT_COORDINATE',
      badge: 'REPORTED',
      text: RUN_NOTICES.COLO_WITHOUT_COORDINATE,
      suppressesResults: false,
    });
  } else if (input.traceAttempted !== false) {
    notices.push({
      id: 'TRACE_UNAVAILABLE',
      badge: 'MEASURED',
      text: RUN_NOTICES.TRACE_UNAVAILABLE,
      suppressesResults: false,
    });
  }

  const picked = input.pickedCity;
  if (!picked) return { observer: null, needsCityPick: true, reportedColo, notices };

  assertCoord(picked, 'pickedCity');
  if (typeof picked.label !== 'string' || picked.label.length === 0) {
    throw new TypeError('pickedCity.label: required. The page states which city the reader chose, '
      + 'because every distance on the page is computed from it.');
  }
  const observer = assertObserver({
    source: 'visitor-picked-city',
    colo: null,
    label: picked.label,
    lat: picked.lat,
    lon: picked.lon,
    badge: 'INFERRED',
  });
  return { observer, needsCityPick: false, reportedColo, notices };
}
