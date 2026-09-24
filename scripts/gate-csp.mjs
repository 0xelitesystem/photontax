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

/* --------------------------------------------------------------------------------------------
 * NODE NETWORK CONSTRUCTS. A browser has no socket API, so the list above was complete for the
 * page. A command line has several, and every one of them is a request this gate could not see
 * until it learned the constructs by name. There is no CSP outside a browser, so for the command
 * line this scan IS the allowlist enforcement: each construct is a side channel anywhere in the
 * shipped copy, except in ONE transport module, and even there only in the form whose host the
 * scanner can read. A host written that way is counted by hostsUsedInCode below, so the used set
 * still has to equal the declared set.
 * ------------------------------------------------------------------------------------------ */

/** The one module allowed to open a Node network connection. */
export const NODE_TRANSPORT_MODULE = 'src/cli/transport.js';

const NODE_NET_MODULES = '(?:https?|http2|net|tls|dns(?:\\/promises)?|dgram)';

/**
 * Every Node construct that resolves a name or opens a connection. `transport` says what the one
 * transport module may do with it: 'never', or 'literal' for the single form it is built from.
 */
export const NODE_NETWORK = Object.freeze([
  { re: new RegExp('(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*|^\\s*import\\s*)[`\'"](?:node:)?' + NODE_NET_MODULES + '[`\'"]', 'gm'),
    what: 'an import of a Node network module', transport: 'literal',
    allowed: /[`'"]node:https[`'"]/ },
  { re: new RegExp('\\bimport\\s*\\{[^}]*\\}\\s*from\\s*[`\'"](?:node:)?' + NODE_NET_MODULES + '[`\'"]', 'g'),
    what: 'a named import from a Node network module, which lets a call hide its host', transport: 'never' },
  { re: /\{[^}]*\}\s*=\s*(?:https?|http2|net|tls|dns)\b|=\s*(?:https?|http2|net|tls|dns)\s*[;,)\n]/g,
    what: 'a Node network module destructured or given a second name', transport: 'never' },
  { re: /\bhttps?\.(?:request|get)\s*\(/g,
    what: 'an http or https request', transport: 'literal',
    allowed: /^https\.(?:request|get)\s*\(\s*[`'"]https:\/\// },
  { re: /\btls\.connect\s*\(/g, what: 'tls.connect', transport: 'never' },
  { re: /\bnet\.(?:connect|createConnection)\s*\(/g, what: 'a raw TCP connection', transport: 'never' },
  { re: /\bdns\.[A-Za-z_$]/g, what: 'a DNS call', transport: 'never' },
  { re: /\bhttp2\.connect\s*\(/g, what: 'an HTTP/2 session', transport: 'never' },
  { re: /\bnew\s+(?:[\w$]+\.)?Agent\s*\(/g, what: 'a connection pooling Agent', transport: 'literal',
    allowed: /^new\s+https\.Agent\s*\(/ },
]);

/**
 * The Node network constructs in one shipped file that the gate must reject.
 * @param {string} rel Repo relative path, forward slashes.
 * @param {string} text
 * @returns {{line:number, what:string}[]}
 */
export function nodeNetworkFindings(rel, text) {
  const inTransport = rel === NODE_TRANSPORT_MODULE;
  /** @type {{line:number, what:string}[]} */
  const out = [];
  for (const c of NODE_NETWORK) {
    c.re.lastIndex = 0;
    let m;
    while ((m = c.re.exec(text)) !== null) {
      const at = m.index + m[0].length - m[0].trimStart().length;
      const ok = inTransport && c.transport === 'literal'
        && (c.what.startsWith('an import') ? c.allowed.test(m[0]) : c.allowed.test(text.slice(at)));
      if (!ok) out.push({ line: text.slice(0, m.index).split('\n').length, what: c.what });
    }
  }
  return out;
}

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

/**
 * Every host written as a literal URL in a call that reaches the network. The Node form,
 * https.request or https.get with a literal URL, is the only one the command line transport is
 * allowed to use, so it is counted here beside fetch and the used set stays complete.
 * @param {string} src
 * @returns {string[]}
 */
export function hostsUsedInCode(src) {
  const out = new Set();
  const re = /(?:fetch|new\s+WebSocket|new\s+EventSource|\bhttps?\.(?:request|get))\s*\(\s*[`'"]https?:\/\/([^`'"/]+)/g;
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

  // THE NODE CONSTRUCTS. Every one must be seen failing outside the transport module. Inside it,
  // every form that hides a host must still fail, and the one readable form must pass, or the
  // command line could not be built at all and the gate would be switched off.
  const OUT = 'src/cli/report.js';
  const T = NODE_TRANSPORT_MODULE;
  const IMPORT = 'an import of a Node network module';
  const NAMED = 'a named import from a Node network module, which lets a call hide its host';
  const ALIAS = 'a Node network module destructured or given a second name';
  const REQ = 'an http or https request';
  const AGENT = 'a connection pooling Agent';
  const nodeMustFail = [
    [OUT, "import https from 'node:https';", IMPORT],
    [OUT, "const net = require('node:net');", IMPORT],
    [OUT, "await import('dns/promises');", IMPORT],
    [OUT, "import 'node:tls';", IMPORT],
    [OUT, "import { request } from 'https';", NAMED],
    [OUT, 'const { lookup } = dns;', ALIAS],
    [OUT, "https.request('https://dynamodb.us-east-1.amazonaws.com/', o);", REQ],
    [OUT, 'http.get(u, cb);', REQ],
    [OUT, 'tls.connect(443, h);', 'tls.connect'],
    [OUT, 'net.createConnection({ host: h });', 'a raw TCP connection'],
    [OUT, 'net.connect(443, h);', 'a raw TCP connection'],
    [OUT, 'dns.lookup(h, cb);', 'a DNS call'],
    [OUT, 'await dns.promises.resolve4(h);', 'a DNS call'],
    [OUT, "http2.connect('https://x.example');", 'an HTTP/2 session'],
    [OUT, 'const a = new https.Agent({ keepAlive: true });', AGENT],
    [OUT, 'const a = new Agent();', AGENT],
    [T, 'https.request(url, opts);', REQ],
    [T, 'https.get(PROBE_URLS[host], opts);', REQ],
    [T, "http.request('http://x.example/');", REQ],
    [T, "import { request } from 'node:https';", NAMED],
    [T, "import https from 'https';", IMPORT],
    [T, "import net from 'node:net';", IMPORT],
    [T, 'const { request } = https;', ALIAS],
    [T, 'const h = https;', ALIAS],
    [T, 'tls.connect(443, h);', 'tls.connect'],
    [T, 'net.connect(443, h);', 'a raw TCP connection'],
    [T, 'dns.lookup(h, cb);', 'a DNS call'],
    [T, "http2.connect('https://x.example');", 'an HTTP/2 session'],
    [T, 'const a = new Agent({ keepAlive: true });', AGENT],
  ];
  for (const [rel, src, what] of nodeMustFail) {
    if (nodeNetworkFindings(rel, src).some((f) => f.what === what)) say.pass('detects ' + what + ' in ' + rel + ': ' + src);
    else { say.fail('does NOT detect ' + what + ' in ' + rel + ': ' + src); bad += 1; }
  }
  for (const c of NODE_NETWORK) {
    if (!nodeMustFail.some((x) => x[2] === c.what)) { say.fail('no positive control for: ' + c.what); bad += 1; }
  }

  const nodeMustPass = [
    [T, "import https from 'node:https';"],
    [T, "import * as https from 'node:https';"],
    [T, "'dynamodb.us-east-1.amazonaws.com': (o) => https.request('https://dynamodb.us-east-1.amazonaws.com/', o),"],
    [T, 'https.get(`https://dynamodb.us-east-1.amazonaws.com/`, o);'],
    [T, 'const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });'],
    [OUT, 'The DNS lookup time is one sample, and the TLS version is what the server chose.'],
    [OUT, "fetch('https://dynamodb.us-east-1.amazonaws.com/', init);"],
  ];
  for (const [rel, src] of nodeMustPass) {
    const found = nodeNetworkFindings(rel, src);
    if (found.length === 0) say.pass('correctly allows in ' + rel + ': ' + src.slice(0, 60));
    else { say.fail('FALSE POSITIVE (' + found[0].what + ') in ' + rel + ': ' + src); bad += 1; }
  }

  const nodeUsed = hostsUsedInCode("https.request('https://a.example/', o); https.get(\"https://b.example/x\", o);");
  if (nodeUsed.join(',') === 'a.example,b.example') say.pass('counts the hosts of literal https.request and https.get calls');
  else { say.fail('Node literal hosts not counted, got ' + JSON.stringify(nodeUsed)); bad += 1; }

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
    for (const h of nodeNetworkFindings(f.rel, f.text)) {
      say.fail(f.rel + ':' + h.line + '  ' + h.what + '. Only ' + NODE_TRANSPORT_MODULE + ' may '
        + 'reach the network from Node, and only through https.request or https.get with a '
        + 'literal https URL, so the host is counted and checked against the declared set.');
      bad += 1;
    }
  }
  if (bad === 0) {
    say.pass('no Node network construct outside ' + NODE_TRANSPORT_MODULE + ', and none inside '
      + 'it in a form that hides its host');
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
