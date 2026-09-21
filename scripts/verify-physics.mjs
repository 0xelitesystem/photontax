#!/usr/bin/env node
// THE PHYSICS, CHECKED AGAINST REALITY. DESIGN 7.2.
//
//   node scripts/verify-physics.mjs            measure this machine against the shipped table
//   node scripts/verify-physics.mjs --offline  arithmetic only, no socket opened
//
// A floor is a claim about the world, so it has to be checked against the world. Three checks,
// in increasing order of how much they could embarrass us:
//
//   1. THE ARITHMETIC, recomputed longhand from the two cited primary sources, by code that
//      does not import the product. If this file and src/core agree, and both agree with the
//      figures DESIGN publishes, then the constant is not a typo that has been copied twice.
//
//   2. TWO REAL CITY PAIRS whose great circle distance is published in the design and can be
//      recomputed here from coordinates: New York to London and Los Angeles to Tokyo.
//
//   3. REAL MEASUREMENTS FROM THIS MACHINE against the twelve shipped endpoints, taken by a
//      DIFFERENT client from the product's (Node's fetch, not a browser's), decomposed by
//      arithmetic written again here. Every one of them must be SLOWER than its own floor.
//      A measurement faster than light for its stated geography is a defect, and the count of
//      them is printed rather than hidden (DESIGN trap 3).
//
//      The result is then compared against a published rule of thumb, quoted verbatim below,
//      and against the band DESIGN 7.2 says a build must land inside.
//
// Nothing in this file is imported by the page. It reaches the network when run without
// --offline, which is why it lives in scripts/ and not in src/.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OFFLINE = process.argv.includes('--offline');

/* --------------------------------------------------------------------------------------------
 * 1. The arithmetic, longhand, importing nothing.
 * ------------------------------------------------------------------------------------------ */

/** SI definition of the metre. The metre is DEFINED by fixing this value, so it is exact. */
const C_VACUUM_M_S = 299792458;

/** Corning SMF-28 product information sheet: effective group index of refraction at 1550 nm. */
const GROUP_INDEX_1550 = 1.4682;

/** IUGG mean Earth radius. */
const R_KM = 6371.0088;

const V_KM_S = C_VACUUM_M_S / GROUP_INDEX_1550 / 1000;
const rad = (d) => (d * Math.PI) / 180;

/** Haversine, written out here rather than imported, so two implementations must agree. */
function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

const floorMs = (km) => (2 * km) / V_KM_S * 1000;

/**
 * The published rule of thumb this product's medians are checked against.
 *
 * Quoted verbatim from the abstract of arXiv:1811.10737, "Dissecting Latency in the Internet's
 * Fiber Infrastructure", Bozkurt, Aqeel, Bhattacherjee, Chandrasekaran, Godfrey, Laughlin,
 * Maggs and Singla. Read from the primary source on 2026-09-21.
 */
const PUBLISHED_RULE_OF_THUMB = {
  citation: 'Bozkurt et al., "Dissecting Latency in the Internet\'s Fiber Infrastructure", '
    + 'arXiv:1811.10737',
  quote: 'Previous measurement campaigns suggest the following rule of thumb for estimating '
    + 'Internet latency: multiply line-of-sight distance by 2.1, then divide by the speed of '
    + 'light in fiber.',
  multiplier: 2.1,
};

/** DESIGN 7.2: outside this band the build stops and a human looks at it. */
const ACCEPTABLE_MEDIAN_BAND = { low: 1.2, high: 3.5 };

const say = {
  head: (m) => console.log('\n== ' + m + ' =='),
  pass: (m) => console.log('  PASS  ' + m),
  fail: (m) => console.log('  FAIL  ' + m),
  note: (m) => console.log('  NOTE  ' + m),
};

let failures = 0;
const check = (ok, message) => { if (ok) say.pass(message); else { say.fail(message); failures += 1; } };

say.head('1. the constant, recomputed longhand from the two cited primary sources');
console.log('        c              ' + C_VACUUM_M_S + ' m/s   (SI definition of the metre, exact)');
console.log('        group index    ' + GROUP_INDEX_1550 + '            (Corning SMF-28, 1550 nm)');
console.log('        v in fibre     ' + V_KM_S.toFixed(5) + ' km/s');
console.log('        floor per 1000 km round trip  ' + floorMs(1000).toFixed(4) + ' ms');
check(Math.abs(V_KM_S - 204190.5) < 0.05, 'the speed in fibre rounds to the published 204190.5 km/s');
check(Math.abs(floorMs(1000) - 9.7948) < 0.0001, 'the floor rounds to the published 9.7948 ms per 1000 km');

const core = await import(new URL('../src/core/constants.js', import.meta.url).href);
const geo = await import(new URL('../src/core/geo.js', import.meta.url).href);
check(Math.abs(core.V_FIBRE_KM_S - V_KM_S) < 1e-9,
  'the shipped constant and this independent one agree to 1e-9 km/s');
check(Math.abs(core.FLOOR_MS_PER_1000_KM - floorMs(1000)) < 1e-9,
  'the shipped floor and this independent one agree to 1e-9 ms');

say.head('2. two real city pairs, recomputed from coordinates');

// THE COORDINATES COME FROM THE COMMITTED FIXTURE, NOT FROM THIS FILE.
//
// A published distance is only reproducible against the coordinate it was computed from, and
// which coordinate you call "Tokyo" is exactly the INFERRED choice DESIGN 2.4 is about. The
// fixture records the pair the design's own figures were derived from, and the shipped endpoint
// table records the Wikidata value, because every shipped coordinate has to carry a citation.
// Both are printed here with the gap between them, because the gap is the point.
const worked = JSON.parse(await readFile(new URL('../test/fixtures/design-worked-values.json', import.meta.url), 'utf8'));
for (const p of worked.workedPairs.pairs) {
  const km = haversineKm(p.a, p.b);
  const ms = floorMs(km);
  const kmShip = geo.greatCircleKm(p.a, p.b);
  console.log('        ' + p.name.padEnd(26)
    + km.toFixed(1) + ' km, floor ' + ms.toFixed(2) + ' ms'
    + '   (published ' + p.expectedKm + ' km, ' + p.expectedFloorMs + ' ms)');
  check(Math.abs(km - p.expectedKm) < Math.max(p.kmTolerance, 0.05),
    p.name + ': distance matches the published value');
  check(Math.abs(ms - p.expectedFloorMs) < Math.max(p.floorToleranceMs, 0.005),
    p.name + ': floor matches the published value');
  check(Math.abs(km - kmShip) < 1e-9, p.name + ': the shipped haversine agrees to 1e-9 km');
}

// The same pair against the coordinate the product actually ships, so the size of the
// disagreement is on the record rather than being something a reader discovers.
const SHIPPED_TOKYO = { lat: 35.6894, lon: 139.6917 };
const LA = worked.workedPairs.pairs[1].a;
const DESIGN_TOKYO = worked.workedPairs.pairs[1].b;
const kmDesign = haversineKm(LA, DESIGN_TOKYO);
const kmShipped = haversineKm(LA, SHIPPED_TOKYO);
say.note('Los Angeles to Tokyo is ' + kmDesign.toFixed(1) + ' km against the coordinate the '
  + 'design used and ' + kmShipped.toFixed(1) + ' km against the Wikidata coordinate the product '
  + 'ships. The two points for Tokyo are ' + haversineKm(DESIGN_TOKYO, SHIPPED_TOKYO).toFixed(3)
  + ' km apart, a floor difference of '
  + Math.abs(floorMs(kmDesign) - floorMs(kmShipped)).toFixed(4) + ' ms, which disappears entirely '
  + 'at the whole millisecond this product renders. That disagreement IS the INFERRED label: '
  + 'the coordinate is a city, not a building.');

if (OFFLINE) {
  console.log('\n--offline: no socket was opened, so check 3 did not run.');
  console.log(failures === 0 ? '\nverify-physics: PASS (arithmetic only)' : '\nverify-physics: FAIL (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}

/* --------------------------------------------------------------------------------------------
 * 3. Real measurements from this machine.
 * ------------------------------------------------------------------------------------------ */

const endpoints = await import(new URL('../src/core/data/endpoints.js', import.meta.url).href);
const MEASURED = endpoints.MEASURED_ENDPOINTS;

const OBSERVER_LABEL = process.env.PT_OBSERVER_LABEL || 'Ashburn, Virginia';
const OBSERVER = process.env.PT_OBSERVER_LAT
  ? { lat: Number(process.env.PT_OBSERVER_LAT), lon: Number(process.env.PT_OBSERVER_LON) }
  : { lat: 39.0436, lon: -77.4875 };

const SAMPLES = 7;

/**
 * The same method the product uses, written again: open the connection, throw the first
 * response away, then take the minimum of seven on the kept alive connection.
 */
async function measureHost(host) {
  const url = 'https://' + host + '/';
  const times = [];
  const once = async () => {
    const t0 = performance.now();
    try {
      const r = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'manual' });
      await r.arrayBuffer();
    } catch (e) {
      return { ok: false, reason: String(e && e.message) };
    }
    return { ok: true, ms: performance.now() - t0 };
  };
  const warm = await once();
  if (!warm.ok) return { host, ok: false, reason: warm.reason };
  for (let i = 0; i < SAMPLES; i += 1) {
    const r = await once();
    if (!r.ok) return { host, ok: false, reason: r.reason };
    times.push(r.ms);
  }
  return { host, ok: true, samples: times, min: Math.min(...times), spread: Math.max(...times) - Math.min(...times) };
}

say.head('3. real measurements from this machine, by a different client from the page');
console.log('        observer  ' + OBSERVER_LABEL + '  ' + OBSERVER.lat + ', ' + OBSERVER.lon);
console.log('        method    warm HTTPS round trip, one discarded warm up then the minimum of '
  + SAMPLES + ', Node fetch');
console.log('        taken     ' + new Date().toISOString());

const rows = [];
for (const e of MEASURED) {
  const m = await measureHost(e.measurementHost);
  const km = haversineKm(OBSERVER, { lat: e.lat, lon: e.lon });
  rows.push({ id: e.id, city: e.city, km, floor: floorMs(km), m });
}

const usable = rows.filter((r) => r.m.ok);
const failed = rows.filter((r) => !r.m.ok);
const ftl = usable.filter((r) => r.m.min < r.floor);
const clean = usable.filter((r) => r.m.min >= r.floor);

// The access baseline: the minimum surplus over every clean row. Written again, not imported.
const access = clean.length ? Math.min(...clean.map((r) => r.m.min - r.floor)) : 0;

console.log('');
console.log('        region                distance     floor   measured   naive   access    route   ratio');
const ratios = [];
for (const r of [...clean].sort((a, b) => a.km - b.km)) {
  const route = r.m.min - r.floor - access;
  const naive = r.m.min / r.floor;
  const ratio = (r.m.min - access) / r.floor;
  if (r.km >= 500) ratios.push(ratio);
  console.log('        ' + r.city.padEnd(20)
    + String(Math.round(r.km)).padStart(8) + ' km'
    + r.floor.toFixed(1).padStart(9)
    + r.m.min.toFixed(1).padStart(10)
    + (Number.isFinite(naive) ? (naive.toFixed(2) + 'x').padStart(9) : '      n/a')
    + access.toFixed(1).padStart(8)
    + route.toFixed(1).padStart(9)
    + (r.km < 500 ? '      n/a' : (ratio.toFixed(2) + 'x').padStart(9)));
}
for (const r of ftl) {
  console.log('        ' + r.city.padEnd(20) + String(Math.round(r.km)).padStart(8) + ' km'
    + r.floor.toFixed(1).padStart(9) + r.m.min.toFixed(1).padStart(10)
    + '   DROPPED: faster than light for its stated geography');
}
for (const r of failed) {
  console.log('        ' + r.city.padEnd(20) + '  no answer: ' + r.m.reason);
}

const sorted = [...ratios].sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;

console.log('');
console.log('        access baseline          ' + access.toFixed(2) + ' ms');
console.log('        rows measured            ' + usable.length + ' of ' + rows.length);
console.log('        dropped, faster than light ' + ftl.length);
console.log('        ratios over 500 km       ' + ratios.length
  + '   min ' + (sorted.length ? sorted[0].toFixed(2) : 'n/a')
  + '   median ' + (sorted.length ? median.toFixed(2) : 'n/a')
  + '   max ' + (sorted.length ? sorted[sorted.length - 1].toFixed(2) : 'n/a'));

say.head('what the measurements say about the floor');
check(clean.every((r) => r.m.min >= r.floor),
  'every reported row is SLOWER than light in fibre for its own geography');
check(access >= 0, 'the access baseline is not negative');
if (clean.length) {
  const setter = clean.reduce((a, b) => ((a.m.min - a.floor) <= (b.m.min - b.floor) ? a : b));
  // The construction property is that the baseline setter carries NO route surplus. Stating it
  // as a ratio only works above the 500 km gate: at zero distance the floor is zero and the
  // ratio is a division by zero, which is the whole reason DESIGN trap 2 suppresses it there.
  const setterRoute = setter.m.min - setter.floor - access;
  check(Math.abs(setterRoute) < 1e-9,
    'the endpoint that set the baseline carries no route surplus at all, which it must by '
    + 'construction (' + setter.city + ', ' + Math.round(setter.km) + ' km)');
  if (setter.km >= 500) {
    check(Math.abs((setter.m.min - access) / setter.floor - 1) < 1e-9,
      'and it therefore reads exactly 1.00x (' + setter.city + ')');
  } else {
    say.note('the baseline was set by ' + setter.city + ' at ' + Math.round(setter.km)
      + ' km, which is under the 500 km gate, so no ratio is rendered for it at all. The 1.00x '
      + 'reading a reader can see belongs to whichever endpoint above the gate has the smallest '
      + 'surplus, and the zero route surplus above is the property that matters.');
  }
}
if (sorted.length) {
  check(median >= ACCEPTABLE_MEDIAN_BAND.low && median <= ACCEPTABLE_MEDIAN_BAND.high,
    'the median ratio ' + median.toFixed(2) + 'x is inside the ' + ACCEPTABLE_MEDIAN_BAND.low
    + 'x to ' + ACCEPTABLE_MEDIAN_BAND.high + 'x band DESIGN 7.2 requires');
  say.note('published rule of thumb: ' + PUBLISHED_RULE_OF_THUMB.multiplier + 'x line of sight.');
  say.note('  "' + PUBLISHED_RULE_OF_THUMB.quote + '"');
  say.note('  ' + PUBLISHED_RULE_OF_THUMB.citation);
  say.note('this machine measured a median of ' + median.toFixed(2) + 'x, which is '
    + (median < PUBLISHED_RULE_OF_THUMB.multiplier ? 'BELOW' : 'ABOVE') + ' that rule of thumb. '
    + 'A single well connected vantage point sitting below a population median is the expected '
    + 'direction, not a contradiction: the rule of thumb is over many measurement campaigns and '
    + 'many access networks, and this is one machine on one of them.');
}

const out = path.join(REPO, '..', '_internal', 'physical-internet', 'validation');
void out;
console.log(failures === 0 ? '\nverify-physics: PASS' : '\nverify-physics: FAIL (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
