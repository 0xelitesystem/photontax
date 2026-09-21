// The WebGL2 renderer, against a RECORDING CONTEXT. GLOBE team. DESIGN 6.1, 6.5.
//
// There is no GPU in a Node test runner, so the renderer is driven against a context that
// records every call it receives. That is enough to assert the things that actually decide
// whether this globe is the good kind or the usual kind, all of which are STATE decisions
// rather than pixel ones:
//
//   never gl.LINES, depth testing on with LEQUAL, the planet the only thing that writes depth,
//   the draw order, the cull face flip for the atmosphere shell, premultiplied blending, and
//   one upload per mesh rather than one per frame.
//
// The pixels are proven separately, in test/globe-render.test.js, through a reference
// rasterizer that shares this renderer's camera, geometry and ribbon expansion.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createGlobeRenderer, getWebGl2 } from '../src/globe/renderer.js';
import { buildScene, resetSceneCache } from '../src/globe/scene.js';
import { replayGlobeInput, REPLAY_CAMERA, REPLAY_VIEWPORT } from '../src/globe/replay.js';
import { RENDER_RULES } from '../src/core/contracts/globe.js';

/** The enum values are arbitrary but distinct, which is all the renderer relies on. */
const ENUM = [
  'TRIANGLES', 'TRIANGLE_STRIP', 'TRIANGLE_FAN', 'LINES', 'LINE_STRIP', 'LINE_LOOP', 'POINTS',
  'DEPTH_TEST', 'BLEND', 'CULL_FACE', 'LEQUAL', 'LESS', 'BACK', 'FRONT', 'FRONT_AND_BACK',
  'ONE', 'ZERO', 'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'UNSIGNED_INT', 'UNSIGNED_SHORT', 'FLOAT',
  'ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER', 'STATIC_DRAW', 'DYNAMIC_DRAW',
  'COLOR_BUFFER_BIT', 'DEPTH_BUFFER_BIT', 'VERTEX_SHADER', 'FRAGMENT_SHADER',
  'COMPILE_STATUS', 'LINK_STATUS', 'ALIASED_LINE_WIDTH_RANGE',
];

/**
 * A recording WebGL2 context.
 *
 * It reports ALIASED_LINE_WIDTH_RANGE as [1, 1], which is what a great many real ANGLE and
 * Direct3D backends report and is the entire reason this renderer never draws a line.
 */
function recordingGl() {
  /** @type {{m:string, a:any[]}[]} */
  const log = [];
  let nextId = 1;
  const obj = (kind) => ({ kind, id: nextId++ });
  const gl = {
    canvas: { width: 0, height: 0 },
    log,
    calls: (name) => log.filter((e) => e.m === name),
    indexOfCall: (name, predicate) => log.findIndex(
      (e) => e.m === name && (!predicate || predicate(e.a)),
    ),
  };
  for (const name of ENUM) gl[name] = 'GL_' + name;

  const record = (m, ...a) => { log.push({ m, a }); };
  const methods = {
    createShader: (t) => { record('createShader', t); return obj('shader'); },
    shaderSource: (s, src) => record('shaderSource', s, src),
    compileShader: (s) => record('compileShader', s),
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: (s) => record('deleteShader', s),
    createProgram: () => { record('createProgram'); return obj('program'); },
    attachShader: (p, s) => record('attachShader', p, s),
    linkProgram: (p) => record('linkProgram', p),
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    deleteProgram: (p) => record('deleteProgram', p),
    getUniformLocation: (p, n) => ({ kind: 'uniform', program: p.id, name: n }),
    getParameter: (p) => (p === gl.ALIASED_LINE_WIDTH_RANGE ? [1, 1] : null),
    createVertexArray: () => { record('createVertexArray'); return obj('vao'); },
    bindVertexArray: (v) => record('bindVertexArray', v),
    deleteVertexArray: (v) => record('deleteVertexArray', v),
    createBuffer: () => { record('createBuffer'); return obj('buffer'); },
    bindBuffer: (t, b) => record('bindBuffer', t, b),
    bufferData: (t, d, u) => record('bufferData', t, d && d.length, u),
    deleteBuffer: (b) => record('deleteBuffer', b),
    enableVertexAttribArray: (i) => record('enableVertexAttribArray', i),
    vertexAttribPointer: (...a) => record('vertexAttribPointer', ...a),
    viewport: (...a) => record('viewport', ...a),
    clearColor: (...a) => record('clearColor', ...a),
    clearDepth: (d) => record('clearDepth', d),
    clear: (m) => record('clear', m),
    enable: (c) => record('enable', c),
    disable: (c) => record('disable', c),
    depthFunc: (f) => record('depthFunc', f),
    depthMask: (m) => record('depthMask', m),
    cullFace: (f) => record('cullFace', f),
    blendFunc: (s, d) => record('blendFunc', s, d),
    useProgram: (p) => record('useProgram', p),
    uniformMatrix4fv: (l, t, v) => record('uniformMatrix4fv', l && l.name, t, v.length),
    uniform1f: (l, v) => record('uniform1f', l && l.name, v),
    uniform2f: (l, a, b) => record('uniform2f', l && l.name, a, b),
    uniform3f: (l, a, b, c) => record('uniform3f', l && l.name, a, b, c),
    uniform3fv: (l, v) => record('uniform3fv', l && l.name, Array.from(v)),
    drawElements: (...a) => record('drawElements', ...a),
    drawArrays: (...a) => record('drawArrays', ...a),
  };
  return Object.assign(gl, methods);
}

function fixtureScene(theme = 'dark') {
  resetSceneCache();
  return buildScene(replayGlobeInput({ theme }), {
    camera: REPLAY_CAMERA,
    widthPx: REPLAY_VIEWPORT.widthPx,
    heightPx: REPLAY_VIEWPORT.heightPx,
    devicePixelRatio: 1,
    timeSeconds: 0,
  });
}

describe('never a line primitive, anywhere, for any reason', () => {
  test('the contract says so, and it is not advisory', () => {
    assert.equal(RENDER_RULES.useLineDrawMode, false);
  });

  test('no draw call uses LINES, LINE_STRIP, LINE_LOOP or POINTS', () => {
    const gl = recordingGl();
    createGlobeRenderer(gl).render(fixtureScene());
    const banned = new Set([gl.LINES, gl.LINE_STRIP, gl.LINE_LOOP, gl.POINTS]);
    const draws = [...gl.calls('drawElements'), ...gl.calls('drawArrays')];
    assert.ok(draws.length > 5, 'nothing was drawn, so this assertion proves nothing');
    for (const d of draws) {
      assert.ok(!banned.has(d.a[0]), 'a draw call used ' + d.a[0] + '. The usable maximum of '
        + 'ALIASED_LINE_WIDTH_RANGE is permitted to be 1 and frequently is, which is the whole '
        + 'reason this product expands every stroke into a ribbon.');
      assert.equal(d.a[0], gl.TRIANGLES);
    }
  });

  test('the renderer records what the context reports for the line width range', () => {
    // Evidence for the decision rather than an assertion about it. The self test can print it.
    const gl = recordingGl();
    assert.equal(createGlobeRenderer(gl).maxLineWidth, 1);
  });

  test('the source contains no gl.LINES reference outside a comment', async () => {
    const { readFile } = await import('node:fs/promises');
    const url = new URL('../src/globe/renderer.js', import.meta.url);
    const text = await readFile(url, 'utf8');
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    assert.ok(!/gl\.LINE/.test(code), 'renderer.js references gl.LINE outside a comment');
  });
});

describe('the depth state, which is the occlusion', () => {
  test('DEPTH_TEST is enabled and the comparison is LEQUAL', () => {
    const gl = recordingGl();
    createGlobeRenderer(gl).render(fixtureScene());
    assert.ok(gl.calls('enable').some((c) => c.a[0] === gl.DEPTH_TEST), 'DEPTH_TEST was never enabled');
    assert.ok(gl.calls('depthFunc').some((c) => c.a[0] === gl.LEQUAL), 'depthFunc was not LEQUAL');
    assert.equal(gl.calls('disable').filter((c) => c.a[0] === gl.DEPTH_TEST).length, 0,
      'DEPTH_TEST was disabled at some point during the frame');
  });

  test('depth testing is on BEFORE the first draw, not after it', () => {
    const gl = recordingGl();
    createGlobeRenderer(gl).render(fixtureScene());
    const enabledAt = gl.indexOfCall('enable', (a) => a[0] === gl.DEPTH_TEST);
    const firstDraw = gl.indexOfCall('drawElements');
    assert.ok(enabledAt >= 0 && enabledAt < firstDraw);
  });

  test('ONLY the planet writes depth', () => {
    // An arc that wrote depth would occlude the arc drawn after it at every crossing, and the
    // crossings are where the picture is.
    const gl = recordingGl();
    createGlobeRenderer(gl).render(fixtureScene());
    let writing = null;
    let drawsWhileWriting = 0;
    for (const e of gl.log) {
      if (e.m === 'depthMask') writing = e.a[0];
      if (e.m === 'drawElements' && writing === true) drawsWhileWriting += 1;
    }
    assert.equal(drawsWhileWriting, 1, drawsWhileWriting + ' draw calls wrote depth. Exactly one '
      + 'should: the planet.');
  });

  test('the depth buffer is cleared every frame, along with the colour buffer', () => {
    const gl = recordingGl();
    createGlobeRenderer(gl).render(fixtureScene());
    const clear = gl.calls('clear')[0];
    assert.ok(clear, 'the frame never cleared');
    assert.equal(clear.a[0], gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  });
});

describe('the draw order and the state each pass sets', () => {
  test('planet, then atmosphere, then strokes, then markers', () => {
    const gl = recordingGl();
    const scene = fixtureScene();
    createGlobeRenderer(gl).render(scene);
    const programsInOrder = gl.log.filter((e) => e.m === 'useProgram').map((e) => e.a[0].id);
    assert.equal(new Set(programsInOrder).size, 4, 'four programs, used once each, in order');
    assert.deepEqual(programsInOrder, [...programsInOrder].sort((a, b) => a - b),
      'the programs were not used in the order they were linked, so the pass order has changed');
  });

  test('the atmosphere shell is drawn with FRONT faces culled, and the planet with BACK', () => {
    const gl = recordingGl();
    createGlobeRenderer(gl).render(fixtureScene());
    const culls = gl.calls('cullFace').map((c) => c.a[0]);
    assert.deepEqual(culls, [gl.BACK, gl.FRONT],
      'the shell must show its far half, which is the half the planet occludes down to a rim');
  });

  test('culling is off for the ribbons, which are two sided by construction', () => {
    const gl = recordingGl();
    createGlobeRenderer(gl).render(fixtureScene());
    const disabledAt = gl.indexOfCall('disable', (a) => a[0] === gl.CULL_FACE);
    const lastCull = gl.log.map((e, i) => [e, i]).filter(([e]) => e.m === 'cullFace').pop()[1];
    assert.ok(disabledAt > lastCull, 'culling was not turned off before the strokes');
  });

  test('the stroke blend is premultiplied source over, not straight alpha', () => {
    // Every fragment shader here writes premultiplied colour. SRC_ALPHA as the source factor
    // would multiply alpha in twice and darken every stroke by its own coverage.
    const gl = recordingGl();
    createGlobeRenderer(gl).render(fixtureScene());
    const blends = gl.calls('blendFunc').map((c) => c.a);
    assert.ok(blends.length >= 2);
    for (const b of blends) {
      assert.notEqual(b[0], gl.SRC_ALPHA, 'a pass used straight alpha blending');
    }
    assert.ok(blends.some((b) => b[0] === gl.ONE && b[1] === gl.ONE_MINUS_SRC_ALPHA));
  });

  test('the dark theme adds the atmosphere and the light theme composites it over', () => {
    const dark = recordingGl();
    createGlobeRenderer(dark).render(fixtureScene('dark'));
    assert.deepEqual(dark.calls('blendFunc')[0].a, [dark.ONE, dark.ONE],
      'the dark atmosphere must be additive');

    const light = recordingGl();
    createGlobeRenderer(light).render(fixtureScene('light'));
    assert.deepEqual(light.calls('blendFunc')[0].a, [light.ONE, light.ONE_MINUS_SRC_ALPHA],
      'an additive shell on a light ground saturates to white and the globe dissolves');
  });

  test('the shell is drawn at the shell radius and the planet at one', () => {
    const gl = recordingGl();
    const scene = fixtureScene();
    createGlobeRenderer(gl).render(scene);
    const radii = gl.calls('uniform1f').filter((c) => c.a[0] === 'uRadius').map((c) => c.a[1]);
    assert.deepEqual(radii, [1, scene.atmosphereRadius]);
  });

  test('every stroke in the scene gets exactly one draw call', () => {
    const gl = recordingGl();
    const scene = fixtureScene();
    createGlobeRenderer(gl).render(scene);
    const progressCalls = gl.calls('uniform1f').filter((c) => c.a[0] === 'uProgress');
    assert.equal(progressCalls.length, scene.strokes.length);
  });

  test('the viewport is set from the scene, in device pixels', () => {
    const gl = recordingGl();
    const scene = fixtureScene();
    createGlobeRenderer(gl).render(scene);
    assert.deepEqual(gl.calls('viewport')[0].a, [0, 0, scene.viewportPx[0], scene.viewportPx[1]]);
    const vpUniform = gl.calls('uniform2f').find((c) => c.a[0] === 'uViewportPx');
    assert.deepEqual(vpUniform.a.slice(1), [scene.viewportPx[0], scene.viewportPx[1]]);
  });

  test('the clear colour is the ocean token, so there is no seam at the edge of the canvas', () => {
    const gl = recordingGl();
    const scene = fixtureScene();
    createGlobeRenderer(gl).render(scene);
    const c = gl.calls('clearColor')[0].a;
    assert.deepEqual(c.slice(0, 3), scene.palette.ocean);
    assert.equal(c[3], 1);
  });
});

describe('uploads happen once, not once a frame', () => {
  test('a second frame of the same scene uploads nothing new', () => {
    const gl = recordingGl();
    const r = createGlobeRenderer(gl);
    const scene = fixtureScene();
    r.render(scene);
    const afterFirst = gl.calls('bufferData').length;
    const buffersAfterFirst = gl.calls('createBuffer').length;
    r.render(scene);
    const afterSecond = gl.calls('bufferData').length;
    assert.equal(gl.calls('createBuffer').length, buffersAfterFirst,
      'a second frame allocated new buffers, so the mesh memo in scene.js is not holding');
    // The marker buffer is genuinely dynamic and is rewritten per frame. Nothing else is.
    assert.equal(afterSecond - afterFirst, 2,
      'a second frame re uploaded ' + (afterSecond - afterFirst) + ' buffers. Only the two '
      + 'marker buffers should be rewritten.');
  });

  test('the ribbon attribute layout matches the stride the geometry module publishes', async () => {
    const { RIBBON_STRIDE } = await import('../src/globe/geometry.js');
    const gl = recordingGl();
    createGlobeRenderer(gl).render(fixtureScene());
    const ribbonPointers = gl.calls('vertexAttribPointer').filter((c) => c.a[4] === RIBBON_STRIDE * 4);
    assert.ok(ribbonPointers.length >= 4, 'the ribbon attributes were not bound with the right stride');
    const sizes = ribbonPointers.slice(0, 4).map((c) => [c.a[0], c.a[1], c.a[5]]);
    assert.deepEqual(sizes, [[0, 3, 0], [1, 3, 12], [2, 1, 24], [3, 1, 28]],
      'position, tangent, side, arcT, in that order and at those offsets');
    });
});

describe('teardown and capability detection', () => {
  test('destroy deletes every object the renderer created', () => {
    const gl = recordingGl();
    const r = createGlobeRenderer(gl);
    r.render(fixtureScene());
    const vaos = gl.calls('createVertexArray').length;
    const buffers = gl.calls('createBuffer').length;
    const programs = gl.calls('createProgram').length;
    r.destroy();
    assert.equal(gl.calls('deleteVertexArray').length, vaos);
    assert.equal(gl.calls('deleteBuffer').length, buffers);
    assert.equal(gl.calls('deleteProgram').length, programs);
  });

  test('a shader that fails to compile throws with the log, rather than drawing nothing', () => {
    const gl = recordingGl();
    gl.getShaderParameter = () => false;
    gl.getShaderInfoLog = () => 'ERROR: 0:12 something';
    assert.throws(() => createGlobeRenderer(gl), /shader compile failed: ERROR/);
  });

  test('a program that fails to link throws', () => {
    const gl = recordingGl();
    gl.getProgramParameter = () => false;
    gl.getProgramInfoLog = () => 'link went wrong';
    assert.throws(() => createGlobeRenderer(gl), /program link failed: link went wrong/);
  });

  test('getWebGl2 returns null rather than throwing when the context is unavailable', () => {
    assert.equal(getWebGl2({ getContext: () => null }), null);
    assert.equal(getWebGl2({ getContext: () => { throw new Error('blocked'); } }), null);
  });

  test('getWebGl2 asks for a preserved drawing buffer, which the capture rig needs', () => {
    let asked = null;
    getWebGl2({ getContext: (name, attrs) => { asked = { name, attrs }; return {}; } });
    assert.equal(asked.name, 'webgl2');
    assert.equal(asked.attrs.preserveDrawingBuffer, true);
    assert.equal(asked.attrs.depth, true, 'a context with no depth buffer cannot occlude anything');
    assert.equal(asked.attrs.powerPreference, 'low-power');
  });
});
