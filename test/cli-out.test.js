// The one writer, src/cli/out.js. DESIGN-CLI section 0 items 3, 12 and 13: every line sanitised
// at write time, colour decoration only and off whenever anything says so, text wrapped at
// COLUMNS without splitting a figure, a vanished reader handled quietly with exit code 0, and
// with --json exactly one document on stdout.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitize, colourFor, widthFor, createOut, piecesFor, splitForPlain, DEFAULT_WIDTH, MIN_WIDTH,
} from '../src/cli/out.js';
import { main } from '../src/cli/main.js';
import { t, c, id, arg } from '../src/cli/parts.js';
import { computed, measured, reported, UNITS, METHODS } from '../src/core/claim.js';
import { EXIT } from '../src/cli/copy.js';
import { PLANTED_ESCAPES, LEGIT_TEXT } from '../src/cli/commands.js';
import { captureStream, brokenPipe } from './helpers/cli-io.mjs';

const ESC = '\u001b';
/** Anything a terminal would act on rather than print. */
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u2028\u2029]/;

describe('the sanitiser makes every byte inert', () => {
  const cases = [
    ['a screen clear, ESC [2J', 'a\u001b[2Jb', 'a[2Jb'],
    ['an OSC 8 hyperlink', '\u001b]8;;https://example.invalid/\u0007click\u001b]8;;\u0007', ']8;;https://example.invalid/click]8;;'],
    ['an OSC 52 clipboard write', '\u001b]52;c;cGhvdG9udGF4\u0007done', ']52;c;cGhvdG9udGF4done'],
    ['a single byte control sequence introducer, U+009B', 'x\u009b31my', 'x31my'],
    ['a right to left override, U+202E', 'report\u202Efdp.exe', 'reportfdp.exe'],
    ['a left to right isolate, U+2066 to U+2069', '\u2066isolated\u2069', 'isolated'],
    ['DEL', 'del\u007fete', 'delete'],
    ['a bell and a backspace', 'a\u0007b\u0008c', 'abc'],
    ['a carriage return that would overwrite a line', 'safe\rEVIL', 'safeEVIL'],
    ['the Arabic letter mark and the directional marks', 'a\u061Cb\u200Ec\u200Fd', 'abcd'],
    ['a zero width space and a byte order mark', 'a\u200Bb\uFEFFc', 'abc'],
    ['the line and paragraph separators', 'a\u2028b\u2029c', 'abc'],
    ['a zero width joiner that is not between two letters', '\u200Dx', 'x'],
  ];
  for (const [what, input, want] of cases) {
    test(what + ' is removed', () => {
      assert.equal(sanitize(input), want);
      assert.equal(CONTROL.test(sanitize(input)), false);
    });
  }

  test('newline and tab survive, because the writer lays text out with them', () => {
    assert.equal(sanitize('a\tb\nc'), 'a\tb\nc');
  });

  test('accented names, curly quotes and other printable text pass untouched', () => {
    for (const s of [
      LEGIT_TEXT, 'Montr\u00E9al', 'S\u00E3o Paulo', 'Z\u00FCrich', '\u201Cquoted\u201D', '\u2018quoted\u2019',
      '\u6771\u4EAC', '\u0645\u0648\u0645\u0628\u0627\u064A', '\u0394\u03B5\u03BB\u03C6\u03BF\u03AF', 'na\u00EFve caf\u00E9',
    ]) {
      assert.equal(sanitize(s), s);
    }
  });

  test('a zero width joiner or non joiner between two letters is kept, where scripts need it', () => {
    const s = '\u0915\u094D\u200D\u0937';
    assert.equal(sanitize(s), s);
    assert.equal(sanitize('a\u200Cb'), 'a\u200Cb');
  });

  test('the self test planted string loses every escape and keeps the legitimate text', () => {
    const cleaned = sanitize(PLANTED_ESCAPES + LEGIT_TEXT);
    assert.equal(CONTROL.test(cleaned), false);
    assert.ok(cleaned.endsWith(LEGIT_TEXT));
    assert.ok(!cleaned.includes(ESC));
  });

  test('text from the far end, carried as a REPORTED claim, arrives inert on the stream', () => {
    // The way network text really reaches a line: the connected address and the TLS version are
    // REPORTED text claims, and a hostile resolver or server chooses their bytes.
    const hostile = '\u001b[2J\u001b]8;;https://example.invalid/\u0007x\u001b]8;;\u0007\u001b]52;c;eA==\u0007\u009b31m\u202E\u2066\u007f' + LEGIT_TEXT;
    const stdout = captureStream({ isTTY: true });
    const out = createOut({ stdout, stderr: captureStream(), env: { FORCE_COLOR: '0' } });
    out.line([t('Connected address: '), c(reported(hostile, UNITS.TEXT, METHODS.CONNECTED_ADDRESS)), t('.')]);
    const text = stdout.text().replace(/\n$/, '');
    assert.equal(CONTROL.test(text), false, JSON.stringify(text));
    assert.ok(text.includes(LEGIT_TEXT));
    assert.ok(text.endsWith('[REPORTED].'));
  });

  test('a prose run cannot carry a planted escape\'s digits in the first place', () => {
    assert.throws(() => t('Name: \u001b[2J'), /digit/);
  });

  test('a JSON document is sanitised too: escapes never reach stdout, even inside a string', () => {
    const stdout = captureStream();
    const out = createOut({ stdout, stderr: captureStream(), env: {}, json: true });
    out.document({ schema: 'photontax.cli/1', name: 'x\u009b31m\u202Ey\u007f' + LEGIT_TEXT });
    const text = stdout.text();
    assert.equal(CONTROL.test(text.replace(/\n/g, '')), false);
    // The introducer goes; the bytes after it are harmless printable text once it has gone.
    assert.equal(JSON.parse(text).name, 'x31my' + LEGIT_TEXT);
  });
});

describe('colour is decoration only, and off whenever anything says so', () => {
  const tty = { isTTY: true };
  test('on for a terminal with nothing set', () => {
    assert.equal(colourFor(tty, {}, {}), true);
  });
  test('off when the output is not a terminal', () => {
    assert.equal(colourFor({ isTTY: false }, {}, {}), false);
    assert.equal(colourFor(undefined, {}, {}), false);
  });
  test('off for any non empty NO_COLOR, and NO_COLOR beats FORCE_COLOR', () => {
    for (const v of ['1', '0', 'true', 'anything']) assert.equal(colourFor(tty, { NO_COLOR: v }, {}), false, v);
    assert.equal(colourFor(tty, { NO_COLOR: '1', FORCE_COLOR: '1' }, {}), false);
    assert.equal(colourFor(tty, { NO_COLOR: '' }, {}), true, 'an empty NO_COLOR is unset, per no-color.org');
  });
  test('FORCE_COLOR turns it on off a terminal, and FORCE_COLOR=0 turns it off on one', () => {
    assert.equal(colourFor({ isTTY: false }, { FORCE_COLOR: '1' }, {}), true);
    assert.equal(colourFor(tty, { FORCE_COLOR: '0' }, {}), false);
    assert.equal(colourFor(tty, { FORCE_COLOR: 'false' }, {}), false);
  });
  test('an empty FORCE_COLOR is unset, like an empty NO_COLOR', () => {
    assert.equal(colourFor({ isTTY: false }, { FORCE_COLOR: '' }, {}), false);
    assert.equal(colourFor(tty, { FORCE_COLOR: '' }, {}), true);
  });
  test('off for a dumb terminal, --no-color, --plain and --json', () => {
    assert.equal(colourFor(tty, { TERM: 'dumb' }, {}), false);
    assert.equal(colourFor(tty, {}, { noColor: true }), false);
    assert.equal(colourFor(tty, {}, { plain: true }), false);
    assert.equal(colourFor(tty, {}, { json: true }), false);
  });

  test('coloured output carries every badge word, and stripping the colour gives the plain bytes', () => {
    const k = measured(92, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP);
    const coloured = captureStream({ isTTY: true });
    const bare = captureStream({ isTTY: false });
    createOut({ stdout: coloured, stderr: captureStream(), env: {} }).line([t('Round trip: '), c(k), t('.')]);
    createOut({ stdout: bare, stderr: captureStream(), env: {} }).line([t('Round trip: '), c(k), t('.')]);
    assert.ok(coloured.text().includes(ESC), 'a terminal gets colour');
    assert.ok(coloured.text().includes('MEASURED'));
    assert.equal(coloured.text().replace(/\u001b\[[0-9;]*m/g, ''), bare.text());
    assert.equal(bare.text(), 'Round trip: 92 ms [MEASURED].\n');
  });
});

describe('NO_COLOR and a non terminal produce no escape code from any command', () => {
  const commands = [[], ['--help'], ['--version'], ['cities'], ['plan'], ['sources'], ['floor', 'London', 'Tokyo'], ['selftest']];
  for (const argv of commands) {
    test((argv.join(' ') || '(no command)') + ': none with NO_COLOR on a terminal, none off a terminal, some on a bare terminal', async () => {
      const outputs = {};
      for (const [name, isTTY, env] of [['noColor', true, { NO_COLOR: '1' }], ['pipe', false, {}], ['tty', true, {}], ['flag', true, null]]) {
        const stdout = captureStream({ isTTY });
        const stderr = captureStream({ isTTY });
        const args = env === null ? [...argv, '--no-color'] : argv;
        const code = await main(args, { stdout, stderr, env: env || {}, version: '0.0.0', onSignal: () => () => {} });
        assert.equal(code, EXIT.DONE, name);
        /** @type {any} */ (outputs)[name] = stdout.text() + stderr.text();
      }
      const o = /** @type {any} */ (outputs);
      assert.ok(!o.noColor.includes(ESC), 'NO_COLOR');
      assert.ok(!o.pipe.includes(ESC), 'not a terminal');
      assert.ok(!o.flag.includes(ESC), '--no-color');
      assert.equal(o.noColor, o.pipe, 'colour off is the same bytes however it was turned off');
      // A command that prints a badge word or a heading colours it on a bare terminal, which
      // proves the three runs above turned colour off rather than never having any.
      if (!['--version', 'cities'].includes(argv[0])) assert.ok(o.tty.includes(ESC), 'a bare terminal does get colour');
    });
  }
});

describe('wrapping', () => {
  test('the width is COLUMNS, else the terminal, else eighty, and never below the minimum', () => {
    assert.equal(widthFor({ isTTY: true, columns: 120 }, {}), 120);
    assert.equal(widthFor({ isTTY: true, columns: 120 }, { COLUMNS: '40' }), 40);
    assert.equal(widthFor({ isTTY: false }, {}), DEFAULT_WIDTH);
    assert.equal(widthFor({ isTTY: false }, { COLUMNS: 'wide' }), DEFAULT_WIDTH);
    assert.equal(widthFor({ isTTY: false }, { COLUMNS: '3' }), MIN_WIDTH);
  });

  test('at forty columns no line is longer than forty unless it is one unbreakable figure', async () => {
    const stdout = captureStream();
    await main(['floor', 'London', 'Tokyo'], { stdout, stderr: captureStream(), env: { COLUMNS: '40' }, version: '0.0.0', onSignal: () => () => {} });
    for (const line of stdout.text().split('\n')) {
      if (line.length <= 40) continue;
      assert.equal(line.trim().split(' ').length <= 3, true, 'only a single long word may overflow: ' + line);
    }
  });

  test('a labelled item keeps its column when there is room, and stacks on a narrow terminal', () => {
    const k = measured(12, UNITS.MS, METHODS.DNS_LOOKUP_TIME);
    const wide = createOut({ stdout: captureStream(), stderr: captureStream(), env: { COLUMNS: '80' } });
    const narrow = createOut({ stdout: captureStream(), stderr: captureStream(), env: { COLUMNS: '40' } });
    // item() is what writes; lines() with a label renders the same layout without writing.
    assert.deepEqual(wide.lines([c(k)], { indent: 2, label: [t('DNS lookup time')], labelWidth: 30 }),
      ['  DNS lookup time             12 ms [MEASURED]']);
    assert.deepEqual(narrow.lines([c(k)], { indent: 2, label: [t('DNS lookup time')], labelWidth: 30 }),
      ['  DNS lookup time', '    12 ms [MEASURED]']);
  });

  test('a figure and its badge word are never split across two lines', () => {
    const out = createOut({ stdout: captureStream(), stderr: captureStream(), env: { COLUMNS: '24' } });
    const k = computed(12855.2, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE);
    const lines = out.lines([t('Ashburn, Virginia to Mumbai is '), c(k), t('.')]);
    assert.ok(lines.some((l) => l.includes('12855 km [COMPUTED].')), JSON.stringify(lines));
    for (const l of lines) assert.ok(!/12855 km$/.test(l) && !/^\s*\[COMPUTED\]/.test(l), l);
  });
});

describe('the linear form, one complete sentence per figure', () => {
  test('a sentence holding several figures breaks after each figure that ends a clause', () => {
    const a = measured(92, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP);
    const b = computed(64, UNITS.MS, METHODS.FIBRE_FLOOR);
    const groups = splitForPlain([t('Frankfurt costs '), c(a), t('. Physics charges '), c(b), t('.')]);
    assert.equal(groups.length, 2);
    const out = createOut({ stdout: captureStream(), stderr: captureStream(), env: {}, plain: true });
    const text = out.lines([t('Frankfurt costs '), c(a), t('. Physics charges '), c(b), t('.')]).join('\n');
    assert.ok(text.startsWith('Frankfurt costs 92 ms, MEASURED. Warm HTTPS round trip.'));
    assert.ok(/\nPhysics charges 64 ms, COMPUTED\. Twice the great circle/.test(text), text);
    assert.ok(!text.includes('[MEASURED]'), 'the linear form states the badge as a word in the sentence');
  });

  test('each figure in the linear form is its claim\'s own a11y sentence', () => {
    const k = measured(9, UNITS.MS, METHODS.ACCESS_BASELINE);
    const out = createOut({ stdout: captureStream(), stderr: captureStream(), env: { COLUMNS: '9999' }, plain: true });
    const line = out.lines([t('Access: '), c(k)])[0];
    assert.equal(line, 'Access: 9 ms, MEASURED. ' + METHODS.ACCESS_BASELINE);
  });
});

describe('the sink refuses what would bypass the badge', () => {
  const sink = () => createOut({ stdout: captureStream(), stderr: captureStream(), env: {} });
  test('a plain string carrying a digit', () => {
    assert.throws(() => sink().line(['it took 92 ms']), /digit/);
  });
  test('an object that only looks like a prose run, carrying a digit', () => {
    assert.throws(() => sink().line([{ kind: 'text', value: '92 ms' }]), /digit/);
  });
  test('provenance prose with no method', () => {
    assert.throws(() => sink().line([{ kind: 'prose', value: 'a 7 sample minimum', badge: 'MEASURED', method: '' }]), /method/);
  });
  test('an identifier that is not one this product ships', () => {
    assert.throws(() => id('92'), /identifier/);
    assert.throws(() => sink().line([{ kind: 'id', value: '92 ms' }]), /identifier/);
  });
  test('the user\'s own argument on stdout, where it would be text this program did not write', () => {
    assert.throws(() => sink().line([t('City: '), arg('92')]), /stderr only/);
    assert.doesNotThrow(() => sink().note([t('City: '), arg('92')]));
  });
  test('a bare number, a bare claim and an unknown part', () => {
    assert.throws(() => piecesFor([92], 'text'));
    assert.throws(() => piecesFor([measured(1, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP)], 'text'));
    assert.throws(() => piecesFor([{ kind: 'html', value: '<b>' }], 'text'), /unknown part/);
  });
  test('with --json, any text line on stdout, and a second document', () => {
    const out = createOut({ stdout: captureStream(), stderr: captureStream(), env: {}, json: true });
    assert.throws(() => out.line([t('hello')]), /one JSON document/);
    assert.throws(() => out.blank(), /one JSON document/);
    out.document({ schema: 'photontax.cli/1' });
    assert.throws(() => out.document({ schema: 'photontax.cli/1' }), /exactly one/);
  });
  test('a JSON document outside --json', () => {
    assert.throws(() => sink().document({}), /only with --json/);
  });
});

describe('a reader that goes away is not an error', () => {
  test('EPIPE on stdout: no throw, writing stops, and the exit code is 0', async () => {
    const stdout = brokenPipe();
    const stderr = captureStream();
    const code = await main(['sources'], { stdout, stderr, env: {}, version: '0.0.0', onSignal: () => () => {} });
    await new Promise((r) => setImmediate(r));
    assert.equal(code, EXIT.DONE);
    assert.equal(stderr.text(), '', 'nothing is printed about it');
  });

  test('after the error arrives, the sink writes nothing more to that stream', async () => {
    const stdout = brokenPipe();
    const out = createOut({ stdout, stderr: captureStream(), env: {} });
    out.line([t('one')]);
    await new Promise((r) => setImmediate(r));
    assert.equal(out.closed, true);
    const before = stdout.writes;
    for (let i = 0; i < 20; i += 1) out.line([t('more')]);
    assert.equal(stdout.writes, before);
  });

  test('a write that throws synchronously is treated the same way', () => {
    const stdout = /** @type {any} */ ({ isTTY: false, on() {}, write() { const e = /** @type {any} */ (new Error('EPIPE')); e.code = 'EPIPE'; throw e; } });
    const out = createOut({ stdout, stderr: captureStream(), env: {} });
    assert.doesNotThrow(() => out.line([t('one')]));
    assert.equal(out.closed, true);
  });

  test('a closed reader is announced once to whoever asked', async () => {
    const stdout = brokenPipe();
    const out = createOut({ stdout, stderr: captureStream(), env: {} });
    let told = 0;
    out.onClosed(() => { told += 1; });
    out.line([t('one')]);
    out.line([t('two')]);
    await new Promise((r) => setImmediate(r));
    assert.equal(told, 1);
  });
});
