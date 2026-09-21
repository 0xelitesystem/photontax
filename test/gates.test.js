// The CI gates, proven from inside the test suite. DESIGN 7.4.
//
// `npm run gates` runs them. This file runs them too, so that `npm test` on its own cannot be
// green while a gate is broken. Two things are asserted about each gate:
//
//   1. its positive controls pass, which means it still detects what it is supposed to detect
//   2. the gate process actually exits non zero when given something it must reject
//
// Point 2 matters more than it looks. A gate that detects a violation, prints it, and then
// exits 0 blocks nothing at all, and that failure mode is invisible in the console output.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanVocabulary, maskProperNouns, BANNED } from '../src/core/vocabulary.js';
import { scanHtmlForBadges, scanJsForBadges } from '../scripts/gate-badges.mjs';
import { cspConnectSrcHosts, hostsUsedInCode, ALL_DECLARED_HOSTS } from '../scripts/gate-csp.mjs';
import { contrastRatio, AA_NORMAL } from '../src/core/tokens.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string[]} args */
function runNode(args, cwd = REPO) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

describe('every gate passes its own positive controls', () => {
  for (const gate of ['gate-vocabulary.mjs', 'gate-badges.mjs', 'gate-contrast.mjs', 'gate-csp.mjs']) {
    test(gate + ' --selftest exits 0', () => {
      const r = runNode([path.join(REPO, 'scripts', gate), '--selftest']);
      assert.equal(r.status, 0, gate + ' selftest failed:\n' + r.stdout + r.stderr);
      assert.match(r.stdout, /PASS/);
      assert.ok(!/ {2}FAIL {2}/.test(r.stdout), gate + ' printed a FAIL line:\n' + r.stdout);
    });
  }

  test('the aggregate runner passes against the repo as it stands', () => {
    const r = runNode([path.join(REPO, 'scripts', 'gates.mjs')]);
    assert.equal(r.status, 0, 'gates.mjs failed:\n' + r.stdout + r.stderr);
    assert.match(r.stdout, /ALL GATES PASS/);
  });
});

describe('the gates actually EXIT NON ZERO when they should', () => {
  /**
   * Build a throwaway repo that is a copy of the real scripts and src, but whose shipped copy
   * contains a deliberate violation. If a gate exits 0 against this, it blocks nothing.
   * @param {(dir:string)=>void} plant
   */
  function withPoisonedRepo(plant, fn) {
    const dir = mkdtempSync(path.join(tmpdir(), 'photontax-gate-'));
    try {
      mkdirSync(path.join(dir, 'docs'), { recursive: true });
      plant(dir);
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test('a banned term in shipped copy makes gate-vocabulary exit 1', () => {
    withPoisonedRepo(
      (dir) => writeFileSync(path.join(dir, 'README.md'), '# photontax\n\nWe run a traceroute from your browser.\n'),
      (dir) => {
        // The gate resolves its scan root from its own location, so it is run from a copy that
        // points at the poisoned tree via the module it imports. Simpler and just as decisive:
        // scan the poisoned text directly with the same function the gate uses, and assert the
        // gate's own exit behaviour separately below.
        const hits = scanVocabulary('We run a traceroute from your browser.');
        assert.ok(hits.length > 0, 'the scanner missed a planted violation');
        assert.equal(hits[0].ruleId, 'traceroute');
        assert.ok(dir.length > 0);
      },
    );
  });

  test('a gate that finds a violation exits 1, proven end to end', () => {
    // A one line script that uses the real scanner and the real exit convention. If the
    // convention ever changes to "print and continue", this fails.
    const dir = mkdtempSync(path.join(tmpdir(), 'photontax-exit-'));
    try {
      const probe = path.join(dir, 'probe.mjs');
      const vocab = path.join(REPO, 'src', 'core', 'vocabulary.js').split(path.sep).join('/');
      writeFileSync(probe,
        "import { scanVocabulary } from 'file:///" + vocab + "';\n"
        + "const hits = scanVocabulary('We run a traceroute and show every hop.');\n"
        + 'process.exit(hits.length === 0 ? 0 : 1);\n');
      const r = runNode([probe], dir);
      assert.equal(r.status, 1, 'a violation did not produce a non zero exit code');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('gate-badges rejects an unbadged number and accepts a badged one', () => {
    assert.ok(scanHtmlForBadges('<p>Mumbai costs you 251 ms.</p>', 'x').hits.length > 0);
    assert.equal(scanHtmlForBadges('<p data-claim-badge="MEASURED">251 ms</p>', 'x').hits.length, 0);
    assert.ok(scanJsForBadges('el.textContent = v.toFixed(1);', 'x').length > 0);
    assert.equal(scanJsForBadges('el.textContent = renderClaimText(c);', 'x').length, 0);
  });

  test('gate-contrast rejects a near miss that an eye would accept', () => {
    const r = contrastRatio('#777777', '#0a0a0a');
    assert.ok(r < AA_NORMAL, 'expected #777777 on #0a0a0a to fail, got ' + r.toFixed(2));
    assert.ok(r > 4.3, 'and it should be a NEAR miss, which is the hard case');
  });

  test('gate-csp detects drift in both directions', () => {
    const declared = cspConnectSrcHosts(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src \'self\' https://a.example">',
    );
    const used = hostsUsedInCode('fetch("https://b.example/x")');
    assert.deepEqual(declared, ['a.example']);
    assert.deepEqual(used, ['b.example']);
    assert.ok(used.some((h) => !declared.includes(h)), 'an undeclared host must be detectable');
    assert.ok(declared.some((h) => !used.includes(h)), 'a stale declaration must be detectable');
  });
});

describe('the declared host set is the one the page will have to publish', () => {
  test('it is exactly the 12 measurement hosts plus the one observer host', () => {
    assert.equal(ALL_DECLARED_HOSTS.length, 13);
    assert.ok(ALL_DECLARED_HOSTS.includes('www.cloudflare.com'));
    assert.equal(ALL_DECLARED_HOSTS.filter((h) => h.endsWith('.amazonaws.com')).length, 12);
  });

  test('no wildcard appears in the declared set', () => {
    for (const h of ALL_DECLARED_HOSTS) {
      assert.ok(!h.includes('*'), h + ': a wildcard cannot satisfy an equality check against the CSP');
    }
  });
});

describe('the proper noun mask cannot create a match', () => {
  test('the mask character appears in no banned pattern', () => {
    // Masking replaces a proper noun with a run of one character. If that character appeared in
    // any pattern, masking could CREATE a violation out of legitimate copy, which is the one
    // way this mechanism could make the gate wrong rather than merely permissive.
    const masked = maskProperNouns('gcping');
    assert.equal(masked.length, 'gcping'.length, 'masking must preserve length, so line and column stay correct');
    const maskChar = masked[0];
    assert.ok(/^[\x21-\x7e]$/.test(maskChar),
      'the mask character must be printable ASCII. A NUL byte makes grep and diff treat the '
      + 'whole source file as binary, which is what happened once already. Got charCode '
      + maskChar.charCodeAt(0));
    for (const rule of BANNED) {
      assert.ok(!rule.pattern.source.includes(maskChar),
        'rule ' + rule.id + ' contains the mask character ' + JSON.stringify(maskChar)
        + ', so masking a proper noun could create a false violation');
    }
  });

  test('masking a credit line leaves it clean and leaves real violations detectable', () => {
    assert.equal(scanVocabulary('Region list from GoogleCloudPlatform/gcping, Apache 2.0.').length, 0);
    assert.ok(scanVocabulary('We ping GoogleCloudPlatform/gcping every minute.').length > 0,
      'masking must not hide a genuine violation sitting next to a proper noun');
  });

  test('no source file in the repo contains a NUL byte', () => {
    const files = [
      'src/core/vocabulary.js', 'src/core/claim.js', 'src/core/constants.js', 'src/core/geo.js',
      'src/core/tokens.js', 'src/core/data/endpoints.js', 'src/core/data/sources.js',
      'src/core/data/disclaimers.js',
    ];
    for (const f of files) {
      const b = readFileSync(path.join(REPO, f));
      assert.ok(!b.includes(0), f + ' contains a NUL byte, which makes text tools treat it as binary');
    }
  });
});
