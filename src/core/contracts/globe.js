// CONTRACT: the globe input shape. Owned by the FOUNDATION team, produced by the UI team,
// consumed by the RENDER team.
//
// DESIGN 5 (the reveal), DESIGN 6.1 (hand rolled WebGL2), DESIGN 6.2 (art direction),
// DESIGN 6.5 (mobile), DESIGN 6.6 (the canvas is decorative and the DOM is authoritative),
// traps 16, 18, 19.
//
// WHAT AN ARC IS, AND WHAT IT IS NOT. This is the single most important line in this file.
//
//   An arc is the GREAT CIRCLE between two coordinates. It is the geometry the floor is
//   computed from, drawn. It is NOT a route, NOT a path, NOT a cable, and NOT where anything
//   travelled. The page draws no cable, names no facility along the way, and plots no visitor.
//   The renderer must never be given, and must never invent, an intermediate waypoint.
//
// The globe carries role="img" with a text summary and its ornamental layers are aria-hidden.
// The measurement result is a real table in the DOM and that table is authoritative. A reader
// who never sees this canvas loses the animation and loses nothing else.
//
// Isomorphic: no node:* imports and no DOM.

export const GLOBE_INPUT_SCHEMA = 1;

/**
 * Arc emphasis. DESIGN 6.2: the entire colour budget of the scene exists so one line can pop.
 * Exactly zero or one arc may be 'worst', and exactly zero or one may be 'selected'.
 * @typedef {'idle'|'selected'|'worst'} ArcState
 */

/**
 * @typedef {Object} GlobeArc
 * @property {string} endpointId Ties the arc to its table row, so hovering either highlights both.
 * @property {{lat:number, lon:number}} from The observer point. DESIGN trap 7: this is the
 *   REPORTED Cloudflare facility or a city the visitor chose. It is never a geolocated visitor.
 * @property {{lat:number, lon:number}} to The region city centre. INFERRED, always.
 * @property {ArcState} state
 * @property {number} progress 0 to 1. The draw in animation for this arc. 1 means settled.
 * @property {string} label Text alternative for this arc, used in the canvas aria summary.
 */

/**
 * @typedef {Object} GlobeInput
 * @property {1} schema
 * @property {{lat:number, lon:number, label:string}|null} observer The single observation
 *   point, or null before one exists. DESIGN 5 second 0 paints the globe BEFORE anything has
 *   touched the network, and at that moment this page has asked nobody anything, so there is
 *   no point to plot. null is that state spelled out: the planet is drawn and nothing else is.
 *   An arc cannot exist without it, and the validator enforces exactly that.
 * @property {GlobeArc[]} arcs
 * @property {'dark'|'light'} theme Palette selection. Tokens come from ../tokens.js.
 * @property {boolean} reducedMotion When true the renderer cuts straight to the final state:
 *   no flow animation, no rotation, no camera tween. DESIGN 6.6.
 * @property {boolean} idle When true the render loop must STOP rather than draw a still frame
 *   repeatedly. DESIGN 6.5: a still globe at 0 frames per second is visually identical and
 *   costs nothing, and this is what keeps a phone from thermally throttling.
 * @property {number} devicePixelRatioCap Hard capped at 2. Fill rate over a full screen globe
 *   with additive blending is what melts a phone GPU.
 * @property {boolean} bloomEnabled Off by default. May only be turned on after a frame time
 *   probe has cleared 60 frames per second over 30 consecutive frames. DESIGN 6.5.
 * @property {string} ariaSummary One sentence describing the scene for a screen reader. The
 *   canvas is decorative, so this is a summary and not a data source.
 */

/** @param {unknown} c @param {string} at */
function coord(c, at) {
  if (c === null || typeof c !== 'object') throw new TypeError(at + ': expected {lat, lon}');
  const { lat, lon } = /** @type {{lat:number, lon:number}} */ (c);
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(at + '.lat: expected a finite number in [-90, 90], got ' + String(lat));
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError(at + '.lon: expected a finite number in [-180, 180], got ' + String(lon));
  }
}

/**
 * Validate a globe input. The renderer calls this on every frame budget boundary in debug
 * builds and once per state change in production.
 * @param {unknown} g
 * @returns {GlobeInput}
 */
export function assertGlobeInput(g) {
  if (g === null || typeof g !== 'object') throw new TypeError('globeInput: expected an object');
  const gi = /** @type {GlobeInput} */ (g);
  if (gi.schema !== GLOBE_INPUT_SCHEMA) {
    throw new TypeError('globeInput.schema: expected ' + GLOBE_INPUT_SCHEMA + ', got ' + String(gi.schema));
  }
  if (gi.observer !== null) {
    coord(gi.observer, 'globeInput.observer');
    if (typeof gi.observer.label !== 'string' || gi.observer.label.length === 0) {
      throw new TypeError('globeInput.observer.label: required');
    }
  }
  if (gi.theme !== 'dark' && gi.theme !== 'light') {
    throw new TypeError('globeInput.theme: expected "dark" or "light"');
  }
  for (const k of ['reducedMotion', 'idle', 'bloomEnabled']) {
    if (typeof (/** @type {any} */ (gi)[k]) !== 'boolean') {
      throw new TypeError('globeInput.' + k + ': expected a boolean');
    }
  }
  if (gi.reducedMotion && gi.arcs.some((a) => a.progress !== 1)) {
    throw new RangeError('globeInput: with reducedMotion set, every arc must already be at '
      + 'progress 1. Reduced motion cuts to the final state rather than animating more slowly.');
  }
  if (typeof gi.devicePixelRatioCap !== 'number' || !(gi.devicePixelRatioCap > 0) || gi.devicePixelRatioCap > 2) {
    throw new RangeError('globeInput.devicePixelRatioCap: must be in (0, 2]. DESIGN 6.5 caps it '
      + 'at 2 because fill rate, not vertex count, is what melts a phone GPU here.');
  }
  if (typeof gi.ariaSummary !== 'string' || gi.ariaSummary.length === 0) {
    throw new TypeError('globeInput.ariaSummary: required. The canvas carries role="img" and '
      + 'must have a text alternative.');
  }
  if (!Array.isArray(gi.arcs)) throw new TypeError('globeInput.arcs: expected an array');
  if (gi.observer === null && gi.arcs.length > 0) {
    throw new TypeError('globeInput: arcs were given with no observer. Every arc starts at the '
      + 'single observation point, so an arc without one would be a line from a place this page '
      + 'has not been told about. Draw the bare planet instead (DESIGN 5, second 0).');
  }

  let worst = 0;
  let selected = 0;
  const seen = new Set();
  gi.arcs.forEach((a, i) => {
    const at = 'globeInput.arcs[' + i + ']';
    if (a === null || typeof a !== 'object') throw new TypeError(at + ': expected an object');
    if (typeof a.endpointId !== 'string' || a.endpointId.length === 0) {
      throw new TypeError(at + '.endpointId: required, and must match a table row');
    }
    if (seen.has(a.endpointId)) throw new TypeError(at + '.endpointId: duplicate ' + a.endpointId);
    seen.add(a.endpointId);
    coord(a.from, at + '.from');
    coord(a.to, at + '.to');
    if (a.state !== 'idle' && a.state !== 'selected' && a.state !== 'worst') {
      throw new TypeError(at + '.state: expected idle, selected or worst');
    }
    if (a.state === 'worst') worst += 1;
    if (a.state === 'selected') selected += 1;
    if (typeof a.progress !== 'number' || !(a.progress >= 0) || !(a.progress <= 1)) {
      throw new RangeError(at + '.progress: expected a number in [0, 1], got ' + String(a.progress));
    }
    if (typeof a.label !== 'string' || a.label.length === 0) {
      throw new TypeError(at + '.label: required for the canvas text alternative');
    }
    // The shape has no waypoints field, and a caller that invents one is claiming a path.
    if ('waypoints' in a || 'path' in a || 'route' in a) {
      throw new TypeError(at + ': an arc is a great circle between two coordinates. It carries '
        + 'no intermediate points, because an intermediate point is a claim about a route and '
        + 'this product makes no such claim (DESIGN 2.5).');
    }
    if (a.from.lat !== gi.observer.lat || a.from.lon !== gi.observer.lon) {
      throw new RangeError(at + '.from: every arc starts at the single observer point. A second '
        + 'origin would imply the page knows more than one thing about where the visitor is.');
    }
  });
  if (worst > 1) throw new RangeError('globeInput: at most one arc may be "worst". The accent '
    + 'colour exists so that exactly one line pops (DESIGN 6.2).');
  if (selected > 1) throw new RangeError('globeInput: at most one arc may be "selected"');
  return gi;
}

/**
 * Render hints that are decisions, not preferences, so the renderer does not have to rederive
 * them and a later contributor cannot quietly change one. DESIGN 6.1 and 6.2.
 */
export const RENDER_RULES = Object.freeze({
  /**
   * NEVER use gl.LINES. gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE) frequently returns a
   * usable maximum of 1 on ANGLE and Direct3D backends, and the WebGL specification permits
   * exactly that. Every thin, crawling amateur globe looks that way for this one reason.
   * Expand each arc and each coastline into a triangle strip ribbon in the vertex shader:
   * upload position, tangent and a side attribute of +1 or -1, then offset by
   * side * halfWidth along the screen space perpendicular of the projected tangent.
   */
  useLineDrawMode: false,
  /**
   * Arcs are drawn at radius 1.001 with depth testing ON, so an arc on the far side of the
   * planet is correctly occluded by the Earth. DESIGN 5 names this as the first thing a
   * graphics literate reader notices.
   */
  arcRadius: 1.001,
  arcDepthTest: true,
  /** Atmosphere is one backface rendered shell with a Fresnel term, at half resolution. */
  atmosphereResolutionScale: 0.5,
  /** Flow is a dash pattern along arc length with additive blending. Never particles. */
  flowStyle: 'dash-along-arc-length',
  /** No photographic Earth texture. A Blue Marble JPEG reads as a template on sight. */
  earthTexture: null,
});
