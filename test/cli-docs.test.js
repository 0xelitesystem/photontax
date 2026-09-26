// The command line as the documents describe it, held to the code. README "Command line" and
// "Privacy", USAGE chapter 9 and docs/CHANGELOG.md quote the plan, the exit codes, the options,
// the User-Agent, the JSON shapes and a handful of example places. Each of those is recomputed
// here from the module that produces it, so a change to the command line that the documents do
// not follow fails the suite instead of shipping a stale sentence. No socket is opened: the one
// measure run below goes through the real transport code over the in-memory network double.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { WARM_SAMPLE_COUNT, SAMPLE_SPREAD_UNSTABLE_MS, floorMsForDistanceKm } from '../src/core/constants.js';
import { MEASUREMENT_HOSTS, MEASURED_ENDPOINTS, endpointById } from '../src/core/data/endpoints.js';
import { ALL_REACHABLE_HOSTS } from '../src/core/data/reachable-hosts.js';
import { greatCircleKm } from '../src/core/geo.js';
import { pickableCities } from '../src/ui/citypicker.js';
import { COPY, EXIT, JSON_SCHEMA, userAgentFor } from '../src/cli/copy.js';
import { absent } from '../src/cli/json.js';
import { DEFAULT_WIDTH } from '../src/cli/out.js';
import { BODY_CAP_BYTES, NODE_PROBES, createNodeTransport } from '../src/cli/transport.js';
import { cliPlan, resolveCity, resolvePlace } from '../src/cli/commands.js';
import { COMMANDS, parseArgs, main } from '../src/cli/main.js';
import { captureStream, memoryNetwork } from './helpers/cli-io.mjs';

const read = (/** @type {string} */ name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
/** Whitespace collapsed and bold marks dropped, so a sentence is found however it was wrapped. */
const flat = (/** @type {string} */ s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ');
/** @param {string} text @param {string} from @param {string} to */
function section(text, from, to) {
  const a = text.indexOf(from);
  assert.ok(a >= 0, 'missing section ' + from);
  const b = text.indexOf(to, a + from.length);
  assert.ok(b > a, 'missing the heading after ' + from);
  return text.slice(a, b);
}

const README = read('README.md');
const USAGE = read('USAGE.md');
const CHANGELOG = read('docs/CHANGELOG.md');
const README_CLI = section(README, '\n## Command line\n', '\n## Why this exists\n');
const README_PRIVACY = section(README, '\n## Privacy\n', '\n## Run locally\n');
const USAGE_CLI = section(USAGE, '\n## 9. Command line\n', '\n## Related\n');
const WORDS = Object.freeze({ 7: 'seven', 12: 'twelve' });

describe('the plan the documents quote is the plan the command line prints', () => {
  const p = cliPlan();

  test('README: requests, endpoints, concurrency, the time limit and the longest wait', () => {
    const t = flat(README_CLI);
    assert.ok(t.includes(`It makes ${p.total} HTTPS GET requests: ${p.perEndpoint} to each of the ${p.endpoints} AWS DynamoDB regional endpoints`));
    assert.ok(t.includes(`the first of each ${p.perEndpoint} the warm up`), 'one warm up per endpoint');
    assert.equal(p.warmUp, 1);
    assert.ok(t.includes(`It works on ${p.atOnce} endpoints at once, abandons any request still running after ${p.limitMs} ms`));
    assert.ok(t.includes(`the longest a run can wait on the network is ${p.worstMs} ms`));
    assert.ok(t.includes(`| ${p.total} requests, to the hosts under`));
  });

  test('USAGE chapter 9 and the release notes', () => {
    const u = flat(USAGE_CLI);
    assert.ok(u.includes(`${p.total} HTTPS GET requests, ${p.perEndpoint} to each of the ${p.endpoints} AWS DynamoDB regional endpoints, ${p.atOnce} endpoints at once, no request allowed more than ${p.limitMs} ms, no retries, and at most ${p.worstMs} ms on the network in all`));
    assert.ok(u.includes(`Each run is ${p.total} requests`));
    assert.ok(flat(CHANGELOG).includes(`It makes ${p.total} HTTPS GET requests to the ${p.endpoints} AWS DynamoDB regional endpoints`));
  });

  test('seven warm samples and the 30 ms spread rule, in words and in figures', () => {
    assert.equal(WORDS[WARM_SAMPLE_COUNT], 'seven');
    assert.ok(flat(README_CLI).includes(`then ${WORDS[WARM_SAMPLE_COUNT]} warm samples`));
    assert.ok(flat(README_CLI).includes(`spread more than ${SAMPLE_SPREAD_UNSTABLE_MS} ms apart`));
    assert.ok(flat(USAGE_CLI).includes(`whose ${WORDS[WARM_SAMPLE_COUNT]} warm samples spread more than ${SAMPLE_SPREAD_UNSTABLE_MS} ms apart`));
    assert.ok(flat(CHANGELOG).includes(`${WORDS[WARM_SAMPLE_COUNT]} warm samples per endpoint, the minimum kept, the ${SAMPLE_SPREAD_UNSTABLE_MS} ms spread rule`));
  });

  test('the twelve hosts: the probe table, the README list and the words that count them', () => {
    assert.equal(Object.keys(NODE_PROBES).length, MEASUREMENT_HOSTS.length);
    assert.equal(WORDS[MEASUREMENT_HOSTS.length], 'twelve');
    const listed = [...README_PRIVACY.matchAll(/^([a-z0-9.-]+\.(?:com))\s{2,}\S/gm)].map((m) => m[1]).sort();
    assert.deepEqual(listed, [...ALL_REACHABLE_HOSTS].sort(), 'the host list under Privacy is the declared set');
    const t = flat(README_PRIVACY);
    assert.ok(t.includes(`It contacts the ${WORDS[MEASUREMENT_HOSTS.length]} \`dynamodb\` hosts in the list above and not \`www.cloudflare.com\``));
    assert.ok(t.includes(`a frozen table of ${WORDS[MEASUREMENT_HOSTS.length]} literal URLs in \`src/cli/transport.js\``));
    assert.ok(flat(USAGE).includes(`The command line contacts only the ${WORDS[MEASUREMENT_HOSTS.length]} \`dynamodb\` hosts`));
  });

  test('the body cap', () => {
    assert.equal(BODY_CAP_BYTES, 64 * 1024);
    assert.ok(flat(README_CLI).includes('capped at 64 KiB'));
  });
});

describe('exit codes, the Node floor, the schema and the User-Agent', () => {
  test('the exit code table and both short forms', () => {
    for (const [code, meaning] of [[EXIT.DONE, 'done'], [EXIT.FAILED, 'a named failure'], [EXIT.USAGE, 'a usage error'], [EXIT.INTERRUPTED, 'interrupted']]) {
      assert.ok(README_CLI.includes(`| ${code} | ${meaning}`), 'README row for ' + code);
    }
    const short = `${EXIT.DONE} done, ${EXIT.FAILED} a named failure, ${EXIT.USAGE} a usage error, ${EXIT.INTERRUPTED} interrupted`;
    assert.ok(flat(USAGE_CLI).includes(short));
    assert.ok(flat(CHANGELOG).includes('Exit codes: ' + short + '.'));
  });

  test('Node 22 or later is what package.json requires', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.engines.node, '>=22');
    for (const [name, text] of [['README', README_CLI], ['USAGE', USAGE_CLI], ['CHANGELOG', CHANGELOG]]) {
      assert.ok(flat(text).includes('Node 22 or later'), name);
    }
  });

  test('the schema name and the shape of a figure that is not shown', () => {
    for (const text of [README_CLI, USAGE_CLI, CHANGELOG]) assert.ok(text.includes('`' + JSON_SCHEMA + '`'));
    const shown = JSON.stringify(absent('...')).replace(/,/g, ', ').replace(/":/g, '": ');
    assert.equal(shown, '{"suppressed": true, "reason": "..."}');
    assert.ok(README_CLI.includes('`' + shown + '`'));
    assert.ok(USAGE_CLI.includes('`' + shown + '`'));
  });

  test('the User-Agent line is the one the transport sends, with the version left as a slot', () => {
    assert.ok(README_CLI.includes('```\nUser-Agent: ' + userAgentFor('<version>') + '\n```'));
    assert.ok(CHANGELOG.includes('`User-Agent: ' + userAgentFor('<version>') + '`'));
  });
});

describe('every command and option the parser knows is documented, and nothing else is', () => {
  test('each command appears in the README table and in the USAGE list', () => {
    for (const c of COMMANDS) {
      assert.ok(README_CLI.includes('| `photontax ' + c), 'README ' + c);
      assert.ok(USAGE_CLI.includes('npx photontax ' + c), 'USAGE ' + c);
    }
    assert.ok(README_CLI.includes('| `photontax` |'), 'no command');
  });

  test('the README option table lists exactly the options --help lists, and the parser accepts each', () => {
    const rows = [...README_CLI.matchAll(/^\| (`--?[a-z-]+[^|]*?) \|/gm)].map((m) => m[1]);
    const flags = rows.flatMap((r) => [...r.matchAll(/`(--?[a-z-]+)/g)].map((m) => m[1]));
    const helped = COPY.options.flatMap(([k]) => k.match(/--?[a-z-]+/g) || []);
    assert.deepEqual([...flags].sort(), [...helped].sort());
    assert.deepEqual([...helped].sort(), ['--city', '--help', '--json', '--no-color', '--plain', '--version', '-h']);
    for (const f of flags) {
      const argv = f === '--city' ? ['measure', '--city', 'London'] : [f];
      assert.equal(parseArgs(argv).ok, true, f);
    }
  });

  test('the default width is 80 columns, and --help is readable at it', async () => {
    assert.equal(DEFAULT_WIDTH, 80);
    assert.ok(flat(README_CLI).includes('else 80 columns'));
    assert.ok(flat(README_CLI).includes('readable at 80 columns'));
    const stdout = captureStream();
    const code = await main(['--help'], { stdout, stderr: captureStream(), env: {}, version: '0.0.0', onSignal: () => () => {} });
    assert.equal(code, EXIT.DONE);
    const widest = Math.max(...stdout.text().split('\n').map((l) => [...l].length));
    assert.ok(widest <= DEFAULT_WIDTH, 'widest help line ' + widest);
  });
});

describe('the example places and the JSON paths the documents use', () => {
  test('every place a document names on a command line resolves, exactly', () => {
    for (const c of ['Ashburn, Virginia', 'Frankfurt']) assert.ok(resolveCity(c), c);
    for (const p of ['London', 'Tokyo', 'eu-west-2', 'Ashburn, Virginia']) assert.ok(resolvePlace(p), p);
    assert.ok(README_CLI.includes('npx photontax measure --city "Ashburn, Virginia"'));
    assert.ok(USAGE_CLI.includes('npx photontax floor London Tokyo'));
    assert.ok(USAGE_CLI.includes('photontax floor "Ashburn, Virginia" eu-west-2'));
  });

  test('USAGE says 39 cities, and the picker has 39', () => {
    assert.equal(pickableCities().length, 39);
    assert.ok(flat(USAGE).includes('Pick one of the 39 cities in the bundled table'));
  });

  test('the jq paths in USAGE 9.4.4 read a real measure document', async () => {
    assert.ok(USAGE_CLI.includes('`.accessBaseline.value.value`'));
    assert.ok(USAGE_CLI.includes('`.endpoints[] | {region, route: .route.value}`'));
    const observer = /** @type {any} */ (endpointById('aws:us-east-1'));
    /** @param {string} host */
    const floorOf = (host) => floorMsForDistanceKm(greatCircleKm(observer, /** @type {any} */ (MEASURED_ENDPOINTS.find((e) => e.measurementHost === host))));
    const net = memoryNetwork({
      behaviour: (host) => ({
        ms: floorOf(host) + 9 + (host.includes('us-east-1') ? 0 : 3),
        phases: { dnsMs: 2, tcpMs: floorOf(host) + 1, tlsMs: floorOf(host) + 2, address: '192.0.2.10', tls: 'TLSv1.3' },
      }),
    });
    const stdout = captureStream();
    const code = await main(['measure', '--city', 'Ashburn, Virginia', '--json'], {
      stdout,
      stderr: captureStream(),
      env: {},
      version: '0.0.0',
      onSignal: () => () => {},
      now: () => net.clock.t,
      concurrency: 1,
      createTransport: (/** @type {any} */ o) => createNodeTransport({ ...o, startFor: net.startFor, agentFor: net.agentFor }),
    });
    assert.equal(code, EXIT.DONE);
    const d = JSON.parse(stdout.text());
    assert.equal(d.schema, JSON_SCHEMA);
    assert.equal(typeof d.accessBaseline.value.value, 'number');
    assert.equal(d.accessBaseline.value.badge, 'MEASURED');
    assert.equal(d.endpoints.length, MEASUREMENT_HOSTS.length);
    for (const e of d.endpoints) {
      assert.equal(typeof e.region, 'string');
      assert.ok(typeof e.route.value === 'number' || (e.route.suppressed === true && typeof e.route.reason === 'string'), e.region);
    }
  });
});
