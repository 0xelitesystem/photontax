// The deterministic reference rasterizer. GLOBE team. DESIGN 7 (verification).
//
// WHY THIS EXISTS. DESIGN 5 names one detail as the thing a graphics literate reader checks
// first: arcs on the far side of the planet must be occluded by the Earth, and almost no globe
// on GitHub gets it right. A claim like that has to be TESTED, and there is no WebGL2 context
// in a Node test runner. So the same scene description that feeds the GPU also feeds this: a
// small, exact, software rasterizer with a real depth buffer, which draws to an offscreen
// buffer that a test can read pixel by pixel.
//
// WHAT IT PROVES AND WHAT IT DOES NOT. It runs the SAME camera matrices, the SAME great circle
// sampling and the SAME ribbon expansion as the GPU path, because all three come from modules
// both paths import. So it proves the geometry, the depth ordering and the occlusion. It does
// not claim to be pixel identical to the GPU: it interpolates the planet shading per vertex
// where the fragment shader does it per fragment, and it does no multisampling. Every
// assertion written against it is a geometric one for that reason, and the negative control in
// test/globe-render.test.js turns the depth test OFF and requires the far side arc to become
// visible, so the assertion is proven able to fail.
//
// Isomorphic: no node:* imports and no DOM. Plain typed arrays in, plain typed arrays out.

import { expandRibbonVertex, clipToScreen } from './pipeline.js';
import { coordToVec3 } from './camera.js';

/**
 * @typedef {Object} Framebuffer
 * @property {number} width
 * @property {number} height
 * @property {Uint8ClampedArray} rgba Four bytes per pixel, row major, top row first.
 * @property {Float64Array} depth Clip space z after the divide, in [-1, 1]. Nearer is smaller.
 */

/**
 * @param {number} width @param {number} height @param {[number,number,number]} clearRgb
 * @returns {Framebuffer}
 */
export function createFramebuffer(width, height, clearRgb) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4 + 0] = Math.round(clearRgb[0] * 255);
    rgba[i * 4 + 1] = Math.round(clearRgb[1] * 255);
    rgba[i * 4 + 2] = Math.round(clearRgb[2] * 255);
    rgba[i * 4 + 3] = 255;
  }
  const depth = new Float64Array(width * height);
  depth.fill(Infinity);
  return { width, height, rgba, depth };
}

/** @param {Framebuffer} fb @param {number} x @param {number} y @returns {[number,number,number,number]} */
export function pixelAt(fb, x, y) {
  if (x < 0 || y < 0 || x >= fb.width || y >= fb.height) {
    throw new RangeError('pixelAt: (' + x + ', ' + y + ') is outside the ' + fb.width + ' by '
      + fb.height + ' buffer');
  }
  const i = (y * fb.width + x) * 4;
  return [fb.rgba[i], fb.rgba[i + 1], fb.rgba[i + 2], fb.rgba[i + 3]];
}

/**
 * One triangle, screen space, with per vertex colour and coverage attributes.
 *
 * Depth is interpolated linearly in SCREEN space, which is what hardware does after the
 * perspective divide and is the reason a depth buffer is correct at all. The colour and
 * coverage attributes are interpolated perspective correctly, by carrying attribute over w and
 * dividing by the interpolated one over w.
 *
 * @param {Framebuffer} fb
 * @param {{x:number,y:number,z:number,w:number}[]} v Three screen space vertices.
 * @param {number[][]} attrs Three attribute rows, same length each: [r, g, b, alpha, side, arcT].
 * @param {{depthTest:boolean, depthWrite:boolean, blend:'over'|'add', shade:(a:number[])=>[number,number,number,number]}} opts
 */
export function rasterTriangle(fb, v, attrs, opts) {
  const minX = Math.max(0, Math.floor(Math.min(v[0].x, v[1].x, v[2].x)));
  const maxX = Math.min(fb.width - 1, Math.ceil(Math.max(v[0].x, v[1].x, v[2].x)));
  const minY = Math.max(0, Math.floor(Math.min(v[0].y, v[1].y, v[2].y)));
  const maxY = Math.min(fb.height - 1, Math.ceil(Math.max(v[0].y, v[1].y, v[2].y)));
  if (minX > maxX || minY > maxY) return;

  const area = (v[1].x - v[0].x) * (v[2].y - v[0].y) - (v[2].x - v[0].x) * (v[1].y - v[0].y);
  if (area === 0) return;
  const inv = 1 / area;

  const attrCount = attrs[0].length;
  const interp = new Array(attrCount);

  for (let py = minY; py <= maxY; py++) {
    const sy = py + 0.5;
    for (let px = minX; px <= maxX; px++) {
      const sx = px + 0.5;
      const w0 = ((v[1].x - sx) * (v[2].y - sy) - (v[2].x - sx) * (v[1].y - sy)) * inv;
      const w1 = ((v[2].x - sx) * (v[0].y - sy) - (v[0].x - sx) * (v[2].y - sy)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;

      const z = w0 * v[0].z + w1 * v[1].z + w2 * v[2].z;
      const idx = py * fb.width + px;
      if (opts.depthTest && z > fb.depth[idx]) continue;

      const oneOverW = w0 / v[0].w + w1 / v[1].w + w2 / v[2].w;
      for (let a = 0; a < attrCount; a++) {
        interp[a] = (w0 * attrs[0][a] / v[0].w + w1 * attrs[1][a] / v[1].w + w2 * attrs[2][a] / v[2].w) / oneOverW;
      }

      const shaded = opts.shade(interp);
      const sa = shaded[3];
      if (sa <= 0) continue;

      const o = idx * 4;
      if (opts.blend === 'add') {
        fb.rgba[o + 0] = fb.rgba[o + 0] + shaded[0] * 255;
        fb.rgba[o + 1] = fb.rgba[o + 1] + shaded[1] * 255;
        fb.rgba[o + 2] = fb.rgba[o + 2] + shaded[2] * 255;
      } else {
        // Premultiplied source over, matching the blend the renderer sets.
        fb.rgba[o + 0] = shaded[0] * 255 + fb.rgba[o + 0] * (1 - sa);
        fb.rgba[o + 1] = shaded[1] * 255 + fb.rgba[o + 1] * (1 - sa);
        fb.rgba[o + 2] = shaded[2] * 255 + fb.rgba[o + 2] * (1 - sa);
      }
      fb.rgba[o + 3] = 255;
      if (opts.depthWrite) fb.depth[idx] = z;
    }
  }
}

/**
 * Draw a whole scene. The draw ORDER here is the render order, and it is the contract:
 *
 *   1. the planet, depth written, because everything after it is occluded by it,
 *   2. the atmosphere shell, depth tested, not written, additive,
 *   3. the coastline ribbon,
 *   4. the arcs, idle then selected then worst,
 *   5. the endpoint markers.
 *
 * @param {import('./scene.js').Scene} scene
 * @param {{depthTest?:boolean, strokeDepthTest?:boolean}} [opts] Both default to true and
 *   nothing on the render path ever passes either. They exist for the NEGATIVE CONTROL, which
 *   is the only way to prove the occlusion assertion is capable of failing.
 *
 *   strokeDepthTest is the SURGICAL one and it is the one the test uses: it disables the depth
 *   test for the strokes and the markers only, leaving the planet exactly as it was, so the
 *   sole difference between the two images is whether the far side of an arc is occluded.
 *   depthTest disables it for everything, which makes the more dramatic picture that
 *   scripts/globe-reference-render.mjs writes out, and a picture is not an assertion.
 * @returns {Framebuffer}
 */
export function rasterizeScene(scene, opts = {}) {
  const depthTest = opts.depthTest !== false;
  const strokeDepthTest = opts.strokeDepthTest !== undefined ? opts.strokeDepthTest : depthTest;
  const [width, height] = scene.viewportPx;
  const fb = createFramebuffer(width, height, scene.palette.ocean);
  const vp = /** @type {[number,number]} */ (scene.viewportPx);
  const vpm = scene.matrices.viewProj;
  const eye = scene.matrices.eye;

  // 1. The planet.
  const sph = scene.sphere;
  const ocean = scene.palette.ocean;
  const rim = scene.palette.oceanRim;
  const rimAlpha = 0.85;
  const sphereShade = (a) => [a[0], a[1], a[2], 1];
  for (let t = 0; t < sph.indices.length; t += 3) {
    const vs = [];
    const at = [];
    for (let k = 0; k < 3; k++) {
      const i = sph.indices[t + k] * 3;
      const p = { x: sph.positions[i], y: sph.positions[i + 1], z: sph.positions[i + 2] };
      vs.push(clipToScreen(mulPoint(vpm, p), vp));
      const vx = eye.x - p.x;
      const vy = eye.y - p.y;
      const vz = eye.z - p.z;
      const vl = Math.hypot(vx, vy, vz) || 1;
      const facing = Math.max(0, Math.min(1, (p.x * vx + p.y * vy + p.z * vz) / vl));
      const f = Math.pow(1 - facing, 3) * rimAlpha;
      at.push([
        ocean[0] + (rim[0] - ocean[0]) * f,
        ocean[1] + (rim[1] - ocean[1]) * f,
        ocean[2] + (rim[2] - ocean[2]) * f,
      ]);
    }
    rasterTriangle(fb, vs, at, { depthTest, depthWrite: true, blend: 'over', shade: sphereShade });
  }

  // 2. The atmosphere shell, far half only. Front faces are culled on the GPU; here the same
  // half is selected by testing the triangle centroid against the view direction, which is the
  // same test the hardware does per triangle from the winding.
  const atm = scene.palette.atmosphere;
  const atmAlpha = scene.atmosphereAlpha;
  const R = scene.atmosphereRadius;
  const atmShade = (a) => [a[0] * atm[0], a[0] * atm[1], a[0] * atm[2], a[0]];
  for (let t = 0; t < sph.indices.length; t += 3) {
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const i = sph.indices[t + k] * 3;
      pts.push({ x: sph.positions[i] * R, y: sph.positions[i + 1] * R, z: sph.positions[i + 2] * R });
    }
    const cx = (pts[0].x + pts[1].x + pts[2].x) / 3;
    const cy = (pts[0].y + pts[1].y + pts[2].y) / 3;
    const cz = (pts[0].z + pts[1].z + pts[2].z) / 3;
    const toEye = { x: eye.x - cx, y: eye.y - cy, z: eye.z - cz };
    if (cx * toEye.x + cy * toEye.y + cz * toEye.z > 0) continue;   // a near face, culled
    const vs = [];
    const at = [];
    for (const p of pts) {
      vs.push(clipToScreen(mulPoint(vpm, p), vp));
      // The impact parameter of the eye ray through this point, exactly as ATMOSPHERE_FS
      // computes it. See the shader for why it is this and not a Fresnel term on the shell.
      const rx = p.x - eye.x;
      const ry = p.y - eye.y;
      const rz = p.z - eye.z;
      const rl = Math.hypot(rx, ry, rz) || 1;
      const ux = rx / rl;
      const uy = ry / rl;
      const uz = rz / rl;
      const d = eye.x * ux + eye.y * uy + eye.z * uz;
      const b = Math.hypot(eye.x - ux * d, eye.y - uy * d, eye.z - uz * d);
      const tt = Math.max(0, Math.min(1, (R - b) / (R - 1)));
      at.push([Math.pow(tt, 3) * atmAlpha]);
    }
    rasterTriangle(fb, vs, at, { depthTest, depthWrite: false, blend: scene.atmosphereBlend, shade: atmShade });
  }

  // 3 and 4. Every stroke, in the order scene.js put them in.
  for (const stroke of scene.strokes) {
    drawRibbon(fb, stroke, vpm, vp, strokeDepthTest);
  }

  // 5. Markers.
  for (const m of scene.markers) {
    drawMarker(fb, m, vpm, vp, strokeDepthTest, scene.arcRadius);
  }

  return fb;
}

/**
 * @param {Framebuffer} fb
 * @param {import('./scene.js').Stroke} stroke
 */
function drawRibbon(fb, stroke, vpm, vp, depthTest) {
  const half = stroke.widthPx / 2;
  const feather = Math.min(1, 1 / Math.max(half, 0.5));
  const rgb = stroke.rgb;
  const alpha = stroke.alpha;
  const progress = stroke.progress;
  const shade = (a) => {
    // arcT is a[1]. The draw in discards rather than clipping, exactly as the shader does.
    if (a[1] > progress) return [0, 0, 0, 0];
    const across = 1 - Math.abs(a[0]);
    const cover = smoothstep(0, feather, across);
    const A = alpha * cover;
    return [rgb[0] * A, rgb[1] * A, rgb[2] * A, A];
  };

  const mesh = stroke.mesh;
  const stride = 8;
  const clipCache = new Map();
  const clipFor = (vi) => {
    let c = clipCache.get(vi);
    if (c) return c;
    const o = vi * stride;
    const pos = { x: mesh.vertices[o], y: mesh.vertices[o + 1], z: mesh.vertices[o + 2] };
    const tan = { x: mesh.vertices[o + 3], y: mesh.vertices[o + 4], z: mesh.vertices[o + 5] };
    const side = mesh.vertices[o + 6];
    const arcT = mesh.vertices[o + 7];
    const clip = expandRibbonVertex(vpm, pos, tan, side, half, vp);
    c = { screen: clipToScreen(clip, vp), attrs: [side, arcT] };
    clipCache.set(vi, c);
    return c;
  };

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = clipFor(mesh.indices[i]);
    const b = clipFor(mesh.indices[i + 1]);
    const c = clipFor(mesh.indices[i + 2]);
    rasterTriangle(fb, [a.screen, b.screen, c.screen], [a.attrs, b.attrs, c.attrs], {
      depthTest, depthWrite: false, blend: 'over', shade,
    });
  }
}

function drawMarker(fb, m, vpm, vp, depthTest, radius) {
  const p = coordToVec3(m.lat, m.lon, radius);
  const clip = mulPoint(vpm, p);
  const s = clipToScreen(clip, vp);
  const size = m.sizePx;
  const feather = Math.min(0.9, 1.5 / Math.max(size, 1));
  const rgb = m.rgb;
  const shade = (a) => {
    const r = Math.hypot(a[0], a[1]);
    if (r > 1) return [0, 0, 0, 0];
    const cover = (1 - smoothstep(1 - feather, 1, r)) * m.alpha;
    return [rgb[0] * cover, rgb[1] * cover, rgb[2] * cover, cover];
  };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const vs = corners.map((c) => ({ x: s.x + c[0] * size, y: s.y - c[1] * size, z: s.z, w: s.w }));
  const at = corners.map((c) => [c[0], c[1]]);
  rasterTriangle(fb, [vs[0], vs[1], vs[2]], [at[0], at[1], at[2]], { depthTest, depthWrite: false, blend: 'over', shade });
  rasterTriangle(fb, [vs[0], vs[2], vs[3]], [at[0], at[2], at[3]], { depthTest, depthWrite: false, blend: 'over', shade });
}

function mulPoint(m, p) {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
    w: m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15],
  };
}

function smoothstep(edge0, edge1, x) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Where a coordinate lands in the framebuffer. The tests use it to ask about a specific place
 * on the planet rather than a magic pixel index, so a change in framing does not turn every
 * assertion into a puzzle.
 *
 * @param {import('./scene.js').Scene} scene
 * @param {{lat:number, lon:number}} coord
 * @param {number} [radius]
 * @returns {{x:number, y:number, z:number, onScreen:boolean}}
 */
export function projectCoord(scene, coord, radius) {
  const r = typeof radius === 'number' ? radius : scene.arcRadius;
  const p = coordToVec3(coord.lat, coord.lon, r);
  const s = clipToScreen(mulPoint(scene.matrices.viewProj, p), /** @type {[number,number]} */ (scene.viewportPx));
  return {
    x: Math.round(s.x - 0.5),
    y: Math.round(s.y - 0.5),
    z: s.z,
    onScreen: s.x >= 0 && s.y >= 0 && s.x < scene.viewportPx[0] && s.y < scene.viewportPx[1],
  };
}
