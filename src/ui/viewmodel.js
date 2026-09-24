// BUILDING THE VIEW MODEL. UI team output, validated by src/core/contracts/viewmodel.js.
//
// DESIGN 5 (the reveal), DESIGN 4 C2 and C3 (the decomposition and the verdict), DESIGN 6.6
// (the table is authoritative), traps 2, 3, 9, 14, 17.
//
// One decision runs through this whole file and it is worth stating once rather than nine
// times in comments below.
//
// THE DISPLAYED INTEGERS ARE THE SOURCE OF THE DISPLAYED CLAIMS. The physics, access and route
// cells are built from displaySegments(), not from the full precision numbers on the row. That
// looks backwards for about ten seconds and then it is obviously right: renderClaim rounds
// each millisecond figure independently, so three independently rounded parts can print
// 127 + 8 + 116 beside a total of 251, and a reader who adds up the numbers on screen and gets
// a different total has correctly concluded the tool is broken. displaySegments apportions by
// largest remainder so the three integers sum EXACTLY to the displayed total, and
// assertViewModel refuses a row where they do not.
//
// The full precision values are not lost. They stay on the decomposition row and the maths
// panel prints them there, unrounded, beside every intermediate term.
//
// Isomorphic: no node:* imports and no DOM.

import { measured, computed, UNITS, METHODS } from '../core/claim.js';
import { VIEW_MODEL_SCHEMA, assertViewModel } from '../core/contracts/viewmodel.js';
import { displaySegments, VERDICT_TEXT } from '../core/contracts/decomposition.js';
import {
  WARM_SAMPLE_COUNT, WARM_UP_REQUEST_COUNT, NON_MEASUREMENT_REQUEST_COUNT, REQUESTS_PER_ENDPOINT,
} from '../core/constants.js';
import { endpointById, MEASURED_ENDPOINTS, SNAPSHOT_DATE } from '../core/data/endpoints.js';
import { SOURCES } from '../core/data/sources.js';
import { consentSentence, REGION_COORDINATE_DISCLAIMER } from '../core/data/disclaimers.js';
import { ALL_HOSTS } from './hosts.js';
import { buildPreMeasurement } from './premeasurement.js';
import { t, c, plainText } from './parts.js';

/**
 * The sources the page itself depends on, in the order it shows them. DESIGN 3 fixes the
 * attribution wording; this only chooses which rows apply.
 *
 * `hasCoastline` is false until the RENDER team ships the Natural Earth binary. Crediting a
 * dataset the page does not actually contain would be a false statement in the polite
 * direction, which is still a false statement.
 *
 * @param {{hasCoastline?:boolean}} [opts]
 * @returns {{id:string, attribution:string, url:string}[]}
 */
export function pageSources(opts = {}) {
  const ids = [
    'si_metre',
    'corning_smf28',
    'iugg_mean_radius',
    'aws_endpoints_catalogue',
    'gcping_endpoints',
    'wikidata_coordinates',
    'cloudflare_trace',
    'azure_regions_list',
    'azure_arm_list_locations',
  ];
  if (opts.hasCoastline) ids.push('natural_earth_coastline');
  return ids.map((id) => ({
    id,
    attribution: SOURCES[id].attribution,
    url: SOURCES[id].url,
  }));
}

/**
 * The sentence printed beside the button BEFORE any click, with the exact request count and the
 * destination list. DESIGN trap 14: zero network activity on page load, and the visitor is told
 * what the button does before they press it rather than after.
 * @returns {string}
 */
export function pageConsentSentence() {
  return consentSentence(
    MEASURED_ENDPOINTS.length,
    REQUESTS_PER_ENDPOINT,
    WARM_UP_REQUEST_COUNT,
    NON_MEASUREMENT_REQUEST_COUNT,
  );
}

/**
 * The methods a row's timed figures carry. A live run times warm HTTPS round trips. The capture
 * fixture holds TCP connect minimums recorded on another machine, and every figure derived from
 * those says so rather than borrowing the warm method, which would describe a different number.
 * @param {boolean} [fixture]
 * @returns {{roundTrip:string, access:string, route:string, ratio:string}}
 */
export function rowMethods(fixture) {
  return fixture
    ? { roundTrip: METHODS.FIXTURE_TCP_CONNECT, access: METHODS.FIXTURE_ACCESS_BASELINE, route: METHODS.FIXTURE_ROUTE_SURPLUS, ratio: METHODS.FIXTURE_ROUTE_RATIO }
    : { roundTrip: METHODS.WARM_HTTPS_ROUND_TRIP, access: METHODS.ACCESS_BASELINE, route: METHODS.ROUTE_SURPLUS, ratio: METHODS.ROUTE_RATIO };
}

/**
 * The claims for one decomposed row. Every cell the table shows, each carrying its own method.
 * @param {import('../core/contracts/decomposition.js').RowDecomposition} row
 * @param {{fixture?:boolean}} [opts] fixture: the row comes from the capture fixture.
 * @returns {{cells:Record<string, import('../core/claim.js').Claim|null>, segments:{physicsMs:number,accessMs:number,routeMs:number,totalMs:number}}}
 */
export function rowClaims(row, opts = {}) {
  const segments = displaySegments(row);
  const m = rowMethods(opts.fixture);
  const cells = {
    distance: computed(row.distanceKm, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { sourceId: 'iugg_mean_radius' }),
    roundTrip: measured(segments.totalMs, UNITS.MS, m.roundTrip),
    physics: computed(segments.physicsMs, UNITS.MS, METHODS.FIBRE_FLOOR, { sourceId: 'corning_smf28' }),
    access: measured(segments.accessMs, UNITS.MS, m.access),
    route: measured(segments.routeMs, UNITS.MS, m.route),
    ratio: row.routeRatio === null
      ? null
      : computed(row.routeRatio, UNITS.RATIO, m.ratio, { decimals: 2 }),
  };
  return { cells, segments };
}

/**
 * One table row.
 * @param {import('../core/contracts/decomposition.js').RowDecomposition} row
 * @param {{fixture?:boolean}} [opts]
 * @returns {import('../core/contracts/viewmodel.js').ViewRow}
 */
export function buildRow(row, opts) {
  const e = endpointById(row.endpointId);
  if (!e) throw new RangeError('buildRow: unknown endpoint ' + row.endpointId);
  const { cells, segments } = rowClaims(row, opts);
  return {
    endpointId: row.endpointId,
    regionCode: e.region,
    regionName: e.providerRegionName,
    city: e.city,
    cells,
    verdictText: row.verdict === null ? null : VERDICT_TEXT[row.verdict],
    suppressedReason: row.ratioSuppressedReason,
    segments,
    // DESIGN 2.4: the assumption before the number, in the row itself and not in a footnote.
    coordinateNote: REGION_COORDINATE_DISCLAIMER,
  };
}

/**
 * Worst first. DESIGN 5 seconds 7 to 10: the rows re sort by ROUTE SURPLUS, which is the part
 * the reader can act on, not by the round trip, which is mostly geography they cannot.
 * @param {import('../core/contracts/decomposition.js').RowDecomposition[]} rows
 * @returns {import('../core/contracts/decomposition.js').RowDecomposition[]}
 */
export function sortWorstFirst(rows) {
  return [...rows].sort((a, b) => b.routeMs - a.routeMs || a.distanceKm - b.distanceKm);
}

/**
 * The worst offender, which is the row the headline is about and the one arc that gets the
 * accent colour. Rows with no ratio are eligible: a short row can still carry the largest route
 * surplus in absolute milliseconds, and absolute milliseconds are exactly what DESIGN trap 2
 * says a short row is allowed to report.
 * @param {import('../core/contracts/decomposition.js').RowDecomposition[]} rows
 * @returns {import('../core/contracts/decomposition.js').RowDecomposition|null}
 */
export function worstRow(rows) {
  if (rows.length === 0) return null;
  return sortWorstFirst(rows)[0];
}

/**
 * The sentence people screenshot. DESIGN 5 seconds 7 to 10.
 *
 * Four figures, each with its own badge and its own method, composed into one sentence that
 * says what each part of the number is and who owns it. The round trip is MEASURED, the floor
 * is COMPUTED, the access baseline is MEASURED once for the whole run, and the route surplus is
 * MEASURED by subtraction. "Round trip" appears in the method of every one of them, because a
 * round trip is one number covering two paths that are frequently different and this product
 * never splits it (trap 17).
 *
 * @param {import('../core/contracts/decomposition.js').RowDecomposition} row
 * @param {{fixture?:boolean}} [opts]
 * @returns {{sentence:string, parts:import('./parts.js').Part[], cells:Record<string, import('../core/claim.js').Claim>}}
 */
export function buildHeadline(row, opts) {
  const e = endpointById(row.endpointId);
  if (!e) throw new RangeError('buildHeadline: unknown endpoint ' + row.endpointId);
  const { cells } = rowClaims(row, opts);

  const parts = [
    t(e.city + ' costs you '),
    c(cells.roundTrip, 'sr'),
    t('. Physics charges '),
    c(cells.physics, 'sr'),
    t('. Your own last mile charges '),
    c(cells.access, 'sr'),
    t('. Your route charges '),
    c(cells.route, 'sr'),
    t('.'),
  ];

  /** @type {Record<string, import('../core/claim.js').Claim>} */
  const headlineCells = {
    roundTrip: cells.roundTrip,
    physics: cells.physics,
    access: cells.access,
    route: cells.route,
  };

  if (row.verdict === 'ON_THE_TABLE' && typeof row.msOnTheTable === 'number') {
    // The figure the verdict carries. It is arithmetic over a measured surplus and a computed
    // floor, and VERDICT_FROM_RATIO is the registered method that describes exactly that step,
    // so it renders COMPUTED rather than borrowing the MEASURED badge from the surplus alone.
    const onTable = computed(row.msOnTheTable, UNITS.MS, METHODS.VERDICT_FROM_RATIO);
    headlineCells.onTheTable = onTable;
    parts.push(t(' There are '), c(onTable, 'sr'), t(' on the table.'));
  }

  return { sentence: plainText(parts), parts, cells: headlineCells };
}

/**
 * The whole view model. Validated before it is returned, so a caller can never hand the DOM
 * layer a model that has not been checked.
 *
 * @param {Object} input
 * @param {'idle'|'measuring'|'done'|'no-network'} input.state
 * @param {import('../core/contracts/decomposition.js').DecompositionRun|null} [input.decomposition]
 * @param {{label:string, passed:boolean, detail:string, parts?:import('./parts.js').Part[]}[]} [input.selfTest]
 * @param {boolean} [input.hasCoastline]
 * @param {boolean} [input.fixture] The decomposition is the capture fixture's.
 * @returns {import('../core/contracts/viewmodel.js').ViewModel}
 */
export function buildViewModel(input) {
  const state = input.state;
  const run = input.decomposition || null;
  const opts = { fixture: input.fixture };
  const rows = state === 'done' && run ? sortWorstFirst(run.rows).map((r) => buildRow(r, opts)) : [];
  const worst = state === 'done' && run ? worstRow(run.rows) : null;

  const vm = {
    schema: VIEW_MODEL_SCHEMA,
    state,
    consentSentence: pageConsentSentence(),
    destinationHosts: [...ALL_HOSTS],
    preMeasurement: buildPreMeasurement(),
    rows,
    headline: worst ? buildHeadline(worst, opts) : null,
    selfTest: input.selfTest || [],
    sources: pageSources({ hasCoastline: input.hasCoastline }),
    defectCount: run ? run.defects.length : 0,
    unstableCount: run ? run.unstableCount : 0,
    // Extra fields the contract does not name and does not forbid. The snapshot date is on
    // screen because DESIGN 3 requires a bundled catalogue to date itself, and a screenshot
    // taken two years from now should say how old its region table was.
    endpointSnapshotDate: SNAPSHOT_DATE,
    unusableCount: run ? run.unusableCount : 0,
    accessFromEndpointId: run ? run.accessFromEndpointId : null,
  };

  return assertViewModel(vm);
}
