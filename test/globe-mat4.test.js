// The matrix maths, checked against its DEFINING PROPERTIES rather than against a reference
// implementation. GLOBE team. DESIGN 6.1.
//
// This matters because src/globe/mat4.js is hand written specifically so the page carries no
// third party copyright notice. A test that compared it to gl-matrix would be a test that
// assumed the thing it is replacing. Every assertion below is a property a correct matrix has:
// the inverse multiplies back to the identity, the view basis is orthonormal, the projection
// puts the near plane at minus one and the far plane at plus one, and a point on the view axis
// lands in the centre of the screen.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  identity, multiply, perspective, lookAt, rotationX, rotationY, transformPoint,
  transformDirection, cross, dot, length, normalize, invert, toFloat32,
} from '../src/globe/mat4.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function assertNear(a, b, why, eps = 1e-9) {
  assert.ok(near(a, b, eps), why + ': expected ' + b + ', got ' + a);
}

describe('multiply and identity', () => {
  test('the identity is a left and a right identity', () => {
    const m = perspective(1, 1.3, 0.5, 9);
    const l = multiply(identity(), m);
    const r = multiply(m, identity());
    for (let i = 0; i < 16; i++) {
      assertNear(l[i], m[i], 'left identity element ' + i);
      assertNear(r[i], m[i], 'right identity element ' + i);
    }
  });

  test('multiplication is associative, which is the property the render path relies on', () => {
    const a = rotationY(0.3);
    const b = rotationX(-0.7);
    const c = perspective(0.9, 1.77, 0.1, 20);
    const left = multiply(multiply(c, b), a);
    const right = multiply(c, multiply(b, a));
    for (let i = 0; i < 16; i++) assertNear(left[i], right[i], 'element ' + i, 1e-12);
  });

  test('the rightmost matrix acts first on a column vector', () => {
    // A rotation of ninety degrees about Y takes +X to -Z in this frame.
    const p = transformPoint(rotationY(Math.PI / 2), { x: 1, y: 0, z: 0 });
    assertNear(p.x, 0, 'x', 1e-12);
    assertNear(p.y, 0, 'y', 1e-12);
    assertNear(p.z, -1, 'z', 1e-12);
  });
});

describe('perspective', () => {
  const fov = (40 * Math.PI) / 180;
  const n = 0.25;
  const f = 12;

  test('a point on the near plane maps to clip z of minus w, and the far plane to plus w', () => {
    const m = perspective(fov, 1, n, f);
    const atNear = transformPoint(m, { x: 0, y: 0, z: -n });
    const atFar = transformPoint(m, { x: 0, y: 0, z: -f });
    assertNear(atNear.z / atNear.w, -1, 'near plane depth', 1e-12);
    assertNear(atFar.z / atFar.w, 1, 'far plane depth', 1e-12);
  });

  test('a point on the view axis lands in the centre of the screen', () => {
    const m = perspective(fov, 2.1, n, f);
    const p = transformPoint(m, { x: 0, y: 0, z: -3 });
    assertNear(p.x / p.w, 0, 'centre x', 1e-12);
    assertNear(p.y / p.w, 0, 'centre y', 1e-12);
  });

  test('the top of the frustum at any depth lands exactly on the top of the screen', () => {
    const m = perspective(fov, 1.5, n, f);
    const depth = 4;
    const topY = Math.tan(fov / 2) * depth;
    const p = transformPoint(m, { x: 0, y: topY, z: -depth });
    assertNear(p.y / p.w, 1, 'top edge', 1e-12);
  });

  test('the aspect ratio scales x and only x', () => {
    const square = perspective(fov, 1, n, f);
    const wide = perspective(fov, 2, n, f);
    assertNear(wide[0], square[0] / 2, 'x scale halves when the viewport doubles in width', 1e-15);
    assertNear(wide[5], square[5], 'y scale is unaffected by aspect', 1e-15);
  });

  test('a degenerate frustum is refused rather than producing a matrix full of infinities', () => {
    assert.throws(() => perspective(0, 1, 1, 2), /fovY/);
    assert.throws(() => perspective(1, 0, 1, 2), /aspect/);
    assert.throws(() => perspective(1, 1, 0, 2), /near/);
    assert.throws(() => perspective(1, 1, 3, 2), /far/);
  });
});

describe('lookAt', () => {
  const eye = { x: 3, y: 2, z: -4 };
  const target = { x: 0, y: 0, z: 0 };
  const up = { x: 0, y: 1, z: 0 };

  test('the target lands on the negative z axis of the view, at the right distance', () => {
    const v = lookAt(eye, target, up);
    const p = transformPoint(v, target);
    assertNear(p.x, 0, 'target x', 1e-12);
    assertNear(p.y, 0, 'target y', 1e-12);
    assertNear(p.z, -length(eye), 'the target is exactly the eye distance in front', 1e-12);
  });

  test('the eye lands at the origin of the view', () => {
    const p = transformPoint(lookAt(eye, target, up), eye);
    assertNear(length({ x: p.x, y: p.y, z: p.z }), 0, 'eye at the view origin', 1e-12);
  });

  test('the basis it builds is orthonormal', () => {
    const v = lookAt(eye, target, up);
    const rows = [
      { x: v[0], y: v[4], z: v[8] },
      { x: v[1], y: v[5], z: v[9] },
      { x: v[2], y: v[6], z: v[10] },
    ];
    for (let i = 0; i < 3; i++) {
      assertNear(length(rows[i]), 1, 'row ' + i + ' is a unit vector', 1e-12);
      for (let j = i + 1; j < 3; j++) {
        assertNear(dot(rows[i], rows[j]), 0, 'rows ' + i + ' and ' + j + ' are perpendicular', 1e-12);
      }
    }
  });

  test('an up vector parallel to the view axis does not produce NaN', () => {
    // A silent NaN matrix renders an empty canvas with no error anywhere, which is the most
    // expensive bug in this whole module to find. The code picks a perpendicular instead.
    const v = lookAt({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    for (let i = 0; i < 16; i++) assert.ok(Number.isFinite(v[i]), 'element ' + i + ' is not finite');
  });

  test('a camera sitting on its own target is refused', () => {
    assert.throws(() => lookAt(target, target, up), /coincide/);
  });
});

describe('invert', () => {
  test('a view times its inverse is the identity', () => {
    const v = lookAt({ x: -2, y: 1.5, z: 6 }, { x: 0.2, y: 0, z: -0.1 }, { x: 0, y: 1, z: 0 });
    const back = multiply(v, invert(v));
    const id = identity();
    for (let i = 0; i < 16; i++) assertNear(back[i], id[i], 'element ' + i, 1e-10);
  });

  test('a projection times its inverse is the identity', () => {
    const p = perspective(0.7, 1.9, 0.3, 40);
    const back = multiply(invert(p), p);
    const id = identity();
    for (let i = 0; i < 16; i++) assertNear(back[i], id[i], 'element ' + i, 1e-10);
  });

  test('a singular matrix is refused', () => {
    assert.throws(() => invert(new Float64Array(16)), /singular/);
  });
});

describe('vector helpers', () => {
  test('cross is perpendicular to both inputs and follows the right hand rule', () => {
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 1, z: 0 };
    const c = cross(a, b);
    assert.deepEqual(c, { x: 0, y: 0, z: 1 });
    assertNear(dot(c, a), 0, 'perpendicular to a');
    assertNear(dot(c, b), 0, 'perpendicular to b');
  });

  test('normalize refuses the zero vector instead of returning NaN', () => {
    assert.throws(() => normalize({ x: 0, y: 0, z: 0 }), /zero vector/);
  });

  test('transformDirection ignores translation', () => {
    const m = identity();
    m[12] = 100;
    m[13] = -50;
    const d = transformDirection(m, { x: 1, y: 2, z: 3 });
    assert.deepEqual(d, { x: 1, y: 2, z: 3 });
  });

  test('toFloat32 is the only narrowing, and it narrows', () => {
    const m = perspective(0.6, 1.4, 0.2, 9);
    const f = toFloat32(m);
    assert.ok(f instanceof Float32Array);
    assert.equal(f.length, 16);
    for (let i = 0; i < 16; i++) assertNear(f[i], m[i], 'element ' + i, 1e-6);
  });
});
