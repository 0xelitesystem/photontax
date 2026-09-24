// Which files count as SHIPPED COPY, and which are deliberately exempt. Shared by every gate.
//
// DESIGN 7.4 runs the vocabulary grep on index.html and README.md. This repo scans more than
// that, because the page is assembled from src/ at build time, so a banned phrase written into
// a module today becomes shipped copy tomorrow. Catching it in the module is catching it
// earlier, which is the whole value of a gate.
//
// There are exactly two exemptions and both are structural rather than convenient:
//
//   src/core/vocabulary.js   IS the registry of banned terms. A registry that cannot name what
//                            it bans is not a registry.
//   scripts/                 the gates themselves and their positive control fixtures, which
//                            must contain violations in order to prove they are detected.
//
// Nothing else is exempt. There is no per line opt out marker and there will not be one: an
// opt out that a copywriter can reach is an opt out that ends up in the copy.

import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Directories scanned for shipped copy, relative to the repo root.
 *
 * `assets` holds the deferred globe file (DESIGN 6.3). It is generated, it is served to
 * visitors, and it is therefore shipped copy: the vocabulary scan, the badge scan and the side
 * channel scan all have to read it, or splitting the payload would be a way of moving code out
 * from under four gates.
 */
const SCAN_DIRS = ['src', 'docs', 'assets'];

/**
 * Individual files scanned.
 *
 * index.html is the SHIPPED PAGE and it lives at the repo ROOT, because six checks in
 * _runner/pregate.sh --flagship read "$D/index.html" with the path written out: the doctype
 * check, the dash check, the banned colour check, the muted text rule, and the whole GEO block.
 * Listing it here is what makes the four local gates scan the same file the authoritative gate
 * scans, so a failure arrives at the desk of whoever caused it rather than at ship time.
 *
 * USAGE.md joined in v0.2. It is the guide a reader follows, it will document the command line,
 * and a banned phrase in it reaches exactly the same reader as one in the README. Before this it
 * was read by no gate at all. gate-vocabulary plants a violation in every entry of this list and
 * proves each one is caught, so an entry that stops being read fails the gate.
 */
export const SCAN_FILES = Object.freeze(['README.md', 'index.html', 'USAGE.md']);

/** Exempt, with the reason. Printed by every gate run so the list cannot grow unnoticed. */
export const EXEMPT = Object.freeze([
  Object.freeze({
    file: 'src/core/vocabulary.js',
    reason: 'It is the registry of banned terms and must contain them to define them.',
  }),
]);

const EXEMPT_PATHS = new Set(EXEMPT.map((e) => e.file));

const TEXT_EXT = new Set(['.js', '.mjs', '.html', '.css', '.md', '.json', '.svg', '.txt']);

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      out.push(...await walk(full));
    } else if (TEXT_EXT.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every shipped copy file, as {rel, abs, text}.
 * @param {string} [root]
 * @returns {Promise<{rel:string, abs:string, text:string}[]>}
 */
export async function shippedCopy(root = REPO) {
  /** @type {string[]} */
  const files = [];
  for (const d of SCAN_DIRS) files.push(...await walk(path.join(root, d)));
  for (const f of SCAN_FILES) {
    const abs = path.join(root, f);
    try { await stat(abs); files.push(abs); } catch { /* not written yet */ }
  }
  const out = [];
  for (const abs of files.sort()) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (EXEMPT_PATHS.has(rel)) continue;
    out.push({ rel, abs, text: await readFile(abs, 'utf8') });
  }
  return out;
}

/** Console helpers shared by the gates, so every gate reports in the same shape. */
export const say = {
  /** @param {string} m */
  pass: (m) => console.log('  PASS  ' + m),
  /** @param {string} m */
  fail: (m) => console.log('  FAIL  ' + m),
  /** @param {string} m */
  note: (m) => console.log('  NOTE  ' + m),
  /** @param {string} m */
  head: (m) => console.log('\n== ' + m + ' =='),
};

/**
 * True when this module file is the process entry point.
 *
 * Every gate is both a runnable script and a library of scanner functions that the test suite
 * imports. Without this guard, importing a gate to unit test its scanner RUNS the gate and
 * calls process.exit, which kills the test runner. That happened, which is why this exists.
 *
 * @param {string} importMetaUrl
 * @returns {boolean}
 */
export function isMain(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(fileURLToPath(importMetaUrl)) === path.resolve(entry);
  } catch {
    return false;
  }
}
