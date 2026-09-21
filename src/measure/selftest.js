// THE SELF TEST, engine half. DESIGN 7.3.
//
// The control is always visible and never behind a menu, and it runs in the browser on the
// numbers that are actually on screen. The point is not that the team ran tests once. The point
// is that the reader can make the product check itself, in front of them, on their own run.
//
// This module owns the checks that are about measurement and decomposition. The palette check,
// the badge completeness check and the geometry fixtures belong to the teams that own those
// files, and the page concatenates all of them into one list.
//
// Every check returns the shape the view model expects: { label, passed, detail }. A check that
// cannot run because there is nothing to check reports that, rather than passing quietly. A
// green line that means "no data" is worse than a red one.
//
// Isomorphic: no node:* imports and no DOM.

import { WARM_SAMPLE_COUNT, SAMPLE_SPREAD_UNSTABLE_MS, RATIO_MIN_DISTANCE_KM } from '../core/constants.js';
import { displaySegments, IDENTITY_EPSILON_MS } from '../core/contracts/decomposition.js';
import { isDisplayablePrecision, wholeMs } from './clock.js';
import { ALL_REACHABLE_HOSTS, NON_MEASUREMENT_HOSTS } from './transport.js';

/**
 * @typedef {Object} SelfTestCheck
 * @property {string} label
 * @property {boolean} passed
 * @property {string} detail
 */

/** @param {string} label @param {boolean} passed @param {string} detail @returns {SelfTestCheck} */
const check = (label, passed, detail) => ({ label, passed, detail });

/**
 * Run the engine checks against one measurement run and its decomposition.
 *
 * @param {Object} input
 * @param {import('../core/contracts/measurement.js').MeasurementRun} input.measurement
 * @param {import('../core/contracts/decomposition.js').DecompositionRun} input.decomposition
 * @param {boolean} [input.traceWasCalled]
 * @returns {SelfTestCheck[]}
 */
export function engineSelfTest(input) {
  const m = input.measurement;
  const d = input.decomposition;
  /** @type {SelfTestCheck[]} */
  const out = [];

  /* 1. The estimator. The minimum of N, not a mean, and the warm up excluded. */
  {
    const timed = m.endpoints.filter((e) => e.status === 'ok' || e.status === 'unstable');
    const wrongCount = timed.filter((e) => e.samplesMs.length !== WARM_SAMPLE_COUNT);
    const notMinimum = timed.filter((e) => e.roundTripMs !== Math.min(...e.samplesMs));
    out.push(check(
      'Estimator',
      wrongCount.length === 0 && notMinimum.length === 0,
      timed.length === 0
        ? 'no endpoint produced samples in this run'
        : 'every timed endpoint reports the minimum of its warm samples, warm up excluded',
    ));
  }

  /* 2. Sample stability. Spread over the limit is reported as a spread, never as a number. */
  {
    const misreported = m.endpoints.filter((e) => (
      (e.status === 'ok' && /** @type {number} */ (e.spreadMs) > SAMPLE_SPREAD_UNSTABLE_MS)
      || (e.status === 'unstable' && /** @type {number} */ (e.spreadMs) <= SAMPLE_SPREAD_UNSTABLE_MS)
    ));
    out.push(check(
      'Sample stability',
      misreported.length === 0,
      'a spread wider than the limit is shown as a spread instead of a single number',
    ));
  }

  /* 3. Declared destinations. What the build gate asserts statically, asserted again at run time. */
  {
    const contacted = [...new Set([
      ...m.hostsContacted,
      ...(input.traceWasCalled ? NON_MEASUREMENT_HOSTS : []),
    ])];
    const undeclared = contacted.filter((h) => !ALL_REACHABLE_HOSTS.includes(h));
    out.push(check(
      'Declared destinations',
      undeclared.length === 0,
      undeclared.length === 0
        ? 'every host this run reached is in the declared allowlist'
        : 'reached a host that is not declared: ' + undeclared.join(', '),
    ));
  }

  /* 4. The faster than light screen. DESIGN 7.3 calls this the one that matters most. */
  {
    const survived = d.rows.filter((r) => r.roundTripMs < r.floorMs);
    out.push(check(
      'Faster than light screen',
      survived.length === 0,
      d.defects.length === 0
        ? 'no result beat its own floor'
        : 'results dropped as defects rather than reported: ' + d.defects.map((r) => r.endpointId).join(', '),
    ));
  }

  /* 5. The decomposition identity, at full precision. */
  {
    const broken = d.rows.filter((r) => Math.abs((r.floorMs + r.accessMs + r.routeMs) - r.roundTripMs) > IDENTITY_EPSILON_MS);
    out.push(check(
      'Decomposition identity',
      broken.length === 0,
      'physics plus access plus route equals the measured round trip on every row',
    ));
  }

  /* 6. The identity again, on the integers a reader can add up on screen. */
  {
    const broken = d.rows.filter((r) => {
      const s = displaySegments(r);
      return s.physicsMs + s.accessMs + s.routeMs !== s.totalMs;
    });
    out.push(check(
      'Identity at display precision',
      broken.length === 0,
      'the three numbers printed on each bar add up to the total printed beside it',
    ));
  }

  /* 7. Access is non negative and really is the minimum surplus, not a mean. */
  {
    const surpluses = d.rows.map((r) => r.roundTripMs - r.floorMs);
    const isMinimum = surpluses.length === 0 || Math.abs(Math.min(...surpluses) - d.accessMs) <= IDENTITY_EPSILON_MS;
    out.push(check(
      'Access baseline',
      d.accessMs >= 0 && isMinimum,
      surpluses.length === 0
        ? 'no usable row, so no baseline was taken'
        : 'the baseline is the smallest surplus over every usable endpoint, and it is not negative',
    ));
  }

  /* 8. Route is never negative, and is exactly zero on the endpoint that set the baseline. */
  {
    const negative = d.rows.filter((r) => r.routeMs < 0);
    const setter = d.rows.find((r) => r.endpointId === d.accessFromEndpointId);
    const setterZero = !setter || Math.abs(setter.routeMs) <= IDENTITY_EPSILON_MS;
    out.push(check(
      'Route surplus',
      negative.length === 0 && setterZero,
      'no row carries a negative route surplus, and the row that set the baseline carries none at all',
    ));
  }

  /* 9. The distance gate. Trap 2. */
  {
    const leaked = d.rows.filter((r) => r.distanceKm < RATIO_MIN_DISTANCE_KM && (r.routeRatio !== null || r.verdict !== null));
    out.push(check(
      'Short distance gate',
      leaked.length === 0,
      'no ratio and no verdict is produced for a distance the ratio would be an artifact at',
    ));
  }

  /* 10. Display precision. Nothing sub millisecond escapes. Trap 9. */
  {
    const values = [];
    for (const r of d.rows) {
      const s = displaySegments(r);
      values.push(s.physicsMs, s.accessMs, s.routeMs, s.totalMs, wholeMs(r.floorMs), wholeMs(r.roundTripMs));
    }
    const bad = values.filter((v) => !isDisplayablePrecision(v));
    out.push(check(
      'Display precision',
      bad.length === 0,
      'every millisecond figure on screen is a whole millisecond, which is the most the browser clock supports',
    ));
  }

  return out;
}
