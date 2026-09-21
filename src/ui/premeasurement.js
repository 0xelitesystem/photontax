// THE FACT A READER GETS BEFORE THEY CLICK ANYTHING.
//
// DESIGN 5, seconds 0 to 3: "A single line is already computed and displayed, from arithmetic
// alone, with no network at all. A reader who never clicks has already received a true,
// surprising, sourced fact. That is the floor of the experience."
//
// Three properties, and each one is checked by a test:
//
//   NOTHING HAS TOUCHED THE NETWORK. Both coordinates are bundled rows from the endpoint
//   table. The distance is a haversine and the floor is a division. This line renders with the
//   network disconnected, which is also why DESIGN 6.4 can promise the page is useful to the
//   person debugging a network that is already broken.
//
//   THE NUMBERS ARE RECOMPUTED, NEVER TYPED. DESIGN 5 quotes this line with 12,924 km and
//   127 ms, which are the maintainer's own house to Mumbai from Appendix B. The page has not
//   looked the visitor up and never will (trap 7), so it uses the two BUNDLED coordinates and
//   prints whatever the arithmetic returns for those. A figure copied out of a design document
//   is a figure nothing checks.
//
//   THE ASSUMPTION IS ON SCREEN BEFORE THE NUMBER. Both coordinates are city centres, which
//   makes this a floor for the CITY and not for the building. DESIGN 2.4 requires that sentence
//   first, not in a footnote, so REGION_COORDINATE_DISCLAIMER is part of this block rather than
//   an aside next to it.
//
// Isomorphic: no node:* imports and no DOM.

import { computed, UNITS, METHODS } from '../core/claim.js';
import { greatCircleKm } from '../core/geo.js';
import { floorMsForDistanceKm } from '../core/constants.js';
import { endpointById } from '../core/data/endpoints.js';
import { REGION_COORDINATE_DISCLAIMER } from '../core/data/disclaimers.js';
import { t, c, plainText } from './parts.js';

/**
 * The pair used for the pre click line.
 *
 * Both are rows in the bundled table, and both are measured endpoints, so the reader can watch
 * this exact pair appear again in the result once they do press the button. That continuity is
 * the point: the line is not an illustration, it is a row of the table computed early.
 *
 * The far end is the longest well known haul from the US east coast in the bundled set, which
 * is what makes the number surprising rather than merely true.
 */
export const PRE_MEASUREMENT_PAIR = Object.freeze({ fromId: 'aws:us-east-1', toId: 'aws:ap-south-1' });

/**
 * @typedef {Object} PreMeasurement
 * @property {string} sentence Plain text, badge words included. Required by the view model.
 * @property {import('./parts.js').Part[]} parts The same sentence as prose runs and Claims.
 * @property {import('../core/claim.js').Claim} distance COMPUTED, km.
 * @property {import('../core/claim.js').Claim} floor COMPUTED, ms.
 * @property {string} disclaimer The INFERRED coordinate sentence, shown BEFORE the numbers.
 * @property {{id:string, label:string, lat:number, lon:number}} from
 * @property {{id:string, label:string, lat:number, lon:number}} to
 */

/**
 * Build the pre click fact. Pure, offline, and the same every time.
 * @returns {PreMeasurement}
 */
export function buildPreMeasurement() {
  const from = endpointById(PRE_MEASUREMENT_PAIR.fromId);
  const to = endpointById(PRE_MEASUREMENT_PAIR.toId);
  if (!from || !to) {
    throw new RangeError('buildPreMeasurement: the pre click pair names a row that is not in the '
      + 'bundled endpoint table. The pair must be two rows the reader can also see in the result.');
  }

  const distanceKm = greatCircleKm({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon });
  const floorMs = floorMsForDistanceKm(distanceKm);

  const distance = computed(distanceKm, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, {
    sourceId: 'iugg_mean_radius',
  });
  const floor = computed(floorMs, UNITS.MS, METHODS.FIBRE_FLOOR, {
    sourceId: 'corning_smf28',
  });

  const parts = [
    t(from.city + ' to ' + to.city + ' is '),
    c(distance, 'sr'),
    t('. Light in glass cannot make that round trip in under '),
    c(floor, 'sr'),
    t('. Nothing you build can beat that number.'),
  ];

  return {
    sentence: plainText(parts),
    parts,
    distance,
    floor,
    disclaimer: REGION_COORDINATE_DISCLAIMER,
    from: { id: from.id, label: from.city, lat: from.lat, lon: from.lon },
    to: { id: to.id, label: to.city, lat: to.lat, lon: to.lon },
  };
}
