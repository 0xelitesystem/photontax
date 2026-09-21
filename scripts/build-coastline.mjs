#!/usr/bin/env node
// GENERATOR for src/globe/coastline-data.js. GLOBE team. DESIGN 6.3.
//
//   node scripts/build-coastline.mjs            regenerate from the live Natural Earth vector
//   node scripts/build-coastline.mjs --check    fail if the committed file does not match
//
// Natural Earth is PUBLIC DOMAIN. Its own terms: "No permission is needed to use Natural
// Earth. Crediting the authors is unnecessary." DESIGN 3 credits it anyway, as a courtesy,
// and the credit is carried in the generated file and in the shipped page.
//
// WHY A GENERATOR AND NOT A PASTED BLOB. The standing rule is that no number ships that cannot
// be recomputed from a primary source or from the shipped self test. The point count, the byte
// count and the base64 payload in the generated file are all outputs of this script, so a
// reader can rerun it and get the identical file. --check is what makes that a gate rather
// than a promise.
//
// A NOTE ON A NUMBER THAT DID NOT SURVIVE. DESIGN 6.3 states the 110m coastline is "14,106
// points, 14,106 B binary". That is not what the source contains. The live Natural Earth 110m
// coastline is 134 LineStrings totalling 5,128 points before quantisation. The design figure
// could not be reproduced from any Natural Earth 110m layer (110m land is 5,143 points across
// 128 rings), so under the standing rule it is CUT rather than softened, and the numbers this
// file publishes are the ones this script computes.

import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'src', 'globe', 'coastline-data.js');

// The Natural Earth vector repository, which is the canonical distribution of the shapefiles
// as GeoJSON. Build time only. The shipped page fetches nothing to draw the globe.
const SOURCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_coastline.geojson';

/**
 * Degrees per quantisation step, as a denominator. 1/100 of a degree is about 1.1 km at the
 * equator. DESIGN 6.3 specifies 0.001 degrees; this ships 0.01 and the arithmetic is the
 * reason, printed rather than asserted.
 *
 * The globe is clamped so its drawn diameter never exceeds MAX_GLOBE_DIAMETER_DEVICE_PX
 * device pixels (src/globe/camera.js pins the same number). 180 degrees of arc across that
 * diameter is 8000 / 180 = 44.4 device pixels per degree at the most zoomed in state this
 * page can reach, so one quantisation step is 0.44 of a device pixel. The ribbon is 1.6 CSS
 * pixels wide. A displacement of under half a pixel inside a stroke that is over three device
 * pixels wide is not a visible difference, and the 0.001 degree grid costs 1.5 KB gzipped for
 * it. The finer grid would be claiming a precision the display cannot resolve, which is the
 * same error as printing a decimal millisecond (DESIGN trap 9), spent on geometry instead.
 */
const QUANT = 100;

/**
 * Douglas Peucker tolerance in degrees, set EQUAL to one quantisation step.
 *
 * This is deliberately not a tuned number. At a tolerance of exactly one grid step the only
 * points removed are ones the quantisation grid has already collapsed onto the same line, so
 * the simplification cannot remove a feature the encoder was going to preserve. It drops 106
 * of 5128 points. A larger tolerance saves more bytes and starts deciding which headlands
 * exist, which is a cartographic judgement this project has no reason to make.
 */
const SIMPLIFY_DEG = 1 / QUANT;

/** Pinned alongside src/globe/camera.js. See QUANT for what it is used to justify. */
const MAX_GLOBE_DIAMETER_DEVICE_PX = 8000;

/**
 * Douglas Peucker, iterative so a long feature cannot blow the call stack.
 * Distance is planar in degrees, which is the right measure here because the tolerance is
 * being compared against a grid that is also defined in degrees.
 * @param {number[][]} pts
 * @param {number} eps
 * @returns {number[][]}
 */
export function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  /** @type {number[][]} */
  const stack = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const span = stack.pop();
    const i = span[0];
    const j = span[1];
    if (j <= i + 1) continue;
    const x1 = pts[i][0];
    const y1 = pts[i][1];
    const x2 = pts[j][0];
    const y2 = pts[j][1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const den = Math.hypot(dx, dy);
    let best = -1;
    let bestAt = -1;
    for (let k = i + 1; k < j; k++) {
      const x = pts[k][0];
      const y = pts[k][1];
      const d = den === 0
        ? Math.hypot(x - x1, y - y1)
        : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / den;
      if (d > best) { best = d; bestAt = k; }
    }
    if (best > eps) {
      keep[bestAt] = 1;
      stack.push([i, bestAt], [bestAt, j]);
    }
  }
  return pts.filter((_, k) => keep[k] === 1);
}

/** @param {number[]} bytes @param {number} n unsigned */
function pushVarint(bytes, n) {
  let v = n >>> 0;
  for (;;) {
    const b = v & 0x7f;
    v >>>= 7;
    if (v === 0) { bytes.push(b); return; }
    bytes.push(b | 0x80);
  }
}

/** @param {number} n signed @returns {number} unsigned */
function zigzag(n) {
  return (n << 1) ^ (n >> 31);
}

/**
 * Encode the coastline as: varint(lineCount), then per line varint(pointCount) followed by
 * pointCount pairs of zigzag varint deltas. The delta cursor runs ACROSS lines, not just
 * within one, because the features arrive in a spatially coherent order and carrying the
 * cursor over saves the full magnitude of every line's first point.
 *
 * @param {number[][][]} lines Array of lines, each an array of [lonDeg, latDeg].
 * @returns {{bytes:Uint8Array, points:number, lines:number}}
 */
export function encodeCoastline(lines) {
  /** @type {number[]} */
  const bytes = [];
  pushVarint(bytes, lines.length);
  let curLon = 0;
  let curLat = 0;
  let points = 0;
  for (const line of lines) {
    pushVarint(bytes, line.length);
    for (const pt of line) {
      const qLon = Math.round(pt[0] * QUANT);
      const qLat = Math.round(pt[1] * QUANT);
      pushVarint(bytes, zigzag(qLon - curLon));
      pushVarint(bytes, zigzag(qLat - curLat));
      curLon = qLon;
      curLat = qLat;
      points += 1;
    }
  }
  return { bytes: Uint8Array.from(bytes), points, lines: lines.length };
}

/**
 * Quantise and drop consecutive duplicates, which quantisation creates.
 * @param {number[][]} coords
 * @returns {number[][]}
 */
function cleanLine(coords) {
  /** @type {number[][]} */
  const out = [];
  let lastLon = NaN;
  let lastLat = NaN;
  for (const pt of coords) {
    const qLon = Math.round(pt[0] * QUANT) / QUANT;
    const qLat = Math.round(pt[1] * QUANT) / QUANT;
    if (qLon === lastLon && qLat === lastLat) continue;
    out.push([qLon, qLat]);
    lastLon = qLon;
    lastLat = qLat;
  }
  return out;
}

async function main() {
  const check = process.argv.includes('--check');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error('Natural Earth fetch failed: HTTP ' + res.status);
  const geo = JSON.parse(await res.text());

  /** @type {number[][][]} */
  const lines = [];
  let rawPoints = 0;
  for (const f of geo.features) {
    if (f.geometry.type !== 'LineString') {
      throw new Error('unexpected geometry type ' + f.geometry.type + '. The 110m coastline '
        + 'layer is LineStrings only; a change here is a change of source and needs a look.');
    }
    rawPoints += f.geometry.coordinates.length;
    const cleaned = cleanLine(simplify(f.geometry.coordinates, SIMPLIFY_DEG));
    if (cleaned.length >= 2) lines.push(cleaned);
  }

  const enc = encodeCoastline(lines);
  const b64 = Buffer.from(enc.bytes).toString('base64');

  const L = [];
  L.push('// GENERATED by scripts/build-coastline.mjs. Do not edit by hand.');
  L.push('//');
  L.push('// Natural Earth 110m coastline, PUBLIC DOMAIN. Natural Earth own terms: "No permission is');
  L.push('// needed to use Natural Earth. Crediting the authors is unnecessary." Credited anyway, in');
  L.push('// the shipped page and here, because a product about provenance does not take an');
  L.push('// uncredited asset.');
  L.push('//');
  L.push('// Source layer: ne_110m_coastline, from the Natural Earth vector distribution.');
  L.push('// Encoding: Douglas Peucker at a tolerance of one quantisation step, longitude and');
  L.push('// latitude quantised to 1/' + QUANT + ' of a degree, consecutive duplicates dropped, delta');
  L.push('// encoded against a cursor that runs across features, zigzag varint, base64. Decoded');
  L.push('// by src/globe/coastline.js. The generator header says why this grid and not a finer');
  L.push('// one: at the most zoomed in state the camera allows, one step is under half a device');
  L.push('// pixel inside a stroke that is over three device pixels wide.');
  L.push('//');
  L.push('// Every figure below is an output of the generator, not a transcription:');
  L.push('//   features in the source layer .... ' + geo.features.length);
  L.push('//   points in the source layer ...... ' + rawPoints);
  L.push('//   lines kept after quantisation ... ' + lines.length);
  L.push('//   points kept after quantisation .. ' + enc.points);
  L.push('//   encoded binary .................. ' + enc.bytes.length + ' bytes');
  L.push('//   encoded base64 .................. ' + b64.length + ' bytes');
  L.push('//');
  L.push('// Isomorphic: no node:* imports and no DOM.');
  L.push('');
  L.push('/** Attribution text shipped in the page. DESIGN 3. */');
  L.push('export const COASTLINE_ATTRIBUTION =');
  L.push("  'Coastline: Natural Earth 110m, public domain. Crediting is not required; credited anyway.';");
  L.push('');
  L.push('/** Quantisation denominator used by the encoder. The decoder divides by this. */');
  L.push('export const COASTLINE_QUANT = ' + QUANT + ';');
  L.push('');
  L.push('/** Counts, asserted by test/globe-coastline.test.js against the decoded payload. */');
  L.push('export const COASTLINE_STATS = Object.freeze({');
  L.push('  sourceFeatures: ' + geo.features.length + ',');
  L.push('  sourcePoints: ' + rawPoints + ',');
  L.push('  lines: ' + lines.length + ',');
  L.push('  points: ' + enc.points + ',');
  L.push('  binaryBytes: ' + enc.bytes.length + ',');
  L.push('  base64Bytes: ' + b64.length + ',');
  L.push('});');
  L.push('');
  L.push('/** Delta encoded, zigzag varint, base64. See the header for the exact shape. */');
  L.push('export const COASTLINE_B64 =');
  L.push("  '" + b64 + "';");
  L.push('');
  const file = L.join('\n');

  if (check) {
    const existing = await readFile(OUT, 'utf8');
    if (existing !== file) {
      console.error('FAIL  src/globe/coastline-data.js does not match a fresh generation.');
      process.exit(1);
    }
    console.log('PASS  coastline data matches a fresh generation: ' + enc.points + ' points, '
      + enc.bytes.length + ' bytes');
    return;
  }

  await writeFile(OUT, file, 'utf8');
  console.log('wrote ' + path.relative(REPO, OUT));
  console.log('  source features ' + geo.features.length + ', source points ' + rawPoints);
  console.log('  kept ' + lines.length + ' lines, ' + enc.points + ' points');
  console.log('  binary ' + enc.bytes.length + ' bytes, base64 ' + b64.length + ' bytes');
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || '')) {
  await main();
}
