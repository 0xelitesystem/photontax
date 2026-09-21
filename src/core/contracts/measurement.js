// CONTRACT: the measurement result shape. Owned by the FOUNDATION team, produced by the
// MEASUREMENT team, consumed by the DECOMPOSITION team.
//
// DESIGN 2.1 (MEASURED), DESIGN 4 C2 step 1, DESIGN 5, DESIGN 6.5, traps 4, 5, 9, 13, 14.
//
// The measured quantity is a WARM HTTPS ROUND TRIP. It contains TCP or QUIC transport, TLS
// record processing and server think time. It is not an ICMP measurement and it is not a
// network layer round trip. Every field name in this file says "roundTrip" for that reason.
//
// Two things are deliberately NOT in this shape, and both omissions are load bearing:
//
//   1. THE VISITOR PUBLIC IP IS NOT A FIELD. DESIGN 2.2 allows displaying it, because the far
//      end observed it and is reporting it back. But a field in a serialisable run object is
//      a field that ends up in a fixture, a bug report and a screenshot. If the UI shows the
//      address it reads it straight off the live trace response and drops it. It never enters
//      this shape, so it cannot leak through one.
//   2. THERE ARE NO CONNECTION PHASE FIELDS. No name resolution time, no TLS time, no time to
//      first byte. For a cross origin resource with no Timing-Allow-Origin header the Resource
//      Timing spec zeroes every one of those, and none of the measurement endpoints send that
//      header (verified 2026-09-21). A field that can only ever hold zero is an invitation to
//      publish a zero as if it were a measurement.
//
// Isomorphic: no node:* imports and no DOM.

import { WARM_SAMPLE_COUNT, SAMPLE_SPREAD_UNSTABLE_MS } from '../constants.js';
import { assertCoord } from '../geo.js';
import { MEASUREMENT_HOSTS, endpointById } from '../data/endpoints.js';
import { ALL_REACHABLE_HOSTS } from '../data/reachable-hosts.js';

export const MEASUREMENT_SCHEMA = 1;

/**
 * Where the measurement was taken FROM. DESIGN 2.2 and trap 7.
 *
 * The page never geolocates the visitor and never plots them. There are exactly two honest
 * observer sources and no third:
 *
 *   'cloudflare-colo'      REPORTED. Cloudflare own edge naming the facility that terminated
 *                          this connection, from the colo field of its cdn-cgi/trace endpoint.
 *                          This is a third party stating a fact about its own network.
 *   'visitor-picked-city'  The visitor chose a city from the bundled list, because the trace
 *                          call failed or they declined it. INFERRED, and labelled so.
 *
 * There is no 'ip-geolocation' source and there never will be. IP geolocation returns a
 * national fallback centroid for a large share of addresses.
 *
 * @typedef {Object} Observer
 * @property {'cloudflare-colo'|'visitor-picked-city'} source
 * @property {string|null} colo Three letter facility code, set only for 'cloudflare-colo'.
 * @property {string} label Human readable place name shown next to the coordinate.
 * @property {number} lat
 * @property {number} lon
 * @property {'REPORTED'|'INFERRED'} badge REPORTED for a colo, INFERRED for a picked city.
 */

/**
 * One endpoint result. DESIGN 2.1 and trap 5.
 *
 * @typedef {Object} EndpointMeasurement
 * @property {string} endpointId Key into data/endpoints.js.
 * @property {string} host The host actually contacted. MUST be in MEASUREMENT_HOSTS.
 * @property {number[]} samplesMs The 7 warm samples, full precision, in the order taken. The
 *   warm up response is discarded BEFORE these and never appears here. The raw samples are
 *   kept because DESIGN 5 shows them on request with the minimum highlighted, so the reader
 *   can judge the estimator rather than trust it.
 * @property {number|null} roundTripMs The minimum of samplesMs. null when status is not 'ok'
 *   or 'unstable'. Full precision internally; the UI renders whole milliseconds only (trap 9).
 * @property {number|null} spreadMs max(samplesMs) minus min(samplesMs).
 * @property {'ok'|'unstable'|'failed'|'blocked'} status
 *   'unstable' means spreadMs exceeded SAMPLE_SPREAD_UNSTABLE_MS. DESIGN 6.5: the row then
 *   shows its spread INSTEAD of a single number. It does not print a confident figure it
 *   cannot support.
 *   'blocked' means the request never left, for example a corporate proxy or an extension.
 *   That is a stated state, never a zero and never a spinner (trap 13).
 * @property {string|null} failureReason One short sentence for the reader. null when 'ok'.
 */

/**
 * One complete run. DESIGN 4 C2.
 *
 * @typedef {Object} MeasurementRun
 * @property {1} schema
 * @property {string} startedAt ISO 8601. Displayed so a screenshot dates itself.
 * @property {Observer} observer
 * @property {number} samplesPerEndpoint Always WARM_SAMPLE_COUNT. Present so the shape states
 *   its own method rather than relying on the reader knowing the constant.
 * @property {EndpointMeasurement[]} endpoints
 * @property {string[]} hostsContacted Every host this run actually reached, deduplicated and
 *   sorted. MUST be a subset of ALL_REACHABLE_HOSTS, which MUST equal the CSP connect-src
 *   allowlist. This field exists so the browser self test can assert at runtime what the
 *   build gate asserts statically: nothing was contacted that was not declared.
 *
 *   It is ALL_REACHABLE_HOSTS and not MEASUREMENT_HOSTS, and the difference is the whole point
 *   of the field. A run contacts twelve measurement endpoints AND the Cloudflare host that
 *   names the serving facility. Validating against the twelve made it impossible to record the
 *   thirteenth, so the field could never see the one host a reader is most likely to ask
 *   about, and the runtime check could never cover what the build gate covers. It does now.
 *
 *   It must also be COMPLETE: every host in run.endpoints appears here. Understating it is the
 *   same defect as overstating it, in the direction nobody would notice.
 */

/** @param {unknown} v @param {string} at @returns {number} */
function num(v, at) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(at + ': expected a finite number, got ' + String(v));
  }
  return v;
}

/**
 * Validate an Observer. Throws with the field name on failure.
 * @param {unknown} o
 * @returns {Observer}
 */
export function assertObserver(o) {
  if (o === null || typeof o !== 'object') throw new TypeError('observer: expected an object');
  const ob = /** @type {Observer} */ (o);
  if (ob.source !== 'cloudflare-colo' && ob.source !== 'visitor-picked-city') {
    throw new TypeError('observer.source: must be "cloudflare-colo" or "visitor-picked-city". '
      + 'There is no IP geolocation source in this product (DESIGN trap 7).');
  }
  const expectedBadge = ob.source === 'cloudflare-colo' ? 'REPORTED' : 'INFERRED';
  if (ob.badge !== expectedBadge) {
    throw new TypeError('observer.badge: a ' + ob.source + ' observer is ' + expectedBadge
      + ', got ' + String(ob.badge));
  }
  if (ob.source === 'cloudflare-colo' && (typeof ob.colo !== 'string' || ob.colo.length === 0)) {
    throw new TypeError('observer.colo: a cloudflare-colo observer must carry the reported colo code');
  }
  if (ob.source === 'visitor-picked-city' && ob.colo !== null) {
    throw new TypeError('observer.colo: a visitor-picked-city observer must have colo null');
  }
  if (typeof ob.label !== 'string' || ob.label.length === 0) {
    throw new TypeError('observer.label: required, and shown next to the coordinate');
  }
  assertCoord({ lat: ob.lat, lon: ob.lon }, 'observer');
  return ob;
}

/**
 * Validate one endpoint measurement.
 * @param {unknown} m
 * @param {number} i Index, for the error message.
 * @returns {EndpointMeasurement}
 */
export function assertEndpointMeasurement(m, i = 0) {
  const at = 'endpoints[' + i + ']';
  if (m === null || typeof m !== 'object') throw new TypeError(at + ': expected an object');
  const e = /** @type {EndpointMeasurement} */ (m);

  const row = endpointById(e.endpointId);
  if (!row) throw new TypeError(at + '.endpointId: unknown endpoint ' + JSON.stringify(e.endpointId));
  if (!row.measured) throw new TypeError(at + '.endpointId: ' + e.endpointId + ' is a coordinate '
    + 'only row and is never measured. Measuring it would contact a host that is not in the CSP.');

  if (!MEASUREMENT_HOSTS.includes(e.host)) {
    throw new TypeError(at + '.host: ' + JSON.stringify(e.host) + ' is not in MEASUREMENT_HOSTS. '
      + 'Every host contacted must be declared in the Content-Security-Policy connect-src '
      + 'allowlist, and the declared set must equal the used set.');
  }
  if (e.host !== row.measurementHost) {
    throw new TypeError(at + '.host: does not match the host recorded for ' + e.endpointId);
  }

  const valid = e.status === 'ok' || e.status === 'unstable' || e.status === 'failed' || e.status === 'blocked';
  if (!valid) throw new TypeError(at + '.status: must be ok, unstable, failed or blocked');

  if (e.status === 'failed' || e.status === 'blocked') {
    if (e.roundTripMs !== null) throw new TypeError(at + '.roundTripMs: must be null when status is ' + e.status
      + '. A failed measurement is a stated state, never a zero (DESIGN trap 13).');
    if (typeof e.failureReason !== 'string' || e.failureReason.length === 0) {
      throw new TypeError(at + '.failureReason: required when status is ' + e.status
        + '. The reader is told what happened rather than shown a spinner.');
    }
    return e;
  }

  if (!Array.isArray(e.samplesMs) || e.samplesMs.length !== WARM_SAMPLE_COUNT) {
    throw new TypeError(at + '.samplesMs: expected exactly ' + WARM_SAMPLE_COUNT + ' warm samples, got '
      + (Array.isArray(e.samplesMs) ? e.samplesMs.length : typeof e.samplesMs)
      + '. The warm up response is discarded and never counted.');
  }
  e.samplesMs.forEach((s, k) => {
    num(s, at + '.samplesMs[' + k + ']');
    if (s < 0) throw new RangeError(at + '.samplesMs[' + k + ']: a round trip cannot be negative');
  });

  const min = Math.min(...e.samplesMs);
  const spread = Math.max(...e.samplesMs) - min;
  if (num(e.roundTripMs, at + '.roundTripMs') !== min) {
    throw new RangeError(at + '.roundTripMs: must be the MINIMUM of samplesMs (' + min + '), got '
      + e.roundTripMs + '. The minimum of N is the estimator that removes server think time '
      + 'and scheduling noise (DESIGN trap 5). A mean would keep them.');
  }
  if (Math.abs(num(e.spreadMs, at + '.spreadMs') - spread) > 1e-9) {
    throw new RangeError(at + '.spreadMs: must be max minus min of samplesMs (' + spread + ')');
  }

  const shouldBeUnstable = spread > SAMPLE_SPREAD_UNSTABLE_MS;
  if (shouldBeUnstable && e.status !== 'unstable') {
    throw new RangeError(at + '.status: spread is ' + spread.toFixed(1) + ' ms, above the '
      + SAMPLE_SPREAD_UNSTABLE_MS + ' ms limit, so this row is unstable and must show its spread '
      + 'instead of a single number (DESIGN 6.5).');
  }
  if (!shouldBeUnstable && e.status !== 'ok') {
    throw new RangeError(at + '.status: spread is within the limit, so status must be ok');
  }
  return e;
}

/**
 * Validate a whole run. Call this at the boundary between the measurement team code and the
 * decomposition team code, so a malformed run fails where it was produced.
 * @param {unknown} r
 * @returns {MeasurementRun}
 */
export function assertMeasurementRun(r) {
  if (r === null || typeof r !== 'object') throw new TypeError('run: expected an object');
  const run = /** @type {MeasurementRun} */ (r);
  if (run.schema !== MEASUREMENT_SCHEMA) {
    throw new TypeError('run.schema: expected ' + MEASUREMENT_SCHEMA + ', got ' + String(run.schema));
  }
  if (typeof run.startedAt !== 'string' || Number.isNaN(Date.parse(run.startedAt))) {
    throw new TypeError('run.startedAt: expected an ISO 8601 timestamp');
  }
  assertObserver(run.observer);
  if (run.samplesPerEndpoint !== WARM_SAMPLE_COUNT) {
    throw new TypeError('run.samplesPerEndpoint: must be ' + WARM_SAMPLE_COUNT);
  }
  if (!Array.isArray(run.endpoints) || run.endpoints.length === 0) {
    throw new TypeError('run.endpoints: expected a non empty array');
  }
  run.endpoints.forEach((e, i) => assertEndpointMeasurement(e, i));

  const seen = new Set(run.endpoints.map((e) => e.endpointId));
  if (seen.size !== run.endpoints.length) throw new TypeError('run.endpoints: duplicate endpointId');

  if (!Array.isArray(run.hostsContacted)) throw new TypeError('run.hostsContacted: expected an array');
  const undeclared = run.hostsContacted.filter((h) => !ALL_REACHABLE_HOSTS.includes(h));
  if (undeclared.length) {
    throw new TypeError('run.hostsContacted: contacted a host that is not declared: '
      + undeclared.join(', ') + '. Every network destination must appear in the '
      + 'Content-Security-Policy connect-src allowlist, and the used set must equal the '
      + 'declared set. Never reach a host the gate cannot see.');
  }
  const missing = [...new Set(run.endpoints.map((e) => e.host))]
    .filter((h) => !run.hostsContacted.includes(h));
  if (missing.length) {
    throw new TypeError('run.hostsContacted: understates the run. These hosts were reached for '
      + 'an endpoint but are not listed: ' + missing.join(', ') + '. Build the field with '
      + 'hostsContactedFrom() rather than by hand.');
  }
  return run;
}

/**
 * Build the hostsContacted field, so a caller cannot forget it or understate it.
 *
 * `extra` is for hosts a run reached that are not a measurement endpoint: in V1 that is the
 * Cloudflare host the observer point is read from, and only when it was actually called. A run
 * that never asked for the facility must not claim it did.
 *
 * @param {EndpointMeasurement[]} endpoints
 * @param {readonly string[]} [extra]
 * @returns {string[]}
 */
export function hostsContactedFrom(endpoints, extra = []) {
  return [...new Set([...endpoints.map((e) => e.host), ...extra])].sort();
}
