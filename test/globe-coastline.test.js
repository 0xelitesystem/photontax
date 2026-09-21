// The bundled coastline: does it decode, is it the real world, and does it cost what the
// generated file says it costs. GLOBE team. DESIGN 3, 6.3, 6.4.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  base64ToBytes, decodeCoastline, coastline, resetCoastlineCache,
  COASTLINE_STATS, COASTLINE_ATTRIBUTION, COASTLINE_QUANT,
} from '../src/globe/coastline.js';
import { COASTLINE_B64 } from '../src/globe/coastline-data.js';
import { encodeCoastline } from '../scripts/build-coastline.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBE_DIR = path.join(REPO, 'src', 'globe');

describe('the coastline payload decodes to what the generator says it encoded', () => {
  test('the decoded counts equal the counts the generated file publishes', () => {
    const geo = coastline();
    assert.equal(geo.lineStart.length, COASTLINE_STATS.lines);
    assert.equal(geo.lon.length, COASTLINE_STATS.points);
    assert.equal(geo.lat.length, COASTLINE_STATS.points);
    let summed = 0;
    for (const n of geo.lineCount) summed += n;
    assert.equal(summed, COASTLINE_STATS.points,
      'the per line counts must add up to the total, or the line index is lying');
  });

  test('the base64 and binary sizes are the ones published', () => {
    assert.equal(COASTLINE_B64.length, COASTLINE_STATS.base64Bytes);
    assert.equal(base64ToBytes(COASTLINE_B64).length, COASTLINE_STATS.binaryBytes);
  });

  test('every coordinate is a legal coordinate', () => {
    const geo = coastline();
    for (let i = 0; i < geo.lon.length; i++) {
      assert.ok(geo.lon[i] >= -180 && geo.lon[i] <= 180, 'longitude out of range at ' + i);
      assert.ok(geo.lat[i] >= -90 && geo.lat[i] <= 90, 'latitude out of range at ' + i);
    }
  });

  test('every line has at least two points, because a one point line is not a line', () => {
    const geo = coastline();
    for (const n of geo.lineCount) assert.ok(n >= 2);
  });

  test('the extremes land where the real world puts them', () => {
    // This is the check that catches a decoder whose delta cursor is wrong. Such a decoder
    // produces a map that is smooth, plausible and in the wrong place, and no assertion about
    // counts or ranges would notice.
    const geo = coastline();
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    for (let i = 0; i < geo.lon.length; i++) {
      minLat = Math.min(minLat, geo.lat[i]);
      maxLat = Math.max(maxLat, geo.lat[i]);
      minLon = Math.min(minLon, geo.lon[i]);
      maxLon = Math.max(maxLon, geo.lon[i]);
    }
    // The Antarctic coast reaches past 78 south, and the northern Greenland and Canadian
    // archipelago coasts reach past 83 north.
    assert.ok(minLat < -78, 'southernmost coastline latitude was ' + minLat);
    assert.ok(maxLat > 83, 'northernmost coastline latitude was ' + maxLat);
    assert.ok(minLon < -179 && maxLon > 179, 'the coastline should reach both sides of the antimeridian');
  });

  test('a quantised coordinate really is on the published grid', () => {
    const geo = coastline();
    for (let i = 0; i < 500; i++) {
      const v = geo.lon[i] * COASTLINE_QUANT;
      assert.ok(Math.abs(v - Math.round(v)) < 1e-6, 'off grid longitude at ' + i);
    }
  });

  test('decoding twice gives the same arrays, so the memo is not mutating anything', () => {
    const a = coastline();
    resetCoastlineCache();
    const b = coastline();
    assert.notEqual(a, b);
    assert.deepEqual(Array.from(a.lon.slice(0, 200)), Array.from(b.lon.slice(0, 200)));
  });
});

describe('the encoder and the decoder are inverses', () => {
  test('a synthetic set of lines survives the round trip exactly', () => {
    const lines = [
      [[0, 0], [1.5, 2.25], [-3.75, 10.5]],
      [[179.99, -85.5], [-179.99, -85.51]],
      [[-12.34, 56.78], [-12.35, 56.79], [-12.36, 56.8]],
    ];
    const enc = encodeCoastline(lines);
    const dec = decodeCoastline(enc.bytes, 100);
    assert.equal(dec.lineStart.length, 3);
    assert.equal(dec.lon.length, enc.points);
    let k = 0;
    for (const line of lines) {
      for (const pt of line) {
        assert.ok(Math.abs(dec.lon[k] - pt[0]) < 1e-9, 'lon mismatch at ' + k);
        assert.ok(Math.abs(dec.lat[k] - pt[1]) < 1e-9, 'lat mismatch at ' + k);
        k += 1;
      }
    }
  });

  test('THE POSITIVE CONTROL: a truncated payload is refused, not silently half decoded', () => {
    const bytes = base64ToBytes(COASTLINE_B64);
    assert.throws(() => decodeCoastline(bytes.slice(0, bytes.length - 20)), /stream ended|trailing/);
  });

  test('THE POSITIVE CONTROL: extra trailing bytes are refused', () => {
    const bytes = base64ToBytes(COASTLINE_B64);
    const longer = new Uint8Array(bytes.length + 3);
    longer.set(bytes);
    assert.throws(() => decodeCoastline(longer), /trailing bytes/);
  });
});

describe('the payload budget, and the network promise', () => {
  test('the coastline module gzips to a size this test prints, so a regression is visible', () => {
    const bytes = Buffer.from(COASTLINE_B64, 'utf8');
    const gz = gzipSync(bytes, { level: 9 }).length;
    // DESIGN 6.3 budgets the WHOLE single file page at 40 KB gzipped. The coastline is the
    // largest single asset in it, so it gets a ceiling of its own rather than being allowed to
    // eat the budget and leave the rest of the product to argue about the remainder.
    assert.ok(gz < 15000, 'coastline base64 gzips to ' + gz + ' bytes, over its 15000 byte ceiling');
    assert.ok(gz > 5000, 'coastline gzipped to only ' + gz + ' bytes, which means it lost data');
  });

  test('NOTHING under src/globe makes a network request, of any kind', async () => {
    // DESIGN 5 opens with first paint before any network call, and the CSP gate enforces set
    // equality between hosts used and hosts declared. The globe declares no host at all, so
    // the correct number of network constructs in this directory is zero, and this is the test
    // that keeps it there.
    const banned = [
      /\bfetch\s*\(/,
      /new\s+Image\s*\(/,
      /new\s+XMLHttpRequest\s*\(/,
      /new\s+WebSocket\s*\(/,
      /new\s+EventSource\s*\(/,
      /navigator\.sendBeacon\s*\(/,
      /import\s*\(\s*[`'"]https?:/,
      /\.src\s*=\s*[`'"]https?:/,
    ];
    const files = (await readdir(GLOBE_DIR)).filter((f) => f.endsWith('.js'));
    assert.ok(files.length > 5, 'expected the globe module files to be present');
    for (const f of files) {
      const text = await readFile(path.join(GLOBE_DIR, f), 'utf8');
      // Strip comments first: the modules talk ABOUT these constructs at length, and a gate
      // that cannot tell an explanation from a call is a gate that gets switched off.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
        .filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      for (const re of banned) {
        assert.ok(!re.test(code), f + ' contains ' + re + ', which is a network call the globe '
          + 'must never make');
      }
    }
  });

  test('the attribution Natural Earth does not require is shipped anyway', () => {
    assert.match(COASTLINE_ATTRIBUTION, /Natural Earth/);
    assert.match(COASTLINE_ATTRIBUTION, /public domain/);
  });
});
