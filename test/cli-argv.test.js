// The command line argument parser. DESIGN-CLI section 0 item 1 (hand written, no dependency)
// and item 11 (exit code 2 for a usage error). Strict: every token is a known command, a known
// option, or the value a known option takes. Nothing here opens a socket: parseArgs is pure and
// main() is only run on inputs that stop before any command runs.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, main, COMMANDS } from '../src/cli/main.js';
import { COPY, EXIT } from '../src/cli/copy.js';
import { ARG_ECHO_MAX } from '../src/cli/parts.js';
import { pickableCities } from '../src/ui/citypicker.js';
import { captureStream } from './helpers/cli-io.mjs';

/** @param {any} r */
const reasonOf = (r) => (r.ok ? null : r.message.map((p) => p.value).join(''));

/** Run main on argv with captured streams and no network: none of these reach a command. */
async function run(argv, env = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await main(argv, {
    stdout, stderr, env, version: '0.0.0',
    onSignal: () => () => {},
    createTransport: () => { throw new Error('a usage error must never reach the network'); },
  });
  return { code, out: stdout.text(), err: stderr.text() };
}

describe('the commands and options parse to exactly one action', () => {
  test('no arguments at all is the offline fact', () => {
    const r = parseArgs([]);
    assert.equal(r.ok, true);
    assert.equal(/** @type {any} */ (r).action, 'fact');
  });

  test('every command is recognised by its exact name', () => {
    for (const c of COMMANDS.filter((x) => x !== 'measure' && x !== 'floor')) {
      const r = /** @type {any} */ (parseArgs([c]));
      assert.equal(r.ok, true, c);
      assert.equal(r.action, c);
    }
  });

  test('the switches set their flags, before or after the command', () => {
    const a = /** @type {any} */ (parseArgs(['--json', 'cities']));
    const b = /** @type {any} */ (parseArgs(['cities', '--no-color', '--plain']));
    assert.equal(a.flags.json, true);
    assert.equal(b.flags.plain, true);
    assert.equal(b.flags.noColor, true);
    assert.equal(b.action, 'cities');
  });

  test('--city takes its value as the next token or after an equals sign', () => {
    const a = /** @type {any} */ (parseArgs(['measure', '--city', 'Tokyo']));
    const b = /** @type {any} */ (parseArgs(['measure', '--city=aws:ap-northeast-1']));
    assert.equal(a.action, 'measure');
    assert.equal(a.city.label, 'Tokyo');
    assert.equal(b.city.label, 'Tokyo');
  });

  test('a city matches by id or by name, exactly apart from letter case, never by prefix', () => {
    for (const x of pickableCities()) {
      assert.equal(/** @type {any} */ (parseArgs(['measure', '--city', x.id])).city.id, x.id);
      assert.equal(/** @type {any} */ (parseArgs(['measure', '--city', x.label.toUpperCase()])).city.id, x.id);
    }
    assert.equal(parseArgs(['measure', '--city', 'Tok']).ok, false);
    assert.equal(parseArgs(['measure', '--city', ' Tokyo']).ok, false);
  });

  test('floor takes exactly two places, each a city or a bundled region id or code', () => {
    const r = /** @type {any} */ (parseArgs(['floor', 'London', 'ap-south-1']));
    assert.equal(r.action, 'floor');
    assert.equal(r.from.label, 'London');
    assert.equal(r.to.id, 'aws:ap-south-1');
  });

  test('-- ends the options, so what follows is positional', () => {
    const r = /** @type {any} */ (parseArgs(['floor', '--', 'London', 'Tokyo']));
    assert.equal(r.action, 'floor');
  });

  test('--help and --version answer ahead of the command, and --help wins over --version', () => {
    assert.equal(/** @type {any} */ (parseArgs(['cities', '--help'])).action, 'help');
    assert.equal(/** @type {any} */ (parseArgs(['-h'])).action, 'help');
    assert.equal(/** @type {any} */ (parseArgs(['--version'])).action, 'version');
    assert.equal(/** @type {any} */ (parseArgs(['--version', '--help'])).action, 'help');
    // measure --help never measures and does not need a city.
    assert.equal(/** @type {any} */ (parseArgs(['measure', '--help'])).action, 'help');
  });
});

describe('usage errors, each a fixed sentence', () => {
  const cases = [
    { argv: ['--frobnicate'], reason: COPY.usageUnknownOption },
    { argv: ['--jso'], reason: COPY.usageUnknownOption },
    { argv: ['-j'], reason: COPY.usageUnknownOption },
    { argv: ['--json=yes'], reason: COPY.usageNoValue },
    { argv: ['--json', '--json'], reason: COPY.usageRepeated },
    { argv: ['--help', '-h'], reason: COPY.usageRepeated },
    { argv: ['measure', '--city'], reason: COPY.usageMissingValue },
    { argv: ['measure', '--city', '--json'], reason: COPY.usageMissingValue },
    { argv: ['measure', '--city='], reason: COPY.usageMissingValue },
    { argv: ['measure', '--city', 'Tokyo', '--city', 'London'], reason: COPY.usageRepeated },
    { argv: ['--json', '--plain', 'cities'], reason: COPY.usageJsonPlain },
    { argv: ['frobnicate'], reason: COPY.usageUnknownCommand },
    { argv: ['Measure', '--city', 'Tokyo'], reason: COPY.usageUnknownCommand },
    { argv: ['cities', '--city', 'Tokyo'], reason: COPY.usageCityOnlyMeasure },
    { argv: ['--city', 'Tokyo'], reason: COPY.usageCityOnlyMeasure },
    { argv: ['measure'], reason: COPY.usageCityRequired },
    { argv: ['measure', '--city', 'Atlantis'], reason: COPY.usageUnknownCity },
    { argv: ['measure', 'extra', '--city', 'Tokyo'], reason: COPY.usageExtraArgument },
    { argv: ['floor', 'London'], reason: COPY.usageFloorArgs },
    { argv: ['floor', 'London', 'Tokyo', 'Paris'], reason: COPY.usageFloorArgs },
    { argv: ['floor', 'London', 'Atlantis'], reason: COPY.usageUnknownPlace },
    { argv: ['cities', 'extra'], reason: COPY.usageExtraArgument },
    { argv: ['--url', 'https://example.invalid'], reason: COPY.usageUnknownOption },
    { argv: ['--host=example.invalid'], reason: COPY.usageUnknownOption },
  ];

  for (const c of cases) {
    test(c.argv.join(' ') + ' is refused', async () => {
      const r = parseArgs(c.argv);
      assert.equal(r.ok, false);
      assert.ok(String(reasonOf(r)).startsWith(COPY.usagePrefix + c.reason), String(reasonOf(r)));
      const { code, out, err } = await run(c.argv);
      assert.equal(code, EXIT.USAGE);
      assert.equal(out, '', 'a usage error writes nothing to stdout');
      assert.ok(err.startsWith(COPY.usagePrefix), err);
      assert.ok(err.includes('help') || err.includes('cities') || err.includes('region'), err);
    });
  }

  test('measure without a city names the cities command once, not twice', async () => {
    const { code, err } = await run(['measure']);
    assert.equal(code, EXIT.USAGE);
    assert.equal(err.split('photontax cities').length - 1, 1, err);
    assert.ok(err.includes(COPY.usageUnknownCityHint), err);
  });

  test('no option can carry a host, a URL, a port or a base URL', () => {
    for (const name of ['--host', '--url', '--port', '--base-url', '--endpoint', '--proxy', '--server']) {
      assert.equal(parseArgs([name, 'x']).ok, false, name);
      assert.equal(parseArgs([name + '=x']).ok, false, name);
    }
  });

  test('an unknown option is echoed by name only, never with its inline value', async () => {
    const { err } = await run(['--token=secret-value']);
    assert.ok(err.includes('"--token"'));
    assert.ok(!err.includes('secret-value'));
  });

  test('an echoed argument is quoted, capped, and made inert', async () => {
    const long = 'x'.repeat(ARG_ECHO_MAX + 40);
    const a = await run([long]);
    assert.ok(a.err.includes('"' + 'x'.repeat(ARG_ECHO_MAX) + '..."'));
    assert.ok(!a.err.includes('x'.repeat(ARG_ECHO_MAX + 1)));
    const b = await run(['\u001b]0;owned\u0007\u001b[2Jnope']);
    assert.ok(!/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/.test(b.err), JSON.stringify(b.err));
    assert.ok(b.err.includes('"]0;owned[2Jnope"'));
  });

  test('a usage error in --json mode still keeps stdout empty', async () => {
    const { code, out } = await run(['--json', 'frobnicate']);
    assert.equal(code, EXIT.USAGE);
    assert.equal(out, '');
  });
});
