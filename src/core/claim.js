// THE CLAIM BADGE SYSTEM. DESIGN 2, the honest claim boundary. This is the product.
//
// Rule, and it is structural rather than editorial: a number cannot reach a reader without
// saying where it came from. Not "should not". Cannot.
//
// The enforcement has four layers, and each one exists because the layer above it can be
// forgotten by a tired person at 2am:
//
//   1. A Claim can only be built by measured(), reported(), computed() or inferred(). Each of
//      those requires a method string drawn from the METHODS registry below, so there is no
//      way to construct a value that does not already name how it was obtained.
//   2. A Claim is frozen and branded into a module private WeakSet. An object that merely has
//      the right shape is not a Claim and every render function rejects it. Nothing outside
//      this file can forge one.
//   3. Every implicit stringification path on a Claim THROWS. toString, valueOf,
//      Symbol.toPrimitive and toJSON all throw. So `${claim}`, claim + '', String(claim),
//      el.textContent = claim and JSON.stringify(claim) are all runtime errors, not silent
//      bare numbers. The mistake fails loudly at the moment it is made.
//   4. The only text producing function, renderClaimText(), ALWAYS emits the badge label. It
//      is not possible to ask it for the number alone, because there is no parameter that
//      would do that.
//
// Layer 4 is the one that matters. Most provenance systems fail because they make the badge
// an option. Here the badge is the return value and the number is a substring of it.
//
// Colour is never the carrier. DESIGN 6.6 and trap 19: every badge is text plus a distinct
// SHAPE, because a provenance scheme that collapses for a colour blind reader has not failed
// cosmetically, it has failed completely.
//
// Isomorphic: no node:* imports and no DOM. The UI layer turns a RenderedClaim into elements.

/* --------------------------------------------------------------------------------------------
 * The four badge kinds. DESIGN 2.1 to 2.4. There is no fifth, and there is no "unknown".
 * ------------------------------------------------------------------------------------------ */

/** The visitor's own machine did this. DESIGN 2.1. */
export const MEASURED = 'MEASURED';
/** A third party states a fact about itself. DESIGN 2.2. */
export const REPORTED = 'REPORTED';
/** Arithmetic from a constant and a coordinate. Reproducible offline. DESIGN 2.3. */
export const COMPUTED = 'COMPUTED';
/** A model, with its assumptions on screen before the number. DESIGN 2.4. */
export const INFERRED = 'INFERRED';

/** @typedef {'MEASURED'|'REPORTED'|'COMPUTED'|'INFERRED'} BadgeKind */

/** The four kinds, in the order the legend lists them. Frozen. */
export const BADGE_KINDS = Object.freeze([MEASURED, REPORTED, COMPUTED, INFERRED]);

/**
 * Presentation contract for each badge. `shape` is the load bearing field: the UI draws that
 * shape as inline SVG so the four kinds are distinguishable with no colour and no web font.
 * `glyph` is the text fallback for a plain text export or a screen reader summary.
 * `token` names a palette token in ./tokens.js; it is decoration layered on top of text and
 * shape, never the carrier of meaning.
 */
export const BADGE_SPEC = Object.freeze({
  [MEASURED]: Object.freeze({
    kind: MEASURED,
    label: 'MEASURED',
    shape: 'circle',
    glyph: '●',
    token: 'badgeMeasured',
    meaning: 'Your own machine produced this number.',
  }),
  [REPORTED]: Object.freeze({
    kind: REPORTED,
    label: 'REPORTED',
    shape: 'diamond',
    glyph: '◆',
    token: 'badgeReported',
    meaning: 'A third party stated this fact about itself.',
  }),
  [COMPUTED]: Object.freeze({
    kind: COMPUTED,
    label: 'COMPUTED',
    shape: 'triangle',
    glyph: '▲',
    token: 'badgeComputed',
    meaning: 'Arithmetic from a cited constant and a coordinate. You can recompute it offline.',
  }),
  [INFERRED]: Object.freeze({
    kind: INFERRED,
    label: 'INFERRED',
    shape: 'square-outline',
    glyph: '◻',
    token: 'badgeInferred',
    meaning: 'A model. Its assumptions are stated before the number, and it is never a headline.',
  }),
});

/* --------------------------------------------------------------------------------------------
 * The method registry. DESIGN 2: "The method is printed next to the number, not buried in a
 * footnote." A claim cannot be built without naming one of these, and each one states the
 * method in the words the page uses.
 *
 * No method string here uses either of the two short names for a network layer round trip.
 * Both are in the banned vocabulary (src/core/vocabulary.js, rule icmp-round-trip-words,
 * DESIGN trap 4). The measured quantity is a warm HTTPS round trip and it contains transport,
 * TLS and server think time. Naming it otherwise would state a smaller and cleaner number
 * than the one actually taken, which is an error in the flattering direction, which is the
 * one that disqualifies a measurement tool.
 * ------------------------------------------------------------------------------------------ */

export const METHODS = Object.freeze({
  /* ---- MEASURED. DESIGN 2.1 ---- */
  WARM_HTTPS_ROUND_TRIP:
    'Warm HTTPS round trip. The connection is opened, the first response is discarded, then '
    + 'the minimum of 7 further request and response wall times is taken on the kept alive '
    + 'connection, bracketed by performance.now(). This number contains transport, TLS record '
    + 'processing and server think time. It is not an ICMP measurement and it is not a '
    + 'network layer round trip.',
  ACCESS_BASELINE:
    'The minimum, over every endpoint measured in this run, of (warm HTTPS round trip minus '
    + 'that endpoint computed fibre floor). It is the fixed cost your own connection carries '
    + 'to every destination, so it is measured once and subtracted from all of them.',
  ROUTE_SURPLUS:
    'Warm HTTPS round trip, minus the computed fibre floor for this distance, minus the '
    + 'measured access baseline. It is a round trip figure and no part of it is attributed to '
    + 'either direction.',
  SAMPLE_SPREAD:
    'The difference between the largest and the smallest of the 7 warm samples for this '
    + 'endpoint, on your own machine.',

  /* ---- REPORTED. DESIGN 2.2 ---- */
  CLOUDFLARE_COLO:
    'Reported by Cloudflare for this connection, from the colo field of its own '
    + 'cdn-cgi/trace endpoint. Cloudflare edge is naming the facility that terminated the '
    + 'connection. It is not a lookup of you.',
  CLOUDFLARE_CLIENT_IP:
    'Reported by Cloudflare for this connection, from the ip field of its own cdn-cgi/trace '
    + 'endpoint. The far end observed this address. It is never sent anywhere else and it is '
    + 'never stored.',
  PROVIDER_REGION_CATALOGUE:
    'Published by the cloud provider in its own region catalogue. Region codes, region names '
    + 'and endpoint hostnames are factual identifiers taken from that catalogue.',

  /* ---- COMPUTED. DESIGN 2.3 ---- */
  GREAT_CIRCLE_HAVERSINE:
    'Haversine great circle distance on a sphere of radius 6371.0088 km, the IUGG mean Earth '
    + 'radius, between the two coordinates shown.',
  FIBRE_SPEED:
    'The SI definition of the metre fixes the speed of light in vacuum at exactly 299792458 '
    + 'm/s. Dividing by 1.4682, the effective group index of refraction of Corning SMF-28 '
    + 'fibre at 1550 nm, gives the speed of a signal in the glass.',
  FIBRE_FLOOR:
    'Twice the great circle distance, divided by the speed of light in fibre. A cable is a '
    + 'line on a sphere and the great circle is the shortest such line, so no cable can beat '
    + 'this round trip number. It is a lower bound, not a prediction.',
  ROUTE_RATIO:
    '(Warm HTTPS round trip minus the measured access baseline) divided by the computed fibre '
    + 'floor. No ratio is shown at all below 500 km, where a fixed access cost sitting on a '
    + 'near zero floor makes the ratio an artifact rather than a result.',
  VERDICT_FROM_RATIO:
    'Chosen from the route ratio by two fixed published thresholds, 1.15 and 1.6. The '
    + 'thresholds do not change per visitor and they are not tuned.',
  REQUEST_PLAN:
    'Counted from the shipped endpoint table and the shipped sample constants, before anything '
    + 'is contacted. It is the number of requests pressing the button will make, warm up '
    + 'requests included, and it is the larger figure rather than the flattering one.',
  WEIGHTED_MEAN_FLOOR:
    'The mean of the computed fibre floors from each of your user cities to this candidate '
    + 'region, weighted by the share you entered. These are floors, not predictions. Your '
    + 'users will never do better than this, and this tool cannot tell you how much worse '
    + 'they will do, because it has not measured them.',

  /* ---- INFERRED. DESIGN 2.4 ---- */
  REGION_CITY_CENTRE:
    'The provider publishes a city or an area for this region, not a building. The coordinate '
    + 'shown is the centre of that place. The floor computed from it is therefore a floor for '
    + 'the city, not for the building, and the real facility may be tens of kilometres away.',
  ROUTE_ADJUSTED_FLOOR:
    'The computed fibre floor multiplied by a median ratio of published cable length to great '
    + 'circle distance. It is a rule of thumb derived from a third party dataset this tool '
    + 'does not ship, it is shown only as a secondary line, and it is never a headline.',

  /* ---- Appended in v0.2, after every earlier entry, so none of them moves. ----
   * The command line reads the phases of the warm up connection from its own socket events,
   * which a browser is never shown. One sample each, and never a substitute for the round
   * trip. */

  /* MEASURED, command line. */
  DNS_LOOKUP_TIME:
    'DNS lookup time. From the start of the warm up request to the operating system resolver '
    + 'returning an address. One sample. The resolver may answer from its own cache.',
  TCP_CONNECT_TIME:
    'TCP connect time. From the start of the last connection attempt to the connection being '
    + 'established, on the warm up connection. One sample. Attempts that failed first are '
    + 'excluded and counted. It covers the TCP handshake only: no TLS, no request and no '
    + 'server think time.',
  TLS_HANDSHAKE_TIME:
    'TLS handshake time. From the TCP connection being established to the TLS handshake '
    + 'completing, on the warm up connection. One sample.',

  /* REPORTED, command line. */
  CONNECTED_ADDRESS:
    'The address this machine connected to, as returned by DNS through the operating system '
    + 'resolver. It is printed as text and never placed on a map.',
  TLS_VERSION:
    'The TLS version the server chose in the handshake on the warm up connection.',

  /* The capture fixture (?fixture=1). Its figures are TCP connect minimums recorded on another
   * machine, so neither the warm HTTPS entries above nor the one sample phase entries may label
   * them, and every figure derived from them says what it was derived from. */
  FIXTURE_TCP_CONNECT:
    'TCP connect time, the minimum of five fresh connections, recorded once from a machine in '
    + 'Virginia and committed as a capture fixture. It is not a measurement of your connection. '
    + 'It covers the TCP handshake only: no TLS, no request and no server think time.',
  FIXTURE_ACCESS_BASELINE:
    'The minimum, over every endpoint in the capture fixture, of (fixture TCP connect time '
    + 'minus that endpoint computed fibre floor). It is the fixed cost of the machine that '
    + 'recorded the fixture, not yours.',
  FIXTURE_ROUTE_SURPLUS:
    'Fixture TCP connect time, minus the computed fibre floor for this distance, minus the '
    + 'fixture access baseline. No part of it is attributed to either direction.',
  FIXTURE_ROUTE_RATIO:
    '(Fixture TCP connect time minus the fixture access baseline) divided by the computed '
    + 'fibre floor. No ratio is shown below 500 km.',

  /* The command line plan and its receipts. REQUEST_PLAN above says what pressing the page
   * button does, which a terminal has no button for, so the command line states its own. */
  CLI_REQUEST_PLAN:
    'Counted from the shipped endpoint table and the shipped sample constants, before anything '
    + 'is contacted. It is the number of requests the measure command makes, warm up requests '
    + 'included, and it is the larger figure rather than the flattering one. The command line '
    + 'never asks the facility endpoint the page uses, so no request to it is counted.',
  REQUEST_TIME_LIMIT:
    'The time limit on each request, a constant in the shipped transport. A request that has '
    + 'not finished by then is abandoned, never retried, and produces no number.',
  WORST_CASE_WALL_TIME:
    'The number of endpoints divided by the number measured at once, rounded up, times the '
    + 'requests per endpoint, times the time limit on each request. Requests to one endpoint '
    + 'run one after another and a failed request ends that endpoint, so this is the longest a '
    + 'run can wait on the network.',
  REQUESTS_MADE:
    'Counted by the command line transport on this machine as each request was issued, in this '
    + 'run. A request abandoned for a stated reason is still counted, and an endpoint that '
    + 'failed early makes fewer than planned.',
  FAILED_CONNECTION_ATTEMPTS:
    'Connection attempts on the warm up connection that failed before the one that connected, '
    + 'counted from the socket events on this machine. When the resolver returns more than one '
    + 'address the operating system may try one that fails first. Those attempts are excluded '
    + 'from the TCP connect time.',
  ENDPOINTS_AT_ONCE:
    'The number of endpoints the measure command works on at once, a constant in the shipped '
    + 'engine. Requests to one endpoint never overlap each other, so the only parallel work is '
    + 'across endpoints.',
});

/** Every method string, for the gate that checks a claim method is a registered one. */
const METHOD_VALUES = new Set(Object.values(METHODS));

/**
 * Which badge kinds each method is allowed to carry. A method belongs to exactly one tier, so
 * labelling an INFERRED method as MEASURED is a construction time error rather than a
 * copywriting accident. DESIGN 2 is a boundary, and boundaries that are only documented drift.
 */
const METHOD_KIND = new Map([
  [METHODS.WARM_HTTPS_ROUND_TRIP, MEASURED],
  [METHODS.ACCESS_BASELINE, MEASURED],
  [METHODS.ROUTE_SURPLUS, MEASURED],
  [METHODS.SAMPLE_SPREAD, MEASURED],
  [METHODS.CLOUDFLARE_COLO, REPORTED],
  [METHODS.CLOUDFLARE_CLIENT_IP, REPORTED],
  [METHODS.PROVIDER_REGION_CATALOGUE, REPORTED],
  [METHODS.GREAT_CIRCLE_HAVERSINE, COMPUTED],
  [METHODS.FIBRE_SPEED, COMPUTED],
  [METHODS.FIBRE_FLOOR, COMPUTED],
  [METHODS.ROUTE_RATIO, COMPUTED],
  [METHODS.VERDICT_FROM_RATIO, COMPUTED],
  [METHODS.REQUEST_PLAN, COMPUTED],
  [METHODS.WEIGHTED_MEAN_FLOOR, COMPUTED],
  [METHODS.REGION_CITY_CENTRE, INFERRED],
  [METHODS.ROUTE_ADJUSTED_FLOOR, INFERRED],
  [METHODS.DNS_LOOKUP_TIME, MEASURED],
  [METHODS.TCP_CONNECT_TIME, MEASURED],
  [METHODS.TLS_HANDSHAKE_TIME, MEASURED],
  [METHODS.CONNECTED_ADDRESS, REPORTED],
  [METHODS.TLS_VERSION, REPORTED],
  [METHODS.FIXTURE_TCP_CONNECT, MEASURED],
  [METHODS.FIXTURE_ACCESS_BASELINE, MEASURED],
  [METHODS.FIXTURE_ROUTE_SURPLUS, MEASURED],
  [METHODS.FIXTURE_ROUTE_RATIO, COMPUTED],
  [METHODS.CLI_REQUEST_PLAN, COMPUTED],
  [METHODS.REQUEST_TIME_LIMIT, COMPUTED],
  [METHODS.WORST_CASE_WALL_TIME, COMPUTED],
  [METHODS.REQUESTS_MADE, MEASURED],
  [METHODS.FAILED_CONNECTION_ATTEMPTS, MEASURED],
  [METHODS.ENDPOINTS_AT_ONCE, COMPUTED],
]);

/* --------------------------------------------------------------------------------------------
 * Units. A bare number with no unit is as dishonest as a bare number with no badge, so the
 * unit is required too. UNITLESS is explicit rather than an empty string by accident.
 * ------------------------------------------------------------------------------------------ */

export const UNITS = Object.freeze({
  MS: 'ms',
  KM: 'km',
  KM_PER_S: 'km/s',
  RATIO: 'x',
  COUNT: 'count',
  UNITLESS: '',
  TEXT: 'text',
});

const UNIT_VALUES = new Set(Object.values(UNITS));

/* --------------------------------------------------------------------------------------------
 * The Claim itself.
 * ------------------------------------------------------------------------------------------ */

/** Module private brand. Nothing outside this file can add to it, so nothing can forge a Claim. */
const CLAIMS = new WeakSet();

const REFUSE = 'photontax: a Claim cannot be turned into text implicitly, because that is how a '
  + 'number reaches a reader without its badge. Use renderClaim() or renderClaimText().';

/**
 * A single displayed value with its provenance. DESIGN 2.
 *
 * @typedef {Object} Claim
 * @property {number|string} value Full internal precision. Rounding happens at render time only.
 * @property {string} unit One of UNITS.
 * @property {BadgeKind} badge One of the four kinds.
 * @property {string} method One of METHODS, stated in the words the page uses.
 * @property {string|null} sourceId Key into data/sources.js, when a citation applies.
 * @property {number|null} decimals Display decimals. null means "integer".
 * @property {string|null} note Extra sentence shown before the number, for INFERRED claims.
 */

/**
 * @param {number|string} value
 * @param {string} unit
 * @param {BadgeKind} badge
 * @param {string} method
 * @param {{sourceId?:string|null, decimals?:number|null, note?:string|null}} [extra]
 * @returns {Claim}
 */
function makeClaim(value, unit, badge, method, extra = {}) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Claim: a numeric value must be finite, got ' + String(value)
        + '. A value this tool could not compute is not rendered as a number, it is refused.');
    }
  } else if (typeof value !== 'string') {
    throw new TypeError('Claim: value must be a finite number or a string, got ' + typeof value);
  }
  if (!UNIT_VALUES.has(unit)) {
    throw new TypeError('Claim: unit must be one of UNITS, got ' + JSON.stringify(unit));
  }
  if (!METHOD_VALUES.has(method)) {
    throw new TypeError('Claim: method must be a string from the METHODS registry. An '
      + 'unregistered method means the page would print a number whose provenance was written '
      + 'ad hoc at the call site, which is the failure this module exists to prevent.');
  }
  const expected = METHOD_KIND.get(method);
  if (expected !== badge) {
    throw new TypeError('Claim: method belongs to the ' + expected + ' tier but was given the '
      + badge + ' badge. DESIGN 2 forbids claiming to measure what is ' + expected.toLowerCase() + '.');
  }
  const decimals = extra.decimals === undefined ? null : extra.decimals;
  if (decimals !== null && (!Number.isInteger(decimals) || decimals < 0 || decimals > 6)) {
    throw new RangeError('Claim: decimals must be null or an integer in [0, 6], got ' + String(decimals));
  }

  const claim = {
    value,
    unit,
    badge,
    method,
    sourceId: extra.sourceId === undefined ? null : extra.sourceId,
    decimals,
    note: extra.note === undefined ? null : extra.note,
  };

  // Layer 3. Every implicit path to text throws instead of quietly producing a bare number.
  Object.defineProperty(claim, 'toString', { value: () => { throw new TypeError(REFUSE); }, enumerable: false });
  Object.defineProperty(claim, 'valueOf', { value: () => { throw new TypeError(REFUSE); }, enumerable: false });
  Object.defineProperty(claim, 'toJSON', { value: () => { throw new TypeError(REFUSE); }, enumerable: false });
  Object.defineProperty(claim, Symbol.toPrimitive, { value: () => { throw new TypeError(REFUSE); }, enumerable: false });

  Object.freeze(claim);
  CLAIMS.add(claim);
  return /** @type {Claim} */ (claim);
}

/** @param {unknown} x @returns {boolean} True only for an object this module built. */
export function isClaim(x) {
  return typeof x === 'object' && x !== null && CLAIMS.has(/** @type {object} */ (x));
}

/**
 * Throw unless x is a genuine Claim. Use at every boundary where a number is about to be
 * rendered, so a plain number that slipped through a refactor fails here rather than on screen.
 * @param {unknown} x
 * @param {string} [label]
 * @returns {Claim}
 */
export function assertClaim(x, label = 'value') {
  if (!isClaim(x)) {
    throw new TypeError(label + ': expected a Claim built by measured(), reported(), computed() '
      + 'or inferred(). A bare number or a look alike object cannot be rendered, because it '
      + 'carries no badge and no method. Got: ' + (x === null ? 'null' : typeof x));
  }
  return /** @type {Claim} */ (x);
}

/* -------- The only four constructors. DESIGN 2.1 to 2.4. -------- */

/** @param {number|string} value @param {string} unit @param {string} method @param {object} [extra] @returns {Claim} */
export function measured(value, unit, method, extra) { return makeClaim(value, unit, MEASURED, method, extra); }
/** @param {number|string} value @param {string} unit @param {string} method @param {object} [extra] @returns {Claim} */
export function reported(value, unit, method, extra) { return makeClaim(value, unit, REPORTED, method, extra); }
/** @param {number|string} value @param {string} unit @param {string} method @param {object} [extra] @returns {Claim} */
export function computed(value, unit, method, extra) { return makeClaim(value, unit, COMPUTED, method, extra); }
/**
 * @param {number|string} value @param {string} unit @param {string} method
 * @param {{note:string, sourceId?:string|null, decimals?:number|null}} extra
 *   `note` is REQUIRED here. DESIGN 2.4: an inference ships with its assumptions on screen
 *   BEFORE the number. An inferred claim with no stated assumption is not shippable.
 * @returns {Claim}
 */
export function inferred(value, unit, method, extra) {
  if (!extra || typeof extra.note !== 'string' || extra.note.trim().length === 0) {
    throw new TypeError('inferred(): an INFERRED claim must carry a note stating its assumption. '
      + 'DESIGN 2.4 puts the method on screen before the number. A number without it is a '
      + 'measurement claim in disguise.');
  }
  return makeClaim(value, unit, INFERRED, method, extra);
}

/* --------------------------------------------------------------------------------------------
 * Rendering. Layer 4: there is no code path here that returns the number on its own.
 * ------------------------------------------------------------------------------------------ */

/**
 * @typedef {Object} RenderedClaim
 * @property {string} valueText The rounded number with its unit, e.g. "127 ms". Never rendered alone.
 * @property {string} text valueText plus the badge label. This is what goes on screen.
 * @property {BadgeKind} badge
 * @property {string} badgeLabel
 * @property {string} badgeShape 'circle' | 'diamond' | 'triangle' | 'square-outline'
 * @property {string} badgeGlyph Text fallback character.
 * @property {string} badgeToken Palette token name. Decoration only, never the carrier.
 * @property {string} method
 * @property {string|null} note
 * @property {string|null} sourceId
 * @property {string} a11yLabel One sentence for a screen reader: value, unit, badge, method.
 * @property {Readonly<Record<string,string>>} dataAttrs Attributes the UI must put on the node.
 *   `data-claim-badge` is what scripts/gate-badges.mjs looks for, so a number rendered without
 *   going through this function fails the build.
 */

/**
 * Round for display. DESIGN trap 9: never render sub millisecond precision. Full precision is
 * kept on the Claim and used for the arithmetic; only the display is rounded.
 * @param {number} n
 * @param {number|null} decimals
 * @param {string} unit
 * @returns {string}
 */
function formatNumber(n, decimals, unit) {
  if (unit === UNITS.MS) {
    // Whole milliseconds, always. The platform clamps performance.now() to 1 ms in Firefox and
    // Safari outside cross origin isolation, so a decimal here would claim precision the
    // browser cannot supply.
    return String(Math.round(n));
  }
  if (decimals === null) return String(Math.round(n));
  return n.toFixed(decimals);
}

/**
 * Turn a Claim into everything the UI needs to display it. The ONLY text producing function.
 * @param {unknown} claim
 * @returns {RenderedClaim}
 */
export function renderClaim(claim) {
  const c = assertClaim(claim, 'renderClaim');
  const spec = BADGE_SPEC[c.badge];

  const numberText = typeof c.value === 'number' ? formatNumber(c.value, c.decimals, c.unit) : c.value;
  const valueText = c.unit === UNITS.UNITLESS || c.unit === UNITS.TEXT
    ? numberText
    : c.unit === UNITS.RATIO
      ? numberText + 'x'
      : numberText + ' ' + c.unit;

  const text = valueText + ' [' + spec.label + ']';

  return Object.freeze({
    valueText,
    text,
    badge: c.badge,
    badgeLabel: spec.label,
    badgeShape: spec.shape,
    badgeGlyph: spec.glyph,
    badgeToken: spec.token,
    method: c.method,
    note: c.note,
    sourceId: c.sourceId,
    a11yLabel: valueText + ', ' + spec.label + '. ' + (c.note ? c.note + ' ' : '') + c.method,
    dataAttrs: Object.freeze({
      'data-claim-badge': c.badge,
      'data-claim-method': c.method,
      'data-claim-unit': c.unit,
    }),
  });
}

/**
 * The plain text form, for a text export or a console self test line. Always carries the badge.
 * There is deliberately no option to omit it.
 * @param {unknown} claim
 * @returns {string}
 */
export function renderClaimText(claim) {
  return renderClaim(claim).text;
}

/**
 * Serialise a Claim for a fixture or a log. Explicit, because toJSON throws on purpose: an
 * accidental JSON.stringify of a view model must fail loudly rather than emit bare numbers
 * into a file that someone later pastes into a README.
 * @param {unknown} claim
 * @returns {{value:number|string, unit:string, badge:BadgeKind, method:string, sourceId:string|null, decimals:number|null, note:string|null}}
 */
export function claimToJSON(claim) {
  const c = assertClaim(claim, 'claimToJSON');
  return {
    value: c.value,
    unit: c.unit,
    badge: c.badge,
    method: c.method,
    sourceId: c.sourceId,
    decimals: c.decimals,
    note: c.note,
  };
}
