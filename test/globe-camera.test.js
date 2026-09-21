// The camera. GLOBE team. DESIGN 5, 6.5, 6.6.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  FOV_Y_RAD, GLOBE_RADIUS, ARC_RADIUS, COASTLINE_RADIUS, MAX_NDC_RADIUS, MIN_DISTANCE,
  MAX_DISTANCE, DEFAULT_DISTANCE, IDLE_SPIN_DEG_PER_SEC, MAX_PITCH_DEG,
  advanceIdleSpin, cameraKey, cameraMatrices, cameraOver, clampCamera, coordToVec3,
  createCamera, distanceForNdcRadius, eyeOf, isFrontFacing, lerpCamera, ndcRadiusForDistance,
  vec3ToCoord,
} from '../src/globe/camera.js';
import { transformPoint } from '../src/globe/mat4.js';
import { RENDER_RULES } from '../src/core/contracts/globe.js';

describe('the radii are the ones the contract pins', () => {
  test('arcs sit at exactly the radius the globe contract names', () => {
    assert.equal(ARC_RADIUS, RENDER_RULES.arcRadius);
    assert.equal(ARC_RADIUS, 1.001);
  });

  test('coastlines sit above the surface and below the arcs', () => {
    assert.ok(COASTLINE_RADIUS > GLOBE_RADIUS,
      'a coastline exactly on the surface z fights with it');
    assert.ok(COASTLINE_RADIUS < ARC_RADIUS,
      'an arc must pass over a coastline, not through it');
  });
});

describe('distance and projected size', () => {
  test('the closed form inverts itself', () => {
    for (const r of [0.2, 0.5, 0.8, 1.5, 2.5]) {
      const d = distanceForNdcRadius(r);
      assert.ok(Math.abs(ndcRadiusForDistance(d) - r) < 1e-12, 'round trip failed at ' + r);
    }
  });

  test('THE REAL CHECK: the silhouette really does land where the formula says', () => {
    // Project the actual silhouette point through the actual matrices. The silhouette of a
    // unit sphere from distance d touches the sphere where the view ray is tangent, at an
    // angle of acos(1 / d) from the sub camera point. If that point does not land at the
    // predicted radius in normalised device coordinates, the formula is decoration.
    for (const ndcR of [0.35, 0.8, 1.6, 2.5]) {
      const d = distanceForNdcRadius(ndcR);
      const cam = { yawDeg: 0, pitchDeg: 0, distance: d };
      const m = cameraMatrices(cam, 512, 512);
      // The camera is over lat 0 lon 0, so the sub camera point is +X. A silhouette point is
      // acos(1 / d) away from it, towards +Y.
      const theta = Math.acos(GLOBE_RADIUS / d);
      const p = coordToVec3((theta * 180) / Math.PI, 0, GLOBE_RADIUS);
      const clip = transformPoint(m.viewProj, p);
      const y = clip.y / clip.w;
      assert.ok(Math.abs(y - ndcR) < 1e-9,
        'at ndcRadius ' + ndcR + ' the silhouette landed at ' + y);
    }
  });

  test('the zoom clamp is stated in both units and agrees with itself', () => {
    assert.ok(MIN_DISTANCE < DEFAULT_DISTANCE);
    assert.ok(DEFAULT_DISTANCE < MAX_DISTANCE);
    assert.ok(Math.abs(ndcRadiusForDistance(MIN_DISTANCE) - MAX_NDC_RADIUS) < 1e-12);
  });

  test('the most zoomed in state is the one the coastline grid was justified against', () => {
    // scripts/build-coastline.mjs quotes 8000 device pixels across at a 1600 CSS pixel canvas
    // and a device pixel ratio of 2. If the clamp ever loosens, that justification stops being
    // true and the grid has to be regenerated, so the number is asserted here rather than
    // living only in a comment.
    const viewportDevicePx = 1600 * 2;
    const diameterPx = 2 * MAX_NDC_RADIUS * (viewportDevicePx / 2);
    assert.equal(diameterPx, 8000);
    const devicePxPerDegree = diameterPx / 180;
    const gridStepPx = devicePxPerDegree * 0.01;
    assert.ok(gridStepPx < 0.5, 'one grid step is ' + gridStepPx + ' device pixels, no longer sub pixel');
  });
});

describe('camera state', () => {
  test('longitude wraps into a half open range and latitude is clamped at the poles', () => {
    assert.equal(clampCamera({ yawDeg: 370, pitchDeg: 0, distance: 4 }).yawDeg, 10);
    assert.equal(clampCamera({ yawDeg: -370, pitchDeg: 0, distance: 4 }).yawDeg, -10);
    assert.equal(clampCamera({ yawDeg: 0, pitchDeg: 200, distance: 4 }).pitchDeg, MAX_PITCH_DEG);
    assert.equal(clampCamera({ yawDeg: 0, pitchDeg: -200, distance: 4 }).pitchDeg, -MAX_PITCH_DEG);
  });

  test('the distance clamp holds in both directions', () => {
    assert.equal(clampCamera({ yawDeg: 0, pitchDeg: 0, distance: 1.0001 }).distance, MIN_DISTANCE);
    assert.equal(clampCamera({ yawDeg: 0, pitchDeg: 0, distance: 900 }).distance, MAX_DISTANCE);
  });

  test('the eye is at the stated distance over the stated coordinate', () => {
    const c = { yawDeg: 30, pitchDeg: -20, distance: 5 };
    const e = eyeOf(c);
    assert.ok(Math.abs(Math.hypot(e.x, e.y, e.z) - 5) < 1e-12);
    const back = vec3ToCoord(e);
    assert.ok(Math.abs(back.lat - (-20)) < 1e-12);
    assert.ok(Math.abs(back.lon - 30) < 1e-12);
  });

  test('coordToVec3 and vec3ToCoord are inverses', () => {
    for (const [lat, lon] of [[0, 0], [45, 90], [-33.9253, 18.4239], [89, -179], [-89, 179]]) {
      const back = vec3ToCoord(coordToVec3(lat, lon));
      assert.ok(Math.abs(back.lat - lat) < 1e-9, 'lat round trip at ' + lat);
      assert.ok(Math.abs(back.lon - lon) < 1e-9, 'lon round trip at ' + lon);
    }
  });
});

describe('the idle rotation, and what stops it', () => {
  test('it advances at the published rate', () => {
    const start = createCamera();
    const after = advanceIdleSpin(start, 2, { reducedMotion: false, interacted: false });
    assert.ok(Math.abs(after.yawDeg - clampCamera({ ...start, yawDeg: start.yawDeg + IDLE_SPIN_DEG_PER_SEC * 2 }).yawDeg) < 1e-12);
  });

  test('prefers-reduced-motion stops it dead', () => {
    const start = createCamera();
    const after = advanceIdleSpin(start, 2, { reducedMotion: true, interacted: false });
    assert.equal(after, start, 'reduced motion must not return a new, slightly rotated camera');
  });

  test('a reader who has touched the camera keeps it', () => {
    // A globe that drifts out from under a keyboard user is a globe they cannot aim.
    const start = createCamera();
    assert.equal(advanceIdleSpin(start, 5, { reducedMotion: false, interacted: true }), start);
  });
});

describe('the keyboard', () => {
  const base = { yawDeg: 0, pitchDeg: 0, distance: DEFAULT_DISTANCE };

  test('arrows rotate in the four directions and say which', () => {
    assert.ok(cameraKey(base, 'ArrowRight').camera.yawDeg > 0);
    assert.ok(cameraKey(base, 'ArrowLeft').camera.yawDeg < 0);
    assert.ok(cameraKey(base, 'ArrowUp').camera.pitchDeg > 0);
    assert.ok(cameraKey(base, 'ArrowDown').camera.pitchDeg < 0);
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      assert.match(cameraKey(base, k).announce, /^Rotated /);
    }
  });

  test('plus and minus zoom, in both the shifted and unshifted spellings', () => {
    assert.ok(cameraKey(base, '+').camera.distance < base.distance);
    assert.ok(cameraKey(base, '=').camera.distance < base.distance);
    assert.ok(cameraKey(base, '-').camera.distance > base.distance);
    assert.ok(cameraKey(base, '_').camera.distance > base.distance);
  });

  test('Home resets', () => {
    const moved = { yawDeg: 123, pitchDeg: -40, distance: MIN_DISTANCE };
    assert.deepEqual(cameraKey(moved, 'Home').camera, createCamera());
  });

  test('a key that is not ours returns null, so the page can still be typed in', () => {
    for (const k of ['a', 'Tab', 'Enter', 'PageDown', ' ']) {
      assert.equal(cameraKey(base, k), null, k + ' must not be swallowed');
    }
  });

  test('NO ANNOUNCEMENT CONTAINS A DIGIT', () => {
    // Every figure a reader receives goes through the claim badge system, which cannot render
    // a value without its provenance. A camera bearing is not a claim about the world, so it
    // is described in words. That keeps the rule absolute rather than carving an exception.
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', 'Home']) {
      const r = cameraKey(base, k);
      assert.ok(!/\d/.test(r.announce), 'announcement for ' + k + ' contains a digit: ' + r.announce);
    }
  });
});

describe('tweening and framing', () => {
  test('cameraOver aims at the coordinate and keeps the zoom', () => {
    const c = { yawDeg: 0, pitchDeg: 0, distance: 5 };
    const over = cameraOver(c, { lat: 35.6894, lon: 139.6917 });
    assert.ok(Math.abs(over.pitchDeg - 35.6894) < 1e-12);
    assert.ok(Math.abs(over.yawDeg - 139.6917) < 1e-12);
    assert.equal(over.distance, 5);
  });

  test('a tween across the antimeridian takes the short way', () => {
    const from = { yawDeg: 179, pitchDeg: 0, distance: 5 };
    const to = { yawDeg: -179, pitchDeg: 0, distance: 5 };
    const mid = lerpCamera(from, to, 0.5);
    // The short way is two degrees east through 180, so the midpoint is at 180 or -180.
    assert.ok(Math.abs(Math.abs(mid.yawDeg) - 180) < 1e-9,
      'the tween went the long way round: midpoint was ' + mid.yawDeg);
  });

  test('a tween is clamped at both ends', () => {
    const from = { yawDeg: 0, pitchDeg: 0, distance: 5 };
    const to = { yawDeg: 90, pitchDeg: 45, distance: 6 };
    assert.deepEqual(lerpCamera(from, to, -5), clampCamera(from));
    assert.deepEqual(lerpCamera(from, to, 5), clampCamera(to));
  });
});

describe('the visible cap', () => {
  test('the sub camera point is visible and the antipode is not', () => {
    const cam = { yawDeg: 20, pitchDeg: 10, distance: 4 };
    const eye = eyeOf(cam);
    assert.equal(isFrontFacing(coordToVec3(10, 20), eye), true);
    assert.equal(isFrontFacing(coordToVec3(-10, -160), eye), false);
  });

  test('the boundary is exactly the tangent point, not the terminator of a hemisphere', () => {
    // A naive implementation tests dot(p, eye) > 0, which claims a full hemisphere is visible.
    // From a finite distance only a cap is. At d = 4 the cap is acos(1/4), about 75.5 degrees,
    // so a point 80 degrees away from the sub camera point is NOT visible and a hemisphere
    // test would wrongly say it is.
    const eye = eyeOf({ yawDeg: 0, pitchDeg: 0, distance: 4 });
    assert.equal(isFrontFacing(coordToVec3(80, 0), eye), false);
    assert.equal(isFrontFacing(coordToVec3(70, 0), eye), true);
  });
});

describe('the field of view is a decision, not a knob', () => {
  test('it is a fixed number of degrees', () => {
    assert.ok(Math.abs((FOV_Y_RAD * 180) / Math.PI - 35) < 1e-12);
  });

  test('the near plane never reaches the globe and the far plane always clears it', () => {
    for (const d of [MIN_DISTANCE, DEFAULT_DISTANCE, MAX_DISTANCE]) {
      const m = cameraMatrices({ yawDeg: 0, pitchDeg: 0, distance: d }, 800, 600);
      assert.ok(m.near > 0, 'near plane must be positive');
      assert.ok(m.near < d - GLOBE_RADIUS + 1e-12, 'near plane clipped into the globe at d = ' + d);
      assert.ok(m.far > d + GLOBE_RADIUS, 'far plane cut the back of the globe at d = ' + d);
    }
  });

  test('a viewport with no area is refused rather than producing a NaN projection', () => {
    assert.throws(() => cameraMatrices(createCamera(), 0, 100), /no area/);
  });
});
