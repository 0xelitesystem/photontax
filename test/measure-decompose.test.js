// THE DECOMPOSITION. This file is where the product is proven correct.
//
// DESIGN 4 C2, 4 C3, DESIGN A3, DESIGN 7.2, DESIGN 7.3, traps 2, 3, 9, 17.
//
// The expectations come from test/fixtures/measure-hand-computed.json, which was produced by an
// implementation that shares no code with the product: the spherical law of cosines instead of
// the haversine, the floor written out longhand from the SI constant and the group index, and
// the largest remainder apportionment written again from scratch. Two independent
// implementations agreeing is evidence. One implementation agreeing with itself is not.
//
// The equatorial case exists so the distances can be checked with no trigonometry at all: two
// points on the equator separated by L degrees are exactly R times L radians apart.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { greatCircleKm } from '../src/core/geo.js';
import { floorMsForDistanceKm, WARM_SAMPLE_COUNT, RATIO_MIN_DISTANCE_KM, EARTH_MEAN_RADIUS_KM } from '../src/core/constants.js';
import { endpointById, MEASURED_ENDPOINTS } from '../src/core/data/endpoints.js';
import { assertMeasurementRun, MEASUREMENT_SCHEMA } from '../src/core/contracts/measurement.js';
import { assertDecompositionRun, displaySegments, RATIO_SUPPRESSED_REASON, VERDICT_TEXT } from '../src/core/contracts/decomposition.js';
import { decompose, naiveRatio } from '../src/measure/decompose.js';
import { EXCLUSION_REASONS } from '../src/measure/reasons.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'measure-hand-computed.json'), 'utf8'));

const near = (a, b, t) => Math.abs(a - b) <= t;
const MS = 1e-9;

/**
 * Build a measurement run whose minimum is exactly the value the fixture states. The six other
 * samples are larger, so the minimum is the stated number and the spread stays inside the
 * stability limit.
 * @param {{lat:number, lon:number}} observer
 * @param {{endpointId:string, measuredMs:number}[]} rows
 * @param {{status?: string, spread?: number}} [opts]
 */
function runFrom(observer, rows, opts = {}) {
  const endpoints = rows.map((r) => {
    const ep = endpointById(r.endpointId);
    if (opts.status === 'failed' || opts.status === 'blocked') {
      return {
        endpointId: r.endpointId,
        host: ep.measurementHost,
        samplesMs: [],
        roundTripMs: null,
        spreadMs: null,
        status: opts.status,
        failureReason: 'stated in the test',
      };
    }
    const spread = opts.spread === undefined ? 0.6 : opts.spread;
    const samplesMs = [
      r.measuredMs,
      r.measuredMs + spread / 6, r.measuredMs + (spread * 2) / 6, r.measuredMs + (spread * 3) / 6,
      r.measuredMs + (spread * 4) / 6, r.measuredMs + (spread * 5) / 6, r.measuredMs + spread,
    ];
    const min = Math.min(...samplesMs);
    return {
      endpointId: r.endpointId,
      host: ep.measurementHost,
      samplesMs,
      roundTripMs: min,
      spreadMs: Math.max(...samplesMs) - min,
      status: spread > 30 ? 'unstable' : 'ok',
      failureReason: null,
    };
  });

  const run = {
    schema: MEASUREMENT_SCHEMA,
    startedAt: '2026-09-21T10:00:00.000Z',
    observer: {
      source: 'visitor-picked-city',
      colo: null,
      label: 'the city the reader chose',
      lat: observer.lat,
      lon: observer.lon,
      badge: 'INFERRED',
    },
    samplesPerEndpoint: WARM_SAMPLE_COUNT,
    endpoints,
    hostsContacted: [...new Set(endpoints.map((e) => e.host))].sort(),
  };
  assertMeasurementRun(run);
  return run;
}

/** The coordinate lookup for a fixture case, so the published numbers can be reproduced exactly. */
function coordForCase(c) {
  const byId = new Map(c.input.map((r) => [r.endpointId, { lat: r.lat, lon: r.lon }]));
  return (id) => {
    const hit = byId.get(id);
    if (!hit) throw new Error('fixture has no coordinate for ' + id);
    return hit;
  };
}

/* ------------------------------------------------------------------------------------------
 * CASE 1. The design own Appendix B table, through the shipped engine.
 * ---------------------------------------------------------------------------------------- */

describe('the design Appendix B table, decomposed by the shipped engine', () => {
  const c = fixture.cases.designAppendixB;
  const run = runFrom(c.observer, c.input);
  const { decomposition, excluded } = decompose({ measurement: run, coordFor: coordForCase(c) });

  test('the whole run satisfies the decomposition contract', () => {
    assert.doesNotThrow(() => assertDecompositionRun(decomposition));
    assert.equal(excluded.length, 0);
  });

  test('the access baseline is the independently computed value, and it publishes as 8.39 ms', () => {
    assert.ok(near(decomposition.accessMs, c.expected.accessMs, MS),
      'engine ' + decomposition.accessMs + ' against hand computed ' + c.expected.accessMs);
    assert.equal(Number(decomposition.accessMs.toFixed(2)), 8.39);
    assert.equal(decomposition.accessFromEndpointId, c.expected.accessFromEndpointId);
  });

  for (const want of fixture.cases.designAppendixB.expected.rows) {
    test(want.endpointId + ': distance, floor, route, ratio and verdict all reproduce', () => {
      const got = decomposition.rows.find((r) => r.endpointId === want.endpointId);
      assert.ok(got, 'row missing from the decomposition');
      assert.ok(near(got.distanceKm, want.distanceKm, 1e-6), 'distance');
      assert.ok(near(got.floorMs, want.floorMs, MS), 'floor');
      assert.ok(near(got.routeMs, want.routeMs, MS), 'route');
      assert.equal(got.verdict, want.verdict, 'verdict');
      if (want.routeRatio === null) {
        assert.equal(got.routeRatio, null);
        assert.equal(got.ratioSuppressedReason, RATIO_SUPPRESSED_REASON);
      } else {
        assert.ok(near(got.routeRatio, want.routeRatio, MS), 'ratio');
      }
      assert.equal(got.msOnTheTable, want.msOnTheTable, 'milliseconds on the table');
      assert.deepEqual(displaySegments(got), want.displaySegments, 'the integers on the bar');
    });
  }

  test('the published two decimal route surpluses and ratios match the design table exactly', () => {
    /** @type {Record<string, [number, number]>} */
    const published = {
      'aws:us-east-1': [0.00, 1.00],
      'aws:eu-central-1': [18.82, 1.29],
      'aws:sa-east-1': [41.42, 1.56],
      'aws:ap-northeast-1': [68.90, 1.64],
      'aws:ap-south-1': [116.47, 1.92],
      'aws:ap-southeast-2': [42.77, 1.28],
    };
    for (const [id, [routeMs, ratio]] of Object.entries(published)) {
      const got = decomposition.rows.find((r) => r.endpointId === id);
      assert.equal(Number(got.routeMs.toFixed(2)), routeMs, id + ' route');
      const arithmeticRatio = (got.roundTripMs - decomposition.accessMs) / got.floorMs;
      assert.equal(Number(arithmeticRatio.toFixed(2)), ratio, id + ' ratio');
    }
  });

  test('the sentence the design puts on screen reads 97 ms on the table for Mumbai', () => {
    const mumbai = decomposition.rows.find((r) => r.endpointId === 'aws:ap-south-1');
    assert.equal(mumbai.msOnTheTable, 97);
    assert.equal(mumbai.verdict, 'ON_THE_TABLE');
    assert.equal(VERDICT_TEXT[mumbai.verdict], 'Your path is materially longer than the geography requires.');
  });

  test('the median route ratio lands inside the band the design gates the build on', () => {
    // DESIGN 7.2: outside 1.2x to 3.5x the build stops and a person looks at it.
    const ratios = decomposition.rows.map((r) => r.routeRatio).filter((x) => x !== null).sort((a, b) => a - b);
    const median = ratios.length % 2
      ? ratios[(ratios.length - 1) / 2]
      : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2;
    assert.ok(median >= 1.2 && median <= 3.5, 'median route ratio was ' + median.toFixed(3));
  });
});

/* ------------------------------------------------------------------------------------------
 * CASE 2. The one the whole design argument rests on.
 * ---------------------------------------------------------------------------------------- */

describe('the near endpoint: 11.35x without the decomposition, 1.00x with it', () => {
  const c = fixture.cases.designAppendixB;
  const run = runFrom(c.observer, c.input);
  const { decomposition } = decompose({ measurement: run, coordFor: coordForCase(c) });
  const nearest = decomposition.rows.find((r) => r.endpointId === 'aws:us-east-1');

  test('the naive ratio every other approach would ship really does read 11.35x', () => {
    const naive = naiveRatio(nearest);
    assert.equal(Number(naive.toFixed(2)), 11.35);
    assert.ok(naive > 11, 'and it is absurd, which is the entire point');
  });

  test('the decomposed ratio for the same row is exactly 1.00x, by construction', () => {
    const arithmeticRatio = (nearest.roundTripMs - decomposition.accessMs) / nearest.floorMs;
    assert.equal(Number(arithmeticRatio.toFixed(2)), 1.00);
    assert.equal(nearest.routeMs, 0, 'the row that sets the baseline has no route surplus at all');
  });

  test('and the 1.00x is never rendered anyway, because the row is under the distance gate', () => {
    assert.ok(nearest.distanceKm < RATIO_MIN_DISTANCE_KM);
    assert.equal(nearest.routeRatio, null);
    assert.equal(nearest.verdict, null);
    assert.equal(nearest.ratioSuppressedReason, RATIO_SUPPRESSED_REASON);
  });

  test('the difference between the two numbers is a fixed access cost on a near zero floor', () => {
    assert.ok(nearest.floorMs < 1, 'floor was ' + nearest.floorMs.toFixed(3) + ' ms');
    assert.ok(decomposition.accessMs > 10 * nearest.floorMs,
      'the access baseline is an order of magnitude above the floor it sits on, which is what '
      + 'makes the naive ratio meaningless here');
  });
});

/* ------------------------------------------------------------------------------------------
 * CASE 3. Equatorial synthetic. Distances checkable on paper.
 * ---------------------------------------------------------------------------------------- */

describe('the equatorial case, where the great circle has a closed form', () => {
  const c = fixture.cases.equatorial;
  const run = runFrom(c.observer, c.input);
  const { decomposition, excluded } = decompose({ measurement: run, coordFor: coordForCase(c) });

  test('the haversine reproduces the closed form distance for every row', () => {
    for (const d of c.closedFormDistances) {
      const byHaversine = greatCircleKm(c.observer, { lat: 0, lon: d.degrees });
      const byHand = EARTH_MEAN_RADIUS_KM * Math.abs(d.degrees) * Math.PI / 180;
      assert.ok(near(byHaversine, byHand, 1e-6), d.endpointId + ': ' + byHaversine + ' against ' + byHand);
      assert.ok(near(byHand, d.km, 1e-9));
    }
  });

  test('the baseline, every route surplus and every verdict match the hand computed values', () => {
    assert.ok(near(decomposition.accessMs, c.expected.accessMs, MS));
    assert.equal(decomposition.accessFromEndpointId, c.expected.accessFromEndpointId);
    for (const want of c.expected.rows) {
      const got = decomposition.rows.find((r) => r.endpointId === want.endpointId);
      assert.ok(near(got.floorMs, want.floorMs, MS), want.endpointId + ' floor');
      assert.ok(near(got.routeMs, want.routeMs, MS), want.endpointId + ' route');
      assert.equal(got.verdict, want.verdict, want.endpointId + ' verdict');
      assert.deepEqual(displaySegments(got), want.displaySegments, want.endpointId + ' segments');
    }
  });

  test('all three verdicts occur, so none of the three branches is untested', () => {
    const kinds = new Set(decomposition.rows.map((r) => r.verdict).filter((v) => v !== null));
    assert.deepEqual([...kinds].sort(), ['AT_FLOOR', 'NORMAL', 'ON_THE_TABLE']);
  });

  test('the access baseline exceeds the floor of the short row, and route is still zero not negative', () => {
    const short = decomposition.rows.find((r) => r.endpointId === 'aws:us-east-1');
    assert.ok(decomposition.accessMs > short.floorMs,
      'access ' + decomposition.accessMs.toFixed(3) + ' ms sits on a floor of ' + short.floorMs.toFixed(3) + ' ms');
    assert.equal(short.routeMs, 0);
    assert.equal(displaySegments(short).totalMs, 12);
    assert.deepEqual(displaySegments(short), { physicsMs: 1, accessMs: 11, routeMs: 0, totalMs: 12 });
  });

  test('the faster than light row is a defect, not a result', () => {
    assert.equal(decomposition.defects.length, 1);
    const d = decomposition.defects[0];
    assert.equal(d.endpointId, 'aws:sa-east-1');
    assert.equal(d.defect.kind, 'faster-than-light');
    assert.equal(d.defect.detail, EXCLUSION_REASONS.FASTER_THAN_LIGHT);
    assert.equal(d.verdict, null);
    assert.equal(d.routeRatio, null);
    assert.equal(decomposition.rows.some((r) => r.endpointId === 'aws:sa-east-1'), false,
      'a defect must never appear among the results');
    assert.ok(excluded.some((x) => x.endpointId === 'aws:sa-east-1' && x.kind === 'faster-than-light'));
  });

  test('the defect is screened BEFORE the baseline, which is the difference between working and not', () => {
    // If the impossible row were left in step 2 it would set the baseline, because the baseline
    // is a minimum. The hand computed file records what that would have been.
    assert.ok(c.expected.accessIfDefectsNotScreened < 0,
      'the unscreened baseline would have been ' + c.expected.accessIfDefectsNotScreened);
    assert.ok(decomposition.accessMs > 0);
    assert.ok(near(decomposition.accessMs, c.expected.accessMs, MS),
      'the surviving baseline is unaffected by the impossible row');
  });
});

/* ------------------------------------------------------------------------------------------
 * CASE 4. The invariants, asserted as invariants rather than as examples.
 * ---------------------------------------------------------------------------------------- */

describe('the invariants', () => {
  /** A small deterministic generator, so a failure is reproducible from its seed. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  test('route is never negative, over 500 randomised runs including impossible rows', () => {
    const ids = MEASURED_ENDPOINTS.map((e) => e.id);
    for (let seed = 1; seed <= 500; seed += 1) {
      const rand = rng(seed);
      const observer = { lat: rand() * 180 - 90, lon: rand() * 360 - 180 };
      const count = 2 + Math.floor(rand() * (ids.length - 2));
      const chosen = [...ids].sort(() => rand() - 0.5).slice(0, count);
      const rows = chosen.map((id) => {
        const ep = endpointById(id);
        const floor = floorMsForDistanceKm(greatCircleKm(observer, { lat: ep.lat, lon: ep.lon }));
        // One row in ten is deliberately impossible, so the screen is exercised too.
        const impossible = rand() < 0.1;
        const measuredMs = impossible ? floor * rand() : floor + rand() * 300;
        return { endpointId: id, measuredMs: Math.max(0.001, measuredMs) };
      });

      const run = runFrom(observer, rows);
      const { decomposition } = decompose({ measurement: run });

      assert.doesNotThrow(() => assertDecompositionRun(decomposition), 'seed ' + seed);
      assert.ok(decomposition.accessMs >= 0, 'seed ' + seed + ': negative access baseline');
      for (const r of decomposition.rows) {
        assert.ok(r.routeMs >= 0, 'seed ' + seed + ': negative route surplus on ' + r.endpointId);
        assert.ok(r.roundTripMs >= r.floorMs, 'seed ' + seed + ': a faster than light row survived');
        assert.ok(Math.abs((r.floorMs + r.accessMs + r.routeMs) - r.roundTripMs) <= 1e-9, 'seed ' + seed + ': identity');
        const s = displaySegments(r);
        assert.equal(s.physicsMs + s.accessMs + s.routeMs, s.totalMs, 'seed ' + seed + ': display identity');
        if (r.distanceKm < RATIO_MIN_DISTANCE_KM) {
          assert.equal(r.routeRatio, null, 'seed ' + seed + ': a ratio leaked below the distance gate');
        }
      }
    }
  });

  test('the row that sets the baseline carries a route surplus of exactly zero, never a rounding crumb', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const rand = rng(seed * 7919);
      const observer = { lat: rand() * 180 - 90, lon: rand() * 360 - 180 };
      const rows = MEASURED_ENDPOINTS.slice(0, 6).map((ep) => {
        const floor = floorMsForDistanceKm(greatCircleKm(observer, { lat: ep.lat, lon: ep.lon }));
        return { endpointId: ep.id, measuredMs: floor + 5 + rand() * 200 };
      });
      const { decomposition } = decompose({ measurement: runFrom(observer, rows) });
      const setter = decomposition.rows.find((r) => r.endpointId === decomposition.accessFromEndpointId);
      assert.equal(setter.routeMs, 0, 'seed ' + seed);
    }
  });

  test('the baseline is the minimum surplus, not the mean and not the nearest endpoint', () => {
    // The nearest endpoint is given a deliberately bad number, so the row that sets the
    // baseline is a distant one. A build that took the nearest row by distance would be wrong
    // here and would still look plausible, which is why this case is pinned.
    const observer = { lat: 0, lon: 0 };
    const input = [
      { endpointId: 'aws:us-east-1', lat: 0, lon: 0.5, measuredMs: 400 },
      { endpointId: 'aws:eu-west-2', lat: 0, lon: 10, measuredMs: 30 },
      { endpointId: 'aws:eu-central-1', lat: 0, lon: 45, measuredMs: 68 },
    ];
    const coordFor = coordForCase({ input });
    const { decomposition } = decompose({
      measurement: runFrom(observer, input.map(({ endpointId, measuredMs }) => ({ endpointId, measuredMs }))),
      coordFor,
    });

    const surpluses = decomposition.rows.map((r) => r.roundTripMs - r.floorMs);
    const mean = surpluses.reduce((s, x) => s + x, 0) / surpluses.length;
    assert.equal(decomposition.accessFromEndpointId, 'aws:eu-central-1',
      'the nearest row was the worst row, so it cannot be the baseline');
    assert.ok(near(decomposition.accessMs, Math.min(...surpluses), MS));
    assert.ok(decomposition.accessMs < mean - 1, 'a mean would have been a much larger baseline');
  });

  test('a run with no usable row produces no results and no invented baseline', () => {
    const observer = { lat: 0, lon: 0 };
    const rows = [{ endpointId: 'aws:eu-west-2', measuredMs: 30 }, { endpointId: 'aws:eu-central-1', measuredMs: 68 }];
    const run = runFrom(observer, rows, { status: 'blocked' });
    const { decomposition, excluded } = decompose({ measurement: run });

    assert.deepEqual(decomposition.rows, []);
    assert.equal(decomposition.accessFromEndpointId, null);
    assert.equal(decomposition.unusableCount, 2);
    assert.equal(excluded.length, 2);
    assert.ok(excluded.every((x) => x.reason === EXCLUSION_REASONS.NOT_MEASURED));
    assert.doesNotThrow(() => assertDecompositionRun(decomposition));
  });

  test('an unstable row is counted and excluded, and never contributes to the baseline', () => {
    const observer = { lat: 0, lon: 0 };
    const steady = [{ endpointId: 'aws:eu-west-2', measuredMs: 30 }, { endpointId: 'aws:eu-central-1', measuredMs: 68 }];
    const wild = [{ endpointId: 'aws:ap-south-1', measuredMs: 1 }];

    const base = runFrom(observer, steady);
    const noisy = runFrom(observer, wild, { spread: 90 });
    const merged = {
      ...base,
      endpoints: [...base.endpoints, ...noisy.endpoints],
      hostsContacted: [...new Set([...base.hostsContacted, ...noisy.hostsContacted])].sort(),
    };
    assertMeasurementRun(merged);

    const { decomposition, excluded } = decompose({ measurement: merged });
    assert.equal(decomposition.unstableCount, 1);
    assert.equal(decomposition.rows.some((r) => r.endpointId === 'aws:ap-south-1'), false);
    assert.ok(excluded.some((x) => x.kind === 'unstable' && x.reason === EXCLUSION_REASONS.UNSTABLE_SPREAD));
    assert.ok(decomposition.accessMs > 0,
      'a 1 ms reading to the far side of the planet would have set a negative or absurd baseline '
      + 'had the unstable row been allowed to vote');
  });

  test('an unknown endpoint is refused rather than silently skipped', () => {
    assert.throws(() => decompose({
      measurement: {
        schema: MEASUREMENT_SCHEMA,
        startedAt: '2026-09-21T10:00:00.000Z',
        observer: { source: 'visitor-picked-city', colo: null, label: 'x', lat: 0, lon: 0, badge: 'INFERRED' },
        samplesPerEndpoint: WARM_SAMPLE_COUNT,
        endpoints: [{
          endpointId: 'aws:nowhere-1', host: 'dynamodb.us-east-1.amazonaws.com',
          samplesMs: [1, 2, 3, 4, 5, 6, 7], roundTripMs: 1, spreadMs: 6, status: 'ok', failureReason: null,
        }],
        hostsContacted: ['dynamodb.us-east-1.amazonaws.com'],
      },
    }), /unknown endpoint/);
  });
});
