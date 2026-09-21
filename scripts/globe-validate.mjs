#!/usr/bin/env node
// Every number the GLOBE ships, recomputed and printed. GLOBE team. DESIGN 7.
//
//   node scripts/globe-validate.mjs
//
// Nothing here asserts. The assertions are in test/globe-*.test.js. This exists because the
// standing rule is that no number ships that cannot be recomputed from a primary source or
// from the shipped code, and a reader should be able to see the recomputation without reading
// a test runner's output.

import { COASTLINE_STATS, COASTLINE_ATTRIBUTION, COASTLINE_QUANT, coastline } from '../src/globe/coastline.js';
import { COASTLINE_B64 } from '../src/globe/coastline-data.js';
import {
  ARC_RADIUS, COASTLINE_RADIUS, GLOBE_RADIUS, FOV_Y_RAD, MAX_NDC_RADIUS, MIN_NDC_RADIUS,
  DEFAULT_NDC_RADIUS, MIN_DISTANCE, MAX_DISTANCE, DEFAULT_DISTANCE, IDLE_SPIN_DEG_PER_SEC,
  distanceForNdcRadius, ndcRadiusForDistance, eyeOf, isFrontFacing,
} from '../src/globe/camera.js';
import { ARC_SAMPLE_STEP_DEG, buildRibbon, coastlineLines, sampleGreatCircle } from '../src/globe/geometry.js';
import { globeContrastReport, ALPHA, WIDTH_PX } from '../src/globe/palette.js';
import { RENDER_RULES } from '../src/core/contracts/globe.js';
import { greatCircleKm } from '../src/core/geo.js';
import { EARTH_MEAN_RADIUS_KM } from '../src/core/constants.js';
import { buildScene } from '../src/globe/scene.js';
import { rasterizeScene, projectCoord } from '../src/globe/raster.js';
import { replayGlobeInput, REPLAY_CAMERA, REPLAY_VIEWPORT, REPLAY_OBSERVER, REPLAY_WORST_ID } from '../src/globe/replay.js';
import { endpointById } from '../src/core/data/endpoints.js';
import { gzipSync } from 'node:zlib';

const line = (s) => console.log(s);
const head = (s) => { console.log(''); console.log('== ' + s + ' =='); };

line('photontax GLOBE validation, recomputed ' + new Date().toISOString());
line('Nothing below is transcribed. Every figure is produced by the shipped code at the moment');
line('this script runs.');

head('1. The bundled coastline');
line('  attribution ............... ' + COASTLINE_ATTRIBUTION);
line('  source features ........... ' + COASTLINE_STATS.sourceFeatures);
line('  source points ............. ' + COASTLINE_STATS.sourcePoints);
line('  lines kept ................ ' + COASTLINE_STATS.lines);
line('  points kept ............... ' + COASTLINE_STATS.points);
line('  quantisation grid ......... 1/' + COASTLINE_QUANT + ' degree');
line('  binary bytes .............. ' + COASTLINE_STATS.binaryBytes);
line('  base64 bytes .............. ' + COASTLINE_STATS.base64Bytes);
line('  base64 gzipped ............ ' + gzipSync(Buffer.from(COASTLINE_B64, 'utf8'), { level: 9 }).length);

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
line('  decoded latitude range .... ' + minLat.toFixed(3) + ' to ' + maxLat.toFixed(3));
line('  decoded longitude range ... ' + minLon.toFixed(3) + ' to ' + maxLon.toFixed(3));
const coastMesh = buildRibbon(coastlineLines());
line('  ribbon vertices ........... ' + coastMesh.vertexCount);
line('  ribbon triangles .......... ' + coastMesh.indices.length / 3);
line('  DESIGN 6.3 states 14106 points for this layer. Not reproducible from any Natural Earth');
line('  110m layer (110m land is 5143 points over 128 rings). CUT, not softened.');

head('2. The radii the contract pins');
line('  globe surface ............. ' + GLOBE_RADIUS);
line('  coastline ................. ' + COASTLINE_RADIUS);
line('  arcs ...................... ' + ARC_RADIUS + '   contract says ' + RENDER_RULES.arcRadius);
line('  arcDepthTest .............. ' + RENDER_RULES.arcDepthTest);
line('  useLineDrawMode ........... ' + RENDER_RULES.useLineDrawMode);
line('  earthTexture .............. ' + String(RENDER_RULES.earthTexture));
line('  flowStyle ................. ' + RENDER_RULES.flowStyle);

head('3. The camera, and the arithmetic behind the coastline grid');
line('  vertical field of view .... ' + ((FOV_Y_RAD * 180) / Math.PI).toFixed(4) + ' degrees');
line('  projected radius range .... ' + MIN_NDC_RADIUS + ' to ' + MAX_NDC_RADIUS
  + ', default ' + DEFAULT_NDC_RADIUS);
line('  distance range ............ ' + MIN_DISTANCE.toFixed(6) + ' to ' + MAX_DISTANCE.toFixed(6)
  + ', default ' + DEFAULT_DISTANCE.toFixed(6));
line('  round trip check .......... ndcRadiusForDistance(distanceForNdcRadius(0.8)) = '
  + ndcRadiusForDistance(distanceForNdcRadius(0.8)).toFixed(12));
const diameterPx = 2 * MAX_NDC_RADIUS * (1600 * 2 / 2);
line('  most zoomed in, on a 1600 CSS pixel canvas at device pixel ratio 2:');
line('    globe diameter .......... ' + diameterPx + ' device pixels');
line('    device pixels per degree  ' + (diameterPx / 180).toFixed(4));
line('    one 1/' + COASTLINE_QUANT + ' degree step .... ' + ((diameterPx / 180) / COASTLINE_QUANT).toFixed(4) + ' device pixels');
line('    narrowest stroke ........ ' + WIDTH_PX.coastline + ' CSS pixels, ' + WIDTH_PX.coastline * 2 + ' device pixels');
const sag = (1 - Math.cos((ARC_SAMPLE_STEP_DEG * Math.PI) / 180 / 2)) * (diameterPx / 2);
line('    arc sampling sagitta .... ' + sag.toFixed(4) + ' device pixels at a '
  + ARC_SAMPLE_STEP_DEG + ' degree step');
line('  idle rotation ............. ' + IDLE_SPIN_DEG_PER_SEC + ' degrees per second, '
  + (360 / IDLE_SPIN_DEG_PER_SEC) + ' seconds per revolution');

head('4. The drawn arc against the haversine the floor is built on');
for (const id of ['aws:eu-central-1', 'aws:ap-northeast-1', 'aws:ap-southeast-2']) {
  const e = endpointById(id);
  const pts = sampleGreatCircle(REPLAY_OBSERVER, { lat: e.lat, lon: e.lon }, 1);
  let chord = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    chord += 2 * Math.asin(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 2);
  }
  const drawn = chord * EARTH_MEAN_RADIUS_KM;
  const hav = greatCircleKm(REPLAY_OBSERVER, { lat: e.lat, lon: e.lon });
  line('  ' + e.city.padEnd(14) + ' drawn ' + drawn.toFixed(6) + ' km   haversine '
    + hav.toFixed(6) + ' km   relative ' + (Math.abs(drawn - hav) / hav).toExponential(2));
}

head('5. The colour budget');
line('  alpha values: ' + JSON.stringify(ALPHA));
line('  stroke widths, CSS pixels: ' + JSON.stringify(WIDTH_PX));
line('  every colour is a token from src/core/tokens.js. The globe declares none of its own.');

head('6. WCAG AA by math, every text token the globe places, both themes');
let worst = Infinity;
for (const row of globeContrastReport()) {
  worst = Math.min(worst, row.ratio);
  line('  ' + (row.pass ? 'PASS' : 'FAIL') + '  ' + row.theme.padEnd(6) + ' '
    + row.text.padEnd(14) + ' on ' + row.surface.padEnd(8) + ' '
    + row.ratio.toFixed(2).padStart(6) + ':1   sanctioned by PAIRS: ' + row.sanctioned
    + '   ' + row.where);
}
line('  worst ratio across both themes: ' + worst.toFixed(2) + ':1 against a threshold of 4.5');

head('7. The deterministic fixture, and the occlusion');
const input = replayGlobeInput();
const scene = buildScene(input, {
  camera: REPLAY_CAMERA,
  widthPx: REPLAY_VIEWPORT.widthPx,
  heightPx: REPLAY_VIEWPORT.heightPx,
  devicePixelRatio: REPLAY_VIEWPORT.devicePixelRatio,
  timeSeconds: 0,
});
line('  camera .................... yaw ' + REPLAY_CAMERA.yawDeg + ', pitch ' + REPLAY_CAMERA.pitchDeg
  + ', distance ' + REPLAY_CAMERA.distance.toFixed(6));
line('  viewport .................. ' + scene.viewportPx.join(' by ') + ' device pixels');
line('  strokes in the scene ...... ' + scene.strokes.length);
line('  markers in the scene ...... ' + scene.markers.length);

const worstEp = endpointById(REPLAY_WORST_ID);
const samples = sampleGreatCircle(REPLAY_OBSERVER, { lat: worstEp.lat, lon: worstEp.lon }, ARC_RADIUS);
const eye = eyeOf(REPLAY_CAMERA);
let front = 0;
let back = 0;
for (const p of samples) (isFrontFacing(p, eye) ? front++ : back++);
line('  accented arc to ' + worstEp.city + ': ' + samples.length + ' samples, ' + front
  + ' on the near side, ' + back + ' behind the planet');

const isAccent = (px) => px[1] - px[2] > 24 && px[1] > 40;
const count = (fb) => {
  let n = 0;
  for (let i = 0; i < fb.rgba.length; i += 4) {
    if (isAccent([fb.rgba[i], fb.rgba[i + 1], fb.rgba[i + 2]])) n += 1;
  }
  return n;
};
const normal = rasterizeScene(scene);
const noDepth = rasterizeScene(scene, { strokeDepthTest: false });
line('  saturated pixels, depth test ON ....... ' + count(normal));
line('  saturated pixels, depth test OFF ...... ' + count(noDepth));
line('  the difference IS the occlusion: ' + (count(noDepth) - count(normal)) + ' pixels of arc');
line('  that a globe without a depth test would paint straight through the planet.');

let silhouette = 0;
for (let i = 0; i < normal.depth.length; i++) if (Number.isFinite(normal.depth[i])) silhouette += 1;
const radiusPx = ndcRadiusForDistance(REPLAY_CAMERA.distance) * (REPLAY_VIEWPORT.heightPx / 2);
line('  measured silhouette area .............. ' + silhouette + ' pixels');
line('  predicted from the projection formula .. ' + Math.round(Math.PI * radiusPx * radiusPx));
line('  relative difference .................... '
  + (Math.abs(silhouette - Math.PI * radiusPx * radiusPx) / (Math.PI * radiusPx * radiusPx)).toFixed(5));

const obs = projectCoord(scene, REPLAY_OBSERVER);
line('  observer ' + REPLAY_OBSERVER.label + ' projects to pixel ' + obs.x + ', ' + obs.y);
line('');
line('Reference images: validation/globe-reference-dark.png, globe-reference-light.png, and');
line('globe-reference-no-depth-test.png, which is what a globe that skips the depth test looks');
line('like. Produced by scripts/globe-reference-render.mjs.');
