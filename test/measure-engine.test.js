// The engine end to end, and the self test that checks it in front of the reader.
// DESIGN 5, DESIGN 6.4, DESIGN 7.3, traps 9, 13, 14.
//
// No socket is opened here either. A virtual clock and a scripted transport make every run
// deterministic, which is the only way an end to end test of a measurement tool can assert
// anything at all.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { WARM_SAMPLE_COUNT } from '../src/core/constants.js';
import { floorMsForDistanceKm } from '../src/core/constants.js';
import { greatCircleKm } from '../src/core/geo.js';
import { MEASURED_ENDPOINTS, MEASUREMENT_HOSTS } from '../src/core/data/endpoints.js';
import { NON_MEASUREMENT_HOSTS } from '../src/core/data/reachable-hosts.js';
import { assertMeasurementRun } from '../src/core/contracts/measurement.js';
import { assertDecompositionRun, displaySegments } from '../src/core/contracts/decomposition.js';
import { measure, dedupeNotices } from '../src/measure/index.js';
import { requestPlan, pool, hostAccounting, CONCURRENCY } from '../src/measure/run.js';
import { engineSelfTest } from '../src/measure/selftest.js';
import { wholeMs, isDisplayablePrecision, clockSource } from '../src/measure/clock.js';
import { RUN_NOTICES } from '../src/measure/reasons.js';

const CITY = { lat: 38.30, lon: -77.46, label: 'Fredericksburg, Virginia' };

const TRACE_BODY = 'fl=572f71\nh=www.cloudflare.com\nip=203.0.113.9\ncolo=IAD\nloc=US\n'
  + 'warp=off\ngateway=off\nrbi=off\n';

/**
 * A virtual world: one clock, one duration per host, and a transport that advances the clock by
 * the duration of whatever host it was asked for.
 * @param {(host: string) => number} durationFor
 */
function world(durationFor) {
  const state = { t: 0, calls: 0, byHost: new Map() };
  const now = () => state.t;
  const probeFor = (host) => async () => {
    state.calls += 1;
    state.byHost.set(host, (state.byHost.get(host) || 0) + 1);
    state.t += durationFor(host);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(42) };
  };
  const fetchTrace = async () => ({ ok: true, text: async () => TRACE_BODY });
  return { state, now, probeFor, fetchTrace };
}

/** Floor from the chosen city to each shipped endpoint, so scripted timings are plausible. */
const floorFor = new Map(MEASURED_ENDPOINTS.map((e) => [
  e.measurementHost,
  floorMsForDistanceKm(greatCircleKm(CITY, { lat: e.lat, lon: e.lon })),
]));
const hostIndex = new Map(MEASURED_ENDPOINTS.map((e, i) => [e.measurementHost, i]));

/** A run where every endpoint answers, with a shared access cost of 8.4 ms and rising surplus. */
const healthyDuration = (host) => floorFor.get(host) + 8.4 + hostIndex.get(host) * 3;

describe('a complete run', () => {
  test('produces a valid measurement, a valid decomposition and a clean self test', async () => {
    const w = world(healthyDuration);
    const r = await measure({
      pickedCity: CITY,
      concurrency: 1,
      deps: { now: w.now, probeFor: w.probeFor, fetchTrace: w.fetchTrace, startedAt: () => '2026-09-21T10:00:00.000Z' },
    });

    assert.equal(r.state, 'done');
    assert.doesNotThrow(() => assertMeasurementRun(r.measurement));
    assert.doesNotThrow(() => assertDecompositionRun(r.decomposition));
    assert.equal(r.decomposition.rows.length, MEASURED_ENDPOINTS.length);
    assert.equal(r.decomposition.defects.length, 0);
    for (const c of r.selfTest) assert.equal(c.passed, true, 'self test failed: ' + c.label + ' :: ' + c.detail);
  });

  test('the access baseline is the shared cost the script built in, and it is found without being told', async () => {
    const w = world(healthyDuration);
    const r = await measure({ pickedCity: CITY, concurrency: 1, readFacility: true, deps: { now: w.now, probeFor: w.probeFor, fetchTrace: w.fetchTrace } });
    assert.ok(Math.abs(r.decomposition.accessMs - 8.4) < 1e-9,
      'baseline came out at ' + r.decomposition.accessMs);
    assert.equal(r.decomposition.accessFromEndpointId, MEASURED_ENDPOINTS[0].id);
  });

  test('exactly one warm up and seven warm samples reach each host, and nothing else is reached', async () => {
    const w = world(healthyDuration);
    const r = await measure({ pickedCity: CITY, concurrency: 1, readFacility: true, deps: { now: w.now, probeFor: w.probeFor, fetchTrace: w.fetchTrace } });

    assert.equal(w.state.calls, MEASURED_ENDPOINTS.length * (WARM_SAMPLE_COUNT + 1));
    for (const host of MEASUREMENT_HOSTS) assert.equal(w.state.byHost.get(host), WARM_SAMPLE_COUNT + 1, host);
    // hostsContacted now carries the facility host as well as the twelve endpoints. It used to
    // be validated against MEASUREMENT_HOSTS alone, which made it impossible to record the one
    // host a run touches that is not an endpoint, so the runtime host check covered less than
    // the build gate did. src/core/data/reachable-hosts.js records why that changed.
    assert.deepEqual(
      r.measurement.hostsContacted,
      [...new Set([...MEASUREMENT_HOSTS, ...NON_MEASUREMENT_HOSTS])].sort(),
    );
    assert.equal(r.measurement.hostsContacted.length, 13);
    assert.deepEqual(r.hosts.undeclared, []);
    assert.equal(r.hosts.contacted.length, 13, 'twelve endpoints and the one facility endpoint');
    assert.deepEqual(r.hosts.contacted, r.measurement.hostsContacted,
      'the run says the same thing the accounting helper says');
  });

  test('the facility is reported, and the reader is told what a quiet tunnel flag does not prove', async () => {
    const w = world(healthyDuration);
    const r = await measure({ pickedCity: CITY, concurrency: 1, readFacility: true, deps: { now: w.now, probeFor: w.probeFor, fetchTrace: w.fetchTrace } });
    assert.equal(r.reportedColo, 'IAD');
    const ids = r.notices.map((n) => n.id);
    assert.ok(ids.includes('NO_TUNNEL_REPORTED'));
    assert.ok(ids.includes('COLO_WITHOUT_COORDINATE'));
    assert.equal(r.notices.some((n) => n.suppressesResults), false);
  });

  test('every number a reader can add up on screen does add up', async () => {
    const w = world(healthyDuration);
    const r = await measure({ pickedCity: CITY, concurrency: 1, readFacility: true, deps: { now: w.now, probeFor: w.probeFor, fetchTrace: w.fetchTrace } });
    for (const row of r.decomposition.rows) {
      const s = displaySegments(row);
      assert.equal(s.physicsMs + s.accessMs + s.routeMs, s.totalMs, row.endpointId);
      for (const v of [s.physicsMs, s.accessMs, s.routeMs, s.totalMs]) assert.ok(Number.isInteger(v));
    }
  });
});

describe('what a reader gets when it does not work', () => {
  test('nothing is measured before the observer point is settled', async () => {
    // Trap 14 in its strongest form: with no city chosen and no cited facility coordinate, the
    // page has to ask, and it must ask BEFORE it spends the reader network on a run it cannot
    // decompose.
    const w = world(healthyDuration);
    const r = await measure({ concurrency: 1, readFacility: true, deps: { now: w.now, probeFor: w.probeFor, fetchTrace: w.fetchTrace } });

    assert.equal(r.state, 'needs-city-pick');
    assert.equal(r.measurement, null);
    assert.equal(r.decomposition, null);
    assert.equal(w.state.calls, 0, 'a measurement was made before there was anywhere to measure from');
    assert.equal(r.reportedColo, 'IAD', 'and the facility the edge reported is still shown');
  });

  test('a browser that blocks every request says so, and shows no zero anywhere', async () => {
    const w = world(healthyDuration);
    const blocked = () => () => Promise.reject(new TypeError('Failed to fetch'));
    const r = await measure({
      pickedCity: CITY,
      concurrency: 1,
      deps: { now: w.now, probeFor: blocked, fetchTrace: w.fetchTrace },
    });

    assert.equal(r.state, 'nothing-measured');
    assert.deepEqual(r.decomposition.rows, []);
    assert.equal(r.decomposition.unusableCount, MEASURED_ENDPOINTS.length);
    for (const e of r.measurement.endpoints) {
      assert.equal(e.roundTripMs, null);
      assert.equal(e.status, 'blocked');
      assert.ok(e.failureReason.length > 0);
    }
    const nothing = r.notices.find((n) => n.id === 'NOTHING_MEASURED');
    assert.ok(nothing);
    assert.equal(nothing.suppressesResults, true);
    assert.equal(nothing.text, RUN_NOTICES.NOTHING_MEASURED);
  });

  test('a partly working run says which part worked, rather than hiding the rest', async () => {
    const w = world(healthyDuration);
    const halfBlocked = (host) => (hostIndex.get(host) % 2 === 0
      ? w.probeFor(host)
      : () => Promise.reject(new TypeError('Failed to fetch')));
    const r = await measure({
      pickedCity: CITY,
      concurrency: 1,
      deps: { now: w.now, probeFor: halfBlocked, fetchTrace: w.fetchTrace },
    });

    assert.equal(r.state, 'done');
    assert.equal(r.decomposition.rows.length, 6);
    assert.equal(r.decomposition.unusableCount, 6);
    assert.ok(r.notices.some((n) => n.id === 'PARTIAL_RUN'));
    for (const c of r.selfTest) assert.equal(c.passed, true, c.label);
  });

  test('two modules reporting the same fact do not make the page say it twice', async () => {
    const w = world(healthyDuration);
    const r = await measure({
      pickedCity: CITY,
      concurrency: 1,
      deps: { now: w.now, probeFor: w.probeFor, fetchTrace: () => Promise.reject(new TypeError('Failed to fetch')) },
    });
    const ids = r.notices.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, 'a notice was printed twice: ' + ids.join(', '));
  });

  test('a facility endpoint that does not answer still lets a chosen city carry the whole run', async () => {
    const w = world(healthyDuration);
    const r = await measure({
      pickedCity: CITY,
      concurrency: 1,
      readFacility: true,
      deps: { now: w.now, probeFor: w.probeFor, fetchTrace: () => Promise.reject(new TypeError('Failed to fetch')) },
    });

    assert.equal(r.state, 'done');
    assert.equal(r.reportedColo, null);
    assert.ok(r.notices.some((n) => n.id === 'TRACE_UNAVAILABLE'));
    assert.equal(r.measurement.observer.source, 'visitor-picked-city');
    assert.equal(r.measurement.observer.badge, 'INFERRED');
  });

  test('a run that did not ask the facility does not report that the facility failed', async () => {
    // The page takes two presses: the first reads the facility, the second measures from the
    // city the reader chose. Asking again on the second would make one more request than the
    // consent line beside the button promises, and would buy nothing. So it does not ask.
    //
    // A run that did not ask must not print "the serving edge did not answer". That sentence
    // is a statement about the network, and it would be false. This is the whole reason
    // resolveObserver takes traceAttempted rather than inferring failure from a null.
    const w = world(healthyDuration);
    const r = await measure({
      pickedCity: CITY,
      concurrency: 1,
      deps: { now: w.now, probeFor: w.probeFor, fetchTrace: w.fetchTrace },
    });

    assert.equal(r.state, 'done');
    assert.equal(r.notices.some((n) => n.id === 'TRACE_UNAVAILABLE'), false,
      'a run that never asked reported that the answer did not arrive');
    assert.equal(r.measurement.hostsContacted.includes('www.cloudflare.com'), false,
      'hostsContacted claims a host this run never reached');
    assert.equal(r.measurement.hostsContacted.length, MEASUREMENT_HOSTS.length);
    assert.deepEqual(r.hosts.undeclared, []);
  });

  test('the two presses together make exactly the number of requests the page promised', async () => {
    // DESIGN trap 14. The consent sentence is printed before anything is contacted, so it has
    // to be right about the whole visit and not just about one call.
    const w = world(healthyDuration);
    let facilityCalls = 0;
    const fetchTrace = async () => { facilityCalls += 1; return { ok: true, text: async () => TRACE_BODY }; };

    const first = await measure({ concurrency: 1, deps: { now: w.now, probeFor: w.probeFor, fetchTrace } });
    assert.equal(first.state, 'needs-city-pick');
    assert.equal(w.state.calls, 0);

    const second = await measure({ pickedCity: CITY, concurrency: 1, deps: { now: w.now, probeFor: w.probeFor, fetchTrace } });
    assert.equal(second.state, 'done');

    const plan = requestPlan();
    assert.equal(facilityCalls, 1, 'the facility endpoint was asked more than once per visit');
    assert.equal(w.state.calls, plan.endpointRequests);
    assert.equal(facilityCalls + w.state.calls, plan.totalRequests);
    assert.equal(plan.totalRequests, 97);
  });
});

describe('notices', () => {
  test('the same fact reported by two modules is printed once, keeping the first', () => {
    const a = { id: 'X', badge: 'REPORTED', text: 'first', suppressesResults: false };
    const b = { id: 'X', badge: 'REPORTED', text: 'second', suppressesResults: true };
    const c = { id: 'Y', badge: 'MEASURED', text: 'other', suppressesResults: false };
    assert.deepEqual(dedupeNotices([a, b, c]), [a, c]);
  });
});

describe('the consent line', () => {
  test('states the true request count, warm up included, and every destination', () => {
    const plan = requestPlan();
    assert.equal(plan.endpointCount, 12);
    assert.equal(plan.warmUpPerEndpoint, 1);
    assert.equal(plan.perEndpoint, WARM_SAMPLE_COUNT + 1);
    assert.equal(plan.endpointRequests, 96);
    assert.equal(plan.traceRequests, 1);
    assert.equal(plan.totalRequests, 97,
      'the design consent line says seven requests per endpoint. The method also makes a warm up '
      + 'request whose result is discarded, so the truthful figure is eight per endpoint and '
      + 'ninety seven in total. Understating a request count is the same class of error as '
      + 'understating a measurement.');
    assert.equal(plan.hosts.length, 13);
    assert.ok(plan.timeoutMs > 0);
  });
});

describe('the work pool', () => {
  test('never exceeds its limit and returns results in the order the work was given', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = new Array(11).fill(0).map((_, i) => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => { setTimeout(r, (11 - i) % 4); });
      inFlight -= 1;
      return i;
    });
    const out = await pool(tasks, CONCURRENCY);
    assert.deepEqual(out, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(peak <= CONCURRENCY, 'peak was ' + peak);
  });

  test('handles an empty list without spinning up a worker', async () => {
    assert.deepEqual(await pool([], CONCURRENCY), []);
  });
});

describe('the self test is a real test, which means it can fail', () => {
  const observer = { source: 'visitor-picked-city', colo: null, label: 'x', lat: 0, lon: 0, badge: 'INFERRED' };
  const measurement = {
    schema: 1,
    startedAt: '2026-09-21T10:00:00.000Z',
    observer,
    samplesPerEndpoint: WARM_SAMPLE_COUNT,
    endpoints: [],
    hostsContacted: [],
  };

  test('it catches a negative route surplus', () => {
    const decomposition = {
      schema: 1,
      accessMs: 5,
      accessFromEndpointId: 'aws:us-east-1',
      rows: [{
        endpointId: 'aws:us-east-1', distanceKm: 6000, floorMs: 58.8, roundTripMs: 60,
        accessMs: 5, routeMs: -3.8, routeRatio: (60 - 5) / 58.8, ratioSuppressedReason: null,
        verdict: 'AT_FLOOR', msOnTheTable: null, defect: null,
      }],
      defects: [],
      unstableCount: 0,
      unusableCount: 0,
    };
    const checks = engineSelfTest({ measurement: { ...measurement, endpoints: [] }, decomposition });
    const route = checks.find((c) => c.label === 'Route surplus');
    assert.equal(route.passed, false);
  });

  test('it catches a result that beat its own floor', () => {
    const decomposition = {
      schema: 1,
      accessMs: 0,
      accessFromEndpointId: 'aws:us-east-1',
      rows: [{
        endpointId: 'aws:us-east-1', distanceKm: 6000, floorMs: 58.8, roundTripMs: 1,
        accessMs: 0, routeMs: -57.8, routeRatio: 1 / 58.8, ratioSuppressedReason: null,
        verdict: 'AT_FLOOR', msOnTheTable: null, defect: null,
      }],
      defects: [],
      unstableCount: 0,
      unusableCount: 0,
    };
    const checks = engineSelfTest({ measurement, decomposition });
    assert.equal(checks.find((c) => c.label === 'Faster than light screen').passed, false);
  });

  test('it catches a host that was reached but never declared', () => {
    const decomposition = { schema: 1, accessMs: 0, accessFromEndpointId: null, rows: [], defects: [], unstableCount: 0, unusableCount: 0 };
    const checks = engineSelfTest({
      measurement: { ...measurement, hostsContacted: ['analytics.example'] },
      decomposition,
    });
    const hosts = checks.find((c) => c.label === 'Declared destinations');
    assert.equal(hosts.passed, false);
    assert.ok(hosts.detail.includes('analytics.example'));
  });

  test('it catches a ratio that leaked below the distance gate', () => {
    const decomposition = {
      schema: 1,
      accessMs: 0,
      accessFromEndpointId: 'aws:us-east-1',
      rows: [{
        endpointId: 'aws:us-east-1', distanceKm: 80, floorMs: 0.8, roundTripMs: 9,
        accessMs: 0, routeMs: 8.2, routeRatio: 11.25, ratioSuppressedReason: null,
        verdict: 'ON_THE_TABLE', msOnTheTable: 8, defect: null,
      }],
      defects: [],
      unstableCount: 0,
      unusableCount: 0,
    };
    const checks = engineSelfTest({ measurement, decomposition });
    assert.equal(checks.find((c) => c.label === 'Short distance gate').passed, false);
  });

  test('a run with nothing in it reports that, rather than passing quietly', () => {
    const decomposition = { schema: 1, accessMs: 0, accessFromEndpointId: null, rows: [], defects: [], unstableCount: 0, unusableCount: 0 };
    const checks = engineSelfTest({ measurement, decomposition });
    assert.equal(checks.find((c) => c.label === 'Estimator').detail, 'no endpoint produced samples in this run');
    assert.equal(checks.find((c) => c.label === 'Access baseline').detail, 'no usable row, so no baseline was taken');
  });
});

describe('display precision', () => {
  test('rounds to whole milliseconds, because that is what the browser clock supports', () => {
    assert.equal(wholeMs(9.2), 9);
    assert.equal(wholeMs(0.4), 0);
    assert.equal(wholeMs(251.45), 251);
    assert.ok(isDisplayablePrecision(251));
    assert.equal(isDisplayablePrecision(251.4), false);
  });

  test('refuses a value that is not a number rather than rendering something odd', () => {
    assert.throws(() => wholeMs(Number.NaN), /finite/);
    assert.throws(() => wholeMs('9'), /finite/);
  });

  test('the run records which clock it used, so no wall clock reading is passed off as monotonic', () => {
    assert.ok(['performance.now', 'Date.now'].includes(clockSource()));
  });
});
