// What the page says about a region coordinate BEFORE it shows a number derived from one.
// DESIGN 2.4 (INFERRED) and DESIGN trap 6.
//
// The rule DESIGN 2.4 sets is that an inference ships with its assumptions on screen before the
// number, in the provider own words wherever possible. Two things follow, and the second one is
// a correction to the design.
//
// 1. The provider publishes a PLACE, not a building. That is verifiable today and it is quoted
//    below from the live page, character for character, with the date it was read.
//
// 2. DESIGN 2.4 quotes Microsoft as stating that its region coordinates "are estimates and do
//    not represent the actual physical location for specific data centers". THAT SENTENCE COULD
//    NOT BE VERIFIED. It was looked for on 2026-09-21 on both the Azure region list and the ARM
//    list-locations API reference, which are the two pages that would carry it, and it is on
//    neither. Under the standing rule it is CUT, not softened and not reworded.
//
//    It is replaced by something stronger, because it is arithmetic the reader can repeat rather
//    than a quotation the reader has to trust: Microsoft publishes 37.3719, -79.8164 as the
//    coordinate for its own eastus region, and publishes "Virginia" as that region physical
//    location. That coordinate is 275.6 km from Ashburn, Virginia. A provider published region
//    coordinate is an area estimate, and here is the distance to prove it, computed by the same
//    haversine this tool uses everywhere else.
//
// Isomorphic: no node:* imports and no DOM.

/**
 * The INFERRED sentence shown before any number derived from a region coordinate.
 * DESIGN 2.4 requires it verbatim on the page, not in a footnote.
 */
export const REGION_COORDINATE_DISCLAIMER =
  'Cloud providers publish a city or an area for each region, not a building. The coordinate '
  + 'used here is the centre of that place, so the floor below is a floor for the CITY and not '
  + 'for the building.';

/**
 * The checkable receipt for that sentence. Every field is quoted or recomputable.
 * The UI prints it under the disclaimer, behind a COMPUTED badge for the distance and a
 * REPORTED badge for the two published values.
 */
export const PROVIDER_COORDINATE_EVIDENCE = Object.freeze({
  /** Quoted from the Microsoft published region metadata example. */
  publishedRegion: 'eastus',
  publishedLatitude: 37.3719,
  publishedLongitude: -79.8164,
  publishedLatitudeSourceId: 'azure_arm_list_locations',

  /**
   * Quoted character for character from the "Physical location" column of the Microsoft
   * published Azure region list, read 2026-09-21. The provider states a state, not a street.
   */
  publishedPhysicalLocation: 'Virginia',
  publishedPhysicalLocationSourceId: 'azure_regions_list',

  /**
   * Further verbatim values from that same column on the same date, which make the point
   * without needing any single quotation to be load bearing. A provider that meant a building
   * would not write any of these.
   */
  otherPublishedPhysicalLocations: Object.freeze([
    Object.freeze({ region: 'brazilsouth', physicalLocation: 'Sao Paulo State' }),
    Object.freeze({ region: 'mexicocentral', physicalLocation: 'Queretaro State' }),
    Object.freeze({ region: 'japaneast', physicalLocation: 'Tokyo, Saitama' }),
    Object.freeze({ region: 'australiaeast', physicalLocation: 'New South Wales' }),
    Object.freeze({ region: 'centralus', physicalLocation: 'Iowa' }),
    Object.freeze({ region: 'northeurope', physicalLocation: 'Ireland' }),
  ]),

  /**
   * The comparison point. Not a claim about where anybody facility is, only the coordinate this
   * tool itself uses for the US East area, so the two numbers are directly comparable.
   */
  comparisonPlace: 'Ashburn, Virginia',
  comparisonLatitude: 39.0436,
  comparisonLongitude: -77.4875,

  /**
   * Recomputed by the shipped self test from the four coordinates above, using the same
   * haversine as every other distance in this product. Not typed in by hand, asserted by test.
   */
  separationKmPublished: 275.6,

  sentence:
    'Microsoft publishes 37.3719, -79.8164 as the coordinate for its own eastus region and '
    + '"Virginia" as that region physical location. That point is 275.6 km from Ashburn, '
    + 'Virginia. A published region coordinate is an area estimate. This tool recomputes that '
    + 'distance in front of you with the same haversine it uses for every other number.',
});

/**
 * The honesty label DESIGN 4 C5 requires on any third party measured panel. The corridor panel
 * itself is CUT from V1 (DESIGN C5 is deferred), so nothing renders this yet. It is kept here,
 * with its gate, so that whoever builds the panel cannot build it without the label.
 */
export const THIRD_PARTY_ANCHOR_DISCLAIMER =
  'These are research and operator hosted machines on good networks. They are not consumer '
  + 'connections and they are not your users. Presenting them as end user experience would '
  + 'overstate the internet, which is a defect in the flattering direction and is exactly as '
  + 'disqualifying as one in the other direction.';

/** V1 ships no third party measured panel. DESIGN C5 is out of scope. */
export const THIRD_PARTY_PANEL_IN_V1 = false;

/**
 * A row exists as soon as the observer point does, because its distance and its floor are
 * arithmetic and need nothing from the network. When the run then produces no round trip for
 * that row, the row says so in these words.
 *
 * A blank cell is the reader supplying their own explanation, and the one they supply is
 * "zero" (DESIGN trap 13). This sentence exists so that no cell in the table can be empty.
 */
export const ROW_WITHOUT_A_FIGURE =
  'No round trip for this endpoint came out of this run, so there is no measured figure to '
  + 'show. Nothing stands in its place, because a zero here would be a number this page did not '
  + 'measure. The distance and the floor beside it are arithmetic and are unaffected.';

/** Why a row with no round trip carries no ratio either. Stated, never blank. */
export const NO_RATIO_WITHOUT_A_ROUND_TRIP =
  'A ratio is a measured round trip divided by a computed floor. There is no round trip for '
  + 'this row, so there is no ratio, and none is shown.';

/**
 * What the page says before the measurement button, so a visitor knows exactly what pressing it
 * will do. DESIGN 5 and trap 14: zero network activity on page load, and the request count and
 * destination list are printed BEFORE the click, not after.
 *
 * THE COUNT IS THE LARGER ONE, AND THAT IS THE POINT. DESIGN 5 writes this line as "7 small
 * HTTPS requests to each of 12 public cloud endpoints". The method also makes one warm up
 * request per endpoint whose response is discarded (trap 5), and one request to the facility
 * endpoint that names the serving edge (DESIGN 2.2). The truthful figures are therefore eight
 * per endpoint and ninety seven in total, not seven and eighty four. This function returns the
 * truthful ones. A consent line is the one sentence on the page where a number rounded in the
 * comfortable direction is not a rounding error.
 *
 * @param {number} endpointCount
 * @param {number} perEndpoint Requests per endpoint INCLUDING the discarded warm up.
 * @param {number} warmUpPerEndpoint How many of those are discarded.
 * @param {number} facilityRequests Requests that are not an endpoint measurement.
 * @returns {string}
 */
export function consentSentence(endpointCount, perEndpoint, warmUpPerEndpoint, facilityRequests) {
  const total = endpointCount * perEndpoint + facilityRequests;
  return 'This makes ' + perEndpoint + ' small HTTPS requests to each of ' + endpointCount
    + ' public cloud endpoints, plus ' + facilityRequests + ' request to Cloudflare to learn '
    + 'which facility served you: ' + total + ' requests in total, to the hosts listed below. '
    + 'The first response from each endpoint is thrown away to open the connection, so '
    + warmUpPerEndpoint + ' of the ' + perEndpoint + ' is never part of any figure you see. '
    + 'Nothing is uploaded. Nothing is stored.';
}
