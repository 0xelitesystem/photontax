// Builds test/fixtures/measure-hand-computed.json for the photontax measurement engine.
//
// Everything here is computed by a method that is INDEPENDENT of the product code:
//   distance   spherical law of cosines, not the haversine the product uses
//   floor      written out longhand from the SI constant and the group index
//   segments   largest remainder apportionment written again from scratch
// If the two implementations agree to 1e-9 the product arithmetic is not merely self consistent.
//
// The shipped endpoint table is read as DATA for the capture case (its coordinates), and none of
// its code or the product arithmetic is used. That keeps this case pinned to what the page ships.

import { writeFileSync } from 'node:fs';
import { endpointById } from '../src/core/data/endpoints.js';

const R = 6371.0088;
const C = 299792458;
const NG = 1.4682;
const V = C / NG / 1000;                 // km/s
const rad = (d) => (d * Math.PI) / 180;

// Independent distance: spherical law of cosines.
function slcKm(a, b) {
  const p1 = rad(a.lat); const p2 = rad(b.lat);
  const dl = rad(b.lon - a.lon);
  const x = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return R * Math.acos(Math.min(1, Math.max(-1, x)));
}
const floorMs = (km) => (2 * km) / V * 1000;

// Independent largest remainder apportionment.
function segments(floor, access, route, total) {
  const t = Math.round(total);
  const parts = [['physicsMs', floor], ['accessMs', access], ['routeMs', route]];
  const base = parts.map(([k, v]) => [k, Math.floor(v), v - Math.floor(v)]);
  let left = t - base.reduce((s, p) => s + p[1], 0);
  const out = {};
  for (const [k, b] of base) out[k] = b;
  for (const [k] of [...base].sort((a, b) => b[2] - a[2])) {
    if (left <= 0) break;
    out[k] += 1;
    left -= 1;
  }
  out.totalMs = t;
  return out;
}

function verdict(ratio) {
  if (ratio <= 1.15) return 'AT_FLOOR';
  if (ratio <= 1.6) return 'NORMAL';
  return 'ON_THE_TABLE';
}

function decompose(observer, rows) {
  const enriched = rows.map((r) => {
    const distanceKm = slcKm(observer, { lat: r.lat, lon: r.lon });
    return { ...r, distanceKm, floorMs: floorMs(distanceKm) };
  });
  const survivors = enriched.filter((r) => r.measuredMs >= r.floorMs);
  const defects = enriched.filter((r) => r.measuredMs < r.floorMs);
  const surpluses = survivors.map((r) => r.measuredMs - r.floorMs);
  const accessMs = Math.min(...surpluses);
  const setter = survivors[surpluses.indexOf(accessMs)];
  const out = survivors.map((r) => {
    const routeMs = r.measuredMs - r.floorMs - accessMs;
    const meaningful = r.distanceKm >= 500;
    const routeRatio = meaningful ? (r.measuredMs - accessMs) / r.floorMs : null;
    const v = routeRatio === null ? null : verdict(routeRatio);
    return {
      endpointId: r.endpointId,
      distanceKm: r.distanceKm,
      floorMs: r.floorMs,
      roundTripMs: r.measuredMs,
      accessMs,
      routeMs,
      routeRatio,
      verdict: v,
      msOnTheTable: v === 'ON_THE_TABLE' ? Math.round(routeMs - 0.15 * r.floorMs) : null,
      // A zero floor (the observer is the region's own city centre) has no naive ratio at all.
      naiveRatio: r.floorMs > 0 ? r.measuredMs / r.floorMs : null,
      displaySegments: segments(r.floorMs, accessMs, routeMs, r.measuredMs),
    };
  });
  return {
    accessMs,
    accessFromEndpointId: setter.endpointId,
    accessIfDefectsNotScreened: Math.min(...enriched.map((r) => r.measuredMs - r.floorMs)),
    rows: out,
    defects: defects.map((r) => ({
      endpointId: r.endpointId, distanceKm: r.distanceKm, floorMs: r.floorMs, roundTripMs: r.measuredMs,
    })),
  };
}

/* ---- case 1: the capture fixture, exactly as ?fixture=1 shows it ----
   The figures are the TCP connect minimums DESIGN Appendix B publishes, typed here again from
   the design rather than imported from src/ui/fixture.js, so a slip in either copy fails a test.
   The region coordinates are the shipped ones, and the observer is the bundled Ashburn, Virginia
   city centre the fixture uses. The recording machine's own position is not in this repository,
   so the design's own distances, which were taken from it, are not reproduced here. */
const shipped = (id) => {
  const e = endpointById(id);
  if (!e) throw new Error('derive-measure-fixture: ' + id + ' is not in the shipped table');
  return { lat: e.lat, lon: e.lon };
};
const captureObserver = shipped('aws:us-east-1');
const captureRows = [
  { endpointId: 'aws:us-east-1', ...shipped('aws:us-east-1'), measuredMs: 9.20 },
  { endpointId: 'aws:eu-central-1', ...shipped('aws:eu-central-1'), measuredMs: 91.88 },
  { endpointId: 'aws:sa-east-1', ...shipped('aws:sa-east-1'), measuredMs: 124.17 },
  { endpointId: 'aws:ap-northeast-1', ...shipped('aws:ap-northeast-1'), measuredMs: 184.51 },
  { endpointId: 'aws:ap-south-1', ...shipped('aws:ap-south-1'), measuredMs: 251.45 },
  { endpointId: 'aws:ap-southeast-2', ...shipped('aws:ap-southeast-2'), measuredMs: 204.59 },
];

/* ---- case 2: equatorial synthetic, where the great circle has a closed form ----
   Two points on the equator separated by L degrees are R * L radians apart, exactly.
   That makes every distance here checkable on paper with no trigonometry at all. */
const equatorObserver = { lat: 0, lon: 0 };
const equatorRows = [
  // Under 500 km, and the access baseline sits far above its own floor. This is the trap 2 case.
  { endpointId: 'aws:us-east-1', lat: 0, lon: 0.5, measuredMs: 12.0 },
  // 1112 km. Comfortably above the gate.
  { endpointId: 'aws:eu-west-2', lat: 0, lon: 10, measuredMs: 30.0 },
  // 5004 km.
  { endpointId: 'aws:eu-central-1', lat: 0, lon: 45, measuredMs: 68.0 },
  // 6672 km. Sits inside cable geometry itself, so the verdict is that there is nothing to win.
  { endpointId: 'aws:il-central-1', lat: 0, lon: 60, measuredMs: 80.0 },
  // 10008 km.
  { endpointId: 'aws:ap-south-1', lat: 0, lon: 90, measuredMs: 220.0 },
  // 5004 km claimed, answered in 5 ms. Impossible, and it must not touch the baseline.
  { endpointId: 'aws:sa-east-1', lat: 0, lon: -45, measuredMs: 5.0 },
];

const fixture = {
  _what: 'Hand computed expectations for the photontax measurement engine. Every value was '
    + 'produced by an implementation independent of the product: the spherical law of cosines '
    + 'rather than the haversine, the floor written out longhand from the SI constant and the '
    + 'group index, and the largest remainder apportionment written again from scratch. Two '
    + 'independent implementations agreeing to 1e-9 is evidence. One implementation agreeing '
    + 'with itself is not.',
  _generatedBy: 'scripts/derive-measure-fixture.mjs (npm run fixture:measure). npm run '
    + 'fixture:check proves the committed file is exactly its output.',
  constants: { earthRadiusKm: R, cVacuumMS: C, groupIndex: NG, vFibreKmS: V },
  cases: {
    captureFixture: {
      _what: 'The capture fixture as the page renders it: the TCP connect minimums DESIGN '
        + 'Appendix B publishes, against the shipped region coordinates, observed from the '
        + 'bundled Ashburn, Virginia city centre. The us-east-1 row shares that centre, so it is '
        + '0 km with a 0 ms floor and no naive ratio: all of its figure is access, and it sets '
        + 'the baseline.',
      observer: captureObserver,
      input: captureRows,
      expected: decompose(captureObserver, captureRows),
    },
    equatorial: {
      _what: 'Synthetic, on the equator, where the great circle is R times the longitude '
        + 'difference in radians and needs no trigonometry to check. Covers the short distance '
        + 'gate, an access baseline larger than the floor it sits on, all three verdicts, and a '
        + 'faster than light row that must be screened out before the baseline is taken.',
      observer: equatorObserver,
      input: equatorRows,
      closedFormDistances: equatorRows.map((r) => ({
        endpointId: r.endpointId,
        degrees: r.lon,
        km: R * rad(Math.abs(r.lon)),
      })),
      expected: decompose(equatorObserver, equatorRows),
    },
  },
};

// Default to the file the test suite reads, so regenerating it is one command with no
// argument to get wrong. Pass a path to write somewhere else. `--check` writes nothing and
// fails if the committed fixture is not what this script produces, which is what makes the
// fixture auditable from a clone rather than a file somebody has to trust.
const OUT_DEFAULT = new URL('../test/fixtures/measure-hand-computed.json', import.meta.url);
const text = JSON.stringify(fixture, null, 2) + '\n';
const arg = process.argv[2];

if (arg === '--check') {
  const { readFileSync } = await import('node:fs');
  const current = readFileSync(OUT_DEFAULT, 'utf8');
  if (current !== text) {
    console.error('derive-measure-fixture: test/fixtures/measure-hand-computed.json is not what '
      + 'this script produces. Run it without --check and review the diff.');
    process.exit(1);
  }
  console.log('  PASS  the committed measurement fixture is reproducible from this script');
  process.exit(0);
}

const out = arg ? arg : OUT_DEFAULT;
writeFileSync(out, text);
console.log(JSON.stringify(fixture.cases.captureFixture.expected, null, 2));
console.log('---- equatorial ----');
console.log(JSON.stringify(fixture.cases.equatorial.expected, null, 2));
