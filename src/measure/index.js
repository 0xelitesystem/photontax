// THE MEASUREMENT ENGINE, public surface. DESIGN 2.1, 4 C2, 4 C3, 5, 7.3.
//
// Import this module and nothing else. The internals are split by responsibility so each piece
// can be tested on its own, but a caller should never have to know which file the honesty lives
// in. Nothing here touches the network until measure() is called, and measure() is only ever
// called from a click (trap 14).
//
// THE ORDER OF OPERATIONS, and why it is this order:
//
//   1. Ask the serving edge what it is. One request, keyless, no cookie stored.
//   2. Resolve the observer point. REPORTED facility if this product can cite a coordinate for
//      it, otherwise the city the reader chose, labelled as the reader choice. Never a lookup.
//   3. Measure. Twelve endpoints, one discarded warm up and seven warm samples each.
//   4. Decompose. Screen the impossible results out, take the access baseline as the minimum
//      surplus, and take route as the remainder.
//   5. Check the work in front of the reader.
//
// Step 2 comes before step 3 because a run with no observer has no floors, and a page that
// measured first and asked afterwards would have spent the reader network budget on numbers it
// could not decompose.
//
// Isomorphic: no node:* imports and no DOM.

import { readReportedConnection, noticesForTrace } from './trace.js';
import { resolveObserver } from './observer.js';
import { runMeasurement, requestPlan, hostAccounting } from './run.js';
import { decompose, defaultCoordFor } from './decompose.js';
import { engineSelfTest } from './selftest.js';

export { readReportedConnection, parseTrace, noticesForTrace } from './trace.js';
export { resolveObserver } from './observer.js';
export { COLO_SITES, COLO_SITES_EMPTY_BECAUSE, assertColoSite, coloSiteFor } from './colo-sites.js';
export { measureEndpoint, takeSample, classifyFailure, browserReportsOffline } from './roundtrip.js';
export { runMeasurement, requestPlan, hostAccounting, pool, CONCURRENCY } from './run.js';
export { decompose, naiveRatio, defaultCoordFor } from './decompose.js';
export { engineSelfTest } from './selftest.js';
export { now, clockSource, wholeMs, isDisplayablePrecision } from './clock.js';
export { FAILURE_REASONS, RUN_NOTICES, EXCLUSION_REASONS } from './reasons.js';
export {
  ALL_REACHABLE_HOSTS, NON_MEASUREMENT_HOSTS, PROBE_INIT, PROBES,
  REQUEST_TIMEOUT_MS, TRACE_PATH, probeFor, deadline,
} from './transport.js';

/**
 * @typedef {Object} EngineResult
 * @property {'done'|'nothing-measured'|'needs-city-pick'} state
 * @property {import('../core/contracts/measurement.js').MeasurementRun|null} measurement
 * @property {import('../core/contracts/decomposition.js').DecompositionRun|null} decomposition
 * @property {import('./decompose.js').ExcludedRow[]} excluded
 * @property {import('./trace.js').RunNotice[]} notices
 * @property {import('./selftest.js').SelfTestCheck[]} selfTest
 * @property {string|null} reportedColo
 * @property {{contacted: string[], declared: string[], undeclared: string[]}|null} hosts
 * @property {ReturnType<typeof requestPlan>} plan
 * @property {'performance.now'|'Date.now'|null} clock Which clock took the samples, so a wall
 *   clock reading is never presented as a monotonic one.
 */

/**
 * Keep the first notice of each id. Two modules reporting the same fact is correct; a page
 * printing the same sentence twice is not.
 * @param {import('./trace.js').RunNotice[]} notices
 * @returns {import('./trace.js').RunNotice[]}
 */
export function dedupeNotices(notices) {
  const seen = new Set();
  /** @type {import('./trace.js').RunNotice[]} */
  const out = [];
  for (const n of notices) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

/**
 * The whole measurement, end to end.
 *
 * @param {Object} [input]
 * @param {{lat: number, lon: number, label: string}|null} [input.pickedCity] The city the reader
 *   chose. Required in V1, because no facility coordinate can be cited yet. See colo-sites.js.
 * @param {readonly {id: string, measurementHost: string|null, measured: boolean}[]} [input.endpoints]
 * @param {readonly import('./colo-sites.js').ColoSite[]} [input.coloSites]
 * @param {boolean} [input.readFacility] Whether to ask the facility endpoint which edge served
 *   this connection. Defaults to true when no city has been chosen and FALSE when one has,
 *   because by then the page already has its observer point. Pass true explicitly to take both
 *   in one call, which is what the tests do.
 * @param {number} [input.concurrency]
 * @param {Object} [input.deps] Injected for tests. Production passes nothing.
 * @returns {Promise<EngineResult>}
 */
export async function measure(input = {}) {
  const deps = input.deps || {};
  const plan = requestPlan(input.endpoints);

  // THE FACILITY ENDPOINT IS ASKED ONCE PER VISIT, NOT ONCE PER CALL.
  //
  // V1 takes two calls to get a result: the first has no observer point, reads the facility,
  // finds that no coordinate for it can be cited, and asks the reader for a city; the second
  // arrives with that city and measures. Asking the facility again on the second call would
  // make one more request than the consent line beside the button promises, and it would buy
  // nothing: the reader has already given this page an observer point, and the facility has
  // no coordinate this product may ship regardless of what it answers.
  //
  // Counted: 1 request on the first press, then 12 endpoints times 8 requests on the second.
  // 97 in total, which is exactly the number the page printed before the reader pressed
  // anything. A consent line that is right only for one of the two presses is not a consent
  // line (DESIGN trap 14).
  const traceWasCalled = input.readFacility === undefined
    ? !input.pickedCity
    : input.readFacility === true;
  const trace = traceWasCalled
    ? await readReportedConnection({
      fetchTrace: deps.fetchTrace,
      timeoutMs: deps.timeoutMs,
      signal: deps.signal,
    })
    : null;

  const resolution = resolveObserver({
    trace,
    traceAttempted: traceWasCalled,
    pickedCity: input.pickedCity || null,
    coloSites: input.coloSites,
  });
  // Both the trace reader and the observer resolver have something to say when the facility
  // endpoint does not answer, and they are right to: each is usable on its own. Said twice on
  // one page it reads as a stutter, so the run keeps the first of each id and drops repeats.
  const notices = dedupeNotices([
    ...(trace === null ? [] : noticesForTrace(trace)),
    ...resolution.notices,
  ]);

  if (resolution.observer === null) {
    return {
      state: 'needs-city-pick',
      measurement: null,
      decomposition: null,
      excluded: [],
      notices,
      selfTest: [],
      reportedColo: resolution.reportedColo,
      hosts: null,
      plan,
      clock: null,
    };
  }

  const measured = await runMeasurement({
    observer: resolution.observer,
    endpoints: input.endpoints,
    concurrency: input.concurrency,
    traceWasCalled,
    deps,
  });
  notices.push(...measured.notices);

  const { decomposition, excluded } = decompose({
    measurement: measured.run,
    coordFor: deps.coordFor || defaultCoordFor,
  });

  const selfTest = engineSelfTest({
    measurement: measured.run,
    decomposition,
    traceWasCalled,
  });

  return {
    state: decomposition.rows.length === 0 ? 'nothing-measured' : 'done',
    measurement: measured.run,
    decomposition,
    excluded,
    notices: dedupeNotices(notices),
    selfTest,
    reportedColo: resolution.reportedColo,
    hosts: hostAccounting(measured.run, traceWasCalled),
    plan,
    clock: measured.clock,
  };
}
