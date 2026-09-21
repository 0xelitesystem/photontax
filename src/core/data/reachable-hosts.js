// EVERY HOST THIS PRODUCT MAY EVER REACH. One definition, imported everywhere.
//
// DESIGN trap 1, INTERFACES section 7 and section 9.
//
// A single file browser tool in this account makes no network call at all. photontax is a
// flagship: its whole premise requires the network, so the blanket ban is replaced by a rule
// that is stricter because it is checkable. Every host the code can reach must appear in a
// Content-Security-Policy connect-src allowlist in the page head, and the set of hosts used in
// code must EQUAL the set declared. A host in either set and missing from the other fails the
// gate, so a hidden call and a stale declaration are both build failures.
//
// WHY THIS FILE EXISTS. The same two constants were written out in three places:
// src/measure/transport.js (the code that opens the connection), src/ui/hosts.js (the list the
// page prints to the reader before they press anything) and scripts/gate-csp.mjs (the gate).
// Each carried a comment explaining that it was a deliberate mirror and a test asserting the
// mirrors were identical.
//
// Mirrors that a test holds together are a workable answer to drift. They are not an answer to
// the problem that actually bit: src/core/contracts/measurement.js validated `hostsContacted`
// against MEASUREMENT_HOSTS alone, so the field whose stated purpose is "the browser self test
// can assert at runtime what the build gate asserts" could never be shown the one host the run
// contacts that is not a measurement endpoint. The validator refused the truth. Nothing was
// mirroring anything wrong; there was simply no single name for "every host", and the contract
// could not import one without reaching into src/measure or src/ui.
//
// So the definition sits here, in core, where the contract can import it, and the three former
// mirrors re export it. There is now exactly one place to add a host, and adding one is a
// design decision that shows up in a diff next to this paragraph.
//
// Isomorphic: no node:* imports and no DOM. It contains hostnames and opens nothing.

import { MEASUREMENT_HOSTS } from './endpoints.js';

/**
 * Hosts contacted for something other than a measurement.
 *
 * DESIGN 2.2 and trap 7: the observer point is the Cloudflare facility that terminated the
 * connection, which Cloudflare REPORTS about its own network. The page never geolocates the
 * visitor and never plots them.
 *
 * There is exactly one entry. Adding a second is a design decision, not a detail.
 * @type {readonly string[]}
 */
export const NON_MEASUREMENT_HOSTS = Object.freeze(['www.cloudflare.com']);

/**
 * The complete set, sorted and deduplicated. This is what the CSP declares, what the page
 * prints, what the gate enforces and what the measurement contract accepts.
 * @type {readonly string[]}
 */
export const ALL_REACHABLE_HOSTS = Object.freeze(
  [...new Set([...MEASUREMENT_HOSTS, ...NON_MEASUREMENT_HOSTS])].sort(),
);
