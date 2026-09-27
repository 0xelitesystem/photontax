#!/usr/bin/env node
// GATE 1: THE BANNED VOCABULARY CHECK. DESIGN 7.4, DESIGN 2.5, trap 15.
//
//   node scripts/gate-vocabulary.mjs             scan the shipped copy, exit 1 on any hit
//   node scripts/gate-vocabulary.mjs --selftest  run the positive controls only
//
// DESIGN trap 15 calls language drift the single biggest risk in the project and says it will
// happen during copywriting, not during coding. A reviewer reading a paragraph about latency
// will not notice one wrong word. A grep will notice every time.
//
// The rules and the reason for each live in src/core/vocabulary.js, so the browser self test
// and this gate share one registry and cannot disagree.

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { scanVocabulary, BANNED, PROPER_NOUN_EXCEPTIONS } from '../src/core/vocabulary.js';
import { shippedCopy, SCAN_FILES, EXEMPT, say, isMain } from './_shipped.mjs';

/**
 * POSITIVE CONTROLS. A gate that has never been seen to fail is not a gate, it is a hope.
 *
 * Each case is a snippet that MUST be caught, paired with the rule that must catch it, plus
 * negative cases that must NOT be caught. The negative cases matter as much: a gate that fires
 * on the README credit to the gcping project would be switched off within a week, and a gate
 * that is switched off protects nothing.
 */
const CONTROLS = Object.freeze({
  mustFail: Object.freeze([
    { rule: 'traceroute', text: 'Paste a traceroute and we will resolve it.' },
    { rule: 'traceroute', text: 'Run a trace route from your machine first.' },
    { rule: 'icmp-round-trip-words', text: 'We ping each region seven times.' },
    { rule: 'icmp-round-trip-words', text: 'Median RTT to Mumbai was 251 ms.' },
    { rule: 'hop', text: 'Your traffic takes 14 hops to reach Frankfurt.' },
    { rule: 'hop', text: 'Per-hop latency is shown on the right.' },
    { rule: 'actual-route', text: 'This is the actual route your connection takes.' },
    { rule: 'per-visitor-cable-attribution', text: 'Your traffic crossed the SEA-ME-WE 5 system.' },
    { rule: 'visitor-as-path', text: 'Your AS path is shown below the map.' },
    { rule: 'visitor-geolocation', text: 'You are in Denver.' },
    { rule: 'visitor-geolocation', text: 'We plot your exact location on the globe.' },
    { rule: 'visitor-geolocation', text: 'Based on your IP we placed you near Richmond.' },
    { rule: 'cable-dataset-identifiers', text: 'Loading cable-geo.json from the bundle.' },
    { rule: 'cable-dataset-identifiers', text: 'Each landing point is drawn as a dot.' },
    { rule: 'cable-length-total', text: 'There are 1.4 million km of submarine cable in the sea.' },
    { rule: 'cable-count-total', text: 'We show all 574 cables currently in service.' },
    { rule: 'directional-attribution', text: 'The outbound leg took 63 ms.' },
    { rule: 'prediction-language', text: 'Your users will see about 90 ms from Jakarta.' },
    { rule: 'assistant-attribution', text: 'Generated with Claude.' },
    { rule: 'unicode-dashes', text: 'Physics charges 127 — your route charges 116.' },
    { rule: 'unicode-dashes', text: 'A range of 120 – 130 ms.' },
  ]),
  mustPass: Object.freeze([
    'gcping established the warm keep alive minimum of N measurement technique this tool uses.',
    'Region list from GoogleCloudPlatform/gcping, Apache 2.0.',
    'Unlike cloudping.me and cloudpingtest, photontax tells you what caused the number.',
    'The warm HTTPS round trip to Mumbai was 251 ms.',
    'This tool ships no submarine cable data of any kind, and here is why.',
    'Shopping for a region is what the picker is for.',
    'A reader hopping between rows sees the access segment stay the same width.',
    'Physics charges 127, your own last mile charges 8, and your route charges 116.',
    // The three verdict sentences, fixed word for word by DESIGN 4 C3. Pinned here because an
    // earlier draft of the visitor-geolocation rule flagged the first one, and a gate that
    // fires on the product own required copy is a gate somebody switches off.
    'You are at the floor. This will not get faster without moving the service closer.',
    'Normal. Your route is roughly the shape of the cable, not the great circle.',
    'Your path is materially longer than the geography requires.',
  ]),
});

function selftest() {
  say.head('gate-vocabulary positive controls');
  let bad = 0;

  for (const c of CONTROLS.mustFail) {
    const hits = scanVocabulary(c.text);
    const caught = hits.some((h) => h.ruleId === c.rule);
    if (caught) {
      say.pass('caught by ' + c.rule + ': ' + JSON.stringify(c.text.slice(0, 58)));
    } else {
      say.fail('NOT caught by ' + c.rule + ' (the gate would let this ship): ' + JSON.stringify(c.text));
      bad += 1;
    }
  }

  for (const text of CONTROLS.mustPass) {
    const hits = scanVocabulary(text);
    if (hits.length === 0) {
      say.pass('correctly allowed: ' + JSON.stringify(text.slice(0, 58)));
    } else {
      say.fail('FALSE POSITIVE on legitimate copy, rule ' + hits[0].ruleId + ': ' + JSON.stringify(text));
      bad += 1;
    }
  }

  say.note(BANNED.length + ' rules, ' + PROPER_NOUN_EXCEPTIONS.length + ' masked proper nouns, '
    + CONTROLS.mustFail.length + ' must fail cases, ' + CONTROLS.mustPass.length + ' must pass cases');
  return bad;
}

/**
 * THE FILE LIST CONTROL. The rule controls above prove a phrase is caught once it is read; this
 * proves each listed file IS read. A banned phrase is planted in every SCAN_FILES entry of a
 * throwaway tree and the same walk the scan uses must return that file with the hit in it.
 * USAGE.md is named explicitly because it is the entry that was once missing.
 * @returns {Promise<number>}
 */
async function fileListControl() {
  let bad = 0;
  if (!SCAN_FILES.includes('USAGE.md')) {
    say.fail('USAGE.md is not in the scanned file list, so its copy reaches readers unchecked');
    bad += 1;
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'photontax-scanlist-'));
  try {
    const planted = 'We ping each region seven times.';
    for (const f of SCAN_FILES) await writeFile(path.join(dir, f), planted + '\n', 'utf8');
    const read = await shippedCopy(dir);
    for (const f of SCAN_FILES) {
      const got = read.find((x) => x.rel === f);
      if (got && scanVocabulary(got.text).some((h) => h.ruleId === 'icmp-round-trip-words')) {
        say.pass('a banned phrase planted in ' + f + ' is read and caught');
      } else {
        say.fail(f + ' is in the scanned file list but a phrase planted in it was NOT caught');
        bad += 1;
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return bad;
}

async function scan() {
  say.head('gate-vocabulary');
  for (const e of EXEMPT) say.note('exempt: ' + e.file + '  (' + e.reason + ')');

  const files = await shippedCopy();
  if (files.length === 0) {
    say.fail('no shipped copy found. Expected at least README.md or docs/index.html.');
    return 1;
  }

  let bad = 0;
  for (const f of files) {
    const hits = scanVocabulary(f.text);
    for (const h of hits) {
      say.fail(f.rel + ':' + h.line + ':' + h.column + '  [' + h.ruleId + ']  '
        + JSON.stringify(h.match));
      console.log('          ' + h.designRef);
      console.log('          ' + h.why);
      bad += 1;
    }
  }
  if (bad === 0) say.pass(files.length + ' shipped copy files, zero banned terms');
  return bad;
}

// Runnable script, and also a library the test suite imports for its scanner functions.
// The guard is what keeps `import` from running the gate and calling process.exit inside
// the test runner.
if (isMain(import.meta.url)) {
  const selftestOnly = process.argv.includes('--selftest');
  let failures = selftest();
  failures += await fileListControl();
  if (!selftestOnly) failures += await scan();

  console.log(failures === 0 ? '\ngate-vocabulary: PASS' : '\ngate-vocabulary: FAIL (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}
