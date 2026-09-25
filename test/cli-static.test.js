// Static rules over the command line source. DESIGN-CLI section 0 items 1, 3, 4, 5 and 14.
//
//   One writer: no file under src/cli but out.js reaches a terminal (the gate's scanner, run over
//   the real files, and an independent pattern written here, so a gate regression shows up).
//   Words: every CLI string table passes the shipped vocabulary scanner, carries no digit, and
//   no em or en dash; and so does everything every command actually prints.
//   Bytes: no raw control, bidi or format character anywhere under src (Trojan Source).
//   Shape: bin.js is a shebang and one import; the command line imports only the Node modules
//   it declares; nothing the page builds imports the command line.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanCliWriters, CLI_SINK } from '../scripts/gate-badges.mjs';
import { scanVocabulary } from '../src/core/vocabulary.js';
import { COPY, CITATION_METHOD, NAME, REPO_URL, JSON_SCHEMA, userAgentFor } from '../src/cli/copy.js';
import { CLI_FAILURE_REASONS } from '../src/cli/reasons.js';
import { t } from '../src/ui/parts.js';
import { main } from '../src/cli/main.js';
import { createNodeTransport } from '../src/cli/transport.js';
import { captureStream, memoryNetwork } from './helpers/cli-io.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'src', 'cli');

/** @param {string} dir @returns {{rel:string, text:string}[]} */
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map((f) => String(f))
    .filter((f) => /\.(?:m?js|json|html|css|md)$/.test(f))
    .sort()
    .map((f) => ({
      rel: path.relative(REPO, path.join(dir, f)).split(path.sep).join('/'),
      text: readFileSync(path.join(dir, f), 'utf8'),
    }));
}

const cliFiles = () => filesUnder(CLI).filter((f) => /\.m?js$/.test(f.rel));

/** Every string reachable in a value, depth first. @param {unknown} v @returns {string[]} */
function stringsIn(v) {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(stringsIn);
  if (v && typeof v === 'object') return Object.values(v).flatMap(stringsIn);
  return [];
}

describe('one writer', () => {
  test('the command line exists and has the files DESIGN-CLI names', () => {
    const names = cliFiles().map((f) => f.rel);
    for (const n of ['bin.js', 'main.js', 'out.js', 'transport.js', 'reasons.js']) assert.ok(names.includes('src/cli/' + n), n);
  });

  test('no file under src/cli but out.js writes to a terminal, by the gate\'s scanner', () => {
    for (const f of cliFiles()) assert.deepEqual(scanCliWriters(f.rel, f.text), [], f.rel);
  });

  test('and by an independent pattern, so a regression in the gate cannot hide one', () => {
    const writer = /\bconsole\b|process\s*(?:\.|\[\s*['"`])\s*(?:stdout|stderr)|\bwriteSync\s*\(\s*[12]\b/;
    for (const f of cliFiles()) {
      if (f.rel === CLI_SINK) continue;
      f.text.split('\n').forEach((line, i) => assert.equal(writer.test(line), false, f.rel + ':' + (i + 1) + ' ' + line.trim()));
    }
  });

  test('the sink itself is the file that does the writing', () => {
    const sink = readFileSync(path.join(REPO, ...CLI_SINK.split('/')), 'utf8');
    assert.ok(/process\.stdout/.test(sink) && /process\.stderr/.test(sink));
    assert.equal(/\bconsole\./.test(sink.replace(/^\s*\/\/.*$/mg, '')), false, 'even the sink never uses console');
  });

  test('the scanner catches a planted write in a command line file, and leaves the sink alone', () => {
    assert.equal(scanCliWriters('src/cli/report.js', "console.log('x')").length, 1);
    assert.equal(scanCliWriters('src/cli/report.js', 'process.stdout.write(s)').length, 1);
    assert.equal(scanCliWriters(CLI_SINK, 'process.stdout.write(s)').length, 0);
  });
});

describe('the words the command line prints', () => {
  const tables = {
    COPY, CLI_FAILURE_REASONS, CITATION_METHOD, NAME, REPO_URL, JSON_SCHEMA,
  };

  test('every string in every CLI string table passes the shipped vocabulary scanner', () => {
    for (const [name, table] of Object.entries(tables)) {
      for (const s of stringsIn(table)) assert.deepEqual(scanVocabulary(s), [], name + ': ' + s);
    }
  });

  test('no prose string carries a digit, so none can smuggle a figure past its badge', () => {
    for (const s of stringsIn({ COPY, CLI_FAILURE_REASONS, CITATION_METHOD })) {
      assert.doesNotThrow(() => t(s), s);
    }
  });

  test('no em dash, no en dash, and no assistant attribution anywhere under src/cli', () => {
    for (const f of cliFiles()) {
      assert.equal(/[\u2013\u2014]/.test(f.text), false, f.rel);
      assert.equal(/co-authored-by|generated (?:with|by) (?:claude|an? ai)/i.test(f.text), false, f.rel);
    }
  });

  test('the User-Agent names the product, its version and its repository, and nothing else', () => {
    assert.equal(userAgentFor('1.2.3'), 'photontax/1.2.3 (+https://github.com/0xelitesystem/photontax)');
  });

  test('everything every command prints, in every form, passes the vocabulary scanner', async () => {
    const runs = [
      [], ['--help'], ['--version'], ['cities'], ['plan'], ['sources'], ['floor', 'Paris', 'Mumbai'], ['selftest'],
      ['measure', '--city', 'Tokyo'],
    ];
    for (const argv of runs) {
      for (const form of [[], ['--plain'], ['--json']]) {
        const net = memoryNetwork({ behaviour: (_h, i) => ({ ms: 180 + (i % 3), phases: { dnsMs: 2, tcpMs: 150, tlsMs: 151 } }) });
        const stdout = captureStream();
        const stderr = captureStream();
        await main([...argv, ...form], {
          stdout, stderr, env: {}, version: '0.0.0', onSignal: () => () => {}, now: () => net.clock.t, concurrency: 1,
          createTransport: (/** @type {any} */ o) => createNodeTransport({ ...o, startFor: net.startFor, agentFor: net.agentFor }),
        });
        const all = stdout.text() + '\n' + stderr.text();
        assert.deepEqual(scanVocabulary(all).map((h) => h.ruleId + ': ' + h.lineText), [], argv.concat(form).join(' '));
      }
    }
  });
});

describe('bytes', () => {
  test('no raw control, bidi or format character in any file under src (Trojan Source)', () => {
    const hidden = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u2028\u2029]/;
    for (const f of filesUnder(path.join(REPO, 'src'))) {
      const at = f.text.search(hidden);
      assert.equal(at, -1, f.rel + ' carries a raw invisible character near: ' + JSON.stringify(f.text.slice(Math.max(0, at - 20), at + 20)));
    }
  });

  test('command line code is ASCII: anything else in a string or a pattern is written as an escape', () => {
    for (const f of cliFiles()) {
      f.text.split('\n').forEach((line, i) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
        assert.equal(/[^\t\x20-\x7E]/.test(line), false, f.rel + ':' + (i + 1));
      });
    }
  });
});

describe('shape', () => {
  test('bin.js is a shebang and one import, with no copy of its own', () => {
    const text = readFileSync(path.join(CLI, 'bin.js'), 'utf8');
    const lines = text.split('\n');
    assert.equal(lines[0], '#!/usr/bin/env node');
    const code = lines.filter((l) => l.trim() && !l.startsWith('#!') && !/^\s*\/\//.test(l));
    assert.deepEqual(code, [
      "import { main } from './main.js';",
      'process.exitCode = await main(process.argv.slice(2));',
    ]);
    assert.equal(text.includes('\r'), false, 'LF only, or the shebang breaks on a POSIX system');
  });

  test('the command line imports only the Node modules it declares, each where it is needed', () => {
    const allowed = {
      'src/cli/transport.js': ['node:https'],
      'src/cli/commands.js': ['node:events'],
      'src/cli/main.js': ['node:fs'],
    };
    for (const f of cliFiles()) {
      // Static imports and re-exports, side effect imports, dynamic imports and require, in code:
      // a JSDoc type such as import('node:events').EventEmitter loads nothing.
      const code = f.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const specs = [
        ...code.matchAll(/^\s*(?:import|export)\s[^;'"\x60]*?\bfrom\s+['"]([^'"]+)['"]/gms),
        ...code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
        ...code.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g),
        ...code.matchAll(/\brequire\s*\(\s*['"`]([^'"`]+)['"`]/g),
      ].map((m) => m[1]);
      const external = specs.filter((s) => !s.startsWith('.'));
      assert.deepEqual(external.sort(), [...(/** @type {any} */ (allowed)[f.rel] || [])].sort(), f.rel);
    }
  });

  test('nothing the page builds imports the command line, so its budget and its isomorphism hold', () => {
    for (const dir of ['core', 'measure', 'ui', 'render', 'globe']) {
      for (const f of filesUnder(path.join(REPO, 'src', dir))) {
        assert.equal(/['"`](?:\.\.?\/)+cli\//.test(f.text), false, f.rel);
      }
    }
    const build = readFileSync(path.join(REPO, 'scripts', 'build.mjs'), 'utf8');
    assert.equal(/src\/cli/.test(build), false);
  });

  test('zero dependencies stay zero', () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.dependencies || {}, {});
    assert.deepEqual(pkg.devDependencies || {}, {});
  });
});

describe('bin.js as a real process, offline commands only', () => {
  const bin = path.join(CLI, 'bin.js');
  /** @param {string[]} args @param {Record<string,string>} [env] */
  const run = (args, env = {}) => {
    /** @type {Record<string, string|undefined>} */
    const clean = { ...process.env };
    for (const k of ['NO_COLOR', 'FORCE_COLOR', 'COLUMNS', 'NODE_TLS_REJECT_UNAUTHORIZED']) delete clean[k];
    Object.assign(clean, env);
    return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: clean, timeout: 30000 });
  };

  test('--version prints the manifest version and exits 0', () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    const r = run(['--version']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'photontax ' + pkg.version + '\n');
    assert.equal(r.stderr, '');
  });

  test('a usage error exits 2 and writes only to stderr', () => {
    const r = run(['--frobnicate']);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.ok(r.stderr.startsWith('photontax: unknown option "--frobnicate"'));
  });

  test('measure with no city is a usage error before anything is contacted', () => {
    const r = run(['measure']);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
  });

  test('piped output, which is not a terminal, carries no escape code even when a terminal would', () => {
    const r = run(['plan']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.includes('\u001b'), false);
    assert.ok(r.stdout.includes('96 [COMPUTED]'));
  });

  test('FORCE_COLOR colours piped output, and NO_COLOR still wins over it', () => {
    assert.ok(run(['plan'], { FORCE_COLOR: '1' }).stdout.includes('\u001b['));
    assert.equal(run(['plan'], { FORCE_COLOR: '1', NO_COLOR: '1' }).stdout.includes('\u001b'), false);
  });

  test('--json prints one parseable document naming its schema', () => {
    const r = run(['cities', '--json']);
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).schema, 'photontax.cli/1');
  });

  test('COLUMNS narrows the text, and the self test passes in a fresh process', () => {
    const r = run(['selftest'], { COLUMNS: '40' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(COPY.selftestAllPassed));
  });
});
