// The no WebGL2 fallback. GLOBE team. DESIGN 6.5 ("Never a black box").
//
// If the context is missing, blocked, or lost, the reader gets an equirectangular SVG of the
// SAME bundled coastline in the SAME palette, with the same arcs and the same endpoints, and
// the same keyboard path over them. It is not an apology and it is not a placeholder. A reader
// on a locked down corporate machine is close to the centre of this product's audience, and
// DESIGN 6.4 makes a point of the tool working on exactly that machine.
//
// THE SPEC TREE. Everything below builds a plain data description of the SVG, and a separate
// twelve line function turns that into DOM with createElementNS. Two reasons, both practical:
// the description is testable in Node with no DOM at all, and building elements one at a time
// means this module never assembles a string of markup, which is the construct the badge gate
// refuses for the whole repo.
//
// Isomorphic for the spec half. mountSpec needs a Document and says so.

import { sampleGreatCircle } from './geometry.js';
import { coastline, COASTLINE_ATTRIBUTION } from './coastline.js';
import { vec3ToCoord } from './camera.js';
import { globePalette, ALPHA, WIDTH_PX } from './palette.js';
import { assertGlobeInput } from '../core/contracts/globe.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @typedef {Object} ElementSpec
 * @property {string} tag
 * @property {Record<string, string>} attrs
 * @property {ElementSpec[]} [children]
 * @property {string} [text]
 */

/** @param {[number,number,number]} rgb @returns {string} */
export function rgbToHex(rgb) {
  const h = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return '#' + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
}

/**
 * Longitude and latitude to the SVG viewBox, plate carree.
 * @param {number} lon @param {number} lat @param {number} w @param {number} h
 */
function project(lon, lat, w, h) {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
}

/**
 * Split a sequence of coordinates wherever it crosses the antimeridian.
 *
 * Without this, a feature that runs from 179 east to 179 west draws a stroke straight back
 * across the entire map, which is the single most recognisable bug in a flat world map. The
 * threshold is half the width of the world: a real step of more than 180 degrees of longitude
 * between adjacent samples cannot be a real step, it is a wrap.
 *
 * @param {{lat:number, lon:number}[]} coords
 * @returns {{lat:number, lon:number}[][]}
 */
export function splitAtAntimeridian(coords) {
  /** @type {{lat:number, lon:number}[][]} */
  const out = [];
  /** @type {{lat:number, lon:number}[]} */
  let run = [];
  for (let i = 0; i < coords.length; i++) {
    if (i > 0 && Math.abs(coords[i].lon - coords[i - 1].lon) > 180) {
      if (run.length >= 2) out.push(run);
      run = [];
    }
    run.push(coords[i]);
  }
  if (run.length >= 2) out.push(run);
  return out;
}

/** @param {{lat:number, lon:number}[]} coords */
function pathData(coords, w, h) {
  let d = '';
  coords.forEach((c, i) => {
    const p = project(c.lon, c.lat, w, h);
    d += (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ' ' + p[1].toFixed(2);
  });
  return d;
}

/**
 * Build the fallback map as a spec tree.
 *
 * @param {import('../core/contracts/globe.js').GlobeInput} input
 * @param {{width?:number, height?:number}} [opts]
 * @returns {ElementSpec}
 */
export function fallbackSpec(input, opts = {}) {
  const gi = assertGlobeInput(input);
  const w = opts.width || 1000;
  const h = opts.height || 500;
  const pal = globePalette(gi.theme);

  /** @type {ElementSpec[]} */
  const children = [];

  // The ground. The same surface token as the ocean on the globe, so the two renderings are
  // the same picture in two projections rather than two different looks.
  children.push({
    tag: 'rect',
    attrs: { x: '0', y: '0', width: String(w), height: String(h), fill: rgbToHex(pal.ocean) },
  });

  const coasts = coastline();
  /** @type {string[]} */
  const coastPaths = [];
  for (let l = 0; l < coasts.lineStart.length; l++) {
    const start = coasts.lineStart[l];
    const n = coasts.lineCount[l];
    /** @type {{lat:number, lon:number}[]} */
    const line = [];
    for (let k = 0; k < n; k++) line.push({ lat: coasts.lat[start + k], lon: coasts.lon[start + k] });
    for (const piece of splitAtAntimeridian(line)) coastPaths.push(pathData(piece, w, h));
  }
  children.push({
    tag: 'path',
    attrs: {
      d: coastPaths.join(' '),
      fill: 'none',
      stroke: rgbToHex(pal.coastline),
      'stroke-width': String(WIDTH_PX.coastline),
      'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke',
    },
  });

  // Arcs. The same great circle samples the globe draws, projected flat. On a flat map a great
  // circle is a curve, which is exactly the point: the shortest line on a sphere is not the
  // straight line on a rectangle, and a reader who only ever sees the flat map still sees it.
  const order = { idle: 1, selected: 2, worst: 3 };
  const arcs = gi.arcs.slice().sort((a, b) => order[a.state] - order[b.state]);
  for (const arc of arcs) {
    const samples = sampleGreatCircle(arc.from, arc.to).map((v) => vec3ToCoord(v));
    const style = arc.state === 'worst'
      ? { c: pal.arcWorst, a: ALPHA.arcWorst, wpx: WIDTH_PX.arcWorst }
      : arc.state === 'selected'
        ? { c: pal.arcSelected, a: ALPHA.arcSelected, wpx: WIDTH_PX.arcSelected }
        : { c: pal.arcIdle, a: ALPHA.arcIdle, wpx: WIDTH_PX.arcIdle };
    const pieces = splitAtAntimeridian(samples).map((p) => pathData(p, w, h));
    children.push({
      tag: 'path',
      attrs: {
        d: pieces.join(' '),
        fill: 'none',
        stroke: rgbToHex(style.c),
        'stroke-opacity': String(style.a),
        'stroke-width': String(style.wpx),
        'stroke-linecap': 'round',
        'vector-effect': 'non-scaling-stroke',
        'data-endpoint-id': arc.endpointId,
        'data-arc-state': arc.state,
      },
      children: [{ tag: 'title', attrs: {}, text: arc.label }],
    });
  }

  if (gi.observer !== null) {
    const obs = project(gi.observer.lon, gi.observer.lat, w, h);
    children.push({
      tag: 'circle',
      attrs: {
        cx: obs[0].toFixed(2), cy: obs[1].toFixed(2), r: String(WIDTH_PX.marker),
        fill: rgbToHex(pal.observer), 'data-endpoint-id': 'observer',
      },
      children: [{ tag: 'title', attrs: {}, text: gi.observer.label }],
    });
  }

  for (const arc of arcs) {
    const p = project(arc.to.lon, arc.to.lat, w, h);
    const worst = arc.state === 'worst';
    children.push({
      tag: 'circle',
      attrs: {
        cx: p[0].toFixed(2), cy: p[1].toFixed(2),
        r: String(worst ? WIDTH_PX.markerWorst : WIDTH_PX.marker),
        fill: rgbToHex(worst ? pal.markerWorst : pal.marker),
        'data-endpoint-id': arc.endpointId,
      },
      children: [{ tag: 'title', attrs: {}, text: arc.label }],
    });
  }

  return {
    tag: 'svg',
    attrs: {
      xmlns: SVG_NS,
      viewBox: '0 0 ' + w + ' ' + h,
      width: '100%',
      role: 'img',
      'aria-label': gi.ariaSummary,
      'data-globe-fallback': 'svg',
      'data-attribution': COASTLINE_ATTRIBUTION,
    },
    children,
  };
}

/**
 * Turn a spec tree into SVG DOM.
 *
 * createElementNS and textContent only. No string of markup is assembled anywhere in this
 * module, which is why it passes the badge gate's refusal of innerHTML without needing an
 * exception.
 *
 * @param {Document} doc
 * @param {ElementSpec} spec
 * @returns {Element}
 */
export function mountSpec(doc, spec) {
  const el = doc.createElementNS(SVG_NS, spec.tag);
  for (const [k, v] of Object.entries(spec.attrs)) el.setAttribute(k, v);
  if (typeof spec.text === 'string') el.textContent = spec.text;
  for (const child of spec.children || []) el.appendChild(mountSpec(doc, child));
  return el;
}
