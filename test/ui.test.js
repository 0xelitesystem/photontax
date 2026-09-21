// THE UI TEST SUITE. Everything the UI team owns, and the two things that can only be proven
// against a rendered document.
//
// The suite is organised around the claims the page makes about itself, not around the files:
//
//   the claim boundary      no figure renders without a badge, proven three ways: against the
//                           parts a sentence is built from, against the assembled page HTML
//                           with the same scanner the build gate uses, and against a rendered
//                           document walked text node by text node
//   contrast                every pair the page places, in both themes, by arithmetic
//   the reveal              the order of the three segments, the timings, and reduced motion
//   the numbers             the pre click fact and the whole decomposition recomputed and
//                           compared against the figures DESIGN publishes
//   the build               the bundler, the minifier, the payload and the declared hosts
//
// No browser, no jsdom, no dependency of any kind. test/helpers/minidom.mjs is a small DOM
// written for exactly the surface the page uses.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { THEMES, PAIRS, AA_NORMAL, contrastRatio as tokenContrast } from '../src/core/tokens.js';
import { greatCircleKm } from '../src/core/geo.js';
import { floorMsForDistanceKm, V_FIBRE_KM_S, WARM_SAMPLE_COUNT } from '../src/core/constants.js';
import { computed, measured, UNITS, METHODS, renderClaim } from '../src/core/claim.js';
import { endpointById } from '../src/core/data/endpoints.js';
import { displaySegments } from '../src/core/contracts/decomposition.js';
import { assertViewModel } from '../src/core/contracts/viewmodel.js';

import { USED_PAIRS, USED_COLOUR_PAIRS, cssVarName } from '../src/ui/pairs.js';
import { buildCss } from '../src/ui/styles.js';
import { contrastRatio as uiContrast, relativeLuminance as uiLuminance, normaliseHex } from '../src/ui/wcag.js';
import { ALL_HOSTS } from '../src/ui/hosts.js';
import { t, c, pp, plainText, claimsIn } from '../src/ui/parts.js';
import { buildPreMeasurement, PRE_MEASUREMENT_PAIR } from '../src/ui/premeasurement.js';
import { buildViewModel, buildHeadline, sortWorstFirst, worstRow, rowClaims } from '../src/ui/viewmodel.js';
import { runSelfTest, checkFasterThanLight, checkContrastLive, checkProvenanceCompleteness } from '../src/ui/selftest.js';
import { buildMaths, mathsPlainText } from '../src/ui/maths.js';
import { buildGlobeInput, globeAriaSummary, DPR_CAP } from '../src/ui/globeinput.js';
import { TIMING, TIMING_REDUCED, timingFor, SEGMENT_ORDER, segmentsVisibleAt, easeOutCubic, countUpValue, driveCountUp } from '../src/ui/reveal.js';
import { fixtureMeasurementRun, decomposeFixture, FIXTURE_ROUND_TRIPS } from '../src/ui/fixture.js';
import { pickableCities, cityById } from '../src/ui/citypicker.js';
import { wireMeasurement } from '../src/ui/adapters.js';
import { resetPorts, hasMeasurementEngine, getMeasurementEngine, registerRenderer, hasRenderer } from '../src/ui/ports.js';

import { minify, stripComments } from '../scripts/minify.mjs';
import {
  wrapModule, buildGraph, cspContent, againstBudget, selftest as buildSelftest,
  CRITICAL_PATH_BUDGET_GZIP_BYTES, TOTAL_PAGE_BUDGET_GZIP_BYTES, PAYLOAD_BUDGET_GZIP_BYTES,
  FAST_3G_BYTES_PER_10MS,
} from '../scripts/build.mjs';
import { renderOpeningFrame, serialize, createDocument } from '../scripts/prerender.mjs';
import { ALL_DECLARED_HOSTS, cspConnectSrcHosts } from '../scripts/gate-csp.mjs';
import { scanHtmlForBadges, scanJsForBadges } from '../scripts/gate-badges.mjs';

import { makeWindow } from './helpers/minidom.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = path.join(REPO, 'index.html');
/** The deferred half. DESIGN 6.3. */
const DEFERRED = path.join(REPO, 'assets', 'globe.js');

/** The token values for one theme, as the page would resolve them from custom properties. */
function cssVarsFor(themeName) {
  const theme = THEMES[themeName];
  /** @type {Record<string,string>} */
  const vars = {};
  for (const [k, v] of Object.entries(theme.surface)) vars[cssVarName('surface', k)] = v;
  for (const [k, v] of Object.entries(theme.text)) vars[cssVarName('text', k)] = v;
  for (const [k, v] of Object.entries(theme.line)) vars[cssVarName('line', k)] = v;
  return vars;
}

/* ============================================================================================
 * CONTRAST. DESIGN 6.6: by math, in both themes, never by eye.
 * ========================================================================================== */

describe('contrast, verified by arithmetic', () => {
  test('every pair the page places is declared in tokens.js PAIRS', () => {
    for (const p of USED_PAIRS) {
      if (p.text === null) continue;
      const declared = PAIRS.some((q) => q.surface === p.surface && q.text === p.text);
      assert.ok(declared, p.selector + ' places ' + p.text + ' on ' + p.surface
        + ', which PAIRS does not declare, so nothing has ever checked it');
    }
  });

  test('every pair the page places clears AA in BOTH themes', () => {
    let checked = 0;
    for (const [themeName, theme] of Object.entries(THEMES)) {
      for (const p of USED_COLOUR_PAIRS) {
        const r = tokenContrast(theme.text[p.text], theme.surface[p.surface]);
        checked += 1;
        assert.ok(r >= AA_NORMAL,
          themeName + ' ' + p.text + ' on ' + p.surface + ' is ' + r.toFixed(2) + ':1');
      }
    }
    assert.equal(checked, USED_COLOUR_PAIRS.length * 2);
    assert.ok(USED_COLOUR_PAIRS.length >= 9, 'the page places at least the nine design pairs');
  });

  test('the shipped WCAG maths agrees with the palette module to 1e-12', () => {
    const values = new Set();
    for (const theme of Object.values(THEMES)) {
      for (const group of [theme.surface, theme.text, theme.line]) {
        for (const v of Object.values(group)) values.add(v);
      }
    }
    // Plus a deterministic sweep, so agreement is not an accident of the palette.
    for (let i = 0; i < 256; i += 17) {
      const h = i.toString(16).padStart(2, '0');
      values.add('#' + h + h + h);
      values.add('#' + h + '00ff');
    }
    const list = [...values];
    for (const a of list) {
      assert.ok(Math.abs(uiLuminance(a) - uiLuminance(a)) < 1e-15);
      for (const b of list) {
        assert.ok(Math.abs(uiContrast(a, b) - tokenContrast(a, b)) < 1e-12,
          'the two implementations disagree on ' + a + ' over ' + b);
      }
    }
  });

  test('the shipped WCAG maths refuses malformed input rather than returning NaN', () => {
    for (const junk of ['red', '#fff0', '', 'rgb(0,0,0)', null]) {
      assert.throws(() => uiLuminance(junk), TypeError);
    }
    assert.equal(normaliseHex('#ABC'), '#aabbcc');
    assert.equal(normaliseHex('  #0A0A0A '), '#0a0a0a');
  });

  test('the generated stylesheet contains only token colours', () => {
    const css = buildCss();
    const declared = new Set(['#000000', '#ffffff']);
    for (const theme of Object.values(THEMES)) {
      for (const group of [theme.surface, theme.text, theme.line]) {
        for (const v of Object.values(group)) declared.add(v.toLowerCase());
      }
    }
    for (const hex of css.match(/#[0-9a-fA-F]{6}\b/g) || []) {
      assert.ok(declared.has(hex.toLowerCase()), hex + ' is not a token');
    }
  });

  test('the stylesheet defines both themes and a data-theme override for each', () => {
    const css = buildCss();
    assert.match(css, /@media \(prefers-color-scheme: light\)/);
    assert.match(css, /:root\[data-theme="light"\]/);
    assert.match(css, /:root\[data-theme="dark"\]/);
  });
});

/* ============================================================================================
 * THE CLAIM BOUNDARY.
 * ========================================================================================== */

describe('the claim boundary', () => {
  test('a prose run containing a figure is refused at construction', () => {
    assert.throws(() => t('Mumbai costs you 251 ms.'), TypeError);
    assert.doesNotThrow(() => t('Mumbai costs you '));
  });

  test('provenance prose must state where its figures come from', () => {
    assert.throws(() => pp('COMPUTED', 'Under 500 km a ratio is an artifact.', ''), TypeError);
    assert.throws(() => pp('GUESSED', 'x', 'y'), RangeError);
    assert.doesNotThrow(() => pp('COMPUTED', 'Under 500 km it is an artifact.', METHODS.ROUTE_RATIO));
  });

  test('the plain text of a sentence still carries every badge word', () => {
    const claim = computed(126.5, UNITS.MS, METHODS.FIBRE_FLOOR);
    const parts = [t('the floor is '), c(claim), t('.')];
    assert.equal(plainText(parts), 'the floor is 127 ms [COMPUTED].');
    assert.equal(claimsIn(parts).length, 1);
  });

  test('a claim cannot be stringified into a sentence by accident', () => {
    const claim = measured(9, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP);
    assert.throws(() => `${claim}`, TypeError);
    assert.throws(() => String(claim), TypeError);
    assert.throws(() => JSON.stringify({ claim }), TypeError);
  });

  test('claiming to measure what is inferred fails at construction', () => {
    assert.throws(() => measured(39.04, UNITS.UNITLESS, METHODS.REGION_CITY_CENTRE), TypeError);
  });
});

/* ============================================================================================
 * THE PRE CLICK FACT. DESIGN 5, seconds 0 to 3.
 * ========================================================================================== */

describe('the fact a reader gets before clicking anything', () => {
  const pre = buildPreMeasurement();

  test('both ends are rows the reader will also see in the result', () => {
    assert.ok(endpointById(PRE_MEASUREMENT_PAIR.fromId).measured);
    assert.ok(endpointById(PRE_MEASUREMENT_PAIR.toId).measured);
  });

  test('the distance and the floor are recomputed, never typed', () => {
    const from = endpointById(PRE_MEASUREMENT_PAIR.fromId);
    const to = endpointById(PRE_MEASUREMENT_PAIR.toId);
    const km = greatCircleKm({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon });
    assert.equal(pre.distance.value, km);
    assert.equal(pre.floor.value, floorMsForDistanceKm(km));
  });

  test('the sentence says a floor is a floor, and carries two badged figures', () => {
    assert.equal(claimsIn(pre.parts).length, 2);
    assert.match(pre.sentence, /\[COMPUTED\]/);
    assert.match(pre.sentence, /cannot make that round trip in under/);
  });

  test('the assumption behind the coordinates travels with them', () => {
    assert.match(pre.disclaimer, /city or an area for each region, not a building/);
  });
});

/* ============================================================================================
 * THE NUMBERS. Reproduced against what DESIGN publishes.
 * ========================================================================================== */

describe('the decomposition, against the figures DESIGN publishes', () => {
  const run = fixtureMeasurementRun();
  const d = decomposeFixture(run);

  test('the access baseline reproduces the published 8.39 ms', () => {
    assert.equal(Number(d.accessMs.toFixed(2)), 8.39);
    assert.equal(d.accessFromEndpointId, 'aws:us-east-1');
  });

  test('the endpoint that sets the baseline has a route surplus of exactly zero', () => {
    const setter = d.rows.find((r) => r.endpointId === d.accessFromEndpointId);
    assert.ok(Math.abs(setter.routeMs) < 1e-9);
  });

  test('every published route ratio is reproduced to two decimals', () => {
    const expected = {
      'aws:eu-central-1': 1.29,
      'aws:sa-east-1': 1.56,
      'aws:ap-northeast-1': 1.64,
      'aws:ap-south-1': 1.92,
      'aws:ap-southeast-2': 1.28,
    };
    for (const [id, want] of Object.entries(expected)) {
      const row = d.rows.find((r) => r.endpointId === id);
      assert.equal(Number(row.routeRatio.toFixed(2)), want, id);
    }
  });

  test('no ratio and no verdict is produced under the short distance gate', () => {
    const near = d.rows.find((r) => r.endpointId === 'aws:us-east-1');
    assert.equal(near.routeRatio, null);
    assert.equal(near.verdict, null);
    assert.match(near.ratioSuppressedReason, /would be an artifact rather than a result/);
  });

  test('the rows sort by route surplus, worst first', () => {
    const sorted = sortWorstFirst(d.rows);
    assert.equal(sorted[0].endpointId, 'aws:ap-south-1');
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i - 1].routeMs >= sorted[i].routeMs);
    }
    assert.equal(worstRow(d.rows).endpointId, 'aws:ap-south-1');
  });

  test('the headline sentence is the one DESIGN 5 quotes, badges and all', () => {
    const headline = buildHeadline(worstRow(d.rows));
    assert.equal(headline.sentence,
      'Mumbai costs you 251 ms [MEASURED]. Physics charges 127 ms [COMPUTED]. '
      + 'Your own last mile charges 8 ms [MEASURED]. Your route charges 116 ms [MEASURED]. '
      + 'There are 97 ms [COMPUTED] on the table.');
  });

  test('the three displayed parts sum EXACTLY to the displayed total on every row', () => {
    for (const row of d.rows) {
      const s = displaySegments(row);
      assert.equal(s.physicsMs + s.accessMs + s.routeMs, s.totalMs, row.endpointId);
    }
  });

  test('a faster than light row is a defect, never a result', () => {
    const broken = fixtureMeasurementRun();
    broken.endpoints[4].roundTripMs = 1;
    broken.endpoints[4].samplesMs = broken.endpoints[4].samplesMs.map(() => 1);
    const out = decomposeFixture(broken);
    assert.equal(out.defects.length, 1);
    assert.equal(out.defects[0].defect.kind, 'faster-than-light');
    assert.ok(!out.rows.some((r) => r.endpointId === 'aws:ap-south-1'));
    // And it must not have dragged the baseline down with it.
    assert.equal(Number(out.accessMs.toFixed(2)), 8.39);
  });
});

/* ============================================================================================
 * THE VIEW MODEL.
 * ========================================================================================== */

describe('the view model', () => {
  test('the idle state has touched nothing and shows no rows', () => {
    const vm = buildViewModel({ state: 'idle', selfTest: [] });
    assert.equal(vm.rows.length, 0);
    assert.equal(vm.headline, null);
    assert.ok(vm.preMeasurement.sentence.length > 0);
    assert.ok(vm.destinationHosts.length > 0);
    assert.match(vm.consentSentence, /Nothing is uploaded\. Nothing is stored\./);
  });

  test('the consent sentence states the number of requests the engine will actually make', async () => {
    // DESIGN 5 writes this line as "7 small HTTPS requests to each of 12". The method also
    // makes one discarded warm up per endpoint (trap 5) and one facility request (DESIGN 2.2),
    // so the truthful figures are 8 and 97. This test pins the sentence to the engine's own
    // plan, so the two cannot drift and the line cannot quietly shrink back to the nicer
    // number. A consent line rounded in the comfortable direction is not a rounding error.
    const { requestPlan } = await import('../src/measure/run.js');
    const plan = requestPlan();
    const vm = buildViewModel({ state: 'idle', selfTest: [] });

    assert.equal(plan.perEndpoint, 8);
    assert.equal(plan.totalRequests, 97);
    assert.ok(vm.consentSentence.includes(String(plan.perEndpoint) + ' small HTTPS requests'),
      vm.consentSentence);
    assert.ok(vm.consentSentence.includes(String(plan.endpointCount) + ' public cloud endpoints'),
      vm.consentSentence);
    assert.ok(vm.consentSentence.includes(String(plan.totalRequests) + ' requests in total'),
      vm.consentSentence);
    assert.ok(!vm.consentSentence.includes('7 small HTTPS requests'),
      'the sentence understates the request count');
  });

  test('every numeric cell of every row is a Claim, and a bare number is refused', () => {
    const run = fixtureMeasurementRun();
    const vm = buildViewModel({ state: 'done', decomposition: decomposeFixture(run) });
    for (const row of vm.rows) {
      for (const key of ['distance', 'roundTrip', 'physics', 'access', 'route']) {
        assert.equal(typeof row.cells[key], 'object');
        assert.ok(renderClaim(row.cells[key]).text.includes('['));
      }
    }
    // The validator is what refuses a bare number, so it is the validator that is tested. The
    // builder cannot produce one, which is the point; assertViewModel is the net under it.
    const bad = { ...vm, rows: [{ ...vm.rows[0], cells: { ...vm.rows[0].cells, route: 116 } }] };
    assert.throws(() => assertViewModel(bad), /got a bare number/);
  });

  test('a row with no ratio carries a reason and no verdict', () => {
    const run = fixtureMeasurementRun();
    const vm = buildViewModel({ state: 'done', decomposition: decomposeFixture(run) });
    const near = vm.rows.find((r) => r.endpointId === 'aws:us-east-1');
    assert.equal(near.cells.ratio, null);
    assert.equal(near.verdictText, null);
    assert.ok(near.suppressedReason.length > 0);
  });

  test('row cells are built from the displayed integers, so the bar adds up', () => {
    const run = fixtureMeasurementRun();
    const d = decomposeFixture(run);
    const row = worstRow(d.rows);
    const { cells, segments } = rowClaims(row);
    assert.equal(cells.physics.value + cells.access.value + cells.route.value, cells.roundTrip.value);
    assert.equal(segments.totalMs, Math.round(row.roundTripMs));
  });
});

/* ============================================================================================
 * THE REVEAL. DESIGN 5.
 * ========================================================================================== */

describe('the ten second reveal', () => {
  test('the three segments animate physics, then access, then route', () => {
    assert.deepEqual([...SEGMENT_ORDER], ['physics', 'access', 'route']);
  });

  test('before the run lands only physics may be drawn, because only physics is known', () => {
    assert.deepEqual([...segmentsVisibleAt('idle')], []);
    assert.deepEqual([...segmentsVisibleAt('floors')], ['physics']);
    assert.deepEqual([...segmentsVisibleAt('full')], ['physics', 'access', 'route']);
    assert.throws(() => segmentsVisibleAt('whenever'), RangeError);
  });

  test('reduced motion cuts to the final state rather than animating slowly', () => {
    for (const v of Object.values(TIMING_REDUCED)) assert.equal(v, 0);
    assert.equal(timingFor(true), TIMING_REDUCED);
    assert.equal(timingFor(false), TIMING);
    assert.equal(countUpValue(251, 0, 0), 251);
  });

  test('the count up starts at zero and lands exactly on the value', () => {
    assert.equal(easeOutCubic(0), 0);
    assert.equal(easeOutCubic(1), 1);
    assert.equal(countUpValue(251, 0, 900), 0);
    assert.equal(countUpValue(251, 900, 900), 251);
    assert.ok(countUpValue(251, 450, 900) > 125, 'the ease decelerates into the value');
  });

  test('the count up always emits a final frame of exactly one', () => {
    const frames = [];
    let clock = 0;
    driveCountUp({
      durationMs: 100,
      onFrame: (f) => frames.push(f),
      now: () => clock,
      schedule: (cb) => { clock += 40; cb(clock); },
    });
    assert.equal(frames[frames.length - 1], 1);
    assert.ok(frames.length >= 2);
  });

  test('the CSS transition durations match the choreography', () => {
    const css = buildCss();
    assert.ok(css.includes(TIMING.segmentFillMs + 'ms'), 'segment fill duration');
    assert.ok(css.includes(TIMING.accessDelayMs + 'ms'), 'access delay');
    assert.ok(css.includes(TIMING.routeDelayMs + 'ms'), 'route delay');
    assert.ok(css.includes(TIMING.reorderMs + 'ms'), 'row reorder duration');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });
});

/* ============================================================================================
 * THE GLOBE INPUT. An arc is a great circle, and nothing else.
 * ========================================================================================== */

describe('the globe input', () => {
  const observer = { lat: 38.3, lon: -77.46, label: 'Virginia' };

  test('an arc carries no intermediate point, because that would be a claim about a route', () => {
    const g = buildGlobeInput({
      observer, arcEndpointIds: ['aws:ap-south-1'], theme: 'dark',
      reducedMotion: false, idle: false,
    });
    assert.equal(g.arcs.length, 1);
    assert.ok(!('waypoints' in g.arcs[0]));
    assert.ok(!('path' in g.arcs[0]));
  });

  test('at most one arc may carry the accent', () => {
    const g = buildGlobeInput({
      observer, arcEndpointIds: ['aws:ap-south-1', 'aws:eu-central-1'], theme: 'dark',
      worstEndpointId: 'aws:ap-south-1', selectedEndpointId: 'aws:ap-south-1',
      reducedMotion: false, idle: false,
    });
    assert.equal(g.arcs.filter((a) => a.state === 'worst').length, 1);
    assert.equal(g.arcs.filter((a) => a.state === 'selected').length, 0);
  });

  test('reduced motion means every arc is already finished', () => {
    const g = buildGlobeInput({
      observer, arcEndpointIds: ['aws:ap-south-1'], progress: { 'aws:ap-south-1': 0.3 },
      theme: 'dark', reducedMotion: true, idle: true,
    });
    assert.equal(g.arcs[0].progress, 1);
  });

  test('the device pixel ratio is capped no matter what the device says', () => {
    const g = buildGlobeInput({
      observer, arcEndpointIds: [], theme: 'dark', reducedMotion: false, idle: true,
      devicePixelRatio: 4,
    });
    assert.equal(g.devicePixelRatioCap, DPR_CAP);
  });

  test('before there is an observer the scene is a bare planet, not a made up point', () => {
    // DESIGN 5 second 0: the page is already painted before anything has touched the network,
    // and at that moment this page has asked nobody anything. The contract expresses that as a
    // null observer, so the planet is drawn and no dot is plotted anywhere.
    const g = buildGlobeInput({
      observer: null, arcEndpointIds: [], theme: 'dark', reducedMotion: false, idle: false,
    });
    assert.equal(g.observer, null);
    assert.deepEqual(g.arcs, []);
    assert.match(g.ariaSummary, /No measurement has been taken/);
  });

  test('an arc without an observer is refused, because every arc starts at one', () => {
    assert.throws(() => buildGlobeInput({
      observer: null, arcEndpointIds: ['aws:ap-south-1'], theme: 'dark',
      reducedMotion: false, idle: true,
    }), /arc starts at the single observation point/);
  });

  test('the canvas text alternative carries no figure, because a figure needs a badge', () => {
    for (const summary of [globeAriaSummary('IAD', 0, null), globeAriaSummary('IAD', 12, 'Mumbai')]) {
      assert.ok(!/\d/.test(summary), summary);
      assert.match(summary, /decorative/);
    }
  });
});

/* ============================================================================================
 * THE SELF TEST.
 * ========================================================================================== */

describe('the self test', () => {
  test('every check that needs no network passes on a clean build', () => {
    for (const r of runSelfTest({})) {
      assert.ok(r.passed, r.label + ': ' + r.detail);
      assert.ok(!/\d/.test(r.label), 'a check label carries no figure: ' + r.label);
    }
  });

  test('every check over a clean run passes', () => {
    const run = fixtureMeasurementRun();
    const results = runSelfTest({ decomposition: decomposeFixture(run), measurement: run });
    assert.ok(results.length >= 10);
    for (const r of results) assert.ok(r.passed, r.label + ': ' + r.detail);
  });

  test('the faster than light screen FAILS when a faster than light row is presented', () => {
    // The positive control. A check nobody has watched fail is not a check.
    const run = fixtureMeasurementRun();
    const d = decomposeFixture(run);
    const poisoned = { ...d, rows: d.rows.map((r) => ({ ...r, roundTripMs: r.floorMs - 1 })) };
    assert.equal(checkFasterThanLight(poisoned).passed, false);
  });

  test('the contrast check FAILS when a token is swapped for one that does not clear AA', () => {
    const vars = cssVarsFor('dark');
    vars[cssVarName('text', 'inkFaint')] = '#777777';
    const win = makeWindow({ cssVars: vars });
    assert.equal(checkContrastLive(win.document).passed, false);
  });

  test('the contrast check FAILS rather than passes when a value cannot be read', () => {
    const win = makeWindow({ cssVars: {} });
    assert.equal(checkContrastLive(win.document).passed, false);
  });

  test('the contrast check passes against the real palette in both themes', () => {
    for (const theme of ['dark', 'light']) {
      const win = makeWindow({ cssVars: cssVarsFor(theme) });
      const r = checkContrastLive(win.document);
      assert.ok(r.passed, theme + ': ' + r.detail);
    }
  });
});

/* ============================================================================================
 * THE MATHS PANEL. DESIGN 5, the second beat.
 * ========================================================================================== */

describe('show the maths', () => {
  const run = fixtureMeasurementRun();
  const d = decomposeFixture(run);
  const row = worstRow(d.rows);
  const steps = buildMaths({
    row,
    run: d,
    observer: { label: 'Virginia', lat: 38.3, lon: -77.46, source: 'visitor-picked-city', colo: null },
    measurement: run.endpoints.find((m) => m.endpointId === row.endpointId),
  });
  const text = mathsPlainText(steps);

  test('it prints both coordinates, the whole haversine, the constant and the division', () => {
    assert.deepEqual(steps.map((s) => s.id),
      ['coordinates', 'haversine', 'constant', 'floor', 'samples', 'access', 'subtraction']);
  });

  test('every intermediate term of the great circle is on screen', () => {
    for (const phrase of [
      'Latitude difference in radians', 'Longitude difference in radians', 'Haversine term',
      'Central angle in radians', 'Sphere radius in kilometres',
    ]) assert.ok(text.includes(phrase), phrase);
  });

  test('the constant is shown as its two inputs and the division between them', () => {
    assert.ok(text.includes('299792458 [COMPUTED]'));
    assert.ok(text.includes('1.4682 [COMPUTED]'));
    assert.ok(text.includes(V_FIBRE_KM_S.toFixed(5) + ' km/s [COMPUTED]'));
    assert.ok(text.includes('9.7948 [COMPUTED] milliseconds of round trip floor'));
  });

  test('all seven raw samples are shown, with exactly one marked as the minimum', () => {
    const samples = steps.find((s) => s.id === 'samples').samples;
    assert.equal(samples.length, WARM_SAMPLE_COUNT);
    assert.equal(samples.filter((s) => s.isMin).length, 1);
    assert.ok(text.includes('The estimator is the minimum, not the mean'));
  });

  test('the observer coordinate is INFERRED even when the facility name is REPORTED', () => {
    const withColo = buildMaths({
      row,
      run: d,
      observer: { label: 'IAD', lat: 38.3, lon: -77.46, source: 'cloudflare-colo', colo: 'IAD' },
      measurement: run.endpoints.find((m) => m.endpointId === row.endpointId),
    });
    const s = mathsPlainText(withColo);
    assert.ok(s.includes('IAD [REPORTED]'), 'the facility named itself');
    assert.ok(s.includes('38.3000 [INFERRED]'), 'its coordinate is a city centre we chose');
  });

  test('the subtraction, the ratio, the thresholds and the verdict are all printed', () => {
    assert.ok(text.includes('What is left is the route surplus'));
    assert.ok(text.includes('1.15x [COMPUTED]'));
    assert.ok(text.includes('1.60x [COMPUTED]'));
    assert.ok(text.includes('Your path is materially longer than the geography requires'));
  });
});

/* ============================================================================================
 * THE CITY PICKER. DESIGN trap 7.
 * ========================================================================================== */

describe('the city picker', () => {
  test('it offers cities the page already ships a coordinate for, deduplicated and sorted', () => {
    const cities = pickableCities();
    assert.ok(cities.length > 30);
    const labels = cities.map((x) => x.label);
    assert.deepEqual(labels, [...new Set(labels)]);
    assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, 'en')));
    assert.ok(cities.every((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)));
  });

  test('a picked city resolves back to its coordinate', () => {
    const one = pickableCities()[0];
    assert.deepEqual(cityById(one.id), one);
    assert.equal(cityById('not-a-city'), null);
  });
});

/* ============================================================================================
 * THE PORTS AND THE ADAPTER.
 * ========================================================================================== */

describe('the ports', () => {
  test('the adapter reports every endpoint as it lands, without taking the measurement over', () => {
    resetPorts();
    const seen = [];
    let sawWrapper = false;
    wireMeasurement({
      measureEndpoint: async (e) => ({ endpointId: e.id, roundTripMs: 1 }),
      measure: async (opts) => {
        sawWrapper = typeof opts.deps.measureEndpoint === 'function';
        await opts.deps.measureEndpoint({ id: 'aws:ap-south-1' }, {});
        return { state: 'done', measurement: null, decomposition: null, notices: [], selfTest: [] };
      },
    });
    assert.ok(hasMeasurementEngine());
    return getMeasurementEngine()({ onEndpointDone: (m) => seen.push(m.endpointId) })
      .then(() => {
        assert.ok(sawWrapper, 'the adapter injects a reporting wrapper');
        assert.deepEqual(seen, ['aws:ap-south-1']);
        resetPorts();
      });
  });

  test('a drawing fault never fails a measurement', () => {
    resetPorts();
    wireMeasurement({
      measureEndpoint: async () => ({ endpointId: 'x', roundTripMs: 1 }),
      measure: async (opts) => {
        await opts.deps.measureEndpoint({ id: 'x' }, {});
        return { state: 'done' };
      },
    });
    return getMeasurementEngine()({ onEndpointDone: () => { throw new Error('canvas fell over'); } })
      .then((r) => { assert.equal(r.state, 'done'); resetPorts(); });
  });

  test('a renderer must offer both mount and update', () => {
    resetPorts();
    assert.throws(() => registerRenderer({ mount: () => {} }), TypeError);
    registerRenderer({ mount: () => {}, update: () => {} });
    assert.ok(hasRenderer());
    resetPorts();
  });
});

/* ============================================================================================
 * THE DECLARED HOSTS. DESIGN trap 1.
 * ========================================================================================== */

describe('the declared hosts', () => {
  test('the list the page prints equals the list the gate enforces', () => {
    assert.deepEqual([...ALL_HOSTS], [...ALL_DECLARED_HOSTS]);
  });

  test('the generated policy declares exactly those hosts and nothing else', () => {
    const meta = '<meta http-equiv="Content-Security-Policy" content="'
      + cspContent(ALL_DECLARED_HOSTS) + '">';
    assert.deepEqual(cspConnectSrcHosts(meta), [...ALL_DECLARED_HOSTS].sort());
  });

  test('the policy forbids everything it does not need', () => {
    const csp = cspContent(ALL_DECLARED_HOSTS);
    for (const directive of ["default-src 'none'", "img-src 'none'", "font-src 'none'",
      "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
      assert.ok(csp.includes(directive), directive);
    }
  });
});

/* ============================================================================================
 * THE MINIFIER AND THE BUNDLER.
 * ========================================================================================== */

describe('the minifier', () => {
  test('it strips comments', () => {
    assert.equal(minify('const a = 1; // trailing\n/* block */\nconst b = 2;'),
      'const a = 1;\nconst b = 2;');
  });

  test('it never touches the inside of a string, a template or a regular expression', () => {
    const cases = [
      "const u = 'https://example.com/x';",
      'const u = "a // b /* c */ d";',
      'const r = /a\\/\\/b/g;',
      'const r = /[/]/.test(s);',
      'const s = `a ${b} // c`;',
      'const s = `outer ${`inner ${x}`} end`;',
      'const d = a / b / c;',
      "const q = 'it\\'s';",
    ];
    for (const src of cases) assert.equal(stripComments(src), src, src);
  });

  test('a block comment between two tokens does not glue them together', () => {
    assert.equal(minify('const a = b /* x */ + c;'), 'const a = b + c;');
  });

  test('a comment inside a template substitution is still removed', () => {
    assert.equal(stripComments('const s = `a ${b /* gone */} c`;'), 'const s = `a ${b } c`;');
  });
});

describe('the bundler', () => {
  // THESE TWO READ THE REWRITING ITSELF, so they ask for it unminified. The shipped page runs
  // each module body and its return statement through scripts/mangle.mjs, which renames local
  // bindings and drops the spaces JavaScript does not need, so the shipped text of the same
  // snippet is correct and unrecognisable. What the rewriting MEANS is asserted on the shipped
  // path by the test below them, and over the whole bundle further down.
  test('a module keeps its exports and loses its import statements', () => {
    const out = wrapModule("import { a } from './x.js';\nexport const b = a + 1;\n", 'src/ui/y.js',
      { minify: false });
    assert.ok(out.includes('const { a } = __m["src/ui/x.js"];'));
    assert.ok(out.includes('return { b };'));
    assert.ok(!/^import/m.test(out));
  });

  test('a name both imported and re exported is declared exactly once', () => {
    const out = wrapModule(
      "import { a, z } from './x.js';\nexport { a, q } from './x.js';\n", 'src/ui/y.js',
      { minify: false });
    const declarations = out.match(/const \{[^}]*\} = __m/g) || [];
    assert.equal(declarations.length, 2);
    assert.equal((out.match(/\ba\b(?=[,\s}])/g) || []).filter((x) => x === 'a').length >= 1, true);
    // `a` is bound by the import; the re export line may only add `q`.
    assert.ok(out.includes('const { q } = __m["src/ui/x.js"];'));
    assert.ok(out.includes('return { a, q };'));
  });

  test('the shipped form of a module exports the same names and the same values', () => {
    const src = "import { a } from './x.js';\nexport const b = a + 1;\n"
      + 'export function twice(n) { const doubled = n * 2; return doubled; }\n';
    const readable = wrapModule(src, 'src/ui/y.js', { minify: false });
    const shipped = wrapModule(src, 'src/ui/y.js');

    assert.ok(shipped.length < readable.length, 'the shipped form is the smaller of the two: '
      + shipped.length + ' B against ' + readable.length + ' B');
    assert.ok(!/^import/m.test(shipped));

    const run = (code) => {
      const context = vm.createContext({ __m: { 'src/ui/x.js': { a: 41 } } });
      new vm.Script(code).runInContext(context);
      return context.__m['src/ui/y.js'];
    };
    const plain = run(readable);
    const small = run(shipped);
    assert.deepEqual(Object.keys(small).sort(), Object.keys(plain).sort());
    assert.equal(small.b, plain.b);
    assert.equal(small.b, 42);
    assert.equal(small.twice(21), plain.twice(21));
  });

  test('forms this build does not handle fail loudly rather than silently', () => {
    assert.throws(() => wrapModule('export default 1;\n', 'a.js'), /default export/);
    assert.throws(() => wrapModule("export * from './x.js';\n", 'a.js'), /export \*/);
    assert.throws(() => wrapModule("import x from 'left-pad';\n", 'a.js'), /relative path/);
  });

  test('the assembled and minified bundle produces the same values as the modules do', async () => {
    const modules = await buildGraph(['src/ui/main.js', 'src/ui/adapters.js'],
      (rel) => readFile(path.join(REPO, rel), 'utf8'));
    const code = modules.map((m) => wrapModule(m.src, m.rel)).join('\n');
    const context = vm.createContext({ __m: {} });
    new vm.Script(code).runInContext(context);
    const built = context.__m;

    assert.equal(built['src/core/constants.js'].V_FIBRE_KM_S, V_FIBRE_KM_S);
    assert.equal(
      built['src/core/geo.js'].greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }),
      greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }),
    );
    const claim = built['src/core/claim.js'].computed(126.594, 'ms', METHODS.FIBRE_FLOOR);
    assert.equal(built['src/core/claim.js'].renderClaim(claim).text, '127 ms [COMPUTED]');
    assert.equal(
      built['src/ui/premeasurement.js'].buildPreMeasurement().sentence,
      buildPreMeasurement().sentence,
    );
    assert.equal(
      built['src/ui/fixture.js'].decomposeFixture(built['src/ui/fixture.js'].fixtureMeasurementRun()).accessMs,
      decomposeFixture(fixtureMeasurementRun()).accessMs,
    );
  });
});

/* ============================================================================================
 * THE PAGE ITSELF.
 * ========================================================================================== */

describe('the rendered page', () => {
  /**
   * Mount the real page into the small DOM and run the fixture reveal end to end.
   * @param {object} opts
   */
  async function render(opts = {}) {
    const win = makeWindow({
      cssVars: cssVarsFor(opts.theme || 'dark'),
      search: opts.search === undefined ? '?fixture=1' : opts.search,
      reducedMotion: opts.reducedMotion,
      prefersLight: opts.theme === 'light',
    });
    const previous = globalThis.document;
    globalThis.document = win.document;
    try {
      const mountPoint = win.document.createElement('div');
      mountPoint.setAttribute('id', 'app');
      win.document.body.appendChild(mountPoint);
      const { App } = await import('../src/ui/main.js');
      const app = new App(win);
      app.start(mountPoint);
      return { win, app };
    } finally {
      globalThis.document = previous;
    }
  }

  test('it mounts, runs the fixture reveal, and shows every row', async () => {
    const { app } = await render();
    assert.ok(app.decomposition, 'the fixture produced a decomposition');
    assert.equal(app.page.rowNodes.size, 12, 'a row skeleton exists for every measured endpoint');
    const filled = [...app.page.rowNodes.values()]
      .filter((n) => n.tr.querySelector('.pt-cell-route').childNodes.length > 0);
    assert.equal(filled.length, FIXTURE_ROUND_TRIPS.length);
  });

  test('NOT ONE CELL IN THE RESULT TABLE IS BLANK, INCLUDING THE ROWS THAT HAVE NO FIGURE', async () => {
    // This is the rule that was being broken, and it was found by opening the page rather than
    // by a test. Six of the twelve rows on the capture fixture, and the row the faster than
    // light screen dropped on a live run, kept the empty cells they were born with. An empty
    // cell is the reader supplying their own explanation, and the one they supply is "zero"
    // (DESIGN trap 13: never a zero, never a spinner, always a stated condition).
    const { app } = await render();
    const rows = [...app.page.rowNodes.values()];
    assert.equal(rows.length, 12);

    const measuredIds = new Set(app.decomposition.rows.map((r) => r.endpointId));
    let explained = 0;

    for (const { tr } of rows) {
      const id = tr.getAttribute('data-endpoint');
      const cell = (sel) => (tr.querySelector(sel) || { textContent: '' }).textContent.trim();

      // The two arithmetic cells are always there, measured or not: a distance and a floor need
      // nothing from the network.
      assert.ok(tr.children[1].textContent.trim().length > 0, id + ': the distance cell is blank');
      assert.ok(cell('.pt-cell-physics').length > 0, id + ': the physics cell is blank');

      // Every row says something in the round trip cell and something in the ratio cell.
      assert.ok(cell('.pt-cell-roundtrip').length > 0, id + ': the round trip cell is blank');
      assert.ok(cell('.pt-cell-ratio').length > 0, id + ': the ratio cell is blank');

      if (!measuredIds.has(id)) {
        explained += 1;
        assert.equal(tr.getAttribute('data-row-state'), 'no-figure', id);
        assert.match(cell('.pt-cell-roundtrip'), /no measured figure to show/, id);
        assert.match(cell('.pt-cell-ratio'), /no round trip for this row/i, id);
        // And the sentence carries a badge like everything else on the page.
        for (const sel of ['.pt-cell-roundtrip', '.pt-cell-ratio']) {
          const only = tr.querySelector(sel).children[0];
          assert.ok(only && only.getAttribute('data-claim-badge'),
            id + ': the sentence in ' + sel + ' carries no provenance badge');
        }
      }
    }

    assert.equal(explained, 12 - FIXTURE_ROUND_TRIPS.length,
      'every row the fixture did not measure has to explain itself');
    assert.ok(explained > 0, 'this test proves nothing unless some row is unmeasured');
  });

  test('NO FIGURE ANYWHERE ON THE PAGE IS WITHOUT A BADGE', async () => {
    const { win, app } = await render();
    const previous = globalThis.document;
    globalThis.document = win.document;
    try {
      const r = checkProvenanceCompleteness(win.document, win.document.body);
      assert.ok(r.passed, r.detail);
      assert.ok(app.page.rowNodes.size > 0, 'and there were figures on it to check');
    } finally {
      globalThis.document = previous;
    }
  });

  test('the same page passes the build gate own HTML scanner', async () => {
    const html = await readFile(PAGE, 'utf8');
    const { hits, chrome } = scanHtmlForBadges(html, 'index.html');
    assert.deepEqual(hits.map((h) => h.line + ': ' + h.detail), []);
    assert.equal(chrome.length, 0, 'zero chrome exceptions used');
  });

  test('every UI module passes the build gate own JavaScript scanner', async () => {
    const files = [
      'dom.js', 'page.js', 'main.js', 'viewmodel.js', 'selftest.js', 'maths.js', 'parts.js',
      'reveal.js', 'ports.js', 'adapters.js', 'globeinput.js', 'premeasurement.js',
      'fixture.js', 'hosts.js', 'pairs.js', 'wcag.js', 'styles.js', 'citypicker.js',
    ];
    for (const f of files) {
      const src = await readFile(path.join(REPO, 'src', 'ui', f), 'utf8');
      assert.deepEqual(scanJsForBadges(src, f).map((h) => h.line + ' ' + h.detail), [], f);
    }
  });

  test('the one control is focused and nothing has touched the network', async () => {
    const { app } = await render({ search: '' });
    assert.equal(app.decomposition, null);
    assert.equal(app.page.rowNodes.size, 0);
    assert.match(app.page.refs.status.textContent, /Nothing on this page has touched the network/);
  });

  test('the consent sentence and every reachable host are on screen before any click', async () => {
    const { win } = await render({ search: '' });
    const body = win.document.body.textContent;
    for (const host of ALL_HOSTS) assert.ok(body.includes(host), host);
    assert.ok(body.includes('Nothing is uploaded. Nothing is stored.'));
  });

  test('the canvas is decorative and the table is the result', async () => {
    const { app } = await render();
    const wrap = app.page.refs.canvasWrap;
    // With no renderer in the build the scene states its own absence rather than going black.
    assert.equal(wrap.getAttribute('role'), 'note');
    assert.ok(wrap.textContent.includes('decorative in every build'));
  });

  test('reduced motion lands on the final figures immediately', async () => {
    const { app } = await render({ reducedMotion: true });
    assert.equal(app.reducedMotion, true);
    const headline = app.page.refs.headline.textContent;
    assert.ok(headline.includes('251 ms'), headline);
    assert.ok(headline.includes('97 ms'), headline);
  });

  test('the fixture says loudly that it is not the reader own connection', async () => {
    const { win } = await render();
    assert.match(win.document.body.textContent,
      /committed capture fixture, not a measurement of your connection/);
  });

  test('the four badges are distinguished by word and by shape, never by colour', async () => {
    const { win } = await render();
    const shapes = new Set();
    for (const badge of win.document.body.querySelectorAll('.pt-badge')) {
      const svg = badge.querySelector('svg');
      assert.ok(svg, 'every badge carries a shape as well as a word');
      const shape = svg.children[0];
      // The signature includes the geometry, because a diamond and a triangle are both a path
      // and the whole point of trap 19 is that the four kinds are four DIFFERENT shapes.
      shapes.add(shape.localName + ':' + (shape.getAttribute('d') || shape.getAttribute('r') || ''));
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
    }
    assert.ok(shapes.size >= 4, 'the four kinds are four different shapes: ' + [...shapes].join(', '));
  });
});

/* ============================================================================================
 * THE SHIPPED FILE.
 * ========================================================================================== */

describe('the shipped page', () => {
  test('it declares the CSP, and connect-src equals the dataset', async () => {
    const html = await readFile(PAGE, 'utf8');
    assert.deepEqual(cspConnectSrcHosts(html), [...ALL_DECLARED_HOSTS].sort());
  });

  test('it fetches nothing to render itself', async () => {
    const html = await readFile(PAGE, 'utf8');
    assert.equal(html.match(/<(?:script|img|iframe)\b[^>]*\bsrc\s*=\s*"(?!#)[^"]*"/gi), null);
    // A canonical link fetches nothing. Every rel that opens a connection is refused.
    assert.equal(html.match(/<link\b[^>]*\brel\s*=\s*"(?:stylesheet|preload|preconnect|dns-prefetch|icon|manifest)"/gi), null);
  });

  test('connect-src carries no quoted keyword, because the ship gate parser stops at a quote', async () => {
    const html = await readFile(PAGE, 'utf8');
    // pregate.sh parses this directive with a character class that excludes an apostrophe, so a
    // leading 'self' truncates its match to nothing and it reads the page as declaring no hosts
    // at all. The local gate parses it correctly and would pass, which is precisely the kind of
    // disagreement between two checks that is discovered at ship time.
    const directive = /connect-src([^;"]*)/i.exec(html);
    assert.ok(directive, 'the page declares connect-src');
    assert.ok(!directive[1].includes("'"),
      'a quoted keyword here blinds the authoritative gate: ' + directive[1]);
  });

  test('it carries no em dash and no en dash', async () => {
    const html = await readFile(PAGE, 'utf8');
    assert.equal(html.match(/[—–]/g), null);
  });

  test('it never inlines the banned phrase registry, and never the banned colour list', async () => {
    const html = await readFile(PAGE, 'utf8');
    assert.ok(!html.includes('PROPER_NOUN_EXCEPTIONS'), 'vocabulary.js must not reach the page');
    // scripts/banned-colours.mjs is not shipped copy and nothing under src/ imports it. The
    // palette itself DOES ship now, because src/globe/palette.js needs it at runtime, so the
    // assertion is on the two values rather than on the module that used to hold them.
    assert.ok(!html.includes('#a05a00'), 'a banned colour reached the page');
    assert.ok(!html.includes('#b8341a'), 'a banned colour reached the page');
  });

  test('it states the two budgets DESIGN 6.3 now states, and they are not round numbers', () => {
    // THE HISTORY MATTERS AND IT IS WHY THIS TEST PINS RATHER THAN READS.
    //
    // The old budget was one number, 40 KiB, for one file. It was an estimate written before
    // the product existed, it was silently raised to 96 KiB during integration, it was put
    // back, and the build then failed by 42,901 B on every run because the product the number
    // described was not the product that got built. DESIGN 6.3 has been rewritten with a pair
    // costed against the artifact, and the reasoning is in the design and in the comment above
    // each constant in scripts/build.mjs.
    //
    // Pinned so neither can drift a kilobyte at a time. Raising either is a reviewed diff.
    assert.equal(CRITICAL_PATH_BUDGET_GZIP_BYTES, 56_294);
    assert.equal(TOTAL_PAGE_BUDGET_GZIP_BYTES, 91_504);
    // Each is the measured artifact plus ten milliseconds of Fast 3G transfer, 1,887 B per
    // file. That is where the headroom comes from and it is why neither is a round number.
    assert.equal(CRITICAL_PATH_BUDGET_GZIP_BYTES % FAST_3G_BYTES_PER_10MS, 54_407 % FAST_3G_BYTES_PER_10MS);
    assert.ok(CRITICAL_PATH_BUDGET_GZIP_BYTES < TOTAL_PAGE_BUDGET_GZIP_BYTES,
      'the critical path must be a proper subset of the total, or the split means nothing');
    // Measured, not rounded. A budget on a power of two boundary is a budget somebody picked.
    assert.notEqual(CRITICAL_PATH_BUDGET_GZIP_BYTES % 1024, 0);
    assert.notEqual(TOTAL_PAGE_BUDGET_GZIP_BYTES % 1024, 0);
    // The alias exists so the old name lands on the new explanation rather than on nothing.
    assert.equal(PAYLOAD_BUDGET_GZIP_BYTES, TOTAL_PAGE_BUDGET_GZIP_BYTES);
  });

  test('the critical path is actually under the critical path budget', async () => {
    const { gzipSync } = await import('node:zlib');
    const html = await readFile(PAGE, 'utf8');
    const gz = gzipSync(Buffer.from(html, 'utf8'), { level: 9 }).length;
    assert.ok(gz <= CRITICAL_PATH_BUDGET_GZIP_BYTES,
      gz + ' B gzipped of index.html, which is ' + (gz - CRITICAL_PATH_BUDGET_GZIP_BYTES)
      + ' B over the ' + CRITICAL_PATH_BUDGET_GZIP_BYTES + ' B that must arrive before first '
      + 'contentful paint. Move something off the critical path or take it out. Do not raise '
      + 'the budget.');
  });

  test('the whole first visit is actually under the total page budget', async () => {
    const { gzipSync } = await import('node:zlib');
    const html = await readFile(PAGE, 'utf8');
    const globe = await readFile(DEFERRED, 'utf8');
    const gz = gzipSync(Buffer.from(html, 'utf8'), { level: 9 }).length
      + gzipSync(Buffer.from(globe, 'utf8'), { level: 9 }).length;
    assert.ok(gz <= TOTAL_PAGE_BUDGET_GZIP_BYTES,
      gz + ' B gzipped for index.html plus the deferred globe, '
      + (gz - TOTAL_PAGE_BUDGET_GZIP_BYTES) + ' B over. Deferring a thing is not the same as '
      + 'not shipping it, and this budget is what says so.');
  });

  test('the build budget gate fails when it should, which is the only reason to trust it', () => {
    // The positive control, run as a test as well as by `node scripts/build.mjs --selftest`.
    assert.ok(againstBudget(101, 100).over, 'one byte over must fail');
    assert.equal(againstBudget(100, 100).over, false, 'exactly at the budget must pass');
    assert.equal(againstBudget(99, 100).by, -1);
    assert.equal(buildSelftest(), 0, 'every positive control in scripts/build.mjs passes');
  });
});

/* ============================================================================================
 * THE SPLIT PAYLOAD. DESIGN 6.3.
 *
 * The globe is decorative by the page's own words, so it is not in front of first contentful
 * paint. These are the promises that deferring it may not break, each one checked against the
 * two files that actually ship rather than against the intention.
 * ========================================================================================== */

describe('the critical path and the deferred globe', () => {
  test('the opening frame is IN the document, so the paint does not wait for the script', async () => {
    const html = await readFile(PAGE, 'utf8');
    const app = /<div id="app">([\s\S]*?)<\/div>\s*<script type="module">/.exec(html);
    assert.ok(app, 'index.html carries a #app region followed by the module script');
    const frame = app[1];
    // The hook, at the top, before anything else the reader can see.
    assert.match(frame, /Light in glass cannot make that round trip in under/);
    assert.match(frame, /Nothing you build can beat that number/);
    // The one control, and the consent sentence that states the exact request count.
    assert.match(frame, /Measure my floor/);
    assert.match(frame, /Nothing is uploaded\. Nothing is stored\./);
    // Every destination, named before any click.
    for (const host of ALL_HOSTS) assert.ok(frame.includes(host), host + ' is not in the frame');
  });

  test('the hook leads: it is above the button, and the button is above the table', async () => {
    const html = await readFile(PAGE, 'utf8');
    const hook = html.indexOf('Nothing you build can beat that number');
    const button = html.indexOf('Measure my floor');
    const table = html.indexOf('id="result-table"');
    assert.ok(hook > 0 && button > 0, 'both the hook and the button are in the document');
    assert.ok(hook < button, 'the strongest line leads');
    // The result table is built in the browser, so it is not in the prerendered frame at all,
    // which is the strongest possible statement that the frame is the opening frame.
    assert.equal(table, -1, 'the result table is not part of the opening frame');
  });

  test('the prerendered frame is the page own markup, not a second copy of it', async () => {
    // renderOpeningFrame calls Page.buildSkipLink, buildMasthead and buildHero. If the build
    // ever grew a hand written hero, this comparison is what would catch it.
    const html = await readFile(PAGE, 'utf8');
    const frame = renderOpeningFrame({ hasEngine: true, rendererDeferred: true });
    assert.ok(html.includes(frame), 'the document carries exactly what the page builders emit');
    assert.ok(frame.includes('data-claim-badge="COMPUTED"'), 'and it carries real badges');
  });

  test('the serialiser escapes text and attributes rather than emitting markup', () => {
    const doc = createDocument();
    const previous = globalThis.document;
    globalThis.document = doc;
    try {
      const node = doc.createElement('p');
      node.setAttribute('title', 'a "quoted" & <angled> value');
      node.appendChild(doc.createTextNode('5 < 6 & 7 > 6'));
      const out = serialize(node);
      assert.equal(out, '<p title="a &quot;quoted&quot; &amp; &lt;angled&gt; value">'
        + '5 &lt; 6 &amp; 7 &gt; 6</p>');
    } finally {
      globalThis.document = previous;
    }
  });

  test('the document itself still fetches nothing, split or not', async () => {
    const html = await readFile(PAGE, 'utf8');
    assert.equal(html.match(/<(?:script|img|iframe)\b[^>]*\bsrc\s*=\s*"(?!#)[^"]*"/gi), null);
    assert.equal(html.match(/<link\b[^>]*\brel\s*=\s*"(?:stylesheet|preload|preconnect|dns-prefetch|icon|manifest|modulepreload)"/gi), null);
  });

  test('the deferred asset is same origin, static and relative, so it names no host', async () => {
    const html = await readFile(PAGE, 'utf8');
    const url = /globeUrl:\s*"([^"]+)"/.exec(html);
    assert.ok(url, 'the page hands src/ui/main.js a URL for the deferred globe');
    assert.equal(url[1], './assets/globe.js');
    assert.ok(!/^[a-z]+:/i.test(url[1]), 'no scheme');
    assert.ok(!url[1].startsWith('//'), 'no protocol relative host');
    // And it is a real file in this repository, not a route something has to serve.
    const globe = await readFile(DEFERRED, 'utf8');
    assert.ok(globe.length > 0);
  });

  test('the deferred file can reach no host, because it contains no address at all', async () => {
    const globe = await readFile(DEFERRED, 'utf8');
    const absolute = [...new Set(globe.match(/https?:\/\/[^\s'"`)]+/g) || [])];
    // The SVG XML namespace is a name, not an address, and nothing dereferences it.
    assert.deepEqual(absolute.filter((u) => u !== 'http://www.w3.org/2000/svg'), []);
    assert.equal(globe.match(/\bfetch\s*\(/g), null, 'the globe opens no connection');
  });

  test('connect-src is byte for byte what it was before the split', async () => {
    const html = await readFile(PAGE, 'utf8');
    assert.deepEqual(cspConnectSrcHosts(html), [...ALL_DECLARED_HOSTS].sort());
    // script-src gained 'self' and nothing else, which is the least that lets a same origin
    // file run and still forbids every host on the internet.
    const csp = /script-src([^;]*)/i.exec(html);
    assert.ok(csp, 'the page declares script-src');
    assert.equal(csp[1].trim(), "'unsafe-inline' 'self'");
  });

  test('the two halves share their modules instead of shipping them twice', async () => {
    const html = await readFile(PAGE, 'utf8');
    const globe = await readFile(DEFERRED, 'utf8');
    const modulesIn = (text) => new Set(
      [...text.matchAll(/__m\["(src\/[^"]+)"\]\s*=/g)].map((m) => m[1]),
    );
    const critical = modulesIn(html);
    const deferred = modulesIn(globe);
    assert.ok(critical.size > 0 && deferred.size > 0);
    const both = [...deferred].filter((m) => critical.has(m));
    assert.deepEqual(both, [], 'no module is built into both files');
    // The deferred half reads the registry the page published rather than rebuilding it.
    assert.match(globe, /var __m = window\.__photontax;/);
    assert.match(html, /window\.__photontax = __m;/);
    // And the globe really is what moved: the coastline is the single largest thing in it.
    assert.ok(deferred.has('src/globe/coastline-data.js'));
    assert.ok(deferred.has('src/globe/renderer.js'));
    assert.ok(!critical.has('src/globe/coastline-data.js'));
  });

  test('the deferred half still passes the badge scanner that governs shipped copy', async () => {
    const globe = await readFile(DEFERRED, 'utf8');
    assert.deepEqual(scanJsForBadges(globe, 'assets/globe.js').map((h) => h.line + ' ' + h.detail), []);
  });
});

/* ============================================================================================
 * THE ARTIFACT ITSELF RUNS.
 *
 * Every test above this line exercises the modules under src/. This one executes the script
 * that is actually inside index.html, in the same small DOM, and drives the fixture reveal
 * through it. It is the difference between "the code is right" and "the file we ship is right",
 * and the bundler and the minifier sit between those two statements.
 * ========================================================================================== */

describe('the shipped artifact, executed', () => {
  test('the script inside index.html mounts the page and produces the headline', async () => {
    const html = await readFile(PAGE, 'utf8');
    const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(script, 'index.html carries exactly one module script');

    const win = makeWindow({ cssVars: cssVarsFor('dark'), search: '?fixture=1' });
    const mountPoint = win.document.createElement('div');
    mountPoint.setAttribute('id', 'app');
    win.document.body.appendChild(mountPoint);

    const context = vm.createContext({
      window: win,
      document: win.document,
      URLSearchParams,
      Date,
      Math,
      Set,
      Map,
      WeakSet,
      Object,
      Array,
      JSON,
      Number,
      String,
      Boolean,
      TypeError,
      RangeError,
      Error,
      console,
      Symbol,
      Promise,
      isNaN,
      parseInt,
      parseFloat,
    });
    new vm.Script(script[1], { filename: 'index.html' }).runInContext(context);

    const body = win.document.body.textContent;
    assert.ok(body.includes('Mumbai costs you'), 'the headline composed');
    assert.ok(body.includes('251 ms'), 'with the measured round trip');
    assert.ok(body.includes('127 ms'), 'with the computed floor');
    assert.ok(body.includes('116 ms'), 'with the route surplus');
    assert.ok(body.includes('97 ms'), 'and the milliseconds on the table');
    assert.ok(body.includes('Measure my floor'), 'the one control is on the page');
  });

  test('and nothing on that page carries a figure without a badge', async () => {
    const html = await readFile(PAGE, 'utf8');
    const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
    const win = makeWindow({ cssVars: cssVarsFor('dark'), search: '?fixture=1' });
    const mountPoint = win.document.createElement('div');
    mountPoint.setAttribute('id', 'app');
    win.document.body.appendChild(mountPoint);
    const context = vm.createContext({
      window: win, document: win.document, URLSearchParams, Date, Math, Set, Map, WeakSet,
      Object, Array, JSON, Number, String, Boolean, TypeError, RangeError, Error, console,
      Symbol, Promise, isNaN, parseInt, parseFloat,
    });
    new vm.Script(script[1], { filename: 'index.html' }).runInContext(context);

    const previous = globalThis.document;
    globalThis.document = win.document;
    try {
      const r = checkProvenanceCompleteness(win.document, win.document.body);
      assert.ok(r.passed, r.detail);
    } finally {
      globalThis.document = previous;
    }
  });
});
