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
