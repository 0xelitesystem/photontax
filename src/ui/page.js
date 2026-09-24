// THE PAGE. Every element this product puts on screen, and the choreography that reveals it.
//
// DESIGN 5 (the ten second reveal), DESIGN 6.2 (art direction), DESIGN 6.3 (first paint),
// DESIGN 6.6 (accessibility), DESIGN 7.3 (the self test), traps 2, 3, 9, 13, 14, 17, 19.
//
// FOUR RULES RUN THROUGH THIS FILE.
//
//   THE DOM IS AUTHORITATIVE AND THE CANVAS IS NOT. The result is a real table: region,
//   distance, round trip, physics, access, route, ratio, verdict, and a provenance badge on
//   every cell. A reader using a screen reader loses the animation and loses nothing else.
//
//   NO NUMBER WITHOUT A BADGE. Every figure comes through claimNode(), which stamps
//   data-claim-badge before it writes the text. Prose that STATES a method or a source carries
//   the badge of the tier it describes. There is no third arrangement and no exception.
//
//   NOTHING TOUCHES THE NETWORK UNTIL THE BUTTON IS PRESSED. The globe, the floor, the
//   pre click fact and the self test are all pure arithmetic over bundled data, and they are
//   all on screen before the visitor decides anything.
//
//   EVERY EMPTY STATE IS STATED. No spinner, no zero, no blank cell. If a thing is missing the
//   page says which thing and why, in a sentence.
//
// Browser only.

import { BADGE_SPEC, BADGE_KINDS, measured, computed, reported, inferred } from '../core/claim.js';
import { SOURCES } from '../core/data/sources.js';
import {
  REGION_COORDINATE_DISCLAIMER, PROVIDER_COORDINATE_EVIDENCE, ROW_WITHOUT_A_FIGURE,
  NO_RATIO_WITHOUT_A_ROUND_TRIP,
} from '../core/data/disclaimers.js';
import { METHODS } from '../core/claim.js';
import { el, append, text, clear, claimNode, updateClaimNode, badgeNode } from './dom.js';
import { ALL_HOSTS, purposeFor } from './hosts.js';
import { timingFor, SEGMENT_ORDER, segmentsVisibleAt, driveCountUp } from './reveal.js';
import { PORT_MESSAGES } from './ports.js';
import { buildMaths } from './maths.js';
import { pickableCities, PICKER_PROMPT, PICKER_DISCLAIMER } from './citypicker.js';

/* --------------------------------------------------------------------------------------------
 * Copy that appears in more than one place, in one place.
 * ------------------------------------------------------------------------------------------ */

export const COPY = Object.freeze({
  wordmark: 'photontax',
  question: 'How much of your latency is physics, and how much is your route?',
  measureButton: 'Measure my floor',
  measuringButton: 'Measuring',
  skip: 'Skip to the result table',
  selfTestButton: 'Run the self test',
  themeButton: 'Switch theme',
  mathsSummary: 'Show the maths',
  tableCaption:
    'The result. Every cell carries the badge of how it was obtained, and how each column is '
    + 'obtained is stated in full above this table. This table is the result; the globe is '
    + 'decorative.',
  statusIdle: 'Nothing on this page has touched the network.',
  statusMeasuring: 'Measuring. Each region answers on its own and its arc is drawn as it does.',
  statusDone: 'Done. Every figure below was produced by your own machine or by arithmetic you '
    + 'can repeat.',
  warmHttps: 'warm HTTPS round trip',
});

/** The four badges, their shapes and what each one means. DESIGN 6.6 and trap 19. */
export const CLAIM_LEGEND_INTRO =
  'Every figure on this page carries one of four badges, and each badge is a word and a shape '
  + 'rather than a colour, so the distinction survives for a reader who sees no colour at all.';

/**
 * How each column of the table is obtained, printed above the table in full. DESIGN 2 requires
 * the method beside the number; printing it once per column rather than once per cell is what
 * keeps a twelve row table readable while still putting it in front of the reader.
 */
const COLUMN_METHODS = Object.freeze([
  Object.freeze({ column: 'Distance', badge: 'COMPUTED', method: METHODS.GREAT_CIRCLE_HAVERSINE }),
  Object.freeze({ column: 'Round trip', badge: 'MEASURED', method: METHODS.WARM_HTTPS_ROUND_TRIP }),
  Object.freeze({ column: 'Physics', badge: 'COMPUTED', method: METHODS.FIBRE_FLOOR }),
  Object.freeze({ column: 'Access', badge: 'MEASURED', method: METHODS.ACCESS_BASELINE }),
  Object.freeze({ column: 'Route', badge: 'MEASURED', method: METHODS.ROUTE_SURPLUS }),
  Object.freeze({ column: 'Ratio', badge: 'COMPUTED', method: METHODS.ROUTE_RATIO }),
  Object.freeze({ column: 'Verdict', badge: 'COMPUTED', method: METHODS.VERDICT_FROM_RATIO }),
]);

/* --------------------------------------------------------------------------------------------
 * Rendering parts.
 * ------------------------------------------------------------------------------------------ */

/**
 * Render a sentence built from parts. A prose run becomes a text node; a Claim becomes a badged
 * element; provenance prose becomes an element carrying the badge of the tier it describes.
 * @param {Node} parent
 * @param {readonly import('./parts.js').Part[]} parts
 * @returns {Node}
 */
export function renderParts(parent, parts) {
  for (const p of parts) {
    if (p.kind === 'text') {
      parent.appendChild(text(p.value));
    } else if (p.kind === 'prose') {
      const span = el('span', {
        class: 'pt-provenance',
        'data-claim-badge': p.badge,
        'data-claim-method': p.method,
      });
      span.appendChild(text(p.value));
      span.appendChild(text(' '));
      span.appendChild(badgeNode(p.badge));
      parent.appendChild(span);
    } else {
      parent.appendChild(claimNode(p.claim, { showMethod: p.showMethod }));
    }
  }
  return parent;
}

/**
 * Prose with no figure in it. Throws if a digit sneaks in, because a digit here is a number with
 * no badge and the build gate would only catch it once it was already written into the page.
 * @param {string} tag
 * @param {string} cls
 * @param {string} value
 * @returns {HTMLElement}
 */
function prose(tag, cls, value) {
  if (/\d/.test(value)) {
    throw new TypeError('prose(): this sentence contains a figure and would render it with no '
      + 'badge: ' + JSON.stringify(value.slice(0, 80)) + '. Use parts with pp() or a Claim.');
  }
  return el(tag, { class: cls }, [value]);
}

/**
 * Provenance prose as a standalone block: a sentence that names a method or a source and
 * therefore carries figures of its own.
 * @param {string} tag
 * @param {string} cls
 * @param {string} badge
 * @param {string} method
 * @param {string} value
 * @returns {HTMLElement}
 */
function provenanceBlock(tag, cls, badge, method, value) {
  const node = el(tag, {
    class: cls,
    'data-claim-badge': badge,
    'data-claim-method': method,
  }, [value, ' ']);
  node.appendChild(badgeNode(badge));
  return node;
}

/* --------------------------------------------------------------------------------------------
 * The page.
 * ------------------------------------------------------------------------------------------ */

export class Page {
  /**
   * @param {Document} doc
   * @param {Object} opts
   * @param {boolean} opts.reducedMotion
   * @param {boolean} opts.hasEngine
   * @param {boolean} opts.hasRenderer
   */
  constructor(doc, opts) {
    this.doc = doc;
    this.reducedMotion = opts.reducedMotion;
    this.hasEngine = opts.hasEngine;
    this.hasRenderer = opts.hasRenderer;
    // A globe that is not registered YET is not the same condition as a globe that is not in
    // the build, and saying the second when the first is true would be a false sentence on
    // screen for the second it takes the deferred file to arrive. See buildScene().
    this.rendererDeferred = Boolean(opts.rendererDeferred);
    /** @type {Record<string, HTMLElement>} */
    this.refs = {};
    /** @type {Map<string, {tr:HTMLElement, segs:Record<string,HTMLElement>}>} */
    this.rowNodes = new Map();
    /** @type {import('../core/contracts/viewmodel.js').ViewModel|null} */
    this.vm = null;
    this.selectedEndpointId = null;
    /** @type {(id:string)=>void} */
    this.onSelectRow = () => {};
    /** @type {()=>void} */
    this.onMeasure = () => {};
    /** @type {()=>void} */
    this.onSelfTest = () => {};
    /** @type {()=>void} */
    this.onThemeToggle = () => {};
    /** @type {(cityId:string)=>void} */
    this.onPickCity = () => {};
  }

  /**
   * Build the whole document body from a view model in the idle state.
   * @param {HTMLElement} mountPoint
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   */
  mount(mountPoint, vm) {
    this.vm = vm;
    clear(mountPoint);
    append(mountPoint, [
      this.buildSkipLink(),
      this.buildMasthead(),
      this.buildHero(vm),
      this.buildMain(vm),
      this.buildLiveRegion(),
    ]);
    return mountPoint;
  }

  /** @returns {HTMLElement} */
  buildSkipLink() {
    return el('a', { class: 'pt-skip pt-panel', href: '#result-table' }, [COPY.skip]);
  }

  /** @returns {HTMLElement} */
  buildMasthead() {
    const themeBtn = el('button', { type: 'button', class: 'pt-button pt-button-quiet' }, [COPY.themeButton]);
    themeBtn.addEventListener('click', () => this.onThemeToggle());
    const selfBtn = el('button', { type: 'button', class: 'pt-button pt-button-quiet' }, [COPY.selfTestButton]);
    selfBtn.addEventListener('click', () => this.onSelfTest());
    this.refs.themeButton = themeBtn;
    this.refs.selfTestButton = selfBtn;

    // pt-shell-tight, because .pt-shell carries 5rem of bottom padding for the reading
    // sections below and 80 px of nothing between the wordmark and the hook is exactly the
    // dead space the opening frame cannot afford.
    return el('div', { class: 'pt-shell pt-shell-tight' }, [
      el('header', { class: 'pt-masthead' }, [
        el('div', {}, [
          el('h1', { class: 'pt-wordmark' }, [COPY.wordmark]),
          prose('p', 'pt-prose', COPY.question),
        ]),
        el('div', { class: 'pt-controls' }, [themeBtn, selfBtn]),
      ]),
    ]);
  }

  /**
   * THE OPENING FRAME. What a visitor has before they click and before they scroll.
   *
   * The order here IS the argument, and it was the wrong way round. The globe used to take the
   * whole width above the fold and the line that makes the point was pushed below it along
   * with the only control on the page. So: the strongest sentence leads, at display size, with
   * its two figures in the one accent; the button and the consent sentence that states the
   * exact request count sit directly under it; and the globe becomes a smaller, sharper
   * element beside the words rather than the centrepiece. DESIGN 6.2 is unchanged by that,
   * because the globe was already decorative and the table was already the result.
   *
   * NOT ONE SENTENCE IS CUT. Every badge, every honesty line, the whole destination list and
   * the coordinate disclaimer are the same nodes built by the same two methods as before. This
   * is a layout and emphasis change.
   *
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   * @returns {HTMLElement}
   */
  buildHero(vm) {
    return el('div', { class: 'pt-hero pt-shell' }, [
      el('div', { class: 'pt-hero-copy' }, [
        this.buildFloorSection(vm),
        this.buildMeasureSection(vm),
      ]),
      // The qualification of the hook rides in the second column under the globe rather than
      // under the hook itself. It is the same paragraph, in the same frame, unedited; putting
      // it here is what buys the five lines that let the button and the consent sentence be on
      // screen at 900 px of viewport height instead of just below it.
      el('div', { class: 'pt-hero-scene' }, [this.buildScene(), this.buildFloorNote()]),
    ]);
  }

  /**
   * The scene. The canvas is decorative and carries role="img" with a text alternative; if no
   * renderer registered, or the browser gave no context, the wrap says so instead of showing a
   * black rectangle (DESIGN 6.5: never a black box).
   *
   * THREE STATES, NOT TWO, because the globe now arrives after first paint (DESIGN 6.3).
   *
   *   registered already      the canvas is mounted into this wrap by src/ui/main.js.
   *   deferred, not yet here  a drawn placeholder holds the space at the size the globe will
   *                           take, so nothing moves when it lands, and it carries the one
   *                           accent as the great circle the sentence beside it is about. It
   *                           is aria-hidden: the wrap's own label already describes the
   *                           picture, and a decoration does not get a second voice.
   *   not in the build        the existing sentence, unchanged.
   *
   * The middle state is why PORT_MESSAGES.noRenderer is not printed on a page whose globe is
   * simply still in flight: that sentence says the globe is not present in this build, and on
   * a deferred build that is not true.
   *
   * @returns {HTMLElement}
   */
  buildScene() {
    const wrap = el('div', {
      class: 'pt-canvas-wrap',
      role: 'img',
      'aria-label': 'A dark globe with coastlines drawn as thin strokes. No measurement has been '
        + 'taken yet, so no arcs are drawn. This image is decorative and the result is the table '
        + 'below it.',
    });
    this.refs.canvasWrap = wrap;

    if (!this.hasRenderer && this.rendererDeferred) {
      const placeholder = el('div', { class: 'pt-globe-standin', 'aria-hidden': 'true' }, [
        el('span', { class: 'pt-globe-standin-arc' }),
      ]);
      this.refs.globeStandin = placeholder;
      wrap.appendChild(placeholder);
    } else if (!this.hasRenderer) {
      wrap.setAttribute('role', 'note');
      wrap.removeAttribute('aria-label');
      wrap.appendChild(el('div', { class: 'pt-panel' }, [
        prose('p', 'pt-prose-panel', PORT_MESSAGES.noRenderer),
      ]));
    }

    const observerPanel = el('div', { class: 'pt-panel pt-panel-tight', hidden: true });
    this.refs.observerPanel = observerPanel;

    return el('div', { class: 'pt-scene' }, [
      wrap,
      el('div', { class: 'pt-scene-overlay' }, [observerPanel]),
    ]);
  }

  /**
   * The deferred globe arrived. Take the stand in out from under it, so the reader is never
   * looking at a drawn disc and a rendered one at the same time.
   */
  clearGlobeStandin() {
    const standin = this.refs.globeStandin;
    if (standin && standin.parentNode) standin.parentNode.removeChild(standin);
    this.refs.globeStandin = null;
  }

  /**
   * The deferred globe never arrived: the file did not load, or the browser refused it. Say
   * which, in the same shape every other empty state on this page uses. The stand in stays,
   * because a drawn disc is a better last state than an empty box.
   * @param {string} sentence
   */
  showGlobeUnavailable(sentence) {
    const wrap = this.refs.canvasWrap;
    if (!wrap) return;
    wrap.setAttribute('role', 'note');
    wrap.removeAttribute('aria-label');
    // BELOW the wrap, not inside it. The wrap is a fixed aspect ratio box with overflow
    // hidden holding the stand in, so a panel appended into it lands on top of the drawing
    // and gets clipped. It goes to the scene, under the picture, where a caption goes.
    const scene = wrap.parentNode || wrap;
    scene.appendChild(el('div', { class: 'pt-panel pt-panel-tight pt-scene-note' }, [
      prose('p', 'pt-fine-panel', sentence),
    ]));
  }

  /**
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   * @returns {HTMLElement}
   */
  buildMain(vm) {
    return el('main', { class: 'pt-shell' }, [
      this.buildResultSection(),
      this.buildSelfTestSection(vm),
      this.buildClaimLegend(),
      this.buildSourcesSection(vm),
      this.buildColophon(vm),
    ]);
  }

  /**
   * DESIGN 5, seconds 0 to 3. The true, surprising, sourced fact a reader receives from
   * arithmetic alone, before any network call, with its assumption stated above it.
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   * @returns {HTMLElement}
   */
  buildFloorSection(vm) {
    const lede = el('p', { class: 'pt-lede' });
    renderParts(lede, vm.preMeasurement.parts);

    return el('section', { class: 'pt-section', id: 'floor' }, [
      provenanceBlock('p', 'pt-fine', 'INFERRED', METHODS.REGION_CITY_CENTRE,
        REGION_COORDINATE_DISCLAIMER),
      lede,
    ]);
  }

  /**
   * What the number is and is not. The same paragraph it always was, in the same opening
   * frame, moved beside the globe instead of under the hook. DESIGN 2.4 wants the assumption
   * on screen before the number, which is the INFERRED line above the hook and is unchanged;
   * this one is the qualification after it, and it does not have to be the thing between the
   * hook and the button.
   * @returns {HTMLElement}
   */
  buildFloorNote() {
    return prose('p', 'pt-prose pt-hero-note',
      'That is a floor and not a prediction. It is what the shortest possible line between '
      + 'those two places costs in glass, so nothing built on either end can beat it. What it '
      + 'cannot tell you is how much worse your own connection will be, because at this point '
      + 'it has not measured you and it has not looked you up.');
  }

  /**
   * The single focused control. DESIGN 5 second 0 and trap 14: the exact request count and the
   * destination list are printed BEFORE the click, not after.
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   * @returns {HTMLElement}
   */
  buildMeasureSection(vm) {
    const button = el('button', {
      type: 'button',
      class: 'pt-button',
      id: 'measure',
      autofocus: true,
    }, [COPY.measureButton]);
    button.addEventListener('click', () => this.onMeasure());
    this.refs.measureButton = button;

    if (!this.hasEngine) {
      button.setAttribute('disabled', '');
      button.setAttribute('aria-describedby', 'engine-missing');
    }

    const hostList = el('ul', { class: 'pt-hostlist' });
    for (const host of ALL_HOSTS) {
      hostList.appendChild(el('li', {
        class: 'pt-fine',
        title: purposeFor(host),
        // A hostname is a factual identifier published by the operator, and several of them
        // carry a digit. It is REPORTED, like every other string taken from a catalogue.
        'data-claim-badge': 'REPORTED',
        'data-claim-method': METHODS.PROVIDER_REGION_CATALOGUE,
      }, [el('span', { class: 'pt-mono' }, [host])]));
    }

    const status = el('p', { class: 'pt-fine', id: 'status', role: 'status', 'aria-live': 'polite' },
      [COPY.statusIdle]);
    this.refs.status = status;

    const notices = el('div', { class: 'pt-fine' });
    this.refs.notices = notices;
    const picker = this.buildCityPicker();

    // COMPUTED, not REPORTED. The figures in this sentence are a count over the shipped
    // endpoint table and the shipped sample constants. No provider reported them, and the
    // method sentence says how they were arrived at, which is the whole contract (DESIGN 2.3).
    const consent = provenanceBlock('p', 'pt-prose', 'COMPUTED', METHODS.REQUEST_PLAN,
      vm.consentSentence);

    return el('section', { class: 'pt-section', id: 'measure-section' }, [
      el('h2', { class: 'pt-h2' }, ['Measure your own connection']),
      el('div', { class: 'pt-cta' }, [
        button,
        el('div', {}, [
          consent,
          prose('p', 'pt-fine',
            'No account, no key, no cookie, no analytics and no upload. Each request is timed and '
            + 'its response is thrown away. The list below is every host this page is able to '
            + 'reach, and the browser is told to refuse anything else.'),
          el('details', {}, [
            el('summary', { class: 'pt-fine' }, ['Every host this page can contact']),
            hostList,
          ]),
        ]),
      ]),
      this.hasEngine ? null : prose('p', 'pt-fine', PORT_MESSAGES.noEngine),
      status,
      notices,
      picker,
    ].filter(Boolean).map((n) => /** @type {Node} */ (n)));
  }

  /**
   * DESIGN trap 7. The page asks rather than guesses, and it only asks once it has something to
   * ask about. Hidden until the engine says it needs a point to measure from.
   * @returns {HTMLElement}
   */
  buildCityPicker() {
    const select = el('select', { id: 'city', class: 'pt-mono' });
    for (const c of pickableCities()) {
      select.appendChild(el('option', { value: c.id }, [c.label]));
    }
    const confirm = el('button', { type: 'button', class: 'pt-button' }, ['Use this city']);
    confirm.addEventListener('click', () => this.onPickCity(select.value));

    const panel = el('section', { class: 'pt-panel', hidden: true, 'aria-labelledby': 'city-label' }, [
      el('h3', { class: 'pt-h3', id: 'city-label' }, ['Which city are you nearest?']),
      prose('p', 'pt-prose-panel', PICKER_PROMPT),
      el('div', { class: 'pt-cta' }, [
        el('label', { class: 'pt-visually-hidden', for: 'city' }, ['Nearest city']),
        select,
        confirm,
      ]),
      prose('p', 'pt-fine-panel', PICKER_DISCLAIMER),
    ]);
    this.refs.cityPicker = panel;
    this.refs.citySelect = select;
    return panel;
  }

  /**
   * Show the picker, with whatever the serving edge said about itself above it. The facility
   * code is REPORTED; it is shown because it is true and useful, not because it produces a
   * coordinate, and the sentence beside it says so.
   * @param {import('../core/claim.js').Claim|null} coloClaim
   */
  showCityPicker(coloClaim) {
    const panel = this.refs.cityPicker;
    panel.removeAttribute('hidden');
    if (coloClaim) {
      const line = el('p', { class: 'pt-prose-panel' });
      line.appendChild(text('The facility that terminated this connection named itself as '));
      line.appendChild(claimNode(coloClaim, { showMethod: 'sr' }));
      line.appendChild(text('. That is a name, not a coordinate, and this product ships no '
        + 'catalogue of facility coordinates it is allowed to redistribute.'));
      panel.insertBefore(line, panel.children[2]);
    }
    this.refs.citySelect.focus();
    this.announce('This page needs to know which city you are nearest before it can measure '
      + 'anything. It does not look you up.');
  }

  /** Hide the picker once a point has been chosen. */
  hideCityPicker() {
    this.refs.cityPicker.setAttribute('hidden', '');
  }

  /**
   * The fixed sentences a run produces about itself. Each carries the badge of the kind of fact
   * it is, so a notice is attributed like everything else on the page rather than floating as
   * unowned chrome.
   * @param {{id:string, badge:string, text:string}[]} notices
   */
  renderNotices(notices) {
    const host = this.refs.notices;
    clear(host);
    for (const n of notices) {
      host.appendChild(provenanceBlock('p', 'pt-fine', n.badge,
        'A fixed sentence the measurement engine emits about this run, carrying the badge of '
        + 'the kind of fact it is.', n.text));
    }
  }

  /** @returns {HTMLElement} */
  buildResultSection() {
    const headline = el('p', { class: 'pt-headline pt-accent' });
    this.refs.headline = headline;

    const methodList = el('dl', { class: 'pt-kv' });
    for (const m of COLUMN_METHODS) {
      methodList.appendChild(el('dt', {}, [m.column, ' ', badgeNode(m.badge)]));
      methodList.appendChild(el('dd', {
        class: 'pt-fine',
        'data-claim-badge': m.badge,
        'data-claim-method': m.method,
      }, [m.method]));
    }

    const table = el('table', { class: 'pt-table', id: 'result-table' });
    table.appendChild(el('caption', { class: 'pt-fine' }, [COPY.tableCaption]));
    table.appendChild(this.buildTableHead());
    const tbody = el('tbody');
    table.appendChild(tbody);
    this.refs.tbody = tbody;

    const notes = el('div', { class: 'pt-fine' });
    this.refs.resultNotes = notes;

    const maths = el('details', { class: 'pt-maths pt-panel' });
    maths.appendChild(el('summary', {}, [COPY.mathsSummary]));
    const mathsBody = el('div');
    maths.appendChild(mathsBody);
    this.refs.maths = maths;
    this.refs.mathsBody = mathsBody;

    const section = el('section', { class: 'pt-section', id: 'result', hidden: true }, [
      el('h2', { class: 'pt-h2' }, ['The three way split']),
      headline,
      el('h3', { class: 'pt-h3' }, ['How each column is obtained']),
      methodList,
      el('div', { class: 'pt-table-wrap' }, [table]),
      notes,
      maths,
    ]);
    this.refs.resultSection = section;
    return section;
  }

  /** @returns {HTMLElement} */
  buildTableHead() {
    const head = el('thead');
    const tr = el('tr');
    const cols = [
      { label: 'Region', scope: 'col' },
      { label: 'Distance', scope: 'col' },
      { label: 'Round trip', scope: 'col' },
      { label: 'Split', scope: 'col' },
      { label: 'Physics', scope: 'col' },
      { label: 'Access', scope: 'col' },
      { label: 'Route', scope: 'col' },
      { label: 'Ratio', scope: 'col' },
      { label: 'Verdict', scope: 'col' },
    ];
    for (const col of cols) {
      tr.appendChild(el('th', { scope: col.scope }, [col.label]));
    }
    head.appendChild(tr);
    return head;
  }

  /**
   * DESIGN 7.3: always visible, never behind a menu.
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   * @returns {HTMLElement}
   */
  buildSelfTestSection(vm) {
    const list = el('ul', { class: 'pt-selftest' });
    this.refs.selfTestList = list;
    const section = el('section', { class: 'pt-section', id: 'selftest' }, [
      el('h2', { class: 'pt-h2' }, ['Self test']),
      prose('p', 'pt-prose',
        'This tool checks its own arithmetic in front of you, including the checks that would '
        + 'show it to be wrong. The checks that need no network run on load; the rest appear '
        + 'once there is a measurement to check.'),
      list,
    ]);
    this.renderSelfTest(vm.selfTest);
    return section;
  }

  /** @returns {HTMLElement} */
  buildClaimLegend() {
    const list = el('ul', { class: 'pt-legend' });
    for (const kind of BADGE_KINDS) {
      const spec = BADGE_SPEC[kind];
      list.appendChild(el('li', {}, [
        badgeNode(kind),
        text(' '),
        el('span', { class: 'pt-fine' }, [spec.meaning]),
      ]));
    }

    return el('section', { class: 'pt-section', id: 'claims' }, [
      el('h2', { class: 'pt-h2' }, ['What this measures, and what it does not']),
      prose('p', 'pt-prose', CLAIM_LEGEND_INTRO),
      list,
      el('h3', { class: 'pt-h3' }, ['What it will never tell you']),
      prose('p', 'pt-prose',
        'A browser has no raw sockets. It cannot name a single cable your connection used, it '
        + 'cannot list the machines in between, and it cannot tell you where you are. This page '
        + 'never plots you: the point every distance starts from is the facility Cloudflare '
        + 'names as having terminated this connection, which is Cloudflare stating a fact about '
        + 'its own network.'),
      prose('p', 'pt-prose',
        'This is an independent project. It is not affiliated with, endorsed by, or connected to '
        + 'Amazon, Google, Cloudflare, Fastly, or any other company named on this page. Those '
        + 'names appear because the page measures endpoints those companies publish, and a '
        + 'measurement of a public endpoint is not an endorsement by its owner.'),
      provenanceBlock('p', 'pt-fine', 'REPORTED', METHODS.PROVIDER_REGION_CATALOGUE,
        PROVIDER_COORDINATE_EVIDENCE.sentence),
    ]);
  }

  /**
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   * @returns {HTMLElement}
   */
  buildSourcesSection(vm) {
    const list = el('ul', { class: 'pt-sources' });
    for (const s of vm.sources) {
      const src = SOURCES[s.id];
      // The whole entry is REPORTED: a source title, its address and the attribution sentence
      // are all statements about where a value came from, and several titles carry a figure of
      // their own (a fibre part number, an ellipsoid year, a property identifier).
      list.appendChild(el('li', {
        'data-claim-badge': 'REPORTED',
        'data-claim-method': 'A citation. The title, the address and the attribution sentence '
          + 'are recorded in the source registry in this repository, which also records exactly '
          + 'what was taken from each source and under what licence.',
      }, [
        el('div', {}, [el('a', { href: s.url, rel: 'noreferrer' }, [src.title])]),
        el('div', { class: 'pt-fine' }, [s.attribution]),
        badgeNode('REPORTED'),
      ]));
    }
    return el('section', { class: 'pt-section', id: 'sources' }, [
      el('h2', { class: 'pt-h2' }, ['Data and attribution']),
      prose('p', 'pt-prose',
        'Everything in the headline is either your own measurement or arithmetic over two '
        + 'physical constants. No licensed dataset sits anywhere in that path, which is also why '
        + 'this tool works on a locked down network.'),
      list,
    ]);
  }

  /**
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   * @returns {HTMLElement}
   */
  buildColophon(vm) {
    return el('footer', { class: 'pt-section' }, [
      el('hr', { class: 'pt-rule' }),
      provenanceBlock('p', 'pt-fine', 'REPORTED', METHODS.PROVIDER_REGION_CATALOGUE,
        'Region codes, region names and endpoint hostnames were read from the providers own '
        + 'published catalogues on ' + vm.endpointSnapshotDate + '. That date is on screen so a '
        + 'screenshot taken later says how old its region table was.'),
    ]);
  }

  /** @returns {HTMLElement} */
  buildLiveRegion() {
    const node = el('div', { class: 'pt-visually-hidden', role: 'status', 'aria-live': 'polite' });
    this.refs.announce = node;
    return node;
  }

  /* ------------------------------------------------------------------------------------------
   * State changes.
   * ---------------------------------------------------------------------------------------- */

  /**
   * Announce something to a screen reader without moving focus. DESIGN 6.6: camera moves and
   * state changes announce through a polite live region.
   * @param {string} message No figure in it; a figure would be a number with no badge.
   */
  announce(message) {
    if (/\d/.test(message)) {
      throw new TypeError('announce(): a live region message must not contain a figure.');
    }
    this.refs.announce.textContent = message;
  }

  /** @param {'idle'|'measuring'|'done'|'no-network'} state */
  setState(state) {
    const b = this.refs.measureButton;
    if (state === 'measuring') {
      b.setAttribute('disabled', '');
      b.textContent = COPY.measuringButton;
      this.refs.status.textContent = COPY.statusMeasuring;
      this.announce(COPY.statusMeasuring);
    } else if (state === 'done') {
      b.removeAttribute('disabled');
      b.textContent = COPY.measureButton;
      this.refs.status.textContent = COPY.statusDone;
      this.announce(COPY.statusDone);
    } else if (state === 'no-network') {
      b.removeAttribute('disabled');
      b.textContent = COPY.measureButton;
      this.refs.status.textContent = PORT_MESSAGES.noNetwork;
      this.announce(PORT_MESSAGES.noNetwork);
    } else {
      this.refs.status.textContent = COPY.statusIdle;
    }
  }

  /**
   * The observer readout over the globe. The facility is REPORTED; its coordinate is a city
   * centre this tool chose, which is INFERRED, and the two are never conflated.
   * @param {{label:string, colo:string|null, source:string}} observer
   * @param {import('../core/claim.js').Claim} coloClaim
   */
  showObserver(observer, coloClaim) {
    const panel = this.refs.observerPanel;
    clear(panel);
    panel.removeAttribute('hidden');
    const line = el('p', { class: 'pt-fine-panel' });
    line.appendChild(text(observer.source === 'cloudflare-colo'
      ? 'Every distance below starts from the facility that terminated this connection: '
      : 'Every distance below starts from the city you picked: '));
    line.appendChild(claimNode(coloClaim, { showMethod: 'sr' }));
    panel.appendChild(line);
  }

  /* ------------------------------------------------------------------------------------------
   * The rows and the three segment bars.
   * ---------------------------------------------------------------------------------------- */

  /**
   * DESIGN 5, seconds 4 to 7, stage one. The physics segment can fill before ANY measurement
   * has landed, because a floor is two coordinates and a constant. That is not a loading
   * animation dressed up: it is the honest shape of what is known when, and watching the
   * unavoidable part of the number appear first is the argument being made visually before a
   * word of it is read.
   *
   * @param {{endpointId:string, regionName:string, city:string, regionCode:string,
   *          floorMs:number, distanceKm:number, floorClaim:import('../core/claim.js').Claim,
   *          distanceClaim:import('../core/claim.js').Claim}[]} pending
   * @param {number} widestMs The scale the bars are drawn against.
   */
  showFloors(pending, widestMs) {
    const tbody = this.refs.tbody;
    clear(tbody);
    this.rowNodes.clear();
    this.refs.resultSection.removeAttribute('hidden');

    for (const p of pending) {
      const { tr, segs } = this.buildRowSkeleton(p);
      tbody.appendChild(tr);
      this.rowNodes.set(p.endpointId, { tr, segs });
      this.setSegmentWidths(p.endpointId, { physicsMs: p.floorMs, accessMs: 0, routeMs: 0 },
        widestMs, 'floors');
    }
  }

  /**
   * @param {{endpointId:string, regionName:string, city:string, regionCode:string,
   *          floorClaim:import('../core/claim.js').Claim,
   *          distanceClaim:import('../core/claim.js').Claim}} p
   */
  buildRowSkeleton(p) {
    const segs = {
      physics: el('div', { class: 'pt-seg pt-seg-physics' }),
      access: el('div', { class: 'pt-seg pt-seg-access' }),
      route: el('div', { class: 'pt-seg pt-seg-route' }),
    };
    const bar = el('div', { class: 'pt-bar', 'aria-hidden': 'true' },
      SEGMENT_ORDER.map((k) => segs[k]));

    // Every string in this cell, the region code included, is a factual identifier taken from
    // the provider own published catalogue, so the cell carries the REPORTED badge as a whole.
    const regionCell = el('th', {
      scope: 'row',
      'data-claim-badge': 'REPORTED',
      'data-claim-method': METHODS.PROVIDER_REGION_CATALOGUE,
    }, [
      el('span', { class: 'pt-row-region' }, [p.city]),
      el('span', { class: 'pt-fine' }, [p.regionName]),
      el('span', { class: 'pt-fine pt-mono' }, [p.regionCode]),
    ]);

    const tr = el('tr', { tabindex: '0', 'data-endpoint': p.endpointId });
    tr.addEventListener('focus', () => this.onSelectRow(p.endpointId));
    tr.addEventListener('click', () => this.onSelectRow(p.endpointId));

    append(tr, [
      regionCell,
      el('td', {}, [claimNode(p.distanceClaim, { showMethod: 'sr' })]),
      el('td', { class: 'pt-cell-roundtrip' }, []),
      el('td', { class: 'pt-bar-cell' }, [bar]),
      el('td', { class: 'pt-cell-physics' }, [claimNode(p.floorClaim, { showMethod: 'sr' })]),
      el('td', { class: 'pt-cell-access' }, []),
      el('td', { class: 'pt-cell-route' }, []),
      el('td', { class: 'pt-cell-ratio' }, []),
      el('td', { class: 'pt-cell-verdict pt-fine' }, []),
    ]);
    return { tr, segs };
  }

  /**
   * @param {string} endpointId
   * @param {{physicsMs:number, accessMs:number, routeMs:number}} parts
   * @param {number} widestMs
   * @param {'idle'|'floors'|'full'} stage
   */
  setSegmentWidths(endpointId, parts, widestMs, stage) {
    const node = this.rowNodes.get(endpointId);
    if (!node || widestMs <= 0) return;
    const visible = segmentsVisibleAt(stage);
    for (const key of SEGMENT_ORDER) {
      const ms = visible.includes(key) ? parts[key + 'Ms'] : 0;
      node.segs[key].style.width = (ms / widestMs * 100).toFixed(4) + '%';
    }
  }

  /**
   * DESIGN 5, seconds 4 to 10. The run is in, so the access baseline exists and the remaining
   * two segments can animate, in order, on every row at once. Then the rows re sort worst first.
   *
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   * @param {import('../core/contracts/decomposition.js').DecompositionRun} run
   */
  showResult(vm, run, excluded) {
    const widest = Math.max(...vm.rows.map((r) => r.segments.totalMs), 1);
    const tbody = this.refs.tbody;

    // Rows already exist from the floors stage. Fill the remaining cells in place, then move
    // them into worst first order, so the reader sees a re sort rather than a redraw.
    for (const row of vm.rows) {
      const node = this.rowNodes.get(row.endpointId);
      if (!node) continue;
      this.fillRowCells(node.tr, row);
      this.setSegmentWidths(row.endpointId, row.segments, widest, 'full');
    }

    for (const row of vm.rows) {
      const node = this.rowNodes.get(row.endpointId);
      if (node) tbody.appendChild(node.tr);
    }

    // EVERY OTHER ROW GETS ITS REASON, AND THIS IS NOT TIDYING UP.
    //
    // A row appears the moment the observer point is known, because its distance and its floor
    // are arithmetic and need nothing from the network. The run then produces a figure for most
    // of those rows and, sometimes, not for all of them: an endpoint that did not answer, one
    // whose samples were too far apart to report a single number, one the faster than light
    // screen dropped. Until this loop existed those rows kept the empty cells they were born
    // with, and an empty cell is the reader supplying their own explanation. The one they
    // supply is "zero" (DESIGN trap 13; a blank cell with no explanation is not an option).
    //
    // Found by opening the page rather than by a test: six of twelve rows on the capture
    // fixture, and the row the faster than light screen had just dropped on a live run.
    const reasons = new Map();
    for (const d of (run && run.defects) || []) {
      if (d && d.endpointId) reasons.set(d.endpointId, (d.defect && d.defect.detail) || null);
    }
    for (const x of excluded || []) {
      if (!x || !x.endpointId) continue;
      reasons.set(x.endpointId, [x.reason, x.failureReason].filter(Boolean).join(' '));
    }
    for (const [endpointId, node] of this.rowNodes) {
      if (vm.rows.some((r) => r.endpointId === endpointId)) continue;
      this.fillUnmeasuredRow(node, reasons.get(endpointId) || ROW_WITHOUT_A_FIGURE);
      tbody.appendChild(node.tr);
    }

    this.renderResultNotes(vm, run);
  }

  /**
   * A row with a distance and a floor but no measurement. The two arithmetic cells stay exactly
   * as they were, and every cell that would have held a measured figure says why it does not.
   *
   * @param {{tr:HTMLElement, segs:Record<string,HTMLElement>}} node
   * @param {string} reason
   */
  fillUnmeasuredRow(node, reason) {
    const tr = node.tr;
    tr.setAttribute('data-row-state', 'no-figure');
    const put = (selector, child) => {
      const cell = tr.querySelector(selector);
      if (!cell) return;
      clear(cell);
      if (child) cell.appendChild(child);
    };
    // MEASURED provenance: the sentence is a statement about what this run observed on this
    // machine, or failed to, and not a figure the page is pretending to have.
    put('.pt-cell-roundtrip', provenanceBlock('span', 'pt-fine', 'MEASURED',
      'Stated by this page about its own run, in place of a figure the run did not produce.',
      reason));
    put('.pt-cell-access', null);
    put('.pt-cell-route', null);
    put('.pt-cell-ratio', provenanceBlock('span', 'pt-fine', 'COMPUTED', METHODS.ROUTE_RATIO,
      NO_RATIO_WITHOUT_A_ROUND_TRIP));
    put('.pt-cell-verdict', null);
    // The bar keeps its floor segment and nothing is stacked on it, because nothing was
    // measured to stack.
    for (const k of ['access', 'route']) node.segs[k].style.width = '0%';
  }

  /**
   * @param {HTMLElement} tr
   * @param {import('../core/contracts/viewmodel.js').ViewRow} row
   */
  fillRowCells(tr, row) {
    const put = (selector, node) => {
      const cell = tr.querySelector(selector);
      if (!cell) return;
      clear(cell);
      if (node) cell.appendChild(node);
    };
    put('.pt-cell-roundtrip', claimNode(row.cells.roundTrip, { showMethod: 'sr' }));
    put('.pt-cell-physics', claimNode(row.cells.physics, { showMethod: 'sr' }));
    put('.pt-cell-access', claimNode(row.cells.access, { showMethod: 'sr' }));
    put('.pt-cell-route', claimNode(row.cells.route, { showMethod: 'sr' }));

    // DESIGN trap 2: under the distance gate there is no ratio and no verdict, and the reader is
    // told why rather than left with a blank cell.
    if (row.cells.ratio) {
      put('.pt-cell-ratio', claimNode(row.cells.ratio, { showMethod: 'sr' }));
      put('.pt-cell-verdict', el('span', {}, [row.verdictText || '']));
    } else {
      // The ratio this row does not show is defined over whatever its round trip cell holds, so
      // a capture fixture row names the fixture ratio, never the warm one.
      put('.pt-cell-ratio', provenanceBlock('span', 'pt-fine', 'COMPUTED',
        row.cells.roundTrip.method === METHODS.FIXTURE_TCP_CONNECT ? METHODS.FIXTURE_ROUTE_RATIO : METHODS.ROUTE_RATIO,
        /** @type {string} */ (row.suppressedReason)));
      put('.pt-cell-verdict', null);
    }
  }

  /**
   * Defects and exclusions, counted and named. DESIGN trap 3 and trap 13: never hidden, never
   * averaged in, never a zero standing in for a thing that did not happen.
   * @param {import('../core/contracts/viewmodel.js').ViewModel} vm
   * @param {import('../core/contracts/decomposition.js').DecompositionRun} run
   */
  renderResultNotes(vm, run) {
    const notes = this.refs.resultNotes;
    clear(notes);
    if (vm.defectCount === 0 && vm.unstableCount === 0 && vm.unusableCount === 0) {
      notes.appendChild(prose('p', 'pt-fine',
        'Every endpoint answered, every answer was slower than light for its own geography, and '
        + 'every set of samples was stable enough to report.'));
      return;
    }
    notes.appendChild(provenanceBlock('p', 'pt-fine', 'MEASURED',
      'Counts of rows excluded from the result by this page own screens, reported rather than '
      + 'dropped quietly.',
      'Excluded from the table above: ' + vm.defectCount + ' as faster than light for the '
      + 'stated geography, ' + vm.unstableCount + ' as too variable to report a single number, '
      + 'and ' + vm.unusableCount + ' because the request failed or was refused. An excluded row '
      + 'is never averaged in and never clamped.'));
  }

  /* ------------------------------------------------------------------------------------------
   * The headline sentence, with the figures counting up.
   * ---------------------------------------------------------------------------------------- */

  /**
   * DESIGN 5, seconds 7 to 10. The sentence composes itself with the four figures counting up.
   *
   * The figures count up FROM ZERO, never between two real values. A figure that animated
   * between two measurements would be showing, for several hundred milliseconds, numbers this
   * page never measured. Counting from zero is unmistakably an animation.
   *
   * @param {{sentence:string, parts:import('./parts.js').Part[], cells:Record<string, import('../core/claim.js').Claim>}} headline
   * @param {{now:()=>number, schedule:(cb:Function)=>any}} clock
   */
  showHeadline(headline, clock) {
    const node = this.refs.headline;
    clear(node);
    renderParts(node, headline.parts);
    node.setAttribute('aria-label', headline.sentence);

    const timing = timingFor(this.reducedMotion);
    if (timing.countUpMs <= 0) return;

    const animated = [];
    const claimNodes = node.querySelectorAll('.pt-claim[data-claim-unit="ms"]');
    const claims = headline.parts.filter((p) => p.kind === 'claim'
      && /** @type {any} */ (p).claim.unit === 'ms');
    claimNodes.forEach((n, i) => {
      if (claims[i]) animated.push({ node: n, claim: /** @type {any} */ (claims[i]).claim });
    });

    driveCountUp({
      durationMs: timing.countUpMs,
      now: clock.now,
      schedule: clock.schedule,
      onFrame: (fraction) => {
        for (const a of animated) {
          updateClaimNode(a.node, fraction >= 1 ? a.claim : scaleClaim(a.claim, fraction));
        }
      },
    });
  }

  /* ------------------------------------------------------------------------------------------
   * The maths panel.
   * ---------------------------------------------------------------------------------------- */

  /**
   * DESIGN 5, the second beat. Every intermediate term, printed.
   * @param {Object} input See maths.buildMaths.
   */
  showMaths(input) {
    const steps = buildMaths(input);
    const body = this.refs.mathsBody;
    clear(body);

    const list = el('ol', { class: 'pt-steps' });
    for (const step of steps) {
      const item = el('li', { class: 'pt-step' }, [
        el('h3', { class: 'pt-step-label' }, [step.label]),
        prose('p', 'pt-prose-panel', step.lead),
      ]);
      for (const line of step.lines) {
        item.appendChild(renderParts(el('p', { class: 'pt-expr' }), line));
      }
      if (step.samples) item.appendChild(this.buildSamples(step.samples));
      if (step.sourceId && SOURCES[step.sourceId]) {
        item.appendChild(provenanceBlock('p', 'pt-fine-panel', 'REPORTED',
          'Attribution text fixed by the source registry in this repository.',
          SOURCES[step.sourceId].attribution));
      }
      list.appendChild(item);
    }
    body.appendChild(list);
  }

  /**
   * All seven samples, in the order they were taken, with the minimum marked by a border and by
   * a word rather than by colour alone.
   * @param {{claim:import('../core/claim.js').Claim, isMin:boolean}[]} samples
   * @returns {HTMLElement}
   */
  buildSamples(samples) {
    const list = el('ul', { class: 'pt-samples' });
    for (const s of samples) {
      const li = el('li', { class: 'pt-sample' + (s.isMin ? ' pt-sample-min' : '') });
      li.appendChild(claimNode(s.claim, { showMethod: 'sr' }));
      if (s.isMin) li.appendChild(el('span', { class: 'pt-visually-hidden' }, ['the minimum, which is the figure this tool uses']));
      list.appendChild(li);
    }
    return list;
  }

  /* ------------------------------------------------------------------------------------------
   * The self test list.
   * ---------------------------------------------------------------------------------------- */

  /** @param {{label:string, passed:boolean, detail:string, parts?:import('./parts.js').Part[]}[]} results */
  renderSelfTest(results) {
    const list = this.refs.selfTestList;
    clear(list);
    for (const r of results) {
      const li = el('li');
      li.appendChild(el('span', { class: 'pt-status' }, [r.passed ? 'PASS' : 'FAIL']));
      li.appendChild(el('span', {}, [r.label]));
      const detail = el('span', { class: 'pt-fine' });
      if (r.parts) renderParts(detail, r.parts);
      li.appendChild(detail);
      list.appendChild(li);
    }
  }
}

/**
 * A Claim scaled to a fraction of its value, for the count up. Same unit, same badge, same
 * method: it is the same claim part way through being drawn, not a different claim.
 * @param {import('../core/claim.js').Claim} claim
 * @param {number} fraction
 * @returns {import('../core/claim.js').Claim}
 */
function scaleClaim(claim, fraction) {
  const value = typeof claim.value === 'number' ? claim.value * fraction : claim.value;
  const extra = { sourceId: claim.sourceId, decimals: claim.decimals, note: claim.note };
  if (claim.badge === 'MEASURED') return measured(value, claim.unit, claim.method, extra);
  if (claim.badge === 'COMPUTED') return computed(value, claim.unit, claim.method, extra);
  if (claim.badge === 'REPORTED') return reported(value, claim.unit, claim.method, extra);
  return inferred(value, claim.unit, claim.method, extra);
}
