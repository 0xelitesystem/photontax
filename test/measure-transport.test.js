// The transport layer, and the property the whole flagship network rule rests on: the set of
// hosts written as literals in src/measure MUST equal the set declared as reachable.
//
// DESIGN trap 1, INTERFACES 9. The gate reads literals. A call assembled from a variable is a
// request the gate cannot see, so this file runs the gate own scanner over the engine source
// and asserts the two sets are equal. If someone later replaces the frozen probe table with a
// string concatenation, this test goes red before the gate does.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { MEASUREMENT_HOSTS } from '../src/core/data/endpoints.js';
import {
  PROBES, ALL_REACHABLE_HOSTS, NON_MEASUREMENT_HOSTS, PROBE_INIT,
  REQUEST_TIMEOUT_MS, TRACE_PATH, probeFor, deadline,
} from '../src/measure/transport.js';
import { hostsUsedInCode, NON_MEASUREMENT_HOSTS as GATE_NON_MEASUREMENT, ALL_DECLARED_HOSTS } from '../scripts/gate-csp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEASURE_DIR = path.join(HERE, '..', 'src', 'measure');

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
    const banned = [
      [/new\s+Image\s*\(/, 'an image element used as a request'],
      [/\.src\s*=\s*['"`]https?:/, 'an element src assigned an absolute URL'],
      [/navigator\.sendBeacon\s*\(/, 'sendBeacon'],
      [/new\s+EventSource\s*\(/, 'EventSource'],
      [/new\s+WebSocket\s*\(/, 'a socket'],
      [/new\s+XMLHttpRequest\s*\(/, 'the older request object'],
      [/import\s*\(\s*['"`]https?:/, 'a remote dynamic import'],
    ];
    for (const [re, what] of banned) {
      assert.equal(re.test(src), false, 'the engine contains ' + what + ', which is a request the gate cannot see');
    }
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
