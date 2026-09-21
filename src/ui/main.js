// BOOTSTRAP. The only module with a side effect, and the only one that owns state.
//
// DESIGN 5 (the reveal), DESIGN 6.4 (offline), DESIGN 6.5 (mobile), DESIGN 6.6 (accessibility),
// DESIGN 8.5 (the capture rig), traps 13 and 14.
//
// ORDER OF OPERATIONS ON LOAD, and the order is the promise:
//
//   1. Read the reader preferences: theme, and whether they have asked for reduced motion.
//   2. Build the idle view model. It already contains the pre click fact, the consent sentence,
//      the destination list, the sources and the arithmetic half of the self test.
//   3. Mount the page and focus the one control.
//   4. Stop.
//
// Nothing above touches the network, and there is no step that could. Every fetch in this
// product lives inside the registered measurement engine, whose hosts appear as literals in
// its own source so the build gate can compare the set used against the set declared in the
// page head (DESIGN trap 1).
//
// THE REVEAL, when the button is pressed:
//
//   the engine reports the observer point       the globe gets an origin and the observer
//                                               readout appears over it
//   every floor is computed at once             twelve physics segments fill instantly,
//                                               because a floor is two coordinates and a
//                                               constant and needs nothing from the network
//   each endpoint lands                         its arc draws, one at a time
//   the run completes                           the access baseline exists, so access and then
//                                               route fill, the rows re sort worst first, the
//                                               worst arc lights, and the sentence composes
//                                               with its figures counting up
//
// Browser only.

import { computed, reported, inferred, UNITS, METHODS } from '../core/claim.js';
import { greatCircleKm } from '../core/geo.js';
import { floorMsForDistanceKm } from '../core/constants.js';
import { MEASURED_ENDPOINTS, endpointById } from '../core/data/endpoints.js';
import { REGION_COORDINATE_DISCLAIMER } from '../core/data/disclaimers.js';
import { buildViewModel, sortWorstFirst, worstRow } from './viewmodel.js';
import { runSelfTest } from './selftest.js';
import { pp } from './parts.js';
import { Page } from './page.js';
import { buildGlobeInput } from './globeinput.js';
import { timingFor, arcDelayMs } from './reveal.js';
import {
  hasMeasurementEngine, getMeasurementEngine, hasRenderer, getRenderer, PORT_MESSAGES,
} from './ports.js';
import { cityById } from './citypicker.js';
import { fixtureMeasurementRun, decomposeFixture, FIXTURE_PROVENANCE } from './fixture.js';
import { el } from './dom.js';

/** Where the theme choice is remembered. The only thing this page ever stores on a device. */
const THEME_KEY = 'photontax:theme';

/**
 * The capture rig flags. DESIGN 8.5. Read from the address only, never from storage, so a URL
 * in a capture script is the whole configuration.
 * @param {string} search
 * @returns {{fixture:boolean, clean:boolean, replay:boolean}}
 */
export function captureFlags(search) {
  const q = new URLSearchParams(search || '');
  const on = (k) => q.get(k) === '1';
  return { fixture: on('fixture'), clean: on('clean'), replay: on('replay') };
}

/**
 * @param {Window} win
 * @returns {'dark'|'light'}
 */
export function initialTheme(win) {
  let stored = null;
  try { stored = win.localStorage.getItem(THEME_KEY); } catch { stored = null; }
  if (stored === 'dark' || stored === 'light') return stored;
  const prefersLight = win.matchMedia && win.matchMedia('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}

/** @param {Window} win @returns {boolean} */
export function prefersReducedMotion(win) {
  return Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/**
 * The application. One object, one state, no framework.
 */
export class App {
  /**
   * @param {Window} win
   * @param {{globeUrl?:string|null}} [opts] `globeUrl` is the same origin static file the
   *   build split the globe renderer into (DESIGN 6.3). Absent in a test and in any build
   *   that inlines the renderer, and the page is correct either way.
   */
  constructor(win, opts = {}) {
    this.win = win;
    this.doc = win.document;
    /** @type {string|null} */
    this.globeUrl = opts.globeUrl || null;
    this.flags = captureFlags(win.location ? win.location.search : '');
    this.theme = initialTheme(win);
    this.reducedMotion = prefersReducedMotion(win);
    /** @type {import('../core/contracts/decomposition.js').DecompositionRun|null} */
    this.decomposition = null;
    /** @type {import('../core/contracts/measurement.js').MeasurementRun|null} */
    this.measurement = null;
    /** @type {{lat:number, lon:number, label:string, source:string, colo:string|null}|null} */
    this.observer = null;
    /** @type {string[]} */
    this.arcIds = [];
    this.selectedEndpointId = null;
    /** @type {{lat:number, lon:number, label:string}|null} */
    this.pickedCity = null;
    /** @type {string|null} */
    this.reportedColo = null;
    /** @type {{label:string, passed:boolean, detail:string}[]} */
    this.engineSelfTest = [];
    /**
     * Rows the engine kept out of the result, each with the sentence saying why. They are not a
     * diagnostic: every one of them is a row on screen that has to explain itself.
     * @type {{endpointId:string, kind:string, reason:string, spreadMs:number|null,
     *         failureReason:string|null}[]}
     */
    this.excluded = [];
    this.page = new Page(this.doc, {
      reducedMotion: this.reducedMotion,
      hasEngine: hasMeasurementEngine() || this.flags.fixture,
      hasRenderer: hasRenderer(),
      rendererDeferred: Boolean(this.globeUrl) && !hasRenderer(),
    });
  }

  /** @param {HTMLElement} mountPoint */
  start(mountPoint) {
    this.applyTheme();

    const vm = buildViewModel({
      state: 'idle',
      selfTest: runSelfTest({}),
      // A deferred globe is a globe this build ships, so the coastline it draws is data this
      // product uses and Natural Earth is credited from the first frame. Crediting a source
      // only once its bytes have landed would put the attribution on screen a second after
      // the picture it belongs to.
      hasCoastline: hasRenderer() || Boolean(this.globeUrl),
    });
    this.page.mount(mountPoint, vm);

    this.page.onMeasure = () => { void this.measure(); };
    this.page.onSelfTest = () => this.refreshSelfTest();
    this.page.onThemeToggle = () => this.toggleTheme();
    this.page.onSelectRow = (id) => this.selectRow(id);
    this.page.onPickCity = (cityId) => { void this.pickCity(cityId); };

    if (this.flags.clean) this.doc.documentElement.setAttribute('data-capture-clean', '');
    if (this.flags.fixture) this.showFixtureBanner();

    this.mountRenderer();

    // The self test checks that need the live document can only run once there IS one.
    this.refreshSelfTest();

    if (!hasMeasurementEngine() && !this.flags.fixture) this.page.setState('idle');
    // preventScroll, and it is the difference between the reveal working and not working.
    //
    // DESIGN 5 second 0 is a painted globe with one focused control on screen. Focusing the
    // button without this option makes the browser scroll it into view, and because the globe
    // sits above it the whole scene goes off the top of the window before the reader has seen
    // it. The page opened part way down itself. Found by taking a screenshot of the loaded
    // page rather than by reading the code.
    //
    // The focus itself stays: a keyboard reader should land on the one control, and that is
    // the same requirement. Only the scrolling is unwanted.
    else this.page.refs.measureButton.focus({ preventScroll: true });

    // DESIGN 8.5: a capture must never depend on the capturing machine own connection.
    if (this.flags.fixture) void this.measure();

    // DESIGN 6.3, and it is the last thing start() does on purpose: everything above is the
    // opening frame, and the globe is not part of it.
    this.loadDeferredGlobe();
  }

  /* ------------------------------------------------------------------------------------------
   * The deferred globe. DESIGN 6.3.
   * ---------------------------------------------------------------------------------------- */

  /**
   * Fetch the globe AFTER the opening frame is on screen.
   *
   * The page says of itself: "This table is the result; the globe is decorative." A decorative
   * 32 KB of renderer, geometry, shaders and a coastline in front of first contentful paint
   * contradicts that sentence, so the build splits it into a separate same origin static file
   * and this loads it once there is something to look at.
   *
   * WHAT THIS DOES NOT CHANGE, and each one is proven by a test and by a gate:
   *
   *   No third party request happens before the click. This request is to this page own
   *   origin, by a relative path, for a file that ships in the same repository.
   *   It names no host, so there is no host for the CSP connect-src allowlist to declare and
   *   none for it to hide. The allowlist is byte for byte what it was.
   *   Nothing here is fetched to PAINT the page. The document carries no reference to it; the
   *   element is created after start() has already mounted the frame.
   *
   * The scheduling is two frames and then a task, which is the cheapest way to say "after the
   * browser has had a chance to paint" without a timer nobody can justify the length of.
   */
  loadDeferredGlobe() {
    if (!this.globeUrl) return;
    const run = () => this.requestGlobe();
    const raf = this.win.requestAnimationFrame;
    if (typeof raf === 'function') raf.call(this.win, () => raf.call(this.win, run));
    else run();
  }

  /** Create the element that pulls the deferred file in. @returns {HTMLElement|null} */
  requestGlobe() {
    const doc = this.doc;
    const node = doc.createElement('script');
    node.addEventListener('load', () => this.attachRenderer());
    node.addEventListener('error', () => this.page.showGlobeUnavailable(PORT_MESSAGES.globeDidNotArrive));
    // A relative path on this origin, never an absolute URL, so this cannot become a request
    // to a host scripts/gate-csp.mjs has not seen.
    node.setAttribute('src', this.globeUrl);
    (doc.head || doc.body).appendChild(node);
    return node;
  }

  /**
   * The deferred file ran and registered itself. Mount it into the space the stand in was
   * holding, and only then take the stand in away, so the frame never has a hole in it.
   */
  attachRenderer() {
    if (!hasRenderer()) {
      this.page.showGlobeUnavailable(PORT_MESSAGES.globeDidNotArrive);
      return;
    }
    this.page.clearGlobeStandin();
    this.mountRenderer();
    this.updateGlobe();
    this.refreshSelfTest();
  }

  applyTheme() {
    this.doc.documentElement.setAttribute('data-theme', this.theme);
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme();
    try { this.win.localStorage.setItem(THEME_KEY, this.theme); } catch { /* storage refused */ }
    this.updateGlobe();
    // The contrast check reads the custom properties the browser resolved, so re running it
    // after a theme change is a real check of the theme now on screen and not of the other one.
    this.refreshSelfTest();
    this.page.announce('Theme changed. The contrast check below has been recomputed for it.');
  }

  /**
   * The self test list on screen is the UI checks plus whatever the measurement engine checked
   * about its own run. Two teams check two different things and a reader wants one list.
   */
  refreshSelfTest() {
    const mine = runSelfTest({
      decomposition: this.decomposition,
      measurement: this.measurement,
      doc: this.doc,
      root: this.doc.body,
    });
    const theirs = this.engineSelfTest.map((chk) => ({
      label: chk.label,
      passed: chk.passed,
      detail: chk.detail,
      parts: [pp('MEASURED', chk.detail,
        'Checked by the measurement engine against the run it had just taken.')],
    }));
    this.page.renderSelfTest([...mine, ...theirs]);
  }

  showFixtureBanner() {
    const banner = el('div', { class: 'pt-shell' }, [
      el('p', {
        class: 'pt-panel pt-prose-panel',
        role: 'note',
        'data-claim-badge': 'MEASURED',
        'data-claim-method': 'Round trips captured on ' + FIXTURE_PROVENANCE.machine + ' on '
          + FIXTURE_PROVENANCE.takenOn + ' by ' + FIXTURE_PROVENANCE.method
          + ', shipped so that captures and tests stay identical over time.',
      }, [FIXTURE_PROVENANCE.banner + ' Taken on ' + FIXTURE_PROVENANCE.takenOn + '.']),
    ]);
    this.doc.body.insertBefore(banner, this.doc.body.firstChild);
  }

  /* ------------------------------------------------------------------------------------------
   * The globe.
   * ---------------------------------------------------------------------------------------- */

  mountRenderer() {
    const r = getRenderer();
    if (!r) return;
    try {
      r.mount(this.page.refs.canvasWrap);
      // Tabbing an arc in the globe's own keyboard list selects the matching table row, so a
      // keyboard reader gets the same tour a pointer reader gets (DESIGN 6.6).
      if (typeof r.onSelect === 'function') r.onSelect((id) => this.selectRow(id));
    } catch {
      // DESIGN 6.5: a failed context is named, never a black box.
      this.page.refs.canvasWrap.setAttribute('role', 'note');
      this.page.refs.canvasWrap.removeAttribute('aria-label');
      this.page.refs.canvasWrap.appendChild(el('div', { class: 'pt-panel' }, [
        el('p', { class: 'pt-prose-panel' }, [PORT_MESSAGES.noWebgl]),
      ]));
    }
  }

  updateGlobe(progress) {
    const r = getRenderer();
    if (!r) return;
    if (!this.observer) {
      // DESIGN 5 second 0. There is no observation point yet, so the scene is the bare planet.
      // It is still pushed, because a theme toggle before the first measurement has to reach
      // the globe, and because the contract can say "no point" without anybody inventing one.
      r.update(buildGlobeInput({
        observer: null,
        arcEndpointIds: [],
        theme: this.theme,
        reducedMotion: this.reducedMotion,
        idle: false,
        devicePixelRatio: this.win.devicePixelRatio,
      }));
      return;
    }
    const worst = this.decomposition ? worstRow(this.decomposition.rows) : null;
    r.update(buildGlobeInput({
      observer: this.observer,
      arcEndpointIds: this.arcIds,
      progress: progress || {},
      worstEndpointId: worst ? worst.endpointId : null,
      selectedEndpointId: this.selectedEndpointId,
      theme: this.theme,
      reducedMotion: this.reducedMotion,
      // DESIGN 6.5: a still globe at zero frames per second is visually identical and free,
      // and it is what keeps a phone from thermally throttling.
      idle: this.decomposition !== null,
      devicePixelRatio: this.win.devicePixelRatio,
    }));
  }

  /** @param {string} endpointId */
  selectRow(endpointId) {
    if (this.selectedEndpointId === endpointId) return;
    this.selectedEndpointId = endpointId;
    this.updateGlobe();
    if (this.decomposition && this.measurement) this.showMathsFor(endpointId);
    const e = endpointById(endpointId);
    if (e) this.page.announce('Selected ' + e.city + '. The working below now shows that row.');
  }

  /* ------------------------------------------------------------------------------------------
   * The measurement and the reveal.
   * ---------------------------------------------------------------------------------------- */

  /**
   * The button. DESIGN 5, second 3.
   *
   * The first call has no point to measure from, so the engine reads the serving facility,
   * finds that V1 ships no coordinate for it, and says so. The page then asks which city the
   * reader is nearest instead of approximating one (trap 7), and the second call is the one
   * that measures.
   */
  async measure() {
    if (this.flags.fixture) { this.runFixture(); return; }

    const engine = getMeasurementEngine();
    if (!engine) return;

    this.page.setState('measuring');
    try {
      const result = await engine({ pickedCity: this.pickedCity || null });
      this.consume(result);
    } catch {
      // DESIGN trap 13: a stated condition, never a spinner and never a zero.
      this.page.setState('no-network');
    }
  }

  /**
   * The reader answered the one question this page asks. Now the observer point exists, so
   * every floor exists, and the physics segments can fill before a single endpoint has answered.
   * @param {string} cityId
   */
  async pickCity(cityId) {
    const city = cityById(cityId);
    if (!city) return;
    this.pickedCity = { lat: city.lat, lon: city.lon, label: city.label };
    this.page.hideCityPicker();

    this.observer = {
      lat: city.lat, lon: city.lon, label: city.label,
      source: 'visitor-picked-city', colo: this.reportedColo,
    };
    this.onObserver(this.observer);

    const engine = getMeasurementEngine();
    if (!engine) return;

    this.page.setState('measuring');
    /** @type {Record<string, number>} */
    const progress = {};
    let landed = 0;

    try {
      const result = await engine({
        pickedCity: this.pickedCity,
        onEndpointDone: (m) => {
          // DESIGN 5, second 3: one arc at a time, as each region first answers.
          if (!this.arcIds.includes(m.endpointId)) this.arcIds.push(m.endpointId);
          progress[m.endpointId] = 0;
          const delay = arcDelayMs(landed, this.reducedMotion);
          landed += 1;
          this.win.setTimeout(() => {
            progress[m.endpointId] = 1;
            this.updateGlobe(progress);
          }, delay);
        },
      });
      this.consume(result);
    } catch {
      this.page.setState('no-network');
    }
  }

  /**
   * Take whatever the engine handed back and put it on screen, including the two outcomes that
   * are not a result. Neither of them becomes a blank, a spinner or a zero.
   * @param {import('./ports.js').EngineResult} result
   */
  consume(result) {
    // The measuring run does not ask the facility endpoint again (one request per visit, not
    // per call), so it reports no facility. That is not the facility going away: the first
    // press already learned it. Keep what is known rather than replacing a fact with a null.
    if (result.reportedColo) this.reportedColo = result.reportedColo;
    if (result.notices && result.notices.length) this.page.renderNotices(result.notices);
    this.engineSelfTest = result.selfTest || [];
    this.excluded = result.excluded || [];

    if (result.state === 'needs-city-pick') {
      this.page.setState('idle');
      this.page.refs.status.textContent = PORT_MESSAGES.needsCityPick;
      this.page.showCityPicker(this.reportedColo
        ? reported(this.reportedColo, UNITS.TEXT, METHODS.CLOUDFLARE_COLO)
        : null);
      return;
    }

    if (result.state === 'nothing-measured' || !result.measurement || !result.decomposition) {
      this.page.setState('no-network');
      this.page.refs.status.textContent = PORT_MESSAGES.nothingMeasured;
      return;
    }

    if (!this.observer) {
      const o = result.measurement.observer;
      this.observer = { lat: o.lat, lon: o.lon, label: o.label, source: o.source, colo: o.colo };
      this.onObserver(this.observer);
    }
    this.finish(result.measurement, result.decomposition);
  }

  /** DESIGN 8.5: a capture must never depend on the capturing machine own connection. */
  runFixture() {
    const run = fixtureMeasurementRun();
    this.observer = {
      lat: run.observer.lat, lon: run.observer.lon, label: run.observer.label,
      source: run.observer.source, colo: run.observer.colo,
    };
    this.onObserver(this.observer);
    this.arcIds = run.endpoints.map((m) => m.endpointId);
    this.finish(run, decomposeFixture(run));
  }

  /**
   * The observer point is known, so every floor is known. DESIGN 5: the physics segment fills
   * before anything has been measured, because it needs nothing from the network.
   * @param {{lat:number, lon:number, label:string, source:string, colo:string|null}} observer
   */
  onObserver(observer) {
    const coloClaim = observer.source === 'cloudflare-colo' && observer.colo
      ? reported(observer.colo, UNITS.TEXT, METHODS.CLOUDFLARE_COLO)
      // A city the visitor chose is not reported by anybody. It is INFERRED, and the sentence
      // that says so travels with it.
      : inferred(observer.label, UNITS.TEXT, METHODS.REGION_CITY_CENTRE, { note: REGION_COORDINATE_DISCLAIMER });
    this.page.showObserver(observer, coloClaim);

    const pending = MEASURED_ENDPOINTS.map((e) => {
      const distanceKm = greatCircleKm(observer, { lat: e.lat, lon: e.lon });
      const floorMs = floorMsForDistanceKm(distanceKm);
      return {
        endpointId: e.id,
        regionName: e.providerRegionName,
        city: e.city,
        regionCode: e.region,
        distanceKm,
        floorMs,
        distanceClaim: computed(distanceKm, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { sourceId: 'iugg_mean_radius' }),
        floorClaim: computed(floorMs, UNITS.MS, METHODS.FIBRE_FLOOR, { sourceId: 'corning_smf28' }),
      };
    });

    // The bars are drawn against the widest FLOOR at this stage, because no round trip is known
    // yet. When the run lands the scale becomes the widest round trip, and every bar rescales
    // together, so no bar ever overflows its own row.
    const widest = Math.max(...pending.map((p) => p.floorMs), 1);
    this.page.showFloors(pending, widest);
    this.updateGlobe();
  }

  /**
   * @param {import('../core/contracts/measurement.js').MeasurementRun} run
   * @param {import('../core/contracts/decomposition.js').DecompositionRun} decomposition
   */
  finish(run, decomposition) {
    this.measurement = run;
    this.decomposition = decomposition;

    const vm = buildViewModel({
      state: 'done',
      decomposition,
      selfTest: runSelfTest({ decomposition, measurement: run }),
      hasCoastline: hasRenderer(),
    });

    this.page.showResult(vm, decomposition, this.excluded);
    this.page.setState('done');

    const worst = worstRow(decomposition.rows);
    if (worst) {
      this.selectedEndpointId = worst.endpointId;
      this.arcIds = sortWorstFirst(decomposition.rows).map((r) => r.endpointId);
      this.showMathsFor(worst.endpointId);
    }
    this.updateGlobe();

    const timing = timingFor(this.reducedMotion);
    const clock = {
      now: () => this.win.performance.now(),
      schedule: (cb) => this.win.requestAnimationFrame(cb),
    };
    const show = () => { if (vm.headline) this.page.showHeadline(vm.headline, clock); };
    if (timing.headlineDelayMs > 0) this.win.setTimeout(show, timing.headlineDelayMs);
    else show();

    this.refreshSelfTest();
  }

  /** @param {string} endpointId */
  showMathsFor(endpointId) {
    if (!this.decomposition || !this.measurement) return;
    const row = this.decomposition.rows.find((r) => r.endpointId === endpointId);
    const m = this.measurement.endpoints.find((x) => x.endpointId === endpointId);
    if (!row || !m || !this.observer) return;
    this.page.showMaths({
      row,
      run: this.decomposition,
      observer: this.observer,
      measurement: m,
    });
  }
}

/**
 * Start the page. Called from the inline bootstrap at the bottom of the document, after the
 * other teams modules have had their chance to register themselves.
 * @param {Window} win
 * @returns {App}
 */
export function boot(win, opts = {}) {
  const mountPoint = win.document.getElementById('app');
  if (!mountPoint) throw new Error('boot: the page has no #app element to mount into');
  const app = new App(win, opts);
  app.start(mountPoint);
  return app;
}
