// What npm publishes, held to the code. DESIGN-CLI section 0 items 5, 17, 18 and 19.
//
//   The whitelist: package.json "files" is LICENSE plus exactly the modules the command line
//   loads, walked from bin.js through every static import. A module the command line starts to
//   import and "files" does not name would install a broken command; a file "files" names and
//   nothing loads is weight nobody asked for. Both directions fail here. Where Node can report
//   what it actually resolved (module.registerHooks), a child process started on the real bin
//   is asked too, so the walk below is checked against the loader rather than trusted.
//   The bin: one entry, src/cli/bin.js, under src/ where every gate looks.
//   The publish check: prepublishOnly runs verify:ci, which needs no browser and no network, and
//   which may only leave out of verify the one step that downloads its source.
//   The release workflow: every action pinned to a full commit, the two DESIGN-CLI names.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const BIN = 'src/cli/bin.js';

/**
 * Static import and re-export statements, at the start of a line so that a JSDoc
 * `{import('...')}` type or a commented out line is never mistaken for one.
 */
const STATIC_IMPORT = /^[ \t]*(?:import|export)[ \t]+(?:[^'"`;]*?[\s}*]from[ \t]*)?['"]([^'"]+)['"]/gm;
const STATIC_SIDE_EFFECT = /^[ \t]*import[ \t]*['"]([^'"]+)['"]/gm;

/** A dynamic import() call in code, which a static walk could not follow. Comment lines are skipped. */
function dynamicImports(text) {
  return text.split('\n').filter((line) => {
    const s = line.trim();
    if (s.startsWith('*') || s.startsWith('//') || s.startsWith('/*')) return false;
    return /(?<![\w$.{])import\s*\(/.test(s);
  });
}

/**
 * Every repository file the command line loads, walked from bin.js, and every non relative
 * specifier it names.
 * @returns {{files:string[], external:string[]}}
 */
function cliGraph() {
  const seen = new Set();
  const external = new Set();
  /** @param {string} rel */
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const text = readFileSync(path.join(REPO, ...rel.split('/')), 'utf8');
    assert.deepEqual(dynamicImports(text), [], rel + ' has a dynamic import, which this walk cannot follow');
    const specs = [...text.matchAll(STATIC_IMPORT), ...text.matchAll(STATIC_SIDE_EFFECT)].map((m) => m[1]);
    for (const spec of specs) {
      if (spec.startsWith('.')) walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
      else external.add(spec);
    }
  };
  walk(BIN);
  return { files: [...seen].sort(), external: [...external].sort() };
}

describe('package.json names the command line and exactly the files it loads', () => {
  test('one bin, src/cli/bin.js, and no top level bin directory', () => {
    assert.deepEqual(PKG.bin, { photontax: BIN });
    assert.equal(existsSync(path.join(REPO, 'bin')), false);
    assert.ok(readFileSync(path.join(REPO, BIN), 'utf8').startsWith('#!/usr/bin/env node\n'));
  });

  test('a released version, the Node floor, and zero dependencies', () => {
    assert.match(PKG.version, /^\d+\.\d+\.\d+$/);
    assert.equal(PKG.engines.node, '>=22');
    assert.equal(PKG.type, 'module');
    assert.deepEqual(PKG.dependencies || {}, {});
    assert.deepEqual(PKG.devDependencies || {}, {});
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(PKG.scripts[hook], undefined, 'no ' + hook + ' script runs on anyone\'s machine');
    }
  });

  test('"files" is LICENSE plus the import graph of bin.js, in both directions', () => {
    const { files } = cliGraph();
    assert.deepEqual(PKG.files, ['LICENSE', ...files]);
  });

  test('the graph reaches only Node\'s own modules outside the package', () => {
    const { external } = cliGraph();
    assert.ok(external.length > 0);
    for (const spec of external) assert.ok(spec.startsWith('node:'), spec);
  });

  test('every entry is a file that exists, and nothing from the tests, the scripts or the page ships', () => {
    for (const f of PKG.files) {
      assert.ok(statSync(path.join(REPO, ...f.split('/'))).isFile(), f);
      assert.equal(/[*?!]/.test(f), false, f + ' is a pattern; the whitelist names files');
      assert.equal(/^(?:test|scripts|assets|docs|node_modules|\.github)\//.test(f), false, f);
      assert.equal(/^src\/(?:globe|render)\//.test(f), false, f + ' belongs to the page');
      assert.equal(/(?:^|\/)(?:index\.html|vocabulary\.js|fixture\.js|dom\.js|page\.js|main\.js)$/.test(f) && f !== 'src/cli/main.js', false, f);
    }
  });

  test('the loader agrees with the walk, where Node can report what it resolved', { skip: typeof module.registerHooks !== 'function' && 'module.registerHooks needs Node 22.15 or later' }, () => {
    const hook = "import{registerHooks}from'node:module';import{writeSync}from'node:fs';"
      + "registerHooks({resolve(s,c,n){const r=n(s,c);writeSync(2,'RESOLVED '+r.url+'\\n');return r;}});";
    const r = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(hook), path.join(REPO, BIN), '--version'], {
      encoding: 'utf8',
      cwd: REPO,
      timeout: 30000,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'photontax ' + PKG.version + '\n');
    const root = pathToFileURL(REPO + path.sep).href;
    const resolved = [...new Set(r.stderr.split('\n').filter((l) => l.startsWith('RESOLVED ')).map((l) => l.slice('RESOLVED '.length).trim()))];
    const files = resolved.filter((u) => u.startsWith(root)).map((u) => decodeURIComponent(u.slice(root.length))).sort();
    const builtins = resolved.filter((u) => !u.startsWith('file:')).sort();
    const { files: walked, external } = cliGraph();
    assert.deepEqual(files, walked);
    assert.deepEqual(builtins, external);
  });
});

describe('the publish check needs no browser and no network', () => {
  /** @param {string} name @returns {string[]} the npm scripts a script runs, in order */
  const steps = (name) => {
    const body = PKG.scripts[name];
    assert.equal(typeof body, 'string', name);
    return body.split('&&').map((s) => s.trim()).map((s) => (s === 'npm test' ? 'test' : s.replace(/^npm run /, '')));
  };

  test('prepublishOnly runs verify:ci, and verify:ci runs only scripts that exist', () => {
    assert.equal(PKG.scripts.prepublishOnly, 'npm run verify:ci');
    for (const s of steps('verify:ci')) assert.equal(typeof PKG.scripts[s], 'string', s);
  });

  test('verify:ci is verify, in the same order, less only the step that downloads its source', () => {
    const full = steps('verify');
    const ci = steps('verify:ci');
    assert.deepEqual(full.filter((s) => s !== 'coastline:check'), ci);
    // Why that one step: it fetches the Natural Earth source to rebuild the globe outline, which
    // is part of the page and not of the package. A publish must not depend on a third party
    // host being up, or on its moving branch being unchanged.
    assert.match(readFileSync(path.join(REPO, 'scripts', 'build-coastline.mjs'), 'utf8'), /await fetch\(SOURCE_URL\)/);
  });

  test('no step of verify:ci opens a browser, a socket or a live measurement', () => {
    for (const s of steps('verify:ci')) {
      const body = PKG.scripts[s];
      assert.equal(/measure-fcp|globe-validate|refresh-endpoints|build-coastline/.test(body), false, s + ': ' + body);
      if (s === 'physics:check') assert.match(body, /--offline/);
    }
  });
});

describe('the release workflow', () => {
  const yml = readFileSync(path.join(REPO, '.github', 'workflows', 'release.yml'), 'utf8');

  test('every action is pinned to a full commit, and these are the two DESIGN-CLI names', () => {
    const uses = [...yml.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
    assert.deepEqual(uses, [
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    ]);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/);
  });

  test('a v tag publishes with provenance after checking it names this version; a manual run only rehearses', () => {
    assert.match(yml, /tags: \['v\*'\]/);
    assert.match(yml, /workflow_dispatch:/);
    assert.match(yml, /want="v\$\(node -p "require\('\.\/package\.json'\)\.version"\)"/);
    assert.match(yml, /run: npm publish --dry-run/);
    assert.match(yml, /run: npm publish --provenance --access public/);
    assert.match(yml, /persist-credentials: false/);
    assert.match(yml, /^permissions:\n {2}contents: read$/m);
    assert.equal(/npm (?:install|ci)\b/.test(yml), false, 'nothing is installed on the runner');
  });
});

describe('the release notes', () => {
  test('docs/CHANGELOG.md has an entry for the version package.json names, and the root has no changelog', () => {
    const log = readFileSync(path.join(REPO, 'docs', 'CHANGELOG.md'), 'utf8');
    assert.ok(log.split('\n').includes('## ' + PKG.version), 'a "## ' + PKG.version + '" heading');
    assert.equal(existsSync(path.join(REPO, 'CHANGELOG.md')), false);
  });
});
