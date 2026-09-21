// Mesh building. GLOBE team. DESIGN 6.1 (never gl.LINES), 6.3 (payload), globe contract
// RENDER_RULES.
//
// THE ONE TECHNIQUE THAT DECIDES THE LOOK. gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)
// frequently returns a usable maximum of 1 on ANGLE and Direct3D backends, and the WebGL
// specification permits exactly that. Every thin crawling amateur globe looks that way for
// that one reason. So nothing in this product is ever drawn with gl.LINES. Every stroke,
// coastline and arc alike, is expanded into a triangle ribbon whose width is applied in
// SCREEN SPACE by the vertex shader, which gives a constant pixel width at any zoom and a free
// arc length parameter for the draw in and the flow.
//
// WHAT AN ARC IS. The great circle between two coordinates, sampled. It is the geometry the
// floor is computed from, drawn. It is not a route and it carries no intermediate waypoint
// that means anything: the samples exist because a straight line in three dimensions between
// two points on a sphere would cut through the planet, and for no other reason. The globe
// contract refuses an arc that arrives carrying waypoints, and this module never invents one
// that would survive being asked what it represents.
//
// Isomorphic: no node:* imports and no DOM. Everything here is arrays in, arrays out, so the
// WebGL path, the deterministic CPU reference rasterizer and the tests all consume the same
// buffers rather than three implementations that drift.

import { ARC_RADIUS, COASTLINE_RADIUS, GLOBE_RADIUS, coordToVec3 } from './camera.js';
import { coastline } from './coastline.js';

/** Floats per ribbon vertex: position xyz, tangent xyz, side, arcT. */
export const RIBBON_STRIDE = 8;

/** Floats per marker vertex: centre xyz, corner xy, unused pad to keep a power of two. */
export const MARKER_STRIDE = 6;

/**
 * Angular step used to sample a great circle, degrees.
 *
 * The error of a chord against the arc it spans is the sagitta, R * (1 - cos(step / 2)). At 1
 * degree that is 3.81e-5 of the globe radius. The closest zoom the camera allows puts the
 * globe at 8000 device pixels across, so the radius is 4000 device pixels and the sagitta is
 * 0.152 of a device pixel: under a fifth of a pixel at the most extreme framing the product
 * can reach, inside a stroke at least 1.4 pixels wide. 180 samples on the longest possible arc
 * and 8 on a short one.
 *
 * An earlier revision used 1.5 degrees and a comment that claimed a twentieth of a pixel. The
 * arithmetic was 0.34 of a pixel. The test in test/globe-geometry.test.js now recomputes the
 * sagitta rather than trusting the sentence, which is why the sentence is now correct.
 */
export const ARC_SAMPLE_STEP_DEG = 1;

/** Minimum samples on any arc, so a short arc is still a ribbon and not a single degenerate quad. */
export const ARC_MIN_SAMPLES = 8;

/**
 * @typedef {Object} RibbonMesh
 * @property {Float32Array} vertices Interleaved, RIBBON_STRIDE floats each.
 * @property {Uint32Array} indices Triangles. Never a line primitive.
 * @property {number} vertexCount
 * @property {{first:number, count:number}[]} ranges One entry per input polyline, indexing
 *   into indices, so a caller can draw a single arc without rebuilding anything.
 */

/**
 * Expand a list of polylines into one triangle ribbon mesh.
 *
 * Two vertices per point, side -1 and +1. Two triangles per segment. The tangent at a point is
 * the direction through it, central differenced inside a line and one sided at its ends, so a
 * corner gets a consistent normal from both of its segments and does not tear.
 *
 * @param {{x:number,y:number,z:number}[][]} lines
 * @returns {RibbonMesh}
 */
export function buildRibbon(lines) {
  let points = 0;
  let segments = 0;
  for (const line of lines) {
    if (line.length < 2) continue;
    points += line.length;
    segments += line.length - 1;
  }
  const vertices = new Float32Array(points * 2 * RIBBON_STRIDE);
  const indices = new Uint32Array(segments * 6);
  /** @type {{first:number, count:number}[]} */
  const ranges = [];

  let v = 0;
  let i = 0;
  let baseVertex = 0;
  for (const line of lines) {
    if (line.length < 2) { ranges.push({ first: i, count: 0 }); continue; }
    const n = line.length;

    // Arc length parameter, normalised over the whole polyline. It drives the draw in and the
    // dash flow, and normalising per line is what makes a short arc and a long arc complete
    // their draw in together instead of the short one snapping.
    const cum = new Float64Array(n);
    for (let k = 1; k < n; k++) {
      const a = line[k - 1];
      const b = line[k];
      cum[k] = cum[k - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    const total = cum[n - 1] || 1;

    for (let k = 0; k < n; k++) {
      const prev = line[Math.max(0, k - 1)];
      const next = line[Math.min(n - 1, k + 1)];
      let tx = next.x - prev.x;
      let ty = next.y - prev.y;
      let tz = next.z - prev.z;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 0) { tx /= tl; ty /= tl; tz /= tl; }
      const p = line[k];
      const t = cum[k] / total;
      for (const side of [-1, 1]) {
        vertices[v + 0] = p.x;
        vertices[v + 1] = p.y;
        vertices[v + 2] = p.z;
        vertices[v + 3] = tx;
        vertices[v + 4] = ty;
        vertices[v + 5] = tz;
        vertices[v + 6] = side;
        vertices[v + 7] = t;
        v += RIBBON_STRIDE;
      }
    }

    const first = i;
    for (let k = 0; k < n - 1; k++) {
      const a = baseVertex + k * 2;
      indices[i + 0] = a;
      indices[i + 1] = a + 1;
      indices[i + 2] = a + 2;
      indices[i + 3] = a + 1;
      indices[i + 4] = a + 3;
      indices[i + 5] = a + 2;
      i += 6;
    }
    ranges.push({ first, count: i - first });
    baseVertex += n * 2;
  }

  return { vertices, indices, vertexCount: points * 2, ranges };
}

/**
 * Sample the great circle between two coordinates at a given radius.
 *
 * Spherical linear interpolation between the two unit vectors. Every sample is exactly on the
 * sphere of that radius, which is what makes the depth test occlude the far half correctly: a
 * chord shortcut would dip inside the planet near the middle of a long arc and be swallowed by
 * the surface even on the near side.
 *
 * @param {{lat:number, lon:number}} from
 * @param {{lat:number, lon:number}} to
 * @param {number} [radius]
 * @returns {{x:number,y:number,z:number}[]}
 */
export function sampleGreatCircle(from, to, radius = ARC_RADIUS) {
  const a = coordToVec3(from.lat, from.lon, 1);
  const b = coordToVec3(to.lat, to.lon, 1);
  const cosAngle = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const angle = Math.acos(cosAngle);

  const steps = Math.max(
    ARC_MIN_SAMPLES,
    Math.ceil((angle * 180) / Math.PI / ARC_SAMPLE_STEP_DEG),
  );

  /** @type {{x:number,y:number,z:number}[]} */
  const out = [];

  if (angle < 1e-9) {
    // The two coordinates coincide. There is no great circle and no honest way to draw one, so
    // the caller gets the single point twice and the ribbon collapses to nothing visible. The
    // endpoint marker is what the reader sees, which is correct: the distance really is zero.
    for (let k = 0; k <= 1; k++) out.push({ x: a.x * radius, y: a.y * radius, z: a.z * radius });
    return out;
  }

  const sinAngle = Math.sin(angle);
  const antipodal = angle > Math.PI - 1e-6;
  // At the antipode every great circle between the two points is equally short, so slerp is
  // undefined rather than merely imprecise. Pick one plane deterministically instead of
  // dividing by a sine that is on its way to zero.
  const via = antipodal ? perpendicularTo(a) : null;

  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    let p;
    if (antipodal && via) {
      const half = angle * t;
      p = {
        x: a.x * Math.cos(half) + via.x * Math.sin(half),
        y: a.y * Math.cos(half) + via.y * Math.sin(half),
        z: a.z * Math.cos(half) + via.z * Math.sin(half),
      };
    } else {
      const s0 = Math.sin((1 - t) * angle) / sinAngle;
      const s1 = Math.sin(t * angle) / sinAngle;
      p = { x: a.x * s0 + b.x * s1, y: a.y * s0 + b.y * s1, z: a.z * s0 + b.z * s1 };
    }
    const l = Math.hypot(p.x, p.y, p.z) || 1;
    out.push({ x: (p.x / l) * radius, y: (p.y / l) * radius, z: (p.z / l) * radius });
  }
  return out;
}

/** @param {{x:number,y:number,z:number}} v @returns {{x:number,y:number,z:number}} */
function perpendicularTo(v) {
  const alt = Math.abs(v.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const c = {
    x: alt.y * v.z - alt.z * v.y,
    y: alt.z * v.x - alt.x * v.z,
    z: alt.x * v.y - alt.y * v.x,
  };
  const l = Math.hypot(c.x, c.y, c.z);
  return { x: c.x / l, y: c.y / l, z: c.z / l };
}

/**
 * The bundled coastline, as world space polylines at COASTLINE_RADIUS. Built once and memoised
 * because the render loop stops and restarts (DESIGN 6.5) and must not rebuild on resume.
 * @returns {{x:number,y:number,z:number}[][]}
 */
let coastLinesCache = null;
export function coastlineLines() {
  if (coastLinesCache) return coastLinesCache;
  const c = coastline();
  /** @type {{x:number,y:number,z:number}[][]} */
  const lines = [];
  for (let l = 0; l < c.lineStart.length; l++) {
    const start = c.lineStart[l];
    const n = c.lineCount[l];
    /** @type {{x:number,y:number,z:number}[]} */
    const line = [];
    for (let k = 0; k < n; k++) {
      line.push(coordToVec3(c.lat[start + k], c.lon[start + k], COASTLINE_RADIUS));
    }
    lines.push(line);
  }
  coastLinesCache = lines;
  return lines;
}

/** Test seam, paired with resetCoastlineCache. */
export function resetGeometryCache() {
  coastLinesCache = null;
}

/**
 * A latitude and longitude tessellation of the globe surface.
 *
 * Longitude segments decide how smooth the LIMB looks, and the limb is the silhouette the
 * whole composition rests on, so it gets more segments than the latitude bands do. The normal
 * of a unit sphere is its own position, so no normal attribute is uploaded.
 *
 * @param {number} [lonSegments]
 * @param {number} [latSegments]
 * @returns {{positions:Float32Array, indices:Uint32Array}}
 */
export function buildSphere(lonSegments = 128, latSegments = 72) {
  const cols = lonSegments + 1;
  const rows = latSegments + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint32Array(lonSegments * latSegments * 6);

  let p = 0;
  for (let r = 0; r < rows; r++) {
    const lat = 90 - (180 * r) / latSegments;
    for (let c = 0; c < cols; c++) {
      const lon = -180 + (360 * c) / lonSegments;
      const v = coordToVec3(lat, lon, GLOBE_RADIUS);
      positions[p++] = v.x;
      positions[p++] = v.y;
      positions[p++] = v.z;
    }
  }

  let i = 0;
  for (let r = 0; r < latSegments; r++) {
    for (let c = 0; c < lonSegments; c++) {
      const a = r * cols + c;
      const b = a + cols;
      indices[i++] = a;
      indices[i++] = b;
      indices[i++] = a + 1;
      indices[i++] = a + 1;
      indices[i++] = b;
      indices[i++] = b + 1;
    }
  }
  return { positions, indices };
}

/**
 * Screen aligned quads for the endpoint markers, one per coordinate.
 *
 * Quads and not gl.POINTS, for the same family of reason that rules out gl.LINES: gl_PointSize
 * above the implementation maximum is silently clamped, the maximum is allowed to be small,
 * and point sprites do not antialias. A quad expanded in the vertex shader has none of that.
 *
 * @param {{lat:number, lon:number}[]} coords
 * @param {number} [radius]
 * @returns {{vertices:Float32Array, indices:Uint32Array, count:number}}
 */
export function buildMarkers(coords, radius = ARC_RADIUS) {
  const vertices = new Float32Array(coords.length * 4 * MARKER_STRIDE);
  const indices = new Uint32Array(coords.length * 6);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  let v = 0;
  let i = 0;
  coords.forEach((c, k) => {
    const p = coordToVec3(c.lat, c.lon, radius);
    for (const corner of corners) {
      vertices[v + 0] = p.x;
      vertices[v + 1] = p.y;
      vertices[v + 2] = p.z;
      vertices[v + 3] = corner[0];
      vertices[v + 4] = corner[1];
      vertices[v + 5] = k;
      v += MARKER_STRIDE;
    }
    const base = k * 4;
    indices[i++] = base;
    indices[i++] = base + 1;
    indices[i++] = base + 2;
    indices[i++] = base;
    indices[i++] = base + 2;
    indices[i++] = base + 3;
  });
  return { vertices, indices, count: coords.length };
}
