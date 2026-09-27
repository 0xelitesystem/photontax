// THE OFFLINE COMMANDS. DESIGN-CLI section 1: cities, plan, floor, selftest, sources, --help,
// --version, and the fact printed when no command is given. None of them opens a socket; the
// only command that does is measure, in ./report.js.
//
// Each command writes through the sink it is handed and returns an exit code. With --json it
// writes one document; otherwise it writes lines built from parts, so every figure is a claim
// rendered with its badge and every identifier comes from the bundled tables.
//
// No Node module is imported here except node:events, for the scripted run the self test
// drives through the real transport code without a socket.

import { EventEmitter } from 'node:events';
import {
  computed, renderClaimText, UNITS, METHODS,
} from '../core/claim.js';
import { greatCircleKm, greatCircleTerms } from '../core/geo.js';
import {
  floorTerms, EARTH_MEAN_RADIUS_KM, REQUESTS_PER_ENDPOINT, WARM_UP_REQUEST_COUNT,
  WARM_SAMPLE_COUNT,
} from '../core/constants.js';
import { ENDPOINTS, MEASURED_ENDPOINTS, MEASUREMENT_HOSTS } from '../core/data/endpoints.js';
import { SOURCES } from '../core/data/sources.js';
import { REGION_COORDINATE_DISCLAIMER } from '../core/data/disclaimers.js';
import { measure, measureEndpoint, CONCURRENCY, REQUEST_TIMEOUT_MS } from '../measure/index.js';
import { pickableCities } from '../ui/citypicker.js';
import { buildPreMeasurement } from '../ui/premeasurement.js';
import { coordinateClaims, stepHaversine, stepConstant, stepFloor } from '../ui/maths.js';
import {
  runSelfTest, checkFasterThanLight, checkDecompositionIdentity, checkAccessBaseline,
  checkDistanceGate, checkSampleStability,
} from '../ui/selftest.js';
import { t, c, pp, id, plainText, claimsIn } from './parts.js';
import {
  COPY, EXIT, NAME, REPO_URL, JSON_SCHEMA, CITATION_METHOD, CLI_SOURCE_IDS, PAGE_ONLY_SOURCE_IDS,
  userAgentFor,
} from './copy.js';
import { figure, documentFor } from './json.js';
import { sanitize, piecesFor } from './out.js';
import { NODE_PROBES, probeTarget, createNodeTransport } from './transport.js';
import { cliClassifyFailure } from './reasons.js';

/* --------------------------------------------------------------------------------------------
 * The plan. Counted from the shipped endpoint table and the shipped constants, never typed.
 * ------------------------------------------------------------------------------------------ */

/**
 * What measure will do. The page's requestPlan counts the facility request too (97); the
 * command line never makes it, so it counts its own, and the test suite holds this count equal
 * to the requests a run actually starts.
 */
export function cliPlan() {
  const endpoints = MEASURED_ENDPOINTS.length;
  const perEndpoint = REQUESTS_PER_ENDPOINT;
  return {
    endpoints,
    perEndpoint,
    warmUp: WARM_UP_REQUEST_COUNT,
    total: endpoints * perEndpoint,
    atOnce: CONCURRENCY,
    limitMs: REQUEST_TIMEOUT_MS,
    worstMs: Math.ceil(endpoints / CONCURRENCY) * perEndpoint * REQUEST_TIMEOUT_MS,
    hosts: [...MEASUREMENT_HOSTS],
  };
}

/** @param {ReturnType<typeof cliPlan>} plan */
export function planClaims(plan) {
  return {
    total: computed(plan.total, UNITS.UNITLESS, METHODS.CLI_REQUEST_PLAN),
    perEndpoint: computed(plan.perEndpoint, UNITS.UNITLESS, METHODS.CLI_REQUEST_PLAN),
    endpoints: computed(plan.endpoints, UNITS.UNITLESS, METHODS.CLI_REQUEST_PLAN),
    warmUp: computed(plan.warmUp, UNITS.UNITLESS, METHODS.CLI_REQUEST_PLAN),
    atOnce: computed(plan.atOnce, UNITS.UNITLESS, METHODS.ENDPOINTS_AT_ONCE),
    limit: computed(plan.limitMs, UNITS.MS, METHODS.REQUEST_TIME_LIMIT),
    worst: computed(plan.worstMs, UNITS.MS, METHODS.WORST_CASE_WALL_TIME),
  };
}

/** @param {ReturnType<typeof planClaims>} k */
export function planSentence(k) {
  return [
    t(COPY.planLead), c(k.total), t(COPY.planRequests), c(k.perEndpoint), t(COPY.planPerEndpoint),
    c(k.endpoints), t(COPY.planEndpoints), c(k.warmUp), t(COPY.planWarmUp), c(k.atOnce),
    t(COPY.planAtOnce), c(k.limit), t(COPY.planLimit), c(k.worst), t(COPY.planClose),
  ];
}

/**
 * The plan as lines for the mode in use: one sentence for the text form, one figure to a line
 * for the linear form, where each figure's own sentence carries its badge word and method.
 * @param {ReturnType<typeof planClaims>} k
 * @param {'text'|'plain'} mode
 * @returns {any[][]}
 */
export function planLines(k, mode) {
  if (mode !== 'plain') return [planSentence(k)];
  const p = COPY.planPlain;
  return [
    [t(p.total), c(k.total)],
    [t(p.perEndpoint), c(k.perEndpoint)],
    [t(p.endpoints), c(k.endpoints)],
    [t(p.warmUp), c(k.warmUp)],
    [t(p.atOnce), c(k.atOnce)],
    [t(p.limit), c(k.limit)],
    [t(p.worst), c(k.worst)],
    [t(p.hosts)],
  ];
}

/**
 * A place and its coordinate: one line in the text form, one figure to a line in the linear form.
 * @param {string} lead
 * @param {{id:string, label:string}} p
 * @param {{lat:any, lon:any}} cc
 * @param {'text'|'plain'} mode
 * @returns {any[][]}
 */
export function placeLines(lead, p, cc, mode) {
  if (mode === 'plain') {
    return [
      [t(lead + p.label + ' ('), id(p.id), t(').')],
      [t(COPY.latitude), c(cc.lat)],
      [t(COPY.longitude), c(cc.lon)],
    ];
  }
  return [[t(lead + p.label + ' ('), id(p.id), t(')' + COPY.floorCoordinate), c(cc.lat), t(', '), c(cc.lon), t('.')]];
}

/**
 * @param {ReturnType<typeof planClaims>} k
 * @param {ReturnType<typeof cliPlan>} plan
 */
export function planJSON(k, plan) {
  return {
    requests: figure(k.total),
    requestsPerEndpoint: figure(k.perEndpoint),
    endpoints: figure(k.endpoints),
    warmUpRequestsPerEndpoint: figure(k.warmUp),
    endpointsAtOnce: figure(k.atOnce),
    requestTimeLimit: figure(k.limit),
    worstCaseWallTime: figure(k.worst),
    hosts: [...plan.hosts],
    facilityEndpoint: COPY.planNoFacility,
    rules: COPY.planRules,
  };
}

/* --------------------------------------------------------------------------------------------
 * Places. Exact matching only, apart from letter case: an argument never becomes a coordinate
 * by guessing.
 * ------------------------------------------------------------------------------------------ */

/**
 * A city --city accepts, by id or by name.
 * @param {string} input
 * @returns {import('../ui/citypicker.js').PickableCity|null}
 */
export function resolveCity(input) {
  const cities = pickableCities();
  const exact = cities.find((x) => x.id === input || x.label === input);
  if (exact) return exact;
  const lower = input.toLowerCase();
  return cities.find((x) => x.id.toLowerCase() === lower || x.label.toLowerCase() === lower) || null;
}

/**
 * A place floor accepts: a pickable city, or any bundled region by id or region code.
 * @param {string} input
 * @returns {{id:string, label:string, lat:number, lon:number}|null}
 */
export function resolvePlace(input) {
  const city = resolveCity(input);
  if (city) return { id: city.id, label: city.label, lat: city.lat, lon: city.lon };
  const lower = input.toLowerCase();
  const e = ENDPOINTS.find((x) => x.id === input || x.region === input)
    || ENDPOINTS.find((x) => x.id.toLowerCase() === lower || x.region.toLowerCase() === lower);
  return e ? { id: e.id, label: e.city, lat: e.lat, lon: e.lon } : null;
}

/* --------------------------------------------------------------------------------------------
 * No command: the fact a reader gets before anything touches the network.
 * ------------------------------------------------------------------------------------------ */

/** @param {any} out @param {{version:string}} ctx */
export function runFact(out, ctx) {
  const fact = buildPreMeasurement();
  if (out.json) {
    out.document(documentFor('fact', ctx.version, {
      coordinateDisclaimer: fact.disclaimer,
      sentence: fact.sentence,
      from: { id: fact.from.id, label: fact.from.label },
      to: { id: fact.to.id, label: fact.to.label },
      distance: figure(fact.distance),
      floor: figure(fact.floor),
      network: COPY.factNoNetwork,
    }));
    return EXIT.DONE;
  }
  out.line([t(fact.disclaimer)]);
  out.blank();
  out.line(fact.parts);
  out.line([t(COPY.factNoNetwork)]);
  out.blank();
  out.line([t(COPY.factPointer)]);
  return EXIT.DONE;
}

/* --------------------------------------------------------------------------------------------
 * --help and --version.
 * ------------------------------------------------------------------------------------------ */

/**
 * The help text, as sections of parts, so its width can be checked without printing it. Every
 * item of DESIGN-CLI section 0 item 15 is here: purpose, usage, every flag, the plan, the privacy
 * line, the independence statement, the source attribution, exit codes, the licence and the
 * repository address.
 * @param {string} version
 * @param {'text'|'plain'} [mode]
 */
export function helpSections(version, mode = 'text') {
  const plan = cliPlan();
  const k = planClaims(plan);
  const sourceTitles = CLI_SOURCE_IDS.map((sid) => SOURCES[sid].title).join('; ');
  /** @param {readonly [string, string][]} rows */
  const rowsOf = (rows) => rows.map(([a, b]) => [[t(a)], [t(b)]]);
  return [
    { lines: [{ parts: [t(COPY.purpose)], indent: 0 }] },
    { lines: [{ parts: [t(COPY.purposeMore)], indent: 0 }] },
    { heading: COPY.helpUsage, items: rowsOf(COPY.usage), labelWidth: 35 },
    {
      heading: COPY.helpOptions,
      lines: [{ parts: [t(COPY.optionsLead)], indent: 2 }],
      items: rowsOf(COPY.options),
      labelWidth: 18,
    },
    { heading: COPY.helpEnvironment, items: rowsOf(COPY.environment), labelWidth: 6 },
    {
      heading: COPY.helpPlan,
      lines: [
        ...planLines(k, mode).map((parts) => ({ parts, indent: 2 })),
        ...plan.hosts.map((h) => ({ parts: [id(h)], indent: 4 })),
        { parts: [t(COPY.planNoFacility)], indent: 2 },
        { parts: [t(COPY.planRules)], indent: 2 },
      ],
    },
    {
      heading: COPY.helpPrivacy,
      lines: [
        { parts: [t(COPY.privacy)], indent: 2 },
        { parts: [t(COPY.userAgentLabel), id(userAgentFor(version))], indent: 2 },
      ],
    },
    { heading: COPY.helpIndependence, lines: [{ parts: [t(COPY.independence)], indent: 2 }] },
    {
      heading: COPY.helpSources,
      lines: [{ parts: [pp('REPORTED', COPY.sourcesLead + sourceTitles + '.', CITATION_METHOD), t(COPY.sourcesPointer)], indent: 2 }],
    },
    {
      heading: COPY.helpExitCodes,
      items: COPY.exitCodes.map(([key, text]) => [[id(String(/** @type {any} */ (EXIT)[key]))], [t(text)]]),
      labelWidth: 8,
    },
    { lines: [{ parts: [t(COPY.helpLicence + ' '), id(REPO_URL)], indent: 0 }] },
  ];
}

/** @param {any} out @param {{version:string}} ctx */
export function runHelp(out, ctx) {
  // Help is for people. With --json it is still printed as text, on stderr, so stdout stays a
  // clean channel for the one document a program asks for, and here there is none.
  const w = out.json
    ? { line: out.note, item: out.noteItem, blank: () => out.note([t('')]), heading: (/** @type {string} */ h) => out.note([t(h)]) }
    : { line: out.line, item: out.item, blank: out.blank, heading: out.heading };
  helpSections(ctx.version, out.mode).forEach((s, i) => {
    if (i > 0) w.blank();
    if (s.heading) w.heading(s.heading);
    for (const l of s.lines || []) w.line(l.parts, { indent: l.indent });
    for (const [label, body] of s.items || []) w.item(label, body, { labelWidth: s.labelWidth });
  });
  return EXIT.DONE;
}

/** @param {any} out @param {{version:string}} ctx */
export function runVersion(out, ctx) {
  if (out.json) {
    out.document(documentFor('version', ctx.version, {}));
    return EXIT.DONE;
  }
  out.line([t(NAME + ' '), id(ctx.version)]);
  return EXIT.DONE;
}

/* --------------------------------------------------------------------------------------------
 * cities, plan, sources.
 * ------------------------------------------------------------------------------------------ */

/** @param {any} out @param {{version:string}} ctx */
export function runCities(out, ctx) {
  const cities = pickableCities();
  if (out.json) {
    out.document(documentFor('cities', ctx.version, {
      coordinateDisclaimer: REGION_COORDINATE_DISCLAIMER,
      cities: cities.map((x) => ({ id: x.id, label: x.label })),
    }));
    return EXIT.DONE;
  }
  out.line([t(COPY.citiesLead)]);
  out.blank();
  const labelWidth = 2 + Math.max(...cities.map((x) => x.id.length)) + 2;
  for (const x of cities) out.item([id(x.id)], [t(x.label)], { labelWidth });
  return EXIT.DONE;
}

/** @param {any} out @param {{version:string}} ctx */
export function runPlan(out, ctx) {
  const plan = cliPlan();
  const k = planClaims(plan);
  const ua = userAgentFor(ctx.version);
  if (out.json) {
    out.document(documentFor('plan', ctx.version, { ...planJSON(k, plan), userAgent: ua, privacy: COPY.privacy }));
    return EXIT.DONE;
  }
  for (const l of planLines(k, out.mode)) out.line(l);
  for (const h of plan.hosts) out.line([id(h)], { indent: 2 });
  out.blank();
  out.line([t(COPY.planNoFacility)]);
  out.line([t(COPY.planRules)]);
  out.blank();
  out.line([t(COPY.privacy)]);
  out.line([t(COPY.userAgentLabel), id(ua)]);
  return EXIT.DONE;
}

/** @param {string} sid */
function sourceProse(sid) {
  const s = SOURCES[sid];
  const retrieved = s.retrieved ? ' Retrieved ' + s.retrieved + '.' : '';
  // What was taken is printed beside the licence, because a licence sentence can name it.
  return pp('REPORTED', s.title + '. ' + s.attribution + ' Licence: ' + s.licence + ' Taken from it: '
    + s.takes + retrieved + ' ' + s.url, CITATION_METHOD);
}

/** @param {any} out @param {{version:string}} ctx */
export function runSources(out, ctx) {
  if (out.json) {
    /** @param {string} sid */
    const entry = (sid) => {
      const s = SOURCES[sid];
      return {
        id: s.id, title: s.title, url: s.url, licence: s.licence, attribution: s.attribution, takes: s.takes,
        retrieved: s.retrieved, badge: 'REPORTED', method: CITATION_METHOD,
      };
    };
    out.document(documentFor('sources', ctx.version, {
      sources: CLI_SOURCE_IDS.map(entry),
      pageOnly: PAGE_ONLY_SOURCE_IDS.map(entry),
    }));
    return EXIT.DONE;
  }
  out.line([t(COPY.sourcesCommandLead)]);
  for (const sid of CLI_SOURCE_IDS) {
    out.blank();
    out.line([sourceProse(sid)]);
  }
  out.blank();
  out.line([pp('REPORTED', COPY.sourcesPageOnly + PAGE_ONLY_SOURCE_IDS.map((sid) => SOURCES[sid].title).join('; ') + '.', CITATION_METHOD)]);
  return EXIT.DONE;
}

/* --------------------------------------------------------------------------------------------
 * floor.
 * ------------------------------------------------------------------------------------------ */

/**
 * @param {any} out
 * @param {{version:string}} ctx
 * @param {{id:string, label:string, lat:number, lon:number}} from
 * @param {{id:string, label:string, lat:number, lon:number}} to
 */
export function runFloor(out, ctx, from, to) {
  const a = { lat: from.lat, lon: from.lon };
  const b = { lat: to.lat, lon: to.lon };
  const distanceKm = greatCircleKm(a, b);
  // Every term of the floor from the one function the page's maths panel documents, so the
  // command line cannot drift from it.
  const f = floorTerms(distanceKm);
  const floorMs = f.floorMs;
  const distance = computed(distanceKm, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { sourceId: 'iugg_mean_radius' });
  const floor = computed(floorMs, UNITS.MS, METHODS.FIBRE_FLOOR, { sourceId: 'corning_smf28' });
  const fromC = coordinateClaims(from.lat, from.lon);
  const toC = coordinateClaims(to.lat, to.lon);

  if (out.json) {
    const g = greatCircleTerms(a, b);
    const u = (/** @type {number} */ v, /** @type {number} */ d) => figure(computed(v, UNITS.UNITLESS, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: d }));
    /** @param {{id:string,label:string}} p @param {ReturnType<typeof coordinateClaims>} cc */
    const place = (p, cc) => ({ id: p.id, label: p.label, lat: figure(cc.lat), lon: figure(cc.lon) });
    out.document(documentFor('floor', ctx.version, {
      coordinateDisclaimer: REGION_COORDINATE_DISCLAIMER,
      from: place(from, fromC),
      to: place(to, toC),
      distance: figure(distance),
      floor: figure(floor),
      terms: {
        latitudeDifferenceRad: u(g.dPhiRad, 6),
        longitudeDifferenceRad: u(g.dLambdaRad, 6),
        haversineTerm: u(g.h, 6),
        centralAngleRad: u(g.centralAngleRad, 6),
        radius: figure(computed(EARTH_MEAN_RADIUS_KM, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 4, sourceId: 'iugg_mean_radius' })),
        distanceWorking: figure(computed(g.distanceKm, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 3, sourceId: 'iugg_mean_radius' })),
        speedOfLightInVacuum: figure(computed(f.cVacuumMS, UNITS.UNITLESS, METHODS.FIBRE_SPEED, { sourceId: 'si_metre' })),
        fibreGroupIndex: figure(computed(f.groupIndex, UNITS.UNITLESS, METHODS.FIBRE_SPEED, { decimals: 4, sourceId: 'corning_smf28' })),
        speedInFibre: figure(computed(f.vFibreKmS, UNITS.KM_PER_S, METHODS.FIBRE_SPEED, { decimals: 5, sourceId: 'corning_smf28' })),
        floorPerThousandKm: figure(computed(f.floorMsPer1000Km, UNITS.UNITLESS, METHODS.FIBRE_FLOOR, { decimals: 4, sourceId: 'corning_smf28' })),
        roundTripDistance: figure(computed(f.roundTripKm, UNITS.KM, METHODS.FIBRE_FLOOR, { decimals: 3, sourceId: 'corning_smf28' })),
      },
    }));
    return EXIT.DONE;
  }

  out.line([t(REGION_COORDINATE_DISCLAIMER)]);
  out.blank();
  for (const l of placeLines(COPY.floorFrom, from, fromC, out.mode)) out.line(l);
  for (const l of placeLines(COPY.floorTo, to, toC, out.mode)) out.line(l);
  for (const step of [stepHaversine(a, b), stepConstant(), stepFloor({ distanceKm, floorMs })]) {
    out.blank();
    out.heading(step.label);
    out.line([t(step.lead)]);
    for (const l of step.lines) out.line(l, { indent: 2 });
  }
  out.blank();
  out.line([t(COPY.floorDistance), c(distance), t('.')]);
  out.line([t(COPY.floorResult), c(floor), t(COPY.floorResultClose)]);
  return EXIT.DONE;
}

/* --------------------------------------------------------------------------------------------
 * selftest.
 * ------------------------------------------------------------------------------------------ */

/** What the scripted run adds to the clock per request. Never printed: nothing was measured. */
const SCRIPTED_STEP_MS = 300;

/**
 * A request starter that behaves like a keepAlive pool with one socket, entirely in memory: the
 * first request on a pool gets a fresh socket, every later one reports a reused socket, and each
 * response is a small body delivered on the next turn of the event loop. It exists so the self
 * test can drive the real transport code (reuse proof, body read, request count) with no socket.
 * @param {{t:number}} clock
 */
function scriptedStarter(clock) {
  return (/** @type {any} */ options) => {
    const pool = options.agent;
    const req = /** @type {any} */ (new EventEmitter());
    req.reusedSocket = pool.used === true;
    pool.used = true;
    req.destroy = () => req;
    req.end = () => {
      setImmediate(() => {
        req.emit('socket', pool.socket);
        clock.t += SCRIPTED_STEP_MS;
        const res = /** @type {any} */ (new EventEmitter());
        res.statusCode = 200;
        res.complete = true;
        res.destroy = () => {};
        req.emit('response', res);
        res.emit('data', new Uint8Array(42));
        res.emit('end');
        res.emit('close');
      });
    };
    return req;
  };
}

/**
 * The real engine, end to end, over the real command line transport code, with the scripted
 * starter in place of a socket. Nothing leaves the process.
 */
export async function scriptedRun() {
  const clock = { t: 0 };
  const now = () => clock.t;
  const transport = createNodeTransport({
    userAgent: userAgentFor('0.0.0'),
    now,
    startFor: () => scriptedStarter(clock),
    agentFor: () => ({ used: false, socket: new EventEmitter(), destroy() {} }),
  });
  const observer = pickableCities()[0];
  const result = await measure({
    pickedCity: { lat: observer.lat, lon: observer.lon, label: observer.label },
    concurrency: 1,
    deps: {
      now,
      probeFor: (/** @type {string} */ h) => transport.probeFor(h),
      measureEndpoint: (/** @type {any} */ e, /** @type {any} */ d) => measureEndpoint(e, { ...d, classifyFailure: cliClassifyFailure }),
    },
  });
  transport.close();
  return { result, transport };
}

/** A planted string for the sanitiser check: every kind of escape DESIGN-CLI item 3 names. */
export const PLANTED_ESCAPES = '\u001b[2J'
  + '\u001b]8;;https://example.invalid/\u0007link\u001b]8;;\u0007'
  + '\u001b]52;c;cGhvdG9udGF4\u0007'
  + '\u009b31m'
  + '\u202Egnp.exe'
  + '\u2066isolate\u2069'
  + 'del\u007f';

/** Legitimate printable non ASCII that must survive. */
export const LEGIT_TEXT = 'Montr\u00E9al, S\u00E3o Paulo, Z\u00FCrich, \u201Cquoted\u201D and \u2018quoted\u2019';

/** The command line checks. Pure except for the scripted run passed in. */
export function cliChecks(scripted) {
  const plan = cliPlan();

  const keys = Object.keys(NODE_PROBES).sort();
  const want = [...MEASUREMENT_HOSTS].sort();
  const tableOk = Object.isFrozen(NODE_PROBES)
    && keys.length === want.length && keys.every((k, i) => k === want[i])
    && keys.every((k) => {
      const target = probeTarget(k);
      return target.host === k && target.port === 443 && target.protocol === 'https:' && target.path === '/';
    });

  const cleaned = sanitize(PLANTED_ESCAPES + LEGIT_TEXT);
  const inert = !/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(cleaned);
  const sanitiserOk = inert && cleaned.endsWith(LEGIT_TEXT);

  let rendererOk = false;
  try {
    const probe = computed(1, UNITS.UNITLESS, METHODS.CLI_REQUEST_PLAN);
    let refusedDigit = false;
    try { piecesFor(['a figure of 5 typed into prose'], 'text'); } catch { refusedDigit = true; }
    let refusedCoercion = false;
    try { String(probe); } catch { refusedCoercion = true; }
    rendererOk = refusedDigit && refusedCoercion && renderClaimText(probe).endsWith(' [COMPUTED]');
  } catch {
    rendererOk = false;
  }

  const eps = scripted.result.measurement ? scripted.result.measurement.endpoints : [];
  const planOk = scripted.transport.requestsMade === plan.total
    && eps.length === plan.endpoints
    && eps.every((e) => e.status === 'ok')
    && Object.values(scripted.transport.reuse).every((r) => r.warmSamples === WARM_SAMPLE_COUNT && r.reused === WARM_SAMPLE_COUNT);

  return [
    { label: COPY.cliCheckProbeTable, passed: tableOk, parts: [t(COPY.cliCheckProbeTableDetail)] },
    { label: COPY.cliCheckSanitiser, passed: sanitiserOk, parts: [t(COPY.cliCheckSanitiserDetail)] },
    { label: COPY.cliCheckRenderer, passed: rendererOk, parts: [t(COPY.cliCheckRendererDetail)] },
    { label: COPY.cliCheckPlan, passed: planOk, parts: [t(COPY.cliCheckPlanDetail)] },
  ];
}

/** @param {any} out @param {{version:string}} ctx */
export async function runSelftest(out, ctx) {
  const arithmetic = runSelfTest();
  const scripted = await scriptedRun();
  const run = scripted.result.decomposition;
  const m = scripted.result.measurement;
  // The page's five checks over a completed run: together with the five arithmetic checks, the
  // ten that runSelfTest gives with no document. Their details quote the scripted figures, which
  // were made up, so only the label and the outcome are printed.
  const pageRun = run && m
    ? [
      checkFasterThanLight(run), checkDecompositionIdentity(run), checkAccessBaseline(run),
      checkDistanceGate(run), checkSampleStability(m),
    ]
    : [];
  const engine = scripted.result.selfTest;
  const cli = cliChecks(scripted);
  const groups = [
    { name: COPY.selftestArithmetic, lead: null, checks: arithmetic, details: true },
    { name: COPY.selftestRun, lead: COPY.selftestRunLead, checks: pageRun, details: false },
    { name: COPY.selftestEngine, lead: null, checks: engine, details: false },
    { name: COPY.selftestCli, lead: null, checks: cli, details: true },
  ];
  const passed = pageRun.length > 0 && engine.length > 0
    && groups.every((g) => g.checks.every((x) => x.passed));

  if (out.json) {
    out.document(documentFor('selftest', ctx.version, {
      passed,
      groups: groups.map((g) => ({
        name: g.name,
        note: g.lead,
        checks: g.checks.map((x) => ({
          label: x.label,
          passed: x.passed,
          detail: g.details ? plainText(/** @type {any} */ (x).parts) : null,
          // Every figure the detail quotes, as a figure object, so no number stands only in prose.
          figures: g.details ? claimsIn(/** @type {any} */ (x).parts).map(figure) : [],
        })),
      })),
    }));
    return passed ? EXIT.DONE : EXIT.FAILED;
  }

  groups.forEach((g, i) => {
    if (i > 0) out.blank();
    out.heading(g.name);
    if (g.lead) out.line([t(g.lead)]);
    for (const x of g.checks) {
      out.item([t(x.passed ? COPY.selftestPass : COPY.selftestFail)], [t(x.label)], { labelWidth: 8 });
      if (g.details) out.line(/** @type {any} */ (x).parts, { indent: 8 });
    }
  });
  out.blank();
  out.line([t(passed ? COPY.selftestAllPassed : COPY.selftestSomeFailed)]);
  return passed ? EXIT.DONE : EXIT.FAILED;
}

export { JSON_SCHEMA };
