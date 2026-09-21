// One scene description, three consumers. GLOBE team.
//
// The WebGL2 renderer, the deterministic reference rasterizer the tests assert against, and
// the no WebGL2 fallback map all read THIS shape. That is on purpose: a fallback built from a
// separate description of the scene is a fallback that shows a different map, and the one time
// anybody notices is when a reader without WebGL2 is looking at it and nobody else is.
//
// Nothing here is a claim about the world. An arc is the great circle between the observer
// point and a region coordinate, which is the geometry the floor is computed from, drawn. The
// globe contract refuses waypoints, and this module adds none: the samples along an arc exist
// because a chord would cut through the planet, and for no other reason.
//
// Isomorphic: no node:* imports and no DOM.

import { assertGlobeInput, RENDER_RULES } from '../core/contracts/globe.js';
import { ARC_RADIUS, cameraMatrices } from './camera.js';
import { buildRibbon, buildSphere, coastlineLines, sampleGreatCircle } from './geometry.js';
import { ALPHA, WIDTH_PX, arcStyle, globePalette } from './palette.js';

/** Dash repeats along one arc. Low, so it reads as one travelling mark and not a dotted line. */
export const DASH_COUNT = 2.4;

/** Dash travel, cycles per second. Slow enough to read as motion and not as a strobe. */
export const FLOW_CYCLES_PER_SEC = 0.22;

/** The atmosphere shell radius, as a multiple of the globe. */
export const ATMOSPHERE_RADIUS = 1.14;

let sphereCache = null;
let coastRibbonCache = null;

/**
 * Arc meshes, keyed by the geometry that defines them.
 *
 * This memo is not a micro optimisation, it is a correctness requirement for the renderer. The
 * WebGL path keys its uploaded vertex buffers off the IDENTITY of the mesh object, so a
 * buildScene that returned a fresh mesh every frame would re upload every arc sixty times a
 * second and defeat the point of stopping the loop when idle (DESIGN 6.5). The key is the
 * geometry and not the endpoint id, so an arc whose endpoint moves gets a new mesh.
 */
const arcMeshCache = new Map();

/** Test seam. */
export function resetSceneCache() {
  sphereCache = null;
  coastRibbonCache = null;
  arcMeshCache.clear();
}

/** @returns {import('./geometry.js').RibbonMesh} */
function arcMesh(from, to, radius) {
  const key = from.lat + ',' + from.lon + '>' + to.lat + ',' + to.lon + '@' + radius;
  let m = arcMeshCache.get(key);
  if (!m) {
    m = buildRibbon([sampleGreatCircle(from, to, radius)]);
    arcMeshCache.set(key, m);
  }
  return m;
}

/** @returns {{positions:Float32Array, indices:Uint32Array}} */
export function sphereMesh() {
  if (!sphereCache) sphereCache = buildSphere();
  return sphereCache;
}

/** @returns {import('./geometry.js').RibbonMesh} */
export function coastlineRibbon() {
  if (!coastRibbonCache) coastRibbonCache = buildRibbon(coastlineLines());
  return coastRibbonCache;
}

/**
 * @typedef {Object} Stroke
 * @property {'coastline'|'arc'} kind
 * @property {string} id
 * @property {import('./geometry.js').RibbonMesh} mesh
 * @property {[number,number,number]} rgb
 * @property {number} alpha
 * @property {number} widthPx Device pixels, device pixel ratio already applied.
 * @property {number} progress 0 to 1, the draw in.
 * @property {number} flowAlpha 0 under reduced motion.
 * @property {number} depthOrder Lower draws first. Ties are drawn in array order.
 * @property {string} label Text alternative, straight from the contract.
 */

/**
 * @typedef {Object} Scene
 * @property {import('./camera.js').CameraState} camera
 * @property {[number, number]} viewportPx Drawing buffer size in DEVICE pixels.
 * @property {ReturnType<typeof cameraMatrices>} matrices
 * @property {ReturnType<typeof globePalette>} palette
 * @property {{positions:Float32Array, indices:Uint32Array}} sphere
 * @property {number} atmosphereRadius
 * @property {number} atmosphereAlpha
 * @property {Stroke[]} strokes
 * @property {{lat:number, lon:number, rgb:[number,number,number], alpha:number, sizePx:number,
 *            label:string, id:string}[]} markers
 * @property {boolean} reducedMotion
 * @property {string} ariaSummary
 */

/**
 * Build the scene for one frame.
 *
 * @param {import('../core/contracts/globe.js').GlobeInput} input
 * @param {Object} opts
 * @param {import('./camera.js').CameraState} opts.camera
 * @param {number} opts.widthPx Drawing buffer width, device pixels.
 * @param {number} opts.heightPx Drawing buffer height, device pixels.
 * @param {number} opts.devicePixelRatio Already capped by the caller at input.devicePixelRatioCap.
 * @param {number} [opts.timeSeconds] Drives the flow phase only. Ignored under reduced motion,
 *   which is what makes the deterministic render test deterministic.
 * @returns {Scene}
 */
export function buildScene(input, opts) {
  const gi = assertGlobeInput(input);
  const { camera, widthPx, heightPx, devicePixelRatio } = opts;
  const time = typeof opts.timeSeconds === 'number' ? opts.timeSeconds : 0;

  if (devicePixelRatio > gi.devicePixelRatioCap) {
    throw new RangeError('buildScene: devicePixelRatio ' + devicePixelRatio + ' exceeds the cap '
      + 'of ' + gi.devicePixelRatioCap + ' the input declared. Fill rate over a full screen '
      + 'globe is what melts a phone GPU (DESIGN 6.5), and the cap is the whole defence.');
  }

  const palette = globePalette(gi.theme);
  const matrices = cameraMatrices(camera, widthPx, heightPx);
  const flowAlpha = gi.reducedMotion ? 0 : ALPHA.flow;
  const flowPhase = gi.reducedMotion ? 0 : time * FLOW_CYCLES_PER_SEC;

  /** @type {Stroke[]} */
  const strokes = [{
    kind: 'coastline',
    id: 'coastline',
    mesh: coastlineRibbon(),
    rgb: palette.coastline,
    alpha: 1,
    widthPx: WIDTH_PX.coastline * devicePixelRatio,
    progress: 1,
    flowAlpha: 0,
    depthOrder: 0,
    label: 'Coastlines.',
  }];

  // Arc draw order: idle first, then the selection, then the worst offender last, so the one
  // saturated line in the scene is never crossed by a grey one. At most one of each, which the
  // contract enforces, which is why this is an ordering and not a z index scheme.
  const order = { idle: 1, selected: 2, worst: 3 };
  const sorted = gi.arcs.slice().sort((a, b) => order[a.state] - order[b.state]);

  for (const arc of sorted) {
    const style = arcStyle(palette, arc.state);
    const mesh = arcMesh(arc.from, arc.to, RENDER_RULES.arcRadius);

    // The halo, and only under the worst offender. A wide dim pass of the same accent, drawn
    // first so the sharp stroke sits on top of it. It is the one piece of decoration in the
    // scene and it is spent on the one line the whole colour budget exists for.
    if (arc.state === 'worst' && gi.bloomEnabled) {
      // BLOOM. Off by default and only reachable after a frame time probe has cleared 60
      // frames per second over 30 consecutive frames (DESIGN 6.5). It is one more wide, very
      // dim pass of the same accent, so turning it on costs fill rate and nothing else, and
      // turning it off changes the picture by a visible but small amount rather than removing
      // a feature. There is no separate bloom colour, because there is no second accent.
      strokes.push({
        kind: 'arc',
        id: arc.endpointId + ':bloom',
        mesh,
        rgb: style.rgb,
        alpha: ALPHA.arcWorstHalo * 0.5,
        widthPx: style.widthPx * WIDTH_PX.arcWorstHalo * 2.4 * devicePixelRatio,
        progress: arc.progress,
        flowAlpha: 0,
        depthOrder: order[arc.state],
        label: arc.label,
      });
    }

    if (arc.state === 'worst') {
      strokes.push({
        kind: 'arc',
        id: arc.endpointId + ':halo',
        mesh,
        rgb: style.rgb,
        alpha: ALPHA.arcWorstHalo,
        widthPx: style.widthPx * WIDTH_PX.arcWorstHalo * devicePixelRatio,
        progress: arc.progress,
        flowAlpha: 0,
        depthOrder: order[arc.state],
        label: arc.label,
      });
    }

    strokes.push({
      kind: 'arc',
      id: arc.endpointId,
      mesh,
      rgb: style.rgb,
      alpha: style.alpha,
      widthPx: style.widthPx * devicePixelRatio,
      progress: arc.progress,
      flowAlpha: arc.state === 'idle' ? flowAlpha * 0.5 : flowAlpha,
      depthOrder: order[arc.state],
      label: arc.label,
    });
  }

  // No observation point, no marker. Before the button is pressed this page has asked nobody
  // anything, so plotting a dot anywhere would be plotting a place it invented (DESIGN trap 7).
  /** @type {Scene['markers']} */
  const markers = gi.observer === null ? [] : [{
    lat: gi.observer.lat,
    lon: gi.observer.lon,
    rgb: palette.observer,
    alpha: 1,
    sizePx: WIDTH_PX.marker * devicePixelRatio,
    label: gi.observer.label,
    id: 'observer',
  }];
  for (const arc of sorted) {
    const worst = arc.state === 'worst';
    markers.push({
      lat: arc.to.lat,
      lon: arc.to.lon,
      rgb: worst ? palette.markerWorst : palette.marker,
      alpha: arc.state === 'idle' ? 0.8 : 1,
      sizePx: (worst ? WIDTH_PX.markerWorst : WIDTH_PX.marker) * devicePixelRatio,
      label: arc.label,
      id: arc.endpointId,
    });
  }

  return {
    camera,
    viewportPx: [widthPx, heightPx],
    matrices,
    palette,
    sphere: sphereMesh(),
    atmosphereRadius: ATMOSPHERE_RADIUS,
    atmosphereAlpha: palette.atmosphereAlpha,
    atmosphereBlend: palette.atmosphereBlend,
    strokes,
    markers,
    reducedMotion: gi.reducedMotion,
    bloomEnabled: gi.bloomEnabled,
    ariaSummary: gi.ariaSummary,
    flowPhase,
    dashCount: DASH_COUNT,
    arcRadius: ARC_RADIUS,
  };
}
