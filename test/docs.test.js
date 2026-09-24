// The figures the README and USAGE.md quote from the capture fixture, held to the code.
//
// Both documents say the example table is reproduced by `npm test`, cell for cell. This file is
// what makes that sentence true: it rebuilds the table from src/ui/fixture.js through the same
// view model the page renders, and compares every cell of every row in both documents. A number
// in a document that nothing recomputes is a claim; one that a test recomputes is a receipt.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderClaim } from '../src/core/claim.js';
import { endpointById } from '../src/core/data/endpoints.js';
import { fixtureMeasurementRun, decomposeFixture } from '../src/ui/fixture.js';
import { buildViewModel } from '../src/ui/viewmodel.js';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const HAND = JSON.parse(readFileSync(new URL('./fixtures/measure-hand-computed.json', import.meta.url), 'utf8'));

const HEADER = '| region | distance | round trip | physics | access | route | ratio |';

/** The table the page renders in fixture mode, as the documents write it. */
function fixtureTable() {
  const vm = buildViewModel({ state: 'done', decomposition: decomposeFixture(fixtureMeasurementRun()), fixture: true });
  const v = (claim) => renderClaim(claim).valueText;
  return vm.rows.map((r) => {
    const e = endpointById(r.endpointId);
    return '| ' + (e.area || e.city) + ' `' + e.region + '` | ' + v(r.cells.distance) + ' | '
      + v(r.cells.roundTrip) + ' | ' + v(r.cells.physics) + ' | ' + v(r.cells.access) + ' | '
      + v(r.cells.route) + ' | ' + (r.cells.ratio ? v(r.cells.ratio) : 'no ratio') + ' |';
  });
}

/** The example table in a document: the rows under the one header that names the columns. */
function documentTable(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.indexOf(HEADER);
  assert.ok(at >= 0, 'the example table header is missing');
  assert.equal(lines.indexOf(HEADER, at + 1), -1, 'more than one example table; this test reads one');
  const rows = [];
  for (let i = at + 2; i < lines.length && lines[i].startsWith('| '); i += 1) rows.push(lines[i]);
  return rows;
}

describe('the example table in the documents is the capture fixture, cell for cell', () => {
  const want = fixtureTable();

  for (const name of ['README.md', 'USAGE.md']) {
    test(name + ' prints exactly the rows the page renders from the fixture', () => {
      assert.deepEqual(documentTable(read(name)), want);
    });

    test(name + ' says what the table is: TCP connect minimums, and the observer city centre', () => {
      const text = read(name);
      assert.match(text, /TCP connect minimums recorded once from a machine in\s+Virginia/);
      assert.match(text, /Ashburn, Virginia city centre as the observer\s+point/);
    });
  }

  test('the Mumbai walk through quotes the Mumbai row', () => {
    const mumbai = want.find((r) => r.includes('`ap-south-1`')).split('|').map((s) => s.trim());
    const [, , , total, physics, access, route] = mumbai;
    const n = (s) => s.replace(' ms', '');
    const readme = read('README.md');
    assert.ok(readme.includes('Of ' + n(total) + ' milliseconds, **' + n(physics) + ' is the speed of light'));
    assert.ok(readme.includes('**' + n(access) + ' is the fixed cost of that connection itself**'));
    assert.ok(readme.includes('**' + n(route) + ' is the route**'));
    const usage = read('USAGE.md');
    assert.ok(usage.includes('Of ' + n(total) + ' milliseconds:'));
    assert.ok(usage.includes('**' + physics + ' is physics.**'));
    assert.ok(usage.includes('**' + access + ' is access.**'));
    assert.ok(usage.includes('**' + route + ' is route.**'));
  });
});

describe('the short row figures the documents quote come from the independent derivation', () => {
  const eq = HAND.cases.equatorial;
  const row = eq.expected.rows.find((r) => r.endpointId === 'aws:us-east-1');

  test('55.6 km, a 12 ms round trip, a 0.54 ms floor and a naive 22.04x', () => {
    const km = row.distanceKm.toFixed(1) + ' km';
    const floor = row.floorMs.toFixed(2);
    const naive = row.naiveRatio.toFixed(2) + 'x';
    assert.equal(km, '55.6 km');
    assert.equal(row.roundTripMs, 12);
    for (const name of ['README.md', 'USAGE.md']) {
      const text = read(name).replace(/\s+/g, ' ');
      assert.ok(text.includes(km), name + ' distance');
      assert.ok(text.includes(floor), name + ' floor');
      assert.ok(text.includes(naive), name + ' naive ratio');
    }
  });

  test('no document still quotes the figures of the observer point this repository no longer carries', () => {
    for (const name of ['README.md', 'USAGE.md']) {
      const text = read(name);
      for (const gone of ['11.35x', '12924 km', '83 km away']) assert.ok(!text.includes(gone), name + ' still says ' + gone);
    }
  });
});
