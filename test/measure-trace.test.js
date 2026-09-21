// The reported connection, the observer point, and the honest handling of a proxy or a VPN.
// DESIGN 2.2, 2.4, 3, traps 7 and 13.
//
// The body used here is the shape of a real response from the public facility endpoint, read
// live on 2026-09-21 with the address removed. The live headers are recorded in the internal
// validation folder: HTTP 200, Access-Control-Allow-Origin: *, and no credential of any kind
// required, which are the two properties that make the call usable from a page at all.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { assertObserver } from '../src/core/contracts/measurement.js';
import { parseTrace, readReportedConnection, noticesForTrace } from '../src/measure/trace.js';
import { resolveObserver } from '../src/measure/observer.js';
import { COLO_SITES, assertColoSite, coloSiteFor } from '../src/measure/colo-sites.js';
import { RUN_NOTICES } from '../src/measure/reasons.js';

const LIVE_BODY = [
  'fl=572f71',
  'h=www.cloudflare.com',
  'ip=203.0.113.9',
  'ts=1789988085.000',
  'visit_scheme=https',
  'uag=Mozilla/5.0',
  'colo=IAD',
  'sliver=050-tier1',
  'http=http/1.1',
  'loc=US',
  'tls=TLSv1.2',
  'sni=plaintext',
  'warp=off',
  'gateway=off',
  'rbi=off',
  'kex=X25519',
  '',
].join('\n');

const respond = (body, ok = true) => () => Promise.resolve({ ok, text: async () => body });

describe('parsing the reported connection', () => {
  test('reads the fields this product uses out of a real response body', () => {
    const f = parseTrace(LIVE_BODY);
    assert.equal(f.colo, 'IAD');
    assert.equal(f.loc, 'US');
    assert.equal(f.warp, 'off');
    assert.equal(f.gateway, 'off');
    assert.equal(f.rbi, 'off');
  });

  test('a value containing an equals sign survives intact', () => {
    const f = parseTrace('kex=X25519\nuag=Mozilla/5.0 (a=b)\n');
    assert.equal(f.uag, 'Mozilla/5.0 (a=b)');
  });

  test('a malformed line is ignored rather than producing a field with no value', () => {
    const f = parseTrace('colo=IAD\ngarbage\n=novalue\n\n');
    assert.equal(f.colo, 'IAD');
    assert.equal('garbage' in f, false);
    assert.equal('' in f, false);
  });

  test('an absent field is absent, never defaulted into a fact about someone else network', () => {
    const f = parseTrace('colo=LHR\n');
    assert.equal(f.loc, undefined);
    assert.equal(f.warp, undefined);
  });
});

describe('reading the reported connection', () => {
  test('a good response becomes a reported connection', async () => {
    const t = await readReportedConnection({ fetchTrace: respond(LIVE_BODY) });
    assert.equal(t.ok, true);
    assert.equal(t.colo, 'IAD');
    assert.equal(t.loc, 'US');
    assert.equal(t.warp, 'off');
  });

  test('the address is available to be shown once and is not part of any run', async () => {
    // DESIGN 2.2 permits displaying it, because the far end observed it. The measurement
    // contract has no field for it, so it cannot reach a fixture or a screenshot through a run.
    const t = await readReportedConnection({ fetchTrace: respond(LIVE_BODY) });
    assert.equal(t.ip, '203.0.113.9');
    const run = { observer: { lat: 1, lon: 2 } };
    assert.equal(JSON.stringify(run).includes('203.0.113.9'), false);
  });

  test('a non 200 response degrades to a stated outcome, not to a guess', async () => {
    const t = await readReportedConnection({ fetchTrace: respond('', false) });
    assert.equal(t.ok, false);
    assert.equal(t.reason, RUN_NOTICES.TRACE_UNAVAILABLE);
  });

  test('a rejected request degrades the same way', async () => {
    const t = await readReportedConnection({ fetchTrace: () => Promise.reject(new TypeError('Failed to fetch')) });
    assert.equal(t.ok, false);
    assert.equal(t.reason, RUN_NOTICES.TRACE_UNAVAILABLE);
  });

  test('a response with no facility field is treated as no answer', async () => {
    const t = await readReportedConnection({ fetchTrace: respond('loc=US\nwarp=off\n') });
    assert.equal(t.ok, false);
  });

  test('the degraded sentence asks for a city instead of looking the reader up', () => {
    const s = RUN_NOTICES.TRACE_UNAVAILABLE;
    assert.ok(s.includes('Choose your city'));
    assert.ok(s.includes('does not look your address up'));
  });
});

describe('a proxy, a VPN, and an isolated browser', () => {
  const traceWith = (over) => ({ ok: true, colo: 'IAD', loc: 'US', warp: 'off', gateway: 'off', rbi: 'off', ip: null, ...over });

  test('with no tunnel reported, the page states what that does and does not mean', () => {
    const n = noticesForTrace(traceWith({}));
    assert.equal(n.length, 1);
    assert.equal(n[0].id, 'NO_TUNNEL_REPORTED');
    assert.equal(n[0].badge, 'REPORTED');
    assert.ok(n[0].text.includes('cannot report a VPN'),
      'absence of a Cloudflare tunnel is not absence of a tunnel, and the sentence has to say so');
    assert.ok(n[0].text.includes('does not guess'));
    assert.equal(n[0].suppressesResults, false);
  });

  test('the no tunnel sentence explains where an unknown proxy cost actually lands', () => {
    const s = RUN_NOTICES.NO_TUNNEL_REPORTED;
    assert.ok(s.includes('access baseline'),
      'the honest answer to an undetectable proxy is that its fixed cost is inside the measured '
      + 'baseline, which is the reason that baseline is measured rather than assumed');
  });

  test('a reported tunnel is named, and the facility is described as where it comes out', () => {
    const n = noticesForTrace(traceWith({ warp: 'on' }));
    assert.deepEqual(n.map((x) => x.id), ['WARP_TUNNEL']);
    assert.ok(n[0].text.includes('where the tunnel comes out'));
    assert.equal(n[0].suppressesResults, false);
  });

  test('a managed corporate proxy is named as one', () => {
    const n = noticesForTrace(traceWith({ gateway: 'on' }));
    assert.deepEqual(n.map((x) => x.id), ['GATEWAY_PROXY']);
  });

  test('a remotely isolated browser suppresses the results, because they describe a data centre', () => {
    const n = noticesForTrace(traceWith({ rbi: 'on' }));
    const rbi = n.find((x) => x.id === 'REMOTE_BROWSER');
    assert.ok(rbi);
    assert.equal(rbi.suppressesResults, true);
    assert.ok(rbi.text.includes('running in a data centre'));
  });

  test('several tunnels at once are all named, and none is swallowed by another', () => {
    const n = noticesForTrace(traceWith({ warp: 'on', gateway: 'on', rbi: 'on' }));
    assert.deepEqual(n.map((x) => x.id).sort(), ['GATEWAY_PROXY', 'REMOTE_BROWSER', 'WARP_TUNNEL']);
    assert.equal(n.some((x) => x.id === 'NO_TUNNEL_REPORTED'), false);
  });

  test('an unreadable flag is not read as a denial', () => {
    const n = noticesForTrace(traceWith({ warp: 'unknown', gateway: 'unknown', rbi: 'unknown' }));
    assert.deepEqual(n.map((x) => x.id), ['NO_TUNNEL_REPORTED'],
      'an unknown flag says nothing, and the sentence that fires already refuses to claim more');
  });

  test('no answer at all produces the stated unavailable notice and nothing else', () => {
    const n = noticesForTrace({ ok: false, reason: RUN_NOTICES.TRACE_UNAVAILABLE });
    assert.deepEqual(n.map((x) => x.id), ['TRACE_UNAVAILABLE']);
  });
});

describe('the facility coordinate registry', () => {
  test('it ships empty, and that is a decision with a receipt rather than an oversight', () => {
    assert.deepEqual([...COLO_SITES], []);
    assert.equal(coloSiteFor('IAD'), undefined);
  });

  test('a row without a citation is refused, so the empty table cannot be filled in carelessly', () => {
    assert.throws(() => assertColoSite({ colo: 'IAD', label: 'Somewhere', lat: 39, lon: -77 }),
      /source it came from/);
    assert.throws(() => assertColoSite({ colo: 'iad', label: 'x', lat: 0, lon: 0, sourceId: 's', sourceRef: 'r' }),
      /three letter upper case/);
    assert.doesNotThrow(() => assertColoSite({
      colo: 'IAD', label: 'Ashburn, Virginia', lat: 39.0437, lon: -77.4875,
      sourceId: 'wikidata_coordinates', sourceRef: 'Q1000000',
    }));
  });
});

describe('resolving the observer point', () => {
  const okTrace = { ok: true, colo: 'IAD', loc: 'US', warp: 'off', gateway: 'off', rbi: 'off', ip: null };
  const city = { lat: 38.30, lon: -77.46, label: 'Fredericksburg, Virginia' };

  test('with a cited facility coordinate, the observer is REPORTED', () => {
    const sites = [{
      colo: 'IAD', label: 'Ashburn, Virginia', lat: 39.0437, lon: -77.4875,
      sourceId: 'wikidata_coordinates', sourceRef: 'Q1000000',
    }];
    const r = resolveObserver({ trace: okTrace, coloSites: sites });
    assert.equal(r.needsCityPick, false);
    assert.equal(r.observer.source, 'cloudflare-colo');
    assert.equal(r.observer.badge, 'REPORTED');
    assert.equal(r.observer.colo, 'IAD');
    assert.deepEqual(r.notices, []);
    assert.doesNotThrow(() => assertObserver(r.observer));
  });

  test('with no cited coordinate, the facility is still reported and the city is the reader choice', () => {
    const r = resolveObserver({ trace: okTrace, pickedCity: city });
    assert.equal(r.observer.source, 'visitor-picked-city');
    assert.equal(r.observer.badge, 'INFERRED');
    assert.equal(r.observer.colo, null);
    assert.equal(r.reportedColo, 'IAD', 'the facility is a fact the edge stated and it is not thrown away');
    assert.deepEqual(r.notices.map((n) => n.id), ['COLO_WITHOUT_COORDINATE']);
    assert.ok(RUN_NOTICES.COLO_WITHOUT_COORDINATE.includes('made up number wearing a badge'));
  });

  test('with no answer and no city, the page has to ask, and says so', () => {
    const r = resolveObserver({ trace: { ok: false, reason: RUN_NOTICES.TRACE_UNAVAILABLE } });
    assert.equal(r.observer, null);
    assert.equal(r.needsCityPick, true);
    assert.equal(r.reportedColo, null);
    assert.deepEqual(r.notices.map((n) => n.id), ['TRACE_UNAVAILABLE']);
  });

  test('with no answer and a chosen city, the observer is the choice, labelled as one', () => {
    const r = resolveObserver({ trace: { ok: false, reason: RUN_NOTICES.TRACE_UNAVAILABLE }, pickedCity: city });
    assert.equal(r.observer.source, 'visitor-picked-city');
    assert.equal(r.observer.label, 'Fredericksburg, Virginia');
    assert.equal(r.observer.badge, 'INFERRED');
  });

  test('there is no branch that turns an address into a coordinate', () => {
    // The contract refuses any third source, and this asserts the engine never tries to invent
    // one. A country code is not a position: a national centroid describes nobody.
    const r = resolveObserver({ trace: { ...okTrace, loc: 'US' } });
    assert.equal(r.observer, null, 'a country code must never become an observer point');
    assert.equal(r.needsCityPick, true);
  });

  test('a chosen city with no label is refused, because the page states which city it used', () => {
    assert.throws(() => resolveObserver({
      trace: { ok: false, reason: 'x' },
      pickedCity: { lat: 1, lon: 2, label: '' },
    }), /label/);
  });

  test('a chosen city with an impossible coordinate is refused rather than clamped', () => {
    assert.throws(() => resolveObserver({
      trace: { ok: false, reason: 'x' },
      pickedCity: { lat: 999, lon: 2, label: 'nowhere' },
    }), /lat/);
  });
});
