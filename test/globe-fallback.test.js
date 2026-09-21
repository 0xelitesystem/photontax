// The no WebGL2 fallback, and the contract the globe is handed. GLOBE team. DESIGN 6.5, 6.6.
//
// DESIGN 6.5 ends on "Never a black box". The fallback is held to the same standard as the
// canvas: the same bundled coastline, the same palette, the same arcs, the same endpoints, the
// same text alternative. These tests check that it is the same picture in another projection
// rather than a smaller apology, and they check the one thing a flat map gets wrong if nobody
// remembers it, which is the stroke that runs the whole width of the world when a feature
// crosses the antimeridian.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { fallbackSpec, mountSpec, rgbToHex, splitAtAntimeridian } from '../src/globe/fallback.js';
import { globePalette, WIDTH_PX } from '../src/globe/palette.js';
import { THEMES } from '../src/core/tokens.js';
import { replayGlobeInput, REPLAY_WORST_ID } from '../src/globe/replay.js';
import { COASTLINE_STATS, COASTLINE_ATTRIBUTION } from '../src/globe/coastline.js';
import { assertGlobeInput } from '../src/core/contracts/globe.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function fakeDocument() {
  return {
    createElementNS: (ns, tag) => ({
      ns, tag, attrs: {}, children: [], textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(c) { this.children.push(c); return c; },
    }),
  };
}

/** Walk a spec tree. */
function walk(spec, fn) {
  fn(spec);
  for (const c of spec.children || []) walk(c, fn);
}

const input = replayGlobeInput();

describe('the fallback is the same picture, not a smaller apology', () => {
  test('it is an accessible image with the same text alternative the canvas carries', () => {
    const spec = fallbackSpec(input);
    assert.equal(spec.tag, 'svg');
    assert.equal(spec.attrs.role, 'img');
    assert.equal(spec.attrs['aria-label'], input.ariaSummary);
    assert.equal(spec.attrs['data-attribution'], COASTLINE_ATTRIBUTION);
    assert.match(spec.attrs.viewBox, /^0 0 \d+ \d+$/);
  });

  test('it draws the same bundled coastline, with no fetch anywhere in sight', () => {
    const spec = fallbackSpec(input);
    const coastPath = spec.children.find((c) => c.tag === 'path' && !c.attrs['data-endpoint-id']);
    assert.ok(coastPath, 'there is no coastline in the fallback');
    const moves = (coastPath.attrs.d.match(/M/g) || []).length;
    assert.ok(moves >= COASTLINE_STATS.lines,
      'the fallback drew ' + moves + ' subpaths for ' + COASTLINE_STATS.lines + ' coastline '
      + 'features. Fewer would mean features were dropped.');
  });

  test('every arc in the input is drawn, each tagged with its endpoint and state', () => {
    const spec = fallbackSpec(input);
    const arcs = spec.children.filter((c) => c.tag === 'path' && c.attrs['data-arc-state']);
    assert.equal(arcs.length, input.arcs.length);
    const ids = new Set(arcs.map((a) => a.attrs['data-endpoint-id']));
    for (const a of input.arcs) assert.ok(ids.has(a.endpointId), a.endpointId + ' is missing');
  });

  test('the observer and every endpoint get a marker with a title a reader can hear', () => {
    const spec = fallbackSpec(input);
    const circles = spec.children.filter((c) => c.tag === 'circle');
    assert.equal(circles.length, input.arcs.length + 1);
    for (const c of circles) {
      assert.ok(c.children && c.children[0].tag === 'title');
      assert.ok(c.children[0].text.length > 0);
    }
    assert.equal(circles[0].attrs['data-endpoint-id'], 'observer');
  });

  test('the accent is spent on exactly one arc here too', () => {
    const spec = fallbackSpec(input);
    const accent = rgbToHex(globePalette('dark').arcWorst);
    const accented = spec.children.filter((c) => c.attrs && c.attrs.stroke === accent);
    assert.equal(accented.length, 1);
    assert.equal(accented[0].attrs['data-endpoint-id'], REPLAY_WORST_ID);
  });

  test('the accented arc is drawn LAST among the arcs, so nothing grey crosses over it', () => {
    const spec = fallbackSpec(input);
    const arcs = spec.children.filter((c) => c.tag === 'path' && c.attrs['data-arc-state']);
    assert.equal(arcs[arcs.length - 1].attrs['data-arc-state'], 'worst');
  });

  test('EVERY COLOUR IN THE FALLBACK IS A TOKEN', () => {
    // The same rule as the canvas: there is no colour in the globe region that the contrast
    // gate has never seen. Here it can be checked exhaustively, because the fallback is a
    // finite tree of attributes.
    for (const themeName of ['dark', 'light']) {
      const theme = THEMES[themeName];
      const tokens = new Set();
      for (const group of [theme.surface, theme.text, theme.line]) {
        for (const v of Object.values(group)) tokens.add(v.toLowerCase());
      }
      walk(fallbackSpec(replayGlobeInput({ theme: themeName })), (node) => {
        for (const key of ['fill', 'stroke']) {
          const v = node.attrs && node.attrs[key];
          if (!v || v === 'none') continue;
          assert.ok(tokens.has(v.toLowerCase()),
            themeName + ' theme: ' + key + ' is ' + v + ', which is not a token');
        }
      });
    }
  });

  test('stroke widths match the ones the canvas uses, so the two look like one product', () => {
    const spec = fallbackSpec(input);
    const coast = spec.children.find((c) => c.tag === 'path' && !c.attrs['data-arc-state']);
    assert.equal(coast.attrs['stroke-width'], String(WIDTH_PX.coastline));
    const worst = spec.children.find((c) => c.attrs['data-arc-state'] === 'worst');
    assert.equal(worst.attrs['stroke-width'], String(WIDTH_PX.arcWorst));
  });
});

describe('the antimeridian, which is the one thing a flat map gets wrong', () => {
  test('a run that wraps is split, and one that does not is left alone', () => {
    const wrapped = splitAtAntimeridian([
      { lat: 0, lon: 178 }, { lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 }, { lat: 0, lon: -178 },
    ]);
    assert.equal(wrapped.length, 2);
    assert.deepEqual(wrapped[0].map((c) => c.lon), [178, 179.5]);
    assert.deepEqual(wrapped[1].map((c) => c.lon), [-179.5, -178]);

    const straight = splitAtAntimeridian([
      { lat: 0, lon: -10 }, { lat: 0, lon: 0 }, { lat: 0, lon: 10 },
    ]);
    assert.equal(straight.length, 1);
    assert.equal(straight[0].length, 3);
  });

  test('a fragment of fewer than two points is dropped rather than drawn as a dot', () => {
    const r = splitAtAntimeridian([{ lat: 0, lon: 179 }, { lat: 0, lon: -179 }]);
    assert.equal(r.length, 0);
  });

  test('NO PATH IN THE RENDERED MAP MAKES A FULL WIDTH JUMP', () => {
    // A single stroke running the whole width of the world is the most recognisable bug in a
    // flat map, and it happens every time somebody forgets this. Every consecutive pair of
    // points in every path is checked against half the viewBox width.
    const width = 1000;
    const spec = fallbackSpec(input, { width, height: 500 });
    walk(spec, (node) => {
      if (node.tag !== 'path') return;
      for (const sub of node.attrs.d.split('M').slice(1)) {
        const xs = sub.trim().split('L').map((p) => parseFloat(p.trim().split(' ')[0]));
        for (let i = 1; i < xs.length; i++) {
          assert.ok(Math.abs(xs[i] - xs[i - 1]) < width / 2,
            'a path jumped ' + Math.abs(xs[i] - xs[i - 1]).toFixed(1) + ' units horizontally, '
            + 'which is a stroke drawn straight back across the map');
        }
      }
    });
  });

  test('every projected point is inside the viewBox', () => {
    const width = 800;
    const height = 400;
    const spec = fallbackSpec(input, { width, height });
    walk(spec, (node) => {
      if (node.tag === 'circle') {
        assert.ok(parseFloat(node.attrs.cx) >= 0 && parseFloat(node.attrs.cx) <= width);
        assert.ok(parseFloat(node.attrs.cy) >= 0 && parseFloat(node.attrs.cy) <= height);
      }
      if (node.tag !== 'path') return;
      for (const sub of node.attrs.d.split('M').slice(1)) {
        for (const p of sub.trim().split('L')) {
          const [x, y] = p.trim().split(' ').map(Number);
          assert.ok(x >= -0.01 && x <= width + 0.01, 'x out of the viewBox: ' + x);
          assert.ok(y >= -0.01 && y <= height + 0.01, 'y out of the viewBox: ' + y);
        }
      }
    });
  });
});

describe('mounting', () => {
  test('it builds DOM with createElementNS, never a string of markup', () => {
    const doc = fakeDocument();
    const root = mountSpec(doc, fallbackSpec(input));
    assert.equal(root.ns, SVG_NS);
    assert.equal(root.tag, 'svg');
    assert.ok(root.children.length > 5);
    for (const c of root.children) assert.equal(c.ns, SVG_NS);
  });

  test('titles carry their text through', () => {
    const doc = fakeDocument();
    const root = mountSpec(doc, fallbackSpec(input));
    const circle = root.children.find((c) => c.tag === 'circle');
    assert.equal(circle.children[0].tag, 'title');
    assert.equal(circle.children[0].textContent, input.observer.label);
  });

  test('the fallback module assembles no markup string anywhere', async () => {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(new URL('../src/globe/fallback.js', import.meta.url), 'utf8');
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    for (const re of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /DOMParser/]) {
      assert.ok(!re.test(code), 'fallback.js uses ' + re);
    }
  });
});

describe('the fallback refuses the same things the canvas refuses', () => {
  test('an arc carrying waypoints is refused before anything is drawn', () => {
    const bad = replayGlobeInput();
    bad.arcs = bad.arcs.map((a, i) => (i === 0 ? { ...a, waypoints: [{ lat: 0, lon: 0 }] } : a));
    assert.throws(() => fallbackSpec(bad), /great circle between two coordinates/);
  });

  test('two accented arcs are refused, because the colour budget is one line', () => {
    const bad = replayGlobeInput();
    bad.arcs = bad.arcs.map((a) => ({ ...a, state: 'worst' }));
    assert.throws(() => fallbackSpec(bad), /at most one arc/);
  });

  test('the committed fixture itself satisfies the contract', () => {
    assert.doesNotThrow(() => assertGlobeInput(replayGlobeInput()));
    assert.doesNotThrow(() => assertGlobeInput(replayGlobeInput({ theme: 'light' })));
    assert.doesNotThrow(() => assertGlobeInput(replayGlobeInput({ selectedId: null })));
  });
});
