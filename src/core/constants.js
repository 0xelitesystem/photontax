// The physics and geometry core. DESIGN 2.3 (COMPUTED), DESIGN 4 C1, DESIGN 7.1.
//
// Every constant in this file carries the primary source it came from. Nothing here is
// measured, estimated or averaged. Given the same two coordinates, every value below is
// reproducible offline, on paper, by anyone, forever. That is the whole point of the
// COMPUTED badge: an arithmetic claim a reader can check without trusting us.
//
// Isomorphic: no node:* imports and no DOM. Runs identically in the browser and in the tests.

/**
 * Speed of light in vacuum, metres per second, EXACT.
 *
 * Source: the SI definition of the metre. Since the 17th CGPM (1983) the metre is defined as
 * the length of the path travelled by light in vacuum during 1/299792458 of a second, which
 * fixes c at exactly 299792458 m/s by definition. It is not a measurement and it carries no
 * uncertainty, so no error bar is shown next to any number derived from it.
 * Citation shipped in the UI: SOURCES.si_metre in ./data/sources.js
 */
export const C_VACUUM_M_S = 299792458;

/**
 * Effective group index of refraction of the fibre, dimensionless.
 *
 * Source: Corning SMF-28 single mode optical fibre product information sheet, effective group
 * index of refraction at 1550 nm. SMF-28 and its successors are the standard long haul
 * terrestrial and submarine single mode fibre, and 1550 nm is the C band window every long
 * haul system runs in.
 *
 * GROUP index, not phase index. Group index governs how fast a modulated signal (which is
 * what carries data) propagates. Using the phase index here would be a category error that
 * quietly shifts every floor in the product.
 *
 * This is the ONLY empirical input to the floor. Everything else is definition or geometry.
 * A different fibre would move the floor by well under the rounding we display, and we do not
 * claim to know which fibre any particular path uses, which is why the constant and its source
 * are printed next to the result rather than hidden.
 * Citation shipped in the UI: SOURCES.corning_smf28 in ./data/sources.js
 */
export const FIBRE_GROUP_INDEX_1550NM = 1.4682;

/**
 * Speed of light in single mode fibre, kilometres per second.
 *
 * Computed, not typed: 299792458 / 1.4682 / 1000 = 204190.47677428144 km/s.
 * DESIGN 2.3 and DESIGN 7.1 publish this as 204190.5 km/s, which is this value to 1 decimal.
 * The full precision value is what the arithmetic uses; the rounded one is what the page prints.
 */
export const V_FIBRE_KM_S = C_VACUUM_M_S / FIBRE_GROUP_INDEX_1550NM / 1000;

/**
 * The published, human readable form of V_FIBRE_KM_S, to 1 decimal place: 204190.5.
 * Pinned by test so a change to either input cannot silently move the published constant.
 */
export const V_FIBRE_KM_S_PUBLISHED = 204190.5;

/**
 * Mean Earth radius, kilometres.
 *
 * Source: IUGG mean radius R1 of the WGS 84 / GRS 80 ellipsoid, (2a + b) / 3 = 6371.0088 km.
 * DESIGN 2.3 fixes this exact value. The haversine models the Earth as a sphere, so the choice
 * of which single radius to use IS the model, and it is stated rather than assumed.
 *
 * The residual ellipsoidal error against a geodesic on the true ellipsoid is a few tenths of a
 * percent at worst. That is far below the dominant uncertainty in this product, which is that
 * a cloud region coordinate is a city centre and not a building (DESIGN 2.4, trap 6). The floor
 * is a LOWER BOUND and a sphere understates no great circle by enough to break that bound at
 * the whole millisecond precision we display.
 * Citation shipped in the UI: SOURCES.iugg_mean_radius in ./data/sources.js
 */
export const EARTH_MEAN_RADIUS_KM = 6371.0088;

/**
 * Round trip fibre floor for exactly 1000 km of great circle separation, milliseconds.
 *
 * Computed: 2 * 1000 / 204190.47677428144 * 1000 = 9.794776091398536 ms.
 * DESIGN 2.3 and DESIGN 7.1 publish this as 9.7948 ms per 1000 km, which is this value to 4
 * decimals. The factor of 2 is the round trip. There is no directional claim anywhere in this
 * product (DESIGN 2.5, trap 17): a round trip is one number covering two paths that are
 * frequently different, and we never split it.
 */
export const FLOOR_MS_PER_1000_KM = (2 * 1000) / V_FIBRE_KM_S * 1000;

/** The published, human readable form of FLOOR_MS_PER_1000_KM, to 4 decimals: 9.7948. */
export const FLOOR_MS_PER_1000_KM_PUBLISHED = 9.7948;

/**
 * Longest great circle distance physically possible on a sphere of EARTH_MEAN_RADIUS_KM:
 * half the circumference, pi * R = 20015.114442035925 km.
 *
 * DESIGN 7.3 asserts every distance in the fixture is under 20040 km. Any distance above this
 * value is arithmetically impossible and indicates a defect in the input, not a long path.
 */
export const MAX_GREAT_CIRCLE_KM = Math.PI * EARTH_MEAN_RADIUS_KM;

/**
 * Ratio of published long haul cable length to the great circle distance between the same two
 * ends of that same system, median over long haul point to point systems. DESIGN 2.4.
 *
 * INFERRED, NOT MEASURED, and derived from a third party dataset this repo does not ship.
 * It exists only so the UI can draw a secondary grey "route adjusted" line, never a headline,
 * and only behind an INFERRED badge that states this sentence first. DESIGN 7.1 requires the
 * derivation script to ship before this number is displayed anywhere.
 *
 * NOT YET DERIVABLE FROM ANYTHING IN THIS REPO. Until scripts/derive-route-factor.mjs exists
 * and recomputes it, ROUTE_FACTOR_AVAILABLE is false and no consumer may render it. Shipping
 * the number without its derivation would be exactly the failure DESIGN trap 20 bans.
 */
export const ROUTE_FACTOR_MEDIAN = 1.13;

/** Gate on ROUTE_FACTOR_MEDIAN. Flip to true only when the derivation script ships. */
export const ROUTE_FACTOR_AVAILABLE = false;

/**
 * Verdict thresholds on the route ratio. DESIGN 4 C3. Fixed, printed, never tuned per visitor.
 *
 * AT_FLOOR is 1.15 because ROUTE_FACTOR_MEDIAN is 1.13: a route inside 1.15 is already inside
 * the geometry of cable itself and cannot be improved by routing. NORMAL_MAX is 1.6. Both are
 * published with that derivation rather than asserted (DESIGN 7.1).
 */
export const VERDICT_AT_FLOOR_MAX = 1.15;
export const VERDICT_NORMAL_MAX = 1.6;

/**
 * Below this great circle separation NO ratio of any kind is rendered. DESIGN 4 C3, trap 2.
 *
 * At 83 km a fixed 8.4 ms access cost sits on top of a 0.81 ms floor and the naive ratio reads
 * 11.35x, which is an artifact and not a result. Absolute milliseconds only below this line.
 */
export const RATIO_MIN_DISTANCE_KM = 500;

/** Warm samples taken per endpoint after the discarded warm up response. DESIGN 2.1, trap 5. */
export const WARM_SAMPLE_COUNT = 7;

/**
 * The discarded warm up response, per endpoint. DESIGN trap 5: the first response opens the
 * connection and carries the TLS handshake and a cold server, so it is thrown away before the
 * seven that count are taken.
 *
 * It is a constant rather than a literal inside the run loop because the consent line has to
 * print it. A visitor told "7 requests" when the page makes 8 has been given a number that is
 * wrong in the flattering direction, which is the same class of error as understating a
 * measurement.
 */
export const WARM_UP_REQUEST_COUNT = 1;

/**
 * Requests made per run that are not an endpoint measurement. Exactly one: the facility
 * endpoint that names the serving edge for this connection (DESIGN 2.2).
 */
export const NON_MEASUREMENT_REQUEST_COUNT = 1;

/** Total requests one run makes against one endpoint, warm up included. */
export const REQUESTS_PER_ENDPOINT = WARM_SAMPLE_COUNT + WARM_UP_REQUEST_COUNT;

/**
 * If the spread of the warm samples for one endpoint exceeds this many milliseconds, the row is
 * reported as unstable and its spread is shown INSTEAD of a single number. DESIGN 6.5, 7.3.
 */
export const SAMPLE_SPREAD_UNSTABLE_MS = 30;

/**
 * Displayed precision floor, milliseconds. DESIGN trap 9.
 *
 * performance.now() is clamped to 100 microseconds in Chrome and to 1 ms in Firefox and Safari
 * outside cross origin isolation. Rendering a sub millisecond figure would claim a precision
 * the platform cannot supply. Full precision is kept internally for the arithmetic only.
 */
export const DISPLAY_PRECISION_MS = 1;

/**
 * Round trip fibre floor in milliseconds for a great circle distance in kilometres.
 * DESIGN 4 C1. Pure, total, and offline.
 *
 * @param {number} distanceKm Great circle distance in kilometres. Finite and >= 0.
 * @returns {number} Round trip floor in milliseconds, full internal precision.
 */
export function floorMsForDistanceKm(distanceKm) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new TypeError('floorMsForDistanceKm: distanceKm must be a finite number >= 0, got ' + String(distanceKm));
  }
  if (distanceKm > MAX_GREAT_CIRCLE_KM + 1e-6) {
    throw new RangeError('floorMsForDistanceKm: ' + distanceKm + ' km exceeds the longest possible great circle, ' + MAX_GREAT_CIRCLE_KM.toFixed(4) + ' km');
  }
  return (2 * distanceKm) / V_FIBRE_KM_S * 1000;
}

/**
 * Every intermediate term of the floor calculation, for the "show the maths" panel.
 * DESIGN 5 (the second beat) and DESIGN 7.3 require the page to reprint each term rather than
 * asserting the result.
 *
 * @param {number} distanceKm
 * @returns {{distanceKm:number, roundTripKm:number, cVacuumMS:number, groupIndex:number,
 *            vFibreKmS:number, floorMs:number, floorMsPer1000Km:number}}
 */
export function floorTerms(distanceKm) {
  const floorMs = floorMsForDistanceKm(distanceKm);
  return {
    distanceKm,
    roundTripKm: 2 * distanceKm,
    cVacuumMS: C_VACUUM_M_S,
    groupIndex: FIBRE_GROUP_INDEX_1550NM,
    vFibreKmS: V_FIBRE_KM_S,
    floorMs,
    floorMsPer1000Km: FLOOR_MS_PER_1000_KM,
  };
}
