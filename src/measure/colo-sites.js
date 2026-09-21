// FACILITY COORDINATES. The registry is EMPTY in V1, on purpose, and this file is the receipt.
//
// The serving edge reports a three letter facility code for the connection it terminated. To
// use that facility as the observer point, this product would need a coordinate for it, and a
// coordinate has to come from somewhere a reader can check.
//
// WHAT WAS LOOKED FOR, on 2026-09-21, and what happened:
//
//   speed.cloudflare.com/locations   the one catalogue that publishes a coordinate for each
//                                    facility, answered HTTP 403 Forbidden with a two byte
//                                    body, both with and without a browser user agent. The
//                                    response is recorded in the internal validation folder.
//                                    It is also unlicensed, so even had it answered, the
//                                    standing rule against redistributing data with no
//                                    published licence would have kept it out of this repo.
//
//   the airport of the same code     the facility codes are named after airports, and Wikidata
//                                    publishes airport coordinates under CC0. That route gives
//                                    a real coordinate for a real airport, which is not the
//                                    facility. Substituting one for the other and putting a
//                                    badge on it would be a made up number wearing a citation
//                                    that does not support it, which is worse than the row not
//                                    existing.
//
// So the table ships empty and the product degrades to a stated outcome: the facility code is
// shown as REPORTED, exactly as the edge gave it, and every distance is computed from a city
// the reader chooses and is labelled as the reader choice. The engine never invents the
// coordinate, and observer.js has no code path that could.
//
// This is not a permanent verdict. The moment a coordinate for a facility can be cited to a
// source a reader can re-pull, a row goes in here, the REPORTED observer path lights up with no
// other change anywhere, and every row added is auditable one line at a time.
//
// EVERY ROW MUST CARRY A CITATION. assertColoSite refuses one without, so the empty table
// cannot be filled in later by somebody in a hurry.
//
// Isomorphic: no node:* imports and no DOM.

import { assertCoord } from '../core/geo.js';

/**
 * @typedef {Object} ColoSite
 * @property {string} colo Three letter facility code, upper case, as the edge reports it.
 * @property {string} label Human readable place name shown beside the coordinate.
 * @property {number} lat
 * @property {number} lon
 * @property {string} sourceId Key into src/core/data/sources.js.
 * @property {string} sourceRef An identifier a reader uses to re-pull the exact value.
 */

/**
 * The registry. Empty in V1. See the header for the two sources that were tried and why
 * neither of them can fill it honestly.
 * @type {readonly ColoSite[]}
 */
export const COLO_SITES = Object.freeze([]);

/** Why the registry is empty, in one sentence, for the run notice and for the README. */
export const COLO_SITES_EMPTY_BECAUSE =
  'No catalogue of facility coordinates was available on the snapshot date from a source that '
  + 'is both readable by a page and licensed to be shipped in it, so this product cites none '
  + 'rather than approximating one.';

/**
 * Validate a row before it is used. Throws with the field name.
 * @param {unknown} s
 * @param {number} [i]
 * @returns {ColoSite}
 */
export function assertColoSite(s, i = 0) {
  const at = 'coloSites[' + i + ']';
  if (s === null || typeof s !== 'object') throw new TypeError(at + ': expected an object');
  const site = /** @type {ColoSite} */ (s);
  if (typeof site.colo !== 'string' || !/^[A-Z]{3}$/.test(site.colo)) {
    throw new TypeError(at + '.colo: expected a three letter upper case facility code, got ' + String(site.colo));
  }
  if (typeof site.label !== 'string' || site.label.length === 0) {
    throw new TypeError(at + '.label: required, and shown beside the coordinate');
  }
  assertCoord({ lat: site.lat, lon: site.lon }, at);
  if (typeof site.sourceId !== 'string' || site.sourceId.length === 0
    || typeof site.sourceRef !== 'string' || site.sourceRef.length === 0) {
    throw new TypeError(at + ': every coordinate carries the source it came from and a reference '
      + 'a reader can re-pull. A coordinate nobody can check is a coordinate nobody should see.');
  }
  return site;
}

/**
 * Look a facility code up. Returns undefined when this product holds no cited coordinate for
 * it, which in V1 is always, and which the caller must handle as a stated outcome.
 * @param {string} colo
 * @param {readonly ColoSite[]} [sites]
 * @returns {ColoSite|undefined}
 */
export function coloSiteFor(colo, sites = COLO_SITES) {
  if (typeof colo !== 'string') return undefined;
  const key = colo.trim().toUpperCase();
  const hit = sites.find((s) => s.colo === key);
  return hit === undefined ? undefined : assertColoSite(hit, sites.indexOf(hit));
}
