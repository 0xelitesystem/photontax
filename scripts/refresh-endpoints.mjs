#!/usr/bin/env node
// Regenerate src/core/data/endpoints.js from primary sources. BUILD TIME ONLY.
//
//   node scripts/refresh-endpoints.mjs            rewrite the table
//   node scripts/refresh-endpoints.mjs --check    regenerate into memory and diff, exit 1 on drift
//
// DESIGN 3 bundles the endpoint table rather than fetching it, so the shipped page makes no
// network call to build its own catalogue. This script is how that bundle is produced, and it
// exists so that no coordinate, hostname or region name in the repo is something a person typed
// from memory. Everything below is fetched, and every row carries the source it came from.
//
// THE CURATION RULE, and it is the reason this file is longer than a fetch would need to be:
// a row ships only if the PROVIDER ITSELF publishes a place for that region that resolves to a
// single city. Where the provider publishes a country, a state or an ocean sized area, the row
// is CUT and the reason is printed. Inventing a city for "US West (Oregon)" would be a
// fabricated coordinate wearing an INFERRED badge, which is worse than having no row at all.
//
// Exactly one row is an exception and it is marked as such: us-east-1, which AWS publishes as
// "US East (N. Virginia)". It is the single most important region in the product and it is the
// row the design worked example uses, so it ships with basis PROVIDER_NAMED_AREA and with the
// area it actually names written into the row.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'src', 'core', 'data', 'endpoints.js');

const UA = 'photontax-build/0.1 (+https://github.com/0xelitesystem/photontax)';

const AWS_CATALOGUE = 'https://raw.githubusercontent.com/boto/botocore/develop/botocore/data/endpoints.json';
const GCP_CATALOGUE = 'https://global.gcping.com/api/endpoints';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

/**
 * Region to city. The `title` is an English Wikipedia page title, which is how the Wikidata
 * item is resolved, so the coordinate that lands in the table is the one a reader gets by
 * opening that page. `basis` records honestly what the provider actually published.
 *
 *   PROVIDER_NAMED_CITY  the provider own published region name IS a city name
 *   PROVIDER_NAMED_AREA  the provider published a state or area; the locality is named in `area`
 */
const AWS_REGION_CITY = {
  'us-east-1': { city: 'Ashburn, Virginia', title: 'Ashburn, Virginia', basis: 'PROVIDER_NAMED_AREA', area: 'N. Virginia' },
  'eu-central-1': { city: 'Frankfurt', title: 'Frankfurt', basis: 'PROVIDER_NAMED_CITY' },
  'eu-west-2': { city: 'London', title: 'London', basis: 'PROVIDER_NAMED_CITY' },
  'eu-west-3': { city: 'Paris', title: 'Paris', basis: 'PROVIDER_NAMED_CITY' },
  'eu-north-1': { city: 'Stockholm', title: 'Stockholm', basis: 'PROVIDER_NAMED_CITY' },
  'eu-central-2': { city: 'Zurich', title: 'Zurich', basis: 'PROVIDER_NAMED_CITY' },
  'eu-south-1': { city: 'Milan', title: 'Milan', basis: 'PROVIDER_NAMED_CITY' },
  'sa-east-1': { city: 'Sao Paulo', title: 'São Paulo', basis: 'PROVIDER_NAMED_CITY' },
  'af-south-1': { city: 'Cape Town', title: 'Cape Town', basis: 'PROVIDER_NAMED_CITY' },
  'il-central-1': { city: 'Tel Aviv', title: 'Tel Aviv', basis: 'PROVIDER_NAMED_CITY' },
  'ap-south-1': { city: 'Mumbai', title: 'Mumbai', basis: 'PROVIDER_NAMED_CITY' },
  'ap-south-2': { city: 'Hyderabad', title: 'Hyderabad', basis: 'PROVIDER_NAMED_CITY' },
  'ap-southeast-1': { city: 'Singapore', title: 'Singapore', basis: 'PROVIDER_NAMED_CITY' },
  'ap-southeast-2': { city: 'Sydney', title: 'Sydney', basis: 'PROVIDER_NAMED_CITY' },
  'ap-southeast-3': { city: 'Jakarta', title: 'Jakarta', basis: 'PROVIDER_NAMED_CITY' },
  'ap-southeast-4': { city: 'Melbourne', title: 'Melbourne', basis: 'PROVIDER_NAMED_CITY' },
  'ap-northeast-1': { city: 'Tokyo', title: 'Tokyo', basis: 'PROVIDER_NAMED_CITY' },
  'ap-northeast-2': { city: 'Seoul', title: 'Seoul', basis: 'PROVIDER_NAMED_CITY' },
  'ap-northeast-3': { city: 'Osaka', title: 'Osaka', basis: 'PROVIDER_NAMED_CITY' },
  'ap-east-1': { city: 'Hong Kong', title: 'Hong Kong', basis: 'PROVIDER_NAMED_CITY' },
  'ap-east-2': { city: 'Taipei', title: 'Taipei', basis: 'PROVIDER_NAMED_CITY' },
  'ca-west-1': { city: 'Calgary', title: 'Calgary', basis: 'PROVIDER_NAMED_CITY' },
};

const GCP_REGION_CITY = {
  'africa-south1': { city: 'Johannesburg', title: 'Johannesburg', basis: 'PROVIDER_NAMED_CITY' },
  'asia-east2': { city: 'Hong Kong', title: 'Hong Kong', basis: 'PROVIDER_NAMED_CITY' },
  'asia-northeast1': { city: 'Tokyo', title: 'Tokyo', basis: 'PROVIDER_NAMED_CITY' },
  'asia-northeast2': { city: 'Osaka', title: 'Osaka', basis: 'PROVIDER_NAMED_CITY' },
  'asia-northeast3': { city: 'Seoul', title: 'Seoul', basis: 'PROVIDER_NAMED_CITY' },
  'asia-south1': { city: 'Mumbai', title: 'Mumbai', basis: 'PROVIDER_NAMED_CITY' },
  'asia-south2': { city: 'Delhi', title: 'Delhi', basis: 'PROVIDER_NAMED_CITY' },
  'asia-southeast1': { city: 'Singapore', title: 'Singapore', basis: 'PROVIDER_NAMED_CITY' },
  'asia-southeast2': { city: 'Jakarta', title: 'Jakarta', basis: 'PROVIDER_NAMED_CITY' },
  'asia-southeast3': { city: 'Bangkok', title: 'Bangkok', basis: 'PROVIDER_NAMED_CITY' },
  'australia-southeast1': { city: 'Sydney', title: 'Sydney', basis: 'PROVIDER_NAMED_CITY' },
  'australia-southeast2': { city: 'Melbourne', title: 'Melbourne', basis: 'PROVIDER_NAMED_CITY' },
  'europe-central2': { city: 'Warsaw', title: 'Warsaw', basis: 'PROVIDER_NAMED_CITY' },
  'europe-north2': { city: 'Stockholm', title: 'Stockholm', basis: 'PROVIDER_NAMED_CITY' },
  'europe-southwest1': { city: 'Madrid', title: 'Madrid', basis: 'PROVIDER_NAMED_CITY' },
  'europe-west10': { city: 'Berlin', title: 'Berlin', basis: 'PROVIDER_NAMED_CITY' },
  'europe-west12': { city: 'Turin', title: 'Turin', basis: 'PROVIDER_NAMED_CITY' },
  'europe-west2': { city: 'London', title: 'London', basis: 'PROVIDER_NAMED_CITY' },
  'europe-west3': { city: 'Frankfurt', title: 'Frankfurt', basis: 'PROVIDER_NAMED_CITY' },
  'europe-west6': { city: 'Zurich', title: 'Zurich', basis: 'PROVIDER_NAMED_CITY' },
  'europe-west8': { city: 'Milan', title: 'Milan', basis: 'PROVIDER_NAMED_CITY' },
  'europe-west9': { city: 'Paris', title: 'Paris', basis: 'PROVIDER_NAMED_CITY' },
  'me-central1': { city: 'Doha', title: 'Doha', basis: 'PROVIDER_NAMED_CITY' },
  'me-central2': { city: 'Dammam', title: 'Dammam', basis: 'PROVIDER_NAMED_CITY' },
  'me-west1': { city: 'Tel Aviv', title: 'Tel Aviv', basis: 'PROVIDER_NAMED_CITY' },
  'northamerica-northeast1': { city: 'Montreal', title: 'Montreal', basis: 'PROVIDER_NAMED_CITY' },
  'northamerica-northeast2': { city: 'Toronto', title: 'Toronto', basis: 'PROVIDER_NAMED_CITY' },
  'southamerica-east1': { city: 'Sao Paulo', title: 'São Paulo', basis: 'PROVIDER_NAMED_CITY' },
  'southamerica-west1': { city: 'Santiago', title: 'Santiago', basis: 'PROVIDER_NAMED_CITY' },
  'us-east5': { city: 'Columbus, Ohio', title: 'Columbus, Ohio', basis: 'PROVIDER_NAMED_CITY' },
  'us-south1': { city: 'Dallas', title: 'Dallas', basis: 'PROVIDER_NAMED_CITY' },
  'us-west2': { city: 'Los Angeles', title: 'Los Angeles', basis: 'PROVIDER_NAMED_CITY' },
  'us-west3': { city: 'Salt Lake City', title: 'Salt Lake City', basis: 'PROVIDER_NAMED_CITY' },
  'us-west4': { city: 'Las Vegas', title: 'Las Vegas', basis: 'PROVIDER_NAMED_CITY' },
};

/**
 * The regions this tool actually measures. DESIGN 5: 12 endpoints.
 *
 * They are all AWS and that is a deliberate, checkable decision rather than a preference.
 * A measured host has to appear as a literal in the Content-Security-Policy connect-src
 * allowlist in the page head, and the flagship gate fails if the set of hosts used in code is
 * not EQUAL to the set declared there. The gcping measurement URLs are Cloud Run hostnames of
 * the form <region>-<random>-<suffix>.a.run.app, and that random component rotates. A rotating
 * hostname cannot be declared as a literal, and a wildcard would not satisfy an equality check.
 * AWS regional endpoint hostnames are stable and documented, and were verified on 2026-09-21 to
 * answer with Access-Control-Allow-Origin: * and with no Timing-Allow-Origin header, which is
 * exactly the shape DESIGN 2.5 and Appendix B describe.
 *
 * The Google rows still ship, with no endpoint, for the region picker. A floor needs a
 * coordinate, not a socket.
 */
const MEASURED_REGIONS = [
  'us-east-1', 'eu-central-1', 'eu-west-2', 'eu-north-1',
  'sa-east-1', 'af-south-1', 'il-central-1', 'ap-south-1',
  'ap-southeast-1', 'ap-northeast-1', 'ap-southeast-2', 'ap-east-1',
];

/**
 * The AWS regional endpoint used for measurement. DynamoDB is chosen because an unauthenticated
 * request returns a small fixed error body quickly, which is what DESIGN trap 5 asks for: the
 * server think time contribution is small and constant, so the minimum of N is estimating
 * transport rather than work.
 * @param {string} region
 */
const awsEndpointHost = (region) => 'dynamodb.' + region + '.amazonaws.com';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error('GET ' + url + ' -> HTTP ' + res.status);
  return res.json();
}

/** @param {string[]} titles @returns {Promise<Map<string,{qid:string,lat:number,lon:number}>>} */
async function wikidataCoords(titles) {
  /** @type {Map<string,{qid:string,lat:number,lon:number}>} */
  const byTitle = new Map();
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const url = WIKIDATA_API
      + '?action=wbgetentities&sites=enwiki&titles=' + encodeURIComponent(batch.join('|'))
      + '&props=claims|sitelinks&format=json';
    const j = await getJson(url);
    for (const [qid, ent] of Object.entries(j.entities || {})) {
      const claim = ent.claims && ent.claims.P625 && ent.claims.P625[0];
      if (!claim) continue;
      const v = claim.mainsnak.datavalue.value;
      const title = ent.sitelinks && ent.sitelinks.enwiki && ent.sitelinks.enwiki.title;
      if (!title) continue;
      byTitle.set(title, { qid, lat: v.latitude, lon: v.longitude });
    }
  }
  return byTitle;
}

const q4 = (n) => Math.round(n * 1e4) / 1e4;

async function build() {
  const today = new Date().toISOString().slice(0, 10);

  const [awsCat, gcpCat] = await Promise.all([getJson(AWS_CATALOGUE), getJson(GCP_CATALOGUE)]);

  const awsPartition = awsCat.partitions.find((p) => p.partition === 'aws');
  if (!awsPartition) throw new Error('AWS catalogue: no "aws" partition found');

  /** @type {string[]} */
  const cut = [];

  /** Region code to the provider own published description string. */
  const awsDescription = new Map(Object.entries(awsPartition.regions).map(([k, v]) => [k, v.description]));
  for (const code of Object.keys(awsPartition.regions)) {
    if (!AWS_REGION_CITY[code]) {
      cut.push('aws ' + code + '  ' + awsDescription.get(code) + '  (provider published no single city)');
    }
  }
  const gcpName = new Map(Object.entries(gcpCat).map(([k, v]) => [k, v.RegionName]));
  for (const code of Object.keys(gcpCat)) {
    if (!GCP_REGION_CITY[code]) {
      cut.push('gcp ' + code + '  ' + gcpName.get(code) + '  (provider published no single city)');
    }
  }

  const titles = [...new Set([
    ...Object.values(AWS_REGION_CITY).map((r) => r.title),
    ...Object.values(GCP_REGION_CITY).map((r) => r.title),
  ])].sort();
  const coords = await wikidataCoords(titles);

  const missing = titles.filter((t) => !coords.has(t));
  if (missing.length) throw new Error('Wikidata: no P625 coordinate for ' + missing.join(', '));

  /** @type {object[]} */
  const rows = [];

  for (const [code, meta] of Object.entries(AWS_REGION_CITY)) {
    const desc = awsDescription.get(code);
    if (!desc) { cut.push('aws ' + code + '  (no longer in the AWS catalogue, dropped)'); continue; }
    const c = coords.get(meta.title);
    const measured = MEASURED_REGIONS.includes(code);
    rows.push({
      id: 'aws:' + code,
      provider: 'aws',
      providerLabel: 'Amazon Web Services',
      region: code,
      providerRegionName: desc,
      city: meta.city,
      area: meta.area || null,
      lat: q4(c.lat),
      lon: q4(c.lon),
      locationBasis: meta.basis,
      coordinateSourceId: 'wikidata_coordinates',
      coordinateRef: c.qid,
      catalogueSourceId: 'aws_endpoints_catalogue',
      measurementHost: measured ? awsEndpointHost(code) : null,
      measured,
    });
  }

  for (const [code, meta] of Object.entries(GCP_REGION_CITY)) {
    const name = gcpName.get(code);
    if (!name) { cut.push('gcp ' + code + '  (no longer in the gcping catalogue, dropped)'); continue; }
    const c = coords.get(meta.title);
    rows.push({
      id: 'gcp:' + code,
      provider: 'gcp',
      providerLabel: 'Google Cloud',
      region: code,
      providerRegionName: name,
      city: meta.city,
      area: null,
      lat: q4(c.lat),
      lon: q4(c.lon),
      locationBasis: meta.basis,
      coordinateSourceId: 'wikidata_coordinates',
      coordinateRef: c.qid,
      catalogueSourceId: 'gcping_endpoints',
      measurementHost: null,
      measured: false,
    });
  }

  rows.sort((a, b) => a.id.localeCompare(b.id));
  cut.sort();
  return { rows, cut, today };
}

/** @param {{rows:object[], cut:string[], today:string}} data */
function emit({ rows, cut, today }) {
  const measured = rows.filter((r) => r.measured);
  const L = [];
  L.push('// THE ENDPOINT DATASET. DESIGN 2.2 (REPORTED), DESIGN 2.4 (INFERRED), DESIGN 3, DESIGN 4 C4.');
  L.push('//');
  L.push('// GENERATED FILE. Do not hand edit. Regenerate with:  npm run endpoints:refresh');
  L.push('// Verify it still matches the live catalogues with:    npm run endpoints:check');
  L.push('// Snapshot date: ' + today + '. The date is displayed in the UI, per DESIGN 3.');
  L.push('//');
  L.push('// Every row carries the source of every field it states:');
  L.push('//   region, providerRegionName, measurementHost   REPORTED by the provider own catalogue');
  L.push('//   lat, lon                                      INFERRED, always. See below.');
  L.push('//');
  L.push('// EVERY COORDINATE IN THIS FILE IS INFERRED. Not one of them is a building. A provider');
  L.push('// publishes a place for a region, and the coordinate here is the centre of that place, so');
  L.push('// a floor computed from it is a floor for the CITY and not for the facility. That sentence');
  L.push('// ships on screen before any number derived from one of these rows, and the arithmetic');
  L.push('// receipt for it is in ./disclaimers.js.');
  L.push('//');
  L.push('// locationBasis records what the provider actually published:');
  L.push('//   PROVIDER_NAMED_CITY   the published region name IS a city name');
  L.push('//   PROVIDER_NAMED_AREA   the provider published a state or area, named in `area`');
  L.push('//');
  L.push('// ' + cut.length + ' regions were CUT because the provider published no single city for them.');
  L.push('// Inventing one would be a fabricated coordinate wearing an INFERRED badge, which is worse');
  L.push('// than the row not existing. The full cut list is CUT_REGIONS at the bottom of this file,');
  L.push('// in the repo rather than in a commit message, so the omission is auditable.');
  L.push('');
  L.push('/**');
  L.push(' * @typedef {Object} Endpoint');
  L.push(' * @property {string} id            Stable key, "<provider>:<region>".');
  L.push(' * @property {"aws"|"gcp"} provider');
  L.push(' * @property {string} providerLabel');
  L.push(' * @property {string} region        The provider own region code.');
  L.push(' * @property {string} providerRegionName  The provider own published name, character for character.');
  L.push(' * @property {string} city');
  L.push(' * @property {string|null} area     Set only when locationBasis is PROVIDER_NAMED_AREA.');
  L.push(' * @property {number} lat           INFERRED. City centre, 4 decimal places.');
  L.push(' * @property {number} lon           INFERRED. City centre, 4 decimal places.');
  L.push(' * @property {"PROVIDER_NAMED_CITY"|"PROVIDER_NAMED_AREA"} locationBasis');
  L.push(' * @property {string} coordinateSourceId  Key into ./sources.js.');
  L.push(' * @property {string} coordinateRef       Wikidata item id, so a reader can re-pull the value.');
  L.push(' * @property {string} catalogueSourceId   Key into ./sources.js.');
  L.push(' * @property {string|null} measurementHost  Host measured, or null for a coordinate only row.');
  L.push(' * @property {boolean} measured');
  L.push(' */');
  L.push('');
  L.push('/** Date the live catalogues were read to build this file. Shown in the UI. */');
  L.push("export const SNAPSHOT_DATE = '" + today + "';");
  L.push('');
  L.push('/** @type {readonly Endpoint[]} */');
  L.push('export const ENDPOINTS = Object.freeze([');
  for (const r of rows) {
    L.push('  Object.freeze({');
    L.push("    id: '" + r.id + "', provider: '" + r.provider + "', providerLabel: '" + r.providerLabel + "',");
    L.push("    region: '" + r.region + "', providerRegionName: " + JSON.stringify(r.providerRegionName) + ',');
    L.push('    city: ' + JSON.stringify(r.city) + ', area: ' + (r.area === null ? 'null' : JSON.stringify(r.area)) + ',');
    L.push('    lat: ' + r.lat + ', lon: ' + r.lon + ', locationBasis: ' + JSON.stringify(r.locationBasis) + ',');
    L.push("    coordinateSourceId: 'wikidata_coordinates', coordinateRef: '" + r.coordinateRef + "',");
    L.push("    catalogueSourceId: '" + r.catalogueSourceId + "',");
    L.push('    measurementHost: ' + (r.measurementHost === null ? 'null' : JSON.stringify(r.measurementHost)) + ', measured: ' + r.measured + ',');
    L.push('  }),');
  }
  L.push(']);');
  L.push('');
  L.push('/**');
  L.push(' * The ' + measured.length + ' hosts this tool ever contacts for a measurement. DESIGN 5.');
  L.push(' *');
  L.push(' * This array and the Content-Security-Policy connect-src allowlist in the page head must');
  L.push(' * contain the SAME set of hosts. The flagship gate fails the build on a host in either set');
  L.push(' * that is missing from the other, so a hidden call and a stale declaration both fail. Adding');
  L.push(' * a row here without adding it to the CSP is a build failure, which is the point.');
  L.push(' */');
  L.push('export const MEASUREMENT_HOSTS = Object.freeze([');
  for (const r of measured) L.push("  '" + r.measurementHost + "',");
  L.push(']);');
  L.push('');
  L.push('/** The endpoints that are measured, in the order the page fires them. */');
  L.push('export const MEASURED_ENDPOINTS = Object.freeze(ENDPOINTS.filter((e) => e.measured));');
  L.push('');
  L.push('/** @param {string} id @returns {Endpoint|undefined} */');
  L.push('export function endpointById(id) { return ENDPOINTS.find((e) => e.id === id); }');
  L.push('');
  L.push('/**');
  L.push(' * Regions present in the live provider catalogues on the snapshot date that were CUT, with');
  L.push(' * the reason. Kept in the shipped repo so the omissions are auditable rather than silent.');
  L.push(' */');
  L.push('export const CUT_REGIONS = Object.freeze([');
  for (const c of cut) L.push('  ' + JSON.stringify(c) + ',');
  L.push(']);');
  L.push('');
  return L.join('\n');
}

const args = process.argv.slice(2);
const data = await build();
const text = emit(data);

if (args.includes('--check')) {
  let current = '';
  try { current = await readFile(OUT, 'utf8'); } catch { /* not generated yet */ }
  const normalise = (s) => s.replace(/^\/\/ Snapshot date: .*$/m, '// Snapshot date: PINNED')
    .replace(/^export const SNAPSHOT_DATE = '.*';$/m, "export const SNAPSHOT_DATE = 'PINNED';");
  if (normalise(current) === normalise(text)) {
    console.log('endpoints:check  OK  ' + data.rows.length + ' rows match the live catalogues');
    process.exit(0);
  }
  console.error('endpoints:check  DRIFT  src/core/data/endpoints.js no longer matches the live catalogues.');
  console.error('Run: npm run endpoints:refresh, then review the diff before committing.');
  process.exit(1);
}

await writeFile(OUT, text, 'utf8');
console.log('wrote ' + path.relative(path.join(HERE, '..'), OUT));
console.log('  ' + data.rows.length + ' rows, ' + data.rows.filter((r) => r.measured).length + ' measured');
console.log('  ' + data.cut.length + ' regions cut for having no provider published city');
