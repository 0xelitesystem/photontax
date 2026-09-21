// The ribbon expansion, and the parity between the GLSL and the JavaScript that mirrors it.
// GLOBE team. DESIGN 6.1.
//
// Two jobs. First, prove the expansion does what the technique claims: a stroke of exactly the
// requested width in PIXELS, at any zoom, with the depth of the point it came from carried
// through untouched. Second, prove the shader and the reference rasterizer are running the
// same arithmetic, because two hand written copies of one formula drift and the copy that
// drifts is always the one nobody looks at.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  RIBBON_EXPANSION_GLSL, RIBBON_EXPANSION_STEPS, clipToScreen, expandRibbonVertex,
} from '../src/globe/pipeline.js';
import { RIBBON_VS, PROGRAMS } from '../src/globe/shaders.js';
import { cameraMatrices, coordToVec3, MIN_DISTANCE, MAX_DISTANCE, DEFAULT_DISTANCE } from '../src/globe/camera.js';
import { transformPoint } from '../src/globe/mat4.js';
import { RENDER_RULES } from '../src/core/contracts/globe.js';

const VIEWPORT = /** @type {[number, number]} */ ([800, 600]);

describe('the shader and the reference rasterizer run the same formula', () => {
  test('the vertex shader embeds the generated block verbatim', () => {
    assert.ok(RIBBON_VS.includes(RIBBON_EXPANSION_GLSL),
      'RIBBON_VS no longer contains the block generated from RIBBON_EXPANSION_STEPS. Editing '
      + 'one without the other is exactly the drift this assertion exists to catch.');
  });

  test('every named step is present, in order, and each one states why it is there', () => {
    let at = -1;
    for (const step of RIBBON_EXPANSION_STEPS) {
      const found = RIBBON_VS.indexOf(step.glsl);
      assert.ok(found > at, 'step ' + step.name + ' is missing or out of order');
      at = found;
      assert.ok(step.why.length > 40, 'step ' + step.name + ' has no explanation worth reading');
    }
  });

  test('the depth component is carried through, which is the whole occlusion mechanism', () => {
    const reassemble = RIBBON_EXPANSION_STEPS.find((s) => s.name === 'reassemble');
    assert.match(reassemble.glsl, /clipA\.z/,
      'the reassembled position must take z straight from the projected point. Rebuilding it '
      + 'gives a plausible picture with a subtly wrong depth, and the failure shows up exactly '
      + 'where a graphics literate reader looks first.');
    assert.match(reassemble.glsl, /clipA\.w\)/);
  });

  test('every shader is GLSL ES 3.00 and declares its precision where it has to', () => {
    for (const [name, p] of Object.entries(PROGRAMS)) {
      assert.ok(p.vs.startsWith('#version 300 es\n'), name + ' vertex shader is not GLSL ES 3.00');
      assert.ok(p.fs.startsWith('#version 300 es\n'), name + ' fragment shader is not GLSL ES 3.00');
      assert.match(p.fs, /precision highp float;/, name + ' fragment shader declares no precision');
      assert.match(p.fs, /out vec4 outColor;/, name + ' fragment shader has no output');
    }
  });

  test('NO SHADER USES A COLOUR LITERAL', () => {
    // Every colour in the scene comes from src/core/tokens.js through src/globe/palette.js, so
    // there is no colour anywhere in the globe that the contrast gate has never seen. A hard
    // coded vec3 in a shader would be exactly such a colour.
    for (const [name, p] of Object.entries(PROGRAMS)) {
      for (const src of [p.vs, p.fs]) {
        assert.ok(!/vec3\s*\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*\)/.test(src),
          name + ' contains a literal vec3 colour');
      }
    }
  });
});

describe('the expansion produces a constant pixel width at any zoom', () => {
  /** @param {number} distance @param {number} halfWidthPx */
  function widthAt(distance, halfWidthPx) {
    const m = cameraMatrices({ yawDeg: 0, pitchDeg: 0, distance }, VIEWPORT[0], VIEWPORT[1]);
    // A point on the equator, a little off the sub camera point, with an eastward tangent.
    const position = coordToVec3(0, 10, RENDER_RULES.arcRadius);
    const tangent = { x: -Math.sin((10 * Math.PI) / 180), y: 0, z: Math.cos((10 * Math.PI) / 180) };
    const minus = clipToScreen(expandRibbonVertex(m.viewProj, position, tangent, -1, halfWidthPx, VIEWPORT), VIEWPORT);
    const plus = clipToScreen(expandRibbonVertex(m.viewProj, position, tangent, 1, halfWidthPx, VIEWPORT), VIEWPORT);
    return { width: Math.hypot(plus.x - minus.x, plus.y - minus.y), minus, plus, m, position };
  }

  test('THE CLAIM: the same stroke is the same number of pixels wide at every zoom', () => {
    const half = 1.3;
    for (const d of [MIN_DISTANCE, DEFAULT_DISTANCE, MAX_DISTANCE, 12, 40]) {
      const got = widthAt(d, half).width;
      assert.ok(Math.abs(got - half * 2) < 1e-9,
        'at distance ' + d + ' the stroke was ' + got + ' pixels wide, not ' + half * 2);
    }
  });

  test('the width scales exactly with the requested half width', () => {
    for (const half of [0.5, 1, 1.7, 5]) {
      const got = widthAt(DEFAULT_DISTANCE, half).width;
      assert.ok(Math.abs(got - half * 2) < 1e-9, 'requested ' + half + ', got ' + got / 2);
    }
  });

  test('the two sides straddle the unexpanded point, symmetrically', () => {
    const r = widthAt(DEFAULT_DISTANCE, 2);
    const centre = clipToScreen(transformPoint(r.m.viewProj, r.position), VIEWPORT);
    const dMinus = Math.hypot(centre.x - r.minus.x, centre.y - r.minus.y);
    const dPlus = Math.hypot(centre.x - r.plus.x, centre.y - r.plus.y);
    assert.ok(Math.abs(dMinus - 2) < 1e-9, 'minus side offset was ' + dMinus);
    assert.ok(Math.abs(dPlus - 2) < 1e-9, 'plus side offset was ' + dPlus);
  });

  test('the offset is perpendicular to the stroke on SCREEN, not in the world', () => {
    const m = cameraMatrices({ yawDeg: 0, pitchDeg: 35, distance: DEFAULT_DISTANCE }, VIEWPORT[0], VIEWPORT[1]);
    const position = coordToVec3(20, 25, RENDER_RULES.arcRadius);
    const tangent = { x: -0.3, y: 0.8, z: 0.52 };
    const tl = Math.hypot(tangent.x, tangent.y, tangent.z);
    const unit = { x: tangent.x / tl, y: tangent.y / tl, z: tangent.z / tl };
    const centre = clipToScreen(transformPoint(m.viewProj, position), VIEWPORT);
    const along = clipToScreen(transformPoint(m.viewProj, {
      x: position.x + unit.x * 0.01, y: position.y + unit.y * 0.01, z: position.z + unit.z * 0.01,
    }), VIEWPORT);
    const plus = clipToScreen(expandRibbonVertex(m.viewProj, position, unit, 1, 3, VIEWPORT), VIEWPORT);
    const dirX = along.x - centre.x;
    const dirY = along.y - centre.y;
    const offX = plus.x - centre.x;
    const offY = plus.y - centre.y;
    const cosine = (dirX * offX + dirY * offY) / (Math.hypot(dirX, dirY) * Math.hypot(offX, offY));
    assert.ok(Math.abs(cosine) < 1e-6, 'the offset was not perpendicular on screen: cos = ' + cosine);
  });

  test('a degenerate tangent gives a finite vertex instead of NaN', () => {
    // normalize of a zero vector is NaN in GLSL, and a NaN vertex silently erases the whole
    // primitive. The guard is in the generated block, so both paths have it.
    const m = cameraMatrices({ yawDeg: 0, pitchDeg: 0, distance: DEFAULT_DISTANCE }, VIEWPORT[0], VIEWPORT[1]);
    const v = expandRibbonVertex(m.viewProj, coordToVec3(0, 0, 1.001), { x: 0, y: 0, z: 0 }, 1, 2, VIEWPORT);
    for (const k of ['x', 'y', 'z', 'w']) assert.ok(Number.isFinite(v[k]), k + ' was not finite');
    assert.match(RIBBON_EXPANSION_GLSL, /length\(deltaPx\) > 0\.0/, 'the GLSL has no zero tangent guard');
  });
});

describe('depth survives the expansion', () => {
  test('both sides of a ribbon vertex carry the depth of the point they came from', () => {
    const m = cameraMatrices({ yawDeg: -45, pitchDeg: 25, distance: DEFAULT_DISTANCE }, VIEWPORT[0], VIEWPORT[1]);
    for (const [lat, lon] of [[0, 0], [45, -30], [-60, 120], [80, 170]]) {
      const p = coordToVec3(lat, lon, RENDER_RULES.arcRadius);
      const tangent = { x: 0, y: 1, z: 0 };
      const plain = transformPoint(m.viewProj, p);
      const minus = expandRibbonVertex(m.viewProj, p, tangent, -1, 4, VIEWPORT);
      const plus = expandRibbonVertex(m.viewProj, p, tangent, 1, 4, VIEWPORT);
      assert.equal(minus.z, plain.z, 'depth changed on the minus side at ' + lat + ', ' + lon);
      assert.equal(plus.z, plain.z, 'depth changed on the plus side at ' + lat + ', ' + lon);
      assert.equal(minus.w, plain.w);
    }
  });

  test('a point at the arc radius is nearer than the surface beneath it, from any angle', () => {
    // This is the arithmetic behind arcRadius being 1.001 and not 1.0. If an arc shared the
    // surface depth it would z fight, and if it were below it, it would be occluded by the
    // planet it is drawn on.
    const m = cameraMatrices({ yawDeg: 10, pitchDeg: -20, distance: DEFAULT_DISTANCE }, VIEWPORT[0], VIEWPORT[1]);
    for (const [lat, lon] of [[0, 10], [30, -20], [-45, 60]]) {
      const surface = transformPoint(m.viewProj, coordToVec3(lat, lon, 1));
      const arc = transformPoint(m.viewProj, coordToVec3(lat, lon, RENDER_RULES.arcRadius));
      assert.ok(arc.z / arc.w < surface.z / surface.w,
        'the arc was not in front of the surface at ' + lat + ', ' + lon);
    }
  });
});

describe('clipToScreen', () => {
  test('the centre of clip space is the centre of the viewport', () => {
    const s = clipToScreen({ x: 0, y: 0, z: 0, w: 1 }, VIEWPORT);
    assert.equal(s.x, VIEWPORT[0] / 2);
    assert.equal(s.y, VIEWPORT[1] / 2);
  });

  test('y is flipped, because a framebuffer row index counts down and clip space counts up', () => {
    const top = clipToScreen({ x: 0, y: 1, z: 0, w: 1 }, VIEWPORT);
    const bottom = clipToScreen({ x: 0, y: -1, z: 0, w: 1 }, VIEWPORT);
    assert.equal(top.y, 0);
    assert.equal(bottom.y, VIEWPORT[1]);
  });

  test('the perspective divide is applied to depth as well as position', () => {
    const s = clipToScreen({ x: 0, y: 0, z: 3, w: 6 }, VIEWPORT);
    assert.equal(s.z, 0.5);
  });
});
