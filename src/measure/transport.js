// THE TRANSPORT. Every network destination this product can reach, written as a literal.
//
// DESIGN trap 1 and INTERFACES 9. The flagship network rule replaced an unenforceable ban on
// fetch with an enforceable declaration: every host the code reaches must appear in the
// Content-Security-Policy connect-src allowlist in the page head, and the set of hosts used in
// code must EQUAL the set declared. scripts/gate-csp.mjs finds hosts with this pattern:
//
//     /(?:fetch|new\s+WebSocket|new\s+EventSource)\s*\(\s*[`'"]https?:\/\/([^`'"\/]+)/g
//
// It reads LITERALS. A call written as fetch('https://' + host + '/') is a request the gate
// cannot see, and a request the gate cannot see is exactly what the rule exists to stop. So
// every destination is spelled out once in this file, in full, and the rest of the engine
// dispatches through the frozen table below. That is the whole reason this file is shaped the
// way it is, and it is why adding a thirteenth destination is a visible diff in two places.
//
// An image element assigned a remote src, sendBeacon, EventSource, WebSocket, XMLHttpRequest,
// a remote dynamic import and connection opening resource hints are all refused by the same
// gate, because each is a request a fetch oriented check would not see. None of them appears
// here and none of them will.
//
// THE REQUEST, and why each option is what it is:
//
//   method GET            The endpoint answers a bare GET with a 42 byte fixed body. Nothing
//                         is uploaded and no API is called.
//   no custom headers     A custom header would make this a non simple cross origin request
//                         and add a CORS preflight, which is a second round trip the
//                         measurement would silently contain.
//   credentials 'omit'    The trace endpoint sets a __cf_bm cookie. With credentials omitted
//                         the browser neither stores it nor sends one, so this product keeps
//                         its no cookie promise against an endpoint that offers one.
//   cache 'no-store'      A cached response is not a round trip. This is the only way to be
//                         sure without putting a cache busting query string on the URL, which
//                         would make the literal above harder to read against the CSP.
//   redirect 'error'      A followed redirect is two round trips reported as one. A redirect
//                         here becomes a stated failure instead of a quietly doubled number.
//   referrerPolicy        Nothing about the page is sent to the endpoint.
//   mode 'cors'           The response must be readable. An opaque no-cors response would
//                         resolve at a time the spec does not pin to the response arriving.
//
// Isomorphic in the sense that matters: the module loads under Node with no DOM, and every
// function takes its fetch implementation from the argument list so tests never touch a socket.

import { MEASUREMENT_HOSTS } from '../core/data/endpoints.js';

// Both lists are defined once, in core, and re exported here. They used to be written out in
// this file as a deliberate mirror of the gate's copy, with a test holding the two together.
// src/core/data/reachable-hosts.js explains what that arrangement could not express and why
// the definition moved.
export { NON_MEASUREMENT_HOSTS, ALL_REACHABLE_HOSTS } from '../core/data/reachable-hosts.js';

/** The path on the Cloudflare host. Public, keyless, and documented by Cloudflare. */
export const TRACE_PATH = '/cdn-cgi/trace';

/** Default per request time limit, milliseconds. Stated on the page beside the run. */
export const REQUEST_TIMEOUT_MS = 8000;

/**
 * The request options. Frozen, shared, and identical for every sample, because a sample taken
 * with different options is a different measurement.
 * @type {Readonly<RequestInit>}
 */
export const PROBE_INIT = Object.freeze({
  method: 'GET',
  mode: 'cors',
  credentials: 'omit',
  cache: 'no-store',
  redirect: 'error',
  referrerPolicy: 'no-referrer',
});

/**
 * One literal fetch per measurement host. This table IS the declaration the gate reads.
 * @type {Readonly<Record<string, (init: RequestInit) => Promise<Response>>>}
 */
export const PROBES = Object.freeze({
  'dynamodb.af-south-1.amazonaws.com': (init) => fetch('https://dynamodb.af-south-1.amazonaws.com/', init),
  'dynamodb.ap-east-1.amazonaws.com': (init) => fetch('https://dynamodb.ap-east-1.amazonaws.com/', init),
  'dynamodb.ap-northeast-1.amazonaws.com': (init) => fetch('https://dynamodb.ap-northeast-1.amazonaws.com/', init),
  'dynamodb.ap-south-1.amazonaws.com': (init) => fetch('https://dynamodb.ap-south-1.amazonaws.com/', init),
  'dynamodb.ap-southeast-1.amazonaws.com': (init) => fetch('https://dynamodb.ap-southeast-1.amazonaws.com/', init),
  'dynamodb.ap-southeast-2.amazonaws.com': (init) => fetch('https://dynamodb.ap-southeast-2.amazonaws.com/', init),
  'dynamodb.eu-central-1.amazonaws.com': (init) => fetch('https://dynamodb.eu-central-1.amazonaws.com/', init),
  'dynamodb.eu-north-1.amazonaws.com': (init) => fetch('https://dynamodb.eu-north-1.amazonaws.com/', init),
  'dynamodb.eu-west-2.amazonaws.com': (init) => fetch('https://dynamodb.eu-west-2.amazonaws.com/', init),
  'dynamodb.il-central-1.amazonaws.com': (init) => fetch('https://dynamodb.il-central-1.amazonaws.com/', init),
  'dynamodb.sa-east-1.amazonaws.com': (init) => fetch('https://dynamodb.sa-east-1.amazonaws.com/', init),
  'dynamodb.us-east-1.amazonaws.com': (init) => fetch('https://dynamodb.us-east-1.amazonaws.com/', init),
});

/**
 * The one non measurement request. DESIGN 2.2: Cloudflare own edge naming the facility that
 * terminated this connection. Keyless, and it answers with Access-Control-Allow-Origin: *,
 * which is what makes it readable from a page at all. Both properties were verified live and
 * the response headers are recorded in the internal validation folder.
 *
 * @param {RequestInit} init
 * @returns {Promise<Response>}
 */
export function fetchTrace(init) {
  return fetch('https://www.cloudflare.com/cdn-cgi/trace', init);
}

/**
 * The probe for one host, or undefined if that host is not declared.
 *
 * Dispatching through a frozen table rather than building a URL is what keeps the used set and
 * the declared set provably equal. A caller cannot reach an undeclared host through this
 * module even by accident, because there is no code path that builds a URL.
 *
 * @param {string} host
 * @returns {((init: RequestInit) => Promise<Response>)|undefined}
 */
export function probeFor(host) {
  return Object.prototype.hasOwnProperty.call(PROBES, host) ? PROBES[host] : undefined;
}

/**
 * An AbortSignal that fires after ms, and also when an upstream signal fires.
 *
 * Hand rolled rather than AbortSignal.timeout plus AbortSignal.any, because this product has
 * zero dependencies and a zero dependency product should not also carry a hidden dependency on
 * two comparatively recent platform additions. The timer is always cleared by the caller.
 *
 * @param {number} ms
 * @param {AbortSignal} [upstream]
 * @returns {{signal: AbortSignal, cancel: () => void, timedOut: () => boolean}}
 */
export function deadline(ms, upstream) {
  const controller = new AbortController();
  let fired = false;
  const timer = setTimeout(() => { fired = true; controller.abort(); }, ms);
  /** @param {any} _e */
  const onUpstream = () => controller.abort();
  if (upstream) {
    if (upstream.aborted) controller.abort();
    else upstream.addEventListener('abort', onUpstream, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      if (upstream) upstream.removeEventListener('abort', onUpstream);
    },
    timedOut: () => fired,
  };
}
