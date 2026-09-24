// Spherical geometry. DESIGN 2.3 (COMPUTED), DESIGN 7.3 (haversine, antipodal sanity).
//
// One function does the real work: the great circle distance between two coordinates on a
// sphere of EARTH_MEAN_RADIUS_KM. Everything else in this file is validation, because a
// silently wrong coordinate produces a plausible wrong floor, and a plausible wrong floor is
// the most dangerous output this product can emit.
//
// The haversine formulation is used rather than the spherical law of cosines because the law
// of cosines loses catastrophic precision at small angular separations: cos(theta) for a
// separation of a few kilometres is within one double epsilon of 1. A reader who picks Ashburn,
// Virginia measures us-east-1 at 0 km, and so does the capture fixture, so the short distance
// case is not academic.
//
// Isomorphic: no node:* imports and no DOM.

import { EARTH_MEAN_RADIUS_KM, MAX_GREAT_CIRCLE_KM } from './constants.js';

/**
 * A geographic coordinate in decimal degrees, WGS 84.
 * @typedef {{lat:number, lon:number}} Coord
 */

const DEG_TO_RAD = Math.PI / 180;

/**
 * Validate a coordinate. Throws rather than returning NaN, because a NaN distance becomes a
 * NaN floor, which becomes a rendered "NaN ms" that looks like a bug rather than a refusal.
 *
 * @param {unknown} coord
 * @param {string} [label] Used in the error message so a bad row in the endpoint table names itself.
 * @returns {Coord}
 */
export function assertCoord(coord, label = 'coordinate') {
  if (coord === null || typeof coord !== 'object') {
    throw new TypeError(label + ': expected an object with lat and lon, got ' + String(coord));
  }
  const { lat, lon } = /** @type {Coord} */ (coord);
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(label + ': lat must be a finite number in [-90, 90], got ' + String(lat));
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError(label + ': lon must be a finite number in [-180, 180], got ' + String(lon));
  }
  return { lat, lon };
}

/**
 * Great circle distance in kilometres between two coordinates, haversine on a sphere of
 * radius EARTH_MEAN_RADIUS_KM. DESIGN 2.3.
 *
 * asin is clamped at 1 so that a floating point overshoot at the antipode cannot produce NaN.
 *
 * @param {Coord} a
 * @param {Coord} b
 * @returns {number} Distance in kilometres, full internal precision, in [0, pi * R].
 */
export function greatCircleKm(a, b) {
  const p = assertCoord(a, 'greatCircleKm(a)');
  const q = assertCoord(b, 'greatCircleKm(b)');

  const phi1 = p.lat * DEG_TO_RAD;
  const phi2 = q.lat * DEG_TO_RAD;
  const dPhi = (q.lat - p.lat) * DEG_TO_RAD;
  const dLambda = (q.lon - p.lon) * DEG_TO_RAD;

  const sinHalfPhi = Math.sin(dPhi / 2);
  const sinHalfLambda = Math.sin(dLambda / 2);

  const h = sinHalfPhi * sinHalfPhi + Math.cos(phi1) * Math.cos(phi2) * sinHalfLambda * sinHalfLambda;
  const central = 2 * Math.asin(Math.min(1, Math.sqrt(h)));

  return EARTH_MEAN_RADIUS_KM * central;
}

/**
 * Every intermediate term of the haversine, for the "show the maths" panel. DESIGN 5, 7.3.
 * The reader sees the two coordinates, the two deltas in radians, the h term, the central
 * angle and the radius, then the product. Nothing is asserted that is not printed.
 *
 * @param {Coord} a
 * @param {Coord} b
 * @returns {{a:Coord, b:Coord, dPhiRad:number, dLambdaRad:number, h:number,
 *            centralAngleRad:number, radiusKm:number, distanceKm:number}}
 */
export function greatCircleTerms(a, b) {
  const p = assertCoord(a, 'greatCircleTerms(a)');
  const q = assertCoord(b, 'greatCircleTerms(b)');
  const phi1 = p.lat * DEG_TO_RAD;
  const phi2 = q.lat * DEG_TO_RAD;
  const dPhi = (q.lat - p.lat) * DEG_TO_RAD;
  const dLambda = (q.lon - p.lon) * DEG_TO_RAD;
  const sinHalfPhi = Math.sin(dPhi / 2);
  const sinHalfLambda = Math.sin(dLambda / 2);
  const h = sinHalfPhi * sinHalfPhi + Math.cos(phi1) * Math.cos(phi2) * sinHalfLambda * sinHalfLambda;
  const centralAngleRad = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return {
    a: p,
    b: q,
    dPhiRad: dPhi,
    dLambdaRad: dLambda,
    h,
    centralAngleRad,
    radiusKm: EARTH_MEAN_RADIUS_KM,
    distanceKm: EARTH_MEAN_RADIUS_KM * centralAngleRad,
  };
}

/**
 * Antipodal sanity check. DESIGN 7.3. True when a distance is arithmetically possible on the
 * modelled sphere. A false here is a defect in the input, never a very long path.
 *
 * @param {number} distanceKm
 * @returns {boolean}
 */
export function isPossibleGreatCircleKm(distanceKm) {
  return typeof distanceKm === 'number'
    && Number.isFinite(distanceKm)
    && distanceKm >= 0
    && distanceKm <= MAX_GREAT_CIRCLE_KM + 1e-9;
}

/**
 * Quantise a coordinate to 4 decimal places, about 11 metres. DESIGN 6.3.
 *
 * The precision is deliberately far finer than the underlying uncertainty, which is that the
 * coordinate is a city centre and not a building (DESIGN 2.4). Quantising keeps the shipped
 * table byte stable across regenerations; it does NOT imply survey precision, and the UI says
 * so in words rather than implying it with digits.
 *
 * @param {Coord} coord
 * @returns {Coord}
 */
export function quantiseCoord(coord) {
  const c = assertCoord(coord, 'quantiseCoord');
  return {
    lat: Math.round(c.lat * 1e4) / 1e4,
    lon: Math.round(c.lon * 1e4) / 1e4,
  };
}
