// THE INTEGRATION SEAM. Where the UI meets the measurement engine and the renderer.
//
// Three teams build this product at the same time against the four shapes in
// src/core/contracts. The UI owns the page, so the page is what has to still work when one of
// the other two is not there yet, and it has to degrade into a STATED condition rather than
// into a spinner, a zero or a blank (DESIGN trap 13, contract section 3).
//
// So the UI does not import the engine or the renderer. It publishes two ports. Whichever
// module ships registers itself; whichever has not, the page names in words:
//
//   no engine registered      the button is disabled and says why. Everything that is pure
//                             arithmetic still works: the pre click fact, the floor, the self
//                             test, the sources. DESIGN 6.4 promises exactly that for the
//                             offline case and this is the same promise one layer up.
//   no renderer registered    the canvas is replaced by its own text alternative. DESIGN 6.6
//                             already makes the canvas decorative and the table authoritative,
//                             so a reader loses the animation and loses nothing else. DESIGN
//                             6.5 requires the same behaviour when WebGL is simply absent.
//
// THE MEASUREMENT PORT IS ALSO A SAFETY BOUNDARY. Nothing in the UI layer opens a connection.
// Every network call in this product happens inside the registered engine, against hosts that
// appear as literals in its source, which is what lets scripts/gate-csp.mjs check the set of
// hosts used in code against the set declared in the page head and fail on drift in either
// direction. A UI that fetched anything of its own would be a host the equality check could
// not see (DESIGN trap 1).
//
// Browser and test safe: no node:* imports, no DOM, no network.

/** @type {((opts:object) => Promise<EngineResult>)|null} */
let measurementEngine = null;

/** @type {{mount:Function, update:Function, destroy?:Function}|null} */
let renderer = null;

/**
 * @typedef {Object} EngineResult What a run of the measurement engine hands back.
 * @property {'done'|'nothing-measured'|'needs-city-pick'} state
 * @property {import('../core/contracts/measurement.js').MeasurementRun|null} measurement
 * @property {import('../core/contracts/decomposition.js').DecompositionRun|null} decomposition
 * @property {{endpointId:string, kind:string, reason:string, spreadMs:number|null,
 *             failureReason:string|null}[]} excluded Rows kept out of the result, each with the
 *   sentence saying why. Counted and shown, never dropped quietly (trap 3, trap 13).
 * @property {{id:string, badge:string, text:string, suppressesResults:boolean}[]} notices
 *   Fixed sentences about this run. Each carries the badge of the kind of fact it is, so the
 *   page can render it with a provenance badge rather than as unattributed chrome.
 * @property {{label:string, passed:boolean, detail:string}[]} selfTest The engine own checks.
 * @property {string|null} reportedColo The facility the edge named for this connection.
 *
 * `state: 'needs-city-pick'` is the interesting one, and it is not an error. V1 ships no
 * catalogue of facility coordinates, because none was available that a page may both read and
 * redistribute, so knowing WHICH facility served the connection does not by itself give a point
 * to measure from. Rather than approximate one, the page asks the reader which city they are
 * in. DESIGN trap 7 requires exactly that refusal: the page never geolocates anybody.
 *
 * Register the measurement engine. `onEndpointDone` is called once per endpoint as its minimum
 * settles, which is what drives the arcs drawing one at a time (DESIGN 5, second 3).
 *
 * @param {(opts:{pickedCity?:object|null, signal?:AbortSignal, onEndpointDone?:Function}) => Promise<EngineResult>} fn
 */
export function registerMeasurementEngine(fn) {
  if (typeof fn !== 'function') throw new TypeError('registerMeasurementEngine: expected a function');
  measurementEngine = fn;
}

/** @returns {boolean} */
export function hasMeasurementEngine() { return measurementEngine !== null; }

/** @returns {((opts:any) => Promise<any>)|null} */
export function getMeasurementEngine() { return measurementEngine; }

/**
 * Register the globe renderer. It receives a GlobeInput as defined by
 * src/core/contracts/globe.js and nothing else, so it cannot learn anything about the visitor
 * that the contract does not carry.
 * @param {{mount:Function, update:Function, destroy?:Function}} r
 */
export function registerRenderer(r) {
  if (!r || typeof r.mount !== 'function' || typeof r.update !== 'function') {
    throw new TypeError('registerRenderer: expected an object with mount() and update()');
  }
  renderer = r;
}

/** @returns {boolean} */
export function hasRenderer() { return renderer !== null; }

/** @returns {{mount:Function, update:Function, destroy?:Function}|null} */
export function getRenderer() { return renderer; }

/** Reset every port. Tests only; the page registers once and never unregisters. */
export function resetPorts() {
  measurementEngine = null;
  renderer = null;
}

/**
 * What the page says when a port is empty. Stated, never a spinner and never a zero.
 * Neither sentence contains a figure, so neither needs a badge: they are statements about this
 * build, not claims about the world.
 */
export const PORT_MESSAGES = Object.freeze({
  noEngine:
    'The measurement engine is not present in this build, so the button is disabled. Everything '
    + 'on this page that is arithmetic still works and still recomputes in front of you: the '
    + 'distance, the floor, the constant and every self test above.',
  noRenderer:
    'The globe is not present in this build. It is decorative in every build: the table below '
    + 'is the result, and a reader who never sees the globe loses the animation and loses '
    + 'nothing else.',
  globeDidNotArrive:
    'The globe is a separate file that this page asks for only after it has painted, and that '
    + 'file did not arrive. The drawing above is a placeholder and not a measurement. Nothing '
    + 'else on this page depends on it: the table below is the result, and every figure on the '
    + 'page was produced without it.',
  noWebgl:
    'Your browser did not give this page a WebGL context, so the globe is not drawn. The globe '
    + 'is decorative: the table below is the result, and it is unaffected.',
  nothingMeasured:
    'Not one endpoint answered with a figure this page is willing to publish. Nothing is shown '
    + 'in place of them, because a zero here would be a number this page did not measure. The '
    + 'reasons are listed above, one per endpoint.',
  needsCityPick:
    'The serving facility named itself, but this product ships no catalogue of facility '
    + 'coordinates, because none was available on the snapshot date that a page may both read '
    + 'and redistribute. Rather than approximate a point and call it yours, it asks: which city '
    + 'are you nearest? Your answer never leaves this page.',
  noNetwork:
    'The measurement could not reach the network. Nothing is shown for it, because a zero here '
    + 'would be a number this page did not measure. Everything above that is arithmetic is '
    + 'unaffected and still correct.',
});
