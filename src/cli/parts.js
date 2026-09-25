// SENTENCES AS PARTS, on a terminal. src/ui/parts.js explains the idea: a sentence that holds a
// figure is an ordered list of prose runs and Claims, never a string with a number inside it,
// and a prose run with a digit in it throws. The command line keeps all three of the page's
// part kinds and adds exactly two, each for text that carries digits and is not a figure:
//
//   id(value)   an identifier this product ships: an endpoint id, a region code, a measurement
//               host, the repository address, the JSON schema name, an exit code, the version
//               and the User-Agent built from it. It is checked against that closed set, so it
//               cannot be used to smuggle a number into prose.
//   arg(value)  the user's own argument, echoed back in a usage error. It is the reader's text,
//               not ours, capped in length and quoted, and it only ever reaches stderr.
//
// src/cli/out.js is the only renderer and the only writer, and it refuses anything that is not
// one of these five kinds.
//
// Isomorphic: no node:* imports.

import { t, c, pp, plainText, claimsIn } from '../ui/parts.js';
import { ENDPOINTS, MEASUREMENT_HOSTS } from '../core/data/endpoints.js';
import { NAME, REPO_URL, JSON_SCHEMA, EXIT } from './copy.js';

export { t, c, pp, plainText, claimsIn };

/** A released version string: three dot separated integers, optionally a pre-release tag. */
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

/** The closed set of identifiers that may carry a digit into command line output. */
const IDENTIFIERS = new Set([
  ...ENDPOINTS.map((e) => e.id),
  ...ENDPOINTS.map((e) => e.region),
  ...MEASUREMENT_HOSTS,
  REPO_URL,
  JSON_SCHEMA,
  ...Object.values(EXIT).map(String),
]);

/**
 * True for a value id() accepts.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isIdentifier(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (IDENTIFIERS.has(value) || VERSION_RE.test(value)) return true;
  const ua = NAME + '/';
  const tail = ' (+' + REPO_URL + ')';
  return value.startsWith(ua) && value.endsWith(tail)
    && VERSION_RE.test(value.slice(ua.length, value.length - tail.length));
}

/**
 * @typedef {{kind:'id', value:string}} IdPart
 * @typedef {{kind:'arg', value:string}} ArgPart
 * @typedef {import('../ui/parts.js').Part|IdPart|ArgPart} CliPart
 */

/**
 * An identifier this product ships. Printed verbatim and never split across lines.
 * @param {string} value
 * @returns {IdPart}
 */
export function id(value) {
  if (!isIdentifier(value)) {
    throw new TypeError('id(): ' + JSON.stringify(value) + ' is not an identifier this product '
      + 'ships. A figure is a Claim; an identifier comes from the bundled tables.');
  }
  return { kind: 'id', value };
}

/** The most of a user's own argument echoed back. */
export const ARG_ECHO_MAX = 60;

/**
 * The user's own argument, echoed in a usage error. Capped and quoted; out.js sanitises it.
 * @param {string} value
 * @returns {ArgPart}
 */
export function arg(value) {
  const s = String(value);
  const capped = s.length > ARG_ECHO_MAX ? s.slice(0, ARG_ECHO_MAX) + '...' : s;
  return { kind: 'arg', value: capped };
}
