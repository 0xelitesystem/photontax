// THE ENDPOINT DATASET. DESIGN 2.2 (REPORTED), DESIGN 2.4 (INFERRED), DESIGN 3, DESIGN 4 C4.
//
// GENERATED FILE. Do not hand edit. Regenerate with:  npm run endpoints:refresh
// Verify it still matches the live catalogues with:    npm run endpoints:check
// Snapshot date: 2026-09-21. The date is displayed in the UI, per DESIGN 3.
//
// Every row carries the source of every field it states:
//   region, providerRegionName, measurementHost   REPORTED by the provider own catalogue
//   lat, lon                                      INFERRED, always. See below.
//
// EVERY COORDINATE IN THIS FILE IS INFERRED. Not one of them is a building. A provider
// publishes a place for a region, and the coordinate here is the centre of that place, so
// a floor computed from it is a floor for the CITY and not for the facility. That sentence
// ships on screen before any number derived from one of these rows, and the arithmetic
// receipt for it is in ./disclaimers.js.
//
// locationBasis records what the provider actually published:
//   PROVIDER_NAMED_CITY   the published region name IS a city name
//   PROVIDER_NAMED_AREA   the provider published a state or area, named in `area`
//
// 22 regions were CUT because the provider published no single city for them.
// Inventing one would be a fabricated coordinate wearing an INFERRED badge, which is worse
// than the row not existing. The full cut list is CUT_REGIONS at the bottom of this file,
// in the repo rather than in a commit message, so the omission is auditable.

/**
 * @typedef {Object} Endpoint
 * @property {string} id            Stable key, "<provider>:<region>".
 * @property {"aws"|"gcp"} provider
 * @property {string} providerLabel
 * @property {string} region        The provider own region code.
 * @property {string} providerRegionName  The provider own published name, character for character.
 * @property {string} city
 * @property {string|null} area     Set only when locationBasis is PROVIDER_NAMED_AREA.
 * @property {number} lat           INFERRED. City centre, 4 decimal places.
 * @property {number} lon           INFERRED. City centre, 4 decimal places.
 * @property {"PROVIDER_NAMED_CITY"|"PROVIDER_NAMED_AREA"} locationBasis
 * @property {string} coordinateSourceId  Key into ./sources.js.
 * @property {string} coordinateRef       Wikidata item id, so a reader can re-pull the value.
 * @property {string} catalogueSourceId   Key into ./sources.js.
 * @property {string|null} measurementHost  Host measured, or null for a coordinate only row.
 * @property {boolean} measured
 */

/** Date the live catalogues were read to build this file. Shown in the UI. */
export const SNAPSHOT_DATE = '2026-09-21';

/** @type {readonly Endpoint[]} */
export const ENDPOINTS = Object.freeze([
  Object.freeze({
    id: 'aws:af-south-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'af-south-1', providerRegionName: "Africa (Cape Town)",
    city: "Cape Town", area: null,
    lat: -33.9253, lon: 18.4239, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q5465',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.af-south-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:ap-east-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-east-1', providerRegionName: "Asia Pacific (Hong Kong)",
    city: "Hong Kong", area: null,
    lat: 22.2783, lon: 114.1586, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q8646',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.ap-east-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:ap-east-2', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-east-2', providerRegionName: "Asia Pacific (Taipei)",
    city: "Taipei", area: null,
    lat: 25.0375, lon: 121.5625, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1867',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:ap-northeast-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-northeast-1', providerRegionName: "Asia Pacific (Tokyo)",
    city: "Tokyo", area: null,
    lat: 35.6894, lon: 139.6917, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1490',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.ap-northeast-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:ap-northeast-2', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-northeast-2', providerRegionName: "Asia Pacific (Seoul)",
    city: "Seoul", area: null,
    lat: 37.56, lon: 126.99, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q8684',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:ap-northeast-3', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-northeast-3', providerRegionName: "Asia Pacific (Osaka)",
    city: "Osaka", area: null,
    lat: 34.6938, lon: 135.5021, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q35765',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:ap-south-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-south-1', providerRegionName: "Asia Pacific (Mumbai)",
    city: "Mumbai", area: null,
    lat: 19.0758, lon: 72.8775, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1156',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.ap-south-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:ap-south-2', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-south-2', providerRegionName: "Asia Pacific (Hyderabad)",
    city: "Hyderabad", area: null,
    lat: 17.3617, lon: 78.4747, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1361',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:ap-southeast-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-southeast-1', providerRegionName: "Asia Pacific (Singapore)",
    city: "Singapore", area: null,
    lat: 1.3, lon: 103.8, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q334',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.ap-southeast-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:ap-southeast-2', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-southeast-2', providerRegionName: "Asia Pacific (Sydney)",
    city: "Sydney", area: null,
    lat: -33.8678, lon: 151.21, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q3130',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.ap-southeast-2.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:ap-southeast-3', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-southeast-3', providerRegionName: "Asia Pacific (Jakarta)",
    city: "Jakarta", area: null,
    lat: -6.1753, lon: 106.8269, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q3630',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:ap-southeast-4', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ap-southeast-4', providerRegionName: "Asia Pacific (Melbourne)",
    city: "Melbourne", area: null,
    lat: -37.8142, lon: 144.9631, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q3141',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:ca-west-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'ca-west-1', providerRegionName: "Canada West (Calgary)",
    city: "Calgary", area: null,
    lat: 51.0475, lon: -114.0625, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q36312',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:eu-central-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'eu-central-1', providerRegionName: "Europe (Frankfurt)",
    city: "Frankfurt", area: null,
    lat: 50.1106, lon: 8.6822, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1794',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.eu-central-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:eu-central-2', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'eu-central-2', providerRegionName: "Europe (Zurich)",
    city: "Zurich", area: null,
    lat: 47.3744, lon: 8.5411, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q72',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:eu-north-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'eu-north-1', providerRegionName: "Europe (Stockholm)",
    city: "Stockholm", area: null,
    lat: 59.3294, lon: 18.0686, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1754',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.eu-north-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:eu-south-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'eu-south-1', providerRegionName: "Europe (Milan)",
    city: "Milan", area: null,
    lat: 45.4669, lon: 9.19, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q490',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:eu-west-2', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'eu-west-2', providerRegionName: "Europe (London)",
    city: "London", area: null,
    lat: 51.5072, lon: -0.1275, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q84',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.eu-west-2.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:eu-west-3', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'eu-west-3', providerRegionName: "Europe (Paris)",
    city: "Paris", area: null,
    lat: 48.8567, lon: 2.3522, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q90',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'aws:il-central-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'il-central-1', providerRegionName: "Israel (Tel Aviv)",
    city: "Tel Aviv", area: null,
    lat: 32.08, lon: 34.78, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q33935',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.il-central-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:sa-east-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'sa-east-1', providerRegionName: "South America (Sao Paulo)",
    city: "Sao Paulo", area: null,
    lat: -23.5504, lon: -46.6339, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q174',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.sa-east-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'aws:us-east-1', provider: 'aws', providerLabel: 'Amazon Web Services',
    region: 'us-east-1', providerRegionName: "US East (N. Virginia)",
    city: "Ashburn, Virginia", area: "N. Virginia",
    lat: 39.0436, lon: -77.4875, locationBasis: "PROVIDER_NAMED_AREA",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q724884',
    catalogueSourceId: 'aws_endpoints_catalogue',
    measurementHost: "dynamodb.us-east-1.amazonaws.com", measured: true,
  }),
  Object.freeze({
    id: 'gcp:africa-south1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'africa-south1', providerRegionName: "Johannesburg",
    city: "Johannesburg", area: null,
    lat: -26.2044, lon: 28.0416, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q34647',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:asia-east2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'asia-east2', providerRegionName: "Hong Kong",
    city: "Hong Kong", area: null,
    lat: 22.2783, lon: 114.1586, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q8646',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:asia-northeast1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'asia-northeast1', providerRegionName: "Tokyo",
    city: "Tokyo", area: null,
    lat: 35.6894, lon: 139.6917, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1490',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:asia-northeast2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'asia-northeast2', providerRegionName: "Osaka",
    city: "Osaka", area: null,
    lat: 34.6938, lon: 135.5021, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q35765',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:asia-northeast3', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'asia-northeast3', providerRegionName: "Seoul",
    city: "Seoul", area: null,
    lat: 37.56, lon: 126.99, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q8684',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:asia-south1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'asia-south1', providerRegionName: "Mumbai",
    city: "Mumbai", area: null,
    lat: 19.0758, lon: 72.8775, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1156',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:asia-south2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'asia-south2', providerRegionName: "Delhi",
    city: "Delhi", area: null,
    lat: 28.6667, lon: 77.2167, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1353',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:asia-southeast1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'asia-southeast1', providerRegionName: "Singapore",
    city: "Singapore", area: null,
    lat: 1.3, lon: 103.8, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q334',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:asia-southeast2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'asia-southeast2', providerRegionName: "Jakarta",
    city: "Jakarta", area: null,
    lat: -6.1753, lon: 106.8269, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q3630',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:asia-southeast3', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'asia-southeast3', providerRegionName: "Bangkok",
    city: "Bangkok", area: null,
    lat: 13.75, lon: 100.5167, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1861',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:australia-southeast1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'australia-southeast1', providerRegionName: "Sydney",
    city: "Sydney", area: null,
    lat: -33.8678, lon: 151.21, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q3130',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:australia-southeast2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'australia-southeast2', providerRegionName: "Melbourne",
    city: "Melbourne", area: null,
    lat: -37.8142, lon: 144.9631, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q3141',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-central2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-central2', providerRegionName: "Warsaw",
    city: "Warsaw", area: null,
    lat: 52.23, lon: 21.0111, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q270',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-north2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-north2', providerRegionName: "Stockholm",
    city: "Stockholm", area: null,
    lat: 59.3294, lon: 18.0686, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1754',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-southwest1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-southwest1', providerRegionName: "Madrid",
    city: "Madrid", area: null,
    lat: 40.4169, lon: -3.7033, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q2807',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-west10', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-west10', providerRegionName: "Berlin",
    city: "Berlin", area: null,
    lat: 52.5167, lon: 13.3833, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q64',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-west12', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-west12', providerRegionName: "Turin",
    city: "Turin", area: null,
    lat: 45.0792, lon: 7.6761, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q495',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-west2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-west2', providerRegionName: "London",
    city: "London", area: null,
    lat: 51.5072, lon: -0.1275, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q84',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-west3', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-west3', providerRegionName: "Frankfurt",
    city: "Frankfurt", area: null,
    lat: 50.1106, lon: 8.6822, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q1794',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-west6', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-west6', providerRegionName: "Zurich",
    city: "Zurich", area: null,
    lat: 47.3744, lon: 8.5411, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q72',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-west8', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-west8', providerRegionName: "Milan",
    city: "Milan", area: null,
    lat: 45.4669, lon: 9.19, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q490',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:europe-west9', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'europe-west9', providerRegionName: "Paris",
    city: "Paris", area: null,
    lat: 48.8567, lon: 2.3522, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q90',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:me-central1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'me-central1', providerRegionName: "Doha",
    city: "Doha", area: null,
    lat: 25.2861, lon: 51.5294, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q3861',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:me-central2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'me-central2', providerRegionName: "Dammam",
    city: "Dammam", area: null,
    lat: 26.4333, lon: 50.1, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q160320',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:me-west1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'me-west1', providerRegionName: "Tel Aviv",
    city: "Tel Aviv", area: null,
    lat: 32.08, lon: 34.78, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q33935',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:northamerica-northeast1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'northamerica-northeast1', providerRegionName: "Montréal",
    city: "Montreal", area: null,
    lat: 45.5033, lon: -73.5868, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q340',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:northamerica-northeast2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'northamerica-northeast2', providerRegionName: "Toronto",
    city: "Toronto", area: null,
    lat: 43.6703, lon: -79.3867, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q172',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:southamerica-east1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'southamerica-east1', providerRegionName: "São Paulo",
    city: "Sao Paulo", area: null,
    lat: -23.5504, lon: -46.6339, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q174',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:southamerica-west1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'southamerica-west1', providerRegionName: "Santiago",
    city: "Santiago", area: null,
    lat: -33.4375, lon: -70.65, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q2887',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:us-east5', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'us-east5', providerRegionName: "Columbus",
    city: "Columbus, Ohio", area: null,
    lat: 39.9622, lon: -83.0006, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q16567',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:us-south1', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'us-south1', providerRegionName: "Dallas",
    city: "Dallas", area: null,
    lat: 32.7792, lon: -96.8089, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q16557',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:us-west2', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'us-west2', providerRegionName: "Los Angeles",
    city: "Los Angeles", area: null,
    lat: 34.0522, lon: -118.2437, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q65',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:us-west3', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'us-west3', providerRegionName: "Salt Lake City",
    city: "Salt Lake City", area: null,
    lat: 40.75, lon: -111.8833, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q23337',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
  Object.freeze({
    id: 'gcp:us-west4', provider: 'gcp', providerLabel: 'Google Cloud',
    region: 'us-west4', providerRegionName: "Las Vegas",
    city: "Las Vegas", area: null,
    lat: 36.1672, lon: -115.1486, locationBasis: "PROVIDER_NAMED_CITY",
    coordinateSourceId: 'wikidata_coordinates', coordinateRef: 'Q23768',
    catalogueSourceId: 'gcping_endpoints',
    measurementHost: null, measured: false,
  }),
]);

/**
 * The 12 hosts this tool ever contacts for a measurement. DESIGN 5.
 *
 * This array and the Content-Security-Policy connect-src allowlist in the page head must
 * contain the SAME set of hosts. The flagship gate fails the build on a host in either set
 * that is missing from the other, so a hidden call and a stale declaration both fail. Adding
 * a row here without adding it to the CSP is a build failure, which is the point.
 */
export const MEASUREMENT_HOSTS = Object.freeze([
  'dynamodb.af-south-1.amazonaws.com',
  'dynamodb.ap-east-1.amazonaws.com',
  'dynamodb.ap-northeast-1.amazonaws.com',
  'dynamodb.ap-south-1.amazonaws.com',
  'dynamodb.ap-southeast-1.amazonaws.com',
  'dynamodb.ap-southeast-2.amazonaws.com',
  'dynamodb.eu-central-1.amazonaws.com',
  'dynamodb.eu-north-1.amazonaws.com',
  'dynamodb.eu-west-2.amazonaws.com',
  'dynamodb.il-central-1.amazonaws.com',
  'dynamodb.sa-east-1.amazonaws.com',
  'dynamodb.us-east-1.amazonaws.com',
]);

/** The endpoints that are measured, in the order the page fires them. */
export const MEASURED_ENDPOINTS = Object.freeze(ENDPOINTS.filter((e) => e.measured));

/** @param {string} id @returns {Endpoint|undefined} */
export function endpointById(id) { return ENDPOINTS.find((e) => e.id === id); }

/**
 * Regions present in the live provider catalogues on the snapshot date that were CUT, with
 * the reason. Kept in the shipped repo so the omissions are auditable rather than silent.
 */
export const CUT_REGIONS = Object.freeze([
  "aws ap-southeast-5  Asia Pacific (Malaysia)  (provider published no single city)",
  "aws ap-southeast-6  Asia Pacific (New Zealand)  (provider published no single city)",
  "aws ap-southeast-7  Asia Pacific (Thailand)  (provider published no single city)",
  "aws ca-central-1  Canada (Central)  (provider published no single city)",
  "aws eu-south-2  Europe (Spain)  (provider published no single city)",
  "aws eu-west-1  Europe (Ireland)  (provider published no single city)",
  "aws me-central-1  Middle East (UAE)  (provider published no single city)",
  "aws me-south-1  Middle East (Bahrain)  (provider published no single city)",
  "aws mx-central-1  Mexico (Central)  (provider published no single city)",
  "aws us-east-2  US East (Ohio)  (provider published no single city)",
  "aws us-west-1  US West (N. California)  (provider published no single city)",
  "aws us-west-2  US West (Oregon)  (provider published no single city)",
  "gcp asia-east1  Taiwan  (provider published no single city)",
  "gcp europe-north1  Finland  (provider published no single city)",
  "gcp europe-west1  Belgium  (provider published no single city)",
  "gcp europe-west4  Netherlands  (provider published no single city)",
  "gcp global  Global External HTTPS Load Balancer  (provider published no single city)",
  "gcp northamerica-south1  México  (provider published no single city)",
  "gcp us-central1  Iowa  (provider published no single city)",
  "gcp us-east1  South Carolina  (provider published no single city)",
  "gcp us-east4  North Virginia  (provider published no single city)",
  "gcp us-west1  Oregon  (provider published no single city)",
]);
