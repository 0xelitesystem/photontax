// The transport layer, and the property the whole flagship network rule rests on: the set of
// hosts written as literals in src/measure MUST equal the set declared as reachable.
//
// DESIGN trap 1, INTERFACES 9. The gate reads literals. A call assembled from a variable is a
// request the gate cannot see, so this file runs the gate own scanner over the engine source
// and asserts the two sets are equal. If someone later replaces the frozen probe table with a
// string concatenation, this test goes red before the gate does.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { MEASUREMENT_HOSTS } from '../src/core/data/endpoints.js';
import {
  PROBES, ALL_REACHABLE_HOSTS, NON_MEASUREMENT_HOSTS, PROBE_INIT,
  REQUEST_TIMEOUT_MS, TRACE_PATH, probeFor, deadline,
} from '../src/measure/transport.js';
import {
  hostsUsedInCode, nodeNetworkFindings, NODE_TRANSPORT_MODULE,
  NON_MEASUREMENT_HOSTS as GATE_NON_MEASUREMENT, ALL_DECLARED_HOSTS,
} from '../scripts/gate-csp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const MEASURE_DIR = path.join(HERE, '..', 'src', 'measure');
const CLI_DIR = path.join(REPO, 'src', 'cli');
const CLI_TRANSPORT = path.join(REPO, ...NODE_TRANSPORT_MODULE.split('/'));

/**
 * Every script under src/cli, recursively, as {rel, text}. Empty until the command line exists,
 * which is what makes the command line tests below vacuous today and binding the moment a file
 * lands there. They are written before the transport on purpose.
 * @returns {{rel:string, text:string}[]}
 */
function cliFiles() {
  if (!existsSync(CLI_DIR)) return [];
  return readdirSync(CLI_DIR, { recursive: true })
    .map((f) => String(f))
    .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
    .sort()
    .map((f) => ({
      rel: path.relative(REPO, path.join(CLI_DIR, f)).split(path.sep).join('/'),
      text: readFileSync(path.join(CLI_DIR, f), 'utf8'),
    }));
}

/** The browser side channels, shared by the engine test and the command line test. */
const BROWSER_SIDE_CHANNELS = [
  [/new\s+Image\s*\(/, 'an image element used as a request'],
  [/\.src\s*=\s*['"`]https?:/, 'an element src assigned an absolute URL'],
  [/navigator\.sendBeacon\s*\(/, 'sendBeacon'],
  [/new\s+EventSource\s*\(/, 'EventSource'],
  [/new\s+WebSocket\s*\(/, 'a socket'],
  [/new\s+XMLHttpRequest\s*\(/, 'the older request object'],
  [/import\s*\(\s*['"`]https?:/, 'a remote dynamic import'],
];

const engineSource = () => readdirSync(MEASURE_DIR)
  .filter((f) => f.endsWith('.js'))
  .sort()
  .map((f) => readFileSync(path.join(MEASURE_DIR, f), 'utf8'))
  .join('\n');

describe('declared destinations', () => {
  test('the engine reaches exactly the hosts the product declares, no more and no fewer', () => {
    const used = hostsUsedInCode(engineSource());
    assert.deepEqual(used, [...ALL_DECLARED_HOSTS],
      'the set of literal fetch hosts in src/measure must equal the declared set. A host in '
      + 'either set and missing from the other is a build failure at ship time.');
  });

  test('the local mirror of the non measurement host list matches the gate', () => {
    assert.deepEqual([...NON_MEASUREMENT_HOSTS], [...GATE_NON_MEASUREMENT],
      'transport.js duplicates this list because scripts/ does not ship to the browser. '
      + 'This test is what stops the duplicate from drifting.');
  });

  test('there is one probe per measurement host and no extras', () => {
    assert.deepEqual(Object.keys(PROBES).sort(), [...MEASUREMENT_HOSTS].sort());
    assert.equal(Object.keys(PROBES).length, 12);
  });

  test('every reachable host is either a measurement endpoint or the one facility endpoint', () => {
    assert.equal(ALL_REACHABLE_HOSTS.length, 13);
    for (const h of ALL_REACHABLE_HOSTS) {
      assert.ok(MEASUREMENT_HOSTS.includes(h) || NON_MEASUREMENT_HOSTS.includes(h), h);
    }
  });

  test('probeFor refuses a host that is not declared, and cannot build a URL for one', () => {
    assert.equal(probeFor('evil.example'), undefined);
    assert.equal(probeFor('dynamodb.us-east-2.amazonaws.com'), undefined);
    assert.equal(typeof probeFor('dynamodb.us-east-1.amazonaws.com'), 'function');
  });

  test('no side channel construct appears anywhere in the engine', () => {
    const src = engineSource();
    for (const [re, what] of BROWSER_SIDE_CHANNELS) {
      assert.equal(re.test(src), false, 'the engine contains ' + what + ', which is a request the gate cannot see');
    }
  });

  test('no Node network construct appears anywhere in the engine, which the page also runs', () => {
    for (const f of readdirSync(MEASURE_DIR).filter((x) => x.endsWith('.js'))) {
      const rel = 'src/measure/' + f;
      assert.deepEqual(nodeNetworkFindings(rel, readFileSync(path.join(MEASURE_DIR, f), 'utf8')), [], rel);
    }
  });
});

/* ============================================================================================
 * v0.2: the command line. There is no CSP outside a browser, so these assertions and the gate
 * are the allowlist. Vacuous until src/cli exists; binding from the first file placed there.
 * ========================================================================================== */

describe('declared destinations, command line', () => {
  test('no file under src/cli reaches the network except the one transport module, and that one only in the readable form', () => {
    for (const f of cliFiles()) {
      assert.deepEqual(nodeNetworkFindings(f.rel, f.text), [], f.rel);
      for (const [re, what] of BROWSER_SIDE_CHANNELS) {
        assert.equal(re.test(f.text), false, f.rel + ' contains ' + what);
      }
    }
  });

  test('every host the command line names in a request is a declared measurement host', () => {
    // The command line never asks the facility endpoint: the observer is always a city the user
    // names, so the only hosts it may reach are the twelve measurement endpoints.
    const used = hostsUsedInCode(cliFiles().map((f) => f.text).join('\n'));
    for (const h of used) assert.ok(MEASUREMENT_HOSTS.includes(h), h + ' is not a measurement host');
    if (!existsSync(CLI_TRANSPORT)) {
      assert.deepEqual(used, [], 'no transport module exists yet, so nothing under src/cli may name a host');
    }
  });

  test('the transport names each measurement host exactly once, as a literal under its own key', () => {
    if (!existsSync(CLI_TRANSPORT)) {
      // Vacuous today, and stated rather than skipped: nothing under src/cli opens a connection.
      assert.ok(cliFiles().every((f) => nodeNetworkFindings(f.rel, f.text).length === 0
        && !/\bhttps?\.(?:request|get)\s*\(/.test(f.text)));
      return;
    }
    const text = readFileSync(CLI_TRANSPORT, 'utf8');
    assert.deepEqual(hostsUsedInCode(text), [...MEASUREMENT_HOSTS].sort(),
      'the literal hosts in the transport must be exactly the twelve measurement hosts');
    const calls = [...text.matchAll(/\bhttps\.(?:request|get)\s*\(\s*[`'"]https:\/\/([^`'"/]+)/g)];
    assert.equal(calls.length, MEASUREMENT_HOSTS.length, 'one literal request per host, no more');
    for (const m of calls) {
      // The dispatch key nearest before each literal must be that literal's own host, so a
      // table row cannot send one region's key to another region's address.
      const before = text.slice(Math.max(0, m.index - 240), m.index);
      const keys = [...before.matchAll(/['"]([a-z0-9.-]+\.amazonaws\.com)['"]\s*:/g)];
      assert.ok(keys.length > 0, 'no dispatch key before the literal for ' + m[1]);
      assert.equal(keys[keys.length - 1][1], m[1], 'a dispatch key points at another host');
    }
  });

  test('the transport exports a frozen probe table whose keys are exactly the measurement hosts', async () => {
    if (!existsSync(CLI_TRANSPORT)) return;
    const mod = await import(pathToFileURL(CLI_TRANSPORT).href);
    assert.equal(typeof mod.NODE_PROBES, 'object', NODE_TRANSPORT_MODULE + ' must export NODE_PROBES');
    assert.ok(Object.isFrozen(mod.NODE_PROBES));
    assert.deepEqual(Object.keys(mod.NODE_PROBES).sort(), [...MEASUREMENT_HOSTS].sort());
    for (const h of MEASUREMENT_HOSTS) assert.equal(typeof mod.NODE_PROBES[h], 'function', h);
  });

  test('the page engine and the command line together still reach exactly the declared set', () => {
    const all = engineSource() + '\n' + cliFiles().map((f) => f.text).join('\n');
    assert.deepEqual(hostsUsedInCode(all), [...ALL_DECLARED_HOSTS]);
  });
});

describe('the request options', () => {
  test('credentials are omitted, which is how the no cookie promise survives a set-cookie', () => {
    // The facility endpoint offers a __cf_bm cookie. With credentials omitted the browser
    // neither stores it nor sends one back, so the promise is kept by the request rather than
    // by hoping the far end changes.
    assert.equal(PROBE_INIT.credentials, 'omit');
  });

  test('the cache is bypassed, because a cached response is not a round trip', () => {
    assert.equal(PROBE_INIT.cache, 'no-store');
  });

  test('a redirect is an error, because a followed redirect is two round trips reported as one', () => {
    assert.equal(PROBE_INIT.redirect, 'error');
  });

  test('the response must be readable, so the resolution time is pinned to the response arriving', () => {
    assert.equal(PROBE_INIT.mode, 'cors');
  });

  test('nothing about the page is sent to the endpoint', () => {
    assert.equal(PROBE_INIT.referrerPolicy, 'no-referrer');
  });

  test('no custom header is set, so no preflight is added to the measurement', () => {
    assert.equal('headers' in PROBE_INIT, false,
      'a custom header makes this a non simple cross origin request, and the preflight it '
      + 'triggers would be a second round trip inside the number');
  });

  test('the request options are frozen, so one call cannot measure differently from another', () => {
    assert.ok(Object.isFrozen(PROBE_INIT));
  });

  test('the facility path is the documented public one', () => {
    assert.equal(TRACE_PATH, '/cdn-cgi/trace');
  });

  test('there is a stated time limit rather than an open ended wait', () => {
    assert.ok(Number.isFinite(REQUEST_TIMEOUT_MS) && REQUEST_TIMEOUT_MS > 0);
  });
});

describe('the deadline', () => {
  test('fires on its own timer and reports that it did', async () => {
    const d = deadline(5);
    await new Promise((r) => { setTimeout(r, 30); });
    assert.equal(d.signal.aborted, true);
    assert.equal(d.timedOut(), true);
    d.cancel();
  });

  test('fires when an upstream signal aborts, and does not claim a timeout', () => {
    const upstream = new AbortController();
    const d = deadline(10000, upstream.signal);
    upstream.abort();
    assert.equal(d.signal.aborted, true);
    assert.equal(d.timedOut(), false);
    d.cancel();
  });

  test('is already aborted when the upstream signal aborted first', () => {
    const upstream = new AbortController();
    upstream.abort();
    const d = deadline(10000, upstream.signal);
    assert.equal(d.signal.aborted, true);
    d.cancel();
  });

  test('cancel releases the timer, so a finished run leaves nothing pending', async () => {
    const d = deadline(10);
    d.cancel();
    await new Promise((r) => { setTimeout(r, 30); });
    assert.equal(d.signal.aborted, false);
  });
});
