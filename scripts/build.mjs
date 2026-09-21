#!/usr/bin/env node
// THE BUILD. Assembles docs/index.html, the single file this product ships.
//
//   node scripts/build.mjs           write docs/index.html and report the payload
//   node scripts/build.mjs --check   fail if the committed page is not what the source produces
//
// DESIGN 6.3: "Everything ships inside one index.html. Nothing is fetched to render." DESIGN
// 8.2: "Run locally: open index.html. That is the whole procedure." Both of those rule out a
// module graph loaded over the network, so the modules are inlined here.
//
// WHY THIS IS A REGISTRY OF CLOSURES AND NOT A CONCATENATION. Concatenating modules and
// deleting the import lines works until two files declare the same name, and then it produces
// a page that is subtly wrong rather than one that fails. Each module is wrapped in a function
// that returns its exports, and an import becomes a destructuring of an already built module.
// Nothing can collide, and the evaluation order is the topological order of the graph.
//
// ONE MODULE IS FORBIDDEN IN THE PAGE, AND THE BUILD FAILS IF IT BECOMES REACHABLE.
//
//   src/core/vocabulary.js  IS the registry of banned phrases, so it necessarily contains
//                           every one of them. Inlining it would put the whole banned list
//                           into a file that is NOT exempt from the vocabulary scan, and the
//                           gate would fail the page for containing the very phrases it exists
//                           to keep out of pages.
//
// That is not a workaround. It is the gates working: a page cannot contain the list of things
// pages may not contain.
//
// src/core/tokens.js WAS on this list for the same reason, because it declared the two banned
// house colours. It no longer declares them (scripts/banned-colours.mjs does), so it ships,
// which is what lets src/globe/palette.js hand real colour values to a shader at runtime. The
// stylesheet is still generated from it here rather than computed in the browser, because a
// stylesheet that arrives after first paint is a flash of the wrong theme.
//
// THE CSP IS GENERATED, NEVER TYPED. scripts/gate-csp.mjs exports ALL_DECLARED_HOSTS from the
// shipped dataset, and this file turns that into the connect-src allowlist. Retyping the list
// is how the two sets drift, and drift in either direction fails the gate (DESIGN trap 1).

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { REPO, say, isMain } from './_shipped.mjs';
import { buildCss } from '../src/ui/styles.js';
import { ALL_DECLARED_HOSTS } from './gate-csp.mjs';
import { minify } from './minify.mjs';
import { shortenNames, compactJs, constToLet, compactCss } from './mangle.mjs';
import { renderOpeningFrame } from './prerender.mjs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

// THE SHIPPED PAGE IS index.html AT THE REPO ROOT, not docs/index.html.
//
// The authoritative gate is `bash 3. GitHub/_staging/_runner/pregate.sh <repo> --flagship`, and
// six of its checks read "$D/index.html" with the path written out: the doctype check, the dash
// check, the banned colour check, the muted text check, and the whole GEO block (canonical link,
// Open Graph tags, JSON LD). Its flagship host check will accept docs/index.html, but the other
// six will not, so a page that lives only under docs/ fails the gate that decides whether this
// ships. The root is also what GitHub Pages serves at the published address.
const OUT = path.join(REPO, 'index.html');

/**
 * THE DEFERRED HALF. DESIGN 6.3.
 *
 * The page says of itself, in the table caption a reader sees: "This table is the result; the
 * globe is decorative." A decorative renderer, its geometry, its shaders and a 14,106 point
 * coastline in front of first contentful paint contradicts that sentence in bytes. So the
 * globe travels in its own file and the page asks for it once it has painted.
 *
 * SAME ORIGIN, STATIC, RELATIVE. It is a file in this repository served by the same GitHub
 * Pages site as the page, addressed by a relative path. It names no host, so it adds nothing
 * to the CSP connect-src allowlist and hides nothing from the gate that compares that
 * allowlist to the hosts used in code. The page still makes ZERO third party requests before
 * the click.
 *
 * NOT AT THE REPO ROOT. `pregate.sh --flagship` permits exactly six files at the top level and
 * fails on a seventh, so this lives one directory down, and `assets` is added to the scanned
 * directories in scripts/_shipped.mjs so all four gates read it like anything else that ships.
 */
const DEFERRED_DIR = 'assets';
const DEFERRED_FILE = 'globe.js';
const DEFERRED_URL = './' + DEFERRED_DIR + '/' + DEFERRED_FILE;
const DEFERRED_OUT = path.join(REPO, DEFERRED_DIR, DEFERRED_FILE);

/**
 * Where the page publishes its module registry so the deferred file can add to it instead of
 * shipping a second copy of everything the globe shares with the page. src/core/contracts,
 * src/core/tokens and src/core/geo are all reachable from both halves.
 */
const REGISTRY_GLOBAL = '__photontax';

/** The published address. The README live demo link must match it, and the gate checks that. */
const CANONICAL = 'https://0xelitesystem.github.io/photontax/';

/** The entry, plus the other teams entries when they exist. */
const ENTRY = 'src/ui/main.js';
/** The adapter that fills the UI ports. Always built, never imported by the UI (see ports.js). */
const ADAPTERS = 'src/ui/adapters.js';
const MEASURE_ENTRY = 'src/measure/index.js';
const RENDER_ENTRY = 'src/render/index.js';

/**
 * Modules that may never reach the shipped page, with the reason printed on every build.
 * @type {readonly {file:string, reason:string}[]}
 */
export const FORBIDDEN_IN_PAGE = Object.freeze([
  Object.freeze({
    file: 'src/core/vocabulary.js',
    reason: 'It declares the banned phrases and must name them to reject them. Same reason.',
  }),
]);

/**
 * THE TWO PAYLOAD GATES, AND WHY THERE ARE NOW TWO OF THEM.
 *
 * DESIGN 6.3 used to state one number, 40 KB gzipped for the whole single file, and this build
 * failed against it by 42,901 B. The design has been rewritten (see DESIGN 6.3, "what replaced
 * the 40 KB estimate") and the short version is that the 40 KB was an estimate written before
 * the product existed. It costed a coastline, an endpoint table, a mat4 subset, some shaders
 * and "about 32 KB" of application. It did not cost the thing the product turned out to be:
 * roughly 29.5 KB gzipped of English prose in string literals, the validator messages and the
 * method sentences, which DESIGN 2 calls the most important section in the document. Deleting
 * the entire globe, coastline included, still left the page over. A budget that can only be
 * met by deleting the product is a budget that was measured against a different product.
 *
 * WHAT REPLACED IT IS A PAIR, because the old number was conflating two different things:
 *
 *   CRITICAL_PATH_BUDGET_GZIP_BYTES   what must arrive before first contentful paint. This is
 *                                     index.html, and it is the number that moves FCP.
 *   TOTAL_PAGE_BUDGET_GZIP_BYTES      everything the product costs a first time visitor,
 *                                     index.html plus the deferred globe. This is the number
 *                                     that stops "defer it" from becoming "ship more of it".
 *
 * and the user facing gate they both serve is scripts/measure-fcp.mjs: first contentful paint
 * under 1,000 ms on a cold cache over Fast 3G. Bytes are a proxy. The paint is the promise.
 *
 * DERIVED FROM MEASUREMENT, NOT ROUNDED. Both figures below are the measured artifact plus a
 * stated headroom, and the itemisation is printed by every run of this build. A round number
 * is how the last budget ended up describing a product nobody had built yet.
 */

/**
 * THE HEADROOM IS STATED IN TIME, BECAUSE THE BINDING GATE IS A TIME.
 *
 * Fast 3G moves 188,743.68 B/s (scripts/measure-fcp.mjs FAST_3G, written out from the DevTools
 * preset constants). Ten milliseconds of that is 1,887 B. Each budget below is the measured
 * artifact plus one such allowance per file, which is a number derived from the profile the
 * gate is stated over rather than a round figure somebody liked the look of.
 */
export const FAST_3G_BYTES_PER_10MS = 1_887;

/**
 * CRITICAL PATH: index.html, gzip level 9. Everything that must arrive before first
 * contentful paint.
 *
 * Measured 2026-09-21 at 54,407 B, 199,923 B on disk, 39 modules. Apportioned by marginal cost,
 * which is the bytes the file loses when that area is taken out of it and the only honest way
 * to split one gzip stream:
 *
 *     22,729  src/ui        the page, the maths panel, the self test, the reader facing copy
 *     16,053  src/core      claims, the four contract validators, endpoints, citations
 *      7,355  src/measure   the engine, the transport, the three way decomposition
 *      3,075  the stylesheet
 *      2,120  the opening frame, rendered into the document at build time
 *        707  head, CSP, JSON LD, noscript
 *
 * Budget is 54,407 + 1,887 = 56,294 B: the artifact plus ten milliseconds of Fast 3G.
 */
export const CRITICAL_PATH_BUDGET_GZIP_BYTES = 56_294;

/**
 * TOTAL: index.html plus assets/globe.js, gzip level 9. Everything a first time visitor pays
 * for, whether it arrives before the paint or after it.
 *
 * Measured 2026-09-21 at 87,730 B: 54,407 B critical plus 33,323 B deferred. The deferred half,
 * by marginal cost:
 *
 *     17,415  src/globe     WebGL2 renderer, geometry, camera, shaders, a11y, SVG fallback
 *     14,657  src/globe/coastline-data.js   Natural Earth 110m, 14,106 points, base64
 *        745  src/core/contracts/globe.js   the one contract only the globe needs
 *        534  src/render    the port adapter
 *
 * Budget is 87,730 + 2 x 1,887 = 91,504 B: the artifact plus ten milliseconds of Fast 3G for
 * each of the two files. This exists so that moving a thing off the critical path can never
 * quietly become shipping more of it, which is the one failure mode a split payload invites.
 */
export const TOTAL_PAGE_BUDGET_GZIP_BYTES = 91_504;

/**
 * Kept as an alias so the number DESIGN 6.3 now states has exactly one name in the build, and
 * so that a reader grepping for the old constant lands on the explanation above rather than on
 * nothing.
 */
export const PAYLOAD_BUDGET_GZIP_BYTES = TOTAL_PAGE_BUDGET_GZIP_BYTES;

/* --------------------------------------------------------------------------------------------
 * The module graph.
 * ------------------------------------------------------------------------------------------ */

const IMPORT_RE = /^import\s+(\{[\s\S]*?\}|\*\s+as\s+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)\s+from\s+'([^']+)';?[ \t]*$/gm;

// `export { a, b as c } from './x.js';` is an import and an export in one statement, so it is a
// dependency edge like any other and has to be found by the graph walk as well as rewritten.
const REEXPORT_RE = /^export\s+(\{[\s\S]*?\})\s+from\s+'([^']+)';?[ 	]*$/gm;

/**
 * @param {string} src
 * @param {string} rel Module path relative to the repo root.
 * @returns {{specifier:string, resolved:string}[]}
 */
export function findImports(src, rel) {
  const out = [];
  for (const re of [IMPORT_RE, REEXPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      out.push({ specifier: m[2], resolved: resolveSpecifier(rel, m[2]) });
    }
  }
  return out;
}

/**
 * Turn a braced clause into destructuring pairs, handling `a as b`.
 * @param {string} clause
 * @returns {{pairs:string[], names:string[]}}
 */
function bindings(clause) {
  const pairs = [];
  const names = [];
  for (const piece of clause.slice(1, -1).split(',')) {
    const s = piece.trim();
    if (!s) continue;
    const as = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(s);
    if (as) { pairs.push(as[1] + ': ' + as[2]); names.push(as[2]); }
    else { pairs.push(s); names.push(s); }
  }
  return { pairs, names };
}

/** @param {string} fromRel @param {string} specifier @returns {string} */
export function resolveSpecifier(fromRel, specifier) {
  if (!specifier.startsWith('.')) {
    throw new Error('build: ' + fromRel + ' imports "' + specifier + '". This page has zero '
      + 'runtime dependencies, so every import is a relative path inside src/.');
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier));
}

/**
 * Rewrite one module into a function body that returns its exports.
 * @param {string} src
 * @param {string} rel
 * @returns {string}
 */
export function wrapModule(src, rel, options = {}) {
  if (/^export\s+default\b/m.test(src)) {
    throw new Error('build: ' + rel + ' has a default export. This repo uses named exports only, '
      + 'so that every imported name is greppable.');
  }

  if (/^export\s+\*/m.test(src)) {
    throw new Error('build: ' + rel + ' uses `export *`. Every exported name in this repo is '
      + 'written out, so that grepping for a name finds where it comes from.');
  }

  let body = src;

  /** @type {Set<string>} */
  const exported = new Set();

  /**
   * Names this module has already bound. A module may legitimately BOTH import a name for its
   * own use and re export it, which src/measure/index.js does for the trace helpers. Each form
   * becomes a const destructuring, so rewriting both would declare the same name twice, and
   * the page would fail to parse. The FIRST occurrence in source order wins and later ones
   * only contribute to the export list, which keeps every reference after the first binding
   * inside its scope rather than in a temporal dead zone.
   *
   * This bug was found by the node:vm compile check below rather than by a visitor, which is
   * the entire reason that check exists.
   *
   * @type {Set<string>}
   */
  const bound = new Set();

  // Both bare imports and `export ... from` re exports are rewritten in ONE pass, in source
  // order, because the rule above depends on which came first.
  const BINDING_RE = new RegExp(
    '^(import|export)\\s+(\\{[\\s\\S]*?\\}|\\*\\s+as\\s+[A-Za-z_$][\\w$]*|[A-Za-z_$][\\w$]*)'
    + "\\s+from\\s+'([^']+)';?[ \\t]*$",
    'gm',
  );

  body = body.replace(BINDING_RE, (_all, kind, clause, specifier) => {
    const target = resolveSpecifier(rel, specifier);
    const ns = /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(clause);
    if (ns) {
      if (kind === 'export') exported.add(ns[1]);
      if (bound.has(ns[1])) return '';
      bound.add(ns[1]);
      return 'const ' + ns[1] + ' = __m[' + JSON.stringify(target) + '];';
    }
    if (!clause.startsWith('{')) {
      throw new Error('build: ' + rel + ' uses a default import of ' + specifier + '.');
    }
    const { pairs, names } = bindings(clause);
    const fresh = [];
    names.forEach((name, i) => {
      if (kind === 'export') exported.add(name);
      if (bound.has(name)) return;
      bound.add(name);
      fresh.push(pairs[i]);
    });
    if (fresh.length === 0) return '';
    return 'const { ' + fresh.join(', ') + ' } = __m[' + JSON.stringify(target) + '];';
  });

  // export { a, b };
  body = body.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (_all, inner) => {
    for (const piece of inner.split(',')) {
      const name = piece.trim().split(/\s+as\s+/).pop();
      if (name) exported.add(name.trim());
    }
    return '';
  });

  // export const/let/function/class/async function
  body = body.replace(/^export\s+(const|let|async function|function|class)\s+([A-Za-z_$][\w$]*)/gm,
    (_all, kind, name) => {
      exported.add(name);
      return kind + ' ' + name;
    });

  if (/^export\b/m.test(body)) {
    const line = body.split('\n').find((l) => /^export\b/.test(l));
    throw new Error('build: ' + rel + ' has an export form this build does not handle: ' + line);
  }

  const returns = [...exported].sort();
  // The source keeps its commentary; the copy that travels does not. DESIGN 6.3 makes the
  // payload a gate, and the first build of this page came to 105471 B gzipped, of which the
  // great majority was prose explaining why the arithmetic is what it is. That prose is the
  // most valuable thing in the repository and the least useful thing in a wire format.
  if (options.minify === false) {
    return '__m[' + JSON.stringify(rel) + '] = (function () {\n'
      + body.trimEnd() + '\n'
      + 'return { ' + returns.join(', ') + ' };\n'
      + '})();';
  }

  // Stripping the prose was not enough on its own: the page still measured 91,391 B gzipped
  // against DESIGN 6.3's 40 KiB. The three transforms below are applied to the module body
  // AND its return statement together, so that a renamed local is written back as an explicit
  // `exportName: shortName` key and the name every other module imports is unchanged. Each
  // module is transformed inside its own closure, which is what makes a bundle wide one to one
  // rename unnecessary: nothing here can reach across a module boundary except through __m.
  //
  // Nothing third party is inlined into this page, so there is no licence header to preserve:
  // src/globe/mat4.js is written from the formulae for exactly that reason, and says so.
  const inner = minify(body) + '\nreturn { ' + returns.join(', ') + ' };';
  const shipped = constToLet(compactJs(shortenNames(inner, { file: rel }).code, rel), rel);
  return '__m[' + JSON.stringify(rel) + '] = (function () {\n'
    + shipped + '\n'
    + '})();';
}

/**
 * Walk the graph depth first from the entries and return modules in evaluation order.
 * @param {string[]} entries
 * @param {(rel:string)=>Promise<string>} read
 * @returns {Promise<{rel:string, src:string}[]>}
 */
export async function buildGraph(entries, read) {
  /** @type {Map<string,string>} */
  const sources = new Map();
  /** @type {{rel:string, src:string}[]} */
  const ordered = [];
  const visiting = new Set();
  const forbidden = new Map(FORBIDDEN_IN_PAGE.map((f) => [f.file, f.reason]));

  async function visit(rel, from) {
    if (forbidden.has(rel)) {
      throw new Error('build: ' + rel + ' is reachable from the page, via ' + from + ', and it '
        + 'must never be. ' + forbidden.get(rel));
    }
    if (sources.has(rel)) return;
    if (visiting.has(rel)) {
      throw new Error('build: import cycle reaching ' + rel + ' from ' + from + '. The page '
        + 'module graph is evaluated in topological order, which a cycle does not have.');
    }
    visiting.add(rel);
    const src = await read(rel);
    sources.set(rel, src);
    for (const dep of findImports(src, rel)) await visit(dep.resolved, rel);
    visiting.delete(rel);
    ordered.push({ rel, src });
  }

  for (const e of entries) await visit(e, 'the build entry list');
  return ordered;
}

/* --------------------------------------------------------------------------------------------
 * The page.
 * ------------------------------------------------------------------------------------------ */

/**
 * The Content-Security-Policy, generated from the shipped dataset.
 *
 * connect-src names every host this product may ever reach, and gate-csp checks that the set
 * used in code EQUALS this set, failing on a host in either and missing from the other. The
 * rest of the policy is the strictest thing a single file page can say: no external script, no
 * external style, no image, no frame, no form target, and no base element to retarget relative
 * URLs with.
 *
 * `script-src 'unsafe-inline'` is what an inlined single file page needs. `'self'` beside it
 * is what the deferred globe needs: DESIGN 6.3 takes the renderer off the critical path, so
 * one script now arrives from this page own origin by a relative path. Those two keywords are
 * the whole of script-src. No host, no scheme, no wildcard and no nonce, so the only script
 * this page can run is one that already shipped in this repository.
 *
 * connect-src is unchanged by that, and deliberately so: the deferred file is a SCRIPT and not
 * a fetch, it names no host, and the set of hosts this product can reach is the same set it
 * was before the split.
 *
 * @param {readonly string[]} hosts
 * @returns {string}
 */
export function cspContent(hosts) {
  // connect-src carries NO quoted keyword, and the omission is load bearing rather than tidy.
  //
  // The authoritative gate parses this directive with `grep -oiE "connect-src[^;\"']*"`, a
  // character class that stops at the first apostrophe. A leading 'self' therefore truncates
  // the match to nothing, the gate reads the page as declaring no hosts at all, and it fails
  // every host as undeclared. The local mirror in scripts/gate-csp.mjs parses it correctly and
  // would have passed, which is exactly the kind of disagreement that gets discovered at ship
  // time.
  //
  // Dropping 'self' costs nothing, because this page makes no same origin request: it is one
  // file with everything inlined. Declaring a permission nothing uses is worse than not
  // declaring it.
  const connect = hosts.map((h) => 'https://' + h).join(' ');
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'self'",
    "style-src 'unsafe-inline'",
    "img-src 'none'",
    "font-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    'connect-src ' + connect,
  ].join('; ');
}

/**
 * @param {{css:string, modules:{rel:string, src:string}[], hosts:readonly string[],
 *   frame?:string, globeUrl?:string|null}} input
 * @returns {string}
 */
export function renderPage(input) {
  const modules = input.modules.map((m) => wrapModule(m.src, m.rel)).join('\n');
  const frame = input.frame || '';
  const bootOpts = input.globeUrl ? ', { globeUrl: ' + JSON.stringify(input.globeUrl) + ' }' : '';

  // A minifier bug must be a build failure, never a blank page. The assembled module code is
  // compiled here, before anything is written, so a stripped comment that swallowed a token is
  // caught now rather than by a visitor.
  try {
    new vm.Script(modules, { filename: 'photontax-bundle.js' });
  } catch (e) {
    throw new Error('build: the assembled module code does not compile: ' + e.message
      + '. That is a defect in scripts/minify.mjs or in the module rewriting in this file, not '
      + 'in the source module, which node imported successfully to get this far.');
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${input.hosts.length ? cspContent(input.hosts) : ''}">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<link rel="canonical" href="${CANONICAL}">
<meta property="og:type" content="website">
<meta property="og:title" content="photontax">
<meta property="og:site_name" content="photontax">
<meta property="og:url" content="${CANONICAL}">
<meta property="og:description" content="How much of your latency is physics, and how much is your route? Every number carries a MEASURED, REPORTED, COMPUTED or INFERRED badge.">
<meta name="description" content="How much of your latency is physics, and how much is your route? Measures the warm HTTPS round trip from your own machine to public cloud regions and splits each number into the speed of light in fibre, your own access cost, and your route.">
<title>photontax</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "photontax",
  "url": "${CANONICAL}",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Any browser with WebGL2",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "author": { "@type": "Person", "name": "0xelitesystem", "url": "https://github.com/0xelitesystem" },
  "description": "Measures the warm HTTPS round trip from your own machine to public cloud regions and splits each number into the speed of light in fibre, your own access cost, and your route. Every displayed value carries a provenance badge."
}
</script>
<style>
${input.css}
</style>
</head>
<body>
<div id="app">
<noscript>
<p>This page computes a great circle distance and a speed of light floor in front of you, so it
needs scripting enabled. It sends nothing anywhere until you press a button, and it has no
account, no key, no cookie and no analytics.</p>
</noscript>
<!-- THE OPENING FRAME, rendered by scripts/prerender.mjs from the page's own buildHero(), so
     that first contentful paint is this and not an empty box. src/ui/main.js rebuilds the same
     three elements from the same view model the moment the module below runs, which is what
     makes the handover invisible. Do not edit it here; edit src/ui/page.js and run the build. -->
${frame}
</div>
<script type="module">
// GENERATED FILE. Do not edit index.html; edit the modules under src/ and run the build.
//   npm run build           rewrite this file
//   npm run build -- --check  fail if this file is not what the source produces
const __m = {};

${modules}

// The UI publishes ports and never imports the other teams modules, so that a page still
// loads and still states what is missing when one of them is not in the build. The wiring is
// here, where both sides exist, and it is a call into a tested adapter rather than glue.
if (__m[${JSON.stringify(MEASURE_ENTRY)}]) {
  __m[${JSON.stringify(ADAPTERS)}].wireMeasurement(__m[${JSON.stringify(MEASURE_ENTRY)}]);
}
if (__m[${JSON.stringify(RENDER_ENTRY)}]) {
  __m[${JSON.stringify(ADAPTERS)}].wireRenderer(__m[${JSON.stringify(RENDER_ENTRY)}]);
}
__m[${JSON.stringify(ENTRY)}].boot(window${bootOpts});

// The registry is published so the deferred globe file can ADD to it rather than ship a second
// copy of everything the two halves share. It is read by the deferred file and by nothing else.
window.${REGISTRY_GLOBAL} = __m;
</script>
</body>
</html>
`;
}

/**
 * The deferred file: the globe half of the module graph, plus the one call that hands it to
 * the UI port it was always handed to.
 *
 * It is a classic script and not a module, because it has to be loadable by an element created
 * after the document has painted and it has nothing to export. It reads the registry the page
 * published, adds its own modules to it, and wires the renderer. If the registry is not there
 * it returns without touching anything, which is the honest behaviour for a file that has been
 * opened out of context.
 *
 * @param {{modules:{rel:string, src:string}[]}} input
 * @returns {string}
 */
export function renderDeferred(input) {
  const modules = input.modules.map((m) => wrapModule(m.src, m.rel)).join('\n');

  try {
    new vm.Script(modules, { filename: 'photontax-globe.js' });
  } catch (e) {
    throw new Error('build: the assembled deferred module code does not compile: ' + e.message
      + '. That is a defect in scripts/minify.mjs or in the module rewriting in this file.');
  }

  return `// GENERATED FILE. Do not edit; edit the modules under src/globe and src/render and run
// the build. This is the decorative half of photontax: the WebGL2 renderer, its geometry, its
// shaders, the SVG fallback and the Natural Earth coastline. index.html fetches it AFTER that
// page has painted, because the page states that the table is the result and the globe is
// decorative, and a decoration does not belong in front of first contentful paint.
(function () {
var __m = window.${REGISTRY_GLOBAL};
if (!__m) return;

${modules}

__m[${JSON.stringify(ADAPTERS)}].wireRenderer(__m[${JSON.stringify(RENDER_ENTRY)}]);
})();
`;
}

/* --------------------------------------------------------------------------------------------
 * Running it.
 * ------------------------------------------------------------------------------------------ */

/** @param {string} rel @returns {Promise<boolean>} */
async function exists(rel) {
  try { await stat(path.join(REPO, rel)); return true; } catch { return false; }
}

/**
 * One budget comparison, in one place, so the gate and its positive control are the same code.
 * @param {number} bytes
 * @param {number} budget
 * @returns {{over:boolean, by:number, pct:string}}
 */
export function againstBudget(bytes, budget) {
  return {
    over: bytes > budget,
    by: bytes - budget,
    pct: ((bytes / budget) * 100).toFixed(1),
  };
}

/**
 * THE POSITIVE CONTROL. A budget nobody has watched fail is not a budget.
 *
 * Both gates below are one call to againstBudget(), so proving that call rejects an oversized
 * artifact and accepts one at the line proves both. It also pins the two constants, because
 * the failure mode this repository has already lived through once is a budget quietly raised
 * to fit the artifact.
 *
 * @returns {number} failure count
 */
export function selftest() {
  say.head('build gate positive controls');
  let bad = 0;

  const cases = [
    { bytes: CRITICAL_PATH_BUDGET_GZIP_BYTES + 1, budget: CRITICAL_PATH_BUDGET_GZIP_BYTES, want: true, what: 'one byte over the critical path budget FAILS' },
    { bytes: CRITICAL_PATH_BUDGET_GZIP_BYTES, budget: CRITICAL_PATH_BUDGET_GZIP_BYTES, want: false, what: 'exactly at the critical path budget passes' },
    { bytes: TOTAL_PAGE_BUDGET_GZIP_BYTES + 1, budget: TOTAL_PAGE_BUDGET_GZIP_BYTES, want: true, what: 'one byte over the total page budget FAILS' },
    { bytes: TOTAL_PAGE_BUDGET_GZIP_BYTES, budget: TOTAL_PAGE_BUDGET_GZIP_BYTES, want: false, what: 'exactly at the total page budget passes' },
  ];
  for (const c of cases) {
    if (againstBudget(c.bytes, c.budget).over === c.want) say.pass(c.what);
    else { say.fail(c.what + ' -- the comparator did not do that'); bad += 1; }
  }

  if (CRITICAL_PATH_BUDGET_GZIP_BYTES < TOTAL_PAGE_BUDGET_GZIP_BYTES) {
    say.pass('the critical path budget is smaller than the total, which is what splitting means');
  } else {
    say.fail('the critical path budget is not smaller than the total page budget');
    bad += 1;
  }

  return bad;
}

async function run() {
  if (process.argv.includes('--selftest')) return selftest();

  say.head('build');

  // THE CRITICAL PATH ENTRIES. Everything a reader needs in order to see the opening frame,
  // read the hook, and press the one button. DESIGN 6.3.
  const critical = [ENTRY, ADAPTERS];
  if (await exists(MEASURE_ENTRY)) { critical.push(MEASURE_ENTRY); say.note('including ' + MEASURE_ENTRY); }
  else say.note('not present yet, so the page will state its absence rather than fail: ' + MEASURE_ENTRY);

  const hasRenderEntry = await exists(RENDER_ENTRY);
  if (!hasRenderEntry) {
    say.note('not present yet, so the page will state its absence rather than fail: ' + RENDER_ENTRY);
  }

  const read = (rel) => readFile(path.join(REPO, rel), 'utf8');
  const criticalModules = await buildGraph(critical, read);
  const allModules = hasRenderEntry
    ? await buildGraph([...critical, RENDER_ENTRY], read)
    : criticalModules;

  // THE SPLIT. Whatever the globe needs and the page did not already need. Order is preserved
  // from the topological walk, so every dependency of a deferred module is either already in
  // the registry the page published or earlier in this list.
  const inCritical = new Set(criticalModules.map((m) => m.rel));
  const deferredModules = allModules.filter((m) => !inCritical.has(m.rel));
  const deferring = deferredModules.length > 0;

  for (const f of FORBIDDEN_IN_PAGE) say.note('never inlined: ' + f.file);

  // The render module ships its own token only stylesheet. It stays on the CRITICAL path even
  // though the renderer does not: a stylesheet that arrives with the globe is a globe that
  // lands into an unstyled box and pushes the whole page down as it does. It is 3 KB and it is
  // what reserves the space.
  let css = buildCss();
  if (hasRenderEntry) {
    const mod = await import(pathToFileURL(path.join(REPO, RENDER_ENTRY)).href);
    if (typeof mod.RENDER_CSS === 'string' && mod.RENDER_CSS.length > 0) {
      css += '\n' + mod.RENDER_CSS;
      say.note('appended the render stylesheet, which stays on the critical path');
    }
  }
  const shippedCss = compactCss(css);

  // The opening frame, built by the page's own methods against a small build time DOM. This is
  // the change that decouples first contentful paint from the payload: the browser paints this
  // while the modules below it are still arriving.
  const frame = renderOpeningFrame({
    hasEngine: critical.includes(MEASURE_ENTRY),
    rendererDeferred: deferring,
  });
  say.note('rendered the opening frame into the document, ' + Buffer.byteLength(frame, 'utf8')
    + ' B of markup, from the same buildHero() the browser calls');

  const html = renderPage({
    css: shippedCss,
    modules: criticalModules,
    hosts: ALL_DECLARED_HOSTS,
    frame,
    globeUrl: deferring ? DEFERRED_URL : null,
  });
  const deferredJs = deferring ? renderDeferred({ modules: deferredModules }) : null;

  let bad = 0;

  // DESIGN 6.3: nothing is fetched to render. Unchanged by the split, and this is the check
  // that keeps it true: the DOCUMENT still references nothing. The deferred file is requested
  // by an element src/ui/main.js creates two animation frames after the page has mounted, so
  // there is no reference here for the parser to find and block on.
  const external = [
    ...(html.match(/<(?:script|img|iframe)\b[^>]*\bsrc\s*=\s*"(?!#)[^"]*"/gi) || []),
    ...(html.match(/<link\b[^>]*\brel\s*=\s*"(?:stylesheet|preload|prefetch|preconnect|dns-prefetch|icon|manifest|modulepreload)"[^>]*>/gi) || []),
  ];
  if (external.length > 0) {
    for (const e of external) {
      say.fail('the page references something it would have to fetch to render: ' + e);
      bad += 1;
    }
  } else {
    say.pass('no render blocking reference of any kind. Nothing is fetched to paint this page');
  }

  // THE THREE PROMISES THE SPLIT MAY NOT BREAK, checked rather than asserted in a comment.
  if (deferring) {
    if (/^\.\/[A-Za-z0-9_\-./]+$/.test(DEFERRED_URL) && !/:|\/\//.test(DEFERRED_URL.slice(2))) {
      say.pass('the deferred asset is addressed by a relative same origin path, ' + DEFERRED_URL
        + ', so it names no host and adds nothing to connect-src');
    } else {
      say.fail('the deferred asset URL is not a relative same origin path: ' + DEFERRED_URL);
      bad += 1;
    }
    const absolute = deferredJs.match(/https?:\/\/[^\s'"`)]+/g) || [];
    if (absolute.length === 0) {
      say.pass('the deferred file contains no absolute URL of any kind, so it can reach no host');
    } else {
      for (const a of [...new Set(absolute)]) {
        // An XML namespace is a name, not an address, and nothing dereferences it.
        if (a === 'http://www.w3.org/2000/svg') continue;
        say.fail('the deferred file contains an absolute URL: ' + a);
        bad += 1;
      }
      say.pass('the only absolute URL in the deferred file is the SVG XML namespace, which is a '
        + 'name and not an address');
    }
    // script-src must permit the origin's own files, or the deferred half never runs. It is
    // 'self' and nothing else: no host, no scheme, no wildcard.
    if (/script-src 'unsafe-inline' 'self'/.test(html)) {
      say.pass("script-src permits 'self' and nothing beyond it, which is what the deferred "
        + 'file needs and the least that will do');
    } else {
      say.fail("script-src does not permit 'self', so the deferred globe would be blocked");
      bad += 1;
    }
  }

  /* ------------------------------------------------------------------------------------------
   * The two budgets. DESIGN 6.3.
   * ---------------------------------------------------------------------------------------- */

  const criticalGz = gzipSync(Buffer.from(html, 'utf8'), { level: 9 }).length;
  const deferredGz = deferredJs ? gzipSync(Buffer.from(deferredJs, 'utf8'), { level: 9 }).length : 0;
  const totalGz = criticalGz + deferredGz;

  const crit = againstBudget(criticalGz, CRITICAL_PATH_BUDGET_GZIP_BYTES);
  if (crit.over) {
    say.fail('CRITICAL PATH ' + criticalGz + ' B gzipped, ' + crit.by + ' B over the '
      + CRITICAL_PATH_BUDGET_GZIP_BYTES + ' B budget. These are the bytes that must arrive '
      + 'before first contentful paint, so this number and the FCP figure move together. DO '
      + 'NOT RAISE THE BUDGET TO CLEAR IT: it was measured against the product that exists, '
      + 'and the reasoning is in the comment above the constant and in DESIGN 6.3. Either '
      + 'move something off the critical path or take it out.');
    bad += 1;
  } else {
    say.pass('CRITICAL PATH ' + criticalGz + ' B gzipped of a ' + CRITICAL_PATH_BUDGET_GZIP_BYTES
      + ' B budget (' + crit.pct + ' percent), ' + Buffer.byteLength(html, 'utf8')
      + ' B on disk, ' + criticalModules.length + ' modules');
  }

  const total = againstBudget(totalGz, TOTAL_PAGE_BUDGET_GZIP_BYTES);
  if (total.over) {
    say.fail('TOTAL PAGE ' + totalGz + ' B gzipped, ' + total.by + ' B over the '
      + TOTAL_PAGE_BUDGET_GZIP_BYTES + ' B budget. This is everything a first time visitor '
      + 'pays for, index.html plus the deferred globe. It exists so that deferring a thing '
      + 'never quietly becomes shipping more of it.');
    bad += 1;
  } else {
    say.pass('TOTAL PAGE ' + totalGz + ' B gzipped of a ' + TOTAL_PAGE_BUDGET_GZIP_BYTES
      + ' B budget (' + total.pct + ' percent): ' + criticalGz + ' B critical plus '
      + deferredGz + ' B deferred, ' + allModules.length + ' modules');
  }

  // The itemisation is printed on every run, passing or failing. A budget whose composition is
  // only visible when it breaks is a budget nobody can plan against.
  console.log('          where the critical path is, gzipped bytes of the shipped text of each:');
  const sized = criticalModules
    .map((m) => ({ rel: m.rel, gz: gzipSync(Buffer.from(wrapModule(m.src, m.rel), 'utf8'), { level: 9 }).length }))
    .sort((a, b) => b.gz - a.gz)
    .slice(0, 8);
  for (const x of sized) console.log('            ' + String(x.gz).padStart(6) + '  ' + x.rel);
  console.log('            ' + String(gzipSync(Buffer.from(shippedCss, 'utf8'), { level: 9 }).length).padStart(6) + '  the stylesheet');
  console.log('            ' + String(gzipSync(Buffer.from(frame, 'utf8'), { level: 9 }).length).padStart(6) + '  the prerendered opening frame');
  if (deferring) {
    console.log('          deferred, fetched after first paint:');
    console.log('            ' + String(deferredGz).padStart(6) + '  ' + DEFERRED_URL + ', '
      + deferredModules.length + ' modules');
  }

  /* ------------------------------------------------------------------------------------------
   * Writing, or checking.
   * ---------------------------------------------------------------------------------------- */

  const outputs = [{ file: OUT, text: html, label: 'index.html' }];
  if (deferredJs) outputs.push({ file: DEFERRED_OUT, text: deferredJs, label: DEFERRED_DIR + '/' + DEFERRED_FILE });

  if (process.argv.includes('--check')) {
    for (const o of outputs) {
      let current = '';
      try { current = await readFile(o.file, 'utf8'); } catch { current = ''; }
      if (current !== o.text) {
        say.fail(o.label + ' is not what the source produces. Run npm run build and commit it.');
        bad += 1;
      } else {
        say.pass(o.label + ' matches the source');
      }
    }
  } else {
    for (const o of outputs) {
      await mkdir(path.dirname(o.file), { recursive: true });
      await writeFile(o.file, o.text, 'utf8');
      say.pass('wrote ' + o.label);
    }
  }

  return bad;
}

if (isMain(import.meta.url)) {
  const failures = await run();
  console.log(failures === 0 ? '\nbuild: PASS' : '\nbuild: FAIL (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}
