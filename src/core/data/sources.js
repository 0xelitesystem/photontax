// The citation registry. DESIGN 3 (data sources) and DESIGN 7.1 (every published number and
// how it is proven).
//
// Standing rule for this repo, and it is the reason several things the design sketched are not
// here: never publish a number, a quote or a date that cannot be recomputed from a primary
// source or from the shipped self test. If it cannot be verified, it is CUT, never softened.
//
// Every `retrieved` date below is the date the URL was actually fetched and the stated content
// read back during the build of this file. A retrieved date is a claim like any other.
//
// Isomorphic: no node:* imports and no DOM.

/**
 * @typedef {Object} Source
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string} licence What the licence permits, in one line.
 * @property {string} attribution The exact text the UI shows. DESIGN 3 fixes this wording.
 * @property {string} takes Exactly what this repo took from the source.
 * @property {string|null} retrieved ISO date the URL was fetched, or null for a definition.
 */

/** @type {Readonly<Record<string, Source>>} */
export const SOURCES = Object.freeze({
  si_metre: Object.freeze({
    id: 'si_metre',
    title: 'SI definition of the metre',
    url: 'https://www.bipm.org/en/measurement-units/si-defining-constants',
    licence: 'A definition, not a copyrightable work.',
    attribution: 'Speed of light in vacuum: SI definition of the metre, 299792458 m/s exactly.',
    takes: 'One exact constant, 299792458 m/s.',
    retrieved: null,
  }),

  corning_smf28: Object.freeze({
    id: 'corning_smf28',
    title: 'Corning SMF-28 optical fibre product information sheet',
    url: 'https://www.corning.com/optical-communications/worldwide/en/home/products/fiber.html',
    licence: 'A published physical property of a commercial product, cited as a fact. The sheet '
      + 'itself is not copied or redistributed.',
    attribution: 'Effective group index of refraction 1.4682 at 1550 nm, Corning SMF-28 product '
      + 'information sheet.',
    takes: 'One number, the effective group index at 1550 nm.',
    retrieved: null,
  }),

  iugg_mean_radius: Object.freeze({
    id: 'iugg_mean_radius',
    title: 'IUGG mean Earth radius R1 of the WGS 84 reference ellipsoid',
    url: 'https://en.wikipedia.org/wiki/Earth_radius',
    licence: 'A derived geodetic constant, (2a + b) / 3, cited as a fact.',
    attribution: 'Sphere radius 6371.0088 km, the IUGG mean Earth radius R1.',
    takes: 'One number, 6371.0088 km.',
    retrieved: null,
  }),

  aws_endpoints_catalogue: Object.freeze({
    id: 'aws_endpoints_catalogue',
    title: 'Amazon Web Services regional endpoint catalogue (botocore endpoints.json)',
    url: 'https://github.com/boto/botocore/blob/develop/botocore/data/endpoints.json',
    licence: 'The catalogue is published by AWS as part of its own SDK data (Apache 2.0). Region '
      + 'codes, region descriptions and endpoint hostnames are factual identifiers.',
    attribution: 'Region codes, region names and endpoint hostnames published by Amazon Web Services.',
    takes: 'Region codes and the region description string AWS publishes for each, plus the '
      + 'documented regional DynamoDB endpoint hostname pattern. No AWS prose is copied.',
    retrieved: '2026-09-21',
  }),

  gcping_endpoints: Object.freeze({
    id: 'gcping_endpoints',
    title: 'gcping region endpoint list',
    url: 'https://github.com/GoogleCloudPlatform/gcping',
    licence: 'Apache 2.0. The project publishes a live endpoint list at global.gcping.com/api/endpoints.',
    attribution: 'Region list from GoogleCloudPlatform/gcping, Apache 2.0. gcping established the '
      + 'warm keep alive minimum of N browser measurement technique this tool uses.',
    takes: 'Google Cloud region codes and the region name string for each. The rotating Cloud Run '
      + 'measurement URLs are deliberately NOT bundled; see data/endpoints.js for why.',
    retrieved: '2026-09-21',
  }),

  wikidata_coordinates: Object.freeze({
    id: 'wikidata_coordinates',
    title: 'Wikidata coordinate location (property P625)',
    url: 'https://www.wikidata.org/',
    licence: 'CC0 1.0. Wikidata statement data is dedicated to the public domain, so the '
      + 'coordinates can be bundled and redistributed with no obligation. Credited anyway.',
    attribution: 'City centre coordinates from Wikidata (P625), CC0.',
    takes: 'One latitude and longitude per city, quantised to 4 decimal places, each with the '
      + 'Wikidata item id it came from so a reader can re-pull the identical value.',
    retrieved: '2026-09-21',
  }),

  azure_regions_list: Object.freeze({
    id: 'azure_regions_list',
    title: 'List of Azure regions',
    url: 'https://learn.microsoft.com/en-us/azure/reliability/regions-list',
    licence: 'Cited as a fact about the publisher own product. No Microsoft content is redistributed '
      + 'beyond the short quoted column values named below.',
    attribution: 'Azure region physical location values published by Microsoft.',
    takes: 'The literal values Microsoft publishes in its own "Physical location" column, which is '
      + 'what makes the INFERRED point in data/disclaimers.js checkable by a reader.',
    retrieved: '2026-09-21',
  }),

  azure_arm_list_locations: Object.freeze({
    id: 'azure_arm_list_locations',
    title: 'Azure Resource Manager, Subscriptions - List Locations (REST API reference)',
    url: 'https://learn.microsoft.com/en-us/rest/api/resources/subscriptions/list-locations',
    licence: 'Cited as a fact about the publisher own product. Two coordinate values are quoted.',
    attribution: 'Azure region metadata latitude and longitude as published by Microsoft.',
    takes: 'The latitude and longitude Microsoft publishes for the eastus region in its own API '
      + 'reference example, used only to demonstrate, by arithmetic a reader can repeat, that a '
      + 'provider published region coordinate is an area estimate.',
    retrieved: '2026-09-21',
  }),

  cloudflare_trace: Object.freeze({
    id: 'cloudflare_trace',
    title: 'Cloudflare cdn-cgi/trace diagnostic endpoint',
    url: 'https://www.cloudflare.com/cdn-cgi/trace',
    licence: 'A public diagnostic endpoint reporting facts about the caller own connection. No '
      + 'dataset is copied, stored or redistributed.',
    attribution: 'Serving edge reported by Cloudflare for this connection.',
    takes: 'Two fields, colo and ip, read live and never stored.',
    retrieved: '2026-09-21',
  }),

  natural_earth_coastline: Object.freeze({
    id: 'natural_earth_coastline',
    title: 'Natural Earth 110m coastline',
    url: 'https://www.naturalearthdata.com/',
    licence: 'Public domain. Natural Earth states that no permission is needed to use it and that '
      + 'crediting the authors is unnecessary.',
    attribution: 'Coastlines from Natural Earth, public domain. Credited as a courtesy.',
    takes: 'The 110m coastline vector, quantised and delta encoded into the page.',
    retrieved: null,
  }),
});

/**
 * @param {string} id
 * @returns {Source}
 */
export function source(id) {
  const s = SOURCES[id];
  if (!s) {
    throw new RangeError('source(): unknown source id ' + JSON.stringify(id) + '. Every citation '
      + 'the UI shows must resolve to a registered source, so an unregistered id is a claim with '
      + 'no receipt behind it.');
  }
  return s;
}

/** Every source id, for the test that asserts no endpoint row cites something unregistered. */
export const SOURCE_IDS = Object.freeze(Object.keys(SOURCES));
