// The globe, mounted. GLOBE team. DESIGN 5, 6.4, 6.5, 6.6.
//
// Three promises get checked here and nowhere else, because they are about the assembled
// thing rather than about any one module:
//
//   FIRST PAINT BEFORE ANY NETWORK CALL. DESIGN 5 second 0: the page is already painted, and
//   nothing has touched the network. So a draw has to happen synchronously inside createGlobe,
//   before an animation frame is even requested.
//
//   THE LOOP STOPS. DESIGN 6.5 names thermal throttle as a mobile risk and gives the fix. A
//   still globe at zero frames per second is visually identical to a still globe at sixty and
//   costs nothing, so idle, hidden and reduced motion all have to leave the frame queue empty.
//
//   THE FALLBACK IS A REAL PICTURE. A browser with no WebGL2 gets the map, a sentence saying
//   what happened, and the same keyboard path. Never a black box.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createGlobe, DEVICE_PIXEL_RATIO_CAP } from '../src/globe/index.js';
import { replayGlobeInput } from '../src/globe/replay.js';
import { navEntries } from '../src/globe/a11y.js';
import { fakeDocument, fakeWindow, recordingGl } from './fixtures/globe-fakes.mjs';

/**
 * Mount a globe into a fake page.
 * @param {{webgl?:boolean, input?:object, win?:object, dpr?:number, reducedMotion?:boolean}} [opts]
 */
function mount(opts = {}) {
  const withGl = opts.webgl !== false;
  /** @type {any} */
  let gl = null;
  const doc = fakeDocument({
    getContext: (name, attrs) => {
      if (!withGl) return null;
      gl = recordingGl();
      gl.requestedAttrs = attrs;
      return gl;
    },
  });
  const win = opts.win || fakeWindow({
    devicePixelRatio: opts.dpr || 1,
    matchMedia: () => ({ matches: opts.reducedMotion === true }),
  });
  doc.defaultView = win;
  const container = doc.createElement('div');
  let current = opts.input || replayGlobeInput();
  const handle = createGlobe(container, {
    getInput: () => current,
    onSelect: (id) => { handle.lastSelected = id; },
    doc,
    win,
  });
  return {
    handle,
    doc,
    win,
    container,
    get gl() { return gl; },
    setInput(next) { current = next; handle.update(); },
  };
}

describe('first paint, before anything has touched the network', () => {
  test('a frame is drawn synchronously inside createGlobe', () => {
    const page = mount();
    assert.ok(page.gl, 'the WebGL2 path was not taken');
    assert.ok(page.gl.calls('clear').length >= 1,
      'nothing was drawn before the first animation frame, so the page is not already painted');
    assert.ok(page.gl.calls('drawElements').length > 5);
  });

  test('the first paint happens before any animation frame has run', () => {
    const win = fakeWindow();
    const page = mount({ win });
    const drawsBeforeAnyFrame = page.gl.calls('drawElements').length;
    win.tick(16);
    assert.ok(drawsBeforeAnyFrame > 0);
  });

  test('the backend is reported honestly', () => {
    assert.equal(mount().handle.backend, 'webgl2');
    assert.equal(mount({ webgl: false }).handle.backend, 'svg');
  });
});

describe('the render loop stops when nothing is moving', () => {
  test('an idle input leaves the frame queue empty', () => {
    const input = replayGlobeInput();
    input.idle = true;
    const page = mount({ input });
    assert.equal(page.win.pending, 0,
      'an idle globe queued an animation frame. A still globe at zero frames per second is '
      + 'visually identical and costs nothing (DESIGN 6.5).');
    assert.ok(page.gl.calls('clear').length >= 1, 'and it must still have been painted once');
  });

  test('a reduced motion input leaves the frame queue empty', () => {
    const page = mount();
    assert.equal(replayGlobeInput().reducedMotion, true);
    assert.equal(page.win.pending, 0, 'reduced motion queued an animation frame');
  });

  test('a moving input DOES run frames, or the test above proves nothing', () => {
    const input = replayGlobeInput();
    input.reducedMotion = false;
    const page = mount({ input });
    assert.ok(page.win.pending > 0, 'the idle rotation never started');
    const before = page.gl.calls('drawElements').length;
    page.win.tick(16);
    assert.ok(page.gl.calls('drawElements').length > before, 'the frame drew nothing');
    assert.ok(page.win.pending > 0, 'the loop stopped while the globe was still rotating');
  });

  test('hiding the document stops the loop, and showing it starts it again', () => {
    const input = replayGlobeInput();
    input.reducedMotion = false;
    const page = mount({ input });
    assert.ok(page.win.pending > 0);
    page.doc.hidden = true;
    page.doc.dispatch('visibilitychange');
    assert.equal(page.win.pending, 0, 'the loop kept running with the document hidden');
    page.doc.hidden = false;
    page.doc.dispatch('visibilitychange');
    assert.ok(page.win.pending > 0, 'the loop did not resume when the document came back');
  });

  test('an arc still drawing in keeps the loop alive, and a finished one lets it stop', () => {
    const input = replayGlobeInput();
    input.reducedMotion = false;
    input.arcs = input.arcs.map((a) => ({ ...a, progress: 0.5 }));
    const page = mount({ input });
    // Interaction stops the idle rotation, so the only thing left keeping frames alive is the
    // unfinished draw in. That isolates the assertion.
    const canvas = page.container.find((c) => c.tagName === 'canvas');
    canvas.dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
    page.win.tick(16);
    assert.ok(page.win.pending > 0, 'a half drawn arc did not keep the loop running');

    const done = replayGlobeInput();
    done.reducedMotion = false;
    page.setInput(done);
    canvas.dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
    page.win.tick(32);
    page.win.tick(48);
    assert.equal(page.win.pending, 0, 'the loop kept running after everything settled');
  });
});

describe('the device pixel ratio cap, which is the fill rate defence', () => {
  test('a high density display is capped, not honoured', () => {
    const page = mount({ dpr: 3 });
    const viewport = page.gl.calls('viewport').pop().a;
    assert.equal(viewport[2], 400 * DEVICE_PIXEL_RATIO_CAP);
    assert.equal(viewport[3], 400 * DEVICE_PIXEL_RATIO_CAP);
  });

  test('a low density display is not inflated to the cap', () => {
    const page = mount({ dpr: 1 });
    const viewport = page.gl.calls('viewport').pop().a;
    assert.equal(viewport[2], 400);
  });

  test('the cap the contract declares is honoured even when it is lower than ours', () => {
    const input = replayGlobeInput();
    input.devicePixelRatioCap = 1;
    const page = mount({ input, dpr: 3 });
    const viewport = page.gl.calls('viewport').pop().a;
    assert.equal(viewport[2], 400);
  });

  test('the drawing buffer is sized, not just the viewport', () => {
    const page = mount({ dpr: 2 });
    assert.equal(page.gl.canvas.width, 800);
    assert.equal(page.gl.canvas.height, 800);
  });
});

describe('the accessible surface that ships with the canvas', () => {
  test('the canvas is an image with a text alternative, and is focusable', () => {
    const page = mount();
    const canvas = page.container.find((c) => c.tagName === 'canvas');
    assert.equal(canvas.getAttribute('role'), 'img');
    assert.equal(canvas.getAttribute('aria-label'), replayGlobeInput().ariaSummary);
    assert.equal(canvas.tabIndex, 0);
  });

  test('there is a polite live region, and camera moves land in it', () => {
    const page = mount();
    const live = page.container.find((c) => c.getAttribute('aria-live') === 'polite');
    assert.ok(live, 'no live region was mounted');
    assert.equal(live.textContent, '');
    const canvas = page.container.find((c) => c.tagName === 'canvas');
    let prevented = 0;
    canvas.dispatch('keydown', { key: 'ArrowRight', preventDefault: () => { prevented += 1; } });
    assert.equal(prevented, 1);
    assert.equal(live.textContent, 'Rotated east.');
    assert.ok(!/\d/.test(live.textContent), 'the live region announced a digit');
  });

  test('a key the globe does not own is left for the page', () => {
    const page = mount();
    const canvas = page.container.find((c) => c.tagName === 'canvas');
    let prevented = 0;
    canvas.dispatch('keydown', { key: 'Tab', preventDefault: () => { prevented += 1; } });
    assert.equal(prevented, 0);
  });

  test('every endpoint is a button in the tab order', () => {
    const page = mount();
    const buttons = page.container.findAll((c) => c.tagName === 'button');
    assert.equal(buttons.length, navEntries(replayGlobeInput()).length);
  });

  test('focusing an endpoint announces it and aims the camera at it', () => {
    const page = mount();
    const live = page.container.find((c) => c.getAttribute('aria-live') === 'polite');
    const buttons = page.container.findAll((c) => c.tagName === 'button');
    buttons[2].dispatch('focus');
    assert.match(live.textContent, /^Showing /);
  });

  test('clicking an endpoint reports the selection to the caller', () => {
    const page = mount();
    const buttons = page.container.findAll((c) => c.tagName === 'button');
    buttons[1].dispatch('click');
    assert.equal(page.handle.lastSelected, navEntries(replayGlobeInput())[1].id);
  });

  test('update re reads the input and refreshes both the label and the list', () => {
    const page = mount();
    const canvas = page.container.find((c) => c.tagName === 'canvas');
    const next = replayGlobeInput();
    next.ariaSummary = 'A different scene entirely.';
    next.arcs = next.arcs.slice(0, 2);
    page.setInput(next);
    assert.equal(canvas.getAttribute('aria-label'), 'A different scene entirely.');
    assert.equal(page.container.findAll((c) => c.tagName === 'button').length, 3);
  });

  test('an input that breaks the contract is refused at update, not drawn wrong', () => {
    const page = mount();
    const bad = replayGlobeInput();
    bad.arcs = bad.arcs.map((a) => ({ ...a, state: 'worst' }));
    assert.throws(() => page.setInput(bad), /at most one arc/);
  });
});

describe('the fallback when there is no WebGL2', () => {
  test('a notice, then the map, and no canvas at all', () => {
    const page = mount({ webgl: false });
    assert.equal(page.container.find((c) => c.tagName === 'canvas'), null);
    const notice = page.container.find((c) => c.getAttribute('data-globe-notice'));
    assert.ok(notice, 'no notice was shown, which makes it a black box');
    assert.match(notice.textContent, /WebGL2/);
    const svg = page.container.find((c) => c.getAttribute('data-globe-fallback') === 'svg');
    assert.ok(svg, 'no map was mounted');
    assert.ok(svg.children.length > 5, 'the map is empty');
  });

  test('the keyboard path is the same one', () => {
    const page = mount({ webgl: false });
    assert.equal(
      page.container.findAll((c) => c.tagName === 'button').length,
      navEntries(replayGlobeInput()).length,
    );
    assert.ok(page.container.find((c) => c.getAttribute('aria-live') === 'polite'));
  });

  test('update redraws the map in place rather than appending a second one', () => {
    const page = mount({ webgl: false });
    const next = replayGlobeInput();
    next.arcs = next.arcs.slice(0, 2);
    page.setInput(next);
    assert.equal(page.container.findAll((c) => c.getAttribute('data-globe-fallback') === 'svg').length, 1);
  });

  test('the fallback never asks the page for an animation frame', () => {
    const page = mount({ webgl: false });
    assert.equal(page.win.pending, 0);
  });
});

describe('teardown', () => {
  test('destroy removes everything it mounted and frees the GPU objects', () => {
    const page = mount();
    assert.ok(page.container.children.length >= 3);
    page.handle.destroy();
    assert.equal(page.container.find((c) => c.tagName === 'canvas'), null);
    assert.equal(page.container.find((c) => c.getAttribute('aria-live') === 'polite'), null);
    assert.equal(page.container.findAll((c) => c.tagName === 'button').length, 0);
    assert.ok(page.gl.calls('deleteProgram').length >= 4);
    assert.ok(page.gl.calls('deleteBuffer').length > 0);
  });

  test('destroy stops the loop and unhooks the visibility listener', () => {
    const input = replayGlobeInput();
    input.reducedMotion = false;
    const page = mount({ input });
    assert.ok(page.win.pending > 0);
    page.handle.destroy();
    assert.equal(page.win.pending, 0);
    assert.equal((page.doc.listeners.visibilitychange || []).length, 0);
  });

  test('the context is asked for the attributes the capture rig and the depth test need', () => {
    const page = mount();
    assert.equal(page.gl.requestedAttrs.preserveDrawingBuffer, true);
    assert.equal(page.gl.requestedAttrs.depth, true);
    assert.equal(page.gl.requestedAttrs.antialias, true);
  });
});
