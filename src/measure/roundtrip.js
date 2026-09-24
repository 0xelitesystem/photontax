// THE WARM HTTPS ROUND TRIP. DESIGN 2.1, DESIGN 4 C2 step 1, traps 4, 5, 9, 13.
//
// THE METHOD, exactly, because the method is the claim:
//
//   1. Open the connection by making one full request and DISCARDING its result. That first
//      response pays for the DNS lookup, the TCP or QUIC handshake and the TLS handshake. A
//      product that counted it would be reporting connection setup as though it were distance.
//   2. Take WARM_SAMPLE_COUNT further requests, one after another, on the connection the
//      browser is now keeping alive. Each is bracketed by a monotonic clock reading taken
//      immediately before fetch() and immediately after the response body has been read to
//      completion, so the sample covers a whole request and a whole response.
//   3. Report the MINIMUM. The minimum of N is the standard estimator against additive
//      contamination, and every source of error here is additive: server think time, the
//      scheduler on the visitor machine, the radio scheduler on a mobile connection, a browser
//      rendering the page between samples. None of those can make a round trip shorter than it
//      really is, so the smallest sample is the one closest to the truth. A mean keeps all of
//      it. The raw samples are kept on the row so a reader can judge the estimator rather than
//      trust it (DESIGN 5, the second beat).
//
// WHAT THE NUMBER CONTAINS, stated because understating it would be an error in the flattering
// direction: transport, TLS record processing, and however long the server took to answer. It
// is not an ICMP measurement and it is not a network layer round trip. None of the twelve
// endpoints sends Timing-Allow-Origin, so the Resource Timing spec zeroes every connection
// phase field for them and no part of this number can honestly be split out of it.
//
// WHAT HAPPENS WHEN IT DOES NOT WORK. Every failure path ends at a stated status with a fixed
// sentence from reasons.js and a null number. There is no zero, no spinner and no guess.
//
// Isomorphic: no node:* imports and no DOM. The transport is injected, so no test opens a socket.

import { WARM_SAMPLE_COUNT, SAMPLE_SPREAD_UNSTABLE_MS } from '../core/constants.js';
import { now as defaultNow } from './clock.js';
import { PROBE_INIT, REQUEST_TIMEOUT_MS, deadline, probeFor } from './transport.js';
import { FAILURE_REASONS } from './reasons.js';

/**
 * @typedef {Object} SampleOutcome
 * @property {'ok'|'blocked'|'failed'} kind
 * @property {number} ms Valid only when kind is 'ok'.
 * @property {string|null} reason Fixed sentence from FAILURE_REASONS when not 'ok'.
 */

/**
 * Turn a thrown value into one of the two honest statuses.
 *
 * A browser hands a page ONE opaque error for several different causes: an extension stopped
 * the request, an enterprise policy stopped it, the CSP stopped it, the response was refused
 * for cross origin reasons, the name did not resolve, the host was unreachable. The Fetch spec
 * makes that deliberate, so that a page cannot use failure timing as a port scanner. The
 * product therefore cannot name one cause, and it says so in one fixed sentence rather than
 * picking the cause that flatters the story.
 *
 * The one thing that IS distinguishable is our own abort, because we are the ones who fired it.
 *
 * @param {unknown} err
 * @param {boolean} deadlineFired True when our own timer aborted the request.
 * @param {boolean} runCancelled True when the caller cancelled the whole run.
 * @returns {{status: 'failed'|'blocked', reason: string}}
 */
export function classifyFailure(err, deadlineFired, runCancelled) {
  if (runCancelled) return { status: 'failed', reason: FAILURE_REASONS.CANCELLED };
  if (deadlineFired) return { status: 'failed', reason: FAILURE_REASONS.TIMED_OUT };
  const name = err !== null && typeof err === 'object' && 'name' in err ? String(/** @type {any} */ (err).name) : '';
  if (name === 'AbortError') return { status: 'failed', reason: FAILURE_REASONS.CANCELLED };
  return { status: 'blocked', reason: FAILURE_REASONS.REQUEST_REFUSED };
}

/**
 * Whether the host reports itself offline. Treated as a fact the browser states about itself,
 * not as a diagnosis: navigator.onLine false is reliable, navigator.onLine true means nothing.
 * @returns {boolean}
 */
export function browserReportsOffline() {
  return typeof navigator === 'object' && navigator !== null && navigator.onLine === false;
}

/**
 * One request and response, timed end to end.
 *
 * The clock is read immediately before fetch() and immediately after the body has been read to
 * completion. Reading the body matters: fetch resolves when the response HEAD is available, so
 * stopping the clock there would report part of a round trip as all of it. The body is 42 fixed
 * bytes, so reading it costs one more read on a buffer that has already arrived.
 *
 * @param {(init: RequestInit) => Promise<Response>} probe
 * @param {{now: () => number, timeoutMs: number, signal?: AbortSignal, classify?: typeof classifyFailure}} ctx
 *   `classify` defaults to classifyFailure, the browser's one opaque sentence.
 * @returns {Promise<SampleOutcome>}
 */
export async function takeSample(probe, ctx) {
  const classify = ctx.classify || classifyFailure;
  const gate = deadline(ctx.timeoutMs, ctx.signal);
  const cancelled = () => Boolean(ctx.signal && ctx.signal.aborted);
  try {
    const t0 = ctx.now();
    const res = await probe({ ...PROBE_INIT, signal: gate.signal });
    try {
      await res.arrayBuffer();
    } catch (bodyErr) {
      if (gate.timedOut() || cancelled()) {
        const c = classify(bodyErr, gate.timedOut(), cancelled());
        return { kind: c.status === 'blocked' ? 'blocked' : 'failed', ms: 0, reason: c.reason };
      }
      return { kind: 'failed', ms: 0, reason: FAILURE_REASONS.BODY_UNREADABLE };
    }
    const t1 = ctx.now();
    const ms = t1 - t0;
    // A monotonic clock cannot run backwards, and a fallback wall clock can. A negative or non
    // finite sample is refused rather than clamped to zero, because a zero here would travel
    // all the way to the screen as a measured number.
    if (!Number.isFinite(ms) || ms < 0) {
      return { kind: 'failed', ms: 0, reason: FAILURE_REASONS.BODY_UNREADABLE };
    }
    return { kind: 'ok', ms, reason: null };
  } catch (err) {
    const c = classify(err, gate.timedOut(), cancelled());
    return { kind: c.status === 'blocked' ? 'blocked' : 'failed', ms: 0, reason: c.reason };
  } finally {
    gate.cancel();
  }
}

/**
 * Measure one endpoint and return a row that satisfies the measurement contract.
 *
 * @param {{id: string, measurementHost: string|null, measured: boolean}} endpoint A row from
 *   data/endpoints.js. A coordinate only row is refused rather than measured, because measuring
 *   it would contact a host that is not in the CSP.
 * @param {Object} [deps]
 * @param {(host: string) => ((init: RequestInit) => Promise<Response>)|undefined} [deps.probeFor]
 * @param {() => number} [deps.now]
 * @param {number} [deps.timeoutMs]
 * @param {AbortSignal} [deps.signal]
 * @param {typeof classifyFailure} [deps.classifyFailure] Replaces classifyFailure, same
 *   signature and same two statuses. A browser hides the cause of a network error, so the
 *   default states them all in one sentence. A caller whose platform does expose the cause
 *   injects a classifier that names it, and then its sentence is also the one a failed warm
 *   sample carries. Omitted, or given classifyFailure itself, the behaviour is exactly the
 *   page's. The engine reaches it through runMeasurement's deps.measureEndpoint.
 * @returns {Promise<import('../core/contracts/measurement.js').EndpointMeasurement>}
 */
export async function measureEndpoint(endpoint, deps = {}) {
  const host = endpoint.measurementHost;
  const ctx = {
    now: deps.now || defaultNow,
    timeoutMs: deps.timeoutMs === undefined ? REQUEST_TIMEOUT_MS : deps.timeoutMs,
    signal: deps.signal,
    classify: deps.classifyFailure || classifyFailure,
  };

  if (!endpoint.measured || typeof host !== 'string' || host.length === 0) {
    throw new TypeError('measureEndpoint: ' + endpoint.id + ' is a coordinate only row and is '
      + 'never measured. A floor needs a coordinate, not a socket.');
  }

  /** @param {'failed'|'blocked'} status @param {string} reason */
  const stated = (status, reason) => ({
    endpointId: endpoint.id,
    host,
    samplesMs: [],
    roundTripMs: null,
    spreadMs: null,
    status,
    failureReason: reason,
  });

  if (browserReportsOffline()) return stated('failed', FAILURE_REASONS.OFFLINE);

  const lookup = deps.probeFor || probeFor;
  const probe = lookup(host);
  if (!probe) {
    // Unreachable through the shipped dataset. It exists because the alternative to throwing
    // here is building a URL from a string, which is the one thing the transport module exists
    // to prevent.
    throw new TypeError('measureEndpoint: no declared probe for ' + host + '. Every destination '
      + 'is a literal in transport.js and is declared in the page Content-Security-Policy.');
  }

  // 1. The warm up. Its result is discarded and never appears in samplesMs.
  const warmUp = await takeSample(probe, ctx);
  if (warmUp.kind !== 'ok') {
    return stated(warmUp.kind === 'blocked' ? 'blocked' : 'failed', /** @type {string} */ (warmUp.reason));
  }

  // 2. The warm samples, one after another on the connection that is now kept alive. They are
  //    sequential on purpose: firing them in parallel would open several connections to the
  //    same host, and the extra ones would each pay for their own handshake, which is exactly
  //    the cost step 1 exists to remove.
  /** @type {number[]} */
  const samplesMs = [];
  for (let i = 0; i < WARM_SAMPLE_COUNT; i += 1) {
    const s = await takeSample(probe, ctx);
    if (s.kind !== 'ok') {
      const reason = ctx.classify !== classifyFailure
        ? /** @type {string} */ (s.reason)
        : ctx.signal && ctx.signal.aborted
          ? FAILURE_REASONS.CANCELLED
          : FAILURE_REASONS.INCOMPLETE_SAMPLES;
      return stated(s.kind === 'blocked' ? 'blocked' : 'failed', reason);
    }
    samplesMs.push(s.ms);
  }

  const roundTripMs = Math.min(...samplesMs);
  const spreadMs = Math.max(...samplesMs) - roundTripMs;
  const status = spreadMs > SAMPLE_SPREAD_UNSTABLE_MS ? 'unstable' : 'ok';

  return {
    endpointId: endpoint.id,
    host,
    samplesMs,
    roundTripMs,
    spreadMs,
    status,
    failureReason: null,
  };
}
