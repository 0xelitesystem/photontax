// THE CAPTURE FIXTURE. DESIGN 8.5: "?fixture=1 loads the committed measurement fixture instead
// of measuring, so captures never depend on the capturing machine's ISP."
//
// WHAT THIS IS, EXACTLY, SO NOBODY EVER MISTAKES IT FOR A RESULT.
//
// These are real measurements, taken once on a date and published in DESIGN Appendix B: TCP
// connect time, minimum of five, from a machine in Virginia to six AWS regional service
// endpoints. They are here so that a screenshot, a GIF and a regression test are frame identical
// today and in two years, instead of depending on whoever is holding the camera.
//
// WHAT THEY ARE NOT. They are not warm HTTPS round trips, which is what a live run measures, so
// every figure built from them carries the METHODS.FIXTURE_* entries and never the warm ones.
// And the fixture holds minimums only: the samples behind each minimum were never published, so
// none are shipped and none are made up.
//
// THE OBSERVER IS A BUNDLED CITY CENTRE, NOT THE MACHINE. The recording machine's own position
// is not in this repository. The physics uses the nearest city centre the page already ships,
// Ashburn, Virginia, as the observer point, and the banner says so. The recorded figures stay as
// recorded; every distance, floor and split below is recomputed from that city centre.
//
// THE RECORDED FIGURES ARE THE ONLY THING TAKEN FROM THE FIXTURE. Every distance and every floor
// is recomputed from the coordinates this page ships, live, by the same haversine and the same
// constant as a real run. Copying Appendix B's distances in as well would be publishing figures
// that nothing in this repository checks.
//
// THE PAGE SHOUTS WHEN THIS IS LOADED. A visitor who lands on a fixture URL sees a banner saying
// these are somebody else's numbers from a stated date, because the one way this product fails
// completely is a reader believing a figure that is not about them.
//
// WHY THE DECOMPOSITION IS COMPUTED HERE. The three way split belongs to another team and the
// live path refuses to run without it (see ports.js). A capture cannot wait on that, so the
// arithmetic below is a reference implementation of the four steps the contract documents, and
// every one of its outputs is handed to assertDecompositionRun, which checks the identity, the
// minimum surplus rule, the ratio formula, the verdict mapping, the distance gate and the
// faster than light screen term by term. It is reachable only from the capture flag.
//
// Isomorphic: no node:* imports and no DOM.

import { greatCircleKm } from '../core/geo.js';
import { floorMsForDistanceKm, WARM_SAMPLE_COUNT } from '../core/constants.js';
import {
  DECOMPOSITION_SCHEMA, assertDecompositionRun, verdictFor, ratioIsMeaningful,
  RATIO_SUPPRESSED_REASON,
} from '../core/contracts/decomposition.js';
import { endpointById } from '../core/data/endpoints.js';
import { cityById } from './citypicker.js';

/**
 * The observer city: a bundled city centre, looked up rather than typed, so the fixture carries
 * no coordinate of its own. Washington, DC was the first choice and the bundled table has no
 * such city; Ashburn, Virginia is the nearest centre it does have. It is also the us-east-1
 * coordinate, so that row is honestly 0 km with a 0 ms floor, and all of its figure is access.
 */
export const FIXTURE_CITY = /** @type {import('./citypicker.js').PickableCity} */ (cityById('aws:us-east-1'));

/** Where the fixture came from. Printed on screen whenever it is loaded. */
export const FIXTURE_PROVENANCE = Object.freeze({
  takenOn: '2026-09-18',
  method: 'TCP connect time, minimum of five, to AWS regional service endpoints',
  observerNote: 'Recorded once from a machine in Virginia; the physics here uses '
    + FIXTURE_CITY.label + ' city centre as the observer point.',
  banner:
    'You are looking at a committed capture fixture, not a measurement of your connection. '
    + 'Each figure is a TCP connect time, the minimum of five, recorded once from a machine in '
    + 'Virginia on the date below; the physics here uses ' + FIXTURE_CITY.label + ' city centre '
    + 'as the observer point. It is shipped so that screenshots and tests stay identical over '
    + 'time. Remove the fixture flag from the address to measure your own connection.',
});

/**
 * The observer point of the capture: the bundled city centre above, never the machine. It is
 * carried as a picked city rather than a reported facility, because nothing reported it.
 */
export const FIXTURE_OBSERVER = Object.freeze({
  source: 'visitor-picked-city',
  colo: null,
  label: FIXTURE_CITY.label + ' city centre, capture fixture',
  lat: FIXTURE_CITY.lat,
  lon: FIXTURE_CITY.lon,
  badge: 'INFERRED',
});

/** The recorded TCP connect minimums, in milliseconds. DESIGN Appendix B, verbatim. */
export const FIXTURE_ROUND_TRIPS = Object.freeze([
  Object.freeze({ endpointId: 'aws:us-east-1', roundTripMs: 9.20 }),
  Object.freeze({ endpointId: 'aws:eu-central-1', roundTripMs: 91.88 }),
  Object.freeze({ endpointId: 'aws:sa-east-1', roundTripMs: 124.17 }),
  Object.freeze({ endpointId: 'aws:ap-northeast-1', roundTripMs: 184.51 }),
  Object.freeze({ endpointId: 'aws:ap-south-1', roundTripMs: 251.45 }),
  Object.freeze({ endpointId: 'aws:ap-southeast-2', roundTripMs: 204.59 }),
]);

/**
 * A run shaped like the real one, so the page takes the same path, with one deliberate
 * difference: there are no samples. Appendix B publishes each minimum and not the five
 * connects behind it, so samplesMs is empty and spreadMs is null. Seven samples used to be
 * synthesised here and shown as MEASURED; a number that was never taken cannot carry that
 * badge, so they are gone. This is therefore NOT a run that assertMeasurementRun accepts, since
 * that requires seven, and the page skips the sample count check in fixture mode.
 *
 * @returns {import('../core/contracts/measurement.js').MeasurementRun}
 */
export function fixtureMeasurementRun() {
  return {
    schema: 1,
    startedAt: FIXTURE_PROVENANCE.takenOn + 'T00:00:00.000Z',
    observer: { ...FIXTURE_OBSERVER },
    samplesPerEndpoint: WARM_SAMPLE_COUNT,
    endpoints: FIXTURE_ROUND_TRIPS.map((r) => {
      const e = endpointById(r.endpointId);
      return {
        endpointId: r.endpointId,
        host: e && e.measurementHost ? e.measurementHost : '',
        samplesMs: [],
        roundTripMs: r.roundTripMs,
        spreadMs: null,
        status: 'ok',
        failureReason: null,
      };
    }),
    hostsContacted: FIXTURE_ROUND_TRIPS
      .map((r) => { const e = endpointById(r.endpointId); return e && e.measurementHost ? e.measurementHost : ''; })
      .filter((h) => h.length > 0),
  };
}

/**
 * The four steps of the decomposition, exactly as the contract documents them. Reference
 * implementation, capture path only, validated term by term before it is returned.
 *
 *   1. floorMs(E)     = 2 * greatCircleKm(observer, E) / v * 1000
 *   2. accessMs       = min over all usable E of ( roundTripMs(E) - floorMs(E) )
 *   3. routeMs(E)     = roundTripMs(E) - floorMs(E) - accessMs
 *   4. routeRatio(E)  = ( roundTripMs(E) - accessMs ) / floorMs(E)
 *
 * @param {import('../core/contracts/measurement.js').MeasurementRun} run
 * @returns {import('../core/contracts/decomposition.js').DecompositionRun}
 */
export function decomposeFixture(run) {
  const observer = { lat: run.observer.lat, lon: run.observer.lon };

  const base = run.endpoints
    .filter((m) => m.status === 'ok' && m.roundTripMs !== null)
    .map((m) => {
      const e = endpointById(m.endpointId);
      if (!e) throw new RangeError('decomposeFixture: unknown endpoint ' + m.endpointId);
      const distanceKm = greatCircleKm(observer, { lat: e.lat, lon: e.lon });
      return { m, distanceKm, floorMs: floorMsForDistanceKm(distanceKm) };
    });

  // Step 3 of the screening order, and it comes BEFORE the baseline on purpose: a faster than
  // light row would drag the minimum surplus below zero and poison every other row in the run.
  const defectsRaw = base.filter((b) => b.m.roundTripMs < b.floorMs);
  const usable = base.filter((b) => b.m.roundTripMs >= b.floorMs);

  const surpluses = usable.map((b) => b.m.roundTripMs - b.floorMs);
  const accessMs = surpluses.length ? Math.min(...surpluses) : 0;
  const setter = usable.find((b) => Math.abs((b.m.roundTripMs - b.floorMs) - accessMs) < 1e-12);

  const rows = usable.map((b) => {
    const routeMs = b.m.roundTripMs - b.floorMs - accessMs;
    const meaningful = ratioIsMeaningful(b.distanceKm);
    const routeRatio = meaningful ? (b.m.roundTripMs - accessMs) / b.floorMs : null;
    const verdict = routeRatio === null ? null : verdictFor(routeRatio);
    return {
      endpointId: b.m.endpointId,
      distanceKm: b.distanceKm,
      floorMs: b.floorMs,
      roundTripMs: b.m.roundTripMs,
      accessMs,
      routeMs,
      routeRatio,
      ratioSuppressedReason: meaningful ? null : RATIO_SUPPRESSED_REASON,
      verdict,
      msOnTheTable: verdict === 'ON_THE_TABLE' ? Math.round(routeMs - 0.15 * b.floorMs) : null,
      defect: null,
    };
  });

  const defects = defectsRaw.map((b) => ({
    endpointId: b.m.endpointId,
    distanceKm: b.distanceKm,
    floorMs: b.floorMs,
    roundTripMs: b.m.roundTripMs,
    accessMs,
    routeMs: 0,
    routeRatio: null,
    ratioSuppressedReason: null,
    verdict: null,
    msOnTheTable: null,
    defect: {
      kind: 'faster-than-light',
      detail: 'This result came back faster than light for the stated geography, which is a '
        + 'defect and not a result. It is dropped and counted, never averaged in and never '
        + 'clamped.',
    },
  }));

  return assertDecompositionRun({
    schema: DECOMPOSITION_SCHEMA,
    accessMs,
    accessFromEndpointId: setter ? setter.m.endpointId : '',
    rows,
    defects,
    unstableCount: run.endpoints.filter((m) => m.status === 'unstable').length,
    unusableCount: run.endpoints.filter((m) => m.status === 'failed' || m.status === 'blocked').length,
  });
}
