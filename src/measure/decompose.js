// THE THREE WAY DECOMPOSITION. DESIGN 4 C2 and 4 C3, DESIGN A3, traps 2, 3, 9, 17.
// This is the product. Everything else on the page exists to deliver these four lines.
//
//   1. floorMs(E)     = 2 * greatCircleKm(observer, E) / 204190.47677 * 1000        COMPUTED
//   2. accessMs       = min over all usable E of ( roundTripMs(E) - floorMs(E) )    MEASURED
//   3. routeMs(E)     = roundTripMs(E) - floorMs(E) - accessMs                      MEASURED
//   4. routeRatio(E)  = ( roundTripMs(E) - accessMs ) / floorMs(E)                  COMPUTED
//
// WHY STEP 2 EXISTS. The nearest endpoint has a floor near zero, so its entire surplus is fixed
// access cost: the local loop, the customer equipment, the scheduler on the last mile. That
// cost is paid on the way to every destination, so it is measured once and subtracted from all
// of them. Without it the test suite's short row, 55.6 km away, reads 22.04x, which is
// not a result, it is an artifact of a fixed cost sitting on a near zero floor. With it the
// same row reads 1.00x, which is both correct and the self consistency check: the endpoint that
// sets the baseline has a route surplus of exactly zero by construction.
//
// WHY ROUTE CAN NEVER BE NEGATIVE, as arithmetic rather than as hope. Let s(E) be the value of
// the expression (roundTripMs(E) - floorMs(E)) as a double. accessMs is the minimum of those
// same double values, so for every usable row s(E) >= accessMs, and IEEE 754 subtraction of two
// doubles whose true difference is non negative rounds to a non negative double. routeMs is
// computed as exactly that subtraction, in exactly that association. It is therefore >= 0 for
// every row in the output, and it is exactly 0 for the row that set the baseline. A clamp would
// hide an error here rather than prevent one, so there is no clamp.
//
// WHAT IS REFUSED, never smoothed:
//   faster than light   roundTripMs < floorMs means the distance, the number, or both are wrong.
//                       The usual cause is an anycast address answering from somewhere the
//                       coordinate does not describe. In the research pass 139 of 689 third
//                       party results against one anycast target came back faster than light.
//                       Such a row is screened out BEFORE the baseline is taken, because one of
//                       them inside step 2 would drag the baseline negative and quietly corrupt
//                       every other row on the page. It is counted and named, never averaged in
//                       and never clamped.
//   unstable rows       samples that spread too far apart do not get a single number at all.
//   unmeasured rows     a failed or blocked endpoint contributes to nothing.
//   short distances     no ratio and no verdict below 500 km, in absolute milliseconds only.
//
// Isomorphic: no node:* imports and no DOM.

import { greatCircleKm } from '../core/geo.js';
import { floorMsForDistanceKm, RATIO_MIN_DISTANCE_KM } from '../core/constants.js';
import { endpointById } from '../core/data/endpoints.js';
import {
  assertDecompositionRun, ratioIsMeaningful, verdictFor,
  DECOMPOSITION_SCHEMA, RATIO_SUPPRESSED_REASON,
} from '../core/contracts/decomposition.js';
import { EXCLUSION_REASONS } from './reasons.js';

/**
 * @typedef {Object} ExcludedRow
 * @property {string} endpointId
 * @property {'not-measured'|'unstable'|'faster-than-light'} kind
 * @property {string} reason Fixed sentence from EXCLUSION_REASONS.
 * @property {number|null} spreadMs Present for an unstable row, which shows its spread in place
 *   of a single number (DESIGN 6.5).
 * @property {string|null} failureReason The sentence the measurement layer already wrote.
 */

/**
 * The coordinate for an endpoint id, from the shipped dataset.
 *
 * Injectable, and the only reason it is injectable is the test suite: its synthetic cases place
 * endpoints at coordinates of their own (the equatorial case puts every one on the equator, so
 * each distance can be checked on paper). Production always uses the shipped rows, every one of
 * which carries the citation a reader can re-pull.
 *
 * @param {string} endpointId
 * @returns {{lat: number, lon: number}}
 */
export function defaultCoordFor(endpointId) {
  const row = endpointById(endpointId);
  if (!row) {
    throw new TypeError('decompose: unknown endpoint ' + JSON.stringify(endpointId)
      + '. Every measured row must exist in the shipped endpoint dataset.');
  }
  return { lat: row.lat, lon: row.lon };
}

/**
 * The ratio this product does NOT ship, kept as a named function for exactly one purpose: the
 * self test and the README use it to show what the decomposition defeats. DESIGN A3 records
 * that every research lens would have shipped this number; on the test suite's short row,
 * 55.6 km away, it reads 22.04x. A fix has to be shown to fix something.
 *
 * @param {{roundTripMs: number, floorMs: number}} row
 * @returns {number}
 */
export function naiveRatio(row) {
  return row.roundTripMs / row.floorMs;
}

/**
 * Decompose a measurement run.
 *
 * @param {Object} input
 * @param {import('../core/contracts/measurement.js').MeasurementRun} input.measurement
 * @param {(endpointId: string) => {lat: number, lon: number}} [input.coordFor]
 * @returns {{decomposition: import('../core/contracts/decomposition.js').DecompositionRun,
 *            excluded: ExcludedRow[]}}
 */
export function decompose(input) {
  const run = input.measurement;
  const coordFor = input.coordFor || defaultCoordFor;
  const observer = { lat: run.observer.lat, lon: run.observer.lon };

  /** @type {ExcludedRow[]} */
  const excluded = [];
  /** @type {{endpointId: string, distanceKm: number, floorMs: number, roundTripMs: number}[]} */
  const candidates = [];

  for (const e of run.endpoints) {
    if (e.status === 'failed' || e.status === 'blocked') {
      excluded.push({
        endpointId: e.endpointId,
        kind: 'not-measured',
        reason: EXCLUSION_REASONS.NOT_MEASURED,
        spreadMs: null,
        failureReason: e.failureReason,
      });
      continue;
    }
    if (e.status === 'unstable') {
      excluded.push({
        endpointId: e.endpointId,
        kind: 'unstable',
        reason: EXCLUSION_REASONS.UNSTABLE_SPREAD,
        spreadMs: e.spreadMs,
        failureReason: null,
      });
      continue;
    }
    const distanceKm = greatCircleKm(observer, coordFor(e.endpointId));
    candidates.push({
      endpointId: e.endpointId,
      distanceKm,
      floorMs: floorMsForDistanceKm(distanceKm),
      roundTripMs: /** @type {number} */ (e.roundTripMs),
    });
  }

  // THE FASTER THAN LIGHT SCREEN, before the baseline and not after it. A row that beat its own
  // floor has a negative surplus, and the baseline is a minimum, so leaving one in step 2 would
  // set a negative baseline and inflate every other row on the page by the size of the defect.
  const survivors = candidates.filter((c) => c.roundTripMs >= c.floorMs);
  const ftl = candidates.filter((c) => c.roundTripMs < c.floorMs);

  const hasBaseline = survivors.length > 0;
  const surpluses = survivors.map((c) => c.roundTripMs - c.floorMs);
  const accessMs = hasBaseline ? Math.min(...surpluses) : 0;
  const setterIndex = hasBaseline ? surpluses.indexOf(accessMs) : -1;
  const accessFromEndpointId = setterIndex >= 0 ? survivors[setterIndex].endpointId : null;

  /** @param {{endpointId: string, distanceKm: number, floorMs: number, roundTripMs: number}} c */
  const buildRow = (c) => {
    const routeMs = c.roundTripMs - c.floorMs - accessMs;
    const meaningful = ratioIsMeaningful(c.distanceKm);
    const routeRatio = meaningful ? (c.roundTripMs - accessMs) / c.floorMs : null;
    const verdict = routeRatio === null ? null : verdictFor(routeRatio);
    return {
      endpointId: c.endpointId,
      distanceKm: c.distanceKm,
      floorMs: c.floorMs,
      roundTripMs: c.roundTripMs,
      accessMs,
      routeMs,
      routeRatio,
      ratioSuppressedReason: meaningful ? null : RATIO_SUPPRESSED_REASON,
      verdict,
      msOnTheTable: verdict === 'ON_THE_TABLE' ? Math.round(routeMs - 0.15 * c.floorMs) : null,
      defect: null,
    };
  };

  const rows = survivors.map(buildRow);

  const defects = ftl.map((c) => ({
    endpointId: c.endpointId,
    distanceKm: c.distanceKm,
    floorMs: c.floorMs,
    roundTripMs: c.roundTripMs,
    accessMs,
    // The remainder is carried as it falls out of the arithmetic rather than zeroed, because a
    // defect row is a diagnostic and a zero here would be a number nobody measured. Nothing
    // renders a defect row as a result: it appears in run.defects, with its cause named.
    routeMs: c.roundTripMs - c.floorMs - accessMs,
    routeRatio: null,
    ratioSuppressedReason: null,
    verdict: null,
    msOnTheTable: null,
    defect: {
      kind: /** @type {'faster-than-light'} */ ('faster-than-light'),
      detail: EXCLUSION_REASONS.FASTER_THAN_LIGHT,
    },
  }));

  for (const d of ftl) {
    excluded.push({
      endpointId: d.endpointId,
      kind: 'faster-than-light',
      reason: EXCLUSION_REASONS.FASTER_THAN_LIGHT,
      spreadMs: null,
      failureReason: null,
    });
  }

  const decomposition = {
    schema: DECOMPOSITION_SCHEMA,
    accessMs,
    accessFromEndpointId,
    rows,
    defects,
    unstableCount: excluded.filter((x) => x.kind === 'unstable').length,
    unusableCount: excluded.filter((x) => x.kind === 'not-measured').length,
  };

  assertDecompositionRun(decomposition);
  return { decomposition, excluded };
}

/** The distance below which no ratio is rendered, re-exported so callers need one import. */
export { RATIO_MIN_DISTANCE_KM };
