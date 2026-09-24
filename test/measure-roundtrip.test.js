// The warm HTTPS round trip sampler. DESIGN 2.1, traps 4, 5, 9, 13.
//
// No socket is opened anywhere in this file. The transport and the clock are both injected, so
// these tests assert the METHOD rather than the weather on the day they ran.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { WARM_SAMPLE_COUNT, SAMPLE_SPREAD_UNSTABLE_MS } from '../src/core/constants.js';
import { endpointById } from '../src/core/data/endpoints.js';
import { assertEndpointMeasurement } from '../src/core/contracts/measurement.js';
import { measureEndpoint, takeSample, classifyFailure } from '../src/measure/roundtrip.js';
import { FAILURE_REASONS } from '../src/measure/reasons.js';

const EP = endpointById('aws:ap-south-1');

/**
 * A clock that returns the scripted pairs. Each sample reads it twice: once before the request
 * and once after the body has been read.
 * @param {number[]} durations One entry per request, warm up included.
 */
function scriptedClock(durations) {
  /** @type {number[]} */
  const readings = [];
  let t = 1000;
  for (const d of durations) {
    readings.push(t);
    t += d;
    readings.push(t);
    t += 0.25;                       // a gap between requests, which no sample may include
  }
  let i = 0;
  return () => {
    if (i >= readings.length) throw new Error('clock read more times than the script allows');
    const v = readings[i];
    i += 1;
    return v;
  };
}

/** A probe that always answers with the 42 byte fixed body. */
const okProbe = () => Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(42) });

/** A probe that answers n times and then rejects the way a blocked request does. */
function probeFailingAfter(n) {
  let calls = 0;
  return () => {
    calls += 1;
    if (calls > n) return Promise.reject(new TypeError('Failed to fetch'));
    return okProbe();
  };
}

const probeFor = (probe) => () => probe;

describe('the method', () => {
  test('the warm up response is discarded and never appears among the samples', async () => {
    // The warm up takes 500 ms, which is what a connection setup looks like. If it leaked into
    // the samples it would be both the maximum and a 490 ms spread, and neither appears.
    const durations = [500, 20, 21, 22, 23, 24, 25, 26];
    const r = await measureEndpoint(EP, { probeFor: probeFor(okProbe), now: scriptedClock(durations) });

    assert.equal(r.samplesMs.length, WARM_SAMPLE_COUNT);
    assert.deepEqual(r.samplesMs, [20, 21, 22, 23, 24, 25, 26]);
    assert.equal(r.samplesMs.includes(500), false, 'the connection setup cost reached the samples');
    assert.equal(r.status, 'ok');
    assert.doesNotThrow(() => assertEndpointMeasurement(r));
  });

  test('the reported number is the minimum, not the mean and not the last', async () => {
    const durations = [400, 31, 30, 90, 30.5, 61, 33, 44];
    const r = await measureEndpoint(EP, { probeFor: probeFor(okProbe), now: scriptedClock(durations) });
    const mean = r.samplesMs.reduce((s, x) => s + x, 0) / r.samplesMs.length;

    assert.equal(r.roundTripMs, 30);
    assert.equal(r.roundTripMs, Math.min(...r.samplesMs));
    assert.ok(mean > r.roundTripMs + 10, 'the mean carries the contamination the minimum removes');
  });

  test('the spread is the max minus the min, and a wide spread is reported as unstable', async () => {
    const durations = [400, 30, 30, 30, 30, 30, 30, 30 + SAMPLE_SPREAD_UNSTABLE_MS + 0.5];
    const r = await measureEndpoint(EP, { probeFor: probeFor(okProbe), now: scriptedClock(durations) });

    assert.equal(r.status, 'unstable');
    assert.ok(r.spreadMs > SAMPLE_SPREAD_UNSTABLE_MS);
    assert.equal(r.spreadMs, Math.max(...r.samplesMs) - Math.min(...r.samplesMs));
    assert.doesNotThrow(() => assertEndpointMeasurement(r),
      'an unstable row is still a valid row: it shows its spread instead of a single number');
  });

  test('a spread exactly at the limit is still stable, so the boundary is not guesswork', async () => {
    const durations = [400, 30, 30, 30, 30, 30, 30, 30 + SAMPLE_SPREAD_UNSTABLE_MS];
    const r = await measureEndpoint(EP, { probeFor: probeFor(okProbe), now: scriptedClock(durations) });
    assert.equal(r.spreadMs, SAMPLE_SPREAD_UNSTABLE_MS);
    assert.equal(r.status, 'ok');
  });

  test('a sample covers the response body, not just the response head', async () => {
    let bodyRead = false;
    const probe = () => Promise.resolve({
      ok: true,
      arrayBuffer: async () => { bodyRead = true; return new ArrayBuffer(42); },
    });
    await measureEndpoint(EP, { probeFor: probeFor(probe), now: scriptedClock(new Array(8).fill(10)) });
    assert.equal(bodyRead, true, 'stopping the clock at the response head reports part of a round trip as all of it');
  });

  test('exactly one warm up plus the required samples are requested, and no more', async () => {
    let calls = 0;
    const probe = () => { calls += 1; return okProbe(); };
    await measureEndpoint(EP, { probeFor: probeFor(probe), now: scriptedClock(new Array(8).fill(12)) });
    assert.equal(calls, WARM_SAMPLE_COUNT + 1);
  });

  test('a coordinate only row is refused rather than measured', async () => {
    const coordinateOnly = { id: 'gcp:asia-south1', measurementHost: null, measured: false };
    await assert.rejects(() => measureEndpoint(coordinateOnly, { probeFor: probeFor(okProbe) }),
      /coordinate only row/);
  });
});

describe('what happens when it does not work', () => {
  test('a refused warm up is a stated blocked row with no number at all', async () => {
    const probe = probeFailingAfter(0);
    const r = await measureEndpoint(EP, { probeFor: probeFor(probe), now: scriptedClock([10]) });

    assert.equal(r.status, 'blocked');
    assert.equal(r.roundTripMs, null, 'never a zero and never a spinner');
    assert.equal(r.spreadMs, null);
    assert.deepEqual(r.samplesMs, []);
    assert.equal(r.failureReason, FAILURE_REASONS.REQUEST_REFUSED);
    assert.doesNotThrow(() => assertEndpointMeasurement(r));
  });

  test('the refusal sentence names every cause a page cannot tell apart', async () => {
    const reason = FAILURE_REASONS.REQUEST_REFUSED;
    for (const phrase of ['extension', 'policy', 'cross origin', 'could not be reached']) {
      assert.ok(reason.includes(phrase), 'the stated reason omits: ' + phrase);
    }
  });

  test('a run that dies part way through the samples produces no partial minimum', async () => {
    const probe = probeFailingAfter(4);            // warm up plus three samples, then refused
    const r = await measureEndpoint(EP, { probeFor: probeFor(probe), now: scriptedClock([10, 11, 12, 13, 14]) });

    assert.equal(r.roundTripMs, null);
    assert.equal(r.failureReason, FAILURE_REASONS.INCOMPLETE_SAMPLES);
    assert.equal(r.status, 'blocked');
  });

  test('a timeout is a stated failure, distinguished from a refusal because we fired it', async () => {
    const probe = (init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      }, { once: true });
    });
    const r = await measureEndpoint(EP, { probeFor: probeFor(probe), timeoutMs: 5, now: scriptedClock([1]) });

    assert.equal(r.status, 'failed');
    assert.equal(r.failureReason, FAILURE_REASONS.TIMED_OUT);
    assert.equal(r.roundTripMs, null);
  });

  test('a cancelled run says it was cancelled rather than blaming the network', async () => {
    const control = new AbortController();
    const probe = (init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      }, { once: true });
    });
    const run = measureEndpoint(EP, { probeFor: probeFor(probe), signal: control.signal, now: scriptedClock([1]) });
    control.abort();
    const r = await run;

    assert.equal(r.status, 'failed');
    assert.equal(r.failureReason, FAILURE_REASONS.CANCELLED);
  });

  test('a response whose body cannot be read is discarded rather than timed', async () => {
    const probe = () => Promise.resolve({ ok: true, arrayBuffer: async () => { throw new Error('stream broke'); } });
    const r = await measureEndpoint(EP, { probeFor: probeFor(probe), now: scriptedClock([10]) });

    assert.equal(r.status, 'failed');
    assert.equal(r.failureReason, FAILURE_REASONS.BODY_UNREADABLE);
  });

  test('a clock that runs backwards produces no sample, rather than a zero', async () => {
    // A monotonic clock cannot do this. The fallback wall clock can, and a clamp to zero here
    // would travel all the way to the screen wearing a MEASURED badge.
    const readings = [1000, 990];
    let i = 0;
    const r = await takeSample(okProbe, { now: () => readings[i++], timeoutMs: 1000 });
    assert.equal(r.kind, 'failed');
    assert.equal(r.reason, FAILURE_REASONS.BODY_UNREADABLE);
  });

  test('a browser that blocks requests to other sites blocks every endpoint the same way', async () => {
    // Exactly what a privacy extension or a strict third party request setting produces: the
    // fetch rejects with one opaque error and no response ever exists.
    const probe = () => Promise.reject(new TypeError('Failed to fetch'));
    const rows = [];
    for (const id of ['aws:ap-south-1', 'aws:eu-central-1', 'aws:sa-east-1']) {
      rows.push(await measureEndpoint(endpointById(id), { probeFor: probeFor(probe), now: scriptedClock([1]) }));
    }
    assert.ok(rows.every((r) => r.status === 'blocked'));
    assert.ok(rows.every((r) => r.roundTripMs === null));
    assert.ok(rows.every((r) => typeof r.failureReason === 'string' && r.failureReason.length > 0));
  });
});

describe('failure classification', () => {
  test('our own timer is a timeout', () => {
    assert.deepEqual(classifyFailure(new TypeError('x'), true, false),
      { status: 'failed', reason: FAILURE_REASONS.TIMED_OUT });
  });

  test('a cancelled run outranks a timeout, because the reader stopped it', () => {
    assert.deepEqual(classifyFailure(new TypeError('x'), true, true),
      { status: 'failed', reason: FAILURE_REASONS.CANCELLED });
  });

  test('anything else is blocked, and the sentence refuses to pick one cause', () => {
    assert.deepEqual(classifyFailure(new TypeError('Failed to fetch'), false, false),
      { status: 'blocked', reason: FAILURE_REASONS.REQUEST_REFUSED });
  });
});

/* ============================================================================================
 * v0.2: an injected failure classifier, for a platform that can name the cause a browser hides.
 * The default must stay the page's behaviour exactly; these tests pin both halves.
 * ========================================================================================== */

describe('an injected failure classifier', () => {
  /** A Node style error: the platform exposes a code, which a browser never does. */
  const refused = () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  const NAMED = 'The endpoint refused the connection. (test sentence)';

  /** A classifier that records every call and names the cause from the error code. */
  function recording() {
    /** @type {{err:unknown, deadlineFired:boolean, runCancelled:boolean}[]} */
    const calls = [];
    const classify = (err, deadlineFired, runCancelled) => {
      calls.push({ err, deadlineFired, runCancelled });
      if (runCancelled) return { status: 'failed', reason: 'cancelled (test sentence)' };
      if (deadlineFired) return { status: 'failed', reason: 'deadline (test sentence)' };
      return { status: 'blocked', reason: NAMED };
    };
    return { calls, classify };
  }

  /** A probe that answers n times, then rejects with the given error. */
  function probeRejectingAfter(n, makeErr) {
    let calls = 0;
    return () => {
      calls += 1;
      return calls > n ? Promise.reject(makeErr()) : okProbe();
    };
  }

  test('omitted, the page sentences are exactly what they were', async () => {
    const warm = await measureEndpoint(EP, { probeFor: probeFor(probeRejectingAfter(0, refused)), now: scriptedClock([10]) });
    assert.deepEqual(warm, {
      endpointId: EP.id, host: EP.measurementHost, samplesMs: [], roundTripMs: null, spreadMs: null,
      status: 'blocked', failureReason: FAILURE_REASONS.REQUEST_REFUSED,
    });
    const mid = await measureEndpoint(EP, { probeFor: probeFor(probeRejectingAfter(4, refused)), now: scriptedClock([10, 11, 12, 13, 14]) });
    assert.equal(mid.status, 'blocked');
    assert.equal(mid.failureReason, FAILURE_REASONS.INCOMPLETE_SAMPLES);
  });

  test('given classifyFailure itself, the behaviour is identical to omitting it', async () => {
    for (const n of [0, 4]) {
      const clock = [10, 11, 12, 13, 14];
      const a = await measureEndpoint(EP, { probeFor: probeFor(probeRejectingAfter(n, refused)), now: scriptedClock(clock) });
      const b = await measureEndpoint(EP, { probeFor: probeFor(probeRejectingAfter(n, refused)), now: scriptedClock(clock), classifyFailure });
      assert.deepEqual(b, a, 'after ' + n + ' answers');
    }
  });

  test('the default still refuses to name a cause, even when the error carries one', () => {
    // This is why the injection exists: the page's classifier is right for a browser and would
    // throw away a cause that another platform states plainly.
    assert.deepEqual(classifyFailure(refused(), false, false),
      { status: 'blocked', reason: FAILURE_REASONS.REQUEST_REFUSED });
  });

  test('injected, it receives the thrown error itself and its sentence lands on the row', async () => {
    const r = recording();
    const row = await measureEndpoint(EP, {
      probeFor: probeFor(probeRejectingAfter(0, refused)), now: scriptedClock([10]), classifyFailure: r.classify,
    });
    assert.equal(r.calls.length, 1);
    assert.equal(/** @type {any} */ (r.calls[0].err).code, 'ECONNREFUSED');
    assert.equal(r.calls[0].deadlineFired, false);
    assert.equal(r.calls[0].runCancelled, false);
    assert.equal(row.status, 'blocked');
    assert.equal(row.failureReason, NAMED);
    assert.equal(row.roundTripMs, null, 'a named failure is still never a number');
    assert.doesNotThrow(() => assertEndpointMeasurement(row));
  });

  test('injected, a failed warm sample carries the named cause, and still no partial minimum', async () => {
    const r = recording();
    const row = await measureEndpoint(EP, {
      probeFor: probeFor(probeRejectingAfter(4, refused)), now: scriptedClock([10, 11, 12, 13, 14]), classifyFailure: r.classify,
    });
    assert.equal(row.failureReason, NAMED);
    assert.equal(row.roundTripMs, null);
    assert.deepEqual(row.samplesMs, []);
    assert.doesNotThrow(() => assertEndpointMeasurement(row));
  });

  test('injected, our own deadline and a cancelled run still reach it as the two flags', async () => {
    const hang = (init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      }, { once: true });
    });
    const timed = recording();
    const t = await measureEndpoint(EP, { probeFor: probeFor(hang), timeoutMs: 5, now: scriptedClock([1]), classifyFailure: timed.classify });
    assert.equal(timed.calls[0].deadlineFired, true);
    assert.equal(t.failureReason, 'deadline (test sentence)');

    const control = new AbortController();
    const stopped = recording();
    const pending = measureEndpoint(EP, { probeFor: probeFor(hang), signal: control.signal, now: scriptedClock([1]), classifyFailure: stopped.classify });
    control.abort();
    const s = await pending;
    assert.equal(stopped.calls[0].runCancelled, true);
    assert.equal(s.failureReason, 'cancelled (test sentence)');
  });

  test('a body that breaks is still the fixed body sentence, because nothing was thrown to classify', async () => {
    const r = recording();
    const probe = () => Promise.resolve({ ok: true, arrayBuffer: async () => { throw new Error('stream broke'); } });
    const row = await measureEndpoint(EP, { probeFor: probeFor(probe), now: scriptedClock([10]), classifyFailure: r.classify });
    assert.equal(row.failureReason, FAILURE_REASONS.BODY_UNREADABLE);
    assert.equal(r.calls.length, 0);
  });

  test('the whole engine reaches it through deps.measureEndpoint, with run.js unchanged', async () => {
    const { measure } = await import('../src/measure/index.js');
    const { cityById } = await import('../src/ui/citypicker.js');
    const r = recording();
    const out = await measure({
      pickedCity: cityById('aws:eu-central-1'),
      deps: {
        probeFor: () => () => Promise.reject(refused()),
        now: () => 0,
        measureEndpoint: (e, d) => measureEndpoint(e, { ...d, classifyFailure: r.classify }),
      },
    });
    assert.equal(out.measurement.endpoints.length, 12);
    assert.ok(out.measurement.endpoints.every((e) => e.status === 'blocked' && e.failureReason === NAMED));
    assert.equal(r.calls.length, 12, 'one warm up per endpoint, then nothing more');
  });
});
