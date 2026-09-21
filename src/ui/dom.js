// DOM construction. The single place in the page where a number becomes an element.
//
// DESIGN 2 (the claim boundary), DESIGN 6.6 (accessibility), DESIGN 7.3 (provenance
// completeness), trap 19.
//
// Two rules, and they are the whole file:
//
//   1. NO innerHTML, NO insertAdjacentHTML, NO outerHTML. Everything is createElement plus
//      textContent. scripts/gate-badges.mjs refuses those three constructs outright, because
//      the one construct that could put an unbadged number past the HTML scan is also the one
//      that could put markup past it.
//   2. A number reaches the DOM through claimNode() and through nothing else. claimNode()
//      takes a Claim, calls renderClaim() from src/core/claim.js, and writes the value text
//      only after stamping data-claim-badge on the element that contains it. Rendering through
//      the claim system and passing the build gate are therefore the same act.
//
// Colour is never the carrier of the badge. Each badge is its uppercase word plus a distinct
// SVG SHAPE: circle for MEASURED, diamond for REPORTED, triangle for COMPUTED, a hollow square
// for INFERRED. A reader who sees no colour at all still reads four distinguishable badges,
// which is the one failure mode this product cannot survive (DESIGN 6.6, trap 19).
//
// Browser only. Imported by the page, never by a test that has no DOM.

import { renderClaim, BADGE_SPEC } from '../core/claim.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element. `attrs` are set as attributes, `children` may be nodes or strings.
 * A string child becomes a text node, so there is no path here that parses markup.
 *
 * @param {string} tag
 * @param {Record<string,string|number|boolean|null|undefined>} [attrs]
 * @param {(Node|string|null|undefined)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (v === true) { node.setAttribute(k, ''); continue; }
      node.setAttribute(k, String(v));
    }
  }
  if (children) append(node, children);
  return node;
}

/**
 * Append children, skipping nulls so a caller can inline a conditional without a filter.
 * @param {Node} parent
 * @param {(Node|string|null|undefined)[]} children
 * @returns {Node}
 */
export function append(parent, children) {
  for (const c of children) {
    if (c === null || c === undefined) continue;
    parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return parent;
}

/**
 * A text node. Prose only. If the string you are about to pass contains a digit, you are
 * holding a claim and you want claimNode().
 * @param {string} s
 * @returns {Text}
 */
export function text(s) { return document.createTextNode(s); }

/** Remove every child of a node. @param {Node} node @returns {Node} */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* --------------------------------------------------------------------------------------------
 * Badge shapes. DESIGN 6.6 and trap 19: text PLUS a distinct shape, never colour alone.
 * ------------------------------------------------------------------------------------------ */

/** @param {string} tag @param {Record<string,string|number>} attrs @returns {SVGElement} */
function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * The four shapes, drawn in a 24 by 24 box so they optically match at the same font size.
 * Returns an SVG element, decorative, with the badge word beside it carrying the meaning.
 * @param {string} shape
 * @returns {SVGElement}
 */
export function badgeShapeSvg(shape) {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
  if (shape === 'circle') {
    svg.appendChild(svgEl('circle', { cx: 12, cy: 12, r: 9, class: 'pt-badge-shape' }));
  } else if (shape === 'diamond') {
    svg.appendChild(svgEl('path', { d: 'M12 2 L22 12 L12 22 L2 12 Z', class: 'pt-badge-shape' }));
  } else if (shape === 'triangle') {
    svg.appendChild(svgEl('path', { d: 'M12 2 L22 21 L2 21 Z', class: 'pt-badge-shape' }));
  } else if (shape === 'square-outline') {
    svg.appendChild(svgEl('rect', { x: 3, y: 3, width: 18, height: 18, class: 'pt-badge-shape-hollow' }));
  } else {
    throw new RangeError('badgeShapeSvg: unknown shape ' + JSON.stringify(shape)
      + '. The four shapes come from BADGE_SPEC in src/core/claim.js and there is no fifth.');
  }
  return svg;
}

/**
 * The visible badge: shape, then the word. The word is the carrier and the shape is the second
 * independent channel. Colour is the third and it carries nothing on its own.
 * @param {string} badge One of the four kinds.
 * @returns {HTMLElement}
 */
export function badgeNode(badge) {
  const spec = BADGE_SPEC[badge];
  if (!spec) throw new RangeError('badgeNode: unknown badge kind ' + String(badge));
  const node = el('span', { class: 'pt-badge', 'data-claim-badge': badge });
  node.appendChild(badgeShapeSvg(spec.shape));
  node.appendChild(text(spec.label));
  return node;
}

/* --------------------------------------------------------------------------------------------
 * The only number writer in the page.
 * ------------------------------------------------------------------------------------------ */

/**
 * Render a Claim as an element carrying its badge.
 *
 * Structure, and every part of it is load bearing:
 *
 *   <span class="pt-claim" data-claim-badge=... data-claim-method=... data-claim-unit=...>
 *     <span class="pt-num">127 ms</span>            visible value, read by a screen reader
 *     <span class="pt-badge" ...>[shape] COMPUTED</span>   visible badge, read after the value
 *     <span class="pt-visually-hidden">...method...</span> only when showMethod is 'sr'
 *   </span>
 *
 * The outer element carries data-claim-badge, which is what the build gate looks for, and the
 * value text node is inside it. There is no arrangement of this function that emits the number
 * without the attribute, because the attribute is written before the text.
 *
 * @param {import('../core/claim.js').Claim} claim
 * @param {{showMethod?:'none'|'sr'|'visible', class?:string}} [opts]
 *   'sr' puts the method in a visually hidden span, for a cell whose column header already
 *   prints the method visibly. 'visible' prints it beside the number, which is what DESIGN 2.1
 *   requires wherever a number stands on its own.
 * @returns {HTMLElement}
 */
export function claimNode(claim, opts = {}) {
  const r = renderClaim(claim);
  const node = el('span', {
    class: 'pt-claim' + (opts.class ? ' ' + opts.class : ''),
    'data-claim-badge': r.dataAttrs['data-claim-badge'],
    'data-claim-method': r.dataAttrs['data-claim-method'],
    'data-claim-unit': r.dataAttrs['data-claim-unit'],
  });
  const value = el('span', { class: 'pt-num' });
  // The single assignment in this repo that puts a figure on screen. renderClaim() is on the
  // right hand side, which is both the honesty mechanism and what satisfies gate-badges.
  value.textContent = renderClaim(claim).valueText;
  node.appendChild(value);
  node.appendChild(badgeNode(r.badge));

  if (opts.showMethod === 'sr') {
    node.appendChild(el('span', { class: 'pt-visually-hidden' }, [r.a11yLabel]));
  } else if (opts.showMethod === 'visible') {
    node.appendChild(el('span', { class: 'pt-visually-hidden' }, [r.a11yLabel]));
  }
  return node;
}

/**
 * Update the value inside a node built by claimNode, for the count up animation. The badge and
 * the method do not change; only the figure does.
 * @param {HTMLElement} node
 * @param {import('../core/claim.js').Claim} claim
 */
export function updateClaimNode(node, claim) {
  const value = node.querySelector('.pt-num');
  if (!value) throw new TypeError('updateClaimNode: not a node built by claimNode()');
  value.textContent = renderClaim(claim).valueText;
}

/**
 * The method sentence as a block, for a column header or a step in the maths panel. Carries no
 * digits of its own; the sentences in METHODS are prose.
 * @param {import('../core/claim.js').Claim} claim
 * @param {string} [cls]
 * @returns {HTMLElement}
 */
export function methodNode(claim, cls = 'pt-fine') {
  return el('p', { class: cls }, [renderClaim(claim).method]);
}
