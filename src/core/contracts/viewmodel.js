// CONTRACT: the UI view model. Owned by the FOUNDATION team, produced by the UI team,
// consumed by the DOM layer and by the capture rig.
//
// DESIGN 2 (the claim boundary), DESIGN 5 (the ten second reveal), DESIGN 6.6 (accessibility),
// DESIGN 7.3 (provenance completeness), traps 9, 14, 19.
//
// THE ONE RULE THIS SHAPE EXISTS TO ENFORCE: every numeric cell in the view model is a Claim
// built by src/core/claim.js. Not a number. Not a preformatted string. A Claim.
//
// That is checked twice, on purpose, because the two checks fail at different times and catch
// different mistakes:
//
//   at runtime   assertViewModel() walks every cell and throws on a bare number, so a view
//                model assembled wrongly never reaches the DOM.
//   at build     scripts/gate-badges.mjs scans the shipped page for a digit in a text node
//                that is not inside an element carrying data-claim-badge, so a number that
//                reached the DOM by some other path fails the build.
//
// A rendered Claim carries data-claim-badge in its dataAttrs. The build gate looks for exactly
// that attribute. Rendering through claim.js and passing the gate are therefore the same act,
// which is the only arrangement that survives a deadline.
//
// Isomorphic: no node:* imports and no DOM.

import { isClaim, BADGE_KINDS } from '../claim.js';

export const VIEW_MODEL_SCHEMA = 1;

/**
 * Page state. DESIGN 5 and trap 14: 'idle' means nothing has touched the network, and the
 * globe and the floor calculator are already fully useful to a visitor who never clicks.
 * 'no-network' is an explicit stated state, never a spinner and never a zero.
 * @typedef {'idle'|'measuring'|'done'|'no-network'} PageState
 */

/**
 * The numeric cells of one table row. Each is a Claim or null. DESIGN 6.6 makes this table the
 * authoritative representation of the result; the canvas is decorative.
 *
 * @typedef {Object} ViewRowCells
 * @property {import('../claim.js').Claim} distance COMPUTED, km.
 * @property {import('../claim.js').Claim} roundTrip MEASURED, ms.
 * @property {import('../claim.js').Claim} physics COMPUTED, ms.
 * @property {import('../claim.js').Claim} access MEASURED, ms.
 * @property {import('../claim.js').Claim} route MEASURED, ms.
 * @property {import('../claim.js').Claim|null} ratio COMPUTED, or null under 500 km.
 */

/**
 * @typedef {Object} ViewRow
 * @property {string} endpointId
 * @property {string} regionCode
 * @property {string} regionName The provider own published name.
 * @property {string} city
 * @property {ViewRowCells} cells
 * @property {string|null} verdictText Exactly one of the three fixed sentences, or null.
 * @property {string|null} suppressedReason Non null exactly when cells.ratio is null.
 * @property {{physicsMs:number, accessMs:number, routeMs:number, totalMs:number}} segments
 *   Integer bar widths that sum exactly to the displayed total. See decomposition.displaySegments.
 * @property {string} coordinateNote The INFERRED sentence for this row coordinate, shown
 *   before the number and not in a footnote.
 */

/**
 * @typedef {Object} ViewModel
 * @property {1} schema
 * @property {PageState} state
 * @property {string} consentSentence Printed BESIDE the button, before any click, with the
 *   exact request count and the destination list. DESIGN trap 14.
 * @property {string[]} destinationHosts Every host that can ever be contacted, named on screen.
 * @property {{sentence:string, distance:import('../claim.js').Claim, floor:import('../claim.js').Claim}} preMeasurement
 *   The true, surprising, sourced fact a reader gets from arithmetic alone with no network at
 *   all. DESIGN 5 seconds 0 to 3. A reader who never clicks has still received something real.
 * @property {ViewRow[]} rows
 * @property {{sentence:string, cells:Record<string, import('../claim.js').Claim>}|null} headline
 *   The sentence people screenshot. null until a measurement completes.
 * @property {{label:string, passed:boolean, detail:string}[]} selfTest DESIGN 7.3. Always
 *   visible, never behind a menu.
 * @property {{id:string, attribution:string, url:string}[]} sources Shown in full, not folded.
 * @property {number} defectCount Faster than light rows dropped. Surfaced, not hidden.
 * @property {number} unstableCount Rows excluded for sample spread. Surfaced, not hidden.
 */

const CELL_KEYS = ['distance', 'roundTrip', 'physics', 'access', 'route', 'ratio'];

/** Cells that are allowed to be null, and only under the stated condition. */
const NULLABLE_CELLS = new Set(['ratio']);

/**
 * Walk a value and collect every Claim inside it, throwing on any bare number found in a
 * position where a rendered value belongs.
 * @param {ViewRowCells} cells
 * @param {string} at
 */
function assertCells(cells, at) {
  if (cells === null || typeof cells !== 'object') throw new TypeError(at + ': expected an object');
  for (const k of CELL_KEYS) {
    const v = /** @type {any} */ (cells)[k];
    if (v === null) {
      if (!NULLABLE_CELLS.has(k)) throw new TypeError(at + '.' + k + ': required, got null');
      continue;
    }
    if (typeof v === 'number' || typeof v === 'string') {
      throw new TypeError(at + '.' + k + ': got a bare ' + typeof v + '. Every displayed value '
        + 'is a Claim carrying its badge and its method. Build it with measured(), reported(), '
        + 'computed() or inferred() from src/core/claim.js. A number cannot reach a reader '
        + 'without saying where it came from.');
    }
    if (!isClaim(v)) {
      throw new TypeError(at + '.' + k + ': expected a Claim. An object of the right shape is '
        + 'not a Claim; only src/core/claim.js can build one, so a forged look alike is refused.');
    }
    if (!BADGE_KINDS.includes(/** @type {any} */ (v).badge)) {
      throw new TypeError(at + '.' + k + ': unknown badge ' + String(/** @type {any} */ (v).badge));
    }
  }
}

/**
 * Validate a whole view model. Call it immediately before handing the model to the DOM layer.
 * @param {unknown} v
 * @returns {ViewModel}
 */
export function assertViewModel(v) {
  if (v === null || typeof v !== 'object') throw new TypeError('viewModel: expected an object');
  const vm = /** @type {ViewModel} */ (v);
  if (vm.schema !== VIEW_MODEL_SCHEMA) {
    throw new TypeError('viewModel.schema: expected ' + VIEW_MODEL_SCHEMA + ', got ' + String(vm.schema));
  }
  const states = ['idle', 'measuring', 'done', 'no-network'];
  if (!states.includes(vm.state)) {
    throw new TypeError('viewModel.state: expected one of ' + states.join(', '));
  }
  if (typeof vm.consentSentence !== 'string' || vm.consentSentence.length === 0) {
    throw new TypeError('viewModel.consentSentence: required. The exact request count and the '
      + 'destination list are printed before the click, not after (DESIGN trap 14).');
  }
  if (!Array.isArray(vm.destinationHosts) || vm.destinationHosts.length === 0) {
    throw new TypeError('viewModel.destinationHosts: required and non empty. The page names '
      + 'every host it can ever contact.');
  }

  if (vm.preMeasurement === null || typeof vm.preMeasurement !== 'object') {
    throw new TypeError('viewModel.preMeasurement: required in every state, including idle. A '
      + 'reader who never clicks still receives a true, sourced fact (DESIGN 5).');
  }
  for (const k of ['distance', 'floor']) {
    if (!isClaim(/** @type {any} */ (vm.preMeasurement)[k])) {
      throw new TypeError('viewModel.preMeasurement.' + k + ': expected a Claim');
    }
  }
  if (typeof vm.preMeasurement.sentence !== 'string' || vm.preMeasurement.sentence.length === 0) {
    throw new TypeError('viewModel.preMeasurement.sentence: required');
  }

  if (vm.state === 'idle' && vm.rows.length !== 0) {
    throw new RangeError('viewModel: in the idle state nothing has touched the network, so there '
      + 'are no rows. DESIGN trap 14: zero network activity on page load.');
  }

  if (!Array.isArray(vm.rows)) throw new TypeError('viewModel.rows: expected an array');
  vm.rows.forEach((r, i) => {
    const at = 'viewModel.rows[' + i + ']';
    if (r === null || typeof r !== 'object') throw new TypeError(at + ': expected an object');
    for (const k of ['endpointId', 'regionCode', 'regionName', 'city', 'coordinateNote']) {
      if (typeof (/** @type {any} */ (r)[k]) !== 'string' || (/** @type {any} */ (r)[k]).length === 0) {
        throw new TypeError(at + '.' + k + ': required');
      }
    }
    assertCells(r.cells, at + '.cells');
    const hasRatio = r.cells.ratio !== null;
    if (hasRatio && r.suppressedReason !== null) {
      throw new TypeError(at + '.suppressedReason: must be null when a ratio is shown');
    }
    if (!hasRatio) {
      if (typeof r.suppressedReason !== 'string' || r.suppressedReason.length === 0) {
        throw new TypeError(at + '.suppressedReason: required when no ratio is shown, so the '
          + 'reader is told why rather than left with a blank cell');
      }
      if (r.verdictText !== null) {
        throw new TypeError(at + '.verdictText: a row with no ratio gets no verdict (trap 2)');
      }
    }
    const s = r.segments;
    if (!s || s.physicsMs + s.accessMs + s.routeMs !== s.totalMs) {
      throw new RangeError(at + '.segments: the three displayed segments must sum EXACTLY to the '
        + 'displayed total. A reader who adds up the numbers on screen and gets a different '
        + 'total has correctly concluded the tool is broken. Use displaySegments().');
    }
  });

  if (vm.headline !== null) {
    if (typeof vm.headline.sentence !== 'string' || vm.headline.sentence.length === 0) {
      throw new TypeError('viewModel.headline.sentence: required when a headline is present');
    }
    for (const [k, c] of Object.entries(vm.headline.cells)) {
      if (!isClaim(c)) throw new TypeError('viewModel.headline.cells.' + k + ': expected a Claim');
    }
  }
  if (vm.state === 'idle' && vm.headline !== null) {
    throw new RangeError('viewModel.headline: must be null before a measurement has run');
  }

  if (!Array.isArray(vm.selfTest)) throw new TypeError('viewModel.selfTest: expected an array');
  if (!Array.isArray(vm.sources) || vm.sources.length === 0) {
    throw new TypeError('viewModel.sources: required and non empty. Every bundled constant and '
      + 'dataset is attributed on the page, not only in the README.');
  }
  for (const k of ['defectCount', 'unstableCount']) {
    const n = /** @type {any} */ (vm)[k];
    if (!Number.isInteger(n) || n < 0) {
      throw new TypeError('viewModel.' + k + ': expected a non negative integer. Defects and '
        + 'unstable rows are counted and shown, never dropped silently.');
    }
  }
  return vm;
}

/**
 * Collect every Claim in a view model, for the browser side provenance completeness check
 * (DESIGN 7.3: zero unbadged numbers).
 * @param {ViewModel} vm
 * @returns {import('../claim.js').Claim[]}
 */
export function allClaims(vm) {
  /** @type {import('../claim.js').Claim[]} */
  const out = [];
  out.push(vm.preMeasurement.distance, vm.preMeasurement.floor);
  for (const r of vm.rows) {
    for (const k of CELL_KEYS) {
      const c = /** @type {any} */ (r.cells)[k];
      if (c !== null) out.push(c);
    }
  }
  if (vm.headline) out.push(...Object.values(vm.headline.cells));
  return out;
}
