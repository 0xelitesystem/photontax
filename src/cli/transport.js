// THE COMMAND LINE TRANSPORT. DESIGN-CLI section 1, "Node transport". The one module under src/
// that may open a connection from Node, and scripts/gate-csp.mjs enforces that it is the only one
// and that it does so only in the form whose host the gate can read.
//
// There is no Content-Security-Policy outside a browser, so the allowlist is this file: a frozen
// table with one literal https URL per measurement host, keyed by that host. Nothing builds a
// URL, nothing takes a host, URL, port or base URL from argv or the environment, and a test
// asserts the table keys equal MEASUREMENT_HOSTS and that each entry addresses its own key.
//
// WHY NOT THE GLOBAL FETCH. Verified on localhost for the architecture map: Node's built in
// fetch opens a second connection on the first warm sample when requests go back to back, which
// puts a handshake inside a sample the method calls warm, and it follows an environment proxy
// when NODE_USE_ENV_PROXY is set, which would time the proxy and reach an undeclared host. A
// dedicated Agent per host, keepAlive on and one socket at most, has neither problem, and it
// lets the command line PROVE the method rather than assume it: every warm sample must report
// that it rode a reused socket, or the endpoint fails with a stated reason.
//
// WHAT EACH REQUEST IS: GET, no body, no cookie (Node keeps no cookie jar), the User-Agent from
// DESIGN-CLI item 9 and no other header this module sets. Certificate checking stays on and is
// requested explicitly. A 3xx is refused, mirroring redirect 'error' on the page. The body is
// read to the end, capped, and discarded. Each request carries the engine's deadline signal.
// There is no retry here; the engine decides what a failure means.
//
// WHAT IS RECORDED BESIDE THE ROUND TRIP, and only from the warm up connection, in a sidecar
// keyed by endpoint id and never on the measurement contract: the DNS lookup time, the TCP
// connect time (from the LAST connection attempt, failed attempts counted and excluded), the TLS
// handshake time, the address connected to and the TLS version the server chose.

import https from 'node:https';
import { MEASURED_ENDPOINTS } from '../core/data/endpoints.js';
import { now as defaultNow } from '../measure/clock.js';
import { PROBE_ERROR_CODES } from './reasons.js';

/** The most bytes read from one response. The endpoints answer with a small fixed body. */
export const BODY_CAP_BYTES = 64 * 1024;

/**
 * One literal request per measurement host. This table IS the allowlist. Each value starts a
 * request with the options it is given and returns it unsent.
 * @type {Readonly<Record<string, (options: object) => any>>}
 */
export const NODE_PROBES = Object.freeze({
  'dynamodb.af-south-1.amazonaws.com': (options) => https.request('https://dynamodb.af-south-1.amazonaws.com/', options),
  'dynamodb.ap-east-1.amazonaws.com': (options) => https.request('https://dynamodb.ap-east-1.amazonaws.com/', options),
  'dynamodb.ap-northeast-1.amazonaws.com': (options) => https.request('https://dynamodb.ap-northeast-1.amazonaws.com/', options),
  'dynamodb.ap-south-1.amazonaws.com': (options) => https.request('https://dynamodb.ap-south-1.amazonaws.com/', options),
  'dynamodb.ap-southeast-1.amazonaws.com': (options) => https.request('https://dynamodb.ap-southeast-1.amazonaws.com/', options),
  'dynamodb.ap-southeast-2.amazonaws.com': (options) => https.request('https://dynamodb.ap-southeast-2.amazonaws.com/', options),
  'dynamodb.eu-central-1.amazonaws.com': (options) => https.request('https://dynamodb.eu-central-1.amazonaws.com/', options),
  'dynamodb.eu-north-1.amazonaws.com': (options) => https.request('https://dynamodb.eu-north-1.amazonaws.com/', options),
  'dynamodb.eu-west-2.amazonaws.com': (options) => https.request('https://dynamodb.eu-west-2.amazonaws.com/', options),
  'dynamodb.il-central-1.amazonaws.com': (options) => https.request('https://dynamodb.il-central-1.amazonaws.com/', options),
  'dynamodb.sa-east-1.amazonaws.com': (options) => https.request('https://dynamodb.sa-east-1.amazonaws.com/', options),
  'dynamodb.us-east-1.amazonaws.com': (options) => https.request('https://dynamodb.us-east-1.amazonaws.com/', options),
});

/**
 * The connection pool for one host: keepAlive on, one socket at most, certificate checking on.
 * One per host, so no two endpoints ever share a socket and no endpoint ever has two.
 * @returns {any} An https Agent.
 */
export function createAgent() {
  return new https.Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1, rejectUnauthorized: true });
}

/**
 * Where a probe in NODE_PROBES would connect, found without connecting. The entry is called with
 * a stand in pool whose addRequest records the options Node hands it and does nothing else, so
 * no socket, no DNS lookup and no byte leaves the process. The request is then discarded.
 * @param {string} host A key of NODE_PROBES.
 * @returns {{host:string, port:number, path:string, protocol:string}}
 */
export function probeTarget(host) {
  if (!Object.prototype.hasOwnProperty.call(NODE_PROBES, host)) {
    throw new RangeError('probeTarget: ' + host + ' is not a declared measurement host');
  }
  /** @type {any} */
  let seen = null;
  const standIn = {
    protocol: 'https:',
    defaultPort: 443,
    addRequest(/** @type {any} */ _req, /** @type {any} */ opts) { seen = opts; },
  };
  const req = NODE_PROBES[host]({ agent: standIn, method: 'GET' });
  req.on('error', () => {});
  req.destroy();
  if (seen === null) throw new Error('probeTarget: the probe for ' + host + ' never asked for a connection');
  return { host: seen.host, port: Number(seen.port), path: seen.path, protocol: seen.protocol };
}

/**
 * A refusal raised by this transport. Named so the command line reasons table can state it.
 * @param {string} code One of PROBE_ERROR_CODES.
 * @returns {Error & {code:string}}
 */
export function probeError(code) {
  const err = /** @type {Error & {code:string}} */ (new Error(code));
  err.name = 'PhotontaxProbeError';
  err.code = code;
  return err;
}

/**
 * @typedef {Object} Phases
 * @property {number|null} dnsMs Request start to the resolver answering.
 * @property {number|null} tcpMs Last connection attempt to the connection being established.
 * @property {number|null} tlsMs Connection established to the TLS handshake completing.
 * @property {number} attempts Connection attempts seen.
 * @property {number} failedAttempts Attempts that failed before the one that connected.
 * @property {string|null} address The address connected to.
 * @property {string|null} tlsVersion The TLS version the server chose.
 */

/**
 * Read the phases of a fresh connection from its own socket events. Pure over an event emitter,
 * so it is tested with a fake socket and a scripted clock.
 * @param {import('node:events').EventEmitter & {remoteAddress?:string, getProtocol?:() => string|null}} socket
 * @param {number} startedAt The clock reading taken before the request was started.
 * @param {() => number} now
 * @returns {Phases} Filled in as the events arrive.
 */
export function watchPhases(socket, startedAt, now) {
  /** @type {Phases} */
  const p = { dnsMs: null, tcpMs: null, tlsMs: null, attempts: 0, failedAttempts: 0, address: null, tlsVersion: null };
  /** @type {number|null} */
  let attemptAt = null;
  /** @type {number|null} */
  let connectedAt = null;
  socket.once('lookup', (err) => { if (!err) p.dnsMs = now() - startedAt; });
  socket.on('connectionAttempt', () => { attemptAt = now(); p.attempts += 1; });
  socket.on('connectionAttemptFailed', () => { p.failedAttempts += 1; });
  socket.on('connectionAttemptTimeout', () => { p.failedAttempts += 1; });
  socket.once('connect', () => {
    connectedAt = now();
    if (attemptAt !== null) p.tcpMs = connectedAt - attemptAt;
    p.address = typeof socket.remoteAddress === 'string' ? socket.remoteAddress : null;
  });
  socket.once('secureConnect', () => {
    if (connectedAt !== null) p.tlsMs = now() - connectedAt;
    const v = typeof socket.getProtocol === 'function' ? socket.getProtocol() : null;
    p.tlsVersion = typeof v === 'string' ? v : null;
  });
  return p;
}

/**
 * @typedef {Object} TransportOptions
 * @property {string} userAgent
 * @property {() => number} [now]
 * @property {(host: string) => (options: object) => any} [startFor] Returns the function that
 *   starts one request to host. Defaults to NODE_PROBES. Tests inject a localhost server here.
 * @property {(host: string) => any} [agentFor] Returns the pool for host. Defaults to createAgent.
 * @property {number} [bodyCap]
 */

/**
 * The transport for one run. probeFor plugs into the engine's deps.probeFor, so the estimator,
 * the spread rule and the failure handling are the page's own code, unchanged.
 * @param {TransportOptions} options
 */
export function createNodeTransport(options) {
  if (typeof options.userAgent !== 'string' || options.userAgent.length === 0) {
    throw new TypeError('createNodeTransport: a User-Agent is required');
  }
  const now = options.now || defaultNow;
  const startFor = options.startFor || ((/** @type {string} */ host) => NODE_PROBES[host]);
  const agentFor = options.agentFor || (() => createAgent());
  const bodyCap = options.bodyCap === undefined ? BODY_CAP_BYTES : options.bodyCap;
  const endpointFor = new Map(MEASURED_ENDPOINTS.map((e) => [e.measurementHost, e.id]));
  /** @type {any[]} */
  const agents = [];
  /** @type {Record<string, Phases>} */
  const phases = {};
  /** @type {Record<string, {warmSamples:number, reused:number}>} */
  const reuse = {};
  let requestsMade = 0;

  /**
   * One request and its complete response. Resolves only when the body has fully arrived, with
   * the shape the engine's probe contract reads: {ok, status, arrayBuffer()}.
   * @param {(options: object) => any} start
   * @param {any} agent
   * @param {RequestInit} init
   * @param {number} callIndex 0 is the warm up.
   * @param {string} endpointId
   */
  const requestOnce = (start, agent, init, callIndex, endpointId) => new Promise((resolve, reject) => {
    const signal = /** @type {AbortSignal|undefined} */ (init && init.signal ? init.signal : undefined);
    if (signal && signal.aborted) {
      // Never start a request that is already cancelled: starting it would open a connection.
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
      return;
    }
    let settled = false;
    /** @param {unknown} err */
    const fail = (err) => { if (!settled) { settled = true; reject(err); } };
    const startedAt = now();
    /** @type {any} */
    let req;
    try {
      req = start({ method: 'GET', agent, signal, headers: { 'user-agent': options.userAgent } });
    } catch (err) {
      fail(err);
      return;
    }
    requestsMade += 1;
    req.on('socket', (/** @type {any} */ socket) => {
      if (callIndex === 0) {
        phases[endpointId] = watchPhases(socket, startedAt, now);
        return;
      }
      reuse[endpointId].warmSamples += 1;
      if (req.reusedSocket === true) {
        reuse[endpointId].reused += 1;
        return;
      }
      const e = probeError(PROBE_ERROR_CODES.SOCKET_NOT_REUSED);
      fail(e);
      req.destroy(e);
    });
    req.on('response', (/** @type {any} */ res) => {
      const status = Number(res.statusCode);
      if (status >= 300 && status < 400) {
        const e = probeError(PROBE_ERROR_CODES.REDIRECT);
        fail(e);
        res.destroy();
        req.destroy(e);
        return;
      }
      /** @type {Uint8Array[]} */
      const chunks = [];
      let size = 0;
      res.on('data', (/** @type {Uint8Array} */ chunk) => {
        size += chunk.length;
        if (size > bodyCap) {
          const e = probeError(PROBE_ERROR_CODES.BODY_CAP);
          fail(e);
          res.destroy();
          req.destroy(e);
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', fail);
      res.on('close', () => {
        // Closed before the body completed: the far end hung up mid response.
        if (res.complete) return;
        const e = /** @type {Error & {code:string}} */ (new Error('response closed early'));
        e.code = 'ECONNRESET';
        fail(e);
      });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        const body = Buffer.concat(chunks);
        resolve({
          ok: status >= 200 && status < 300,
          status,
          arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        });
      });
    });
    req.on('error', fail);
    req.end();
  });

  return {
    /**
     * The probe for one host, or undefined for a host that is not declared. Each call returns a
     * fresh probe with its own pool and its own call count, which is what lets call 0 be the
     * warm up and calls 1 onwards be checked for reuse.
     * @param {string} host
     */
    probeFor(host) {
      if (!Object.prototype.hasOwnProperty.call(NODE_PROBES, host)) return undefined;
      const endpointId = endpointFor.get(host) || host;
      const start = startFor(host);
      const agent = agentFor(host);
      agents.push(agent);
      reuse[endpointId] = { warmSamples: 0, reused: 0 };
      let calls = 0;
      return (/** @type {RequestInit} */ init) => {
        const i = calls;
        calls += 1;
        return requestOnce(start, agent, init, i, endpointId);
      };
    },
    /** Warm up connection phases, keyed by endpoint id. */
    phases,
    /** Per endpoint, the warm samples checked for reuse and how many passed. */
    reuse,
    /** Requests actually started in this run. */
    get requestsMade() { return requestsMade; },
    /** Close every pooled socket so nothing keeps the process alive after the run. */
    close() {
      for (const a of agents) if (a && typeof a.destroy === 'function') a.destroy();
    },
  };
}
