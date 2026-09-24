// The physics and geometry core, checked against the design's published values and against
// closed form geometry. DESIGN 2.3, DESIGN 4 C1, DESIGN 7.1, DESIGN 7.3.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  C_VACUUM_M_S,
  FIBRE_GROUP_INDEX_1550NM,
  V_FIBRE_KM_S,
  V_FIBRE_KM_S_PUBLISHED,
  FLOOR_MS_PER_1000_KM,
  FLOOR_MS_PER_1000_KM_PUBLISHED,
  EARTH_MEAN_RADIUS_KM,
  MAX_GREAT_CIRCLE_KM,
  RATIO_MIN_DISTANCE_KM,
  ROUTE_FACTOR_AVAILABLE,
  floorMsForDistanceKm,
  floorTerms,
} from '../src/core/constants.js';
import { greatCircleKm, greatCircleTerms, isPossibleGreatCircleKm, assertCoord, quantiseCoord } from '../src/core/geo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const design = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'design-worked-values.json'), 'utf8'));
const hand = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'measure-hand-computed.json'), 'utf8'));
const analytic = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'analytic-great-circles.json'), 'utf8'));

/**
 * THE ONE COMPARATOR. Every numeric assertion in this file goes through it, including the
 * positive control at the bottom that must be rejected by it. Sharing the comparator is what
 * makes the positive control meaningful: it proves the thing that judged every other row is
 * capable of saying no.
 * @returns {boolean}
 */
function within(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

describe('constants: sourced, exact, and matching the published values', () => {
  test('the speed of light in vacuum is the SI definition, exactly', () => {
    assert.equal(C_VACUUM_M_S, design.constants.cVacuumMS);
    assert.equal(C_VACUUM_M_S, 299792458);
  });

  test('the fibre group index is the Corning SMF-28 value at 1550 nm', () => {
    assert.equal(FIBRE_GROUP_INDEX_1550NM, design.constants.fibreGroupIndex1550nm);
  });

  test('v in fibre is computed from the two inputs, not typed in', () => {
    assert.equal(V_FIBRE_KM_S, C_VACUUM_M_S / FIBRE_GROUP_INDEX_1550NM / 1000);
  });

  test('v in fibre matches the published 204190.5 km/s to 1 decimal', () => {
    assert.ok(
      within(V_FIBRE_KM_S, design.constants.vFibreKmSPublished, design.constants.vFibreKmSTolerance),
      'v = ' + V_FIBRE_KM_S + ' does not round to ' + design.constants.vFibreKmSPublished,
    );
    assert.equal(Number(V_FIBRE_KM_S.toFixed(1)), V_FIBRE_KM_S_PUBLISHED);
  });

  test('the round trip floor is 9.7948 ms per 1000 km to 4 decimals', () => {
    assert.ok(
      within(FLOOR_MS_PER_1000_KM, design.constants.floorMsPer1000KmPublished, design.constants.floorMsPer1000KmTolerance),
      'floor per 1000 km = ' + FLOOR_MS_PER_1000_KM,
    );
    assert.equal(Number(FLOOR_MS_PER_1000_KM.toFixed(4)), FLOOR_MS_PER_1000_KM_PUBLISHED);
  });

  test('the floor per 1000 km is exactly what floorMsForDistanceKm(1000) returns', () => {
    assert.equal(floorMsForDistanceKm(1000), FLOOR_MS_PER_1000_KM);
  });

  test('the earth radius is the IUGG mean radius the design fixes', () => {
    assert.equal(EARTH_MEAN_RADIUS_KM, design.constants.earthMeanRadiusKm);
  });

  test('the antipodal sanity bound holds: the longest possible great circle is under 20040 km', () => {
    assert.ok(MAX_GREAT_CIRCLE_KM < design.constants.maxGreatCircleKmUnder,
      'pi * R = ' + MAX_GREAT_CIRCLE_KM);
    assert.equal(MAX_GREAT_CIRCLE_KM, Math.PI * EARTH_MEAN_RADIUS_KM);
  });

  test('the route factor is NOT available for display until its derivation script ships', () => {
    // DESIGN 7.1 requires the derivation to ship before the number is shown anywhere. Until
    // scripts/derive-route-factor.mjs exists this must stay false, or the product would print
    // a number it cannot recompute from a file in the repo, which is exactly trap 20.
    assert.equal(ROUTE_FACTOR_AVAILABLE, false);
  });

  test('the floor is linear in distance and zero at zero', () => {
    assert.equal(floorMsForDistanceKm(0), 0);
    assert.ok(within(floorMsForDistanceKm(2000), 2 * floorMsForDistanceKm(1000), 1e-12));
  });

  test('floorMsForDistanceKm refuses input it cannot honestly answer for', () => {
    assert.throws(() => floorMsForDistanceKm(-1), /finite number >= 0/);
    assert.throws(() => floorMsForDistanceKm(NaN), /finite number >= 0/);
    assert.throws(() => floorMsForDistanceKm('1000'), /finite number >= 0/);
    assert.throws(() => floorMsForDistanceKm(25000), /exceeds the longest possible great circle/);
  });

  test('floorTerms prints every intermediate the maths panel shows', () => {
    const t = floorTerms(12923.9);
    assert.equal(t.roundTripKm, 2 * 12923.9);
    assert.equal(t.cVacuumMS, C_VACUUM_M_S);
    assert.equal(t.groupIndex, FIBRE_GROUP_INDEX_1550NM);
    assert.equal(t.vFibreKmS, V_FIBRE_KM_S);
    assert.equal(t.floorMs, floorMsForDistanceKm(12923.9));
    // The reader must be able to redo the division themselves and land on the same number.
    assert.ok(within(t.roundTripKm / t.vFibreKmS * 1000, t.floorMs, 1e-12));
  });
});

describe('haversine against closed form geometry (independent of this repo)', () => {
  for (const c of analytic.cases) {
    test(c.name + '  [' + c.closedForm + ']', () => {
      // A case may widen the tolerance, but only with a stated reason, so a loosened bound is
      // always a sentence somebody wrote and not a number somebody nudged.
      const tol = c.toleranceKm === undefined ? analytic.toleranceKm : c.toleranceKm;
      if (c.toleranceKm !== undefined) {
        assert.ok(typeof c.toleranceReason === 'string' && c.toleranceReason.length > 40,
          c.name + ': a widened tolerance must carry toleranceReason explaining it');
      }
      const got = greatCircleKm(c.a, c.b);
      assert.ok(
        within(got, c.expectedKm, tol),
        c.name + ': got ' + got + ' km, expected ' + c.expectedKm + ' km (' + c.closedForm + ')',
      );
    });
  }

  test('pi * R in the fixture matches the constant this repo computes', () => {
    assert.equal(analytic.piRTimes1, MAX_GREAT_CIRCLE_KM);
    assert.equal(analytic.radiusKm, EARTH_MEAN_RADIUS_KM);
  });

  test('no distance on the fixture can exceed the antipodal bound', () => {
    for (const c of analytic.cases) {
      assert.ok(isPossibleGreatCircleKm(greatCircleKm(c.a, c.b)), c.name);
    }
  });

  test('the great circle is symmetric', () => {
    const a = { lat: 39.0436, lon: -77.4875 };
    const b = { lat: 19.0758, lon: 72.8775 };
    assert.equal(greatCircleKm(a, b), greatCircleKm(b, a));
  });

  test('greatCircleTerms reproduces greatCircleKm exactly and prints its terms', () => {
    const a = { lat: 40.7128, lon: -74.006 };
    const b = { lat: 51.5074, lon: -0.1278 };
    const t = greatCircleTerms(a, b);
    assert.equal(t.distanceKm, greatCircleKm(a, b));
    assert.equal(t.radiusKm, EARTH_MEAN_RADIUS_KM);
    assert.ok(t.h >= 0 && t.h <= 1, 'the haversine h term must stay in [0, 1]');
    assert.ok(within(t.radiusKm * t.centralAngleRad, t.distanceKm, 1e-12));
  });

  test('coordinate validation refuses anything that would become a NaN floor', () => {
    assert.throws(() => assertCoord(null), /expected an object/);
    assert.throws(() => assertCoord({ lat: 91, lon: 0 }), /lat must be/);
    assert.throws(() => assertCoord({ lat: 0, lon: 181 }), /lon must be/);
    assert.throws(() => assertCoord({ lat: NaN, lon: 0 }), /lat must be/);
    assert.throws(() => assertCoord({ lat: '38', lon: 0 }), /lat must be/);
    assert.deepEqual(assertCoord({ lat: -90, lon: 180 }), { lat: -90, lon: 180 });
  });

  test('quantising to 4 decimals moves a coordinate by well under its own uncertainty', () => {
    const q = quantiseCoord({ lat: 35.68941234, lon: 139.69171234 });
    assert.deepEqual(q, { lat: 35.6894, lon: 139.6917 });
    const moved = greatCircleKm({ lat: 35.68941234, lon: 139.69171234 }, q);
    assert.ok(moved < 0.02, 'quantisation moved the point ' + moved + ' km');
  });
});

describe('the capture fixture distances and floors, and the design worked pairs, recomputed', () => {
  // The design's own Appendix B distances were taken from a private point that is not in this
  // repository. The capture fixture's distances, from the bundled city centre it ships, are
  // checked against the independent implementation (spherical law of cosines, longhand floor).
  const hc = hand.cases.captureFixture;
  const obs = hc.observer;

  for (const want of hc.expected.rows) {
    test(want.endpointId + ': distance and floor agree with the independent implementation', () => {
      const r = hc.input.find((x) => x.endpointId === want.endpointId);
      const km = greatCircleKm(obs, { lat: r.lat, lon: r.lon });
      assert.ok(within(km, want.distanceKm, 1e-6),
        want.endpointId + ': haversine ' + km + ' km, law of cosines ' + want.distanceKm);
      assert.ok(within(floorMsForDistanceKm(km), want.floorMs, 1e-9), want.endpointId + ' floor');
    });
  }

  for (const p of design.workedPairs.pairs) {
    test(p.name + ': ' + p.expectedKm + ' km, floor ' + p.expectedFloorMs + ' ms', () => {
      const km = greatCircleKm(p.a, p.b);
      assert.ok(within(km, p.expectedKm, p.kmTolerance),
        p.name + ': got ' + km.toFixed(4) + ' km, design publishes ' + p.expectedKm);
      const floor = floorMsForDistanceKm(km);
      assert.ok(within(floor, p.expectedFloorMs, p.floorToleranceMs),
        p.name + ': got floor ' + floor.toFixed(4) + ' ms, design publishes ' + p.expectedFloorMs);
    });
  }

  test('the 500 km ratio gate is where the design puts it', () => {
    assert.equal(RATIO_MIN_DISTANCE_KM, 500);
    const nearest = hc.input.find((r) => r.endpointId === 'aws:us-east-1');
    const km = greatCircleKm(obs, { lat: nearest.lat, lon: nearest.lon });
    assert.ok(km < RATIO_MIN_DISTANCE_KM,
      'the nearest region must fall under the gate, which is the whole reason the gate exists');
    assert.equal(hc.expected.rows.find((r) => r.endpointId === 'aws:us-east-1').routeRatio, null);
  });
});

describe('THE POSITIVE CONTROL: the comparator must be able to say no', () => {
  const pc = design.positiveControl;

  test('a deliberately wrong expected distance is REJECTED by the same comparator', () => {
    const km = greatCircleKm(pc.a, pc.b);

    // First: the true distance is what we think it is, so the control is wrong for the reason
    // stated and not for some other reason.
    assert.ok(within(km, pc.trueKmApprox, 0.5),
      'the control pair should be about ' + pc.trueKmApprox + ' km, got ' + km);

    // Then: the comparator that passed every row above must fail on this one.
    const verdict = within(km, pc.expectedKm, pc.kmTolerance);
    assert.equal(verdict, false,
      'THE POSITIVE CONTROL PASSED. The comparator accepted a distance that is wrong by '
      + Math.abs(km - pc.expectedKm).toFixed(1) + ' km. Every green assertion in this file is '
      + 'therefore meaningless, because the thing judging them cannot say no.');
  });

  test('and the assertion built on that comparator actually throws', () => {
    const km = greatCircleKm(pc.a, pc.b);
    assert.throws(
      () => assert.ok(within(km, pc.expectedKm, pc.kmTolerance), 'deliberate failure'),
      /deliberate failure/,
      'assert.ok did not throw on a false comparator result, so the test harness itself is not failing when it should',
    );
  });
});
