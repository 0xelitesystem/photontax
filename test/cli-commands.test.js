// Every offline command, in text, in the linear form and as JSON. DESIGN-CLI sections 0 and 1.
// None of these opens a socket: each run injects a transport that throws if it is ever created.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../src/cli/main.js';
import { cliPlan, helpSections } from '../src/cli/commands.js';
import { createOut } from '../src/cli/out.js';
import { COPY, EXIT, JSON_SCHEMA, REPO_URL, CLI_SOURCE_IDS, PAGE_ONLY_SOURCE_IDS, userAgentFor } from '../src/cli/copy.js';
import { MEASUREMENT_HOSTS } from '../src/core/data/endpoints.js';
import { SOURCES } from '../src/core/data/sources.js';
import { REGION_COORDINATE_DISCLAIMER } from '../src/core/data/disclaimers.js';
import { pickableCities } from '../src/ui/citypicker.js';
import { greatCircleKm } from '../src/core/geo.js';
import { floorMsForDistanceKm, REQUESTS_PER_ENDPOINT } from '../src/core/constants.js';
import { endpointById } from '../src/core/data/endpoints.js';
import { captureStream } from './helpers/cli-io.mjs';

const VERSION = '0.0.0';

/** @param {string[]} argv @param {Record<string,string>} [env] */
async function run(argv, env = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await main(argv, {
    stdout, stderr, env, version: VERSION,
    onSignal: () => () => {},
    createTransport: () => { throw new Error('an offline command must never create a transport'); },
  });
  return { code, out: stdout.text(), err: stderr.text() };
}

/** @param {string[]} argv */
async function json(argv) {
  const r = await run([...argv, '--json']);
  assert.equal(r.code, EXIT.DONE, r.err);
  return JSON.parse(r.out);
}

/**
 * DESIGN-CLI item 13: no figure is a bare number. Every number anywhere in a document must be a
 * property of a figure object, that is an object carrying a badge, a method and display text.
 * @param {unknown} node @param {string} where @param {unknown} parent
 * @returns {string[]} Paths of bare numbers.
 */
function bareNumbers(node, where = '$', parent = null) {
  if (typeof node === 'number') {
    const p = /** @type {any} */ (parent);
    const isFigure = p && typeof p.badge === 'string' && typeof p.method === 'string' && typeof p.text === 'string';
    return isFigure ? [] : [where];
  }
  if (Array.isArray(node)) return node.flatMap((x, i) => bareNumbers(x, where + '[' + i + ']', node));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => bareNumbers(v, where + '.' + k, node));
  }
  return [];
}

/** Every figure object in a document, for shape checks. @param {unknown} node @returns {any[]} */
function figuresIn(node) {
  if (Array.isArray(node)) return node.flatMap(figuresIn);
  if (node && typeof node === 'object') {
    const o = /** @type {any} */ (node);
    if (typeof o.badge === 'string' && typeof o.method === 'string' && 'value' in o) return [o];
    return Object.values(o).flatMap(figuresIn);
  }
  return [];
}

describe('--help', () => {
  test('fits eighty columns on every line and exits 0', async () => {
    const { code, out, err } = await run(['--help']);
    assert.equal(code, EXIT.DONE);
    assert.equal(err, '');
    const long = out.split('\n').filter((l) => l.length > 80);
    assert.deepEqual(long, [], 'lines over eighty columns');
  });

  test('carries everything DESIGN-CLI section 0 item 15 lists', async () => {
    const { out: raw } = await run(['--help']);
    // Wrapping may break a long title across lines, so most checks read the words, not the lines.
    const flat = raw.replace(/\s+/g, ' ');
    const firstLine = raw.split('\n')[0];
    assert.equal(firstLine, COPY.purpose, 'a one line purpose, first');
    for (const c of ['measure', 'cities', 'plan', 'floor', 'selftest', 'sources']) assert.ok(flat.includes('photontax ' + c), c);
    for (const f of ['--city', '--json', '--plain', '--no-color', '--help', '-h', '--version']) assert.ok(flat.includes(f), f);
    assert.ok(flat.includes('96 [COMPUTED]'), 'the plan, with the exact request count');
    for (const h of MEASUREMENT_HOSTS) assert.ok(flat.includes(h), h);
    assert.ok(flat.includes('no telemetry and no update check'), 'the privacy line');
    assert.ok(flat.includes(userAgentFor(VERSION)), 'the User-Agent');
    assert.ok(flat.includes('independent project'), 'the independence statement');
    for (const id of CLI_SOURCE_IDS) assert.ok(flat.includes(SOURCES[id].title.replace(/\s+/g, ' ')), 'the source attribution: ' + id);
    assert.ok(flat.includes('MIT licensed') && flat.includes(REPO_URL), 'MIT and the repository');
    for (const [code, word] of [['0', 'done'], ['1', 'a named failure'], ['2', 'a usage error'], ['130', 'interrupted']]) {
      assert.ok(new RegExp('^  ' + code + '\\s+' + word, 'm').test(raw), 'exit code ' + code);
    }
    for (const e of ['NO_COLOR', 'FORCE_COLOR', 'COLUMNS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY']) {
      assert.ok(flat.includes(e), e);
    }
  });

  test('every help section renders at eighty columns in both forms without a digit typed into prose', () => {
    for (const mode of ['text', 'plain']) {
      const out = createOut({ stdout: captureStream(), stderr: captureStream(), env: { COLUMNS: '80' }, plain: mode === 'plain' });
      for (const s of helpSections(VERSION, /** @type {any} */ (mode))) {
        for (const l of s.lines || []) for (const line of out.lines(l.parts, { indent: l.indent })) assert.ok(line.length <= 80, line);
      }
    }
  });

  test('with --json, stdout stays empty and the help goes to stderr', async () => {
    const r = await run(['--help', '--json']);
    assert.equal(r.out, '');
    assert.ok(r.err.includes(COPY.purpose));
  });
});

describe('--version', () => {
  test('text and JSON', async () => {
    const r = await run(['--version']);
    assert.equal(r.out, 'photontax ' + VERSION + '\n');
    const d = await json(['--version']);
    assert.deepEqual(d, { schema: JSON_SCHEMA, tool: { name: 'photontax', version: VERSION }, command: 'version' });
  });

  test('reads the version from the package manifest when none is injected', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const stdout = captureStream();
    await main(['--version'], { stdout, stderr: captureStream(), env: {}, onSignal: () => () => {} });
    assert.equal(stdout.text(), 'photontax ' + pkg.version + '\n');
  });
});

describe('no command: the offline fact', () => {
  test('the coordinate disclaimer comes before the numbers, and nothing touched the network', async () => {
    const { code, out } = await run([]);
    assert.equal(code, EXIT.DONE);
    assert.ok(out.startsWith(REGION_COORDINATE_DISCLAIMER.slice(0, 40)));
    assert.ok(out.indexOf('[COMPUTED]') > out.indexOf('kilometres away'));
    assert.ok(out.includes(COPY.factNoNetwork.slice(0, 30)));
    assert.ok(out.includes('--help'));
  });
  test('JSON', async () => {
    const d = await json([]);
    assert.equal(d.command, 'fact');
    assert.equal(d.distance.badge, 'COMPUTED');
    assert.equal(d.floor.unit, 'ms');
    assert.deepEqual(bareNumbers(d), []);
  });
});

describe('cities', () => {
  test('every pickable city, by id and by name', async () => {
    const { out } = await run(['cities']);
    const cities = pickableCities();
    assert.equal(cities.length, 39);
    for (const c of cities) assert.ok(new RegExp('^  ' + c.id.replace(/[.:]/g, '\\$&') + '\\s+' + c.label.replace(/[.()]/g, '\\$&') + '$', 'm').test(out), c.id);
  });
  test('JSON', async () => {
    const d = await json(['cities']);
    assert.equal(d.cities.length, 39);
    assert.deepEqual(d.cities, pickableCities().map((c) => ({ id: c.id, label: c.label })));
    assert.equal(d.coordinateDisclaimer, REGION_COORDINATE_DISCLAIMER);
  });
});

describe('plan', () => {
  test('the exact count, the per request limit and the worst case, counted from shipped constants', () => {
    const p = cliPlan();
    assert.equal(p.total, 96);
    assert.equal(p.total, MEASUREMENT_HOSTS.length * REQUESTS_PER_ENDPOINT);
    assert.equal(p.limitMs, 8000);
    assert.equal(p.worstMs, 3 * 8 * 8000);
    assert.deepEqual(p.hosts, [...MEASUREMENT_HOSTS]);
  });
  test('text', async () => {
    const { out } = await run(['plan']);
    assert.ok(out.startsWith('measure makes 96 [COMPUTED] HTTPS GET requests in total'));
    for (const h of MEASUREMENT_HOSTS) assert.ok(out.includes(h));
    assert.ok(!out.includes('cloudflare.com'));
    assert.ok(out.includes(COPY.planNoFacility.slice(0, 40)));
  });
  test('the linear form puts one figure on each line', async () => {
    const { out } = await run(['plan', '--plain']);
    assert.ok(/^HTTPS GET requests measure makes in total: 96, COMPUTED\./m.test(out));
    assert.ok(/^Requests to each endpoint: 8, COMPUTED\./m.test(out));
    assert.ok(/^The longest a run can wait on the network: 192000 ms, COMPUTED\./m.test(out));
  });
  test('JSON', async () => {
    const d = await json(['plan']);
    assert.equal(d.requests.value, 96);
    assert.equal(d.requests.badge, 'COMPUTED');
    assert.deepEqual(d.hosts, [...MEASUREMENT_HOSTS]);
    assert.equal(d.userAgent, userAgentFor(VERSION));
    assert.deepEqual(bareNumbers(d), []);
  });
});

describe('floor', () => {
  test('text: both places, the working, and the floor the shipped arithmetic gives', async () => {
    const { code, out } = await run(['floor', 'aws:us-east-1', 'Mumbai']);
    assert.equal(code, EXIT.DONE);
    const a = /** @type {any} */ (endpointById('aws:us-east-1'));
    const b = /** @type {any} */ (endpointById('aws:ap-south-1'));
    const km = greatCircleKm(a, b);
    assert.ok(out.includes('Great circle distance: ' + Math.round(km) + ' km [COMPUTED].'));
    assert.ok(out.includes('The physics floor between these two places: ' + Math.round(floorMsForDistanceKm(km)) + ' ms [COMPUTED]'));
    assert.ok(out.includes('Haversine term'));
    assert.ok(out.includes('Speed of light in vacuum'));
  });
  test('a region code works as a place, and the linear form puts each coordinate on its own line', async () => {
    const { out } = await run(['floor', 'eu-west-2', 'ap-northeast-1', '--plain']);
    const london = /** @type {any} */ (endpointById('aws:eu-west-2'));
    const lines = out.split('\n');
    assert.ok(lines.includes('From: London (aws:eu-west-2).'));
    assert.ok(lines.some((l) => l.startsWith('Latitude: ' + london.lat.toFixed(4) + ', INFERRED.')), out.slice(0, 400));
    assert.ok(lines.some((l) => l.startsWith('Longitude: ' + london.lon.toFixed(4) + ', INFERRED.')));
  });
  test('JSON: every term is a figure at display precision', async () => {
    const d = await json(['floor', 'London', 'Tokyo']);
    assert.equal(d.from.label, 'London');
    assert.equal(d.to.label, 'Tokyo');
    assert.equal(d.distance.value, Math.round(greatCircleKm(/** @type {any} */ (endpointById('aws:eu-west-2')), /** @type {any} */ (endpointById('aws:ap-northeast-1')))));
    assert.equal(d.terms.fibreGroupIndex.value, 1.4682);
    assert.equal(d.terms.fibreGroupIndex.text, '1.4682 [COMPUTED]');
    assert.deepEqual(bareNumbers(d), []);
  });
});

describe('selftest', () => {
  test('every check passes, and every group is printed', async () => {
    const { code, out } = await run(['selftest']);
    assert.equal(code, EXIT.DONE, out);
    for (const h of [COPY.selftestArithmetic, COPY.selftestRun, COPY.selftestEngine, COPY.selftestCli]) assert.ok(out.includes(h), h);
    assert.ok(!out.includes('FAIL'));
    assert.ok(out.includes(COPY.selftestAllPassed));
  });
  test('JSON: the ten page checks, the ten engine checks and the four command line checks', async () => {
    const d = await json(['selftest']);
    assert.equal(d.passed, true);
    const counts = d.groups.map((/** @type {any} */ g) => g.checks.length);
    assert.deepEqual(counts, [5, 5, 10, 4]);
    for (const g of d.groups) for (const c of g.checks) assert.equal(c.passed, true, g.name + ': ' + c.label);
    assert.deepEqual(bareNumbers(d), []);
  });
  test('the scripted run behind it touched no socket', async () => {
    // run() injects a transport factory that throws; selftest builds its own in memory starter.
    const { code } = await run(['selftest', '--json']);
    assert.equal(code, EXIT.DONE);
  });
});

describe('sources', () => {
  test('every attribution printed verbatim from the source registry', async () => {
    const { out } = await run(['sources', '--no-color']);
    const flat = out.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    for (const id of CLI_SOURCE_IDS) {
      const s = SOURCES[id];
      assert.ok(flat.includes(s.attribution.replace(/\s+/g, ' ')), id);
      assert.ok(flat.includes(s.url), id);
    }
    for (const id of PAGE_ONLY_SOURCE_IDS) assert.ok(flat.includes(SOURCES[id].title), id);
  });
  test('JSON', async () => {
    const d = await json(['sources']);
    assert.deepEqual(d.sources.map((/** @type {any} */ s) => s.id), [...CLI_SOURCE_IDS]);
    for (const s of d.sources) assert.equal(s.attribution, SOURCES[s.id].attribution);
  });
});

describe('every JSON document', () => {
  const argvs = [[], ['cities'], ['plan'], ['floor', 'Paris', 'Sydney'], ['selftest'], ['sources'], ['--version']];
  for (const argv of argvs) {
    test((argv.join(' ') || '(no command)') + ': one document, the schema named, no bare number, figures well formed', async () => {
      const r = await run([...argv, '--json']);
      assert.equal(r.code, EXIT.DONE);
      const d = JSON.parse(r.out);
      assert.equal(r.out.trim().split('\n}\n').length, 1, 'exactly one document');
      assert.equal(d.schema, 'photontax.cli/1');
      assert.equal(d.tool.name, 'photontax');
      assert.equal(typeof d.command, 'string');
      assert.deepEqual(bareNumbers(d), []);
      for (const f of figuresIn(d)) {
        assert.ok(['MEASURED', 'REPORTED', 'COMPUTED', 'INFERRED'].includes(f.badge));
        assert.ok(f.text.endsWith('[' + f.badge + ']'), f.text);
        assert.ok(f.method.length > 20);
      }
    });
  }
});
