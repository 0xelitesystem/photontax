#!/usr/bin/env node
// Run every CI gate. DESIGN 7.4.
//
//   npm run gates            run all gates against the repo
//   npm run gates:selftest   run only the positive controls of every gate
//
// Each gate is a separate process so that one gate crashing cannot mask another, and so the
// exit code of each is reported individually. The aggregate exit code is non zero if any gate
// failed.
//
// THE POSITIVE CONTROLS ARE NOT OPTIONAL. Every gate here proves, on every run, that it fails
// when it should. A gate nobody has watched fail is not a gate, it is a hope, and the whole
// claim boundary of this product rests on these four.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const GATES = [
  { id: 'vocabulary', file: 'gate-vocabulary.mjs', what: 'the NEVER CLAIMED list (DESIGN 2.5, 7.4)' },
  { id: 'badges', file: 'gate-badges.mjs', what: 'no number renders without a badge (DESIGN 7.3, 7.4)' },
  { id: 'contrast', file: 'gate-contrast.mjs', what: 'WCAG AA by math, both themes (DESIGN 6.6)' },
  { id: 'csp', file: 'gate-csp.mjs', what: 'every reachable host is declared (flagship tier rule)' },
];

const passthrough = process.argv.slice(2);
/** @type {{id:string, code:number}[]} */
const results = [];

for (const g of GATES) {
  const r = spawnSync(process.execPath, [path.join(HERE, g.file), ...passthrough], { stdio: 'inherit' });
  results.push({ id: g.id, code: r.status === null ? 1 : r.status });
}

console.log('\n================ gate summary ================');
let failed = 0;
for (const g of GATES) {
  const r = results.find((x) => x.id === g.id);
  const ok = r && r.code === 0;
  if (!ok) failed += 1;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + g.id.padEnd(11) + g.what);
}
console.log('==============================================');
console.log(failed === 0 ? 'ALL GATES PASS' : failed + ' GATE(S) FAILED');
process.exit(failed === 0 ? 0 : 1);
