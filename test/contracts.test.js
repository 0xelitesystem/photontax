// The four contracts, and the decomposition arithmetic they guard.
// DESIGN 4 C2, DESIGN 4 C3, DESIGN 6.5, DESIGN 6.6, DESIGN 7.3, traps 2, 3, 5, 13, 14, 17.
//
// The most important block in this file is the last one: it takes the capture fixture as the page
// ships it, runs it through the real decomposition contract, and checks that the access
// baseline, every route surplus, every ratio and every verdict come out at the values an
// independent implementation derived. That is the difference between a shape that type checks
// and a shape that is correct.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { greatCircleKm } from '../src/core/geo.js';
import { floorMsForDistanceKm, WARM_SAMPLE_COUNT, SAMPLE_SPREAD_UNSTABLE_MS } from '../src/core/constants.js';
import { MEASUREMENT_HOSTS, MEASURED_ENDPOINTS } from '../src/core/data/endpoints.js';
import { assertMeasurementRun, assertObserver, assertEndpointMeasurement, hostsContactedFrom, MEASUREMENT_SCHEMA } from '../src/core/contracts/measurement.js';
import {
  assertDecompositionRun, assertRowDecomposition, verdictFor, ratioIsMeaningful,
  displaySegments, RATIO_SUPPRESSED_REASON, DECOMPOSITION_SCHEMA, VERDICT_TEXT,
} from '../src/core/contracts/decomposition.js';
import { assertGlobeInput, GLOBE_INPUT_SCHEMA, RENDER_RULES } from '../src/core/contracts/globe.js';
import { assertViewModel, allClaims, VIEW_MODEL_SCHEMA } from '../src/core/contracts/viewmodel.js';
import { measured, computed, inferred, METHODS, UNITS, isClaim } from '../src/core/claim.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const hand = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'measure-hand-computed.json'), 'utf8'));

const near = (a, b, t) => Math.abs(a - b) <= t;

/* ---------------------------------------------------------------------------------------- */

describe('measurement contract', () => {
  const samples = [252.1, 251.45, 253.0, 252.8, 251.9, 252.4, 253.3];
  const goodEndpoint = () => ({
    endpointId: 'aws:ap-south-1',
    host: 'dynamodb.ap-south-1.amazonaws.com',
    samplesMs: [...samples],
    roundTripMs: Math.min(...samples),
    spreadMs: Math.max(...samples) - Math.min(...samples),
    status: 'ok',
    failureReason: null,
  });
  const goodObserver = () => ({
    source: 'cloudflare-colo', colo: 'IAD', label: 'Washington DC area (IAD)',
    lat: 38.9445, lon: -77.4558, badge: 'REPORTED',
  });
  const goodRun = () => ({
    schema: MEASUREMENT_SCHEMA,
    startedAt: '2026-09-21T10:00:00.000Z',
    observer: goodObserver(),
    samplesPerEndpoint: WARM_SAMPLE_COUNT,
    endpoints: [goodEndpoint()],
    hostsContacted: ['dynamodb.ap-south-1.amazonaws.com'],
  });

  test('a well formed run validates', () => {
    assert.doesNotThrow(() => assertMeasurementRun(goodRun()));
  });

  test('there is no IP geolocation observer source', () => {
    const o = goodObserver();
    o.source = 'ip-geolocation';
    assert.throws(() => assertObserver(o), /There is no IP geolocation source/);
  });

  test('a colo observer is REPORTED and a picked city is INFERRED, never the other way round', () => {
    const o = goodObserver();
    o.badge = 'INFERRED';
    assert.throws(() => assertObserver(o), /a cloudflare-colo observer is REPORTED/);
    const p = { source: 'visitor-picked-city', colo: null, label: 'Berlin', lat: 52.5167, lon: 13.3833, badge: 'MEASURED' };
    assert.throws(() => assertObserver(p), /a visitor-picked-city observer is INFERRED/);
  });

  test('the round trip must be the MINIMUM of the samples, not a mean', () => {
    const e = goodEndpoint();
    e.roundTripMs = samples.reduce((s, x) => s + x, 0) / samples.length;
    assert.throws(() => assertEndpointMeasurement(e), /must be the MINIMUM/);
  });

  test('exactly 7 warm samples, with the warm up response not among them', () => {
    const e = goodEndpoint();
    e.samplesMs = samples.slice(0, 6);
    assert.throws(() => assertEndpointMeasurement(e), /expected exactly 7 warm samples/);
  });

  test('a spread above the limit forces the unstable status (DESIGN 6.5)', () => {
    const wide = [200, 200, 200, 200, 200, 200, 200 + SAMPLE_SPREAD_UNSTABLE_MS + 1];
    const e = { ...goodEndpoint(), samplesMs: wide, roundTripMs: 200, spreadMs: SAMPLE_SPREAD_UNSTABLE_MS + 1 };
    assert.throws(() => assertEndpointMeasurement(e), /this row is unstable/);
    e.status = 'unstable';
    assert.doesNotThrow(() => assertEndpointMeasurement(e));
  });

  test('a failed measurement is a stated state, never a zero', () => {
    const e = { ...goodEndpoint(), status: 'failed', roundTripMs: 0, failureReason: 'blocked by a proxy' };
    assert.throws(() => assertEndpointMeasurement(e), /must be null when status is failed/);
    e.roundTripMs = null;
    assert.doesNotThrow(() => assertEndpointMeasurement(e));
    e.failureReason = '';
    assert.throws(() => assertEndpointMeasurement(e), /failureReason: required/);
  });

  test('a host outside the declared set is refused', () => {
    const r = goodRun();
    r.endpoints[0].host = 'evil.example.com';
    assert.throws(() => assertMeasurementRun(r), /not in MEASUREMENT_HOSTS/);
  });

  test('a coordinate only row can never be measured', () => {
    const e = goodEndpoint();
    e.endpointId = 'gcp:europe-west3';
    assert.throws(() => assertEndpointMeasurement(e), /coordinate only row and is never measured/);
  });

  test('hostsContacted cannot understate what was reached', () => {
    const r = goodRun();
    r.hostsContacted = ['not.in.the.allowlist'];
    assert.throws(() => assertMeasurementRun(r), /contacted a host that is not declared/);
    r.hostsContacted = hostsContactedFrom(r.endpoints);
    assert.doesNotThrow(() => assertMeasurementRun(r));
  });

  test('the shape has no visitor IP field and no connection phase fields', () => {
    const r = assertMeasurementRun(goodRun());
    assert.ok(!('clientIp' in r.observer), 'the visitor address must not be a field in a serialisable run');
    assert.ok(!('ip' in r.observer));
    for (const k of ['dnsMs', 'tlsMs', 'connectMs', 'ttfbMs']) {
      assert.ok(!(k in r.endpoints[0]),
        k + ' must not exist: for a cross origin resource with no Timing-Allow-Origin header the '
        + 'spec zeroes it, and a field that can only hold zero invites publishing a zero');
    }
  });
});

/* ---------------------------------------------------------------------------------------- */

describe('decomposition contract', () => {
  test('the verdict thresholds are exactly the published ones', () => {
    assert.equal(verdictFor(1.00), 'AT_FLOOR');
    assert.equal(verdictFor(1.15), 'AT_FLOOR');
    assert.equal(verdictFor(1.1500001), 'NORMAL');
    assert.equal(verdictFor(1.6), 'NORMAL');
    assert.equal(verdictFor(1.6000001), 'ON_THE_TABLE');
    assert.equal(verdictFor(20.07), 'ON_THE_TABLE');
  });

  test('the three verdict sentences are fixed and there is no fourth', () => {
    assert.equal(Object.keys(VERDICT_TEXT).length, 3);
    for (const v of Object.values(VERDICT_TEXT)) assert.ok(v.length > 20);
  });

  test('no ratio exists below 500 km (trap 2)', () => {
    assert.equal(ratioIsMeaningful(83), false);
    assert.equal(ratioIsMeaningful(499.99), false);
    assert.equal(ratioIsMeaningful(500), true);
  });

  test('a faster than light row is refused as a result', () => {
    const row = {
      endpointId: 'aws:eu-west-2', distanceKm: 5900, floorMs: 57.8,
      roundTripMs: 0.129, accessMs: 0, routeMs: -57.671,
      routeRatio: null, ratioSuppressedReason: null, verdict: null, msOnTheTable: null, defect: null,
    };
    assert.throws(() => assertRowDecomposition(row, 0), /faster than light for the stated geography/);
    row.defect = { kind: 'faster-than-light', detail: 'anycast routed the request to a local node' };
    assert.doesNotThrow(() => assertRowDecomposition(row, 0));
  });

  test('a negative access baseline is refused', () => {
    assert.throws(
      () => assertDecompositionRun({ schema: DECOMPOSITION_SCHEMA, accessMs: -1, accessFromEndpointId: 'x', rows: [], defects: [], unstableCount: 0, unusableCount: 0 }),
      /must be a finite number >= 0/,
    );
  });

  test('the access baseline must be the MINIMUM surplus, not a mean and not the nearest row', () => {
    const mk = (id, km, rt, access) => {
      const floorMs = floorMsForDistanceKm(km);
      const routeMs = rt - floorMs - access;
      const ratio = km >= 500 ? (rt - access) / floorMs : null;
      return {
        endpointId: id, distanceKm: km, floorMs, roundTripMs: rt, accessMs: access, routeMs,
        routeRatio: ratio, ratioSuppressedReason: ratio === null ? RATIO_SUPPRESSED_REASON : null,
        verdict: ratio === null ? null : verdictFor(ratio),
        msOnTheTable: ratio !== null && verdictFor(ratio) === 'ON_THE_TABLE' ? Math.round(routeMs - 0.15 * floorMs) : null,
        defect: null,
      };
    };
    const access = 8;
    const run = {
      schema: DECOMPOSITION_SCHEMA, accessMs: access, accessFromEndpointId: 'aws:eu-west-2',
      rows: [mk('aws:eu-west-2', 5900, floorMsForDistanceKm(5900) + access, access),
        mk('aws:ap-south-1', 12924, floorMsForDistanceKm(12924) + access + 100, access)],
      defects: [], unstableCount: 0, unusableCount: 0,
    };
    assert.doesNotThrow(() => assertDecompositionRun(run));

    // Now claim a baseline that is not the minimum, with everything downstream recomputed
    // CONSISTENTLY from it, so the only thing wrong with the run is the baseline itself. This
    // is the shape the mistake actually takes: somebody swaps min for mean, the arithmetic all
    // still ties out, and nothing but this check notices.
    const wrongAccess = 20;
    const wrong = {
      ...run,
      accessMs: wrongAccess,
      rows: run.rows.map((r) => {
        const routeMs = r.roundTripMs - r.floorMs - wrongAccess;
        const ratio = r.distanceKm >= 500 ? (r.roundTripMs - wrongAccess) / r.floorMs : null;
        const verdict = ratio === null ? null : verdictFor(ratio);
        return {
          ...r,
          accessMs: wrongAccess,
          routeMs,
          routeRatio: ratio,
          verdict,
          msOnTheTable: verdict === 'ON_THE_TABLE' ? Math.round(routeMs - 0.15 * r.floorMs) : null,
        };
      }),
    };
    assert.throws(() => assertDecompositionRun(wrong), /must be the MINIMUM surplus/);
  });

  test('display segments always sum exactly to the displayed total', () => {
    // The rounding trap: three parts that each round down leave the bar one millisecond short
    // of the total printed beside it.
    const cases = [
      { floorMs: 126.594, accessMs: 8.39, routeMs: 116.466, roundTripMs: 251.45 },
      { floorMs: 0.8103, accessMs: 8.3897, routeMs: 0, roundTripMs: 9.2 },
      { floorMs: 64.669, accessMs: 8.39, routeMs: 18.821, roundTripMs: 91.88 },
      { floorMs: 0.5, accessMs: 0.5, routeMs: 0.5, roundTripMs: 1.5 },
      { floorMs: 0.4, accessMs: 0.4, routeMs: 0.4, roundTripMs: 1.2 },
    ];
    for (const c of cases) {
      const s = displaySegments(c);
      assert.equal(s.physicsMs + s.accessMs + s.routeMs, s.totalMs,
        JSON.stringify(c) + ' produced segments that do not sum to the total');
      assert.equal(s.totalMs, Math.round(c.roundTripMs));
    }
  });

  test('display segments refuse to paper over a broken identity', () => {
    assert.throws(
      () => displaySegments({ floorMs: 10, accessMs: 10, routeMs: 10, roundTripMs: 100 }),
      /do not sum to the rounded total/,
    );
  });
});

/* ---------------------------------------------------------------------------------------- */

describe('the capture fixture, run through the real decomposition contract', () => {
  // The design's own Appendix B distances were taken from the recording machine's position, which
  // is not in this repository. The same minimums are run here from the bundled city centre the
  // capture fixture ships, and every figure is checked against the independent derivation.
  const hc = hand.cases.captureFixture;
  const obs = hc.observer;

  // Build the run exactly as the decomposition team will: floors from coordinates, the access
  // baseline as the minimum surplus, route as the remainder.
  const base = hc.input.map((r) => {
    const distanceKm = greatCircleKm(obs, { lat: r.lat, lon: r.lon });
    return { endpointId: r.endpointId, distanceKm, floorMs: floorMsForDistanceKm(distanceKm), roundTripMs: r.measuredMs };
  });
  const accessMs = Math.min(...base.map((x) => x.roundTripMs - x.floorMs));
  const accessFrom = base.find((x) => near(x.roundTripMs - x.floorMs, accessMs, 1e-12));

  const rows = base.map((x) => {
    const routeMs = x.roundTripMs - x.floorMs - accessMs;
    const meaningful = ratioIsMeaningful(x.distanceKm);
    const routeRatio = meaningful ? (x.roundTripMs - accessMs) / x.floorMs : null;
    const verdict = routeRatio === null ? null : verdictFor(routeRatio);
    return {
      endpointId: x.endpointId,
      distanceKm: x.distanceKm,
      floorMs: x.floorMs,
      roundTripMs: x.roundTripMs,
      accessMs,
      routeMs,
      routeRatio,
      ratioSuppressedReason: meaningful ? null : RATIO_SUPPRESSED_REASON,
      verdict,
      msOnTheTable: verdict === 'ON_THE_TABLE' ? Math.round(routeMs - 0.15 * x.floorMs) : null,
      defect: null,
    };
  });

  const run = {
    schema: DECOMPOSITION_SCHEMA,
    accessMs,
    accessFromEndpointId: accessFrom.endpointId,
    rows,
    defects: [],
    unstableCount: 0,
    unusableCount: 0,
  };

  test('the whole run validates against the contract', () => {
    assert.doesNotThrow(() => assertDecompositionRun(run));
  });

  test('the access baseline is the independently derived value, from the nearest region', () => {
    assert.ok(near(accessMs, hc.expected.accessMs, 1e-9),
      'access baseline recomputed to ' + accessMs + ' ms, independent derivation ' + hc.expected.accessMs);
    assert.equal(run.accessFromEndpointId, hc.expected.accessFromEndpointId);
  });

  test('the endpoint that sets the baseline has a route surplus of exactly zero, by construction', () => {
    const setter = rows.find((r) => r.endpointId === run.accessFromEndpointId);
    assert.ok(Math.abs(setter.routeMs) < 1e-9, 'route surplus was ' + setter.routeMs);
  });

  for (const want of hc.expected.rows) {
    test(want.endpointId + ': route, ratio and verdict match the independent derivation', () => {
      const got = rows.find((x) => x.endpointId === want.endpointId);
      assert.ok(near(got.routeMs, want.routeMs, 1e-9),
        want.endpointId + ': route recomputed to ' + got.routeMs + ' ms, independent ' + want.routeMs);
      assert.equal(got.msOnTheTable, want.msOnTheTable);
      if (want.routeRatio === null) {
        assert.ok(got.distanceKm < 500);
        assert.equal(got.routeRatio, null, want.endpointId + ': no ratio may be rendered under 500 km');
        assert.equal(got.verdict, null);
        assert.equal(got.ratioSuppressedReason, RATIO_SUPPRESSED_REASON);
      } else {
        assert.ok(near(got.routeRatio, want.routeRatio, 1e-9),
          want.endpointId + ': ratio recomputed to ' + got.routeRatio + 'x, independent ' + want.routeRatio);
        assert.equal(got.verdict, want.verdict);
      }
    });
  }

  test('the baseline row shares the observer city centre: 0 km, a 0 ms floor, all of it access', () => {
    const setter = rows.find((r) => r.endpointId === run.accessFromEndpointId);
    assert.equal(setter.distanceKm, 0);
    assert.equal(setter.floorMs, 0);
    assert.equal(accessMs, setter.roundTripMs);
    assert.equal(hc.expected.rows.find((r) => r.endpointId === setter.endpointId).naiveRatio, null,
      'a naive ratio over a zero floor is not a number, and the independent derivation says so');
  });

  test('the naive ratio the decomposition exists to defeat is absurd on a short row, and 1.00x decomposed', () => {
    // DESIGN A3: this is the number every research lens would have shipped. The equatorial case
    // of the independent derivation has the short row: 55.6 km, a 12 ms round trip, a floor
    // under 1 ms. Its naive ratio is recomputed here and must match; the decomposed ratio for
    // the same row must come out at exactly 1.00x, because that row sets the baseline.
    const eq = hand.cases.equatorial;
    const inRow = eq.input.find((r) => r.endpointId === 'aws:us-east-1');
    const want = eq.expected.rows.find((r) => r.endpointId === 'aws:us-east-1');
    const floor = floorMsForDistanceKm(greatCircleKm(eq.observer, { lat: inRow.lat, lon: inRow.lon }));
    const naive = inRow.measuredMs / floor;
    assert.ok(near(naive, want.naiveRatio, 1e-9), 'naive ratio ' + naive + ', independent ' + want.naiveRatio);
    assert.ok(naive > 20, 'and it is absurd, which is the point');
    assert.equal(eq.expected.accessFromEndpointId, 'aws:us-east-1');
    assert.equal(Number(((inRow.measuredMs - eq.expected.accessMs) / floor).toFixed(2)), 1.00);
  });

  test('every row satisfies the decomposition identity at display precision too', () => {
    for (const r of rows) {
      const s = displaySegments(r);
      assert.equal(s.physicsMs + s.accessMs + s.routeMs, s.totalMs, r.endpointId);
    }
  });

  test('no row is faster than light', () => {
    for (const r of rows) assert.ok(r.roundTripMs >= r.floorMs, r.endpointId + ' beat its own floor');
  });

  test('the median route ratio falls inside the 1.2x to 3.5x band the design gates on', () => {
    // DESIGN 7.2: if a build produces a median outside this band, the build stops and a human
    // looks at it. The rendered ratios are used, so the short row is correctly excluded.
    const ratios = rows.map((r) => r.routeRatio).filter((x) => x !== null).sort((a, b2) => a - b2);
    const mid = ratios.length % 2 ? ratios[(ratios.length - 1) / 2]
      : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2;
    assert.ok(mid >= 1.2 && mid <= 3.5, 'median route ratio is ' + mid.toFixed(3) + 'x, outside 1.2x to 3.5x');
  });
});

/* ---------------------------------------------------------------------------------------- */

describe('globe input contract', () => {
  const observer = { lat: 38.9445, lon: -77.4558, label: 'Washington DC area (IAD)' };
  const arc = (id, state = 'idle', progress = 1) => ({
    endpointId: id, from: { ...observer }, to: { lat: 19.0758, lon: 72.8775 },
    state, progress, label: 'Great circle to Mumbai',
  });
  const good = () => ({
    schema: GLOBE_INPUT_SCHEMA, observer: { ...observer }, arcs: [arc('aws:ap-south-1')],
    theme: 'dark', reducedMotion: false, idle: true, devicePixelRatioCap: 2,
    bloomEnabled: false, ariaSummary: 'A dark globe with one arc to Mumbai.',
  });

  test('a well formed input validates', () => {
    assert.doesNotThrow(() => assertGlobeInput(good()));
  });

  test('an arc may not carry intermediate points, because that would be a route claim', () => {
    const g = good();
    g.arcs[0].waypoints = [{ lat: 30, lon: 20 }];
    assert.throws(() => assertGlobeInput(g), /carries no intermediate points/);
    delete g.arcs[0].waypoints;
    g.arcs[0].route = 'via Marseille';
    assert.throws(() => assertGlobeInput(g), /carries no intermediate points/);
  });

  test('every arc starts at the single observer point', () => {
    const g = good();
    g.arcs.push({ ...arc('aws:eu-west-2'), from: { lat: 0, lon: 0 } });
    assert.throws(() => assertGlobeInput(g), /every arc starts at the single observer point/);
  });

  test('at most one arc may be the worst offender', () => {
    const g = good();
    g.arcs = [arc('aws:ap-south-1', 'worst'), arc('aws:eu-west-2', 'worst')];
    assert.throws(() => assertGlobeInput(g), /at most one arc may be "worst"/);
  });

  test('reduced motion cuts to the final state rather than animating slowly', () => {
    const g = good();
    g.reducedMotion = true;
    g.arcs[0].progress = 0.4;
    assert.throws(() => assertGlobeInput(g), /must already be at progress 1/);
  });

  test('the device pixel ratio is capped at 2', () => {
    const g = good();
    g.devicePixelRatioCap = 3;
    assert.throws(() => assertGlobeInput(g), /must be in \(0, 2\]/);
  });

  test('the canvas must carry a text alternative', () => {
    const g = good();
    g.ariaSummary = '';
    assert.throws(() => assertGlobeInput(g), /ariaSummary: required/);
  });

  test('the render rules ban gl.LINES and photographic earth textures', () => {
    assert.equal(RENDER_RULES.useLineDrawMode, false);
    assert.equal(RENDER_RULES.earthTexture, null);
    assert.equal(RENDER_RULES.arcDepthTest, true);
    assert.ok(RENDER_RULES.arcRadius > 1, 'arcs sit just above the sphere so the limb occludes them');
  });
});

/* ---------------------------------------------------------------------------------------- */

describe('view model contract', () => {
  const cells = () => ({
    distance: computed(12923.9, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 0 }),
    roundTrip: measured(251.45, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP),
    physics: computed(126.59, UNITS.MS, METHODS.FIBRE_FLOOR),
    access: measured(8.39, UNITS.MS, METHODS.ACCESS_BASELINE),
    route: measured(116.47, UNITS.MS, METHODS.ROUTE_SURPLUS),
    ratio: computed(1.92, UNITS.RATIO, METHODS.ROUTE_RATIO, { decimals: 2 }),
  });
  const row = () => ({
    endpointId: 'aws:ap-south-1', regionCode: 'ap-south-1',
    regionName: 'Asia Pacific (Mumbai)', city: 'Mumbai',
    cells: cells(),
    verdictText: VERDICT_TEXT.ON_THE_TABLE,
    suppressedReason: null,
    segments: { physicsMs: 127, accessMs: 8, routeMs: 116, totalMs: 251 },
    coordinateNote: 'The provider publishes a city, not a building.',
  });
  const good = (state = 'done') => ({
    schema: VIEW_MODEL_SCHEMA,
    state,
    consentSentence: 'This makes 7 small HTTPS requests to each of 12 public cloud endpoints.',
    destinationHosts: [...MEASUREMENT_HOSTS],
    preMeasurement: {
      sentence: 'Light in glass cannot make that round trip in under 127 ms.',
      distance: computed(12923.9, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 0 }),
      floor: computed(126.59, UNITS.MS, METHODS.FIBRE_FLOOR),
    },
    rows: state === 'idle' ? [] : [row()],
    headline: state === 'idle' ? null : { sentence: 'Mumbai costs you 251 ms.', cells: cells() },
    selfTest: [{ label: 'constant', passed: true, detail: '204190.5 km/s' }],
    sources: [{ id: 'si_metre', attribution: 'SI definition of the metre.', url: 'https://www.bipm.org/' }],
    defectCount: 0,
    unstableCount: 0,
  });

  test('a well formed model validates, in both the idle and the done state', () => {
    assert.doesNotThrow(() => assertViewModel(good('done')));
    assert.doesNotThrow(() => assertViewModel(good('idle')));
  });

  test('A BARE NUMBER IN A CELL IS REFUSED. This is the rule the shape exists for.', () => {
    const vm = good();
    vm.rows[0].cells.route = 116.47;
    assert.throws(() => assertViewModel(vm), /got a bare number/);
  });

  test('a preformatted string is refused too, because it carries no badge either', () => {
    const vm = good();
    vm.rows[0].cells.route = '116 ms';
    assert.throws(() => assertViewModel(vm), /got a bare string/);
  });

  test('an object that merely looks like a Claim is refused', () => {
    const vm = good();
    vm.rows[0].cells.route = {
      value: 116.47, unit: 'ms', badge: 'MEASURED', method: METHODS.ROUTE_SURPLUS,
      sourceId: null, decimals: null, note: null,
    };
    assert.throws(() => assertViewModel(vm), /expected a Claim/);
  });

  test('the idle state has touched the network zero times, so it has no rows and no headline', () => {
    const vm = good('idle');
    vm.rows = [row()];
    assert.throws(() => assertViewModel(vm), /in the idle state nothing has touched the network/);
  });

  test('a reader who never clicks still gets the pre measurement fact', () => {
    const vm = good('idle');
    vm.preMeasurement = null;
    assert.throws(() => assertViewModel(vm), /required in every state, including idle/);
  });

  test('the consent sentence and the destination list are required before any click', () => {
    const vm = good('idle');
    vm.consentSentence = '';
    assert.throws(() => assertViewModel(vm), /consentSentence: required/);
    const vm2 = good('idle');
    vm2.destinationHosts = [];
    assert.throws(() => assertViewModel(vm2), /destinationHosts: required and non empty/);
  });

  test('a row with no ratio must say why, and gets no verdict', () => {
    const vm = good();
    vm.rows[0].cells.ratio = null;
    vm.rows[0].suppressedReason = null;
    assert.throws(() => assertViewModel(vm), /suppressedReason: required when no ratio is shown/);
    vm.rows[0].suppressedReason = RATIO_SUPPRESSED_REASON;
    assert.throws(() => assertViewModel(vm), /a row with no ratio gets no verdict/);
    vm.rows[0].verdictText = null;
    assert.doesNotThrow(() => assertViewModel(vm));
  });

  test('segments that do not sum to the displayed total are refused', () => {
    const vm = good();
    vm.rows[0].segments = { physicsMs: 127, accessMs: 8, routeMs: 116, totalMs: 252 };
    assert.throws(() => assertViewModel(vm), /must sum EXACTLY to the/);
  });

  test('defect and unstable counts are surfaced, not hidden', () => {
    const vm = good();
    vm.defectCount = -1;
    assert.throws(() => assertViewModel(vm), /non negative integer/);
  });

  test('allClaims finds every rendered value, and every one of them is a real Claim', () => {
    const vm = assertViewModel(good());
    const claims = allClaims(vm);
    assert.ok(claims.length >= 12, 'expected every cell plus the headline, got ' + claims.length);
    for (const c of claims) assert.ok(isClaim(c));
  });

  test('an INFERRED cell carries its assumption, so the model cannot hold a bare inference', () => {
    assert.throws(
      () => inferred(1.13, UNITS.RATIO, METHODS.ROUTE_ADJUSTED_FLOOR, {}),
      /must carry a note stating its assumption/,
    );
  });

  test('the shipped measured endpoint count matches what the consent sentence promises', () => {
    assert.equal(MEASURED_ENDPOINTS.length, 12);
    assert.ok(good().consentSentence.includes('12'));
  });
});
