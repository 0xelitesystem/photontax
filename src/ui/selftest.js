// THE SELF TEST. DESIGN 7.3: "A Self test control, always visible, never behind a menu. It
// runs in under 200 ms and prints a pass or fail line for each."
//
// The point of shipping this is not that it will catch a regression. CI catches regressions.
// The point is that a sceptical reader can press a button and watch the tool check its own
// arithmetic in front of them, including the checks that would expose it as wrong. A tool that
// only runs the checks it passes has not shown anything.
//
// TWO DELIBERATE DEPARTURES FROM THE DESIGN LIST, both toward a stronger check.
//
//   DESIGN 7.3 asks for "12 committed city pairs reproduce their committed distances within
//   0.1 km". A committed fixture proves the code agrees with a file the same code produced.
//   The check below compares the haversine against great circles with a CLOSED FORM answer
//   instead: a point against itself, a quarter of the equator, pole to pole, half the equator
//   and one degree of latitude. Those follow from the geometry of a sphere rather than from
//   anything in this repository, so they fail if the implementation and a fixture are wrong
//   together.
//
//   It also asks that "every rendered numeric node carries one of the four badges". That one
//   runs against the live DOM rather than against the view model, because a figure can reach a
//   reader by a path the view model never saw. It walks every text node in the page and fails
//   on any digit outside an element carrying data-claim-badge, which is the rule
//   scripts/gate-badges.mjs applies to the source at build time, applied to what painted.
//
// The contrast check reads the custom properties the browser RESOLVED, not the palette file. A
// static gate proves the palette is sound; this proves the page shipped the palette that was
// checked. Those are different claims and this product exists to not confuse them.
//
// ONE DESIGN NOTE ABOUT BADGES IN HERE, because it is the kind of thing that rots silently.
// A self test line reports the OUTCOME OF A CHECK: how many rows disagreed, how many pairs fell
// below a threshold, how large the worst discrepancy was. Those are audit output about this
// page's own code, not claims about the network or about the visitor, and the METHODS registry
// in src/core/claim.js correctly has no entry for any of them. So an outcome figure is rendered
// as provenance prose carrying the badge of the tier it audits together with a sentence naming
// the check, and only values that genuinely have a registered method, the recomputed constants
// and distances, are rendered as Claims. Borrowing an unrelated method to make a count look
// like a Claim would be a small lie in exactly the place this product cannot afford one.
//
// The pure checks take no DOM and are unit tested directly.

import {
  C_VACUUM_M_S, FIBRE_GROUP_INDEX_1550NM, V_FIBRE_KM_S, V_FIBRE_KM_S_PUBLISHED,
  FLOOR_MS_PER_1000_KM, FLOOR_MS_PER_1000_KM_PUBLISHED, MAX_GREAT_CIRCLE_KM,
  EARTH_MEAN_RADIUS_KM, RATIO_MIN_DISTANCE_KM, WARM_SAMPLE_COUNT, SAMPLE_SPREAD_UNSTABLE_MS,
  floorMsForDistanceKm,
} from '../core/constants.js';
import { greatCircleKm } from '../core/geo.js';
import { IDENTITY_EPSILON_MS } from '../core/contracts/decomposition.js';
import { ENDPOINTS } from '../core/data/endpoints.js';
import { PROVIDER_COORDINATE_EVIDENCE } from '../core/data/disclaimers.js';
import { computed, measured, UNITS, METHODS } from '../core/claim.js';
import { t, c, pp, plainText } from './parts.js';
import { USED_COLOUR_PAIRS, cssVarName } from './pairs.js';
import { contrastRatio, normaliseHex, AA_NORMAL } from './wcag.js';

/**
 * @typedef {Object} SelfTestResult
 * @property {string} label Short name of the check. Never contains a digit.
 * @property {boolean} passed
 * @property {string} detail Plain text, badge words included. Required by the view model.
 * @property {import('./parts.js').Part[]} parts The same detail as prose runs and Claims.
 */

/**
 * @param {string} label
 * @param {boolean} passed
 * @param {import('./parts.js').Part[]} parts
 * @returns {SelfTestResult}
 */
function result(label, passed, parts) {
  return { label, passed, detail: plainText(parts), parts };
}

/**
 * An audit outcome. The badge names the tier being audited; the method sentence names the check
 * that produced the figures. See the note at the top of this file for why this is prose and not
 * a Claim.
 * @param {'MEASURED'|'REPORTED'|'COMPUTED'|'INFERRED'} badge
 * @param {string} sentence
 * @param {string} check
 * @returns {import('./parts.js').Part}
 */
function audit(badge, sentence, check) {
  return pp(badge, sentence, 'Produced by the self test in this page, just now, by ' + check
    + ' This is the result of a check on this page own code, not a measurement of anything '
    + 'outside it.');
}

/* --------------------------------------------------------------------------------------------
 * Checks that need nothing but arithmetic. These run before any measurement, which is the
 * point: a visitor who never presses the button can still watch the tool check itself.
 * ------------------------------------------------------------------------------------------ */

/** @returns {SelfTestResult} */
export function checkConstant() {
  const v = C_VACUUM_M_S / FIBRE_GROUP_INDEX_1550NM / 1000;
  const passed = Math.abs(Number(v.toFixed(1)) - V_FIBRE_KM_S_PUBLISHED) < 1e-9
    && Math.abs(v - V_FIBRE_KM_S) < 1e-9;
  return result('Speed of light in fibre', passed, [
    t('Recomputed here from the two inputs rather than read back from a stored value: '),
    c(computed(v, UNITS.KM_PER_S, METHODS.FIBRE_SPEED, { decimals: 5 }), 'sr'),
    t('. It rounds to the published '),
    c(computed(V_FIBRE_KM_S_PUBLISHED, UNITS.KM_PER_S, METHODS.FIBRE_SPEED, { decimals: 1 }), 'sr'),
    t('.'),
  ]);
}

/** @returns {SelfTestResult} */
export function checkFloorIdentity() {
  const f = floorMsForDistanceKm(1000);
  const passed = Math.abs(Number(f.toFixed(4)) - FLOOR_MS_PER_1000_KM_PUBLISHED) < 1e-9
    && Math.abs(f - FLOOR_MS_PER_1000_KM) < 1e-12;
  return result('Round trip floor per one thousand kilometres', passed, [
    t('The round trip floor for one thousand kilometres of separation, in milliseconds, recomputed: '),
    c(computed(f, UNITS.UNITLESS, METHODS.FIBRE_FLOOR, { decimals: 4 }), 'sr'),
    t('. It rounds to the published '),
    c(computed(FLOOR_MS_PER_1000_KM_PUBLISHED, UNITS.UNITLESS, METHODS.FIBRE_FLOOR, { decimals: 4 }), 'sr'),
    t('.'),
  ]);
}

/**
 * The haversine against great circles whose length follows from the geometry of a sphere, with
 * no fixture in the middle.
 * @returns {SelfTestResult}
 */
export function checkHaversineClosedForm() {
  const R = EARTH_MEAN_RADIUS_KM;
  const cases = [
    { got: greatCircleKm({ lat: 51.5, lon: -0.12 }, { lat: 51.5, lon: -0.12 }), want: 0 },
    { got: greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }), want: (Math.PI / 2) * R },
    { got: greatCircleKm({ lat: 90, lon: 0 }, { lat: -90, lon: 0 }), want: Math.PI * R },
    { got: greatCircleKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), want: (Math.PI / 180) * R },
    { got: greatCircleKm({ lat: 0, lon: -90 }, { lat: 0, lon: 90 }), want: Math.PI * R },
  ];
  const worst = cases.reduce((m, x) => Math.max(m, Math.abs(x.got - x.want)), 0);
  const passed = worst < 1e-6;
  return result('Great circle against closed form values', passed, [
    t('Five great circles whose length follows from the geometry of a sphere rather than from '
      + 'any file in this repository, including a point against itself, pole to pole and a '
      + 'quarter of the equator. The largest disagreement, in kilometres: '),
    c(computed(worst, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 6 }), 'sr'),
    t('.'),
  ]);
}

/**
 * The receipt behind the INFERRED coordinate sentence, recomputed live. INTERFACES section 8:
 * the design's unverifiable quotation was cut and replaced by a distance a reader can repeat.
 * @returns {SelfTestResult}
 */
export function checkProviderCoordinateEvidence() {
  const e = PROVIDER_COORDINATE_EVIDENCE;
  const km = greatCircleKm(
    { lat: e.publishedLatitude, lon: e.publishedLongitude },
    { lat: e.comparisonLatitude, lon: e.comparisonLongitude },
  );
  const passed = Math.abs(Number(km.toFixed(1)) - e.separationKmPublished) < 1e-9;
  return result('A published region coordinate is an area estimate', passed, [
    pp('REPORTED',
      'Microsoft publishes a coordinate for its own ' + e.publishedRegion + ' region and the '
      + 'physical location "' + e.publishedPhysicalLocation + '" for the same region.',
      METHODS.PROVIDER_REGION_CATALOGUE),
    t(' Distance from that published point to ' + e.comparisonPlace + ', recomputed here with '
      + 'the same great circle this tool uses everywhere else: '),
    c(computed(km, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 1 }), 'sr'),
    t('.'),
  ]);
}

/** @returns {SelfTestResult} */
export function checkAntipodalSanity() {
  let worst = 0;
  for (let i = 0; i < ENDPOINTS.length; i += 1) {
    for (let j = i + 1; j < ENDPOINTS.length; j += 1) {
      const d = greatCircleKm(
        { lat: ENDPOINTS[i].lat, lon: ENDPOINTS[i].lon },
        { lat: ENDPOINTS[j].lat, lon: ENDPOINTS[j].lon },
      );
      if (d > worst) worst = d;
    }
  }
  const passed = worst <= MAX_GREAT_CIRCLE_KM + 1e-9;
  return result('Antipodal sanity over the bundled region table', passed, [
    t('The longest separation between any two rows in the shipped table: '),
    c(computed(worst, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 1 }), 'sr'),
    t('. The longest great circle arithmetically possible on the modelled sphere: '),
    c(computed(MAX_GREAT_CIRCLE_KM, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 1 }), 'sr'),
    t('. A value above that would be a defect in the input, never a long path.'),
  ]);
}

/* --------------------------------------------------------------------------------------------
 * Checks over a completed run.
 * ------------------------------------------------------------------------------------------ */

/**
 * THE ONE THAT MATTERS MOST. DESIGN trap 3: a result faster than light for its stated geography
 * is a DEFECT, not a result. It is dropped, counted and named, never averaged in and never
 * clamped. In the research pass 139 of 689 third party results against one anycast target came
 * back faster than light, so a build without this check ships impossible claims on its front
 * page.
 * @param {import('../core/contracts/decomposition.js').DecompositionRun} run
 * @returns {SelfTestResult}
 */
export function checkFasterThanLight(run) {
  const survivors = run.rows.filter((r) => r.roundTripMs < r.floorMs);
  const passed = survivors.length === 0;
  return result('Faster than light screen', passed, [
    audit('MEASURED',
      'Rows still reported as results after coming back faster than light for their stated '
      + 'geography: ' + survivors.length + '. Rows dropped as defects, counted and named '
      + 'instead: ' + run.defects.length + '.',
      'comparing every measured round trip against the computed floor for the same pair of '
      + 'coordinates.'),
  ]);
}

/**
 * @param {import('../core/contracts/decomposition.js').DecompositionRun} run
 * @returns {SelfTestResult}
 */
export function checkDecompositionIdentity(run) {
  let worst = 0;
  for (const r of run.rows) {
    worst = Math.max(worst, Math.abs((r.floorMs + r.accessMs + r.routeMs) - r.roundTripMs));
  }
  const passed = worst <= IDENTITY_EPSILON_MS;
  return result('The three parts add back to the whole', passed, [
    audit('MEASURED',
      'For every row, physics plus access plus route against the measured round trip. Largest '
      + 'disagreement anywhere in this run, in milliseconds: ' + worst.toExponential(2)
      + '. The tolerance is ' + IDENTITY_EPSILON_MS.toExponential(0) + ', which is floating '
      + 'point reassociation and not a modelling gap.',
      're adding the three displayed parts of every row and comparing the sum against the '
      + 'measured total for that row.'),
  ]);
}

/**
 * @param {import('../core/contracts/decomposition.js').DecompositionRun} run
 * @param {boolean} [fixture] The run is the capture fixture, whose baseline is a fixture figure.
 * @returns {SelfTestResult}
 */
export function checkAccessBaseline(run, fixture) {
  const surpluses = run.rows.map((r) => r.roundTripMs - r.floorMs);
  const min = surpluses.length ? Math.min(...surpluses) : run.accessMs;
  const passed = run.accessMs >= 0 && Math.abs(min - run.accessMs) <= 1e-9;
  const method = fixture ? METHODS.FIXTURE_ACCESS_BASELINE : METHODS.ACCESS_BASELINE;
  return result('The access baseline is the minimum surplus, and is not negative', passed, [
    t('Your access baseline, and the smallest surplus over every usable endpoint in this run. '
      + 'They are the same number by construction: '),
    c(measured(run.accessMs, UNITS.MS, method), 'sr'),
    t(' against '),
    c(measured(min, UNITS.MS, method), 'sr'),
    t('. A mean, or the nearest row by distance, would reintroduce exactly the artifact this '
      + 'step exists to remove.'),
  ]);
}

/**
 * @param {import('../core/contracts/decomposition.js').DecompositionRun} run
 * @returns {SelfTestResult}
 */
export function checkDistanceGate(run) {
  const offenders = run.rows.filter((r) => r.distanceKm < RATIO_MIN_DISTANCE_KM && r.routeRatio !== null);
  const passed = offenders.length === 0;
  return result('No ratio below the short distance gate', passed, [
    audit('COMPUTED',
      'Under ' + RATIO_MIN_DISTANCE_KM + ' km a fixed access cost sits on top of a near zero '
      + 'floor, so a ratio there would be an artifact rather than a result. Rows breaking that '
      + 'rule in this run: ' + offenders.length + '.',
      'checking every row distance against the published gate before any ratio is rendered.'),
  ]);
}

/**
 * @param {import('../core/contracts/measurement.js').MeasurementRun|null} measurement
 * @returns {SelfTestResult}
 */
export function checkSampleStability(measurement) {
  const eps = measurement ? measurement.endpoints : [];
  const wrongCount = eps.filter((e) => e.status === 'ok' && e.samplesMs.length !== WARM_SAMPLE_COUNT);
  const wrongStatus = eps.filter((e) => e.spreadMs !== null && e.spreadMs > SAMPLE_SPREAD_UNSTABLE_MS && e.status === 'ok');
  const passed = wrongCount.length === 0 && wrongStatus.length === 0;
  return result('Sample count and sample spread', passed, [
    audit('MEASURED',
      'Every usable endpoint carries exactly ' + WARM_SAMPLE_COUNT + ' warm samples with the '
      + 'warm up response excluded, and any endpoint whose samples span more than '
      + SAMPLE_SPREAD_UNSTABLE_MS + ' ms is marked unstable and shows its spread instead of a '
      + 'single number. Endpoints with the wrong sample count: ' + wrongCount.length
      + '. Endpoints too variable to report that were reported anyway: ' + wrongStatus.length + '.',
      'counting the samples on every endpoint in this run and comparing each spread against the '
      + 'published stability limit.'),
  ]);
}

/* --------------------------------------------------------------------------------------------
 * Checks that need the live document.
 * ------------------------------------------------------------------------------------------ */

/**
 * PROVENANCE COMPLETENESS, against what actually painted. DESIGN 7.3.
 * @param {Document} doc
 * @param {Element} [root]
 * @returns {SelfTestResult}
 */
export function checkProvenanceCompleteness(doc, root) {
  const scope = root || doc.body;
  const walker = doc.createTreeWalker(scope, 4 /* NodeFilter.SHOW_TEXT */);
  let unbadged = 0;
  let badged = 0;
  let skipped = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const value = n.nodeValue || '';
    if (!/\d/.test(value) || value.trim().length === 0) continue;

    // A text node inside <script>, <style>, <template> or <noscript> is not rendered text. It
    // is program source, and a figure in it is not a figure anybody reads.
    //
    // THIS WAS FOUND BY RUNNING THE PAGE, NOT BY A TEST. The shipped single file page carries
    // its whole module graph inside one <script>, and every numeric literal in it is a text
    // node under document.body. So this check reported a failure on the real page while the
    // test suite, whose small DOM does not reproduce script text nodes, reported a pass. The
    // check that exists to catch an unbadged number was itself the only thing failing.
    //
    // The source is not unchecked as a result: scripts/gate-badges.mjs scans every module and
    // the assembled page as TEXT, with rules written for source rather than for rendered copy.
    // Two surfaces, two scanners, and neither one pretending to be the other.
    let container = n.parentElement;
    let inSource = false;
    while (container) {
      const tag = container.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'NOSCRIPT') {
        inSource = true;
        break;
      }
      container = container.parentElement;
    }
    if (inSource) { skipped += 1; continue; }

    let e = n.parentElement;
    let found = false;
    while (e) {
      if (e.hasAttribute('data-claim-badge')) { found = true; break; }
      e = e.parentElement;
    }
    if (found) badged += 1;
    else unbadged += 1;
  }
  const passed = unbadged === 0;
  return result('Every figure on this page carries a badge', passed, [
    audit('COMPUTED',
      'Text runs containing a figure that sit inside an element carrying a provenance badge: '
      + badged + '. Runs that do not, which would be figures with no statement of where they '
      + 'came from: ' + unbadged + '. Runs skipped because they are program source rather than '
      + 'rendered text: ' + skipped + '.',
      'walking every rendered text node in this document and looking for a provenance badge on '
      + 'it or on any of its ancestors. Text inside a script, style, template or noscript '
      + 'element is skipped, because it is source and not something a reader sees; the build '
      + 'gate scans that source separately, as text, with rules written for source.'),
  ]);
}

/**
 * CONTRAST, against the custom properties the browser resolved.
 * @param {Document} doc
 * @returns {SelfTestResult}
 */
export function checkContrastLive(doc) {
  const root = doc.documentElement;
  const style = doc.defaultView.getComputedStyle(root);
  let worstRatio = Infinity;
  let failures = 0;
  let unreadable = 0;

  for (const pair of USED_COLOUR_PAIRS) {
    const bg = normaliseHex(style.getPropertyValue(cssVarName('surface', pair.surface)));
    const fg = normaliseHex(style.getPropertyValue(cssVarName('text', pair.text)));
    let r;
    try {
      r = contrastRatio(fg, bg);
    } catch {
      // A value the formula cannot read is never treated as a pass. A NaN ratio compares false
      // against every threshold, which is how a broken colour ships looking checked.
      unreadable += 1;
      continue;
    }
    if (r < worstRatio) worstRatio = r;
    if (r < AA_NORMAL) failures += 1;
  }

  const passed = failures === 0 && unreadable === 0 && Number.isFinite(worstRatio);
  return result('Contrast of every pair this page uses, in the theme you are looking at', passed, [
    audit('COMPUTED',
      'Pairs checked by the relative luminance formula rather than by rendering: '
      + USED_COLOUR_PAIRS.length + '. Pairs below the normal text threshold of ' + AA_NORMAL
      + ' to one: ' + failures + '. Pairs whose value could not be read: ' + unreadable
      + '. Worst ratio found: ' + (Number.isFinite(worstRatio) ? worstRatio.toFixed(2) : 'none')
      + ' to one.',
      'reading the colour custom properties the browser resolved for the theme on screen and '
      + 'computing the WCAG relative luminance ratio for every pair this page places.'),
  ]);
}

/* --------------------------------------------------------------------------------------------
 * The whole suite.
 * ------------------------------------------------------------------------------------------ */

/**
 * Run every check the current state supports. The arithmetic checks run always, including
 * before any measurement, because a reader who never presses the button should still be able to
 * watch the tool check itself.
 *
 * @param {Object} input
 * @param {import('../core/contracts/decomposition.js').DecompositionRun|null} [input.decomposition]
 * @param {import('../core/contracts/measurement.js').MeasurementRun|null} [input.measurement]
 * @param {Document|null} [input.doc]
 * @param {Element|null} [input.root]
 * @param {boolean} [input.fixture] The decomposition is the capture fixture's.
 * @returns {SelfTestResult[]}
 */
export function runSelfTest(input = {}) {
  /** @type {SelfTestResult[]} */
  const out = [
    checkConstant(),
    checkFloorIdentity(),
    checkHaversineClosedForm(),
    checkProviderCoordinateEvidence(),
    checkAntipodalSanity(),
  ];

  const run = input.decomposition || null;
  if (run) {
    out.push(
      checkFasterThanLight(run),
      checkDecompositionIdentity(run),
      checkAccessBaseline(run, input.fixture),
      checkDistanceGate(run),
    );
  }
  if (input.measurement) out.push(checkSampleStability(input.measurement));

  if (input.doc) {
    out.push(checkProvenanceCompleteness(input.doc, input.root || undefined));
    if (input.doc.defaultView) out.push(checkContrastLive(input.doc));
  }
  return out;
}
