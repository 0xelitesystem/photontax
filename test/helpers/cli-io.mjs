// Test doubles for the command line. No socket, no network, no terminal.
//
//   captureStream()   a Writable that keeps what was written, with isTTY and columns set as asked
//   brokenPipe()      a Writable whose reader has gone: every write fails with EPIPE, the way
//                     process.stdout fails when piped into a program that exited
//   memoryNetwork()   a request starter and a pool that behave like node:https with a keepAlive
//                     Agent holding one socket, entirely in memory, for the real transport code
//                     in src/cli/transport.js to drive
//
// A test that needs real sockets (the reuse proof) uses a node:http server on 127.0.0.1 in the
// test itself, never a remote host.

import { Writable } from 'node:stream';
import { EventEmitter } from 'node:events';

/**
 * @param {{isTTY?:boolean, columns?:number}} [o]
 * @returns {Writable & {isTTY:boolean, columns?:number, text:() => string}}
 */
export function captureStream(o = {}) {
  /** @type {string[]} */
  const chunks = [];
  const s = /** @type {any} */ (new Writable({
    write(chunk, _enc, cb) { chunks.push(String(chunk)); cb(); },
  }));
  s.isTTY = Boolean(o.isTTY);
  if (o.columns !== undefined) s.columns = o.columns;
  s.text = () => chunks.join('');
  return s;
}

/**
 * A stream whose reader has gone away. The first write fails with EPIPE and every later write
 * would too; `writes` counts the attempts, so a test can see that writing stopped.
 * @returns {Writable & {isTTY:boolean, writes:number}}
 */
export function brokenPipe() {
  const s = /** @type {any} */ (new Writable({
    write(_chunk, _enc, cb) {
      s.writes += 1;
      const err = /** @type {Error & {code:string}} */ (new Error('write EPIPE'));
      err.code = 'EPIPE';
      cb(err);
    },
  }));
  s.isTTY = false;
  s.writes = 0;
  return s;
}

/**
 * @typedef {Object} Behaviour What one request does. Every field is optional.
 * @property {number} [ms] What the response adds to the scripted clock.
 * @property {number} [status] HTTP status, default 200.
 * @property {number} [bodyBytes] Response body size, default 42.
 * @property {boolean} [reused] Force req.reusedSocket.
 * @property {Error} [error] Fail the request with this error instead of answering.
 * @property {boolean} [hang] Never answer (the engine's deadline must end it).
 * @property {{dnsMs?:number, attempts?:string[], tcpMs?:number, tlsMs?:number, address?:string, tls?:string}} [phases]
 *   Socket events for a warm up, played on the clock: lookup, one attempt per address (all but the
 *   last fail), connect, secureConnect.
 */

/**
 * @param {{clock?:{t:number}, behaviour?:(host:string, index:number) => Behaviour|undefined}} [o]
 */
export function memoryNetwork(o = {}) {
  const clock = o.clock || { t: 0 };
  const behaviour = o.behaviour || (() => undefined);
  /** @type {{host:string, index:number, method:string, headers:Record<string,string>}[]} */
  const calls = [];
  let pools = 0;
  let destroyed = 0;

  /** @param {string} host */
  const startFor = (host) => (/** @type {any} */ options) => {
    const pool = options.agent;
    const index = pool.calls;
    pool.calls += 1;
    calls.push({ host, index, method: options.method, headers: { ...options.headers } });
    const b = behaviour(host, index) || {};
    const req = /** @type {any} */ (new EventEmitter());
    req.reusedSocket = b.reused === undefined ? pool.used : b.reused;
    pool.used = true;
    let done = false;
    req.destroy = (/** @type {any} */ err) => {
      if (done) return req;
      done = true;
      if (err) setImmediate(() => req.emit('error', err));
      return req;
    };
    const signal = /** @type {AbortSignal|undefined} */ (options.signal);
    const onAbort = () => {
      if (done) return;
      done = true;
      const e = /** @type {Error & {code:string}} */ (new Error('The operation was aborted'));
      e.name = 'AbortError';
      e.code = 'ABORT_ERR';
      req.emit('error', e);
    };
    req.end = () => {
      if (signal) {
        if (signal.aborted) { setImmediate(onAbort); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      setImmediate(() => {
        if (done) return;
        if (b.error) { done = true; req.emit('error', b.error); return; }
        const socket = pool.socket;
        req.emit('socket', socket);
        if (done) return;
        if (index === 0 && b.phases) {
          const p = b.phases;
          if (p.dnsMs !== undefined) { clock.t += p.dnsMs; socket.emit('lookup', null, '192.0.2.10', 4, 'example.test'); }
          const attempts = p.attempts || ['192.0.2.10'];
          attempts.forEach((addr, i) => {
            socket.emit('connectionAttempt', addr, 443, 4);
            if (i < attempts.length - 1) { clock.t += 1; socket.emit('connectionAttemptFailed', addr, 443, 4, new Error('refused')); }
          });
          clock.t += p.tcpMs || 0;
          socket.remoteAddress = p.address || attempts[attempts.length - 1];
          socket.emit('connect');
          if (p.tlsMs !== undefined) {
            clock.t += p.tlsMs;
            socket.getProtocol = () => p.tls || 'TLSv1.3';
            socket.emit('secureConnect');
          }
        }
        if (b.hang) return;
        clock.t += b.ms === undefined ? 50 : b.ms;
        if (signal) signal.removeEventListener('abort', onAbort);
        const res = /** @type {any} */ (new EventEmitter());
        res.statusCode = b.status || 200;
        res.complete = false;
        res.destroy = () => {};
        req.emit('response', res);
        if (done) return;
        const size = b.bodyBytes === undefined ? 42 : b.bodyBytes;
        const chunk = 16 * 1024;
        for (let sent = 0; sent < size && !done; sent += chunk) {
          res.emit('data', new Uint8Array(Math.min(chunk, size - sent)));
        }
        if (done) return;
        done = true;
        res.complete = true;
        res.emit('end');
        res.emit('close');
      });
    };
    return req;
  };

  const agentFor = () => {
    pools += 1;
    return { used: false, calls: 0, socket: new EventEmitter(), destroy() { destroyed += 1; } };
  };

  return {
    clock,
    calls,
    startFor,
    agentFor,
    get pools() { return pools; },
    get destroyed() { return destroyed; },
    /** Requests per host, in the order the table lists hosts. @param {readonly string[]} hosts */
    perHost(hosts) { return hosts.map((h) => calls.filter((x) => x.host === h).length); },
  };
}
