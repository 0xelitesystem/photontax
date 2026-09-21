#!/usr/bin/env node
// GATE 4: THE DECLARED HOST CHECK. The local mirror of the runner flagship gate.
//
//   node scripts/gate-csp.mjs             check the page against the dataset
//   node scripts/gate-csp.mjs --selftest  run the positive controls only
//
// A single file browser tool in this account may make no network call at all. photontax is a
// FLAGSHIP: its whole purpose requires the network, so the ban is replaced by something
// stricter because it is checkable. Every host the code reaches must be declared in a
// Content-Security-Policy connect-src allowlist in the page head, and THE SET OF HOSTS USED IN
// CODE MUST EQUAL THE SET DECLARED. A host in either set and missing from the other fails, so
// a hidden call and a stale declaration both fail.
//
// The authoritative version of this check is:
//   bash "3. GitHub/_staging/_runner/pregate.sh" <repo> --flagship
// This gate runs the same rule against the repo own dataset, so the failure arrives at the
// desk of whoever added the host rather than at ship time.
//
// STANDING RULE, restated because it is the one thing that would quietly destroy this product:
// never make a request the gate cannot see. `new Image(); img.src = url` is a network call that
// a fetch oriented check does not catch. Using it for that reason would be routing around a
// gate on our own judgement. It is named here so nobody discovers it later and thinks it is
// clever. This gate looks for it explicitly.

import { MEASUREMENT_HOSTS } from '../src/core/data/endpoints.js';
import { NON_MEASUREMENT_HOSTS, ALL_REACHABLE_HOSTS } from '../src/core/data/reachable-hosts.js';
import { shippedCopy, say, isMain } from './_shipped.mjs';

// The gate reads the SHIPPED definition rather than a copy of it. That is not a loosening: the
// thing this gate checks is whether the hosts reachable from the code equal the hosts declared
// in the page head, and it finds the reachable set by scanning the source for fetch calls, not
// by reading this list. Declaring from a copy only ever let the copy go stale.
export { NON_MEASUREMENT_HOSTS };

/** The complete set of hosts this product may ever reach. */
export const ALL_DECLARED_HOSTS = ALL_REACHABLE_HOSTS;

void MEASUREMENT_HOSTS;

/** Constructs that make a network request without going through fetch. */
const SIDE_CHANNELS = [
  { re: /new\s+Image\s*\(/g, what: 'new Image()' },
  { re: /\.src\s*=\s*[`'"]https?:/g, what: 'an element src assigned an absolute URL' },
  { re: /navigator\.sendBeacon\s*\(/g, what: 'navigator.sendBeacon' },
  { re: /new\s+EventSource\s*\(/g, what: 'new EventSource' },
  { re: /new\s+WebSocket\s*\(/g, what: 'new WebSocket' },
  { re: /new\s+XMLHttpRequest\s*\(/g, what: 'XMLHttpRequest' },
  { re: /import\s*\(\s*[`'"]https?:/g, what: 'a dynamic import of a remote module' },
  { re: /<link[^>]+rel\s*=\s*"(?:preconnect|dns-prefetch|prefetch|preload)"/gi, what: 'a resource hint that opens a connection' },
];

/** @param {string} html @returns {string[]|null} */
export function cspConnectSrcHosts(html) {
  // The attribute value is matched with a back referenced quote character rather than a
  // character class, because a CSP content attribute is delimited by double quotes and
  // legitimately CONTAINS single quotes ('self', 'none'). A naive ["'] class stops at the
  // first 'self' and silently reports no connect-src, which is a gate that passes a page it
  // never actually read. Caught by the first positive control in this file.
  const meta = /<meta[^>]+http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*?content\s*=\s*(["'])((?:(?!\1)[\s\S])*)\1/i.exec(html);
  if (!meta) return null;
  const directive = /connect-src([^;]*)/i.exec(meta[2]);
  if (!directive) return null;
  return directive[1]
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !/^'(self|none)'$/.test(t) && !/^(data|blob):$/.test(t))
    .map((t) => t.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase())
    .sort();
}

/** @param {string} src @returns {string[]} */
export function hostsUsedInCode(src) {
  const out = new Set();
  const re = /(?:fetch|new\s+WebSocket|new\s+EventSource)\s*\(\s*[`'"]https?:\/\/([^`'"/]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[1].toLowerCase());
  return [...out].sort();
}

function selftest() {
  say.head('gate-csp positive controls');
  let bad = 0;

  const withCsp = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; '
    + 'connect-src \'self\' https://a.example https://b.example">';
  const got = cspConnectSrcHosts(withCsp);
  if (got && got.join(',') === 'a.example,b.example') say.pass('parses connect-src hosts out of the meta tag');
  else { say.fail('failed to parse connect-src, got ' + JSON.stringify(got)); bad += 1; }

  if (cspConnectSrcHosts('<html><head></head></html>') === null) say.pass('reports a missing CSP rather than passing silently');
  else { say.fail('a page with no CSP was not reported'); bad += 1; }

  const used = hostsUsedInCode('await fetch("https://a.example/x"); fetch(`https://c.example/y`);');
  if (used.join(',') === 'a.example,c.example') say.pass('finds hosts used in fetch calls');
  else { say.fail('host extraction wrong, got ' + JSON.stringify(used)); bad += 1; }

  // The drift cases: one host in each direction. Both must be detectable.
  const declared = ['a.example', 'b.example'];
  const usedSet = ['a.example', 'c.example'];
  const missing = usedSet.filter((h) => !declared.includes(h));
  const stale = declared.filter((h) => !usedSet.includes(h));
  if (missing.join(',') === 'c.example') say.pass('detects a host used in code but not declared');
  else { say.fail('undeclared host not detected'); bad += 1; }
  if (stale.join(',') === 'b.example') say.pass('detects a host declared but never used');
  else { say.fail('stale declaration not detected'); bad += 1; }

  for (const c of SIDE_CHANNELS) {
    const sample = {
      'new Image()': 'const i = new Image(); i.src = url;',
      'an element src assigned an absolute URL': 'img.src = "https://x.example/p.gif";',
      'navigator.sendBeacon': 'navigator.sendBeacon("/x", d);',
      'new EventSource': 'const s = new EventSource("https://x.example");',
      'new WebSocket': 'const w = new WebSocket("wss://x.example");',
      XMLHttpRequest: 'const x = new XMLHttpRequest();',
      'a dynamic import of a remote module': 'await import("https://x.example/m.js");',
      'a resource hint that opens a connection': '<link rel="preconnect" href="https://x.example">',
    }[c.what];
    c.re.lastIndex = 0;
    if (sample && c.re.test(sample)) say.pass('detects ' + c.what);
    else { say.fail('does NOT detect ' + c.what + ', which is a request this gate could not see'); bad += 1; }
  }

  return bad;
}

async function scan() {
  say.head('gate-csp');
  const files = await shippedCopy();
  const html = files.filter((f) => f.rel.endsWith('.html'));
  let bad = 0;

  for (const f of files) {
    if (f.rel.endsWith('.md')) continue;
    for (const c of SIDE_CHANNELS) {
      c.re.lastIndex = 0;
      let m;
      while ((m = c.re.exec(f.text)) !== null) {
        const line = f.text.slice(0, m.index).split('\n').length;
        say.fail(f.rel + ':' + line + '  ' + c.what + '. This makes a request the host equality '
          + 'check cannot see. Use fetch() with an absolute URL whose host is in the CSP.');
        bad += 1;
      }
    }
  }

  if (html.length === 0) {
    say.note('no shipped HTML page yet. The CSP half of this gate is proven by its positive '
      + 'controls above and engages the moment docs/index.html exists.');
    say.note('the page must declare exactly these ' + ALL_DECLARED_HOSTS.length + ' hosts in connect-src:');
    for (const h of ALL_DECLARED_HOSTS) console.log('          https://' + h);
    if (bad === 0) say.pass('no side channel network constructs anywhere in the repo');
    return bad;
  }

  for (const f of html) {
    const declared = cspConnectSrcHosts(f.text);
    if (declared === null) {
      say.fail(f.rel + ': no Content-Security-Policy connect-src allowlist in the page head. A '
        + 'flagship declares every host it can reach.');
      bad += 1;
      continue;
    }
    const used = hostsUsedInCode(files.filter((x) => !x.rel.endsWith('.md')).map((x) => x.text).join('\n'));
    const missing = used.filter((h) => !declared.includes(h));
    const stale = declared.filter((h) => !used.includes(h));
    const undeclaredByDataset = ALL_DECLARED_HOSTS.filter((h) => !declared.includes(h));

    for (const h of missing) { say.fail(f.rel + ': host used in code but NOT declared in connect-src: ' + h); bad += 1; }
    for (const h of stale) { say.fail(f.rel + ': host declared in connect-src but never used: ' + h); bad += 1; }
    for (const h of undeclaredByDataset) {
      say.fail(f.rel + ': ' + h + ' is in the shipped dataset as a reachable host but is not in '
        + 'connect-src. The dataset and the policy must agree.');
      bad += 1;
    }
    if (missing.length === 0 && stale.length === 0 && undeclaredByDataset.length === 0) {
      say.pass(f.rel + ': the used set and the declared set are equal (' + declared.length + ' hosts)');
    }
  }
  return bad;
}

// Runnable script, and also a library the test suite imports for its scanner functions.
// The guard is what keeps `import` from running the gate and calling process.exit inside
// the test runner.
if (isMain(import.meta.url)) {
  const selftestOnly = process.argv.includes('--selftest');
  let failures = selftest();
  if (!selftestOnly) failures += await scan();

  console.log(failures === 0 ? '\ngate-csp: PASS' : '\ngate-csp: FAIL (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}
