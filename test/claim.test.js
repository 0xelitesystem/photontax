// The claim badge system. DESIGN 2.
//
// These tests are not about formatting. They are about whether it is POSSIBLE, by any route a
// tired person might take at 2am, to get a number in front of a reader without its badge. Each
// test names the route it closes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MEASURED, REPORTED, COMPUTED, INFERRED,
  BADGE_KINDS, BADGE_SPEC, METHODS, UNITS,
  measured, reported, computed, inferred,
  isClaim, assertClaim, renderClaim, renderClaimText, claimToJSON,
} from '../src/core/claim.js';
import { scanVocabulary } from '../src/core/vocabulary.js';

const aMeasured = () => measured(251.45, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP);
const aComputed = () => computed(12923.9, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 0 });

describe('the four badge kinds, and only four', () => {
  test('there are exactly four', () => {
    assert.deepEqual([...BADGE_KINDS], [MEASURED, REPORTED, COMPUTED, INFERRED]);
    assert.equal(BADGE_KINDS.length, 4);
    assert.equal(Object.keys(BADGE_SPEC).length, 4);
  });

  test('each kind has a DISTINCT SHAPE, so colour is never the carrier (trap 19)', () => {
    const shapes = BADGE_KINDS.map((k) => BADGE_SPEC[k].shape);
    assert.equal(new Set(shapes).size, 4, 'two badges share a shape: ' + shapes.join(', '));
    const glyphs = BADGE_KINDS.map((k) => BADGE_SPEC[k].glyph);
    assert.equal(new Set(glyphs).size, 4, 'two badges share a glyph');
    const labels = BADGE_KINDS.map((k) => BADGE_SPEC[k].label);
    assert.equal(new Set(labels).size, 4, 'two badges share a label');
  });

  test('the spec is frozen, so a caller cannot repoint a badge at another shape', () => {
    assert.throws(() => { BADGE_SPEC[MEASURED].shape = 'diamond'; }, TypeError);
    assert.equal(BADGE_SPEC[MEASURED].shape, 'circle');
  });
});

describe('a Claim cannot be built without stating how the value was obtained', () => {
  test('an unregistered method is refused', () => {
    assert.throws(() => measured(1, UNITS.MS, 'we just kind of know'), /METHODS registry/);
  });

  test('a method belonging to another tier is refused', () => {
    // This is the exact mistake DESIGN 2 bans: claiming to measure what is inferred.
    assert.throws(
      () => measured(1, UNITS.KM, METHODS.REGION_CITY_CENTRE),
      /belongs to the INFERRED tier/,
    );
    assert.throws(
      () => computed(1, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP),
      /belongs to the MEASURED tier/,
    );
    assert.throws(
      () => inferred(1, UNITS.MS, METHODS.FIBRE_FLOOR, { note: 'x' }),
      /belongs to the COMPUTED tier/,
    );
  });

  test('an INFERRED claim without a stated assumption is refused', () => {
    assert.throws(
      () => inferred(1.13, UNITS.RATIO, METHODS.ROUTE_ADJUSTED_FLOOR, {}),
      /must carry a note stating its assumption/,
    );
    assert.throws(
      () => inferred(1.13, UNITS.RATIO, METHODS.ROUTE_ADJUSTED_FLOOR, { note: '   ' }),
      /must carry a note stating its assumption/,
    );
    const ok = inferred(1.13, UNITS.RATIO, METHODS.ROUTE_ADJUSTED_FLOOR, {
      note: 'A rule of thumb from a dataset this tool does not ship.',
    });
    assert.ok(isClaim(ok));
  });

  test('a non finite value is refused rather than rendered as NaN', () => {
    assert.throws(() => measured(NaN, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP), /must be finite/);
    assert.throws(() => measured(Infinity, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP), /must be finite/);
  });

  test('an unregistered unit is refused', () => {
    assert.throws(() => measured(1, 'furlongs', METHODS.WARM_HTTPS_ROUND_TRIP), /one of UNITS/);
  });

  test('no method string uses either short name for a network layer round trip (trap 4)', () => {
    for (const [name, text] of Object.entries(METHODS)) {
      assert.ok(!/\bpings?\b/i.test(text), 'METHODS.' + name + ' uses a banned term');
      assert.ok(!/\bRTT\b/.test(text), 'METHODS.' + name + ' uses a banned term');
      assert.ok(!/\bhops?\b/i.test(text), 'METHODS.' + name + ' uses a banned term');
      assert.ok(!/[–—]/.test(text), 'METHODS.' + name + ' contains a dash character');
    }
  });

  test('the measured round trip method states what the number actually contains', () => {
    const m = METHODS.WARM_HTTPS_ROUND_TRIP;
    assert.match(m, /warm HTTPS round trip/i);
    assert.match(m, /transport/i);
    assert.match(m, /TLS/);
    assert.match(m, /server think time/i);
    assert.match(m, /minimum of 7/);
  });
});

describe('a Claim cannot be turned into text without its badge', () => {
  test('template interpolation throws', () => {
    const c = aMeasured();
    assert.throws(() => `${c}`, /cannot be turned into text implicitly/);
  });

  test('string concatenation throws', () => {
    const c = aMeasured();
    assert.throws(() => c + '', /cannot be turned into text implicitly/);
  });

  test('String() throws', () => {
    assert.throws(() => String(aMeasured()), /cannot be turned into text implicitly/);
  });

  test('implicit numeric coercion throws, so a Claim cannot be silently used as a number', () => {
    const c = aMeasured();
    assert.throws(() => Number(c), /cannot be turned into text implicitly/);
    assert.throws(() => c * 2, /cannot be turned into text implicitly/);
  });

  test('JSON.stringify throws, so a view model cannot be dumped into bare numbers', () => {
    assert.throws(() => JSON.stringify({ row: aMeasured() }), /cannot be turned into text implicitly/);
  });

  test('assigning a Claim to a DOM textContent would therefore throw at the assignment', () => {
    // Simulating the exact shape of the mistake: a node whose textContent setter coerces.
    const fakeNode = {
      _t: '',
      set textContent(v) { this._t = String(v); },
      get textContent() { return this._t; },
    };
    assert.throws(() => { fakeNode.textContent = aMeasured(); }, /cannot be turned into text implicitly/);
  });

  test('claimToJSON is the explicit, deliberate way out', () => {
    const j = claimToJSON(aMeasured());
    assert.equal(j.value, 251.45);
    assert.equal(j.badge, MEASURED);
    assert.equal(j.unit, UNITS.MS);
    assert.equal(j.method, METHODS.WARM_HTTPS_ROUND_TRIP);
  });
});

describe('a Claim cannot be forged', () => {
  test('an object of the right shape is not a Claim', () => {
    const lookAlike = {
      value: 0.1, unit: 'ms', badge: MEASURED, method: METHODS.WARM_HTTPS_ROUND_TRIP,
      sourceId: null, decimals: null, note: null,
    };
    assert.equal(isClaim(lookAlike), false);
    assert.throws(() => renderClaim(lookAlike), /expected a Claim/);
  });

  test('a bare number is not a Claim', () => {
    assert.equal(isClaim(251), false);
    assert.equal(isClaim('251 ms'), false);
    assert.equal(isClaim(null), false);
    assert.throws(() => assertClaim(251, 'row.route'), /row\.route: expected a Claim/);
  });

  test('a real Claim is frozen', () => {
    const c = aMeasured();
    assert.ok(Object.isFrozen(c));
    assert.throws(() => { /** @type {any} */ (c).badge = COMPUTED; }, TypeError);
  });
});

describe('rendering always carries the badge', () => {
  test('the rendered text contains the badge label', () => {
    const r = renderClaim(aMeasured());
    assert.match(r.text, /\[MEASURED\]/);
    assert.equal(r.badge, MEASURED);
    assert.equal(r.badgeShape, 'circle');
  });

  test('every render path includes the badge, and there is no path that omits it', () => {
    for (const build of [
      () => measured(9.2, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP),
      () => reported('IAD', UNITS.TEXT, METHODS.CLOUDFLARE_COLO),
      () => computed(126.59, UNITS.MS, METHODS.FIBRE_FLOOR),
      () => inferred(1.13, UNITS.RATIO, METHODS.ROUTE_ADJUSTED_FLOOR, { note: 'A rule of thumb.' }),
    ]) {
      const c = build();
      const r = renderClaim(c);
      assert.match(r.text, new RegExp('\\[' + r.badgeLabel + '\\]'));
      assert.equal(renderClaimText(c), r.text);
      assert.ok(r.a11yLabel.includes(r.badgeLabel), 'the screen reader label must carry the badge too');
      assert.ok(r.a11yLabel.includes(c.method.slice(0, 20)), 'the screen reader label must carry the method');
      assert.equal(r.dataAttrs['data-claim-badge'], c.badge);
    }
  });

  test('milliseconds are always whole, never a decimal (trap 9)', () => {
    assert.equal(renderClaim(measured(9.2, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP)).valueText, '9 ms');
    assert.equal(renderClaim(measured(251.45, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP)).valueText, '251 ms');
    assert.equal(renderClaim(computed(0.8103, UNITS.MS, METHODS.FIBRE_FLOOR)).valueText, '1 ms');
    // Even asking for decimals cannot produce a sub millisecond figure.
    assert.equal(renderClaim(computed(0.8103, UNITS.MS, METHODS.FIBRE_FLOOR, { decimals: 4 })).valueText, '1 ms');
  });

  test('full precision stays on the Claim for the arithmetic, only the display is rounded', () => {
    const c = measured(251.4567, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP);
    assert.equal(c.value, 251.4567);
    assert.equal(renderClaim(c).valueText, '251 ms');
  });

  test('a ratio renders with its x suffix, at the decimals asked for', () => {
    const c = computed(1.9238, UNITS.RATIO, METHODS.ROUTE_RATIO, { decimals: 2 });
    assert.equal(renderClaim(c).valueText, '1.92x');
  });

  test('the rendered object is frozen, so a consumer cannot strip the badge off it', () => {
    const r = renderClaim(aComputed());
    assert.ok(Object.isFrozen(r));
    assert.throws(() => { /** @type {any} */ (r).text = '12924'; }, TypeError);
  });

  test('an INFERRED render carries its assumption note through to the screen reader label', () => {
    // A deliberately distinctive note, so the index comparison below cannot accidentally match
    // the method text instead of the note.
    const note = 'ASSUMPTION: this region coordinate is a city centre.';
    const r = renderClaim(inferred(126.59, UNITS.MS, METHODS.REGION_CITY_CENTRE, { note }));
    assert.equal(r.note, note);
    assert.ok(r.a11yLabel.includes(note), 'the assumption must reach the screen reader label too');
    assert.ok(r.a11yLabel.includes(r.method), 'the method must reach the screen reader label too');
    assert.ok(
      r.a11yLabel.indexOf(note) < r.a11yLabel.indexOf(r.method),
      'DESIGN 2.4 puts the assumption BEFORE the method and the number, for a screen reader as '
      + 'much as for a sighted reader. Got: ' + r.a11yLabel.slice(0, 120),
    );
  });
});

/* ============================================================================================
 * v0.2: the connection phase methods the command line reads from its own socket events.
 * Appended to the registry, never inserted, and each bound to exactly one tier.
 * ========================================================================================== */

describe('the v0.2 connection phase methods', () => {
  const PHASES = [
    ['DNS_LOOKUP_TIME', MEASURED, UNITS.MS],
    ['TCP_CONNECT_TIME', MEASURED, UNITS.MS],
    ['TLS_HANDSHAKE_TIME', MEASURED, UNITS.MS],
    ['CONNECTED_ADDRESS', REPORTED, UNITS.TEXT],
    ['TLS_VERSION', REPORTED, UNITS.TEXT],
  ];
  const build = { [MEASURED]: measured, [REPORTED]: reported, [COMPUTED]: computed };

  test('the v0.1 entries are untouched and still first, in their original order', () => {
    // Appending is the only permitted change to a shared core registry. A reorder or a rename
    // here would silently change what every existing page figure says about itself.
    assert.deepEqual(Object.keys(METHODS).slice(0, 16), [
      'WARM_HTTPS_ROUND_TRIP', 'ACCESS_BASELINE', 'ROUTE_SURPLUS', 'SAMPLE_SPREAD',
      'CLOUDFLARE_COLO', 'CLOUDFLARE_CLIENT_IP', 'PROVIDER_REGION_CATALOGUE',
      'GREAT_CIRCLE_HAVERSINE', 'FIBRE_SPEED', 'FIBRE_FLOOR', 'ROUTE_RATIO', 'VERDICT_FROM_RATIO',
      'REQUEST_PLAN', 'WEIGHTED_MEAN_FLOOR', 'REGION_CITY_CENTRE', 'ROUTE_ADJUSTED_FLOOR',
    ]);
    assert.ok(Object.isFrozen(METHODS));
  });

  for (const [name, tier, unit] of PHASES) {
    test(name + ' is registered, and only the ' + tier + ' tier may carry it', () => {
      const method = METHODS[name];
      assert.equal(typeof method, 'string', name + ' is missing from METHODS');
      const value = unit === UNITS.MS ? 12.4 : 'TLSv1.3';
      const c = build[tier](value, unit, method);
      assert.equal(c.badge, tier);
      assert.ok(renderClaimText(c).endsWith(' [' + tier + ']'), renderClaimText(c));
      for (const other of [MEASURED, REPORTED, COMPUTED]) {
        if (other === tier) continue;
        assert.throws(() => build[other](value, unit, method), new RegExp('belongs to the ' + tier + ' tier'));
      }
      assert.throws(() => inferred(value, unit, method, { note: 'x' }), new RegExp('belongs to the ' + tier + ' tier'));
    });
  }

  test('every phase method passes the shipped vocabulary scanner, not only the local regexes', () => {
    for (const [name] of PHASES) {
      assert.deepEqual(scanVocabulary(METHODS[name]).map((h) => h.ruleId), [], name);
    }
  });

  test('a phase figure is one sample and says so, and the timed ones are whole milliseconds', () => {
    for (const name of ['DNS_LOOKUP_TIME', 'TCP_CONNECT_TIME', 'TLS_HANDSHAKE_TIME']) {
      assert.match(METHODS[name], /One sample\./, name);
      assert.match(METHODS[name], /warm up/, name);
      assert.equal(renderClaim(measured(12.4, UNITS.MS, METHODS[name])).valueText, '12 ms');
    }
  });

  test('each method states the boundary a reader would otherwise assume wrongly', () => {
    assert.match(METHODS.DNS_LOOKUP_TIME, /may answer from its own cache/);
    assert.match(METHODS.TCP_CONNECT_TIME, /^TCP connect time\./);
    assert.match(METHODS.TCP_CONNECT_TIME, /last connection attempt/);
    assert.match(METHODS.TCP_CONNECT_TIME, /failed first are excluded and counted/);
    assert.match(METHODS.TCP_CONNECT_TIME, /no TLS, no request and no server think time/);
    assert.match(METHODS.TLS_HANDSHAKE_TIME, /TCP connection being established/);
    assert.match(METHODS.CONNECTED_ADDRESS, /never placed on a map/);
    assert.match(METHODS.TLS_VERSION, /the server chose/);
  });

  test('a phase figure is never labelled as the warm HTTPS round trip, and the reverse', () => {
    for (const [name] of PHASES) assert.doesNotMatch(METHODS[name], /warm HTTPS round trip/i, name);
    assert.doesNotMatch(METHODS.WARM_HTTPS_ROUND_TRIP, /TCP connect/i);
  });
});

describe('the capture fixture methods', () => {
  const FIXTURE = [
    ['FIXTURE_TCP_CONNECT', MEASURED],
    ['FIXTURE_ACCESS_BASELINE', MEASURED],
    ['FIXTURE_ROUTE_SURPLUS', MEASURED],
    ['FIXTURE_ROUTE_RATIO', COMPUTED],
  ];

  for (const [name, tier] of FIXTURE) {
    test(name + ' is registered in the ' + tier + ' tier and passes the vocabulary scanner', () => {
      const method = METHODS[name];
      assert.equal(typeof method, 'string');
      const unit = tier === COMPUTED ? UNITS.RATIO : UNITS.MS;
      const c = tier === COMPUTED ? computed(1.92, unit, method, { decimals: 2 }) : measured(9.2, unit, method);
      assert.equal(c.badge, tier);
      assert.throws(() => (tier === COMPUTED ? measured : computed)(1, unit, method), /belongs to the/);
      assert.deepEqual(scanVocabulary(method).map((h) => h.ruleId), []);
      assert.match(method, /TCP connect time/, 'each names the quantity it was derived from');
      assert.doesNotMatch(method, /warm HTTPS/i);
    });
  }

  test('the recorded figure says whose it is, what it holds and what it does not', () => {
    const m = METHODS.FIXTURE_TCP_CONNECT;
    assert.match(m, /minimum of five/);
    assert.match(m, /recorded once from a machine in Virginia/);
    assert.match(m, /not a measurement of your connection/);
    assert.match(m, /no TLS, no request and no server think time/);
    assert.match(METHODS.FIXTURE_ACCESS_BASELINE, /not yours/);
  });
});

describe('the command line plan and receipt methods', () => {
  const PLAN = [
    ['CLI_REQUEST_PLAN', COMPUTED],
    ['REQUEST_TIME_LIMIT', COMPUTED],
    ['WORST_CASE_WALL_TIME', COMPUTED],
    ['REQUESTS_MADE', MEASURED],
    ['FAILED_CONNECTION_ATTEMPTS', MEASURED],
    ['ENDPOINTS_AT_ONCE', COMPUTED],
  ];
  const build = { [MEASURED]: measured, [COMPUTED]: computed };

  test('they come after every earlier entry, so nothing the page labels has moved', () => {
    const keys = Object.keys(METHODS);
    const first = keys.indexOf('CLI_REQUEST_PLAN');
    assert.ok(first > keys.indexOf('FIXTURE_ROUTE_RATIO'));
    assert.deepEqual(keys.slice(first), PLAN.map(([k]) => k));
  });

  for (const [name, tier] of PLAN) {
    test(name + ' is registered in the ' + tier + ' tier only and passes the vocabulary scanner', () => {
      const method = METHODS[name];
      assert.equal(typeof method, 'string', name + ' is missing from METHODS');
      const unit = name === 'REQUEST_TIME_LIMIT' || name === 'WORST_CASE_WALL_TIME' ? UNITS.MS : UNITS.UNITLESS;
      const c = build[tier](96, unit, method);
      assert.equal(c.badge, tier);
      assert.ok(renderClaimText(c).endsWith(' [' + tier + ']'));
      for (const other of [MEASURED, REPORTED, COMPUTED]) {
        if (other === tier) continue;
        const make = other === REPORTED ? reported : build[other];
        assert.throws(() => make(96, unit, method), new RegExp('belongs to the ' + tier + ' tier'));
      }
      assert.deepEqual(scanVocabulary(method).map((h) => h.ruleId), [], name);
    });
  }

  test('the plan says it is the larger count, and that the facility endpoint is never asked', () => {
    assert.match(METHODS.CLI_REQUEST_PLAN, /warm up requests included/);
    assert.match(METHODS.CLI_REQUEST_PLAN, /larger figure rather than the flattering one/);
    assert.match(METHODS.CLI_REQUEST_PLAN, /never asks the facility endpoint/);
    assert.doesNotMatch(METHODS.CLI_REQUEST_PLAN, /pressing the button/,
      'a terminal has no button; the page entry REQUEST_PLAN keeps that wording');
  });

  test('the receipts say what they count and what they leave out', () => {
    assert.match(METHODS.REQUEST_TIME_LIMIT, /never retried/);
    assert.match(METHODS.WORST_CASE_WALL_TIME, /rounded up/);
    assert.match(METHODS.REQUESTS_MADE, /still counted/);
    assert.match(METHODS.REQUESTS_MADE, /fewer than planned/);
    assert.match(METHODS.FAILED_CONNECTION_ATTEMPTS, /excluded\s+from the TCP connect time/);
    assert.match(METHODS.ENDPOINTS_AT_ONCE, /never overlap/);
  });
});
