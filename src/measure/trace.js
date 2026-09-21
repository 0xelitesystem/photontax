// THE REPORTED CONNECTION. DESIGN 2.2, DESIGN 3, traps 7 and 13.
//
// One request to a public, keyless diagnostic endpoint that answers with plain text lines of
// key=value. It is the only non measurement request this product makes, and everything it
// gives back is a third party stating a fact about its own network and about the connection it
// just terminated. That is what REPORTED means here, and it is the reason this page never
// needs to look the visitor up.
//
// VERIFIED LIVE, and the raw headers are recorded in the internal validation folder:
//   HTTP 200, Content-Type text/plain, 216 bytes
//   Access-Control-Allow-Origin: *      so a page can read the body at all
//   no Authorization, no token, no key  so there is nothing to sign up for
//   set-cookie: __cf_bm ...             see below, this is why credentials are omitted
//
// THE COOKIE. This endpoint offers a __cf_bm bot management cookie. The product promises no
// cookie. Both are true at once because the request is made with credentials omitted, so the
// browser neither stores the cookie it is offered nor sends one back. The promise is kept by
// the request options in transport.js, not by hoping the far end changes.
//
// WHAT THIS IS NOT. It is not geolocation. The facility code names a Cloudflare building, and
// the country code is the country Cloudflare associates with the connection. Neither is a
// position for the person reading the page, and this module never turns one into a coordinate.
// IP geolocation returns a national fallback centroid for a large share of addresses, which is
// the coordinate behind a well known lawsuit against a farm in Kansas, and there is no observer
// source in the measurement contract that would accept such a value (trap 7).
//
// Isomorphic: no node:* imports and no DOM. The fetch is injected, so no test opens a socket.

import { REQUEST_TIMEOUT_MS, PROBE_INIT, deadline, fetchTrace } from './transport.js';
import { RUN_NOTICES } from './reasons.js';

/** The trace fields this product reads. Everything else in the response is ignored. */
export const TRACE_FIELDS = Object.freeze(['colo', 'loc', 'warp', 'gateway', 'rbi', 'ip']);

/**
 * @typedef {Object} ReportedConnection
 * @property {true} ok
 * @property {string} colo The three letter facility code the edge reported for this connection.
 * @property {string|null} loc Two letter country code the edge associates with the connection.
 * @property {'on'|'off'|'unknown'} warp Cloudflare own tunnel client.
 * @property {'on'|'off'|'unknown'} gateway Cloudflare Zero Trust managed proxy.
 * @property {'on'|'off'|'unknown'} rbi Remote browser isolation.
 * @property {string|null} ip The address the far end observed.
 *
 *   THE ADDRESS LIVES HERE AND NOWHERE ELSE. DESIGN 2.2 permits displaying it, because the far
 *   end observed it and is reporting it back. The measurement contract deliberately has no
 *   field for it, so that it cannot reach a fixture, a bug report or a screenshot. A caller
 *   that displays it reads it from this object and drops it. Nothing in this engine stores it,
 *   sends it anywhere, or derives anything from it.
 */

/**
 * @typedef {Object} TraceUnavailable
 * @property {false} ok
 * @property {string} reason The fixed sentence for a reader.
 */

/**
 * Parse the plain text body. Total: unknown keys are ignored and a missing key is null rather
 * than a default, because a default here would be this product inventing a fact about someone
 * else's network.
 *
 * @param {string} body
 * @returns {Record<string, string>}
 */
export function parseTrace(body) {
  /** @type {Record<string, string>} */
  const out = {};
  if (typeof body !== 'string') return out;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key.length === 0) continue;
    out[key] = line.slice(eq + 1).trim();
  }
  return out;
}

/** @param {Record<string,string>} f @param {string} key @returns {'on'|'off'|'unknown'} */
function flag(f, key) {
  const v = f[key];
  if (v === 'on') return 'on';
  if (v === 'off') return 'off';
  return 'unknown';
}

/**
 * Read the serving facility for this connection.
 *
 * Any failure at all degrades to a stated outcome. There is no fallback source and no guess:
 * DESIGN trap 7 is explicit that when this call fails the page asks the visitor for a city
 * rather than looking them up.
 *
 * @param {Object} [deps]
 * @param {(init: RequestInit) => Promise<Response>} [deps.fetchTrace]
 * @param {number} [deps.timeoutMs]
 * @param {AbortSignal} [deps.signal]
 * @returns {Promise<ReportedConnection|TraceUnavailable>}
 */
export async function readReportedConnection(deps = {}) {
  const call = deps.fetchTrace || fetchTrace;
  const timeoutMs = deps.timeoutMs === undefined ? REQUEST_TIMEOUT_MS : deps.timeoutMs;
  const gate = deadline(timeoutMs, deps.signal);
  try {
    const res = await call({ ...PROBE_INIT, signal: gate.signal });
    if (!res || res.ok !== true) return { ok: false, reason: RUN_NOTICES.TRACE_UNAVAILABLE };
    const fields = parseTrace(await res.text());
    const colo = typeof fields.colo === 'string' ? fields.colo.trim() : '';
    if (colo.length === 0) return { ok: false, reason: RUN_NOTICES.TRACE_UNAVAILABLE };
    return {
      ok: true,
      colo,
      loc: typeof fields.loc === 'string' && fields.loc.length > 0 ? fields.loc : null,
      warp: flag(fields, 'warp'),
      gateway: flag(fields, 'gateway'),
      rbi: flag(fields, 'rbi'),
      ip: typeof fields.ip === 'string' && fields.ip.length > 0 ? fields.ip : null,
    };
  } catch {
    return { ok: false, reason: RUN_NOTICES.TRACE_UNAVAILABLE };
  } finally {
    gate.cancel();
  }
}

/**
 * @typedef {Object} RunNotice
 * @property {string} id
 * @property {'REPORTED'|'MEASURED'|'COMPUTED'} badge What kind of fact this notice is.
 * @property {string} text The fixed sentence.
 * @property {boolean} suppressesResults True when the run must not be presented as describing
 *   the connection of the person reading the page.
 */

/**
 * Turn a trace result into the notices a reader needs in order to read the numbers correctly.
 *
 * THE PROXY AND VPN QUESTION, answered honestly. A page cannot detect a VPN. What it can do is
 * repeat what the far end says about its own tunnels, and then state plainly that the absence
 * of a Cloudflare tunnel is not the absence of a tunnel. That is the whole of what is knowable
 * here, and the last notice says so rather than leaving a reader to assume the stronger claim.
 *
 * The one case that changes the product: remote browser isolation. If the browser is running in
 * a data centre then these timings describe that data centre, and calling them MEASURED facts
 * about the reader connection would be false. That notice sets suppressesResults.
 *
 * @param {ReportedConnection|TraceUnavailable} trace
 * @returns {RunNotice[]}
 */
export function noticesForTrace(trace) {
  /** @type {RunNotice[]} */
  const out = [];
  if (!trace.ok) {
    out.push({ id: 'TRACE_UNAVAILABLE', badge: 'MEASURED', text: RUN_NOTICES.TRACE_UNAVAILABLE, suppressesResults: false });
    return out;
  }
  if (trace.rbi === 'on') {
    out.push({ id: 'REMOTE_BROWSER', badge: 'REPORTED', text: RUN_NOTICES.REMOTE_BROWSER, suppressesResults: true });
  }
  if (trace.warp === 'on') {
    out.push({ id: 'WARP_TUNNEL', badge: 'REPORTED', text: RUN_NOTICES.WARP_TUNNEL, suppressesResults: false });
  }
  if (trace.gateway === 'on') {
    out.push({ id: 'GATEWAY_PROXY', badge: 'REPORTED', text: RUN_NOTICES.GATEWAY_PROXY, suppressesResults: false });
  }
  if (trace.warp !== 'on' && trace.gateway !== 'on' && trace.rbi !== 'on') {
    out.push({ id: 'NO_TUNNEL_REPORTED', badge: 'REPORTED', text: RUN_NOTICES.NO_TUNNEL_REPORTED, suppressesResults: false });
  }
  return out;
}
