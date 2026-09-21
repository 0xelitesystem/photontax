// THE CITY PICKER. DESIGN trap 7, and the honest half of it.
//
// The page never geolocates the visitor. IP geolocation returns a national fallback centroid
// for a large share of addresses, which is the coordinate behind a well known lawsuit against a
// Kansas farm, and a floor computed from a point a thousand kilometres from where somebody
// actually is would be confidently wrong in the flattering direction.
//
// The design's fallback was to ask the visitor to pick their city if the facility could not be
// read. In V1 that is not a fallback, it is the path: the serving facility names itself, but
// this product ships no catalogue of facility coordinates, because none was available that a
// page may both read and redistribute. A three letter code with no coordinate behind it is not
// a point to measure from.
//
// So the page asks. The answer never leaves the browser, and the list it asks from is already
// on the page: the cities in the bundled region table, each with a coordinate that is already
// labelled INFERRED and already carries the sentence saying it is a city centre and not a
// building. Nothing new is shipped, nothing new is claimed, and the assumption the reader is
// accepting is the same one every other coordinate on the page carries.
//
// Isomorphic: no node:* imports and no DOM. The DOM half lives in page.js.

import { ENDPOINTS } from '../core/data/endpoints.js';
import { REGION_COORDINATE_DISCLAIMER } from '../core/data/disclaimers.js';

/**
 * @typedef {Object} PickableCity
 * @property {string} id
 * @property {string} label
 * @property {number} lat
 * @property {number} lon
 */

/**
 * The cities a reader may pick, deduplicated and sorted by name.
 *
 * These are the city centres already bundled for the region table. A reader is not choosing a
 * data centre, they are choosing the nearest city this page already knows a coordinate for, and
 * the wording on screen says exactly that.
 *
 * @returns {PickableCity[]}
 */
export function pickableCities() {
  /** @type {Map<string, PickableCity>} */
  const byCity = new Map();
  for (const e of ENDPOINTS) {
    if (byCity.has(e.city)) continue;
    byCity.set(e.city, { id: e.id, label: e.city, lat: e.lat, lon: e.lon });
  }
  return [...byCity.values()].sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

/** What the picker says above itself. The assumption before the number, as everywhere else. */
export const PICKER_PROMPT =
  'Which city are you nearest? This page does not look you up and never will, so it needs you '
  + 'to say. Your answer stays in this browser and is never sent anywhere.';

/** The sentence attached to whatever the reader picks. */
export const PICKER_DISCLAIMER = REGION_COORDINATE_DISCLAIMER
  + ' The same is true of the point you pick here: it is a city centre, so every floor below '
  + 'is a floor for that city and not for your desk.';

/**
 * @param {string} cityId
 * @returns {PickableCity|null}
 */
export function cityById(cityId) {
  return pickableCities().find((c) => c.id === cityId) || null;
}
