// THE DETERMINISTIC RENDER TEST. GLOBE team. DESIGN 5, 6.2, 7, 8.5.
//
// DESIGN 5 names one detail as the first thing a graphics literate reader checks, and says
// almost no globe on GitHub gets it right:
//
//     "The arcs are drawn at radius 1.001 with depth testing on, so arcs on the far side of
//      the planet are correctly occluded by the Earth."
//
// This file is where that stops being a sentence. It draws the committed fixture scene to an
// offscreen buffer through the reference rasterizer, which runs the same camera matrices, the
// same great circle samples and the same ribbon expansion as the GPU path, and then reads
// pixels.
//
// THE CENTRAL PAIR OF TESTS. One finds a point on the far side of the planet that the
// accented arc passes through, and asserts the accent is NOT there. The other renders the
// identical scene with the stroke depth test disabled and asserts the accent IS there. A test
// that has never been watched fail is not a test, and an occlusion assertion in particular
// passes trivially if the arc simply is not drawn.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildScene, resetSceneCache } from '../src/globe/scene.js';
import { rasterizeScene, projectCoord, pixelAt } from '../src/globe/raster.js';
import {
  replayGlobeInput, REPLAY_CAMERA, REPLAY_VIEWPORT, REPLAY_WORST_ID, REPLAY_OBSERVER,
} from '../src/globe/replay.js';
import { sampleGreatCircle } from '../src/globe/geometry.js';
import {
  eyeOf, isFrontFacing, vec3ToCoord, distanceForNdcRadius, ndcRadiusForDistance,
} from '../src/globe/camera.js';
import { endpointById } from '../src/core/data/endpoints.js';
import { RENDER_RULES } from '../src/core/contracts/globe.js';

/** Render the committed fixture. @param {object} [opts] */
function renderFixture(opts = {}) {
  const input = replayGlobeInput({ theme: opts.theme || 'dark' });
  const scene = buildScene(input, {
    camera: opts.camera || REPLAY_CAMERA,
    widthPx: REPLAY_VIEWPORT.widthPx,
    heightPx: REPLAY_VIEWPORT.heightPx,
    devicePixelRatio: REPLAY_VIEWPORT.devicePixelRatio,
    timeSeconds: 0,
  });
  return { input, scene, fb: rasterizeScene(scene, opts.raster || {}) };
}

/**
 * Is this pixel carrying the accent?
 *
 * The accent is the only saturated colour in the entire scene (DESIGN 6.2), and everything
 * else in the dark theme is a neutral grey where the three channels are within a few units of
 * each other. So "green clearly above blue" is a test no other element in this picture can
 * pass, and it does not depend on the exact blend of a partially covered pixel.
 */
function isAccent(px) {
  return px[1] - px[2] > 24 && px[1] > 40;
}

/** The largest accent signal anywhere in a square window, which absorbs a pixel of aliasing. */
function accentNear(fb, x, y, radius = 2) {
  let best = false;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= fb.width || py >= fb.height) continue;
      if (isAccent(pixelAt(fb, px, py))) best = true;
    }
  }
  return best;
}

/**
 * Split the accented arc's samples into the ones on the near side of the planet and the ones
 * behind it, using the arithmetic in camera.js rather than the depth buffer, so the test and
 * the thing it is testing are independent.
 */
function accentArcSamples() {
  const worst = endpointById(REPLAY_WORST_ID);
  const samples = sampleGreatCircle(
    { lat: REPLAY_OBSERVER.lat, lon: REPLAY_OBSERVER.lon },
    { lat: worst.lat, lon: worst.lon },
    RENDER_RULES.arcRadius,
  );
  const eye = eyeOf(REPLAY_CAMERA);
  const front = [];
  const back = [];
  for (const p of samples) {
    (isFrontFacing(p, eye) ? front : back).push(vec3ToCoord(p));
  }
  return { front, back, eye, worst };
}

/**
 * Is this pixel comfortably inside the planet's silhouette rather than grazing its edge?
 *
 * The inset is 12 percent of the silhouette radius, which at the fixture framing is about
 * twenty five pixels: far wider than any antialiased stroke edge and far narrower than the
 * region of the disc the far side of the arc actually crosses.
 */
function wellInsideDisc(scene, p) {
  const cx = scene.viewportPx[0] / 2;
  const cy = scene.viewportPx[1] / 2;
  const silhouetteRadiusPx = ndcRadiusForDistance(scene.camera.distance) * (scene.viewportPx[1] / 2);
  return Math.hypot(p.x - cx, p.y - cy) < silhouetteRadiusPx * 0.88;
}

describe('the fixture renders, and it renders the same thing every time', () => {
  test('two renders of the same scene are byte identical', () => {
    const a = renderFixture().fb;
    resetSceneCache();
    const b = renderFixture().fb;
    assert.equal(a.rgba.length, b.rgba.length);
    for (let i = 0; i < a.rgba.length; i++) {
      if (a.rgba[i] !== b.rgba[i]) {
        assert.fail('byte ' + i + ' differs between two renders of the same fixture, so the '
          + 'capture rig cannot promise a frame identical screenshot');
      }
    }
  });

  test('the buffer is the size the fixture asks for and is fully opaque', () => {
    const { fb } = renderFixture();
    assert.equal(fb.width, REPLAY_VIEWPORT.widthPx);
    assert.equal(fb.height, REPLAY_VIEWPORT.heightPx);
    for (let i = 3; i < fb.rgba.length; i += 4) {
      if (fb.rgba[i] !== 255) assert.fail('a transparent pixel at byte ' + i);
    }
  });
});

describe('THE OCCLUSION: the far side of an arc is behind the planet', () => {
  test('the fixture actually contains an arc with a far side, or the rest of this proves nothing', () => {
    const { front, back } = accentArcSamples();
    assert.ok(front.length > 5, 'the accented arc has no near side in this framing');
    assert.ok(back.length > 5, 'the accented arc has no far side in this framing, so the '
      + 'occlusion assertion below would pass by accident');
  });

  test('a far side sample lands inside the silhouette, so it is a real occlusion and not off screen', () => {
    const { scene } = renderFixture();
    const { back } = accentArcSamples();
    const inside = back.filter((c) => {
      const p = projectCoord(scene, c);
      return p.onScreen && wellInsideDisc(scene, p);
    });
    assert.ok(inside.length > 0, 'every far side sample projected outside the disc, which would '
      + 'make the occlusion test vacuous');
  });

  test('THE CLAIM: no far side sample of the accented arc paints the accent', () => {
    const { scene, fb } = renderFixture();
    const { back } = accentArcSamples();
    let checked = 0;
    for (const c of back) {
      const p = projectCoord(scene, c);
      // Only samples WELL inside the silhouette count. A sample a pixel past the tangent point
      // is a pixel the antialiased edge of a stroke legitimately touches from the near side,
      // and asserting against it would be asserting that the limb has no width. The inset is
      // stated as a fraction of the half viewport so it moves with the framing.
      if (!p.onScreen || !wellInsideDisc(scene, p)) continue;
      checked += 1;
      assert.ok(!accentNear(fb, p.x, p.y, 1),
        'the accent was painted at pixel ' + p.x + ', ' + p.y + ', which is where the arc '
        + 'passes BEHIND the planet. The depth test is not doing its job, and this is the '
        + 'detail DESIGN 5 says a reader checks first.');
    }
    assert.ok(checked > 5, 'only ' + checked + ' far side samples were well inside the disc');
  });

  test('THE NEGATIVE CONTROL: with the stroke depth test off, the accent appears there', () => {
    // Identical scene, identical camera, one flag. If this does not turn the far side visible
    // then the assertion above is passing for some reason other than occlusion, and the whole
    // claim is unsupported.
    const { scene, fb } = renderFixture({ raster: { strokeDepthTest: false } });
    const { back } = accentArcSamples();
    let painted = 0;
    for (const c of back) {
      const p = projectCoord(scene, c);
      if (p.onScreen && wellInsideDisc(scene, p) && accentNear(fb, p.x, p.y, 1)) painted += 1;
    }
    assert.ok(painted > 5, 'disabling the depth test did not make the far side of the arc '
      + 'visible, so the occlusion test above proves nothing. Painted ' + painted + ' samples.');
  });

  test('the near side of the same arc IS painted, so the arc is drawn at all', () => {
    const { scene, fb } = renderFixture();
    const { front } = accentArcSamples();
    let painted = 0;
    for (const c of front) {
      const p = projectCoord(scene, c);
      if (p.onScreen && accentNear(fb, p.x, p.y, 2)) painted += 1;
    }
    assert.ok(painted > front.length * 0.8,
      'only ' + painted + ' of ' + front.length + ' near side samples carry the accent');
  });

  test('the coastline behind the planet is occluded too', () => {
    // The same mechanism, on the other ribbon. A coordinate deep on the far side that sits on
    // a coastline must be planet coloured, not coastline coloured.
    const { scene, fb } = renderFixture();
    const eye = eyeOf(REPLAY_CAMERA);
    const farCoastal = [
      { lat: 35.6894, lon: 139.6917 },     // the Japanese coast
      { lat: -33.8688, lon: 151.2093 },    // the New South Wales coast
    ];
    for (const c of farCoastal) {
      const v = { lat: c.lat, lon: c.lon };
      const p = projectCoord(scene, v);
      const world = projectCoord(scene, v, 1.0005);
      assert.equal(isFrontFacing(
        { x: Math.cos((c.lat * Math.PI) / 180) * Math.cos((c.lon * Math.PI) / 180),
          y: Math.sin((c.lat * Math.PI) / 180),
          z: Math.cos((c.lat * Math.PI) / 180) * Math.sin((c.lon * Math.PI) / 180) },
        eye,
      ), false, 'the fixture no longer puts ' + c.lat + ', ' + c.lon + ' on the far side');
      if (!p.onScreen) continue;
      const px = pixelAt(fb, world.x, world.y);
      // The coastline token is 0x9a 0xa0 0xa6. Anything near that brightness here would be a
      // coastline bleeding through the planet.
      assert.ok(px[0] < 110, 'a far side coastal point painted at brightness ' + px[0]);
    }
  });
});

describe('the art direction, measured rather than admired', () => {
  test('the page ground and the ocean are the same token, so the disc has no seam', () => {
    const { fb, scene } = renderFixture();
    const corner = pixelAt(fb, 2, 2);
    const ocean = scene.palette.ocean.map((v) => Math.round(v * 255));
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(corner[k] - ocean[k]) <= 1,
        'the corner of the canvas is not the surface token: ' + corner.join(','));
    }
  });

  test('the centre of the disc is the ocean token, undisturbed by the limb treatment', () => {
    const { fb, scene } = renderFixture();
    const centre = projectCoord(scene, { lat: REPLAY_CAMERA.pitchDeg, lon: REPLAY_CAMERA.yawDeg }, 1);
    const px = pixelAt(fb, centre.x, centre.y);
    const ocean = scene.palette.ocean.map((v) => Math.round(v * 255));
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(px[k] - ocean[k]) <= 2,
        'the middle of the ocean is not the ocean token: ' + px.join(','));
    }
  });

  test('EXACTLY ONE ARC IS SATURATED: every accent pixel belongs to the worst offender', () => {
    // DESIGN 6.2: the entire colour budget of the scene exists to make one line pop. This
    // counts the accent pixels, then re renders with that arc demoted and asserts they are
    // gone. If any other element were reaching for the accent, the count would not fall to
    // nothing.
    const withWorst = renderFixture().fb;
    let count = 0;
    for (let i = 0; i < withWorst.rgba.length; i += 4) {
      if (isAccent([withWorst.rgba[i], withWorst.rgba[i + 1], withWorst.rgba[i + 2]])) count += 1;
    }
    assert.ok(count > 200, 'the accented arc barely registered: ' + count + ' pixels');

    const demoted = replayGlobeInput();
    demoted.arcs = demoted.arcs.map((a) => (a.state === 'worst' ? { ...a, state: 'idle' } : a));
    const scene = buildScene(demoted, {
      camera: REPLAY_CAMERA,
      widthPx: REPLAY_VIEWPORT.widthPx,
      heightPx: REPLAY_VIEWPORT.heightPx,
      devicePixelRatio: REPLAY_VIEWPORT.devicePixelRatio,
      timeSeconds: 0,
    });
    const fb = rasterizeScene(scene);
    let after = 0;
    for (let i = 0; i < fb.rgba.length; i += 4) {
      if (isAccent([fb.rgba[i], fb.rgba[i + 1], fb.rgba[i + 2]])) after += 1;
    }
    assert.equal(after, 0, after + ' pixels are still saturated with the accent after the only '
      + 'arc entitled to it was demoted. Something else in the scene is spending the budget.');
  });

  test('the accented stroke is more than one pixel across, which gl.LINES could not promise', () => {
    // A hairline is what ALIASED_LINE_WIDTH_RANGE gives you on a great many machines, and it
    // is the single reason most globes look the way they do. Scan a row through the near side
    // of the accented arc and count contiguous accent pixels.
    const { scene, fb } = renderFixture();
    const { front } = accentArcSamples();
    let widest = 0;
    for (const c of front) {
      const p = projectCoord(scene, c);
      if (!p.onScreen) continue;
      let run = 0;
      for (let dx = -6; dx <= 6; dx++) {
        const x = p.x + dx;
        if (x < 0 || x >= fb.width) continue;
        if (isAccent(pixelAt(fb, x, p.y))) run += 1;
        else if (run > 0) break;
      }
      widest = Math.max(widest, run);
    }
    assert.ok(widest >= 2, 'the widest accent run across the arc was ' + widest + ' pixel(s)');
  });

  test('the limb treatment stays inside the atmosphere shell and never reaches white', () => {
    const { fb } = renderFixture();
    let brightest = 0;
    for (let i = 0; i < fb.rgba.length; i += 4) {
      const grey = Math.min(fb.rgba[i], fb.rgba[i + 1], fb.rgba[i + 2]);
      brightest = Math.max(brightest, grey);
    }
    assert.ok(brightest < 235, 'something in the scene reached brightness ' + brightest
      + '. DESIGN 6.2 says the coastline is never white, and neither is anything else here.');
  });

  test('the light theme is a different picture, not the same picture inverted by accident', () => {
    const dark = renderFixture({ theme: 'dark' }).fb;
    const light = renderFixture({ theme: 'light' }).fb;
    const centreIndex = ((light.height / 2 | 0) * light.width + (light.width / 2 | 0)) * 4;
    assert.ok(light.rgba[centreIndex] > 200, 'the light theme ground is not light');
    assert.ok(dark.rgba[centreIndex] < 40, 'the dark theme ground is not dark');
  });
});

describe('the draw in, and what reduced motion does to it', () => {
  test('an arc at zero progress paints nothing of itself', () => {
    const input = replayGlobeInput();
    input.reducedMotion = false;
    input.arcs = input.arcs.map((a) => ({ ...a, progress: a.state === 'worst' ? 0 : 1 }));
    const scene = buildScene(input, {
      camera: REPLAY_CAMERA,
      widthPx: REPLAY_VIEWPORT.widthPx,
      heightPx: REPLAY_VIEWPORT.heightPx,
      devicePixelRatio: REPLAY_VIEWPORT.devicePixelRatio,
      timeSeconds: 0,
    });
    const fb = rasterizeScene(scene);
    let count = 0;
    for (let i = 0; i < fb.rgba.length; i += 4) {
      if (isAccent([fb.rgba[i], fb.rgba[i + 1], fb.rgba[i + 2]])) count += 1;
    }
    assert.equal(count, 0, 'an arc at progress zero painted ' + count + ' accent pixels');
  });

  test('a half drawn arc paints its start and not its end', () => {
    const input = replayGlobeInput();
    input.reducedMotion = false;
    input.arcs = input.arcs.map((a) => ({ ...a, progress: a.state === 'worst' ? 0.4 : 1 }));
    const scene = buildScene(input, {
      camera: REPLAY_CAMERA,
      widthPx: REPLAY_VIEWPORT.widthPx,
      heightPx: REPLAY_VIEWPORT.heightPx,
      devicePixelRatio: REPLAY_VIEWPORT.devicePixelRatio,
      timeSeconds: 0,
    });
    const fb = rasterizeScene(scene);
    const { front } = accentArcSamples();
    const early = front[1];
    const late = front[front.length - 1];
    const a = projectCoord(scene, early);
    const b = projectCoord(scene, late);
    assert.ok(accentNear(fb, a.x, a.y, 2), 'the start of a half drawn arc is missing');
    assert.ok(!accentNear(fb, b.x, b.y, 1), 'the far end of a half drawn arc is already there');
  });

  test('the fixture is reduced motion, so the flow is off and the picture does not move', () => {
    const input = replayGlobeInput();
    assert.equal(input.reducedMotion, true);
    const at = (t) => {
      const scene = buildScene(input, {
        camera: REPLAY_CAMERA,
        widthPx: 96,
        heightPx: 96,
        devicePixelRatio: 1,
        timeSeconds: t,
      });
      assert.equal(scene.flowPhase, 0, 'reduced motion left a non zero flow phase');
      return rasterizeScene(scene);
    };
    const a = at(0);
    const b = at(37.5);
    for (let i = 0; i < a.rgba.length; i++) {
      if (a.rgba[i] !== b.rgba[i]) assert.fail('the reduced motion scene changed with time');
    }
  });
});

describe('the camera moves the picture', () => {
  // The silhouette is measured from the DEPTH BUFFER rather than from the colour buffer,
  // because the interior of the dark globe is deliberately the same token as the page behind
  // it (DESIGN 6.2) and so is invisible to any brightness threshold. The depth buffer holds a
  // finite value exactly where the planet was drawn, which is the silhouette by definition.
  const silhouettePixels = (fb) => {
    let n = 0;
    for (let i = 0; i < fb.depth.length; i++) if (Number.isFinite(fb.depth[i])) n += 1;
    return n;
  };

  test('the measured silhouette matches the area the projection formula predicts', () => {
    for (const ndcR of [0.35, 0.6, 0.8]) {
      const fb = renderFixture({ camera: { ...REPLAY_CAMERA, distance: distanceForNdcRadius(ndcR) } }).fb;
      const radiusPx = ndcR * (REPLAY_VIEWPORT.heightPx / 2);
      const predicted = Math.PI * radiusPx * radiusPx;
      const measured = silhouettePixels(fb);
      const relative = Math.abs(measured - predicted) / predicted;
      assert.ok(relative < 0.02,
        'at ndcRadius ' + ndcR + ' the disc covered ' + measured + ' pixels against a predicted '
        + Math.round(predicted) + ', a relative difference of ' + relative.toFixed(4));
    }
  });

  test('zooming in makes the globe bigger', () => {
    const near = renderFixture({ camera: { ...REPLAY_CAMERA, distance: distanceForNdcRadius(0.9) } }).fb;
    const far = renderFixture({ camera: { ...REPLAY_CAMERA, distance: distanceForNdcRadius(0.45) } }).fb;
    assert.ok(silhouettePixels(near) > silhouettePixels(far) * 3,
      'a doubling of the projected radius should roughly quadruple the area');
  });
});
