# src/render  the render port

**The globe itself is in `../globe/`.** This directory holds one file, `index.js`, and it is
the adapter between two shapes that are each right for their own side.

`../ui/ports.js` publishes a renderer port shaped `{ mount(node), update(globeInput) }`: push a
scene in when the page changes. `../globe/index.js` is built around a pull instead,
`createGlobe(container, { getInput })`, which is what lets it run animation frames only while
something is actually moving and stop dead when nothing is. Neither shape is wrong and neither
is the other, so the translation lives here rather than being smeared across both.

It also owns the one thing neither side could do alone: painting the planet at mount time,
before any `GlobeInput` exists. DESIGN 5 second 0 promises a page that is already drawn before
anything has touched the network, and at that moment this page has asked nobody anything.
`../core/contracts/globe.js` expresses that as `observer: null` and refuses any arc beside it,
so the planet is drawn and no dot is plotted at a place the page made up.

## What this directory must never do

- **Open a connection.** There is no URL anywhere under `src/render` or `src/globe`. The
  coastline is bundled; the geometry is arithmetic. Every network call in this product is in
  `src/measure`, whose hosts are literals that `scripts/gate-csp.mjs` compares against the
  page's own Content-Security-Policy.
- **Render a figure.** A `GlobeInput` is geometry and a text alternative. Every millisecond a
  reader sees is in the table, where it goes through the claim badge system.
- **Draw a route.** An arc is the great circle between two coordinates: the geometry the floor
  is computed from, drawn. The contract throws if an arc is given an intermediate point.

## The pinned render decisions

They are in `../core/contracts/globe.js` as `RENDER_RULES`, not here, so that the code enforces
them. The three that decide the whole look:

- Never `gl.LINES`. `ALIASED_LINE_WIDTH_RANGE` frequently maxes out at 1 on ANGLE and Direct3D
  and the specification permits it. Every arc and every coastline is expanded into a triangle
  strip ribbon in the vertex shader.
- Arcs at radius 1.001 with depth testing on, so the far side is occluded by the limb.
- No photographic Earth texture, and no particles on arcs.
