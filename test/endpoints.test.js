// The endpoint dataset, its citations, and the INFERRED disclaimer receipt.
// DESIGN 2.2, DESIGN 2.4, DESIGN 3, DESIGN 4 C4, trap 6.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ENDPOINTS, MEASUREMENT_HOSTS, MEASURED_ENDPOINTS, CUT_REGIONS, SNAPSHOT_DATE, endpointById } from '../src/core/data/endpoints.js';
import { SOURCES, SOURCE_IDS, source } from '../src/core/data/sources.js';
import { PROVIDER_COORDINATE_EVIDENCE, REGION_COORDINATE_DISCLAIMER, THIRD_PARTY_PANEL_IN_V1, consentSentence } from '../src/core/data/disclaimers.js';
import { greatCircleKm, assertCoord } from '../src/core/geo.js';
import { WARM_SAMPLE_COUNT, floorMsForDistanceKm } from '../src/core/constants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const design = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'design-worked-values.json'), 'utf8'));

describe('the dataset is complete and internally consistent', () => {
  test('there are rows, and every id is unique', () => {
    assert.ok(ENDPOINTS.length >= 40, 'got only ' + ENDPOINTS.length + ' rows');
    assert.equal(new Set(ENDPOINTS.map((e) => e.id)).size, ENDPOINTS.length);
  });

  test('the snapshot date is a real date, and it is shown in the UI', () => {
    assert.match(SNAPSHOT_DATE, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(SNAPSHOT_DATE)));
  });

  test('every coordinate is valid and quantised to 4 decimals', () => {
    for (const e of ENDPOINTS) {
      assertCoord({ lat: e.lat, lon: e.lon }, e.id);
      assert.equal(Math.round(e.lat * 1e4) / 1e4, e.lat, e.id + ' lat is not quantised');
      assert.equal(Math.round(e.lon * 1e4) / 1e4, e.lon, e.id + ' lon is not quantised');
    }
  });

  test('every row states what the provider actually published as its location basis', () => {
    for (const e of ENDPOINTS) {
      assert.ok(e.locationBasis === 'PROVIDER_NAMED_CITY' || e.locationBasis === 'PROVIDER_NAMED_AREA',
        e.id + ': unknown locationBasis ' + e.locationBasis);
      if (e.locationBasis === 'PROVIDER_NAMED_AREA') {
        assert.ok(typeof e.area === 'string' && e.area.length > 0,
          e.id + ': an area based row must name the area the provider published');
      } else {
        assert.equal(e.area, null, e.id + ': a city named row carries no area');
        // The provider's own published name must actually contain the city we used, otherwise
        // the basis is a claim we cannot support.
        //
        // The city may be disambiguated with a region suffix, as in "Columbus, Ohio", where the
        // provider publishes only "Columbus". The suffix narrows our own label; it never adds a
        // place the provider did not name. So the part before the comma is what has to match.
        const normal = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const cityHead = normal(e.city.split(',')[0].trim());
        assert.ok(normal(e.providerRegionName).includes(cityHead),
          e.id + ': claims PROVIDER_NAMED_CITY but the published name ' + JSON.stringify(e.providerRegionName)
          + ' does not contain the city ' + JSON.stringify(e.city));
      }
    }
  });

  test('every citation resolves to a registered source', () => {
    for (const e of ENDPOINTS) {
      assert.ok(SOURCE_IDS.includes(e.coordinateSourceId), e.id + ': unknown coordinateSourceId');
      assert.ok(SOURCE_IDS.includes(e.catalogueSourceId), e.id + ': unknown catalogueSourceId');
      assert.doesNotThrow(() => source(e.coordinateSourceId));
      assert.doesNotThrow(() => source(e.catalogueSourceId));
    }
  });

  test('every coordinate carries a reference a reader can re-pull', () => {
    for (const e of ENDPOINTS) {
      assert.match(e.coordinateRef, /^Q\d+$/, e.id + ': coordinateRef must be a Wikidata item id');
    }
  });

  test('the cut list is present and explains every omission', () => {
    assert.ok(CUT_REGIONS.length > 0, 'the cut list must be shipped, so the omissions are auditable');
    for (const c of CUT_REGIONS) {
      assert.match(c, /\(.+\)$/, 'every cut entry states its reason: ' + c);
    }
  });

  test('no cut region is also a shipped row', () => {
    const shipped = new Set(ENDPOINTS.map((e) => e.provider + ' ' + e.region));
    for (const c of CUT_REGIONS) {
      const key = c.split('  ')[0];
      assert.ok(!shipped.has(key), key + ' is both shipped and cut');
    }
  });
});

describe('the measured set and the declared hosts agree', () => {
  test('exactly the rows flagged measured carry a host, and vice versa', () => {
    for (const e of ENDPOINTS) {
      if (e.measured) assert.ok(typeof e.measurementHost === 'string' && e.measurementHost.length > 0, e.id);
      else assert.equal(e.measurementHost, null, e.id + ' is not measured but carries a host');
    }
  });

  test('MEASUREMENT_HOSTS is exactly the set of hosts on measured rows', () => {
    const fromRows = [...new Set(MEASURED_ENDPOINTS.map((e) => e.measurementHost))].sort();
    assert.deepEqual([...MEASUREMENT_HOSTS].sort(), fromRows);
  });

  test('there are 12 measured endpoints, as DESIGN 5 states', () => {
    assert.equal(MEASURED_ENDPOINTS.length, 12);
  });

  test('every host is a plain hostname with no scheme, port or path', () => {
    for (const h of MEASUREMENT_HOSTS) {
      assert.match(h, /^[a-z0-9.-]+$/, h + ' must be a bare hostname so it can be a CSP literal');
      assert.ok(!h.includes('*'), h + ': a wildcard cannot satisfy a set equality check against the CSP');
    }
  });

  test('the measured set spans the globe rather than clustering', () => {
    // A measurement set that is all in one hemisphere cannot produce a meaningful access
    // baseline for a visitor on the other side of the planet.
    const lats = MEASURED_ENDPOINTS.map((e) => e.lat);
    const lons = MEASURED_ENDPOINTS.map((e) => e.lon);
    assert.ok(Math.max(...lats) - Math.min(...lats) > 80, 'latitude spread too narrow');
    assert.ok(Math.max(...lons) - Math.min(...lons) > 200, 'longitude spread too narrow');
    assert.ok(MEASURED_ENDPOINTS.some((e) => e.lat < 0), 'no southern hemisphere endpoint');
    assert.ok(MEASURED_ENDPOINTS.some((e) => e.lon < -40), 'no western endpoint');
    assert.ok(MEASURED_ENDPOINTS.some((e) => e.lon > 100), 'no far eastern endpoint');
  });
});

describe('the shipped coordinates against the design worked values', () => {
  /** @type {Record<string,string>} */
  const designToShipped = {
    'us-east-1': 'aws:us-east-1',
    'eu-central-1': 'aws:eu-central-1',
    'sa-east-1': 'aws:sa-east-1',
    'ap-northeast-1': 'aws:ap-northeast-1',
    'ap-south-1': 'aws:ap-south-1',
    'ap-southeast-2': 'aws:ap-southeast-2',
  };

  for (const row of design.appendixB.rows) {
    const shippedId = designToShipped[row.region];
    const isTokyo = row.region === 'ap-northeast-1';

    test('shipped ' + shippedId + ' sits within ' + row.separationBoundKm + ' km of the design coordinate'
      + (isTokyo ? ', the documented Tokyo delta' : ''), () => {
      const e = endpointById(shippedId);
      assert.ok(e, shippedId + ' is not in the shipped table');
      // Measured point to point, so it holds from EVERY observer: by the triangle inequality a
      // distance from anywhere to the two points differs by at most their separation. Tokyo is
      // the one row where the shipped Wikidata coordinate differs materially from the one the
      // design author used. The bound is hard rather than waved at, so it cannot silently grow.
      const apart = greatCircleKm({ lat: e.lat, lon: e.lon }, { lat: row.lat, lon: row.lon });
      assert.ok(apart <= row.separationBoundKm,
        shippedId + ': shipped coordinate is ' + apart.toFixed(3) + ' km from the design one, '
        + 'over the bound of ' + row.separationBoundKm + ' km');
      if (!isTokyo) assert.ok(row.separationBoundKm <= 0.5, 'only Tokyo carries a wider bound');
    });
  }

  test('the Tokyo delta is exactly the one the fixture documents, and it is bounded from any observer', () => {
    const e = endpointById('aws:ap-northeast-1');
    const designRow = design.appendixB.rows.find((r) => r.region === 'ap-northeast-1');

    // The shipped coordinate is the one the fixture says it is.
    assert.equal(e.lat, designRow.shippedCoordinate.lat);
    assert.equal(e.lon, designRow.shippedCoordinate.lon);
    assert.equal(e.coordinateRef, designRow.shippedCoordinate.wikidata);

    // How far apart the two points are, pinned.
    const apart = greatCircleKm({ lat: e.lat, lon: e.lon }, { lat: designRow.lat, lon: designRow.lon });
    assert.ok(Math.abs(apart - designRow.shippedPointSeparationKm) < 0.01,
      'point separation is ' + apart.toFixed(3) + ' km, fixture records '
      + designRow.shippedPointSeparationKm + ' km');

    // What that can do to a floor, from ANY observer: at most the separation's own floor, which
    // the note states as under 0.04 ms.
    assert.ok(floorMsForDistanceKm(apart) < 0.04, 'floor bound ' + floorMsForDistanceKm(apart) + ' ms');

    // And the thing that actually matters: from every bundled city centre, which is every point
    // a reader can pick, it disappears at display precision or moves the floor by one rounding.
    for (const from of ENDPOINTS) {
      const a = floorMsForDistanceKm(greatCircleKm(from, { lat: e.lat, lon: e.lon }));
      const b = floorMsForDistanceKm(greatCircleKm(from, { lat: designRow.lat, lon: designRow.lon }));
      assert.ok(Math.abs(a - b) < 0.04, from.id + ': the two Tokyo coordinates differ by ' + Math.abs(a - b) + ' ms of floor');
    }

    assert.ok(typeof designRow.coordinateNote === 'string' && designRow.coordinateNote.length > 200,
      'the delta must stay documented in the fixture');
  });
});

describe('the INFERRED disclaimer, and its recomputable receipt', () => {
  test('the disclaimer says city, not building, in words', () => {
    assert.match(REGION_COORDINATE_DISCLAIMER, /not a building/i);
    assert.match(REGION_COORDINATE_DISCLAIMER, /city/i);
  });

  test('the published provider coordinate really is 275.6 km from the comparison place', () => {
    // This is the receipt that replaced an unverifiable quotation. It is recomputed here with
    // the same haversine the product uses everywhere else, so it cannot rot into a claim.
    const ev = PROVIDER_COORDINATE_EVIDENCE;
    const km = greatCircleKm(
      { lat: ev.publishedLatitude, lon: ev.publishedLongitude },
      { lat: ev.comparisonLatitude, lon: ev.comparisonLongitude },
    );
    assert.ok(
      Math.abs(km - ev.separationKmPublished) < 0.05,
      'the published separation is ' + ev.separationKmPublished + ' km but recomputes to '
      + km.toFixed(2) + ' km. Fix the number, do not widen the tolerance.',
    );
    assert.ok(ev.sentence.includes(String(ev.separationKmPublished)),
      'the sentence shown on screen must quote the number this test just recomputed');
  });

  test('the comparison coordinate is the one the shipped us-east-1 row uses', () => {
    const e = endpointById('aws:us-east-1');
    assert.equal(PROVIDER_COORDINATE_EVIDENCE.comparisonLatitude, e.lat);
    assert.equal(PROVIDER_COORDINATE_EVIDENCE.comparisonLongitude, e.lon);
  });

  test('every quoted provider location value is a place, not a street address', () => {
    const all = [
      PROVIDER_COORDINATE_EVIDENCE.publishedPhysicalLocation,
      ...PROVIDER_COORDINATE_EVIDENCE.otherPublishedPhysicalLocations.map((o) => o.physicalLocation),
    ];
    assert.ok(all.length >= 5, 'the point needs more than one example to stand on');
    for (const v of all) {
      assert.ok(!/\d/.test(v), 'a quoted physical location contains a digit, which would suggest '
        + 'a street address rather than an area: ' + v);
    }
  });

  test('the sources cited by the disclaimer are registered', () => {
    assert.doesNotThrow(() => source(PROVIDER_COORDINATE_EVIDENCE.publishedLatitudeSourceId));
    assert.doesNotThrow(() => source(PROVIDER_COORDINATE_EVIDENCE.publishedPhysicalLocationSourceId));
  });

  test('the third party measured panel is OUT of V1', () => {
    // DESIGN C5 is cut from V1. The flag exists so that whoever builds it later cannot build
    // it without also shipping its honesty label.
    assert.equal(THIRD_PARTY_PANEL_IN_V1, false);
  });

  test('the consent sentence names the exact request count and endpoint count before any click', () => {
    const s = consentSentence(MEASURED_ENDPOINTS.length, WARM_SAMPLE_COUNT);
    assert.ok(s.includes(String(WARM_SAMPLE_COUNT)), 'the sample count must be printed');
    assert.ok(s.includes(String(MEASURED_ENDPOINTS.length)), 'the endpoint count must be printed');
    assert.match(s, /Nothing is uploaded/);
    assert.match(s, /Nothing is stored/);
  });
});

describe('the source registry', () => {
  test('every source states its licence, its attribution and what was taken', () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      assert.equal(s.id, id, 'source key and id disagree for ' + id);
      for (const k of ['title', 'url', 'licence', 'attribution', 'takes']) {
        assert.ok(typeof s[k] === 'string' && s[k].length > 10, id + '.' + k + ' is missing or too short');
      }
      assert.match(s.url, /^https:\/\//, id + '.url must be https');
    }
  });

  test('a retrieved date is either a real date or explicitly null for a definition', () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      if (s.retrieved === null) continue;
      assert.match(s.retrieved, /^\d{4}-\d{2}-\d{2}$/, id + '.retrieved');
      assert.ok(!Number.isNaN(Date.parse(s.retrieved)), id + '.retrieved is not a real date');
    }
  });

  test('an unknown source id is refused rather than rendered as an empty citation', () => {
    assert.throws(() => source('nope'), /unknown source id/);
  });

  test('no copyleft licence is named anywhere in the registry', () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      assert.ok(!/\b(GPL|AGPL|LGPL|MPL)\b/i.test(s.licence + ' ' + s.attribution + ' ' + s.takes),
        id + ' names a copyleft licence');
    }
  });
});
