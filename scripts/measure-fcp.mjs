#!/usr/bin/env node
// FIRST CONTENTFUL PAINT, MEASURED RATHER THAN ESTIMATED.
//
// DESIGN 6.3 states two numbers as one gate: "the single file must transfer under 40 KB
// gzipped, and first contentful paint must be under 1.0 s on a cold cache over a throttled
// Fast 3G profile. Both numbers are measured and published in the README." scripts/build.mjs
// measures the first. This measures the second, and it exists because the README may not carry
// a figure nobody produced.
//
//   node scripts/measure-fcp.mjs            measure and print
//   node scripts/measure-fcp.mjs --runs 7   more samples
//   node scripts/measure-fcp.mjs --json     machine readable, for a README refresh
//
// HOW, AND WHY EACH PIECE IS WHAT IT IS.
//
//   The page is served over HTTP, not opened from a file:// URL. A file:// load has no
//   transfer at all, so it would measure this machine's disk and report a number that has
//   nothing to do with a reader on a phone.
//
//   It is served WITH Content-Encoding: gzip, because the gate is stated in gzipped bytes and
//   GitHub Pages compresses. Measuring the uncompressed page would be measuring a page nobody
//   is served.
//
//   The throttle is the Fast 3G preset of the DevTools network conditions, by its exact
//   constants: 562.5 ms of added latency, 1.6 Mbit/s down and 750 Kbit/s up, each at the 90
//   percent the preset applies. They are written out below rather than named, because a
//   preset that changes underneath a published number is a published number that quietly
//   becomes false.
//
//   Every run gets a FRESH BROWSER CONTEXT and Network.setCacheDisabled, which is what "cold
//   cache" means. Warm runs measure the second visit, and the design says first.
//
//   The browser is Microsoft Edge, headless. Nothing here drives Chrome or Brave.
//
// ZERO DEPENDENCIES. The Chrome DevTools Protocol is spoken over the WebSocket that node
// provides, and the HTTP server is node:http.

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REPO, say, isMain } from './_shipped.mjs';

/** DESIGN 6.3. Milliseconds. */
export const FCP_BUDGET_MS = 1000;

/**
 * The DevTools "Fast 3G" preset, written out. Chromium applies a 0.9 factor to the nominal
 * throughputs, and the latency is the whole added round trip.
 */
export const FAST_3G = Object.freeze({
  latencyMs: 562.5,
  downloadBytesPerSecond: (1.6 * 1024 * 1024 / 8) * 0.9,
  uploadBytesPerSecond: (750 * 1024 / 8) * 0.9,
});

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** @returns {Promise<string>} */
async function findEdge() {
  const { stat } = await import('node:fs/promises');
  for (const c of EDGE_CANDIDATES) {
    try { await stat(c); return c; } catch { /* next */ }
  }
  throw new Error('measure-fcp: no Microsoft Edge found. Looked in:\n  ' + EDGE_CANDIDATES.join('\n  '));
}

/**
 * Serve the site, gzipped, the way GitHub Pages serves it.
 *
 * MORE THAN ONE ROUTE, SINCE THE PAYLOAD WAS SPLIT. DESIGN 6.3 takes the globe off the
 * critical path into ./assets/globe.js, and a rig that served the page for every path would
 * have answered that request with the HTML and measured a site that does not exist. Every
 * route is gzipped and marked no-store, and a path nobody registered gets a 404 rather than
 * something that happens to be lying around, because a silent fallback is how a measurement
 * stops describing the artifact.
 *
 * @param {Record<string, {body:Buffer, type:string}>} routes Keyed by path, '/' being the page.
 * @returns {Promise<{origin:string, close:()=>Promise<void>}>}
 */
export async function serveGzipped(routes) {
  const server = createServer((req, res) => {
    const key = (req.url || '/').split('?')[0];
    const hit = routes[key];
    if (!hit) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('measure-fcp: nothing is served at ' + key);
      return;
    }
    res.writeHead(200, {
      'content-type': hit.type,
      'content-encoding': 'gzip',
      'content-length': String(hit.body.length),
      'cache-control': 'no-store',
    });
    res.end(hit.body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: 'http://127.0.0.1:' + port + '/',
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** A minimal CDP client over one WebSocket. */
class Cdp {
  /** @param {string} url */
  constructor(url) {
    this.ws = new WebSocket(url);
    this.next = 1;
    /** @type {Map<number,{resolve:Function,reject:Function}>} */
    this.pending = new Map();
    /** @type {((m:any)=>void)[]} */
    this.listeners = [];
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      for (const l of this.listeners) l(msg);
    });
  }

  ready() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('measure-fcp: the DevTools socket refused the connection')), { once: true });
    });
  }

  /** @param {string} method @param {object} [params] @param {string} [sessionId] */
  send(method, params = {}, sessionId) {
    const id = this.next++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  /** @param {(m:any)=>void} fn @returns {()=>void} */
  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((x) => x !== fn); }; }

  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

/** @param {string} url @param {number} attempts */
async function waitForDevTools(url, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('measure-fcp: Edge did not open its DevTools endpoint at ' + url);
}

/**
 * One cold load, reporting the document's own timings in milliseconds from its time origin.
 * @param {Cdp} browser
 * @param {string} origin
 * @returns {Promise<{fcpMs:number, firstPaintMs:number|null, responseStartMs:number,
 *   responseEndMs:number, domInteractiveMs:number, transferSize:number,
 *   encodedBodySize:number, decodedBodySize:number, appTextLength:number}>}
 */
export async function oneColdLoad(browser, origin, throttled = true) {
  // A fresh browser context per run is what makes the cache cold: a new context shares no
  // HTTP cache, no memory cache and no compiled script cache with the run before it.
  const { browserContextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });

  try {
    await browser.send('Page.enable', {}, sessionId);
    await browser.send('Network.enable', {}, sessionId);
    await browser.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
    // The unthrottled pass exists only as a reference line beside the throttled one. It is
    // what this machine can do with no network in the way, and it is NOT the gate: DESIGN 6.3
    // states the budget over a throttled Fast 3G profile, so that is the number that decides.
    await browser.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: throttled ? FAST_3G.latencyMs : 0,
      downloadThroughput: throttled ? FAST_3G.downloadBytesPerSecond : -1,
      uploadThroughput: throttled ? FAST_3G.uploadBytesPerSecond : -1,
    }, sessionId);
    await browser.send('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId);

    // WAIT FOR THE PAGE TO FINISH, THEN ASK THE PAGE. The number is read from the document's
    // own PerformancePaintTiming entry rather than from a protocol event, because that entry
    // IS the specified definition of first contentful paint: milliseconds from the navigation's
    // time origin to the first paint that put text or an image on the screen. A timestamp
    // subtraction on this side of the socket measures something adjacent to it and not it.
    //
    // THE WAIT IS SCOPED TO THIS NAVIGATION'S OWN LOADER, and that is not a detail. Turning
    // lifecycle events on replays them for the about:blank document the tab already holds, so
    // an unscoped wait for "networkIdle" resolves instantly on the blank page, the read runs
    // before the real page has painted, and the measurement reports no paint at all. Events
    // are buffered from before the navigate call, because under a throttle the navigate
    // response can arrive after the first lifecycle events have already been sent.
    /** @type {{name:string, loaderId:string}[]} */
    const seen = [];
    let onLifecycle = (p) => { seen.push(p); };
    const off = browser.on((msg) => {
      if (msg.sessionId !== sessionId || msg.method !== 'Page.lifecycleEvent') return;
      onLifecycle(msg.params);
    });

    try {
      const nav = await browser.send('Page.navigate', { url: origin }, sessionId);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('measure-fcp: the page did not settle within 90 s')), 90000);
        const settled = (p) => {
          if (p.loaderId !== nav.loaderId || p.name !== 'networkIdle') return;
          clearTimeout(timer);
          resolve();
        };
        for (const p of seen) settled(p);
        onLifecycle = settled;
      });
    } finally {
      off();
    }

    const read = await browser.send('Runtime.evaluate', {
      expression: `(() => {
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find((e) => e.name === 'first-contentful-paint');
        const fp = paint.find((e) => e.name === 'first-paint');
        const nav = performance.getEntriesByType('navigation')[0];
        const app = document.getElementById('app');
        return JSON.stringify({
          fcpMs: fcp ? fcp.startTime : null,
          firstPaintMs: fp ? fp.startTime : null,
          responseStartMs: nav ? nav.responseStart : null,
          responseEndMs: nav ? nav.responseEnd : null,
          domInteractiveMs: nav ? nav.domInteractive : null,
          transferSize: nav ? nav.transferSize : null,
          encodedBodySize: nav ? nav.encodedBodySize : null,
          decodedBodySize: nav ? nav.decodedBodySize : null,
          appTextLength: app ? app.textContent.trim().length : 0,
        });
      })()`,
      returnByValue: true,
    }, sessionId);

    const sample = JSON.parse(read.result.value);
    if (sample.fcpMs === null) throw new Error('measure-fcp: the page reported no contentful paint at all');
    return sample;
  } finally {
    await browser.send('Target.closeTarget', { targetId }).catch(() => {});
    await browser.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}

/**
 * @param {{runs?:number, html?:string}} [options]
 * @returns {Promise<{samples:number[], medianMs:number, minMs:number, maxMs:number, transferredBytes:number}>}
 */
export async function measureFcp(options = {}) {
  const runs = options.runs ?? 5;
  const throttled = options.throttled ?? true;
  const html = options.html ?? await readFile(path.join(REPO, 'index.html'), 'utf8');
  const gzipped = gzipSync(Buffer.from(html, 'utf8'), { level: 9 });

  /** @type {Record<string, {body:Buffer, type:string}>} */
  const routes = { '/': { body: gzipped, type: 'text/html; charset=utf-8' } };

  // The deferred half, served from the same origin at the same relative path the page asks
  // for. It is NOT part of the first contentful paint measurement, which is the whole point,
  // but it has to be there: the page requests it two animation frames after it mounts, and a
  // run where that request 404s is a run that measured a page in an error state.
  let deferredBytes = 0;
  try {
    const globe = await readFile(path.join(REPO, 'assets', 'globe.js'), 'utf8');
    const body = gzipSync(Buffer.from(globe, 'utf8'), { level: 9 });
    deferredBytes = body.length;
    routes['/assets/globe.js'] = { body, type: 'text/javascript; charset=utf-8' };
  } catch { /* a build without a renderer ships no deferred file, and the page says so */ }

  const edge = await findEdge();
  const profile = await mkdtemp(path.join(tmpdir(), 'photontax-fcp-'));
  const server = await serveGzipped(routes);
  const port = 9333 + (process.pid % 500);

  const child = spawn(edge, [
    '--headless=new',
    '--window-size=1280,900',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank',
  ], { stdio: 'ignore' });

  /** @type {Cdp|null} */
  let browser = null;
  try {
    const version = await waitForDevTools('http://127.0.0.1:' + port + '/json/version');
    browser = new Cdp(version.webSocketDebuggerUrl);
    await browser.ready();

    const loads = [];
    for (let i = 0; i < runs; i += 1) loads.push(await oneColdLoad(browser, server.origin, throttled));
    const samples = loads.map((l) => l.fcpMs);
    const sorted = [...samples].sort((a, b) => a - b);
    const median = (pick) => {
      const xs = loads.map(pick).sort((a, b) => a - b);
      return xs[Math.floor(xs.length / 2)];
    };
    return {
      samples,
      loads,
      medianMs: sorted[Math.floor(sorted.length / 2)],
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
      medianResponseStartMs: median((l) => l.responseStartMs),
      medianResponseEndMs: median((l) => l.responseEndMs),
      medianDomInteractiveMs: median((l) => l.domInteractiveMs),
      throttled,
      transferredBytes: gzipped.length,
      deferredBytes,
      totalBytes: gzipped.length + deferredBytes,
      observedTransferSize: loads[0].transferSize,
      observedDecodedSize: loads[0].decodedBodySize,
      appTextLength: loads[0].appTextLength,
    };
  } finally {
    if (browser) browser.close();
    child.kill();
    await server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

async function run() {
  const argv = process.argv;
  const runsAt = argv.indexOf('--runs');
  const runs = runsAt > -1 ? Number(argv[runsAt + 1]) : 5;
  const throttled = !argv.includes('--unthrottled');
  const result = await measureFcp({ runs, throttled });

  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return result.medianMs <= FCP_BUDGET_MS ? 0 : 1;
  }

  say.head('first contentful paint');
  say.note('cold cache, fresh browser context per run, headless Edge');
  say.note(result.throttled
    ? 'throttle: Fast 3G, ' + FAST_3G.latencyMs + ' ms added latency, '
      + Math.round(FAST_3G.downloadBytesPerSecond) + ' B/s down'
    : 'NO THROTTLE, a reference line only. DESIGN 6.3 states the gate over Fast 3G.');
  say.note('served gzipped, ' + result.transferredBytes + ' B of critical path on the wire, '
    + result.observedDecodedSize + ' B decoded, the browser reported '
    + result.observedTransferSize + ' B transferred');
  say.note(result.deferredBytes > 0
    ? 'plus ' + result.deferredBytes + ' B of deferred globe fetched AFTER the paint, '
      + result.totalBytes + ' B total for a first visit'
    : 'no deferred asset in this build');
  say.note('samples, ms: ' + result.samples.map((s) => s.toFixed(1)).join('  '));
  say.note('median response start ' + result.medianResponseStartMs.toFixed(0)
    + ' ms, response end ' + result.medianResponseEndMs.toFixed(0)
    + ' ms, DOM interactive ' + result.medianDomInteractiveMs.toFixed(0) + ' ms');
  say.note('the app region held ' + result.appTextLength + ' characters of text after load');

  const median = result.medianMs;
  if (median <= FCP_BUDGET_MS) {
    say.pass('first contentful paint ' + median.toFixed(0) + ' ms, median of ' + result.samples.length
      + ', against the ' + FCP_BUDGET_MS + ' ms budget');
    return 0;
  }
  say.fail('first contentful paint ' + median.toFixed(0) + ' ms, median of ' + result.samples.length
    + ', over the ' + FCP_BUDGET_MS + ' ms budget of DESIGN 6.3. On a single request page the '
    + 'floor is the round trip plus the transfer: ' + FAST_3G.latencyMs + ' ms plus '
    + (result.transferredBytes / FAST_3G.downloadBytesPerSecond * 1000).toFixed(0) + ' ms for '
    + result.transferredBytes + ' B. This number comes down when the payload does.');
  return 1;
}

if (isMain(import.meta.url)) {
  const failures = await run();
  console.log(failures === 0 ? '\nfcp: PASS' : '\nfcp: FAIL');
  process.exit(failures);
}
