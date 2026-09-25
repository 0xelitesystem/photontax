// MACHINE OUTPUT. DESIGN-CLI section 0 item 13.
//
// A figure in a --json document is never a bare number. It is an object carrying the badge, the
// value, the unit, the method and the text a person would have been shown, built from
// claimToJSON so the provenance is the claim's own. The value is at DISPLAY precision: the same
// whole milliseconds, the same decimals, that the text output prints, so a program reading the
// JSON and a person reading the terminal are handed the same number. A figure that is not shown
// is an object with no value and a reason, never a zero and never a null on its own.
//
// Isomorphic: no node:* imports.

import { claimToJSON, renderClaimText, UNITS } from '../core/claim.js';
import { JSON_SCHEMA } from './copy.js';

/**
 * @typedef {Object} Figure
 * @property {string} badge
 * @property {number|string} value At display precision.
 * @property {string} unit
 * @property {string} method
 * @property {string} text The rendered claim, badge word included.
 * @property {string|null} sourceId
 * @property {string|null} note
 * @property {number|null} decimals
 */

/**
 * @param {unknown} claim
 * @returns {Figure}
 */
export function figure(claim) {
  const j = claimToJSON(claim);
  let value = j.value;
  if (typeof value === 'number') {
    value = j.unit === UNITS.MS || j.decimals === null
      ? Math.round(value)
      : Number(value.toFixed(j.decimals));
    if (Object.is(value, -0)) value = 0;
  }
  return {
    badge: j.badge,
    value,
    unit: j.unit,
    method: j.method,
    text: renderClaimText(claim),
    sourceId: j.sourceId,
    note: j.note,
    decimals: j.decimals,
  };
}

/**
 * A figure that is not shown, and why.
 * @param {string} reason
 * @returns {{suppressed:true, reason:string}}
 */
export function absent(reason) {
  if (typeof reason !== 'string' || reason.length === 0) {
    throw new TypeError('absent(): a figure that is not shown must say why');
  }
  return { suppressed: true, reason };
}

/**
 * The envelope every document shares.
 * @param {string} command
 * @param {string} version
 * @param {object} body
 */
export function documentFor(command, version, body) {
  return { schema: JSON_SCHEMA, tool: { name: 'photontax', version }, command, ...body };
}
