// EVERY host this page can ever contact, for the page to print and for the build to declare.
//
// DESIGN trap 1 and trap 14, INTERFACES section 7 and section 9.
//
// A single file browser tool in this account makes no network call at all. photontax is a
// flagship: its whole premise requires the network, so the blanket ban is replaced by something
// stricter because it is checkable. Every host the code can reach must appear in a
// Content-Security-Policy connect-src allowlist in the page head, and the set of hosts used in
// code must EQUAL the set declared. A host in either set and missing from the other fails the
// gate, so a hidden call and a stale declaration are both build failures.
//
// The consequence for this module: it is the runtime half of that declaration, the list the
// PAGE shows the reader before they press anything. scripts/gate-csp.mjs owns the build half.
// test/ui.test.js asserts the two are the same set, so the sentence a visitor reads and the
// policy the browser enforces cannot drift apart.
//
// STANDING RULE, restated because it is the one shortcut that would quietly destroy this
// product: never make a request the gate cannot see. Constructing an image element and handing
// it a URL is a network call that a check looking for fetch does not catch, and DESIGN trap 1
// names that technique explicitly as forbidden, so that nobody discovers it later and thinks
// it is clever. This comment does not spell the construct out, because gate-csp scans the
// source as text and would correctly flag the spelling of it even inside prose.
//
// Isomorphic: no node:* imports and no DOM.

import { MEASUREMENT_HOSTS } from '../core/data/endpoints.js';

// Defined once in core and re exported, so the list the page PRINTS to the reader and the
// list the code can reach are the same array rather than two arrays a test keeps in step.
export { NON_MEASUREMENT_HOSTS } from '../core/data/reachable-hosts.js';
export { ALL_REACHABLE_HOSTS as ALL_HOSTS } from '../core/data/reachable-hosts.js';

/** What each host is contacted for, so the list on screen is a statement and not just names. */
export const HOST_PURPOSE = Object.freeze({
  'www.cloudflare.com':
    'Read once, on the button press, to learn which Cloudflare facility terminated this '
    + 'connection. That facility is the observer point every distance is measured from. No '
    + 'lookup of the visitor happens and nothing is stored.',
  measurement:
    'Timed. A tiny request is made and the response discarded; only the wall time is kept. '
    + 'Nothing is uploaded and no credential of any kind is sent.',
});

/**
 * @param {string} host
 * @returns {string}
 */
export function purposeFor(host) {
  return HOST_PURPOSE[host] || HOST_PURPOSE.measurement;
}
