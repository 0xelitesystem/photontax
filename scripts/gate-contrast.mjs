#!/usr/bin/env node
// GATE 3: WCAG AA BY MATH. DESIGN 6.6, DESIGN 7.3, trap 19, and the standing house rule.
//
//   node scripts/gate-contrast.mjs             check every declared pair in both themes
//   node scripts/gate-contrast.mjs --selftest  run the positive controls only
//
// BY MATH, NOT BY RENDERING. This is the whole point and it is worth stating plainly, because
// the failure it prevents has already happened in this account: a render based check only sees
// the colours that happen to be painted at the moment it runs. Semantic tokens only paint once
// a tool produces a result, so an empty page has nothing to measure and the check passes while
// the token is broken. That is exactly how one bad value reached 137 repositories.
//
// This gate reads src/core/tokens.js, walks PAIRS, and computes the WCAG 2.x relative
// luminance ratio for each pair in both themes. It never opens a browser.
//
// Every pair is gated at 4.5:1, the normal text threshold. Nothing here uses the 3.0:1 large
// text allowance. The numbers on this page are small, they ARE the product, and a reader
// squinting at a latency figure is the wrong place to spend a concession.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { THEMES, PAIRS, AA_NORMAL, contrastRatio, relativeLuminance } from '../src/core/tokens.js';
import { BANNED_COLOURS, BANNED_COLOUR_REPLACEMENTS } from './banned-colours.mjs';
import { REPO, shippedCopy, say, isMain } from './_shipped.mjs';

/* -----------------------------------------------------------------------------------------
 * POSITIVE CONTROLS. Two kinds, and both are needed.
 *
 *   arithmetic   values whose WCAG ratio is known independently, so a bug in the luminance
 *                formula itself is caught. Black on white is exactly 21, and a colour against
 *                itself is exactly 1. Those two are not opinions.
 *   failing pair a pairing that MUST be rejected. #777777 on #0a0a0a computes to 4.42, just
 *                under the 4.5 threshold, which is precisely the kind of near miss an eye
 *                accepts and arithmetic does not.
 * --------------------------------------------------------------------------------------- */

const ARITHMETIC = [
  { a: '#000000', b: '#ffffff', expect: 21, tol: 1e-9, why: 'black on white is exactly 21:1' },
  { a: '#ffffff', b: '#ffffff', expect: 1, tol: 1e-9, why: 'a colour against itself is exactly 1:1' },
  { a: '#0a0a0a', b: '#0a0a0a', expect: 1, tol: 1e-9, why: 'order independence and identity' },
  { a: '#d4ff3a', b: '#0a0a0a', expect: 17.12, tol: 0.005, why: 'accent on ink, DESIGN 6.6 table' },
  { a: '#e6e6e6', b: '#0a0a0a', expect: 15.86, tol: 0.005, why: 'body text on ink, DESIGN 6.6 table' },
  { a: '#b9c0c7', b: '#0a0a0a', expect: 10.77, tol: 0.005, why: 'secondary on ink, DESIGN 6.6 table' },
  { a: '#9aa0a6', b: '#0a0a0a', expect: 7.50, tol: 0.005, why: 'least prominent on ink, DESIGN 6.6 table' },
  { a: '#7ee0c8', b: '#0a0a0a', expect: 12.62, tol: 0.005, why: 'MEASURED badge, DESIGN 6.6 table' },
  { a: '#f0b429', b: '#0a0a0a', expect: 10.62, tol: 0.005, why: 'INFERRED badge, DESIGN 6.6 table' },
  { a: '#8ab4f8', b: '#0a0a0a', expect: 9.39, tol: 0.005, why: 'REPORTED badge, DESIGN 6.6 table' },
  { a: '#2d6b00', b: '#e8ebef', expect: 5.46, tol: 0.005, why: 'light theme accent, DESIGN 6.6 table' },
];

const MUST_REJECT = [
  { a: '#777777', b: '#0a0a0a', why: 'a near miss at 4.42, which an eye accepts and arithmetic does not' },
  { a: '#a05a00', b: '#e8ebef', why: 'a banned house colour that shipped broken once already' },
  { a: '#8a8a8a', b: '#ffffff', why: 'mid grey on white, a classic secondary text failure' },
];

function selftest() {
  say.head('gate-contrast positive controls');
  let bad = 0;

  for (const c of ARITHMETIC) {
    const r = contrastRatio(c.a, c.b);
    const ok = Math.abs(r - c.expect) <= c.tol;
    if (ok) say.pass(c.a + ' on ' + c.b + ' = ' + r.toFixed(4) + '  (' + c.why + ')');
    else { say.fail(c.a + ' on ' + c.b + ' = ' + r.toFixed(4) + ', expected ' + c.expect + '  (' + c.why + ')'); bad += 1; }
  }

  for (const c of MUST_REJECT) {
    const r = contrastRatio(c.a, c.b);
    if (r < AA_NORMAL) say.pass('correctly rejected ' + c.a + ' on ' + c.b + ' = ' + r.toFixed(2) + '  (' + c.why + ')');
    else { say.fail('NOT rejected: ' + c.a + ' on ' + c.b + ' = ' + r.toFixed(2) + ' (this gate would let it ship)'); bad += 1; }
  }

  // The luminance function itself must refuse malformed input rather than return NaN, because
  // a NaN ratio compares false against the threshold and silently passes.
  for (const junk of ['red', '#fff', '#12345', 'rgb(0,0,0)', '']) {
    let threw = false;
    try { relativeLuminance(/** @type {any} */ (junk)); } catch { threw = true; }
    if (threw) say.pass('rejected malformed colour ' + JSON.stringify(junk));
    else { say.fail('accepted malformed colour ' + JSON.stringify(junk) + ', which would produce a NaN ratio that passes every comparison'); bad += 1; }
  }

  return bad;
}

async function scanTokens() {
  say.head('gate-contrast: declared pairs');
  let bad = 0;
  let checked = 0;

  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const pair of PAIRS) {
      const bg = theme.surface[pair.surface];
      const fg = theme.text[pair.text];
      if (!bg) { say.fail(themeName + ': PAIRS names surface "' + pair.surface + '" which does not exist'); bad += 1; continue; }
      if (!fg) { say.fail(themeName + ': PAIRS names text token "' + pair.text + '" which does not exist'); bad += 1; continue; }
      const r = contrastRatio(fg, bg);
      checked += 1;
      const label = themeName.padEnd(5) + ' ' + pair.text.padEnd(14) + fg + ' on ' + pair.surface.padEnd(11) + bg + '  ' + r.toFixed(2) + ':1';
      if (r >= AA_NORMAL) say.pass(label);
      else { say.fail(label + '  BELOW ' + AA_NORMAL); bad += 1; }
    }
  }

  // Every text token must appear in PAIRS at least once. An unpaired token is a colour nobody
  // has checked, sitting in the file waiting for somebody to use it.
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const name of Object.keys(theme.text)) {
      if (!PAIRS.some((p) => p.text === name)) {
        say.fail(themeName + ': text token "' + name + '" is declared but appears in no PAIRS entry, '
          + 'so nothing has ever checked it. Pair it or delete it.');
        bad += 1;
      }
    }
  }

  if (bad === 0) say.pass(checked + ' declared pairs checked by math across both themes, all at or above ' + AA_NORMAL + ':1');
  return bad;
}

/**
 * NOTHING UNDER src/ IS EXEMPT FROM THIS SCAN.
 *
 * It used to be: src/core/tokens.js declared the banned list, so it had to name the values the
 * scan rejects, so it had to be skipped. The list now lives in scripts/banned-colours.mjs,
 * which is not shipped copy and which nothing under src/ imports, and the exemption went with
 * it. Every file that can become part of the page is scanned, with no opt out anywhere.
 */
const BANNED_COLOUR_SCAN_EXEMPT = null;

async function scanForBannedColours() {
  say.head('gate-contrast: banned values and the muted rule');
  say.note('no file under src/ is exempt from the banned colour scan');
  let bad = 0;
  const files = await shippedCopy();

  for (const f of files) {
    for (const c of BANNED_COLOURS) {
      const re = new RegExp(c.replace('#', '#'), 'gi');
      let m;
      while ((m = re.exec(f.text)) !== null) {
        const line = f.text.slice(0, m.index).split('\n').length;
        say.fail(f.rel + ':' + line + '  banned colour ' + c
          + '. Use ' + BANNED_COLOUR_REPLACEMENTS[c] + ' instead.');
        bad += 1;
      }
    }
    const muted = /color\s*:\s*var\(\s*--muted\s*\)/gi;
    let m;
    while ((m = muted.exec(f.text)) !== null) {
      const line = f.text.slice(0, m.index).split('\n').length;
      say.fail(f.rel + ':' + line + '  --muted used as a text colour. It is a border token and '
        + 'it fails AA in both themes at every size this page uses.');
      bad += 1;
    }
  }

  // There is no muted text token in tokens.js at all, which is the stronger form of the rule.
  for (const [themeName, theme] of Object.entries(THEMES)) {
    if ('muted' in theme.text) {
      say.fail(themeName + ': tokens.js declares a "muted" TEXT token. It must not exist.');
      bad += 1;
    }
  }

  if (bad === 0) say.pass('no banned colour values, no muted text token');
  return bad;
}

/**
 * Any hard coded hex in the shipped CSS or HTML that is not a declared token is a colour the
 * gate has never checked. Reported as a note rather than a failure while the page does not yet
 * exist, and promoted to a failure once it does, so the UI team is told the rule in advance.
 */
async function scanForUndeclaredHex() {
  say.head('gate-contrast: undeclared colours');
  const files = await shippedCopy();
  const declared = new Set();
  for (const theme of Object.values(THEMES)) {
    for (const group of [theme.surface, theme.text, theme.line]) {
      for (const v of Object.values(group)) declared.add(v.toLowerCase());
    }
  }
  declared.add('#000000');
  declared.add('#ffffff');

  let bad = 0;
  const pageExists = files.some((f) => f.rel.endsWith('.html'));
  for (const f of files) {
    if (!f.rel.endsWith('.html') && !f.rel.endsWith('.css')) continue;
    const re = /#[0-9a-fA-F]{6}\b/g;
    let m;
    while ((m = re.exec(f.text)) !== null) {
      const hex = m[0].toLowerCase();
      if (declared.has(hex)) continue;
      const line = f.text.slice(0, m.index).split('\n').length;
      say.fail(f.rel + ':' + line + '  ' + hex + ' is not a token in src/core/tokens.js, so no '
        + 'contrast check has ever seen it. Add it as a token with a PAIRS entry, or remove it.');
      bad += 1;
    }
  }
  if (!pageExists) say.note('no shipped HTML or CSS yet. This check engages when docs/index.html exists.');
  else if (bad === 0) say.pass('every colour in the shipped page is a declared, checked token');
  return bad;
}

// Runnable script, and also a library the test suite imports for its scanner functions.
// The guard is what keeps `import` from running the gate and calling process.exit inside
// the test runner.
if (isMain(import.meta.url)) {
  const selftestOnly = process.argv.includes('--selftest');
  let failures = selftest();
  if (!selftestOnly) {
    failures += await scanTokens();
    failures += await scanForBannedColours();
    failures += await scanForUndeclaredHex();
  }

  console.log(failures === 0 ? '\ngate-contrast: PASS' : '\ngate-contrast: FAIL (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}
