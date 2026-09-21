// The ribbon expansion, written once. GLOBE team. DESIGN 6.1, globe contract RENDER_RULES.
//
// This module exists because the same arithmetic has to run in two places: in GLSL on the GPU,
// and in JavaScript in the deterministic reference rasterizer that test/globe-render.test.js
// uses to assert pixel invariants. Two hand written copies of one formula drift, and the copy
// that drifts is always the one nobody looks at, so the GLSL is GENERATED from the ordered
// step list below and the JavaScript sits directly beneath it with the step names in its
// comments. test/globe-pipeline.test.js asserts the shader actually contains the generated
// block, so an edit to one that is not made to the other fails the suite.
//
// WHAT IT DOES, in one paragraph. A stroke of constant pixel width cannot be a line primitive,
// because ALIASED_LINE_WIDTH_RANGE is allowed to top out at 1 and frequently does. So each
// point of a stroke is uploaded twice with a side attribute of -1 and +1, and the vertex
// shader projects the point and a second point one tangent away, measures the direction
// between them IN PIXELS, takes the perpendicular, and pushes the vertex half a stroke width
// along it. The result is a triangle ribbon whose width is exact in pixels at any zoom.
//
// THE PART THAT IS EASY TO GET WRONG AND IS THE WHOLE POINT OF THE PRODUCT'S GLOBE. The offset
// is applied in normalised device coordinates and then multiplied back up by clipA.w, and the
// z component is carried through UNCHANGED from the projected point. That is what keeps the
// depth value of a ribbon vertex the true depth of the point it came from, which is what lets
// depth testing occlude the far side of the planet correctly. An implementation that offsets
// in clip space before the divide, or that rebuilds gl_Position from scratch, gets a plausible
// looking picture with a subtly wrong depth, and the failure shows up exactly where DESIGN 5
// says a graphics literate reader looks first.
//
// Isomorphic: no node:* imports and no DOM.

/**
 * The expansion, as an ordered list of GLSL statements with the reason for each. The shader is
 * assembled from this and the JavaScript below mirrors it step for step.
 */
export const RIBBON_EXPANSION_STEPS = Object.freeze([
  Object.freeze({
    name: 'project',
    glsl: 'vec4 clipA = uViewProj * vec4(aPosition, 1.0);',
    why: 'The point itself, in clip space. Everything else is relative to this.',
  }),
  Object.freeze({
    name: 'projectTangent',
    glsl: 'vec4 clipB = uViewProj * vec4(aPosition + aTangent, 1.0);',
    why: 'A second point one tangent along the stroke, so the screen direction can be measured '
      + 'after projection rather than guessed before it.',
  }),
  Object.freeze({
    name: 'divide',
    glsl: 'vec2 ndcA = clipA.xy / clipA.w;\n  vec2 ndcB = clipB.xy / clipB.w;',
    why: 'The perspective divide. A direction taken before this is the direction in the world, '
      + 'not the direction on the screen, and under perspective those differ.',
  }),
  Object.freeze({
    name: 'pixelDirection',
    glsl: 'vec2 deltaPx = (ndcB - ndcA) * uViewportPx * 0.5;\n'
      + '  vec2 dirPx = length(deltaPx) > 0.0 ? normalize(deltaPx) : vec2(1.0, 0.0);',
    why: 'Into pixels before normalising, because normalising in normalised device coordinates '
      + 'would make the stroke width depend on the aspect ratio. The guard is for a degenerate '
      + 'tangent, where normalize would return NaN and silently erase the stroke.',
  }),
  Object.freeze({
    name: 'perpendicular',
    glsl: 'vec2 perpPx = vec2(-dirPx.y, dirPx.x);',
    why: 'The screen space normal of the stroke. Rotating by ninety degrees is the whole trick.',
  }),
  Object.freeze({
    name: 'offset',
    glsl: 'vec2 offsetNdc = perpPx * aSide * uHalfWidthPx * 2.0 / uViewportPx;',
    why: 'Back out of pixels into normalised device coordinates. The factor of two is because '
      + 'that space spans -1 to 1 across the viewport, so one unit is half the viewport.',
  }),
  Object.freeze({
    name: 'reassemble',
    glsl: 'gl_Position = vec4((ndcA + offsetNdc) * clipA.w, clipA.z, clipA.w);',
    why: 'Multiply back up by w so the hardware divide restores the offset position, and carry '
      + 'clipA.z through untouched so the depth of the ribbon is the depth of the point. This '
      + 'line is why the far side of the globe occludes correctly.',
  }),
]);

/** The generated GLSL block, embedded verbatim in the vertex shader. */
export const RIBBON_EXPANSION_GLSL = RIBBON_EXPANSION_STEPS
  .map((s) => '  ' + s.glsl)
  .join('\n');

/**
 * The JavaScript mirror. Step names match RIBBON_EXPANSION_STEPS one for one.
 *
 * @param {Float64Array} viewProj Column major, as uploaded.
 * @param {{x:number,y:number,z:number}} position
 * @param {{x:number,y:number,z:number}} tangent
 * @param {number} side -1 or +1.
 * @param {number} halfWidthPx Half the stroke width, in DEVICE pixels.
 * @param {[number, number]} viewportPx Drawing buffer size in device pixels.
 * @returns {{x:number, y:number, z:number, w:number}} Clip space, exactly what gl_Position holds.
 */
export function expandRibbonVertex(viewProj, position, tangent, side, halfWidthPx, viewportPx) {
  // project
  const clipA = mul(viewProj, position.x, position.y, position.z);
  // projectTangent
  const clipB = mul(viewProj,
    position.x + tangent.x, position.y + tangent.y, position.z + tangent.z);
  // divide
  const ndcAx = clipA.x / clipA.w;
  const ndcAy = clipA.y / clipA.w;
  const ndcBx = clipB.x / clipB.w;
  const ndcBy = clipB.y / clipB.w;
  // pixelDirection
  const deltaPxX = (ndcBx - ndcAx) * viewportPx[0] * 0.5;
  const deltaPxY = (ndcBy - ndcAy) * viewportPx[1] * 0.5;
  const deltaLen = Math.hypot(deltaPxX, deltaPxY);
  const dirX = deltaLen > 0 ? deltaPxX / deltaLen : 1;
  const dirY = deltaLen > 0 ? deltaPxY / deltaLen : 0;
  // perpendicular
  const perpX = -dirY;
  const perpY = dirX;
  // offset
  const offX = (perpX * side * halfWidthPx * 2) / viewportPx[0];
  const offY = (perpY * side * halfWidthPx * 2) / viewportPx[1];
  // reassemble
  return {
    x: (ndcAx + offX) * clipA.w,
    y: (ndcAy + offY) * clipA.w,
    z: clipA.z,
    w: clipA.w,
  };
}

/** @param {Float64Array} m */
function mul(m, x, y, z) {
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12],
    y: m[1] * x + m[5] * y + m[9] * z + m[13],
    z: m[2] * x + m[6] * y + m[10] * z + m[14],
    w: m[3] * x + m[7] * y + m[11] * z + m[15],
  };
}

/**
 * Clip space to device pixel coordinates, with the depth the test compares against.
 *
 * Pixel centres sit at half integers, matching the convention WebGL rasterises with, so a
 * pixel index i covers [i, i + 1) and is sampled at i + 0.5. Getting this wrong shifts the
 * whole reference image by half a pixel against the real one, which is the kind of difference
 * that makes a pixel assertion flaky rather than false.
 *
 * @param {{x:number,y:number,z:number,w:number}} clip
 * @param {[number, number]} viewportPx
 * @returns {{x:number, y:number, z:number, w:number}} x and y in pixels, z in [-1, 1].
 */
export function clipToScreen(clip, viewportPx) {
  const ix = clip.x / clip.w;
  const iy = clip.y / clip.w;
  return {
    x: (ix * 0.5 + 0.5) * viewportPx[0],
    // y is flipped: clip space is y up, a framebuffer row index is y down.
    y: (1 - (iy * 0.5 + 0.5)) * viewportPx[1],
    z: clip.z / clip.w,
    w: clip.w,
  };
}
