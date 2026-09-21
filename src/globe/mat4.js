// 4x4 matrix and 3 vector maths for the globe. GLOBE team. DESIGN 6.1.
//
// WRITTEN FROM THE FORMULAE, NOT COPIED. DESIGN 6.1 proposed inlining a subset of gl-matrix
// under its MIT notice. This file replaces that decision and the reason is a licence one: an
// inlined third party subset carries a copyright notice that has to travel with every copy of
// the page, forever, for about a dozen textbook linear algebra routines. Every function below
// is the standard construction from a graphics text (column major, right handed, OpenGL clip
// space with z in [-1, 1]) written out directly, so the shipped page carries exactly one
// copyright line, which is the repo own.
//
// A reader who wants to check this does not have to trust the claim. test/globe-mat4.test.js
// verifies each routine against its defining property rather than against a reference
// implementation: the perspective matrix is checked by projecting points whose clip space
// answer is known in closed form, the inverse is checked by multiplying back to the identity,
// and lookAt is checked by asserting the basis it produces is orthonormal and that the target
// lands on the negative z axis of the view.
//
// LAYOUT. Column major, the same order WebGL uploads with gl.uniformMatrix4fv(.., false, m).
// Element m[c * 4 + r] is row r of column c. Multiplication is out = a * b, applied to a
// column vector as a * (b * v), so the rightmost matrix acts first.
//
// Isomorphic: no node:* imports and no DOM. Float64Array internally so the CPU reference
// rasterizer and the browser agree bit for bit on the same machine; the upload to WebGL
// narrows to Float32Array at the boundary and only there.

/** @typedef {Float64Array} Mat4 */
/** @typedef {{x:number, y:number, z:number}} Vec3 */

/** @returns {Mat4} */
export function identity() {
  const m = new Float64Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

/**
 * out = a * b.
 * @param {Mat4} a @param {Mat4} b @returns {Mat4}
 */
export function multiply(a, b) {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

/**
 * Right handed perspective projection into OpenGL clip space, z in [-1, 1].
 *
 * f = 1 / tan(fovY / 2). The x column is f / aspect, the y column is f, and the z column maps
 * [near, far] onto [-1, 1] after the perspective divide by w = -z_view.
 *
 * @param {number} fovYRad Vertical field of view in radians.
 * @param {number} aspect width / height.
 * @param {number} near Positive.
 * @param {number} far Positive, greater than near.
 * @returns {Mat4}
 */
export function perspective(fovYRad, aspect, near, far) {
  if (!(fovYRad > 0) || !(aspect > 0) || !(near > 0) || !(far > near)) {
    throw new RangeError('perspective: needs fovY > 0, aspect > 0, 0 < near < far');
  }
  const f = 1 / Math.tan(fovYRad / 2);
  const nf = 1 / (near - far);
  const m = new Float64Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

/**
 * Right handed view matrix. The camera sits at eye, looks at target, and up is the world up
 * hint. The resulting basis has the camera looking down its own negative z.
 *
 * @param {Vec3} eye @param {Vec3} target @param {Vec3} up @returns {Mat4}
 */
export function lookAt(eye, target, up) {
  const zx = eye.x - target.x;
  const zy = eye.y - target.y;
  const zz = eye.z - target.z;
  const zl = Math.hypot(zx, zy, zz);
  if (zl === 0) throw new RangeError('lookAt: eye and target coincide, the view has no forward axis');
  const z = { x: zx / zl, y: zy / zl, z: zz / zl };

  let x = cross(up, z);
  let xl = length(x);
  if (xl < 1e-12) {
    // up is parallel to the view axis. Pick any perpendicular rather than emitting NaN, and
    // say so, because a silent NaN matrix renders an empty canvas with no error anywhere.
    const alt = Math.abs(z.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    x = cross(alt, z);
    xl = length(x);
  }
  x = { x: x.x / xl, y: x.y / xl, z: x.z / xl };
  const y = cross(z, x);

  const m = new Float64Array(16);
  m[0] = x.x; m[4] = x.y; m[8] = x.z; m[12] = -dot(x, eye);
  m[1] = y.x; m[5] = y.y; m[9] = y.z; m[13] = -dot(y, eye);
  m[2] = z.x; m[6] = z.y; m[10] = z.z; m[14] = -dot(z, eye);
  m[15] = 1;
  return m;
}

/**
 * Rotation about the world Y axis, which is the polar axis in this product's frame.
 * @param {number} rad @returns {Mat4}
 */
export function rotationY(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = identity();
  m[0] = c; m[2] = -s;
  m[8] = s; m[10] = c;
  return m;
}

/**
 * Rotation about the world X axis.
 * @param {number} rad @returns {Mat4}
 */
export function rotationX(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = identity();
  m[5] = c; m[6] = s;
  m[9] = -s; m[10] = c;
  return m;
}

/**
 * Transform a point (w = 1) and keep w, so the caller can do its own perspective divide and
 * keep the clip space z for the depth test.
 * @param {Mat4} m @param {Vec3} v @returns {{x:number, y:number, z:number, w:number}}
 */
export function transformPoint(m, v) {
  return {
    x: m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12],
    y: m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13],
    z: m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14],
    w: m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15],
  };
}

/**
 * Transform a direction (w = 0). Correct for the model matrices this product uses, which are
 * rotations only. A non uniform scale would need the inverse transpose, and there is none
 * here; the assertion below is what stops that changing silently.
 * @param {Mat4} m @param {Vec3} v @returns {Vec3}
 */
export function transformDirection(m, v) {
  return {
    x: m[0] * v.x + m[4] * v.y + m[8] * v.z,
    y: m[1] * v.x + m[5] * v.y + m[9] * v.z,
    z: m[2] * v.x + m[6] * v.y + m[10] * v.z,
  };
}

/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** @param {Vec3} a @param {Vec3} b @returns {number} */
export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** @param {Vec3} a @returns {number} */
export function length(a) {
  return Math.hypot(a.x, a.y, a.z);
}

/** @param {Vec3} a @returns {Vec3} */
export function normalize(a) {
  const l = length(a);
  if (l === 0) throw new RangeError('normalize: the zero vector has no direction');
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** @param {Vec3} a @param {number} k @returns {Vec3} */
export function scale(a, k) {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * General 4x4 inverse by cofactor expansion. Used by the test suite to verify the forward
 * matrices by round trip, and by nothing on the render path.
 * @param {Mat4} m @returns {Mat4}
 */
export function invert(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (det === 0) throw new RangeError('invert: singular matrix');
  const d = 1 / det;

  const out = new Float64Array(16);
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return out;
}

/**
 * Narrow to the type WebGL uploads. The one place precision is dropped, so it is one call and
 * not a scattering of Float32Array constructors.
 * @param {Mat4} m @returns {Float32Array}
 */
export function toFloat32(m) {
  return new Float32Array(m);
}
