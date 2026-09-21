// WIRING THE OTHER TEAMS MODULES INTO THE UI PORTS.
//
// The UI does not import the measurement engine or the renderer, because it has to keep working
// when either is not there yet and because a static import of a module that does not exist is a
// page that does not load at all. It publishes ports (ports.js); this file is the adapter that
// fills them from a module object the build hands over.
//
// Keeping the adapter here rather than in scripts/build.mjs matters: an adapter inside a build
// script is code nothing tests. This one is a pure function over a module shaped object, so a
// test can hand it a fake engine and assert what reaches the port.
//
// ONE THING THIS ADAPTER DOES THAT IS NOT PLUMBING. The engine has no per endpoint progress
// callback, and DESIGN 5 needs one: the arcs draw one at a time as each region first answers,
// and without that the globe sits still and then everything appears at once. The engine does
// accept an injected `measureEndpoint`, so the adapter passes a wrapper that calls the engine
// own implementation and then reports. The measurement is entirely the engine's; the adapter
// only watches it land.
//
// Isomorphic: no node:* imports and no DOM.

import { registerMeasurementEngine, registerRenderer } from './ports.js';

/**
 * @param {Object} engine The measurement module namespace.
 * @param {(opts:object) => Promise<object>} engine.measure
 * @param {(e:object, d:object) => Promise<object>} engine.measureEndpoint
 */
export function wireMeasurement(engine) {
  if (!engine || typeof engine.measure !== 'function') {
    throw new TypeError('wireMeasurement: expected a module exporting measure()');
  }

  registerMeasurementEngine(async (opts = {}) => {
    const deps = { signal: opts.signal };

    if (typeof engine.measureEndpoint === 'function' && typeof opts.onEndpointDone === 'function') {
      deps.measureEndpoint = async (endpoint, endpointDeps) => {
        const m = await engine.measureEndpoint(endpoint, endpointDeps);
        try { opts.onEndpointDone(m); } catch { /* a drawing fault must not fail a measurement */ }
        return m;
      };
    }

    return engine.measure({
      pickedCity: opts.pickedCity || null,
      deps,
    });
  });
}

/**
 * @param {Object} renderer The render module namespace, exporting mount() and update().
 */
export function wireRenderer(renderer) {
  if (!renderer || typeof renderer.mount !== 'function' || typeof renderer.update !== 'function') {
    throw new TypeError('wireRenderer: expected a module exporting mount() and update()');
  }
  registerRenderer({
    mount: (node) => renderer.mount(node),
    update: (globeInput) => renderer.update(globeInput),
    destroy: typeof renderer.destroy === 'function' ? () => renderer.destroy() : undefined,
    // Optional. The renderer reports an endpoint id and nothing else, so it can tell the page
    // nothing the page did not already hand it.
    onSelect: typeof renderer.onSelect === 'function' ? (fn) => renderer.onSelect(fn) : undefined,
  });
}
