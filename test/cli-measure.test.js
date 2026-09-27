// The measure command, end to end: main() -> the real engine -> the real command line transport
// code -> an in memory pool standing in for node:https. No socket and no network: the transport
// is created with startFor and agentFor from test/helpers/cli-io.mjs, and every request is
// recorded, so the plan's count can be held against the requests actually made.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../src/cli/main.js';
import {
  environmentFacts, PROXY_VARIABLES, measureExitCode, buildReport, printReport,
} from '../src/cli/report.js';
import { createNodeTransport } from '../src/cli/transport.js';
import { cliPlan, scriptedRun } from '../src/cli/commands.js';
import { createOut } from '../src/cli/out.js';
import { t } from '../src/cli/parts.js';
import { pickableCities } from '../src/ui/citypicker.js';
import { COPY, EXIT, JSON_SCHEMA, userAgentFor } from '../src/cli/copy.js';
import { CLI_FAILURE_REASONS } from '../src/cli/reasons.js';
import { MEASURED_ENDPOINTS, MEASUREMENT_HOSTS, endpointById } from '../src/core/data/endpoints.js';
import { REGION_COORDINATE_DISCLAIMER } from '../src/core/data/disclaimers.js';
import { VERDICT_TEXT, RATIO_SUPPRESSED_REASON } from '../src/core/contracts/decomposition.js';
import { EXCLUSION_REASONS, RUN_NOTICES } from '../src/measure/reasons.js';
import { METHODS } from '../src/core/claim.js';
import { greatCircleKm } from '../src/core/geo.js';
import { floorMsForDistanceKm, REQUESTS_PER_ENDPOINT } from '../src/core/constants.js';
import { captureStream, memoryNetwork } from './helpers/cli-io.mjs';

const OBSERVER = /** @type {any} */ (endpointById('aws:us-east-1'));
/** @param {string} host */
const endpointOf = (host) => /** @type {any} */ (MEASURED_ENDPOINTS.find((e) => e.measurementHost === host));
/** @param {string} host */
const floorOf = (host) => floorMsForDistanceKm(greatCircleKm(OBSERVER, endpointOf(host)));
const ACCESS_MS = 10;
/** Every endpoint but the observer's own carries this much route, so the baseline has one setter. */
const BASE_ROUTE = 2;

/** @param {string} region @param {Record<string, number>} route */
const routeOf = (region, route) => (region === 'us-east-1' ? 0 : BASE_ROUTE + (route[region] || 0));

/**
 * A run the arithmetic can predict: each response takes that endpoint's floor, plus a fixed
 * access cost, plus the route surplus given for its region.
 * @param {Record<string, number>} route region code -> route surplus in ms
 * @param {(host:string, index:number) => object|undefined} [extra]
 */
function predictable(route = {}, extra = () => undefined) {
  return memoryNetwork({
    behaviour: (host, index) => ({
      ms: floorOf(host) + ACCESS_MS + routeOf(endpointOf(host).region, route),
      phases: { dnsMs: 3, tcpMs: floorOf(host) + 2, tlsMs: floorOf(host) + 3, address: '192.0.2.10', tls: 'TLSv1.3' },
      ...(extra(host, index) || {}),
    }),
  });
}

/**
 * @param {string[]} argv
 * @param {ReturnType<typeof memoryNetwork>} net
 * @param {Record<string, any>} [more]
 */
async function measureWith(argv, net, more = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  let created = 0;
  /** @type {any} */
  let transport = null;
  const { env, ...rest } = more;
  const code = await main(argv, {
    stdout,
    stderr,
    // Wide enough that no paragraph wraps, so a sentence can be looked for whole.
    env: { COLUMNS: '1000', ...(env || {}) },
    version: '0.0.0',
    onSignal: () => () => {},
    now: () => net.clock.t,
    concurrency: 1,
    createTransport: (/** @type {any} */ o) => {
      created += 1;
      assert.equal(o.userAgent, userAgentFor('0.0.0'));
      transport = createNodeTransport({ ...o, startFor: net.startFor, agentFor: net.agentFor });
      return transport;
    },
    ...rest,
  });
  return { code, out: stdout.text(), err: stderr.text(), created, transport };
}

const ARGV = ['measure', '--city', 'Ashburn, Virginia'];

describe('the plan equals the requests a run makes', () => {
  test('ninety six requests, eight to each of the twelve hosts, at the engine\'s own four at a time', async () => {
    const net = memoryNetwork();
    const stdout = captureStream();
    let transport = /** @type {any} */ (null);
    const code = await main(ARGV, {
      stdout, stderr: captureStream(), env: {}, version: '0.0.0', onSignal: () => () => {},
      createTransport: (/** @type {any} */ o) => { transport = createNodeTransport({ ...o, startFor: net.startFor, agentFor: net.agentFor }); return transport; },
    });
    assert.ok(code === EXIT.DONE || code === EXIT.FAILED);
    assert.equal(cliPlan().total, 96);
    assert.equal(net.calls.length, 96, 'probe calls made');
    assert.equal(transport.requestsMade, 96, 'requests the transport counted');
    assert.deepEqual(net.perHost(MEASUREMENT_HOSTS), MEASUREMENT_HOSTS.map(() => REQUESTS_PER_ENDPOINT));
  });

  test('every request goes to a declared measurement host, as a bare GET with the product User-Agent', async () => {
    const net = predictable();
    await measureWith(ARGV, net);
    for (const c of net.calls) {
      assert.ok(MEASUREMENT_HOSTS.includes(c.host), c.host);
      assert.equal(c.method, 'GET');
      assert.deepEqual(c.headers, { 'user-agent': userAgentFor('0.0.0') });
    }
    assert.equal(net.calls.some((c) => c.host.includes('cloudflare')), false, 'the facility endpoint is never asked');
  });

  test('the report states the count it made against the count it planned', async () => {
    const { out } = await measureWith(ARGV, predictable());
    assert.ok(out.includes(COPY.requestsMade + '96 [MEASURED]' + COPY.requestsOf + '96 [COMPUTED]' + COPY.requestsPlanned));
  });
});

describe('a complete run, in text', () => {
  const route = { 'ap-south-1': 100, 'eu-central-1': 12, 'ap-northeast-1': 4 };

  test('stderr carries the plan first, then one discrete line per endpoint, and no figure is redrawn', async () => {
    const { err } = await measureWith(ARGV, predictable(route));
    assert.ok(err.startsWith('measure makes 96 [COMPUTED] HTTPS GET requests in total'), err.slice(0, 120));
    for (const h of MEASUREMENT_HOSTS) assert.ok(err.includes(h));
    const progress = err.split('\n').filter((l) => /^ {2}\S.*\): (?:timed|not measured)/.test(l));
    assert.equal(progress.length, 12);
    assert.equal(err.includes('\r'), false);
  });

  test('stdout starts with the coordinate disclaimer, then the observer the user named', async () => {
    const { code, out } = await measureWith(ARGV, predictable(route));
    assert.equal(code, EXIT.DONE);
    assert.ok(out.startsWith(REGION_COORDINATE_DISCLAIMER.slice(0, 60)));
    assert.ok(out.includes(COPY.measureObserver + 'Ashburn, Virginia' + COPY.measureObserverClose));
    assert.ok(out.includes('39.0436 [INFERRED], -77.4875 [INFERRED]'));
  });

  test('the headline is the command line\'s own: this machine\'s access cost, never a last mile', async () => {
    const { out } = await measureWith(ARGV, predictable(route));
    const floor = floorOf('dynamodb.ap-south-1.amazonaws.com');
    const r = routeOf('ap-south-1', route);
    const total = Math.round(floor + ACCESS_MS + r);
    assert.ok(out.includes('Mumbai costs this machine ' + total + ' ms [MEASURED].'), out.slice(0, 1400));
    assert.ok(out.includes('This machine\'s access cost charges ' + ACCESS_MS + ' ms [MEASURED].'));
    assert.ok(out.includes('The route charges ' + r + ' ms [MEASURED].'));
    // No registered method describes the page's "on the table" figure, so the command line does
    // not print it, in any form.
    assert.equal(/on the table/i.test(out), false);
    assert.equal(/last mile|costs you/i.test(out), false);
    // The verdict sentences are the page's, printed verbatim, and one of them does say "Your
    // route"; the headline, which is the command line's own, never addresses a person.
    const headline = out.split('\n').find((l) => l.startsWith('Mumbai costs this machine'));
    assert.equal(/\byour?\b/i.test(/** @type {string} */ (headline)), false);
  });

  test('the access baseline names the endpoint that set it', async () => {
    const { out } = await measureWith(ARGV, predictable(route));
    assert.ok(out.includes(COPY.accessLead + 'Ashburn, Virginia (us-east-1)' + COPY.accessSame + ACCESS_MS + ' ms [MEASURED].'));
  });

  test('rows come worst route surplus first, each verdict verbatim, the short row with its sentence', async () => {
    const { out } = await measureWith(ARGV, predictable(route));
    const order = ['Mumbai (ap-south-1)', 'Frankfurt (eu-central-1)', 'Tokyo (ap-northeast-1)'].map((s) => out.indexOf('\n' + s + '\n'));
    assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
    assert.ok(out.includes(VERDICT_TEXT.ON_THE_TABLE));
    assert.ok(out.replace(/\n\s+/g, ' ').includes(VERDICT_TEXT.AT_FLOOR));
    assert.ok(out.replace(/\n\s+/g, ' ').includes('Under 500 km a fixed access cost sits on top of a near zero floor'));
  });

  test('the connection phases sidecar follows, from each warm up connection', async () => {
    const { out } = await measureWith(ARGV, predictable(route));
    const at = out.indexOf('\n' + COPY.phasesHeading + '\n');
    assert.ok(at > out.indexOf(COPY.rowsLead));
    const phases = out.slice(at);
    assert.ok(/DNS lookup time\s+3 ms \[MEASURED\]/.test(phases));
    assert.ok(/TLS version\s+TLSv1\.3 \[REPORTED\]/.test(phases));
    assert.ok(/connected address\s+192\.0\.2\.10 \[REPORTED\]/.test(phases));
    assert.ok(phases.includes(COPY.reuseHeld.slice(0, 50)));
  });

  test('self test on this run, how each figure was obtained, sources and independence close it', async () => {
    const { out } = await measureWith(ARGV, predictable(route));
    const tail = out.slice(out.indexOf(COPY.runSelfTestLead));
    assert.equal((tail.match(/^ {2}PASS /mg) || []).length, 10);
    assert.equal(tail.includes('FAIL'), false);
    assert.ok(tail.includes(COPY.methodsLead));
    assert.ok(tail.replace(/\n\s*/g, ' ').includes(METHODS.WARM_HTTPS_ROUND_TRIP));
    assert.ok(tail.includes(COPY.sourcesPointerMeasure));
    assert.ok(tail.trimEnd().endsWith('sponsored this work.'));
  });

  test('every figure on stdout carries its badge word', async () => {
    const { out } = await measureWith(ARGV, predictable(route));
    // Provenance prose states the constants of a method ("the minimum of 7 further ...", "Under
    // 500 km ...") and carries its badge at the end of the sentence, not beside each digit. Take
    // those registered sentences out, and every number left with a unit must be followed by its
    // badge word.
    let rest = out.replace(/\s+/g, ' ');
    for (const s of [...Object.values(METHODS), RATIO_SUPPRESSED_REASON]) rest = rest.split(s).join(' ');
    const unbadged = [...rest.matchAll(/(?<![\w.:-])\d+(?:\.\d+)?(?: ms| km|x)(?! \[(?:MEASURED|REPORTED|COMPUTED|INFERRED)\])/g)];
    assert.deepEqual(unbadged.map((m) => rest.slice(m.index - 20, m.index + 20)), []);
  });
});

describe('a complete run, as JSON', () => {
  test('one document, the schema named, figures at display precision, no bare number', async () => {
    const { code, out, err } = await measureWith([...ARGV, '--json'], predictable({ 'ap-south-1': 100 }));
    assert.equal(code, EXIT.DONE);
    const d = JSON.parse(out);
    assert.equal(d.schema, JSON_SCHEMA);
    assert.equal(d.command, 'measure');
    assert.equal(d.state, 'done');
    assert.ok(err.startsWith('measure makes'), 'the plan still goes to stderr');
    assert.equal(d.requests.made.value, 96);
    assert.equal(d.requests.planned.value, 96);
    assert.equal(d.endpoints.length, 12);
    assert.equal(d.phases.length, 12);
    assert.equal(d.warmSampleReuse.state, 'held');
    for (const e of d.endpoints.filter((/** @type {any} */ x) => x.status === 'ok')) {
      assert.equal(e.physics.value + e.access.value + e.route.value, e.roundTrip.value, e.endpointId);
      assert.ok(Number.isInteger(e.roundTrip.value));
    }
    const mumbai = d.endpoints.find((/** @type {any} */ x) => x.region === 'ap-south-1');
    assert.equal(mumbai.verdict.kind, 'ON_THE_TABLE');
    assert.equal(mumbai.verdict.text, VERDICT_TEXT.ON_THE_TABLE);
    assert.equal(mumbai.ratio.decimals, 2);
    const ashburn = d.endpoints.find((/** @type {any} */ x) => x.region === 'us-east-1');
    assert.deepEqual(ashburn.ratio, { suppressed: true, reason: ashburn.verdict.reason });
    assert.equal(d.headline.endpointId, 'aws:ap-south-1');
    assert.deepEqual(Object.keys(d.headline).sort(), ['access', 'endpointId', 'physics', 'roundTrip', 'route', 'sentence']);
    assert.equal(d.accessBaseline.setBy, 'aws:us-east-1');
    assert.equal(d.accessBaseline.value.value, ACCESS_MS);
    const p = d.phases.find((/** @type {any} */ x) => x.endpointId === 'aws:us-east-1');
    assert.equal(p.dnsLookup.value, 3);
    assert.equal(p.tlsVersion.value, 'TLSv1.3');
    assert.equal(p.tlsVersion.badge, 'REPORTED');
    assert.equal(p.connectedAddress.badge, 'REPORTED');
    assert.equal(JSON.stringify(d).includes('last mile'), false);
    // No figure is a bare number: every number in the document is a property of an object that
    // carries a badge, a method and the display text.
    /** @param {unknown} n @param {any} parent @param {string} at @returns {string[]} */
    const bare = (n, parent, at) => {
      if (typeof n === 'number') return parent && parent.badge && parent.method && parent.text ? [] : [at];
      if (Array.isArray(n)) return n.flatMap((x, i) => bare(x, n, at + '[' + i + ']'));
      if (n && typeof n === 'object') return Object.entries(n).flatMap(([k, v]) => bare(v, n, at + '.' + k));
      return [];
    };
    assert.deepEqual(bare(d, null, '$'), []);
  });
});

describe('a complete run, in the linear form', () => {
  test('each figure is its own sentence on its own line, with its badge word and method', async () => {
    const { out } = await measureWith([...ARGV, '--plain'], predictable({ 'ap-south-1': 100 }));
    const lines = out.split('\n');
    assert.ok(lines.some((l) => /^Mumbai costs this machine \d+ ms, MEASURED\. Warm HTTPS round trip\./.test(l)));
    assert.ok(lines.some((l) => /^Physics charges \d+ ms, COMPUTED\. Twice the great circle/.test(l)));
    assert.ok(lines.some((l) => /^This machine's access cost charges \d+ ms, MEASURED\./.test(l)));
    assert.ok(lines.some((l) => /^ {2}round trip: \d+ ms, MEASURED\./.test(l)));
    assert.ok(lines.some((l) => /^Requests made: 96, MEASURED\./.test(l)));
    assert.ok(lines.some((l) => /^Requests planned: 96, COMPUTED\./.test(l)));
    assert.equal(/\d (?:ms|km) \[(?:MEASURED|COMPUTED)\]/.test(out), false, 'no bracketed badges in the linear form');
    assert.equal(out.includes('\u001b'), false);
    // One complete sentence per figure: a line opens with a capital, a figure, a short item label
    // ("round trip: ") or the product's own name, never with a clause cut from the line above it
    // and never with a bare unit.
    for (const l of lines.map((x) => x.trim()).filter((x) => x.length > 0)) {
      assert.equal(/^(?:ms|km|km\/s|milliseconds|kilometres)\b/.test(l), false, l);
      assert.ok(/^(?:[^a-z]|[a-z]+(?: [a-z]+){0,2}: |photontax )/.test(l), l);
    }
  });
});

describe('what the run found, stated rather than hidden', () => {
  test('an unstable endpoint shows its spread and its sentence, never a round trip', async () => {
    // Sao Paulo's warm samples alternate between two values 45 ms apart: a spread over the limit.
    const jittery = () => predictable({}, (host, index) => (endpointOf(host).region === 'sa-east-1'
      ? { ms: floorOf(host) + ACCESS_MS + (index % 2 === 0 ? 0 : 45) } : undefined));
    const d = JSON.parse((await measureWith([...ARGV, '--json'], jittery())).out);
    const sp = d.endpoints.find((/** @type {any} */ x) => x.region === 'sa-east-1');
    assert.equal(sp.status, 'unstable');
    assert.equal(sp.spread.value, 45);
    assert.equal(sp.spread.badge, 'MEASURED');
    assert.deepEqual(sp.roundTrip, { suppressed: true, reason: EXCLUSION_REASONS.UNSTABLE_SPREAD });
    const text = (await measureWith(ARGV, jittery())).out;
    assert.ok(text.includes(COPY.unstableLead));
    assert.ok(text.includes('Sao Paulo (sa-east-1): spread 45 ms [MEASURED].'));
    assert.equal(/\nSao Paulo \(sa-east-1\)\n/.test(text.slice(0, text.indexOf(COPY.unstableLead))), false, 'not among the rows');
  });

  test('a faster than light result is a defect with its cause, and its round trip is not shown', async () => {
    const net = predictable({}, (host) => (endpointOf(host).region === 'ap-northeast-1' ? { ms: 5 } : undefined));
    const { out } = await measureWith([...ARGV, '--json'], net);
    const d = JSON.parse(out);
    const tokyo = d.endpoints.find((/** @type {any} */ x) => x.region === 'ap-northeast-1');
    assert.equal(tokyo.status, 'defect');
    assert.equal(tokyo.defect.reason, EXCLUSION_REASONS.FASTER_THAN_LIGHT);
    assert.equal(tokyo.roundTrip.suppressed, true);
    const text = (await measureWith(ARGV, predictable({}, (host) => (endpointOf(host).region === 'ap-northeast-1' ? { ms: 5 } : undefined)))).out;
    const defects = text.slice(text.indexOf(COPY.defectsLead), text.indexOf(COPY.phasesHeading));
    assert.ok(defects.includes('Tokyo (ap-northeast-1): physics'));
    assert.equal(/\b5 ms \[MEASURED\]/.test(text), false, 'the impossible figure is never printed');
  });

  test('a TCP connect time below the floor is a notice, not a result', async () => {
    const net = predictable({}, (host) => (endpointOf(host).region === 'eu-west-2'
      ? { phases: { dnsMs: 2, tcpMs: 1, tlsMs: 40, address: '192.0.2.99', tls: 'TLSv1.3' } } : undefined));
    const { out } = await measureWith(ARGV, net);
    const phases = out.slice(out.indexOf('\n' + COPY.phasesHeading + '\n'));
    const london = phases.slice(phases.indexOf('London (eu-west-2)'), phases.indexOf('\n\n', phases.indexOf('London (eu-west-2)')));
    assert.ok(london.includes(COPY.phaseTcpBelowFloorShort.slice(0, 20)), london);
    assert.equal(/TCP connect time\s+1 ms/.test(london), false);
    assert.ok(phases.replace(/\n/g, ' ').includes(COPY.phaseTcpBelowFloor.slice(0, 60)));
    const d = JSON.parse((await measureWith([...ARGV, '--json'], predictable({}, (host) => (endpointOf(host).region === 'eu-west-2'
      ? { phases: { dnsMs: 2, tcpMs: 1, tlsMs: 40 } } : undefined)))).out);
    const p = d.phases.find((/** @type {any} */ x) => x.endpointId === 'aws:eu-west-2');
    assert.deepEqual(p.tcpConnect, { suppressed: true, reason: COPY.phaseTcpBelowFloor });
  });

  test('happy eyeballs: a failed first attempt is counted, and excluded from the TCP time', async () => {
    const net = predictable({}, (host) => (endpointOf(host).region === 'us-east-1'
      ? { phases: { dnsMs: 1, attempts: ['2001:db8::1', '192.0.2.7'], tcpMs: 4, tlsMs: 6 } } : undefined));
    const d = JSON.parse((await measureWith([...ARGV, '--json'], net)).out);
    const p = d.phases.find((/** @type {any} */ x) => x.endpointId === 'aws:us-east-1');
    assert.equal(p.failedConnectionAttempts.value, 1);
    assert.equal(p.tcpConnect.value, 4);
    assert.equal(p.connectedAddress.value, '192.0.2.7');
  });

  test('a warm sample on a fresh socket fails that endpoint with its reason; the rest are measured', async () => {
    const net = predictable({}, (host, index) => (endpointOf(host).region === 'eu-north-1' && index === 5 ? { reused: false } : undefined));
    const { code, out } = await measureWith([...ARGV, '--json'], net);
    assert.equal(code, EXIT.DONE);
    const d = JSON.parse(out);
    const st = d.endpoints.find((/** @type {any} */ x) => x.region === 'eu-north-1');
    assert.equal(st.status, 'failed');
    assert.equal(st.failure.reason, CLI_FAILURE_REASONS.SOCKET_NOT_REUSED);
    assert.equal(d.requests.made.value, 96 - 2, 'the refused sample is counted, the two after it are never sent');
    assert.equal(d.warmSampleReuse.state, 'held', 'every endpoint that was timed rode its warm up connection');
    assert.ok(d.notices.some((/** @type {any} */ n) => n.text === RUN_NOTICES.PARTIAL_RUN));
  });

  test('nothing measured: exit 1, each endpoint states its reason, no headline and no zero', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const net = memoryNetwork({ behaviour: () => ({ error: refused }) });
    const { code, out } = await measureWith(ARGV, net);
    assert.equal(code, EXIT.FAILED);
    assert.ok(out.includes(COPY.nothingMeasured));
    assert.equal(out.includes(COPY.headlineLead), false);
    assert.equal((out.match(/The connection to this endpoint was refused\./g) || []).length, 12);
    assert.equal(/\b0 ms \[MEASURED\]/.test(out), false);
    assert.ok(out.includes(COPY.requestsMade + '12 [MEASURED]'), 'one warm up each, and no retry');
    assert.ok(out.includes(COPY.reuseNoneTimed));
    const d = JSON.parse((await measureWith([...ARGV, '--json'], memoryNetwork({ behaviour: () => ({ error: refused }) }))).out);
    assert.equal(d.state, 'nothing-measured');
    assert.equal(d.headline.suppressed, true);
    assert.ok(d.endpoints.every((/** @type {any} */ e) => e.status === 'blocked' && e.failure.reason === CLI_FAILURE_REASONS.CONNECTION_REFUSED));
    assert.ok(d.phases.every((/** @type {any} */ p) => p.connected === false));
  });
});

describe('a run whose own self test fails', () => {
  test('the exit code: 0 only for a run that measured and whose every check passed', () => {
    const ok = { passed: true };
    const bad = { passed: false };
    assert.equal(measureExitCode({ state: 'done', selfTest: [ok, ok] }), EXIT.DONE);
    assert.equal(measureExitCode({ state: 'done', selfTest: [ok, bad] }), EXIT.FAILED);
    assert.equal(measureExitCode({ state: 'nothing-measured', selfTest: [ok] }), EXIT.FAILED);
  });

  test('the report marks the check FAIL and says a check failed; a clean run says nothing of the kind', async () => {
    const { result, transport } = await scriptedRun();
    const city = pickableCities()[0];
    /** @param {any} r */
    const print = (r) => {
      const stdout = captureStream();
      const out = createOut({ stdout, stderr: captureStream(), env: { COLUMNS: '1000' } });
      printReport(out, buildReport({ result: r, city, transport, environment: environmentFacts({}) }));
      return stdout.text();
    };
    const clean = print(result);
    assert.equal(measureExitCode(result), EXIT.DONE);
    assert.equal(clean.includes(COPY.selftestSomeFailed), false);
    assert.equal(clean.includes(COPY.selftestFail), false);
    const failing = { ...result, selfTest: result.selfTest.map((x, i) => (i === 0 ? { ...x, passed: false } : x)) };
    const text = print(failing);
    assert.equal(measureExitCode(failing), EXIT.FAILED);
    assert.ok(text.includes(COPY.selftestFail + '  ' + result.selfTest[0].label), text);
    assert.ok(text.includes(COPY.selftestSomeFailed), text);
  });
});

describe('the environment', () => {
  test('the facts it reads', () => {
    assert.deepEqual(environmentFacts({}), { tlsOff: false, extraCa: false, systemCa: false, proxy: false });
    assert.equal(environmentFacts({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }).tlsOff, true);
    assert.equal(environmentFacts({ NODE_TLS_REJECT_UNAUTHORIZED: ' 0 ' }).tlsOff, true);
    assert.equal(environmentFacts({ NODE_TLS_REJECT_UNAUTHORIZED: '1' }).tlsOff, false);
    assert.equal(environmentFacts({ NODE_EXTRA_CA_CERTS: '/etc/ca.pem' }).extraCa, true);
    for (const k of PROXY_VARIABLES) assert.equal(environmentFacts({ [k]: 'http://127.0.0.1:9' }).proxy, true, k);
    assert.equal(environmentFacts({}, ['--use-env-proxy']).proxy, true);
    assert.equal(environmentFacts({ NODE_OPTIONS: '--max-old-space-size=64 --use-env-proxy' }).proxy, true);
    assert.equal(environmentFacts({ HTTPS_PROXY: '' }).proxy, false);
  });

  test('trust widened to the operating system certificate store, each way Node accepts it', () => {
    // Where an employer's TLS inspection authority lives, so each trigger is its own fact.
    assert.equal(environmentFacts({ NODE_USE_SYSTEM_CA: '1' }).systemCa, true);
    assert.equal(environmentFacts({ NODE_USE_SYSTEM_CA: '' }).systemCa, false);
    assert.equal(environmentFacts({ NODE_USE_SYSTEM_CA: '  ' }).systemCa, false);
    assert.equal(environmentFacts({}, ['--use-system-ca']).systemCa, true);
    assert.equal(environmentFacts({}, ['--use-openssl-ca']).systemCa, true);
    assert.equal(environmentFacts({ NODE_OPTIONS: '--use-system-ca' }).systemCa, true);
    assert.equal(environmentFacts({ NODE_OPTIONS: '--max-old-space-size=64 --use-openssl-ca' }).systemCa, true);
    assert.equal(environmentFacts({ NODE_OPTIONS: '--use-system-ca-x' }).systemCa, false);
    assert.equal(environmentFacts({}, ['--use-bundled-ca']).systemCa, false);
    // A separate fact from NODE_EXTRA_CA_CERTS, whose notice names that variable.
    assert.equal(environmentFacts({ NODE_USE_SYSTEM_CA: '1' }).extraCa, false);
    assert.equal(environmentFacts({ NODE_EXTRA_CA_CERTS: '/etc/ca.pem' }).systemCa, false);
  });

  test('certificate checking turned off: refused before anything is created or contacted, exit 1', async () => {
    const net = memoryNetwork();
    const r = await measureWith(ARGV, net, { env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } });
    assert.equal(r.code, EXIT.FAILED);
    assert.equal(r.created, 0);
    assert.equal(net.calls.length, 0);
    assert.equal(r.out, '');
    assert.ok(r.err.replace(/\n/g, ' ').includes(COPY.tlsRefused));
    const j = await measureWith([...ARGV, '--json'], memoryNetwork(), { env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } });
    const d = JSON.parse(j.out);
    assert.equal(d.state, 'refused');
    assert.deepEqual(d.failure, { kind: 'refused-environment', reason: COPY.tlsRefused });
  });

  test('a proxy in the environment is announced and not used: the run goes direct', async () => {
    const net = predictable();
    const r = await measureWith(ARGV, net, { env: { HTTPS_PROXY: 'http://127.0.0.1:9', NODE_USE_ENV_PROXY: '1' } });
    assert.equal(r.code, EXIT.DONE);
    assert.ok(r.err.replace(/\n/g, ' ').includes(COPY.proxyNotice));
    assert.ok(r.out.replace(/\n/g, ' ').includes(COPY.proxyNotice));
    assert.equal(net.calls.length, 96);
    assert.ok(net.calls.every((c) => MEASUREMENT_HOSTS.includes(c.host)));
  });

  test('extra certificate authorities are allowed and announced', async () => {
    const r = await measureWith([...ARGV, '--json'], predictable(), { env: { NODE_EXTRA_CA_CERTS: '/tmp/extra.pem' } });
    assert.ok(r.err.replace(/\n/g, ' ').includes(COPY.extraCaNotice));
    assert.ok(JSON.parse(r.out).notices.some((/** @type {any} */ n) => n.id === 'EXTRA_CERTIFICATE_AUTHORITIES'));
  });

  for (const [how, more] of /** @type {[string, any][]} */ ([
    ['NODE_USE_SYSTEM_CA', { env: { NODE_USE_SYSTEM_CA: '1' } }],
    ['--use-system-ca', { execArgv: ['--use-system-ca'] }],
    ['--use-openssl-ca in NODE_OPTIONS', { env: { NODE_OPTIONS: '--use-openssl-ca' } }],
  ])) {
    test('the operating system certificate store, by ' + how + ', is allowed and announced', async () => {
      const r = await measureWith([...ARGV, '--json'], predictable(), more);
      assert.equal(r.code, EXIT.DONE);
      assert.ok(r.err.replace(/\n/g, ' ').includes(COPY.systemCaNotice));
      const notices = JSON.parse(r.out).notices;
      assert.ok(notices.some((/** @type {any} */ n) => n.id === 'SYSTEM_CERTIFICATE_AUTHORITIES' && n.text === COPY.systemCaNotice));
      assert.equal(notices.some((/** @type {any} */ n) => n.id === 'EXTRA_CERTIFICATE_AUTHORITIES'), false);
    });
  }

  test('no notice about certificate stores when nothing widened trust', async () => {
    const r = await measureWith([...ARGV, '--json'], predictable(), { execArgv: [] });
    const ids = JSON.parse(r.out).notices.map((/** @type {any} */ n) => n.id);
    assert.equal(ids.includes('SYSTEM_CERTIFICATE_AUTHORITIES'), false);
    assert.equal(ids.includes('EXTRA_CERTIFICATE_AUTHORITIES'), false);
  });
});

describe('an interrupt', () => {
  test('aborts everything in flight, prints one line on stderr, reports nothing, and exits 130', async () => {
    const net = memoryNetwork({ behaviour: () => ({ hang: true }) });
    /** @type {(() => void)|null} */
    let handler = null;
    /** @type {number[]} */
    const exits = [];
    const stdout = captureStream();
    const stderr = captureStream();
    let transport = /** @type {any} */ (null);
    const running = main([...ARGV, '--json'], {
      stdout, stderr, env: {}, version: '0.0.0',
      onSignal: (sig, fn) => { assert.equal(sig, 'SIGINT'); handler = fn; return () => { handler = null; }; },
      exit: (c) => { exits.push(c); },
      timeoutMs: 60000,
      createTransport: (/** @type {any} */ o) => { transport = createNodeTransport({ ...o, startFor: net.startFor, agentFor: net.agentFor }); return transport; },
    });
    while (net.calls.length < 4) await new Promise((r) => setImmediate(r));
    const fire = /** @type {any} */ (handler);
    fire();
    fire();
    const code = await running;
    assert.equal(code, EXIT.INTERRUPTED);
    assert.deepEqual(exits, [EXIT.INTERRUPTED], 'a second interrupt ends the process at once');
    assert.equal(stdout.text(), '', 'nothing partial is reported, not even as JSON');
    assert.equal(stderr.text().split(COPY.interrupted.slice(0, 30)).length - 1, 1);
    assert.equal(transport.requestsMade, 4, 'the four in flight, and nothing started after the interrupt');
    assert.equal(handler, null, 'the handler is removed when the run ends');
  });

  test('the notice is one line at the default eighty columns', () => {
    const out = createOut({ stdout: captureStream(), stderr: captureStream(), env: {} });
    assert.equal(out.width, 80);
    assert.deepEqual(out.lines([t(COPY.interrupted)]), [COPY.interrupted]);
  });
});
