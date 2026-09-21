// THE RUN. DESIGN 5, DESIGN 6.5, traps 13 and 14.
//
// Twelve endpoints, one warm up and seven warm samples each, four endpoints in flight at once.
// The concurrency cap is four because the samples for a single endpoint must be sequential, so
// the only parallelism available is across endpoints, and a browser will not open an unbounded
// number of connections anyway. Four keeps the whole run inside the few seconds DESIGN 5
// budgets for it without turning the visitor connection into the bottleneck being measured.
//
// TRAP 14, ZERO NETWORK ACTIVITY ON PAGE LOAD. Nothing in this module runs until it is called,
// nothing in this module is called at import time, and requestPlan() below exists so the page
// can print the exact request count and the exact destination list BEFORE the reader clicks.
// A consent line that says "some requests to some servers" is not consent.
//
// Isomorphic: no node:* imports and no DOM. Every dependency is injected and defaulted.

import {
  WARM_SAMPLE_COUNT, WARM_UP_REQUEST_COUNT, NON_MEASUREMENT_REQUEST_COUNT, REQUESTS_PER_ENDPOINT,
} from '../core/constants.js';
import { MEASURED_ENDPOINTS } from '../core/data/endpoints.js';
import { assertMeasurementRun, hostsContactedFrom, MEASUREMENT_SCHEMA } from '../core/contracts/measurement.js';
import { measureEndpoint } from './roundtrip.js';
import { ALL_REACHABLE_HOSTS, NON_MEASUREMENT_HOSTS, REQUEST_TIMEOUT_MS } from './transport.js';
import { clockSource } from './clock.js';
import { RUN_NOTICES } from './reasons.js';

/** How many endpoints are measured at the same time. DESIGN 5. */
export const CONCURRENCY = 4;

/**
 * Exactly what a run will do, computed from the shipped dataset so the consent line cannot
 * drift from the behaviour.
 *
 * NOTE ON THE COUNT. DESIGN 5 writes the consent line as "7 small HTTPS requests to each of 12
 * public cloud endpoints". The method also makes one warm up request per endpoint whose result
 * is discarded, so the truthful number per endpoint is eight, not seven, and the truthful total
 * including the one facility request is ninety seven. The larger number is the one this
 * function returns and the one the page must print. Understating a request count in a consent
 * line would be the same class of error as understating a measurement.
 *
 * @param {readonly {id: string, measurementHost: string|null, measured: boolean}[]} [endpoints]
 * @returns {{perEndpoint: number, warmUpPerEndpoint: number, endpointCount: number,
 *            endpointRequests: number, traceRequests: number, totalRequests: number,
 *            hosts: string[], timeoutMs: number}}
 */
export function requestPlan(endpoints = MEASURED_ENDPOINTS) {
  const endpointCount = endpoints.length;
  const warmUpPerEndpoint = WARM_UP_REQUEST_COUNT;
  const perEndpoint = REQUESTS_PER_ENDPOINT;
  const endpointRequests = endpointCount * perEndpoint;
  const traceRequests = NON_MEASUREMENT_REQUEST_COUNT;
  return {
    perEndpoint,
    warmUpPerEndpoint,
    endpointCount,
    endpointRequests,
    traceRequests,
    totalRequests: endpointRequests + traceRequests,
    hosts: [...ALL_REACHABLE_HOSTS],
    timeoutMs: REQUEST_TIMEOUT_MS,
  };
}

/**
 * Run tasks with a fixed number in flight. Results come back in the order the tasks were given,
 * not the order they finished, so a run is reproducible in shape even though it is not in time.
 *
 * @template T
 * @param {(() => Promise<T>)[]} tasks
 * @param {number} limit
 * @returns {Promise<T[]>}
 */
export async function pool(tasks, limit) {
  /** @type {T[]} */
  const out = new Array(tasks.length);
  let next = 0;
  const workers = new Array(Math.max(1, Math.min(limit, tasks.length))).fill(0).map(async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= tasks.length) return;
      out[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Measure every endpoint and return a run that satisfies the measurement contract.
 *
 * The run is validated here, at the boundary, so a malformed run fails where it was produced
 * rather than three modules downstream.
 *
 * @param {Object} input
 * @param {import('../core/contracts/measurement.js').Observer} input.observer
 * @param {readonly {id: string, measurementHost: string|null, measured: boolean}[]} [input.endpoints]
 * @param {number} [input.concurrency]
 * @param {Object} [input.deps]
 * @param {(e: any, d: any) => Promise<import('../core/contracts/measurement.js').EndpointMeasurement>} [input.deps.measureEndpoint]
 * @param {() => number} [input.deps.now]
 * @param {() => string} [input.deps.startedAt]
 * @param {number} [input.deps.timeoutMs]
 * @param {AbortSignal} [input.deps.signal]
 * @param {boolean} [input.traceWasCalled] True when the facility endpoint was asked for the
 *   serving colo before this run. It is not an endpoint measurement, but it IS a host the run
 *   reached, and hostsContacted has to say so or the runtime host check covers less than the
 *   build gate does. Defaults to false: a run that never asked must not claim it did.
 * @param {(host: string) => ((init: RequestInit) => Promise<Response>)|undefined} [input.deps.probeFor]
 * @returns {Promise<{run: import('../core/contracts/measurement.js').MeasurementRun,
 *                   notices: import('./trace.js').RunNotice[], clock: string}>}
 */
export async function runMeasurement(input) {
  const endpoints = input.endpoints || MEASURED_ENDPOINTS;
  const extraHosts = input.traceWasCalled === true ? NON_MEASUREMENT_HOSTS : [];
  const deps = input.deps || {};
  const measure = deps.measureEndpoint || measureEndpoint;
  const startedAt = (deps.startedAt || (() => new Date().toISOString()))();

  const tasks = endpoints.map((e) => () => measure(e, {
    now: deps.now,
    timeoutMs: deps.timeoutMs,
    signal: deps.signal,
    probeFor: deps.probeFor,
  }));
  const results = await pool(tasks, input.concurrency === undefined ? CONCURRENCY : input.concurrency);

  // hostsContacted records what was actually reached. An endpoint whose request never produced
  // a response still reached for the host, and saying otherwise would understate the network
  // activity in exactly the field that exists to let the self test check it.
  const run = {
    schema: MEASUREMENT_SCHEMA,
    startedAt,
    observer: input.observer,
    samplesPerEndpoint: WARM_SAMPLE_COUNT,
    endpoints: results,
    hostsContacted: hostsContactedFrom(results, extraHosts),
  };
  assertMeasurementRun(run);

  /** @type {import('./trace.js').RunNotice[]} */
  const notices = [];
  const usable = results.filter((r) => r.status === 'ok');
  const unusable = results.filter((r) => r.status === 'failed' || r.status === 'blocked');
  if (usable.length === 0) {
    notices.push({ id: 'NOTHING_MEASURED', badge: 'MEASURED', text: RUN_NOTICES.NOTHING_MEASURED, suppressesResults: true });
  } else if (unusable.length > 0 || usable.length < results.length) {
    notices.push({ id: 'PARTIAL_RUN', badge: 'MEASURED', text: RUN_NOTICES.PARTIAL_RUN, suppressesResults: false });
  }

  return { run, notices, clock: clockSource() };
}

/**
 * The whole host picture for a run: every host this product can reach, and which of them this
 * run actually touched.
 *
 * hostsContacted now carries the facility host itself, because the measurement contract was
 * widened to accept it (see src/core/data/reachable-hosts.js for why it could not before).
 * The traceWasCalled argument is kept so a caller that built its run without passing the flag
 * through still gets a correct answer, and the union makes the helper idempotent.
 *
 * @param {import('../core/contracts/measurement.js').MeasurementRun} run
 * @param {boolean} traceWasCalled
 * @returns {{contacted: string[], declared: string[], undeclared: string[]}}
 */
export function hostAccounting(run, traceWasCalled) {
  const contacted = [...new Set([
    ...run.hostsContacted,
    ...(traceWasCalled ? NON_MEASUREMENT_HOSTS : []),
  ])].sort();
  return {
    contacted,
    declared: [...ALL_REACHABLE_HOSTS],
    undeclared: contacted.filter((h) => !ALL_REACHABLE_HOSTS.includes(h)),
  };
}
