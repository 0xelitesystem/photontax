// SENTENCES AS PARTS, not as strings.
//
// DESIGN 2 and DESIGN 7.3: no number reaches a reader without its badge. A sentence built by
// string concatenation cannot satisfy that, because the moment a figure is inside a string it
// is a bare number and the only thing left is to hope somebody wraps it correctly later.
//
// So every sentence on this page that contains a figure is built as an ORDERED LIST OF PARTS:
// prose runs and Claims, in reading order. The DOM layer turns a prose part into a text node
// and a Claim part into a badged element. Two consequences:
//
//   the sentence cannot be rendered with a number in it and no badge, because there is no
//   string containing the number to render;
//   the parts are pure data, so the sentences are unit tested with no browser involved.
//
// `plainText()` exists for one narrow purpose: the contract shapes in src/core/contracts
// require a `sentence` string, and a screen reader summary and an aria-label both want one.
// It renders through renderClaim(), so even the plain text form carries the badge word.
//
// Isomorphic: no node:* imports and no DOM.

import { assertClaim, renderClaim } from '../core/claim.js';

/**
 * @typedef {{kind:'text', value:string}} TextPart
 * @typedef {{kind:'claim', claim:import('../core/claim.js').Claim, showMethod?:'none'|'sr'|'visible'}} ClaimPart
 * @typedef {{kind:'prose', value:string, badge:string, method:string}} ProsePart
 * @typedef {TextPart|ClaimPart|ProsePart} Part
 */

/** @param {string} value @returns {TextPart} */
export function t(value) {
  if (typeof value !== 'string') throw new TypeError('t(): expected a string');
  if (/\d/.test(value)) {
    throw new TypeError('t(): this prose run contains a digit: ' + JSON.stringify(value)
      + '. A figure in a prose run is a number with no badge and no method. Build it with '
      + 'measured(), reported(), computed() or inferred() and pass it through c() instead.');
  }
  return { kind: 'text', value };
}

/**
 * @param {import('../core/claim.js').Claim} claim
 * @param {'none'|'sr'|'visible'} [showMethod]
 * @returns {ClaimPart}
 */
export function c(claim, showMethod = 'sr') {
  assertClaim(claim, 'parts.c');
  return { kind: 'claim', claim, showMethod };
}

/**
 * PROVENANCE PROSE. A sentence that STATES a method, a source or a threshold, and which
 * therefore contains figures of its own.
 *
 * Three kinds of sentence on this page are like that and they are the only three:
 *
 *   a METHODS sentence, which names the constants and the sample count of the method it
 *   describes ("the minimum of 7 further request and response wall times");
 *   a source attribution from data/sources.js, which quotes the value taken from that source
 *   ("299792458 m/s exactly");
 *   a fixed published threshold stated as copy rather than as a figure in its own right
 *   ("Under 500 km a fixed access cost sits on top of a near zero floor").
 *
 * Those figures are not claims about the visitor or about the network. They are the statement
 * of where a claim came from, which is the thing the badge exists to carry. So the element
 * that holds this prose carries the badge of the tier it describes, together with the method
 * sentence, and gate-badges is satisfied by the correct classification rather than by an
 * exception with no explanation attached.
 *
 * The restriction that keeps this from becoming an escape hatch: a prose part must carry a non
 * empty method. A standalone figure NEVER comes through here. If you are reaching for this to
 * print a number, you want measured(), reported(), computed() or inferred() instead.
 *
 * @param {string} badge One of the four kinds.
 * @param {string} value The sentence.
 * @param {string} method Where the figures in it come from. Required and non empty.
 * @returns {ProsePart}
 */
export function pp(badge, value, method) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('pp(): expected a sentence');
  if (typeof method !== 'string' || method.trim().length === 0) {
    throw new TypeError('pp(): provenance prose must state where its figures come from. A '
      + 'sentence with a figure and no method is exactly the thing the badge system exists to '
      + 'stop, and giving it a badge without a method would make the badge decorative.');
  }
  if (!['MEASURED', 'REPORTED', 'COMPUTED', 'INFERRED'].includes(badge)) {
    throw new RangeError('pp(): unknown badge kind ' + JSON.stringify(badge));
  }
  return { kind: 'prose', value, badge, method };
}

/**
 * The plain text form of a sentence, badge words included. Used for the `sentence` fields the
 * contracts require, for aria summaries, and for the text the self test reports.
 * @param {readonly Part[]} parts
 * @returns {string}
 */
export function plainText(parts) {
  return parts.map((p) => {
    if (p.kind === 'text' || p.kind === 'prose') return p.value;
    return renderClaim(p.claim).text;
  }).join('');
}

/**
 * Every Claim in a sentence, for the provenance completeness check.
 * @param {readonly Part[]} parts
 * @returns {import('../core/claim.js').Claim[]}
 */
export function claimsIn(parts) {
  return parts.filter((p) => p.kind === 'claim').map((p) => /** @type {ClaimPart} */ (p).claim);
}
