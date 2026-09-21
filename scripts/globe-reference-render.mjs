#!/usr/bin/env node
// Render the deterministic globe fixture with the reference rasterizer and write a PNG.
// GLOBE team. DESIGN 7, DESIGN 8.5.
//
//   node scripts/globe-reference-render.mjs [outDir]
//
// This is a LOOKING tool, not a gate. The assertions live in test/globe-render.test.js, which
// renders the same scene through the same code and checks pixels. This writes the image out so
// a person can see what the assertions are talking about, and so a capture can be eyeballed
// before it becomes a hero image.
//
// The PNG writer below is about forty lines because a PNG of a fixed size buffer is a zlib
// stream with a header, and pulling a dependency into a zero dependency repo to avoid writing
// those forty lines would be the wrong trade.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildScene } from '../src/globe/scene.js';
import { rasterizeScene, projectCoord } from '../src/globe/raster.js';
import { replayGlobeInput, REPLAY_CAMERA, REPLAY_VIEWPORT, REPLAY_WORST_ID } from '../src/globe/replay.js';
import { endpointById } from '../src/core/data/endpoints.js';

/** @param {Uint8ClampedArray} rgba @param {number} w @param {number} h @returns {Buffer} */
function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                                  // filter type 0, None
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type 6, truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const outDir = process.argv[2]
  || path.resolve(process.cwd(), '..', '_internal', 'physical-internet', 'validation');
await mkdir(outDir, { recursive: true });

for (const theme of ['dark', 'light']) {
  const input = replayGlobeInput({ theme });
  const scene = buildScene(input, {
    camera: REPLAY_CAMERA,
    widthPx: REPLAY_VIEWPORT.widthPx,
    heightPx: REPLAY_VIEWPORT.heightPx,
    devicePixelRatio: REPLAY_VIEWPORT.devicePixelRatio,
    timeSeconds: 0,
  });
  const fb = rasterizeScene(scene);
  const file = path.join(outDir, 'globe-reference-' + theme + '.png');
  await writeFile(file, encodePng(fb.rgba, fb.width, fb.height));
  console.log('wrote ' + file);

  if (theme === 'dark') {
    const worst = endpointById(REPLAY_WORST_ID);
    const obs = scene.markers[0];
    console.log('  observer at pixel ' + JSON.stringify(projectCoord(scene, obs)));
    console.log('  worst endpoint ' + worst.city + ' at pixel '
      + JSON.stringify(projectCoord(scene, { lat: worst.lat, lon: worst.lon })));
  }
}

// A second capture with the depth test turned off, so the difference between the two images IS
// the occlusion. Written next to the real one because a claim about a detail nobody else gets
// right should come with the picture that shows it.
const broken = buildScene(replayGlobeInput({ theme: 'dark' }), {
  camera: REPLAY_CAMERA,
  widthPx: REPLAY_VIEWPORT.widthPx,
  heightPx: REPLAY_VIEWPORT.heightPx,
  devicePixelRatio: REPLAY_VIEWPORT.devicePixelRatio,
  timeSeconds: 0,
});
const brokenFb = rasterizeScene(broken, { depthTest: false });
const brokenFile = path.join(outDir, 'globe-reference-no-depth-test.png');
await writeFile(brokenFile, encodePng(brokenFb.rgba, brokenFb.width, brokenFb.height));
console.log('wrote ' + brokenFile + '  (the NEGATIVE CONTROL: this is what every globe that '
  + 'skips the depth test looks like)');
