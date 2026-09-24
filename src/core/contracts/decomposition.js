// CONTRACT: the decomposition result shape. Owned by the FOUNDATION team, produced by the
// DECOMPOSITION team, consumed by the UI and GLOBE teams.
//
// DESIGN 4 C2 (THE HEADLINE), DESIGN 4 C3 (the verdict), DESIGN 7.3, traps 2, 3, 9, 17.
//
// The three way split is the product. DESIGN A3 records that no research lens proposed it and
// that the raw ratio every lens did propose is absurd on a short row: 22.04x for the row 55.6 km
// away in the test suite's equatorial case, which is an artifact of a fixed access cost sitting
// on a near zero floor rather than a result.
//
//     1.  floorMs(E)   = 2 * greatCircleKm(observer, E) / 204190.47677 * 1000      COMPUTED
//     2.  accessMs     = min over all E of ( roundTripMs(E) - floorMs(E) )         MEASURED
//     3.  routeMs(E)   = roundTripMs(E) - floorMs(E) - accessMs                    MEASURED
//     4.  routeRatio(E)= ( roundTripMs(E) - accessMs ) / floorMs(E)                COMPUTED
//
// Step 2 is the one nobody else does and it is what makes the tool correct. The nearest
// endpoint has a floor near zero, so its whole surplus is fixed access cost that the visitor
// carries to every destination. Subtracting it is the difference between a meaningful ratio
// and a meaningless one, and it returns exactly 1.00x for the nearest endpoint by construction,
// which is also the self consistency check.
//
// Isomorphic: no node:* imports and no DOM.

import { RATIO_MIN_DISTANCE_KM, VERDICT_AT_FLOOR_MAX, VERDICT_NORMAL_MAX } from '../constants.js';

export const DECOMPOSITION_SCHEMA = 1;

/**
 * Floating point note, stated here rather than left for someone to discover.
 *
 * routeMs is computed as roundTripMs - floorMs - accessMs, so reassociating the sum back as
 * floorMs + accessMs + routeMs can differ from roundTripMs in the last bits of a double. That
 * is IEEE 754 representation, not a modelling gap. The identity is asserted within this
 * tolerance, and separately the DISPLAY integers are forced to sum exactly (displaySegments
 * below), because a reader who adds up three numbers on screen and gets a different total than
 * the one printed beside them has correctly concluded the tool is broken.
 */
export const IDENTITY_EPSILON_MS = 1e-9;

/**
 * The three verdicts. DESIGN 4 C3. There is no fourth, and a row that cannot be given one of
 * these gets null rather than a softened sentence.
 * @typedef {'AT_FLOOR'|'NORMAL'|'ON_THE_TABLE'} VerdictKind
 */

/** The exact sentences, fixed. DESIGN 4 C3. */
export const VERDICT_TEXT = Object.freeze({
  AT_FLOOR: 'You are at the floor. This will not get faster without moving the service closer.',
  NORMAL: 'Normal. Your route is roughly the shape of the cable, not the great circle.',
  ON_THE_TABLE: 'Your path is materially longer than the geography requires.',
});

/**
 * @typedef {Object} RowDefect
 * @property {'faster-than-light'} kind
 * @property {string} detail
 *
 * DESIGN trap 3. Any row where roundTripMs < floorMs is a DEFECT, not a result. It is dropped,
 * counted, and surfaced with its cause named. It is never averaged in and never quietly
 * clamped. In the research pass 139 of 689 third party results against one anycast target came
 * back faster than light for their stated geography, so a naive build ships 139 impossible
 * claims on its front page. This field is why this one will not.
 */

/**
 * One decomposed row.
 *
 * @typedef {Object} RowDecomposition
 * @property {string} endpointId
 * @property {number} distanceKm COMPUTED. Great circle, observer to the region city centre.
 * @property {number} floorMs COMPUTED. Round trip fibre floor for distanceKm.
 * @property {number} roundTripMs MEASURED. Warm HTTPS round trip, minimum of 7 warm samples.
 * @property {number} accessMs MEASURED. The run level access baseline. Identical on every row,
 *   which is the point: its constancy is what makes it legible at a glance in the stacked bar.
 * @property {number} routeMs MEASURED. roundTripMs minus floorMs minus accessMs.
 * @property {number|null} routeRatio COMPUTED, or null when suppressed.
 * @property {string|null} ratioSuppressedReason Non null exactly when routeRatio is null.
 * @property {VerdictKind|null} verdict null exactly when routeRatio is null.
 * @property {number|null} msOnTheTable Set only for ON_THE_TABLE. DESIGN 4 C3:
 *   round(routeMs - 0.15 * floorMs).
 * @property {RowDefect|null} defect Non null means this row is EXCLUDED from rows and appears
 *   in defects instead. A row object never carries both a defect and a verdict.
 */

/**
 * A whole decomposed run.
 *
 * @typedef {Object} DecompositionRun
 * @property {1} schema
 * @property {number} accessMs MEASURED. The minimum surplus over all usable endpoints. Always
 *   >= 0: a negative access baseline would mean some endpoint beat its own floor, which is a
 *   defect that must already have been screened out.
 * @property {string} accessFromEndpointId Which endpoint set the baseline. Shown, because a
 *   reader who knows their nearest region can sanity check it in one glance.
 * @property {RowDecomposition[]} rows Usable rows only. Sorted by the UI, not here.
 * @property {RowDecomposition[]} defects Rows dropped by the faster than light screen.
 * @property {number} unstableCount Endpoints excluded for sample spread. Reported, not hidden.
 * @property {number} unusableCount Endpoints excluded because the request failed or was blocked.
 */

/**
 * Pick the verdict for a ratio. DESIGN 4 C3. Pure and total.
 * @param {number} routeRatio
 * @returns {VerdictKind}
 */
export function verdictFor(routeRatio) {
  if (typeof routeRatio !== 'number' || !Number.isFinite(routeRatio)) {
    throw new TypeError('verdictFor: routeRatio must be a finite number, got ' + String(routeRatio));
  }
  if (routeRatio <= VERDICT_AT_FLOOR_MAX) return 'AT_FLOOR';
  if (routeRatio <= VERDICT_NORMAL_MAX) return 'NORMAL';
  return 'ON_THE_TABLE';
}

/**
 * Whether a ratio may be shown at this distance. DESIGN 4 C3, trap 2.
 * @param {number} distanceKm
 * @returns {boolean}
 */
export function ratioIsMeaningful(distanceKm) {
  return distanceKm >= RATIO_MIN_DISTANCE_KM;
}

/** The exact sentence used when a ratio is suppressed, so every short row says the same thing. */
export const RATIO_SUPPRESSED_REASON =
  'Under ' + RATIO_MIN_DISTANCE_KM + ' km a fixed access cost sits on top of a near zero floor, '
  + 'so a ratio here would be an artifact rather than a result. Milliseconds only.';

/**
 * Validate one row.
 * @param {unknown} r
 * @param {number} accessMs The run level baseline, for the identity check.
 * @param {number} i
 * @returns {RowDecomposition}
 */
export function assertRowDecomposition(r, accessMs, i = 0) {
  const at = 'rows[' + i + ']';
  if (r === null || typeof r !== 'object') throw new TypeError(at + ': expected an object');
  const row = /** @type {RowDecomposition} */ (r);

  for (const k of ['distanceKm', 'floorMs', 'roundTripMs', 'accessMs', 'routeMs']) {
    const v = /** @type {any} */ (row)[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(at + '.' + k + ': expected a finite number, got ' + String(v));
    }
  }
  if (row.accessMs !== accessMs) {
    throw new RangeError(at + '.accessMs: every row carries the same run level baseline. '
      + 'Expected ' + accessMs + ', got ' + row.accessMs + '.');
  }

  if (row.defect) {
    if (row.defect.kind !== 'faster-than-light') throw new TypeError(at + '.defect.kind: unknown defect kind');
    if (row.verdict !== null || row.routeRatio !== null) {
      throw new TypeError(at + ': a defect row carries no verdict and no ratio. A faster than '
        + 'light result is dropped and counted, never averaged in and never clamped (trap 3).');
    }
    return row;
  }

  if (row.roundTripMs < row.floorMs) {
    throw new RangeError(at + ': roundTripMs (' + row.roundTripMs + ') is below floorMs ('
      + row.floorMs + '). This is faster than light for the stated geography and it is a '
      + 'DEFECT, not a result. Set row.defect and move it to run.defects.');
  }

  const sum = row.floorMs + row.accessMs + row.routeMs;
  if (Math.abs(sum - row.roundTripMs) > IDENTITY_EPSILON_MS) {
    throw new RangeError(at + ': the decomposition identity does not hold. '
      + 'floorMs + accessMs + routeMs = ' + sum + ', roundTripMs = ' + row.roundTripMs + '.');
  }

  const meaningful = ratioIsMeaningful(row.distanceKm);
  if (!meaningful) {
    if (row.routeRatio !== null || row.verdict !== null) {
      throw new RangeError(at + ': no ratio and no verdict may be produced below '
        + RATIO_MIN_DISTANCE_KM + ' km (DESIGN trap 2). Absolute milliseconds only.');
    }
    if (row.ratioSuppressedReason !== RATIO_SUPPRESSED_REASON) {
      throw new TypeError(at + '.ratioSuppressedReason: must be the fixed RATIO_SUPPRESSED_REASON text');
    }
    return row;
  }

  if (typeof row.routeRatio !== 'number' || !Number.isFinite(row.routeRatio)) {
    throw new TypeError(at + '.routeRatio: required above ' + RATIO_MIN_DISTANCE_KM + ' km');
  }
  if (row.ratioSuppressedReason !== null) {
    throw new TypeError(at + '.ratioSuppressedReason: must be null when a ratio is shown');
  }
  const expectedRatio = (row.roundTripMs - row.accessMs) / row.floorMs;
  if (Math.abs(row.routeRatio - expectedRatio) > 1e-9) {
    throw new RangeError(at + '.routeRatio: must be (roundTripMs - accessMs) / floorMs = '
      + expectedRatio + ', got ' + row.routeRatio);
  }
  const expectedVerdict = verdictFor(row.routeRatio);
  if (row.verdict !== expectedVerdict) {
    throw new RangeError(at + '.verdict: ratio ' + row.routeRatio.toFixed(3) + ' gives '
      + expectedVerdict + ', got ' + String(row.verdict));
  }
  if (expectedVerdict === 'ON_THE_TABLE') {
    const expectedOnTable = Math.round(row.routeMs - 0.15 * row.floorMs);
    if (row.msOnTheTable !== expectedOnTable) {
      throw new RangeError(at + '.msOnTheTable: must be round(routeMs - 0.15 * floorMs) = '
        + expectedOnTable + ', got ' + String(row.msOnTheTable));
    }
  } else if (row.msOnTheTable !== null) {
    throw new TypeError(at + '.msOnTheTable: only an ON_THE_TABLE row carries one');
  }
  return row;
}

/**
 * Validate a whole decomposition run.
 * @param {unknown} d
 * @returns {DecompositionRun}
 */
export function assertDecompositionRun(d) {
  if (d === null || typeof d !== 'object') throw new TypeError('decomposition: expected an object');
  const run = /** @type {DecompositionRun} */ (d);
  if (run.schema !== DECOMPOSITION_SCHEMA) {
    throw new TypeError('decomposition.schema: expected ' + DECOMPOSITION_SCHEMA);
  }
  if (typeof run.accessMs !== 'number' || !Number.isFinite(run.accessMs) || run.accessMs < 0) {
    throw new RangeError('decomposition.accessMs: must be a finite number >= 0. A negative '
      + 'baseline means some endpoint beat its own floor, which must already have been '
      + 'screened out as a defect (DESIGN 7.3).');
  }
  if (!Array.isArray(run.rows)) throw new TypeError('decomposition.rows: expected an array');
  if (!Array.isArray(run.defects)) throw new TypeError('decomposition.defects: expected an array');

  run.rows.forEach((r, i) => assertRowDecomposition(r, run.accessMs, i));
  run.defects.forEach((r, i) => {
    if (!r || !(/** @type {RowDecomposition} */ (r).defect)) {
      throw new TypeError('decomposition.defects[' + i + ']: every entry must carry a defect');
    }
    assertRowDecomposition(r, run.accessMs, i);
  });

  if (run.rows.length > 0) {
    const setter = run.rows.find((r) => r.endpointId === run.accessFromEndpointId);
    if (!setter) {
      throw new TypeError('decomposition.accessFromEndpointId: ' + String(run.accessFromEndpointId)
        + ' is not among the usable rows');
    }
    const minSurplus = Math.min(...run.rows.map((r) => r.roundTripMs - r.floorMs));
    if (Math.abs(minSurplus - run.accessMs) > 1e-9) {
      throw new RangeError('decomposition.accessMs: must be the MINIMUM surplus over all usable '
        + 'rows (' + minSurplus + '), got ' + run.accessMs + '. Using a mean or the nearest row '
        + 'by distance instead of the minimum reintroduces the artifact this step removes.');
    }
    const setterRoute = setter.roundTripMs - setter.floorMs - run.accessMs;
    if (Math.abs(setterRoute) > IDENTITY_EPSILON_MS) {
      throw new RangeError('decomposition: the endpoint that set the baseline must have a route '
        + 'surplus of exactly zero by construction, got ' + setterRoute);
    }
  }

  for (const k of ['unstableCount', 'unusableCount']) {
    const v = /** @type {any} */ (run)[k];
    if (!Number.isInteger(v) || v < 0) throw new TypeError('decomposition.' + k + ': expected a non negative integer');
  }
  return run;
}

/**
 * Integer millisecond segment widths for one row, guaranteed to sum EXACTLY to the rendered
 * round trip integer. Largest remainder apportionment.
 *
 * Without this, rounding each of the three parts independently lets the stacked bar print
 * 127 + 8 + 116 next to a total of 251, and a reader who adds them up has correctly concluded
 * the tool is broken. The parts are rounded to fit the total the reader is shown, not the
 * other way round, and the full precision values stay on the row for the maths panel.
 *
 * @param {RowDecomposition} row
 * @returns {{physicsMs:number, accessMs:number, routeMs:number, totalMs:number}}
 */
export function displaySegments(row) {
  const total = Math.round(row.roundTripMs);
  const parts = [
    { key: 'physicsMs', exact: row.floorMs },
    { key: 'accessMs', exact: row.accessMs },
    { key: 'routeMs', exact: row.routeMs },
  ];
  const floored = parts.map((p) => ({ ...p, base: Math.floor(p.exact), rem: p.exact - Math.floor(p.exact) }));
  let remaining = total - floored.reduce((s, p) => s + p.base, 0);
  const order = [...floored].sort((a, b) => b.rem - a.rem);
  const out = { physicsMs: 0, accessMs: 0, routeMs: 0, totalMs: total };
  for (const p of floored) /** @type {any} */ (out)[p.key] = p.base;
  for (const p of order) {
    if (remaining <= 0) break;
    /** @type {any} */ (out)[p.key] += 1;
    remaining -= 1;
  }
  // A negative remainder can only arise if the exact parts overshoot the total, which the
  // identity check already forbids. Assert rather than silently absorb it.
  if (out.physicsMs + out.accessMs + out.routeMs !== total) {
    throw new RangeError('displaySegments: the rounded segments do not sum to the rounded total. '
      + 'That means the decomposition identity was violated upstream.');
  }
  return out;
}
