# src/globe  GLOBE team

Hand rolled WebGL2. No framework, no library, no texture, no font, no network call.
DESIGN 6.1, 6.2, 6.5, 6.6. Input shape and the pinned decisions: `../core/contracts/globe.js`.

## The one line version

A near black planet, coastlines as thin luminous strokes, great circles at radius 1.001 with
depth testing on so the far side is occluded by the limb, and exactly one saturated colour in
the whole scene, spent on the single worst offender.

## What an arc is

The great circle between two coordinates. It is the geometry the floor is computed from,
drawn. It is not a route, it is not a cable, and it is not where anything travelled. The
contract throws if an arc arrives carrying an intermediate point, and nothing here invents one:
the samples exist because a straight line in three dimensions between two points on a sphere
cuts through the planet, and for no other reason.

`test/globe-geometry.test.js` sums the chords of the drawn samples, converts to kilometres, and
compares against the product's own haversine in `src/core/geo.js`. They agree to a relative
1e-12. The picture and the number describe the same geometry, and the number is the one a
reader is being asked to trust.

## The three decisions that decide the whole look

**Never `gl.LINES`.** `gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)` frequently returns a
usable maximum of 1 on ANGLE and Direct3D backends, and the WebGL specification permits exactly
that. Every thin, crawling amateur globe looks that way for that one reason. So every stroke,
coastline and arc alike, is expanded into a triangle ribbon whose width is applied in SCREEN
space by the vertex shader. `test/globe-pipeline.test.js` asserts the same stroke is the same
number of pixels wide at five different zoom levels, to within 1e-9.

**Arcs at radius 1.001, depth test on, depth write off.** The planet writes depth and nothing
after it does. `test/globe-webgl.test.js` counts the draw calls made while `depthMask(true)` is
in force and asserts the answer is one.

**One accent.** `#d4ff3a` in the dark theme, `#2d6b00` in light, on the worst offender and on
nothing else. `test/globe-render.test.js` counts the saturated pixels in a rendered frame, then
re renders with that arc demoted to idle and asserts the count falls to zero. If any other
element were reaching for the accent, it would not.

## Files

| file | what it owns |
|---|---|
| `index.js` | Mount, render loop, device pixel ratio cap, frame time probe, teardown. The entry point. |
| `mat4.js` | Matrix and vector maths, written from the formulae so the page carries no third party notice. |
| `camera.js` | Camera state, matrices, zoom clamp, keyboard moves, the visible cap. Pure. |
| `coastline-data.js` | GENERATED. Natural Earth 110m, delta encoded, base64. Do not edit. |
| `coastline.js` | The decoder, and the attribution. |
| `geometry.js` | Great circle sampling, ribbon expansion buffers, sphere, markers. |
| `pipeline.js` | The ribbon expansion, once, as the GLSL source and its JavaScript mirror. |
| `shaders.js` | Four programs. Planet, atmosphere, ribbon, marker. |
| `palette.js` | Token to shader colour, and the globe's declared text pairs. Declares no colour. |
| `scene.js` | GlobeInput to a draw list. One description, three consumers. |
| `renderer.js` | The WebGL2 path. |
| `raster.js` | The deterministic reference rasterizer the tests read pixels from. |
| `fallback.js` | The no WebGL2 map, as a spec tree plus a DOM mounter. |
| `a11y.js` | Keyboard path, live region, spelled out emphasis. |
| `replay.js` | The fixed camera and fixed arcs behind the capture rig and the render test. |

## How the pixels are tested without a GPU

There is no WebGL2 context in a Node test runner, so `raster.js` is a small exact software
rasterizer with a real depth buffer. It runs the SAME camera matrices, the SAME great circle
samples and the SAME ribbon expansion as the GPU path, because both import them from the same
modules. `test/globe-render.test.js` draws the committed fixture to an offscreen buffer and
reads pixels.

The occlusion claim gets a pair of tests, not one. The first finds every sample of the accented
arc that is behind the planet and well inside the silhouette, and asserts the accent is not
painted there. The second renders the identical scene with one flag flipped, `strokeDepthTest:
false`, and requires those same pixels to light up. An occlusion assertion passes trivially if
the arc simply is not drawn, so the negative control is what makes the first one mean anything.

`scripts/globe-reference-render.mjs` writes both images out as PNG files so a person can see
what the assertions are talking about.

The GPU path is covered separately, in `test/globe-webgl.test.js`, against a context that
records every call it receives. That is where "never a line primitive", the depth state, the
draw order, the cull face flip and the premultiplied blend are asserted.

## Regenerating the coastline

```
node scripts/build-coastline.mjs            rewrite src/globe/coastline-data.js
node scripts/build-coastline.mjs --check    fail if the committed file is stale
```

Natural Earth is public domain and its own terms say crediting is unnecessary. It is credited
anyway, in `COASTLINE_ATTRIBUTION` and in the page. A product whose subject is provenance does
not take an uncredited asset just because it is allowed to.

Every figure in the generated file is an output of the generator rather than a transcription:
134 source features, 5128 source points, 5022 points kept after a Douglas Peucker pass at one
quantisation step, 13796 bytes of binary, 18396 bytes of base64. DESIGN 6.3 states a different
point count for this layer which could not be reproduced from any Natural Earth 110m layer, so
under the standing rule it was cut rather than softened and these numbers are the computed ones.

## Accessibility, and what the canvas is not

The canvas is decorative. It carries `role="img"` and a text summary and it holds no
information a reader can only get by looking at it. Every measured value lives in the table the
UI team owns, each one carrying its provenance badge.

What this module adds is the keyboard path over the geometry. Every endpoint is a button in the
tab order, focus drives the camera to it, arrow keys rotate, plus and minus zoom, Home resets,
and every move announces through a polite live region. Emphasis is spelled out in words in the
same element, never carried by colour, because the badge mechanism this whole product rests on
collapses for a colour blind reader the moment colour becomes load bearing.

No string this module renders contains a digit. That is not a style preference: every figure a
reader receives goes through the claim system, which cannot produce text without a badge, and a
camera bearing is not a claim about the world. Describing it in words keeps the rule absolute
instead of carving out an exception for the part nobody was going to check.

## Performance posture

The render loop runs only while something is actually moving. Idle input, a hidden document, or
`prefers-reduced-motion` all leave the frame queue empty, and `test/globe-integration.test.js`
asserts that by counting the pending callbacks in a manual animation frame queue. A still globe
at zero frames per second is visually identical to a still globe at sixty and costs nothing,
which is the whole mobile strategy. The device pixel ratio is capped at 2, the atmosphere is
one extra draw call, and bloom is off by default behind a frame time probe that must clear the
budget over thirty consecutive frames.
