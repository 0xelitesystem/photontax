// Accessibility, and the WCAG arithmetic. GLOBE team. DESIGN 6.6, trap 19.
//
// DESIGN 6.6 is not a checklist item in this product, it is load bearing. The globe is
// decorative and the DOM is authoritative, and the honesty mechanism, which is a badge on every
// number, collapses entirely for a colour blind reader if emphasis is ever carried by colour
// alone. So the assertions here are about three things: that every endpoint on the canvas is
// reachable and describable without seeing it, that nothing this module renders depends on
// colour to be understood, and that every text token it places on a surface clears AA when the
// ratio is COMPUTED rather than looked at.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  KEY_HELP, STATE_TEXT, createEndpointList, createLiveRegion, describeScene, focusEntry,
  handleGlobeKey, navEntries, numberFreeCount, prefersReducedMotion,
} from '../src/globe/a11y.js';
import { GLOBE_TEXT_PAIRS, globeContrastReport } from '../src/globe/palette.js';
import { AA_NORMAL, THEMES, contrastRatio, themeToCssVars } from '../src/core/tokens.js';
import { replayGlobeInput, REPLAY_CAMERA, REPLAY_WORST_ID } from '../src/globe/replay.js';
import { createCamera } from '../src/globe/camera.js';
import { GLOBE_CSS, FALLBACK_NOTICE, createFrameProbe, PROBE_FRAMES, FRAME_BUDGET_MS } from '../src/globe/index.js';

/* -------------------------------------------------------------------------------------
 * A minimal Document. Enough for the three element kinds this module builds and no more,
 * which keeps the test honest about what it is really exercising.
 * ----------------------------------------------------------------------------------- */
function fakeDocument() {
  const make = (tag, ns) => {
    const el = {
      tagName: tag, namespaceURI: ns || null, children: [], attrs: {}, style: {},
      textContent: '', listeners: {},
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      removeEventListener(type, fn) {
        this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
      },
      dispatch(type, ev) { for (const fn of this.listeners[type] || []) fn(ev || {}); },
      get firstChild() { return this.children[0] || null; },
      querySelectorAll(pred) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (pred(c)) out.push(c); walk(c); } };
        walk(this);
        return out;
      },
    };
    return el;
  };
  return {
    createElement: (t) => make(t),
    createElementNS: (ns, t) => make(t, ns),
  };
}

const input = replayGlobeInput();

describe('every endpoint is reachable and describable without seeing the canvas', () => {
  test('the tab order covers the observer and every arc, once each', () => {
    const entries = navEntries(input);
    assert.equal(entries.length, input.arcs.length + 1);
    assert.equal(entries[0].id, 'observer');
    assert.deepEqual(entries.slice(1).map((e) => e.id), input.arcs.map((a) => a.endpointId));
    assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  });

  test('every entry carries a real coordinate and a non empty label', () => {
    for (const e of navEntries(input)) {
      assert.ok(e.label.length > 0, e.id + ' has no label');
      assert.ok(Number.isFinite(e.coord.lat) && Number.isFinite(e.coord.lon));
    }
  });

  test('EMPHASIS IS SPELLED OUT, never carried by colour alone', () => {
    // trap 19. The accent marks one arc visually. A reader who cannot see the accent gets the
    // same fact as words, in the same element, not in a tooltip and not in a legend.
    const entries = navEntries(input);
    const worst = entries.find((e) => e.id === REPLAY_WORST_ID);
    assert.equal(worst.state, 'worst');
    assert.equal(worst.stateText, STATE_TEXT.worst);
    assert.ok(worst.stateText.length > 10, 'the emphasised state needs words, not a symbol');
    for (const e of entries) {
      assert.ok(typeof e.stateText === 'string' && e.stateText.length > 0,
        e.id + ' has no spelled out state');
    }
  });

  test('the scene describes itself from the same data the picture is built from', () => {
    const text = describeScene(input);
    assert.match(text, /great circles/);
    assert.match(text, /decorative/);
    assert.match(text, /provenance is in the table|provenance, is in the table/);
  });

  test('NO DESCRIPTION CONTAINS A DIGIT', () => {
    // Every figure a reader receives goes through the claim badge system, which cannot render
    // a value without its provenance. The count of arcs on a decorative canvas is not such a
    // value, so it is spelled out rather than given an exception.
    assert.ok(!/\d/.test(describeScene(input)), describeScene(input));
    for (const e of navEntries(input)) {
      assert.ok(!/\d/.test(e.stateText), e.id + ' state text has a digit');
    }
    for (let n = 0; n <= 20; n++) assert.ok(!/\d/.test(numberFreeCount(n)));
    assert.equal(numberFreeCount(5), 'five');
    assert.equal(numberFreeCount(99), 'several');
  });

  test('focusing an entry drives the camera to it and says so', () => {
    const entries = navEntries(input);
    const target = entries[3];
    const r = focusEntry(createCamera(), target);
    assert.ok(Math.abs(r.camera.pitchDeg - target.coord.lat) < 1e-9);
    assert.ok(Math.abs(r.camera.yawDeg - target.coord.lon) < 1e-9);
    assert.match(r.announce, /^Showing /);
    assert.ok(r.announce.includes(target.label));
  });
});

describe('the keyboard surface', () => {
  test('the documented keys are the keys that work', () => {
    const camera = createCamera();
    const documented = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', 'Home'];
    for (const k of documented) {
      assert.equal(handleGlobeKey(camera, k).handled, true, k + ' is documented but does nothing');
    }
    assert.equal(handleGlobeKey(camera, 'q').handled, false);
  });

  test('the help list covers rotation, zoom, reset, traversal and selection', () => {
    const joined = KEY_HELP.map((k) => k.keys + ' ' + k.does).join(' ').toLowerCase();
    for (const word of ['tab', 'rotate', 'zoom', 'reset', 'select']) {
      assert.ok(joined.includes(word), 'the key help never mentions ' + word);
    }
  });

  test('a handled key returns a sentence for the live region', () => {
    const r = handleGlobeKey(createCamera(), 'ArrowRight');
    assert.ok(r.handled && r.announce.endsWith('.'));
  });
});

describe('reduced motion', () => {
  test('it is read from the media query when there is one', () => {
    assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: true }) }), true);
    assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: false }) }), false);
  });

  test('an environment with no matchMedia does not throw and does not guess true', () => {
    assert.equal(prefersReducedMotion({}), false);
    assert.equal(prefersReducedMotion({ matchMedia: () => { throw new Error('nope'); } }), false);
  });

  test('the contract already forces the final state, so a false here cannot animate anything', () => {
    const reduced = replayGlobeInput();
    assert.equal(reduced.reducedMotion, true);
    for (const a of reduced.arcs) assert.equal(a.progress, 1);
  });

  test('the stylesheet also kills animation at the CSS level, belt and braces', () => {
    assert.match(GLOBE_CSS, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(GLOBE_CSS, /animation: none/);
  });
});

describe('WCAG AA, computed and not eyeballed', () => {
  test('every text token the globe places on a surface clears AA in BOTH themes', () => {
    const report = globeContrastReport();
    assert.ok(report.length === GLOBE_TEXT_PAIRS.length * 2);
    for (const row of report) {
      assert.ok(row.pass, row.theme + ' theme: ' + row.text + ' on ' + row.surface + ' ('
        + row.where + ') computes at ' + row.ratio.toFixed(2) + ':1, under ' + AA_NORMAL);
    }
  });

  test('nothing here relies on the large text allowance', () => {
    for (const row of globeContrastReport()) {
      assert.ok(row.ratio >= 4.5, row.where + ' would only pass at the 3.0 large text threshold');
    }
  });

  test('every pairing the globe uses is one the house palette already sanctioned', () => {
    for (const row of globeContrastReport()) {
      assert.ok(row.sanctioned, row.text + ' on ' + row.surface + ' is not in tokens.js PAIRS. '
        + 'The globe may not invent a combination the palette never checked.');
    }
  });

  test('THE POSITIVE CONTROL: the same arithmetic rejects a pairing that really does fail', () => {
    // A gate nobody has watched fail is not a gate. #6b7178 is the idle arc line token, which
    // is a graphical stroke and is deliberately NOT a text token. Used as text on the dark
    // ground it fails, and the same function that passes everything above says so.
    const failing = contrastRatio('#6b7178', THEMES.dark.surface.base);
    assert.ok(failing < AA_NORMAL, 'the control colour no longer fails, so it controls nothing');
  });

  test('the stylesheet contains no colour value at all, only token references', () => {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(GLOBE_CSS), 'GLOBE_CSS contains a raw colour');
    assert.ok(!/\brgba?\s*\(/.test(GLOBE_CSS), 'GLOBE_CSS contains a raw rgb value');
    const vars = GLOBE_CSS.match(/var\(--[a-zA-Z-]+\)/g) || [];
    assert.ok(vars.length > 5, 'GLOBE_CSS does not reference the tokens');
  });

  test('EVERY custom property the globe references is one themeToCssVars actually emits', () => {
    // A var() that names nothing falls back to the inherited value, which on this page is
    // whatever the browser defaults to. That is a colour nothing has ever checked, arriving
    // through a typo rather than through a decision. Caught this exact way: an earlier
    // revision wrote --text-inkSoft, and the generator emits --text-ink-soft.
    const emitted = new Set();
    for (const theme of Object.values(THEMES)) {
      for (const line of themeToCssVars(theme).split('\n')) {
        const m = /^\s*(--[a-z-]+):/.exec(line);
        if (m) emitted.add(m[1]);
      }
    }
    const used = new Set((GLOBE_CSS.match(/var\((--[a-zA-Z-]+)\)/g) || [])
      .map((v) => v.slice(4, -1)));
    assert.ok(used.size > 5, 'GLOBE_CSS does not reference the tokens');
    for (const name of used) {
      assert.ok(emitted.has(name), name + ' is referenced by the globe stylesheet but '
        + 'themeToCssVars never emits it. Emitted: ' + [...emitted].sort().join(', '));
    }
  });

  test('--muted is never used as a text colour, and there is no muted text token to use', () => {
    assert.ok(!/color:\s*var\(\s*--muted/.test(GLOBE_CSS));
    for (const theme of Object.values(THEMES)) assert.ok(!('muted' in theme.text));
  });

  test('the focus ring is the accent, which is the highest contrast token in both themes', () => {
    assert.match(GLOBE_CSS, /:focus-visible\s*{\s*outline: 2px solid var\(--text-accent\)/);
    for (const [name, theme] of Object.entries(THEMES)) {
      const ratio = contrastRatio(theme.text.accent, theme.surface.base);
      assert.ok(ratio >= 3, name + ' focus ring against the ground is only ' + ratio.toFixed(2));
    }
  });
});

describe('the DOM this module builds', () => {
  test('the live region is polite, atomic, and rendered rather than display none', () => {
    const doc = fakeDocument();
    const live = createLiveRegion(doc);
    assert.equal(live.getAttribute('aria-live'), 'polite');
    assert.equal(live.getAttribute('aria-atomic'), 'true');
    assert.notEqual(live.style.display, 'none',
      'a region that is not rendered is not announced by several screen readers');
    assert.equal(live.style.position, 'absolute');
  });

  test('the endpoint list is a list of real buttons, one per entry, each identified', () => {
    const doc = fakeDocument();
    const nav = createEndpointList(doc, { onFocus() {}, onSelect() {}, onKey: () => false });
    const entries = navEntries(input);
    nav.setEntries(entries);
    const items = nav.element.children;
    assert.equal(items.length, entries.length);
    items.forEach((li, i) => {
      assert.equal(li.tagName, 'li');
      const button = li.children[0];
      assert.equal(button.tagName, 'button');
      assert.equal(button.type, 'button');
      assert.equal(button.getAttribute('data-endpoint-id'), entries[i].id);
      assert.equal(button.children[0].textContent, entries[i].label);
      assert.equal(button.children[1].textContent, entries[i].stateText);
    });
  });

  test('focus drives the camera, click selects, and a handled key is prevented', () => {
    const doc = fakeDocument();
    const seen = { focused: null, selected: null, prevented: 0 };
    const nav = createEndpointList(doc, {
      onFocus: (e) => { seen.focused = e.id; },
      onSelect: (e) => { seen.selected = e.id; },
      onKey: (k) => k === 'ArrowLeft',
    });
    nav.setEntries(navEntries(input));
    const button = nav.element.children[2].children[0];
    button.dispatch('focus');
    button.dispatch('click');
    button.dispatch('keydown', { key: 'ArrowLeft', preventDefault: () => { seen.prevented += 1; } });
    button.dispatch('keydown', { key: 'q', preventDefault: () => { seen.prevented += 1; } });
    assert.equal(seen.focused, navEntries(input)[2].id);
    assert.equal(seen.selected, navEntries(input)[2].id);
    assert.equal(seen.prevented, 1, 'an unhandled key must reach the page');
  });

  test('rebuilding the list removes the old listeners rather than stacking them', () => {
    const doc = fakeDocument();
    let focusCount = 0;
    const nav = createEndpointList(doc, {
      onFocus: () => { focusCount += 1; }, onSelect() {}, onKey: () => false,
    });
    nav.setEntries(navEntries(input));
    const stale = nav.element.children[1].children[0];
    nav.setEntries(navEntries(input));
    stale.dispatch('focus');
    assert.equal(focusCount, 0, 'a listener survived a rebuild, which leaks on every update');
    nav.element.children[1].children[0].dispatch('focus');
    assert.equal(focusCount, 1);
  });

  test('the fallback notice says what happened and does not apologise with a blank box', () => {
    assert.match(FALLBACK_NOTICE, /WebGL2/);
    assert.match(FALLBACK_NOTICE, /same coastline/);
    assert.match(FALLBACK_NOTICE, /table/);
  });
});

describe('the frame time probe that gates extra fill rate', () => {
  test('it needs a full run of frames under the budget before it clears', () => {
    const probe = createFrameProbe();
    for (let i = 0; i < PROBE_FRAMES - 1; i++) probe.sample(FRAME_BUDGET_MS - 1);
    assert.equal(probe.cleared, false, 'it cleared early');
    probe.sample(FRAME_BUDGET_MS - 1);
    assert.equal(probe.cleared, true);
  });

  test('one slow frame resets the run', () => {
    const probe = createFrameProbe();
    for (let i = 0; i < PROBE_FRAMES - 1; i++) probe.sample(1);
    probe.sample(FRAME_BUDGET_MS + 5);
    assert.equal(probe.run, 0);
    assert.equal(probe.cleared, false);
  });

  test('the budget is sixty frames per second, stated rather than assumed', () => {
    assert.ok(Math.abs(FRAME_BUDGET_MS - 1000 / 60) < 1e-12);
    assert.equal(PROBE_FRAMES, 30);
  });

  test('the fixture ships with bloom off, which is the default DESIGN 6.5 requires', () => {
    assert.equal(replayGlobeInput().bloomEnabled, false);
    assert.equal(REPLAY_CAMERA.distance > 1, true);
  });
});
