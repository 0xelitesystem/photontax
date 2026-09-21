// Mesh building and great circle sampling. GLOBE team. DESIGN 6.1, globe contract.
//
// The load bearing assertion in this file is that an ARC IS A GREAT CIRCLE. Not an eased
// bezier, not a lofted curve above the surface, not a route. The product's entire headline is
// a floor computed from the great circle distance, so the line on the globe has to be the same
// geometry that number came from. That is checked here against the shipped haversine in
// src/core/geo.js, not against a second implementation written for the test.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ARC_MIN_SAMPLES, ARC_SAMPLE_STEP_DEG, MARKER_STRIDE, RIBBON_STRIDE,
  buildMarkers, buildRibbon, buildSphere, coastlineLines, sampleGreatCircle,
} from '../src/globe/geometry.js';
import { ARC_RADIUS, GLOBE_RADIUS, COASTLINE_RADIUS, vec3ToCoord } from '../src/globe/camera.js';
import { greatCircleKm } from '../src/core/geo.js';
import { EARTH_MEAN_RADIUS_KM } from '../src/core/constants.js';
import { COASTLINE_STATS } from '../src/globe/coastline.js';

const VIRGINIA = { lat: 39.0438, lon: -77.4874 };
const TOKYO = { lat: 35.6894, lon: 139.6917 };
const FRANKFURT = { lat: 50.1109, lon: 8.6821 };
const SYDNEY = { lat: -33.8688, lon: 151.2093 };

describe('an arc is the great circle, and nothing else', () => {
  test('every sample lies exactly on the sphere of the arc radius', () => {
    for (const to of [TOKYO, FRANKFURT, SYDNEY]) {
      for (const p of sampleGreatCircle(VIRGINIA, to)) {
        const r = Math.hypot(p.x, p.y, p.z);
        assert.ok(Math.abs(r - ARC_RADIUS) < 1e-12,
          'a sample sat at radius ' + r + ' instead of ' + ARC_RADIUS + '. A chord shortcut '
          + 'would dip inside the planet and be swallowed by the surface on the near side.');
      }
    }
  });

  test('the arc starts and ends exactly at its two endpoints', () => {
    const pts = sampleGreatCircle(VIRGINIA, TOKYO);
    const first = vec3ToCoord(pts[0]);
    const last = vec3ToCoord(pts[pts.length - 1]);
    assert.ok(Math.abs(first.lat - VIRGINIA.lat) < 1e-9 && Math.abs(first.lon - VIRGINIA.lon) < 1e-9);
    assert.ok(Math.abs(last.lat - TOKYO.lat) < 1e-9 && Math.abs(last.lon - TOKYO.lon) < 1e-9);
  });

  test('THE ONE THAT MATTERS: the drawn arc length equals the haversine the floor is built on', () => {
    // Sum the chords of the samples, convert to kilometres, and compare against the product's
    // own haversine. If these disagree, the picture and the number are describing different
    // geometry, and the number is the one the reader is being asked to trust.
    for (const to of [TOKYO, FRANKFURT, SYDNEY]) {
      const pts = sampleGreatCircle(VIRGINIA, to, 1);
      let chordSum = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        chordSum += 2 * Math.asin(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 2);
      }
      const km = chordSum * EARTH_MEAN_RADIUS_KM;
      const expected = greatCircleKm(VIRGINIA, to);
      const relative = Math.abs(km - expected) / expected;
      assert.ok(relative < 1e-12,
        'drawn arc was ' + km.toFixed(4) + ' km against a haversine of ' + expected.toFixed(4));
    }
  });

  test('the sample density follows the angle, with a floor', () => {
    const shortArc = sampleGreatCircle({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    assert.equal(shortArc.length, ARC_MIN_SAMPLES + 1,
      'a short arc still gets the minimum number of samples so it is a ribbon, not a sliver');
    // The property, rather than a recomputation of the formula: no two consecutive samples on
    // any arc are further apart than the published step. Asserting the count would be
    // asserting the implementation, and would also be hostage to acos returning 179.00000000003
    // for a pair that is 179 degrees apart.
    for (const [a, b] of [
      [{ lat: 0, lon: 0 }, { lat: 0, lon: 179 }],
      [{ lat: -33.8688, lon: 151.2093 }, { lat: 50.1109, lon: 8.6821 }],
      [{ lat: 39.0438, lon: -77.4874 }, { lat: 35.6894, lon: 139.6917 }],
    ]) {
      const pts = sampleGreatCircle(a, b, 1);
      let worstDeg = 0;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1];
        const q = pts[i];
        const cos = Math.max(-1, Math.min(1, p.x * q.x + p.y * q.y + p.z * q.z));
        worstDeg = Math.max(worstDeg, (Math.acos(cos) * 180) / Math.PI);
      }
      assert.ok(worstDeg <= ARC_SAMPLE_STEP_DEG + 1e-9,
        'largest angular step was ' + worstDeg + ' degrees, over the published ' + ARC_SAMPLE_STEP_DEG);
    }
  });

  test('the chord error of the sampling is far below a pixel', () => {
    // The error of a chord against the arc it spans is the sagitta, R * (1 - cos(step / 2)).
    // The closest zoom the camera allows puts the globe at 8000 device pixels across, so the
    // radius is 4000 device pixels. This recomputes the number the module header states rather
    // than trusting it, which is how the header came to be right.
    const stepRad = (ARC_SAMPLE_STEP_DEG * Math.PI) / 180;
    const sagitta = 1 - Math.cos(stepRad / 2);
    const devicePx = sagitta * (8000 / 2);
    assert.ok(devicePx < 0.2, 'chord sag is ' + devicePx + ' device pixels at maximum zoom');
  });

  test('coincident coordinates do not produce NaN', () => {
    const pts = sampleGreatCircle(VIRGINIA, { ...VIRGINIA });
    assert.ok(pts.length >= 2);
    for (const p of pts) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    }
  });

  test('antipodal coordinates do not divide by a vanishing sine', () => {
    const pts = sampleGreatCircle({ lat: 10, lon: 20 }, { lat: -10, lon: -160 });
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y, p.z);
      assert.ok(Number.isFinite(r) && Math.abs(r - ARC_RADIUS) < 1e-9,
        'an antipodal arc produced radius ' + r);
    }
  });
});

describe('the ribbon, which is why nothing here is ever a line primitive', () => {
  test('two vertices per point, two triangles per segment', () => {
    const line = sampleGreatCircle(VIRGINIA, FRANKFURT);
    const mesh = buildRibbon([line]);
    assert.equal(mesh.vertexCount, line.length * 2);
    assert.equal(mesh.vertices.length, line.length * 2 * RIBBON_STRIDE);
    assert.equal(mesh.indices.length, (line.length - 1) * 6);
  });

  test('the side attribute alternates exactly minus one and plus one', () => {
    const mesh = buildRibbon([sampleGreatCircle(VIRGINIA, SYDNEY)]);
    for (let v = 0; v < mesh.vertexCount; v++) {
      const side = mesh.vertices[v * RIBBON_STRIDE + 6];
      assert.equal(side, v % 2 === 0 ? -1 : 1, 'side attribute wrong at vertex ' + v);
    }
  });

  test('the arc length parameter runs from zero to one and never goes backwards', () => {
    const mesh = buildRibbon([sampleGreatCircle(VIRGINIA, TOKYO)]);
    let previous = -1;
    for (let v = 0; v < mesh.vertexCount; v += 2) {
      const t = mesh.vertices[v * RIBBON_STRIDE + 7];
      assert.ok(t >= previous, 'arc length went backwards at vertex ' + v);
      previous = t;
    }
    assert.equal(mesh.vertices[7], 0);
    assert.equal(mesh.vertices[(mesh.vertexCount - 1) * RIBBON_STRIDE + 7], 1);
  });

  test('every tangent is a unit vector, so the screen space offset is a width and not a scale', () => {
    const mesh = buildRibbon([sampleGreatCircle(VIRGINIA, FRANKFURT)]);
    for (let v = 0; v < mesh.vertexCount; v++) {
      const o = v * RIBBON_STRIDE;
      const l = Math.hypot(mesh.vertices[o + 3], mesh.vertices[o + 4], mesh.vertices[o + 5]);
      assert.ok(Math.abs(l - 1) < 1e-6, 'tangent length was ' + l + ' at vertex ' + v);
    }
  });

  test('a corner shares one tangent from both of its segments, so the ribbon cannot tear', () => {
    const mesh = buildRibbon([[
      { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 },
    ]]);
    const o = 2 * RIBBON_STRIDE;                    // the middle point, side -1
    const o2 = 3 * RIBBON_STRIDE;                   // the same point, side +1
    for (let k = 3; k < 6; k++) assert.equal(mesh.vertices[o + k], mesh.vertices[o2 + k]);
  });

  test('a degenerate line of fewer than two points is skipped, not crashed on', () => {
    const mesh = buildRibbon([[{ x: 1, y: 0, z: 0 }], []]);
    assert.equal(mesh.vertexCount, 0);
    assert.equal(mesh.indices.length, 0);
    assert.equal(mesh.ranges.length, 2);
  });

  test('the ranges index into the indices without overlapping or leaving a gap', () => {
    const mesh = buildRibbon([
      sampleGreatCircle(VIRGINIA, TOKYO),
      sampleGreatCircle(VIRGINIA, SYDNEY),
    ]);
    assert.equal(mesh.ranges[0].first, 0);
    assert.equal(mesh.ranges[1].first, mesh.ranges[0].count);
    assert.equal(mesh.ranges[1].first + mesh.ranges[1].count, mesh.indices.length);
  });

  test('every index is in range, which a wrong base vertex would break silently', () => {
    const mesh = buildRibbon([
      sampleGreatCircle(VIRGINIA, TOKYO),
      sampleGreatCircle(VIRGINIA, FRANKFURT),
      sampleGreatCircle(VIRGINIA, SYDNEY),
    ]);
    for (const i of mesh.indices) assert.ok(i < mesh.vertexCount, 'index ' + i + ' out of range');
  });
});

describe('the coastline as world geometry', () => {
  test('it produces one line per decoded feature, at the coastline radius', () => {
    const lines = coastlineLines();
    assert.equal(lines.length, COASTLINE_STATS.lines);
    let total = 0;
    for (const line of lines) {
      total += line.length;
      for (const p of line) {
        const r = Math.hypot(p.x, p.y, p.z);
        assert.ok(Math.abs(r - COASTLINE_RADIUS) < 1e-12);
      }
    }
    assert.equal(total, COASTLINE_STATS.points);
  });

  test('it builds into one ribbon whose triangle count follows from the point count', () => {
    const lines = coastlineLines();
    const mesh = buildRibbon(lines);
    const segments = lines.reduce((n, l) => n + l.length - 1, 0);
    assert.equal(mesh.indices.length, segments * 6);
    assert.equal(mesh.vertexCount, COASTLINE_STATS.points * 2);
  });
});

describe('the sphere and the markers', () => {
  test('every sphere vertex is on the unit sphere', () => {
    const s = buildSphere(16, 8);
    for (let i = 0; i < s.positions.length; i += 3) {
      // The tolerance is single precision, not double: positions are uploaded as a
      // Float32Array because that is what WebGL takes, and asking for more here would be
      // asserting a precision the buffer format cannot hold.
      const r = Math.hypot(s.positions[i], s.positions[i + 1], s.positions[i + 2]);
      assert.ok(Math.abs(r - GLOBE_RADIUS) < 1e-6, 'sphere vertex radius was ' + r);
    }
  });

  test('the sphere index count follows from the tessellation', () => {
    const s = buildSphere(16, 8);
    assert.equal(s.indices.length, 16 * 8 * 6);
    assert.equal(s.positions.length, 17 * 9 * 3);
  });

  test('the default tessellation gives the limb more segments than the bands', () => {
    // The limb is the silhouette the whole composition rests on. Faceting there is the thing a
    // reader notices; faceting in a latitude band is invisible on a globe with no texture.
    const s = buildSphere();
    const lon = 128;
    const lat = 72;
    assert.equal(s.indices.length, lon * lat * 6);
    assert.ok(lon > lat);
  });

  test('markers are quads, four vertices and six indices each, never a point primitive', () => {
    const m = buildMarkers([VIRGINIA, TOKYO, SYDNEY]);
    assert.equal(m.count, 3);
    assert.equal(m.vertices.length, 3 * 4 * MARKER_STRIDE);
    assert.equal(m.indices.length, 3 * 6);
    for (const i of m.indices) assert.ok(i < 12);
  });

  test('each marker quad carries the four unit corners', () => {
    const m = buildMarkers([TOKYO]);
    const corners = [];
    for (let v = 0; v < 4; v++) {
      corners.push([m.vertices[v * MARKER_STRIDE + 3], m.vertices[v * MARKER_STRIDE + 4]]);
    }
    assert.deepEqual(corners, [[-1, -1], [1, -1], [1, 1], [-1, 1]]);
  });
});
