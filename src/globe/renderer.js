// The WebGL2 renderer. GLOBE team. DESIGN 6.1, 6.2, 6.5, globe contract RENDER_RULES.
//
// Hand rolled. No framework, no library, no texture, no scene graph. The scene is one sphere,
// one shell, a few thousand ribbon triangles and a dozen quads, and DESIGN 6.1 measured what
// every framework would have cost to carry it: the smallest was eight times the entire payload
// of this product.
//
// THE FIVE DECISIONS THIS FILE IMPLEMENTS, each of which the contract pins rather than leaves
// to taste, and each of which is asserted by test/globe-webgl.test.js against a recording
// context:
//
//   1. gl.LINES is never called. Not once, not for a debug overlay, not for the graticule
//      there is no graticule for. ALIASED_LINE_WIDTH_RANGE is permitted to top out at 1 and
//      frequently does, and that single fact is why most globes look the way they look.
//   2. DEPTH_TEST is enabled and stays enabled, with LEQUAL, for every pass. The arcs ride at
//      radius 1.001 and the planet is at 1.0, so the far half of every arc fails the test and
//      is occluded by the limb. DESIGN 5 names this as the first thing a graphics literate
//      reader checks.
//   3. The planet writes depth. Nothing after it does. An arc that wrote depth would occlude
//      the arc drawn after it at every crossing, and the crossings are where the picture is.
//   4. The device pixel ratio is capped by the caller at 2 and the drawing buffer is sized
//      from that. Fill rate, not vertex count, is what melts a phone (DESIGN 6.5).
//   5. Every uniform colour comes from src/core/tokens.js through ./palette.js. There is no
//      colour literal in this file.
//
// Browser only: this module touches a WebGL2 context. Everything it needs to decide anything
// lives in the isomorphic modules beside it, which is why the reference rasterizer and the
// tests can run without a GPU.

import { PROGRAMS } from './shaders.js';
import { toFloat32 } from './mat4.js';
import { RIBBON_STRIDE, MARKER_STRIDE, buildMarkers } from './geometry.js';

/** Bytes per float, named so the stride arithmetic below reads as arithmetic. */
const F32 = 4;

/**
 * Try to obtain a WebGL2 context.
 *
 * WebGL1 is not a fallback. The ribbon expansion needs nothing exotic, but the product's
 * honest position is that a browser without WebGL2 gets the SVG map in ./fallback.js, which is
 * the same coastline in the same palette and is a real picture rather than a degraded one.
 * Silently shipping a second renderer for a shrinking population is how a code base grows a
 * path nobody tests.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {WebGL2RenderingContext|null} null when WebGL2 is unavailable or blocked.
 */
export function getWebGl2(canvas) {
  try {
    return canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      // The capture rig reads the buffer back after a draw (DESIGN 8.5), and without this the
      // contents are undefined by the time it looks.
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
      desynchronized: false,
    });
  } catch {
    return null;
  }
}

/** @param {WebGL2RenderingContext} gl @param {number} type @param {string} src */
function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('shader compile failed: ' + log);
  }
  return sh;
}

/** @param {WebGL2RenderingContext} gl @param {string} vsSrc @param {string} fsSrc */
function link(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error('program link failed: ' + log);
  }
  return p;
}

/**
 * Cache uniform and attribute locations once. Looking a uniform up per frame is a string hash
 * per draw call, which is exactly the kind of cost that is invisible on a desktop and shows up
 * on the phone the product claims to work on.
 * @param {WebGL2RenderingContext} gl @param {WebGLProgram} program @param {string[]} names
 */
function uniforms(gl, program, names) {
  /** @type {Record<string, WebGLUniformLocation|null>} */
  const out = {};
  for (const n of names) out[n] = gl.getUniformLocation(program, n);
  return out;
}

/**
 * Create the renderer. Compiles four programs and uploads the two static meshes. Everything
 * after this is draw calls and uniform writes.
 *
 * @param {WebGL2RenderingContext} gl
 * @returns {{
 *   render: (scene: import('./scene.js').Scene) => void,
 *   resize: (widthPx:number, heightPx:number) => void,
 *   destroy: () => void,
 *   maxLineWidth: number,
 * }}
 */
export function createGlobeRenderer(gl) {
  const prog = {
    sphere: link(gl, PROGRAMS.sphere.vs, PROGRAMS.sphere.fs),
    atmosphere: link(gl, PROGRAMS.atmosphere.vs, PROGRAMS.atmosphere.fs),
    ribbon: link(gl, PROGRAMS.ribbon.vs, PROGRAMS.ribbon.fs),
    marker: link(gl, PROGRAMS.marker.vs, PROGRAMS.marker.fs),
  };

  const u = {
    sphere: uniforms(gl, prog.sphere, ['uViewProj', 'uEye', 'uRadius', 'uOcean', 'uOceanRim', 'uRimAlpha']),
    atmosphere: uniforms(gl, prog.atmosphere, ['uViewProj', 'uEye', 'uRadius', 'uAtmosphere', 'uAlpha']),
    ribbon: uniforms(gl, prog.ribbon, ['uViewProj', 'uViewportPx', 'uHalfWidthPx', 'uColor',
      'uAlpha', 'uProgress', 'uFeather', 'uFlowAlpha', 'uFlowPhase', 'uDashCount']),
    marker: uniforms(gl, prog.marker, ['uViewProj', 'uViewportPx', 'uSizePx', 'uColor', 'uAlpha', 'uFeather']),
  };

  /**
   * The reported line width range, recorded at construction. Nothing in this renderer draws a
   * line, and this is here so the value can be printed in the self test: on a great many real
   * machines it reads [1, 1], which is the evidence for the decision rather than an assertion
   * about it.
   */
  const lineRange = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE);
  const maxLineWidth = lineRange ? lineRange[1] : 1;

  /** @type {WeakMap<object, {vao:WebGLVertexArrayObject, vbo:WebGLBuffer, ibo:WebGLBuffer, count:number}>} */
  const ribbonUploads = new WeakMap();
  /** @type {{vao:WebGLVertexArrayObject, vbo:WebGLBuffer, ibo:WebGLBuffer, count:number}|null} */
  let sphereUpload = null;
  /** @type {{vao:WebGLVertexArrayObject, vbo:WebGLBuffer, ibo:WebGLBuffer, count:number}|null} */
  let markerUpload = null;
  /** @type {object[]} */
  const owned = [];

  function uploadSphere(mesh) {
    if (sphereUpload) return sphereUpload;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    sphereUpload = { vao, vbo, ibo, count: mesh.indices.length };
    owned.push(sphereUpload);
    return sphereUpload;
  }

  function uploadRibbon(mesh) {
    const hit = ribbonUploads.get(mesh);
    if (hit) return hit;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    const stride = RIBBON_STRIDE * F32;
    // 0 position, 1 tangent, 2 side, 3 arcT. The order matches the declaration order in
    // RIBBON_VS, and the locations are bound by index rather than by name so the shader and
    // this file cannot disagree about which attribute is which without failing loudly.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * F32);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * F32);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * F32);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const rec = { vao, vbo, ibo, count: mesh.indices.length };
    ribbonUploads.set(mesh, rec);
    owned.push(rec);
    return rec;
  }

  function uploadMarkers(coords, radius) {
    const m = buildMarkers(coords, radius);
    if (!markerUpload) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const stride = MARKER_STRIDE * F32;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 3 * F32);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bindVertexArray(null);
      markerUpload = { vao, vbo, ibo, count: 0 };
      owned.push(markerUpload);
    }
    gl.bindVertexArray(markerUpload.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, markerUpload.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, markerUpload.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    markerUpload.count = m.indices.length;
    return markerUpload;
  }

  /** @param {import('./scene.js').Scene} scene */
  function render(scene) {
    const [w, h] = scene.viewportPx;
    gl.viewport(0, 0, w, h);

    const pal = scene.palette;
    gl.clearColor(pal.ocean[0], pal.ocean[1], pal.ocean[2], 1);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const vp = toFloat32(scene.matrices.viewProj);
    const eye = scene.matrices.eye;

    // 1. The planet. Writes depth. Everything that follows is occluded by it, which is the
    //    entire mechanism DESIGN 5 is describing.
    const sph = uploadSphere(scene.sphere);
    gl.useProgram(prog.sphere);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.uniformMatrix4fv(u.sphere.uViewProj, false, vp);
    gl.uniform3f(u.sphere.uEye, eye.x, eye.y, eye.z);
    gl.uniform1f(u.sphere.uRadius, 1);
    gl.uniform3fv(u.sphere.uOcean, pal.ocean);
    gl.uniform3fv(u.sphere.uOceanRim, pal.oceanRim);
    gl.uniform1f(u.sphere.uRimAlpha, 0.85);
    gl.bindVertexArray(sph.vao);
    gl.drawElements(gl.TRIANGLES, sph.count, gl.UNSIGNED_INT, 0);

    // 2. The atmosphere. Far faces only, depth tested, depth NOT written.
    gl.useProgram(prog.atmosphere);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    setBlend(scene.atmosphereBlend);
    gl.cullFace(gl.FRONT);
    gl.uniformMatrix4fv(u.atmosphere.uViewProj, false, vp);
    gl.uniform3f(u.atmosphere.uEye, eye.x, eye.y, eye.z);
    gl.uniform1f(u.atmosphere.uRadius, scene.atmosphereRadius);
    gl.uniform3fv(u.atmosphere.uAtmosphere, pal.atmosphere);
    gl.uniform1f(u.atmosphere.uAlpha, scene.atmosphereAlpha);
    gl.drawElements(gl.TRIANGLES, sph.count, gl.UNSIGNED_INT, 0);

    // 3 and 4. Every stroke. A ribbon is two sided by construction, so culling comes off.
    gl.useProgram(prog.ribbon);
    gl.disable(gl.CULL_FACE);
    setBlend('over');
    gl.uniformMatrix4fv(u.ribbon.uViewProj, false, vp);
    gl.uniform2f(u.ribbon.uViewportPx, w, h);
    gl.uniform1f(u.ribbon.uDashCount, scene.dashCount);
    gl.uniform1f(u.ribbon.uFlowPhase, scene.flowPhase);
    for (const stroke of scene.strokes) {
      const half = stroke.widthPx / 2;
      const rec = uploadRibbon(stroke.mesh);
      gl.uniform1f(u.ribbon.uHalfWidthPx, half);
      gl.uniform1f(u.ribbon.uFeather, Math.min(1, 1 / Math.max(half, 0.5)));
      gl.uniform3fv(u.ribbon.uColor, stroke.rgb);
      gl.uniform1f(u.ribbon.uAlpha, stroke.alpha);
      gl.uniform1f(u.ribbon.uProgress, stroke.progress);
      gl.uniform1f(u.ribbon.uFlowAlpha, stroke.flowAlpha);
      gl.bindVertexArray(rec.vao);
      gl.drawElements(gl.TRIANGLES, rec.count, gl.UNSIGNED_INT, 0);
    }

    // 5. Markers. One buffer, one draw per marker, because there are at most thirteen of them
    //    and an instanced path for thirteen quads is complexity bought with nothing.
    gl.useProgram(prog.marker);
    gl.uniformMatrix4fv(u.marker.uViewProj, false, vp);
    gl.uniform2f(u.marker.uViewportPx, w, h);
    const mk = uploadMarkers(scene.markers, scene.arcRadius);
    gl.bindVertexArray(mk.vao);
    scene.markers.forEach((m, i) => {
      gl.uniform1f(u.marker.uSizePx, m.sizePx);
      gl.uniform3fv(u.marker.uColor, m.rgb);
      gl.uniform1f(u.marker.uAlpha, m.alpha);
      gl.uniform1f(u.marker.uFeather, Math.min(0.9, 1.5 / Math.max(m.sizePx, 1)));
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, i * 6 * 4);
    });

    gl.bindVertexArray(null);
    gl.depthMask(true);
  }

  /** @param {'add'|'over'} mode */
  function setBlend(mode) {
    if (mode === 'add') {
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      // Every fragment shader in this renderer writes PREMULTIPLIED colour, so the source
      // factor is ONE and not SRC_ALPHA. Writing SRC_ALPHA here would multiply alpha in twice
      // and darken every stroke by its own coverage.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  /**
   * Size the drawing buffer. The caller has already applied the device pixel ratio cap, so the
   * numbers arriving here are device pixels and this does not second guess them.
   * @param {number} widthPx @param {number} heightPx
   */
  function resize(widthPx, heightPx) {
    const c = gl.canvas;
    if (c.width !== widthPx) c.width = widthPx;
    if (c.height !== heightPx) c.height = heightPx;
    gl.viewport(0, 0, widthPx, heightPx);
  }

  function destroy() {
    for (const rec of owned) {
      gl.deleteVertexArray(rec.vao);
      gl.deleteBuffer(rec.vbo);
      gl.deleteBuffer(rec.ibo);
    }
    owned.length = 0;
    sphereUpload = null;
    markerUpload = null;
    for (const p of Object.values(prog)) gl.deleteProgram(p);
  }

  return { render, resize, destroy, maxLineWidth };
}
