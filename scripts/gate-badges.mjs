#!/usr/bin/env node
// GATE 2: THE BADGE CHECK. DESIGN 7.4 ("fails the build if any numeric literal in the UI lacks
// a provenance badge in the same node"), DESIGN 7.3 (provenance completeness), trap 19.
//
//   node scripts/gate-badges.mjs             scan the shipped page, exit 1 on any bare number
//   node scripts/gate-badges.mjs --selftest  run the positive controls only
//
// Two separate checks, because a number can reach a reader by two different routes.
//
//   A. THE HTML CHECK. Every text node containing a digit must sit inside an element carrying
//      data-claim-badge with one of the four kinds. That attribute is emitted by renderClaim()
//      in src/core/claim.js and by nothing else, so passing this gate and going through the
//      claim system are the same act.
//
//   B. THE JAVASCRIPT CHECK. A number can also be written straight into the DOM at runtime,
//      which the HTML check cannot see in the source. So assignments to textContent, nodeValue
//      and innerHTML are inspected, and any that formats a number without going through
//      renderClaim is a failure. innerHTML and insertAdjacentHTML are refused outright: this
//      page builds DOM with createElement and textContent, and the one construct that could
//      smuggle an unbadged number past check A is also the one construct that could smuggle in
//      markup.
//
//   C. THE TERMINAL WRITER CHECK, added in v0.2 with the command line. A third route, which
//      neither check above can see: a terminal. Only src/cli/out.js may write to one.
//
// THE CHROME EXCEPTION, declared rather than discovered. A page has a few digits that are not
// claims about the world: a copyright year, a version string. Pretending those are MEASURED
// would devalue the badge, so an element may instead carry data-claim-chrome="<reason>". Every
// use is PRINTED by this gate and the total is capped by a number committed in
// scripts/badge-exception-budget.json. The cap cannot rise without a reviewed diff, which is
// the property that stops an exception mechanism from becoming an escape hatch.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BADGE_KINDS } from '../src/core/claim.js';
import { REPO, shippedCopy, say, isMain } from './_shipped.mjs';

const BUDGET_FILE = path.join(REPO, 'scripts', 'badge-exception-budget.json');

/** Elements whose text content is never rendered prose. */
const OPAQUE = new Set(['script', 'style', 'head', 'noscript', 'svg', 'template']);

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr']);

/**
 * @typedef {Object} BadgeHit
 * @property {string} file
 * @property {number} line
 * @property {string} detail
 * @property {string} why
 */

/**
 * Scan HTML for digit bearing text nodes outside a badged element.
 *
 * A deliberately small hand written scanner rather than a parser dependency: this repo has zero
 * dependencies, and the shape being looked for (tag open, tag close, text between) does not
 * need a spec compliant tree.
 *
 * @param {string} html
 * @param {string} file
 * @returns {{hits:BadgeHit[], chrome:{line:number, reason:string}[], badged:number}}
 */
export function scanHtmlForBadges(html, file) {
  /** @type {BadgeHit[]} */
  const hits = [];
  /** @type {{line:number, reason:string}[]} */
  const chrome = [];
  let badged = 0;

  /** @type {{name:string, badge:string|null, chrome:string|null}[]} */
  const stack = [];
  let i = 0;
  let line = 1;

  const lineOf = (offset) => {
    let n = 1;
    for (let k = 0; k < offset; k++) if (html[k] === '\n') n += 1;
    return n;
  };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    const textEnd = lt === -1 ? html.length : lt;
    const text = html.slice(i, textEnd);

    if (text.length) {
      const top = stack[stack.length - 1];
      const inOpaque = stack.some((s) => OPAQUE.has(s.name));
      if (!inOpaque && /\d/.test(text) && text.trim().length > 0) {
        const badgedAncestor = stack.find((s) => s.badge !== null);
        const chromeAncestor = stack.find((s) => s.chrome !== null);
        if (badgedAncestor) {
          badged += 1;
        } else if (chromeAncestor) {
          chrome.push({ line: lineOf(i), reason: /** @type {string} */ (chromeAncestor.chrome) });
        } else {
          hits.push({
            file,
            line: lineOf(i),
            detail: JSON.stringify(text.trim().slice(0, 70))
              + (top ? '  inside <' + top.name + '>' : '  at top level'),
            why: 'A digit reached a rendered text node with no data-claim-badge on it or on any '
              + 'ancestor. Every displayed value is built with measured(), reported(), computed() '
              + 'or inferred() from src/core/claim.js and written through renderClaim(), which '
              + 'emits the attribute. If this digit really is page chrome rather than a claim, '
              + 'put data-claim-chrome="<reason>" on its element and raise the committed budget.',
          });
        }
      }
    }

    if (lt === -1) break;
    const gt = html.indexOf('>', lt);
    if (gt === -1) break;
    const raw = html.slice(lt + 1, gt);
    i = gt + 1;
    line = lineOf(i);

    if (raw.startsWith('!')) continue;            // doctype or comment
    if (raw.startsWith('?')) continue;

    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim().toLowerCase();
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === name) { stack.length = k; break; }
      }
      continue;
    }

    const name = (raw.match(/^[a-zA-Z0-9:-]+/) || [''])[0].toLowerCase();
    if (!name) continue;
    const selfClosing = raw.trimEnd().endsWith('/') || VOID.has(name);
    if (selfClosing) continue;

    const badgeAttr = raw.match(/data-claim-badge\s*=\s*"([^"]*)"/);
    const chromeAttr = raw.match(/data-claim-chrome\s*=\s*"([^"]*)"/);
    if (badgeAttr && !BADGE_KINDS.includes(badgeAttr[1])) {
      hits.push({
        file,
        line,
        detail: 'data-claim-badge="' + badgeAttr[1] + '"',
        why: 'There are exactly four badge kinds: ' + BADGE_KINDS.join(', ') + '. There is no fifth '
          + 'and there is no "unknown".',
      });
    }
    if (chromeAttr && chromeAttr[1].trim().length === 0) {
      hits.push({
        file,
        line,
        detail: 'data-claim-chrome=""',
        why: 'A chrome exception must state its reason. An unexplained exception is an escape hatch.',
      });
    }
    stack.push({
      name,
      badge: badgeAttr ? badgeAttr[1] : null,
      chrome: chromeAttr ? chromeAttr[1] : null,
    });
  }

  return { hits, chrome, badged };
}

/**
 * Scan JavaScript for DOM writes that could put an unbadged number on screen.
 * @param {string} js
 * @param {string} file
 * @returns {BadgeHit[]}
 */
export function scanJsForBadges(js, file) {
  /** @type {BadgeHit[]} */
  const hits = [];
  const lines = js.split('\n');

  lines.forEach((text, idx) => {
    const line = idx + 1;
    const code = text.replace(/\/\/.*$/, '');
    if (/^\s*\*/.test(text) || /^\s*\/\*/.test(text)) return;   // block comment body

    if (/\.innerHTML\s*=/.test(code) || /\.outerHTML\s*=/.test(code) || /insertAdjacentHTML\s*\(/.test(code)) {
      hits.push({
        file,
        line,
        detail: code.trim().slice(0, 90),
        why: 'innerHTML, outerHTML and insertAdjacentHTML are refused in this repo. The page '
          + 'builds DOM with createElement and textContent. The one construct that could put an '
          + 'unbadged number past the HTML check is also the one that could put markup past it.',
      });
      return;
    }

    const write = /\.(textContent|nodeValue|innerText)\s*=\s*(.+)$/.exec(code);
    if (!write) return;
    const rhs = write[2];
    if (/renderClaim(Text)?\s*\(/.test(rhs)) return;            // went through the claim system
    if (/^\s*''\s*;?\s*$/.test(rhs) || /^\s*""\s*;?\s*$/.test(rhs)) return;  // clearing a node

    const formatsANumber = /\btoFixed\s*\(|\btoPrecision\s*\(|\bMath\.round\s*\(|\bNumber\s*\(|\d/.test(rhs);
    if (formatsANumber) {
      hits.push({
        file,
        line,
        detail: code.trim().slice(0, 90),
        why: 'This writes a formatted number straight into the DOM. Route it through '
          + 'renderClaim() so it carries its badge and its method, or the reader receives a '
          + 'number with no statement of where it came from.',
      });
    }
  });

  return hits;
}

/* -----------------------------------------------------------------------------------------
 * C. THE TERMINAL WRITER CHECK. DESIGN-CLI section 0 items 3 and 4.
 *
 * Checks A and B cannot see a terminal: a figure printed with console.log or written to
 * process.stdout is not a DOM write and not an HTML text node. The command line therefore has
 * exactly one writer, src/cli/out.js, which renders every figure through renderClaim and
 * sanitises every byte, and this check fails on any other file under src/cli that reaches a
 * terminal by any route: console, process.stdout or process.stderr (aliased, bracketed or
 * dotted), a write to file descriptor one or two, the tty module, or a device path. The scan is
 * raw text, comments included, like gate-csp, so a construct cannot hide in a comment either.
 * --------------------------------------------------------------------------------------- */

/** Every file under this prefix is held to the rule. */
export const CLI_DIR = 'src/cli/';
/** The one file allowed to write to a terminal. */
export const CLI_SINK = 'src/cli/out.js';

/** @type {readonly [RegExp, string][]} */
const TERMINAL_WRITERS = Object.freeze([
  [/\bconsole\s*(?:\.|\[)/, 'console'],
  [/\bprocess\s*(?:\.\s*|\[\s*['"`])(?:stdout|stderr)\b/, 'process.stdout or process.stderr'],
  [/\bprocess\s*\.\s*_rawDebug\b/, 'the raw debug writer'],
  [/\b(?:writeSync|write)\s*\(\s*[12]\s*,/, 'a write to file descriptor one or two'],
  [/(?:\bfrom\s+|\brequire\s*\(\s*|\bimport\s*\(\s*)['"`](?:node:)?tty['"`]/, 'the tty module'],
  [/\/dev\/(?:stdout|stderr|tty)\b/, 'a terminal device path'],
]);

/**
 * Terminal writes outside the one sink. Pure.
 * @param {string} rel Repo relative path, forward slashes.
 * @param {string} text
 * @returns {BadgeHit[]}
 */
export function scanCliWriters(rel, text) {
  if (!rel.startsWith(CLI_DIR) || rel === CLI_SINK) return [];
  if (!rel.endsWith('.js') && !rel.endsWith('.mjs')) return [];
  /** @type {BadgeHit[]} */
  const hits = [];
  text.split('\n').forEach((line, idx) => {
    for (const [re, what] of TERMINAL_WRITERS) {
      if (!re.test(line)) continue;
      hits.push({
        file: rel,
        line: idx + 1,
        detail: what + ': ' + line.trim().slice(0, 80),
        why: 'Only ' + CLI_SINK + ' may write to a terminal. It renders every figure through '
          + 'renderClaim, so the badge word always travels with the number, and it sanitises every '
          + 'byte, so text from the network cannot reach the terminal as an escape sequence. Build '
          + 'the line from parts and hand it to out.line, out.item or out.note.',
      });
      break;
    }
  });
  return hits;
}

/* -----------------------------------------------------------------------------------------
 * POSITIVE CONTROLS
 * --------------------------------------------------------------------------------------- */

const CLI_MUST_FAIL = [
  { rel: 'src/cli/report.js', js: "console.log('92 ms');" },
  { rel: 'src/cli/main.js', js: 'process.stdout.write(text);' },
  { rel: 'src/cli/main.js', js: 'const w = process.stderr; w.write(text);' },
  { rel: 'src/cli/commands.js', js: "process['stdout'].write(text);" },
  { rel: 'src/cli/report.js', js: 'globalThis.console.error(err);' },
  { rel: 'src/cli/report.js', js: "console['log'](row);" },
  { rel: 'src/cli/report.js', js: 'fs.writeSync(1, line);' },
  { rel: 'src/cli/report.js', js: "import tty from 'node:tty';" },
  { rel: 'src/cli/report.js', js: "fs.createWriteStream('/dev/stdout');" },
  { rel: 'src/cli/nested/deeper.mjs', js: 'console.info(row);' },
  { rel: 'src/cli/report.js', js: '// a comment that says process.stdout.write is fine here' },
];

const CLI_MUST_PASS = [
  { rel: 'src/cli/out.js', js: 'stream.write(text); const s = process.stdout;' },
  { rel: 'src/cli/report.js', js: 'out.line([t(COPY.rowsLead)]);' },
  { rel: 'src/cli/bin.js', js: 'process.exitCode = await main(process.argv.slice(2));' },
  { rel: 'src/cli/main.js', js: "process.on('SIGINT', handler); const env = process.env;" },
  { rel: 'src/ui/page.js', js: 'console.warn(detail);' },
];

const HTML_MUST_FAIL = [
  { name: 'bare number in a cell', html: '<table><tr><td>251 ms</td></tr></table>' },
  { name: 'bare number in a sentence', html: '<p>Mumbai costs you 251 ms.</p>' },
  { name: 'badged ancestor closed before the number', html: '<span data-claim-badge="MEASURED">251 ms</span><p>and 116 ms on the table</p>' },
  { name: 'invalid badge kind', html: '<span data-claim-badge="GUESSED">251 ms</span>' },
  { name: 'chrome exception with no reason', html: '<span data-claim-chrome="">2026</span>' },
];

const HTML_MUST_PASS = [
  { name: 'badged value', html: '<span data-claim-badge="MEASURED" data-claim-unit="ms">251 ms</span>' },
  { name: 'badge on an ancestor', html: '<td data-claim-badge="COMPUTED"><span class="n">127</span> ms</td>' },
  { name: 'digits inside a script block', html: '<script>const x = 251;</script>' },
  { name: 'digits inside a style block', html: '<style>.a{width:251px}</style>' },
  { name: 'no digits at all', html: '<p>Your route is roughly the shape of the cable.</p>' },
];

const JS_MUST_FAIL = [
  { name: 'toFixed into textContent', js: 'el.textContent = ms.toFixed(1);' },
  { name: 'template with a number', js: 'cell.textContent = `${Math.round(v)} ms`;' },
  { name: 'innerHTML at all', js: 'row.innerHTML = markup;' },
  { name: 'insertAdjacentHTML', js: 'root.insertAdjacentHTML("beforeend", frag);' },
];

const JS_MUST_PASS = [
  { name: 'through renderClaim', js: 'el.textContent = renderClaimText(claim);' },
  { name: 'through renderClaim object', js: 'el.textContent = renderClaim(claim).text;' },
  { name: 'clearing a node', js: 'el.textContent = "";' },
  { name: 'plain prose', js: 'el.textContent = verdictText;' },
];

function selftest() {
  say.head('gate-badges positive controls');
  let bad = 0;

  for (const c of HTML_MUST_FAIL) {
    const { hits } = scanHtmlForBadges(c.html, 'control');
    if (hits.length > 0) say.pass('html caught: ' + c.name);
    else { say.fail('html NOT caught (a bare number would ship): ' + c.name + '  ' + c.html); bad += 1; }
  }
  for (const c of HTML_MUST_PASS) {
    const { hits } = scanHtmlForBadges(c.html, 'control');
    if (hits.length === 0) say.pass('html correctly allowed: ' + c.name);
    else { say.fail('html FALSE POSITIVE: ' + c.name + '  ' + hits[0].detail); bad += 1; }
  }
  for (const c of JS_MUST_FAIL) {
    const hits = scanJsForBadges(c.js, 'control');
    if (hits.length > 0) say.pass('js caught: ' + c.name);
    else { say.fail('js NOT caught: ' + c.name + '  ' + c.js); bad += 1; }
  }
  for (const c of JS_MUST_PASS) {
    const hits = scanJsForBadges(c.js, 'control');
    if (hits.length === 0) say.pass('js correctly allowed: ' + c.name);
    else { say.fail('js FALSE POSITIVE: ' + c.name + '  ' + hits[0].detail); bad += 1; }
  }
  for (const c of CLI_MUST_FAIL) {
    const hits = scanCliWriters(c.rel, c.js);
    if (hits.length > 0) say.pass('terminal writer caught in ' + c.rel + ': ' + c.js);
    else { say.fail('terminal writer NOT caught in ' + c.rel + ': ' + c.js); bad += 1; }
  }
  for (const c of CLI_MUST_PASS) {
    const hits = scanCliWriters(c.rel, c.js);
    if (hits.length === 0) say.pass('correctly allowed in ' + c.rel + ': ' + c.js);
    else { say.fail('terminal writer FALSE POSITIVE in ' + c.rel + ': ' + hits[0].detail); bad += 1; }
  }
  return bad;
}

async function readBudget() {
  try {
    const j = JSON.parse(await readFile(BUDGET_FILE, 'utf8'));
    return typeof j.maxChromeExceptions === 'number' ? j.maxChromeExceptions : 0;
  } catch {
    await writeFile(BUDGET_FILE, JSON.stringify({
      _comment: 'Maximum number of data-claim-chrome exceptions allowed in the shipped page. '
        + 'Raising it is a reviewed diff, on purpose. Every use is printed by gate-badges.',
      maxChromeExceptions: 0,
    }, null, 2) + '\n', 'utf8');
    return 0;
  }
}

async function scan() {
  say.head('gate-badges');
  const budget = await readBudget();
  const files = await shippedCopy();
  const html = files.filter((f) => f.rel.endsWith('.html'));
  const js = files.filter((f) => f.rel.endsWith('.js') || f.rel.endsWith('.mjs'));

  if (html.length === 0) {
    say.note('no shipped HTML page yet. The HTML half of this gate has nothing to scan; it is '
      + 'proven by its positive controls above and will engage the moment docs/index.html exists.');
  }

  let bad = 0;
  let chromeTotal = 0;
  let badgedTotal = 0;

  for (const f of html) {
    const r = scanHtmlForBadges(f.text, f.rel);
    badgedTotal += r.badged;
    chromeTotal += r.chrome.length;
    for (const c of r.chrome) say.note('chrome exception ' + f.rel + ':' + c.line + '  reason: ' + c.reason);
    for (const h of r.hits) {
      say.fail(h.file + ':' + h.line + '  ' + h.detail);
      console.log('          ' + h.why);
      bad += 1;
    }
  }

  for (const f of js) {
    // claim.js is the implementation of the badge system. It is the one file allowed to talk
    // about rendering a value, and it contains no DOM write of its own.
    if (f.rel === 'src/core/claim.js') continue;
    for (const h of scanJsForBadges(f.text, f.rel)) {
      say.fail(h.file + ':' + h.line + '  ' + h.detail);
      console.log('          ' + h.why);
      bad += 1;
    }
  }

  let writerHits = 0;
  const cliFiles = js.filter((f) => f.rel.startsWith(CLI_DIR));
  for (const f of cliFiles) {
    for (const h of scanCliWriters(f.rel, f.text)) {
      say.fail(h.file + ':' + h.line + '  ' + h.detail);
      console.log('          ' + h.why);
      writerHits += 1;
    }
  }
  bad += writerHits;
  if (writerHits === 0) {
    say.pass('no terminal write under ' + CLI_DIR + ' outside ' + CLI_SINK
      + ' (' + cliFiles.length + ' command line files read)');
  }

  if (chromeTotal > budget) {
    say.fail('chrome exceptions: ' + chromeTotal + ' used, budget is ' + budget
      + '. Raise maxChromeExceptions in scripts/badge-exception-budget.json deliberately, or '
      + 'badge the value properly.');
    bad += 1;
  } else {
    say.pass('chrome exceptions: ' + chromeTotal + ' of ' + budget + ' allowed');
  }

  if (bad === 0) say.pass(badgedTotal + ' badged numeric nodes, zero unbadged');
  return bad;
}

// Runnable script, and also a library the test suite imports for its scanner functions.
// The guard is what keeps `import` from running the gate and calling process.exit inside
// the test runner.
if (isMain(import.meta.url)) {
  const selftestOnly = process.argv.includes('--selftest');
  let failures = selftest();
  if (!selftestOnly) failures += await scan();

  console.log(failures === 0 ? '\ngate-badges: PASS' : '\ngate-badges: FAIL (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}
