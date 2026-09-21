// The camera. GLOBE team. DESIGN 5 (a slowly rotating globe), 6.5 (mobile), 6.6 (keyboard,
// reduced motion).
//
// The camera is PURE STATE plus PURE FUNCTIONS. Nothing here touches the DOM, reads a clock or
// owns a timer, which is what lets the deterministic render test in test/globe-render.test.js
// pin a fixed camera and get a frame identical image on any machine, forever, and what lets
// the capture rig honour ?replay=1 (DESIGN 8.5).
//
// The frame. +Y is the polar axis, north positive. Longitude 0 is +X, longitude 90 east is +Z.
// The globe has radius 1. Arcs sit at 1.001 and coastlines at 1.0005, both above the surface,
// both depth tested, so the far side of each is occluded by the planet (DESIGN 5).
//
// Isomorphic: no node:* imports and no DOM.

import { lookAt, perspective, multiply } from './mat4.js';

/** Vertical field of view, radians. Fixed: a changing field of view is a lens, not a camera. */
export const FOV_Y_RAD = (35 * Math.PI) / 180;

/** The globe surface. Every other radius in this module is expressed against it. */
export const GLOBE_RADIUS = 1;

/** DESIGN 6.1 and the globe contract RENDER_RULES.arcRadius. Arcs ride just above the surface. */
export const ARC_RADIUS = 1.001;

/**
 * Coastlines ride between the surface and the arcs. Depth testing is what makes the far side
 * of each disappear, and a coastline exactly on the surface z fights with it.
 */
export const COASTLINE_RADIUS = 1.0005;

/**
 * Projected radius of the globe in normalised device coordinates at the closest the camera is
 * allowed to come, expressed as a multiple of the viewport half height.
 *
 * 2.5 means the globe is two and a half viewport heights across when fully zoomed in. That is
 * the number scripts/build-coastline.mjs quotes when it justifies the 1/100 degree grid: on a
 * 1600 CSS pixel canvas at the capped device pixel ratio of 2, the viewport is 3200 device
 * pixels tall, so the globe is 2.5 * 3200 = 8000 device pixels across, which is 44.4 device
 * pixels per degree of arc, which makes one grid step 0.44 of a device pixel.
 */
export const MAX_NDC_RADIUS = 2.5;

/** Projected radius at the furthest the camera is allowed to go. */
export const MIN_NDC_RADIUS = 0.35;

/** The framing the page opens on. The globe fills most of the height and is not cropped. */
export const DEFAULT_NDC_RADIUS = 0.8;

/**
 * Degrees of longitude the idle rotation covers per second. One revolution in two minutes.
 * DESIGN 5: "slowly rotating". Killed entirely under prefers-reduced-motion (DESIGN 6.6).
 */
export const IDLE_SPIN_DEG_PER_SEC = 3;

/** Latitude the camera may reach, degrees. Past this the up vector degenerates at the pole. */
export const MAX_PITCH_DEG = 80;

/** Keyboard step sizes. DESIGN 6.6: arrow keys rotate, plus and minus zoom. */
export const KEY_YAW_STEP_DEG = 8;
export const KEY_PITCH_STEP_DEG = 6;
export const KEY_ZOOM_STEP = 1.15;

const DEG = Math.PI / 180;

/**
 * Camera distance from the centre of the globe that projects the globe to a given radius in
 * normalised device coordinates.
 *
 * The silhouette of a unit sphere seen from distance d subtends a half angle of asin(1 / d),
 * and a point at angle t from the view axis lands at tan(t) / tan(fovY / 2) in normalised
 * device coordinates. tan(asin(1 / d)) is 1 / sqrt(d * d - 1), so
 *
 *     ndcRadius = 1 / ( sqrt(d * d - 1) * tan(fovY / 2) )
 *
 * which inverts to the line below. Checked in test/globe-camera.test.js by projecting the
 * silhouette point through the real matrices and comparing.
 *
 * @param {number} ndcRadius
 * @returns {number} Distance in globe radii.
 */
export function distanceForNdcRadius(ndcRadius) {
  if (!(ndcRadius > 0)) throw new RangeError('distanceForNdcRadius: ndcRadius must be positive');
  const t = Math.tan(FOV_Y_RAD / 2);
  const s = 1 / (ndcRadius * t);
  return Math.sqrt(s * s + 1);
}

/** Inverse of distanceForNdcRadius, so the clamp can be stated in either unit. */
export function ndcRadiusForDistance(distance) {
  if (!(distance > 1)) throw new RangeError('ndcRadiusForDistance: the camera is inside the globe');
  return 1 / (Math.sqrt(distance * distance - 1) * Math.tan(FOV_Y_RAD / 2));
}

export const MIN_DISTANCE = distanceForNdcRadius(MAX_NDC_RADIUS);
export const MAX_DISTANCE = distanceForNdcRadius(MIN_NDC_RADIUS);
export const DEFAULT_DISTANCE = distanceForNdcRadius(DEFAULT_NDC_RADIUS);

/**
 * @typedef {Object} CameraState
 * @property {number} yawDeg Longitude the camera is over.
 * @property {number} pitchDeg Latitude the camera is over, clamped to +/- MAX_PITCH_DEG.
 * @property {number} distance In globe radii, clamped to [MIN_DISTANCE, MAX_DISTANCE].
 */

/**
 * A camera over a coordinate, at the default framing.
 * @param {{lat:number, lon:number}} [over]
 * @returns {CameraState}
 */
export function createCamera(over) {
  return clampCamera({
    yawDeg: over ? over.lon : 0,
    pitchDeg: over ? over.lat : 12,
    distance: DEFAULT_DISTANCE,
  });
}

/** @param {CameraState} c @returns {CameraState} */
export function clampCamera(c) {
  const yaw = ((c.yawDeg % 360) + 540) % 360 - 180;
  return {
    yawDeg: yaw,
    pitchDeg: Math.max(-MAX_PITCH_DEG, Math.min(MAX_PITCH_DEG, c.pitchDeg)),
    distance: Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, c.distance)),
  };
}

/**
 * Advance the idle rotation. Pure: the caller supplies the elapsed time, so a test can step it
 * and a replay capture can pass zero.
 *
 * @param {CameraState} c
 * @param {number} dtSeconds
 * @param {{reducedMotion:boolean, interacted:boolean}} mode When the reader has taken the
 *   camera with the keyboard or a pointer, the idle rotation stops and stays stopped. A globe
 *   that drifts out from under a keyboard user is a globe they cannot aim.
 * @returns {CameraState}
 */
export function advanceIdleSpin(c, dtSeconds, mode) {
  if (mode.reducedMotion || mode.interacted) return c;
  if (!(dtSeconds > 0)) return c;
  return clampCamera({ ...c, yawDeg: c.yawDeg + IDLE_SPIN_DEG_PER_SEC * dtSeconds });
}

/**
 * The camera eye position in world space.
 * @param {CameraState} c
 * @returns {{x:number, y:number, z:number}}
 */
export function eyeOf(c) {
  const p = c.pitchDeg * DEG;
  const y = c.yawDeg * DEG;
  const cp = Math.cos(p);
  return {
    x: cp * Math.cos(y) * c.distance,
    y: Math.sin(p) * c.distance,
    z: cp * Math.sin(y) * c.distance,
  };
}

/**
 * Unit vector for a geographic coordinate, in the frame this module documents at the top.
 * @param {number} latDeg @param {number} lonDeg @param {number} [radius]
 * @returns {{x:number, y:number, z:number}}
 */
export function coordToVec3(latDeg, lonDeg, radius = GLOBE_RADIUS) {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  const cl = Math.cos(la);
  return {
    x: cl * Math.cos(lo) * radius,
    y: Math.sin(la) * radius,
    z: cl * Math.sin(lo) * radius,
  };
}

/**
 * Inverse of coordToVec3, for the fallback map and for announcing where the camera is.
 * @param {{x:number, y:number, z:number}} v
 * @returns {{lat:number, lon:number}}
 */
export function vec3ToCoord(v) {
  const r = Math.hypot(v.x, v.y, v.z);
  if (r === 0) throw new RangeError('vec3ToCoord: the origin has no coordinate');
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, v.y / r))) / DEG,
    lon: Math.atan2(v.z, v.x) / DEG,
  };
}

/**
 * The matrices for one frame.
 *
 * near and far are derived from the camera distance rather than fixed, because a fixed near
 * plane at a close zoom throws away most of the depth buffer precision, and depth precision is
 * exactly what the far side occlusion in DESIGN 5 depends on. near is half the distance to the
 * nearest possible surface point and far is just past the far limb.
 *
 * @param {CameraState} c
 * @param {number} widthPx
 * @param {number} heightPx
 * @returns {{view:Float64Array, proj:Float64Array, viewProj:Float64Array,
 *            eye:{x:number,y:number,z:number}, near:number, far:number, aspect:number}}
 */
export function cameraMatrices(c, widthPx, heightPx) {
  if (!(widthPx > 0) || !(heightPx > 0)) {
    throw new RangeError('cameraMatrices: the viewport has no area');
  }
  const eye = eyeOf(c);
  const near = (c.distance - GLOBE_RADIUS) * 0.5;
  const far = c.distance + GLOBE_RADIUS * 1.5;
  const aspect = widthPx / heightPx;
  const view = lookAt(eye, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  const proj = perspective(FOV_Y_RAD, aspect, near, far);
  return { view, proj, viewProj: multiply(proj, view), eye, near, far, aspect };
}

/**
 * Keyboard camera moves. DESIGN 6.6: arrow keys rotate, plus and minus zoom. Returns the new
 * state and a sentence for the polite live region, or null when the key is not ours, so the
 * caller knows whether to preventDefault.
 *
 * The sentences carry no digits on purpose. Every number a reader receives from this product
 * goes through the claim badge system in src/core/claim.js, and a camera position is not a
 * claim about the world, so it is described in words instead of announced as coordinates.
 *
 * @param {CameraState} c
 * @param {string} key A KeyboardEvent.key value.
 * @returns {{camera:CameraState, announce:string}|null}
 */
export function cameraKey(c, key) {
  switch (key) {
    case 'ArrowLeft':
      return { camera: clampCamera({ ...c, yawDeg: c.yawDeg - KEY_YAW_STEP_DEG }), announce: 'Rotated west.' };
    case 'ArrowRight':
      return { camera: clampCamera({ ...c, yawDeg: c.yawDeg + KEY_YAW_STEP_DEG }), announce: 'Rotated east.' };
    case 'ArrowUp':
      return { camera: clampCamera({ ...c, pitchDeg: c.pitchDeg + KEY_PITCH_STEP_DEG }), announce: 'Rotated north.' };
    case 'ArrowDown':
      return { camera: clampCamera({ ...c, pitchDeg: c.pitchDeg - KEY_PITCH_STEP_DEG }), announce: 'Rotated south.' };
    case '+':
    case '=':
      return { camera: clampCamera({ ...c, distance: c.distance / KEY_ZOOM_STEP }), announce: 'Zoomed in.' };
    case '-':
    case '_':
      return { camera: clampCamera({ ...c, distance: c.distance * KEY_ZOOM_STEP }), announce: 'Zoomed out.' };
    case 'Home':
      return { camera: createCamera(), announce: 'View reset.' };
    default:
      return null;
  }
}

/**
 * The camera that frames a coordinate, keeping the current zoom. Tabbing a table row drives
 * the camera to that arc (DESIGN 6.6), and this is the target it drives to.
 * @param {CameraState} c @param {{lat:number, lon:number}} to
 * @returns {CameraState}
 */
export function cameraOver(c, to) {
  return clampCamera({ ...c, yawDeg: to.lon, pitchDeg: to.lat });
}

/**
 * Interpolate between two cameras for the tween. Longitude takes the short way round, so a
 * move from 179 east to 179 west crosses the antimeridian instead of travelling 358 degrees
 * the wrong way across the planet.
 *
 * Under reduced motion the caller does not call this at all; it jumps to the target. The
 * contract enforces the same rule for arcs: with reducedMotion set every arc is already at
 * progress 1.
 *
 * @param {CameraState} from @param {CameraState} to @param {number} t 0 to 1
 * @returns {CameraState}
 */
export function lerpCamera(from, to, t) {
  const k = Math.max(0, Math.min(1, t));
  let dYaw = ((to.yawDeg - from.yawDeg) % 360 + 540) % 360 - 180;
  return clampCamera({
    yawDeg: from.yawDeg + dYaw * k,
    pitchDeg: from.pitchDeg + (to.pitchDeg - from.pitchDeg) * k,
    distance: from.distance + (to.distance - from.distance) * k,
  });
}

/**
 * True when a world space point is on the near side of the globe from this camera. The
 * renderer does not use this: the depth buffer decides visibility, which is the whole point of
 * DESIGN 5. It exists for the fallback map, which has no depth buffer, and for the test that
 * asserts the depth buffer agreed with the arithmetic.
 *
 * @param {{x:number,y:number,z:number}} p A point on or near the unit sphere.
 * @param {{x:number,y:number,z:number}} eye
 * @returns {boolean}
 */
export function isFrontFacing(p, eye) {
  // The visible cap seen from distance d is everything with dot(pHat, eyeHat) > 1 / d.
  const pr = Math.hypot(p.x, p.y, p.z);
  const er = Math.hypot(eye.x, eye.y, eye.z);
  if (pr === 0 || er === 0) return false;
  const cosAngle = (p.x * eye.x + p.y * eye.y + p.z * eye.z) / (pr * er);
  return cosAngle > (GLOBE_RADIUS / er);
}
