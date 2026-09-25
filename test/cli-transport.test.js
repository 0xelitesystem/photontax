// The command line transport, src/cli/transport.js. DESIGN-CLI section 1, "Node transport".
//
// No test here reaches the internet. The probe table is checked by calling each entry with a
// stand in pool that opens nothing (probeTarget), and the socket behaviour is checked against a
// node:http server on 127.0.0.1, injected into the real transport code through startFor and
// agentFor, with a keepAlive Agent holding one socket, which is exactly the shape the production
// https Agent has.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';

import {
  NODE_PROBES, BODY_CAP_BYTES, createAgent, probeTarget, probeError, watchPhases, createNodeTransport,
} from '../src/cli/transport.js';
import { PROBE_ERROR_CODES, CLI_FAILURE_REASONS, cliClassifyFailure } from '../src/cli/reasons.js';
import { userAgentFor } from '../src/cli/copy.js';
import { MEASUREMENT_HOSTS, MEASURED_ENDPOINTS } from '../src/core/data/endpoints.js';
import { NON_MEASUREMENT_HOSTS } from '../src/core/data/reachable-hosts.js';
import { measureEndpoint, PROBE_INIT } from '../src/measure/index.js';
import { WARM_SAMPLE_COUNT, REQUESTS_PER_ENDPOINT } from '../src/core/constants.js';
import { memoryNetwork } from './helpers/cli-io.mjs';

const UA = userAgentFor('0.0.0');
const US_EAST = /** @type {any} */ (MEASURED_ENDPOINTS.find((e) => e.region === 'us-east-1'));

describe('the probe table is the allowlist', () => {
  test('it is frozen and its keys are exactly the declared measurement hosts', () => {
    assert.ok(Object.isFrozen(NODE_PROBES));
    assert.deepEqual(Object.keys(NODE_PROBES).sort(), [...MEASUREMENT_HOSTS].sort());
    assert.equal(Object.keys(NODE_PROBES).length, 12);
  });

  test('each entry addresses its own key over HTTPS on port 443, and nothing is contacted to learn that', () => {
    for (const host of MEASUREMENT_HOSTS) {
      const target = probeTarget(host);
      assert.equal(target.host, host);
      assert.equal(target.port, 443);
      assert.equal(target.protocol, 'https:');
      assert.equal(target.path, '/');
    }
  });

  test('the facility host the page uses is not in it, and nothing else is either', () => {
    for (const h of NON_MEASUREMENT_HOSTS) assert.equal(Object.prototype.hasOwnProperty.call(NODE_PROBES, h), false);
    assert.throws(() => probeTarget('www.cloudflare.com'), /not a declared measurement host/);
    assert.throws(() => probeTarget('dynamodb.us-east-2.amazonaws.com'), /not a declared measurement host/);
  });

  test('the transport refuses an undeclared host rather than building a URL for it', () => {
    const tr = createNodeTransport({ userAgent: UA, startFor: () => { throw new Error('must not start'); } });
    assert.equal(tr.probeFor('example.invalid'), undefined);
    assert.equal(tr.probeFor('www.cloudflare.com'), undefined);
    tr.close();
  });

  test('a User-Agent is required, and it names the product and nothing about the person', () => {
    assert.throws(() => createNodeTransport(/** @type {any} */ ({})), /User-Agent/);
    assert.equal(UA, 'photontax/0.0.0 (+https://github.com/0xelitesystem/photontax)');
  });

  test('the pool keeps one socket alive per host and checks certificates', () => {
    const a = createAgent();
    assert.equal(a.keepAlive, true);
    assert.equal(a.maxSockets, 1);
    assert.equal(a.options.rejectUnauthorized, true);
    assert.equal(a.defaultPort, 443);
    a.destroy();
  });
});

describe('socket reuse, proven against a localhost server', () => {
  /** @type {http.Server} */
  let server;
  let port = 0;
  let connections = 0;
  /** @type {Record<string, string|string[]|undefined>[]} */
  const headersSeen = [];
  /** @type {(req: http.IncomingMessage, res: http.ServerResponse) => void} */
  let handler = (_req, res) => res.end('healthy: dynamodb.us-east-1.amazonaws.com');

  before(async () => {
    server = http.createServer((req, res) => { headersSeen.push({ ...req.headers }); handler(req, res); });
    server.on('connection', () => { connections += 1; });
    await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
    port = /** @type {any} */ (server.address()).port;
  });
  after(() => new Promise((r) => { server.closeAllConnections(); server.close(() => r(undefined)); }));

  /** A resolver that answers asynchronously, like the operating system's, so its event is seen. */
  const lookup = (/** @type {string} */ _h, /** @type {any} */ o, /** @type {Function} */ cb) => setTimeout(() => (
    o && o.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)), 1);

  /** The real transport, with node:http and a keepAlive Agent injected in place of node:https. */
  const localTransport = () => createNodeTransport({
    userAgent: UA,
    startFor: () => (/** @type {any} */ options) => http.request('http://photontax.test:' + port + '/', { ...options, lookup }),
    agentFor: () => new http.Agent({ keepAlive: true, maxSockets: 1 }),
  });

  test('the engine\'s eight requests to one endpoint ride exactly one connection, and every warm sample says so', async () => {
    connections = 0;
    handler = (_req, res) => res.end('healthy: dynamodb.us-east-1.amazonaws.com');
    const tr = localTransport();
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure });
    tr.close();
    assert.equal(row.status === 'ok' || row.status === 'unstable', true, JSON.stringify(row));
    assert.equal(row.samplesMs.length, WARM_SAMPLE_COUNT);
    assert.equal(connections, 1, 'one TCP connection for the warm up and all seven warm samples');
    assert.equal(tr.requestsMade, REQUESTS_PER_ENDPOINT);
    assert.deepEqual(tr.reuse[US_EAST.id], { warmSamples: WARM_SAMPLE_COUNT, reused: WARM_SAMPLE_COUNT });
  });

  test('the warm up connection\'s phases are read from its own socket events', async () => {
    handler = (_req, res) => res.end('ok');
    const tr = localTransport();
    await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure });
    tr.close();
    const p = tr.phases[US_EAST.id];
    assert.ok(p, 'a sidecar entry keyed by endpoint id');
    assert.equal(typeof p.dnsMs, 'number');
    assert.equal(typeof p.tcpMs, 'number');
    assert.ok(/** @type {number} */ (p.dnsMs) >= 0 && /** @type {number} */ (p.tcpMs) >= 0);
    assert.equal(p.address, '127.0.0.1');
    assert.equal(p.attempts, 1);
    assert.equal(p.failedAttempts, 0);
    assert.equal(p.tlsMs, null, 'plain HTTP has no TLS handshake to time');
  });

  test('the request carries the product User-Agent and no header this module did not choose', async () => {
    headersSeen.length = 0;
    handler = (_req, res) => res.end('ok');
    const tr = localTransport();
    await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure });
    tr.close();
    assert.equal(headersSeen.length, REQUESTS_PER_ENDPOINT);
    for (const h of headersSeen) {
      assert.equal(h['user-agent'], UA);
      assert.deepEqual(Object.keys(h).sort(), ['connection', 'host', 'user-agent']);
      assert.equal(h.cookie, undefined);
    }
  });

  test('a far end that closes the connection after every response fails the endpoint rather than timing a fresh handshake', async () => {
    connections = 0;
    handler = (_req, res) => { res.setHeader('connection', 'close'); res.end('ok'); };
    const tr = localTransport();
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure });
    tr.close();
    assert.equal(row.status, 'failed');
    assert.equal(row.roundTripMs, null);
    assert.equal(row.failureReason, CLI_FAILURE_REASONS.SOCKET_NOT_REUSED);
    assert.deepEqual(tr.reuse[US_EAST.id], { warmSamples: 1, reused: 0 });
  });

  test('a redirect is a failure and is never followed', async () => {
    const paths = [];
    handler = (req, res) => { paths.push(req.url); res.statusCode = 301; res.setHeader('location', '/elsewhere'); res.end(); };
    const tr = localTransport();
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure });
    tr.close();
    assert.equal(row.status, 'failed');
    assert.equal(row.failureReason, CLI_FAILURE_REASONS.REDIRECT);
    assert.deepEqual(paths, ['/'], 'the warm up met the redirect and nothing went to the new location');
  });

  test('a status the page would also accept, such as 400, is timed like any other response', async () => {
    handler = (_req, res) => { res.statusCode = 400; res.end('{}'); };
    const tr = localTransport();
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure });
    tr.close();
    assert.notEqual(row.status, 'failed');
  });

  test('a body larger than the cap is abandoned unread', async () => {
    handler = (_req, res) => { res.end(Buffer.alloc(BODY_CAP_BYTES + 1, 97)); };
    const tr = localTransport();
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure });
    tr.close();
    assert.equal(row.status, 'failed');
    assert.equal(row.failureReason, CLI_FAILURE_REASONS.BODY_CAP);
  });

  test('a body exactly at the cap is read', async () => {
    handler = (_req, res) => { res.end(Buffer.alloc(BODY_CAP_BYTES, 97)); };
    const tr = localTransport();
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure });
    tr.close();
    assert.notEqual(row.status, 'failed');
  });

  test('a response that never arrives meets the deadline and produces no number', async () => {
    handler = () => { /* never answers */ };
    const tr = localTransport();
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure, timeoutMs: 60 });
    tr.close();
    assert.equal(row.status, 'failed');
    assert.equal(row.failureReason, CLI_FAILURE_REASONS.DEADLINE);
    assert.equal(tr.requestsMade, 1, 'no retry');
  });

  test('a refused connection is named as a refusal', async () => {
    const closed = http.createServer();
    await new Promise((r) => closed.listen(0, '127.0.0.1', () => r(undefined)));
    const dead = /** @type {any} */ (closed.address()).port;
    await new Promise((r) => closed.close(() => r(undefined)));
    const tr = createNodeTransport({
      userAgent: UA,
      startFor: () => (/** @type {any} */ options) => http.request('http://127.0.0.1:' + dead + '/', options),
      agentFor: () => new http.Agent({ keepAlive: true, maxSockets: 1 }),
    });
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure });
    tr.close();
    assert.equal(row.status, 'blocked');
    assert.equal(row.failureReason, CLI_FAILURE_REASONS.CONNECTION_REFUSED);
  });

  test('a run that is interrupted says so, and nothing partial is reported', async () => {
    handler = () => { /* never answers */ };
    const tr = localTransport();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure, signal: controller.signal });
    tr.close();
    assert.equal(row.status, 'failed');
    assert.equal(row.failureReason, CLI_FAILURE_REASONS.INTERRUPTED);
  });
});

describe('the transport, over an in memory pool', () => {
  test('a request already cancelled is never started, so no connection is opened for it', async () => {
    const net = memoryNetwork();
    const tr = createNodeTransport({ userAgent: UA, startFor: net.startFor, agentFor: net.agentFor });
    const probe = /** @type {Function} */ (tr.probeFor(US_EAST.measurementHost));
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(probe({ ...PROBE_INIT, signal: controller.signal }), { name: 'AbortError' });
    assert.equal(net.calls.length, 0);
    assert.equal(tr.requestsMade, 0);
  });

  test('a warm sample on a fresh socket is refused with a typed error, never timed', async () => {
    const net = memoryNetwork({ behaviour: (_h, i) => (i === 3 ? { reused: false } : undefined) });
    const tr = createNodeTransport({ userAgent: UA, startFor: net.startFor, agentFor: net.agentFor });
    const row = await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure, now: () => net.clock.t });
    assert.equal(row.status, 'failed');
    assert.equal(row.failureReason, CLI_FAILURE_REASONS.SOCKET_NOT_REUSED);
    assert.deepEqual(tr.reuse[US_EAST.id], { warmSamples: 3, reused: 2 });
    assert.equal(tr.requestsMade, 4, 'the refused sample is counted, and nothing after it is sent');
  });

  test('the warm up is the only request whose socket is not checked for reuse', async () => {
    const net = memoryNetwork();
    const tr = createNodeTransport({ userAgent: UA, startFor: net.startFor, agentFor: net.agentFor });
    await measureEndpoint(US_EAST, { probeFor: (h) => tr.probeFor(h), classifyFailure: cliClassifyFailure, now: () => net.clock.t });
    assert.deepEqual(tr.reuse[US_EAST.id], { warmSamples: 7, reused: 7 });
    assert.equal(net.calls.filter((x) => x.index === 0).length, 1);
  });

  test('each probe gets its own pool, and close destroys every pool', () => {
    const net = memoryNetwork();
    const tr = createNodeTransport({ userAgent: UA, startFor: net.startFor, agentFor: net.agentFor });
    for (const h of MEASUREMENT_HOSTS) tr.probeFor(h);
    assert.equal(net.pools, 12);
    tr.close();
    assert.equal(net.destroyed, 12);
  });

  test('the typed errors carry their code and a name the reasons table knows', () => {
    for (const code of Object.values(PROBE_ERROR_CODES)) {
      const e = probeError(code);
      assert.equal(e.code, code);
      assert.equal(e.name, 'PhotontaxProbeError');
    }
  });
});

describe('the phases of a connection, read from its socket events', () => {
  /** @param {number[]} readings */
  const scripted = (readings) => { let i = 0; return () => readings[Math.min(i++, readings.length - 1)]; };

  test('DNS runs from the request start to the resolver answering', () => {
    const s = /** @type {any} */ (new EventEmitter());
    const p = watchPhases(s, 100, scripted([112]));
    s.emit('lookup', null, '192.0.2.1', 4, 'x');
    assert.equal(p.dnsMs, 12);
  });

  test('a second lookup event, one per resolved address, does not move the DNS time', () => {
    const s = /** @type {any} */ (new EventEmitter());
    const p = watchPhases(s, 100, scripted([112, 150]));
    s.emit('lookup', null, '2001:db8::1', 6, 'x');
    s.emit('lookup', null, '192.0.2.1', 4, 'x');
    assert.equal(p.dnsMs, 12);
  });

  test('a failed lookup leaves no DNS time', () => {
    const s = /** @type {any} */ (new EventEmitter());
    const p = watchPhases(s, 100, scripted([112]));
    s.emit('lookup', new Error('ENOTFOUND'));
    assert.equal(p.dnsMs, null);
  });

  test('happy eyeballs: TCP connect runs from the LAST attempt, and the failed ones are counted, not timed', () => {
    const s = /** @type {any} */ (new EventEmitter());
    // attempt one at 120, fails; attempt two at 370; connected at 395.
    const p = watchPhases(s, 100, scripted([120, 370, 395, 420]));
    s.emit('connectionAttempt', '2001:db8::1', 443, 6);
    s.emit('connectionAttemptFailed', '2001:db8::1', 443, 6, new Error('refused'));
    s.emit('connectionAttempt', '192.0.2.1', 443, 4);
    s.remoteAddress = '192.0.2.1';
    s.emit('connect');
    s.getProtocol = () => 'TLSv1.3';
    s.emit('secureConnect');
    assert.equal(p.tcpMs, 25);
    assert.equal(p.attempts, 2);
    assert.equal(p.failedAttempts, 1);
    assert.equal(p.address, '192.0.2.1');
    assert.equal(p.tlsMs, 25);
    assert.equal(p.tlsVersion, 'TLSv1.3');
  });

  test('an attempt that timed out is counted as failed too', () => {
    const s = /** @type {any} */ (new EventEmitter());
    const p = watchPhases(s, 0, scripted([1, 2, 3]));
    s.emit('connectionAttempt', '2001:db8::1', 443, 6);
    s.emit('connectionAttemptTimeout', '2001:db8::1', 443, 6);
    assert.equal(p.failedAttempts, 1);
  });

  test('a connect with no attempt seen leaves TCP connect time unstated rather than guessed', () => {
    const s = /** @type {any} */ (new EventEmitter());
    const p = watchPhases(s, 0, scripted([5]));
    s.emit('connect');
    assert.equal(p.tcpMs, null);
  });
});
