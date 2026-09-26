// THE MEASURE COMMAND. DESIGN-CLI section 1, the one command that uses the network.
//
// It runs the page's own engine, unchanged, through the command line transport: measure() from
// src/measure/index.js with deps.probeFor pointed at ./transport.js and the command line failure
// sentences injected through deps.measureEndpoint, exactly as the core step documented. The
// estimator, the spread rule, the faster than light screen, the access baseline and the route
// arithmetic are therefore the page's, line for line. What this module adds is the order a
// terminal reads in, and the facts only a Node process can see: the connection phases of each
// warm up connection, the proof that every warm sample rode that connection, and the count of
// requests actually issued.
//
// THE ORDER, as DESIGN-CLI section 1 lists it: the plan on stderr before anything is contacted;
// then, on stdout, the region coordinate disclaimer, the observer point, the headline, every
// endpoint with physics, access and route from displaySegments and its verdict verbatim, the
// unstable rows as a spread and a sentence, the faster than light rows as defects, every other
// excluded row with its reason, the connection phases sidecar, the request count, the self test
// on this run, how each figure was obtained, the sources pointer and the independence line.
//
// THE HEADLINE is the command line's own, built from parts here. The page says "Your own last
// mile charges", which is true of a person at a desk and false of a build server, so the
// command line says "this machine's access cost" instead.

import { measured, computed, reported, UNITS, METHODS } from '../core/claim.js';
import { greatCircleKm } from '../core/geo.js';
import { floorMsForDistanceKm, WARM_SAMPLE_COUNT } from '../core/constants.js';
import { endpointById, MEASURED_ENDPOINTS } from '../core/data/endpoints.js';
import { REGION_COORDINATE_DISCLAIMER, NO_RATIO_WITHOUT_A_ROUND_TRIP } from '../core/data/disclaimers.js';
import { VERDICT_TEXT } from '../core/contracts/decomposition.js';
import { measure, measureEndpoint, RUN_NOTICES } from '../measure/index.js';
import { rowClaims, sortWorstFirst, worstRow } from '../ui/viewmodel.js';
import { coordinateClaims } from '../ui/maths.js';
import { t, c, pp, id, claimsIn } from './parts.js';
import { COPY, EXIT, userAgentFor } from './copy.js';
import { figure, absent, documentFor } from './json.js';
import { cliPlan, planClaims, planLines, planJSON } from './commands.js';
import { createNodeTransport } from './transport.js';
import { cliClassifyFailure } from './reasons.js';

/* --------------------------------------------------------------------------------------------
 * The environment. Read once, before anything is contacted.
 * ------------------------------------------------------------------------------------------ */

/** Environment names that ask Node to use a proxy. None is honoured; each one earns a notice. */
export const PROXY_VARIABLES = Object.freeze([
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NODE_USE_ENV_PROXY',
]);

/**
 * What the environment asks for, as three facts. Pure.
 * @param {Record<string, string|undefined>} env
 * @param {readonly string[]} [execArgv]
 * @returns {{tlsOff:boolean, extraCa:boolean, proxy:boolean}}
 */
export function environmentFacts(env, execArgv = []) {
  const set = (/** @type {string} */ k) => typeof env[k] === 'string' && /** @type {string} */ (env[k]).trim() !== '';
  const flagged = execArgv.includes('--use-env-proxy')
    || (typeof env.NODE_OPTIONS === 'string' && /(?:^|\s)--use-env-proxy(?:\s|$)/.test(env.NODE_OPTIONS));
  return {
    // Node turns certificate checking off for exactly this value. The transport asks for checking
    // explicitly regardless, but a run in an environment that asked for it off is refused rather
    // than argued with.
    tlsOff: typeof env.NODE_TLS_REJECT_UNAUTHORIZED === 'string' && env.NODE_TLS_REJECT_UNAUTHORIZED.trim() === '0',
    extraCa: set('NODE_EXTRA_CA_CERTS'),
    proxy: PROXY_VARIABLES.some(set) || flagged,
  };
}

/* --------------------------------------------------------------------------------------------
 * The headline. The command line's own, from parts.
 * ------------------------------------------------------------------------------------------ */

/**
 * The sentence about the endpoint with the largest route surplus.
 * @param {import('../core/contracts/decomposition.js').RowDecomposition} row
 * @returns {{parts:any[], cells:Record<string, import('../core/claim.js').Claim>}}
 */
export function cliHeadline(row) {
  const e = endpointById(row.endpointId);
  if (!e) throw new RangeError('cliHeadline: unknown endpoint ' + row.endpointId);
  const { cells } = rowClaims(row);
  /** @type {Record<string, import('../core/claim.js').Claim>} */
  const out = { roundTrip: cells.roundTrip, physics: cells.physics, access: cells.access, route: cells.route };
  const parts = [
    t(e.city + COPY.headlineCosts), c(cells.roundTrip),
    t(COPY.headlinePhysics), c(cells.physics),
    t(COPY.headlineAccess), c(cells.access),
    t(COPY.headlineRoute), c(cells.route),
    t('.'),
  ];
  if (row.verdict === 'ON_THE_TABLE' && typeof row.msOnTheTable === 'number') {
    // The same figure and the same registered method as the page's headline.
    out.onTheTable = computed(row.msOnTheTable, UNITS.MS, METHODS.VERDICT_FROM_RATIO);
    parts.push(t(COPY.headlineOnTable), c(out.onTheTable), t(COPY.headlineOnTableClose));
  }
  return { parts, cells: out };
}

/* --------------------------------------------------------------------------------------------
 * The report model. Pure over an engine result and the transport's sidecar, so it is tested
 * with a scripted run and no socket.
 * ------------------------------------------------------------------------------------------ */

/**
 * @param {{id:string, label:string, lat:number, lon:number}} city
 * @param {string} endpointId
 * @returns {{distanceKm:number, floorMs:number}}
 */
function geometry(city, endpointId) {
  const e = /** @type {import('../core/data/endpoints.js').Endpoint} */ (endpointById(endpointId));
  const distanceKm = greatCircleKm({ lat: city.lat, lon: city.lon }, { lat: e.lat, lon: e.lon });
  return { distanceKm, floorMs: floorMsForDistanceKm(distanceKm) };
}

/** @param {number} km */
const distanceClaim = (km) => computed(km, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { sourceId: 'iugg_mean_radius' });
/** @param {number} ms */
const floorClaim = (ms) => computed(ms, UNITS.MS, METHODS.FIBRE_FLOOR, { sourceId: 'corning_smf28' });

/**
 * Everything the report states, as claims and fixed sentences.
 * @param {Object} input
 * @param {import('../measure/index.js').EngineResult} input.result
 * @param {{id:string, label:string, lat:number, lon:number}} input.city
 * @param {{phases:Record<string, import('./transport.js').Phases>, reuse:Record<string,{warmSamples:number, reused:number}>, requestsMade:number}} input.transport
 * @param {{tlsOff:boolean, extraCa:boolean, proxy:boolean}} input.environment
 */
export function buildReport(input) {
  const { result, city, transport, environment } = input;
  const plan = cliPlan();
  const m = /** @type {import('../core/contracts/measurement.js').MeasurementRun} */ (result.measurement);
  const d = /** @type {import('../core/contracts/decomposition.js').DecompositionRun} */ (result.decomposition);
  const statusOf = new Map(m.endpoints.map((x) => [x.endpointId, x]));

  const rows = sortWorstFirst(d.rows).map((row) => {
    const e = /** @type {import('../core/data/endpoints.js').Endpoint} */ (endpointById(row.endpointId));
    const { cells } = rowClaims(row);
    return {
      endpoint: e,
      cells,
      verdict: row.verdict,
      verdictText: row.verdict === null ? null : VERDICT_TEXT[row.verdict],
      suppressedReason: row.ratioSuppressedReason,
    };
  });

  const worst = worstRow(d.rows);
  const headline = worst ? { endpointId: worst.endpointId, ...cliHeadline(worst) } : null;
  const setter = d.accessFromEndpointId ? endpointById(d.accessFromEndpointId) : null;

  /** @param {string} endpointId */
  const base = (endpointId) => {
    const e = /** @type {import('../core/data/endpoints.js').Endpoint} */ (endpointById(endpointId));
    const g = geometry(city, endpointId);
    return { endpoint: e, distance: distanceClaim(g.distanceKm), floor: floorClaim(g.floorMs) };
  };

  const unstable = result.excluded.filter((x) => x.kind === 'unstable').map((x) => ({
    ...base(x.endpointId),
    spread: measured(/** @type {number} */ (x.spreadMs), UNITS.MS, METHODS.SAMPLE_SPREAD),
    reason: x.reason,
  }));
  const defects = result.excluded.filter((x) => x.kind === 'faster-than-light').map((x) => ({
    ...base(x.endpointId),
    reason: x.reason,
  }));
  const failed = result.excluded.filter((x) => x.kind === 'not-measured').map((x) => {
    const row = statusOf.get(x.endpointId);
    return {
      ...base(x.endpointId),
      status: row ? row.status : 'failed',
      reason: x.reason,
      failureReason: x.failureReason,
    };
  });

  const phases = MEASURED_ENDPOINTS.map((e) => phaseEntry(e, city, transport.phases[e.id]));

  // The proof DESIGN-CLI asks the transport for: every warm sample of every timed endpoint was
  // reported by its socket as riding the warm up connection. A sample that did not fails its
  // endpoint in the transport, so 'not-held' here would mean that refusal was bypassed.
  const timed = m.endpoints.filter((x) => x.status === 'ok' || x.status === 'unstable');
  /** @type {'held'|'none-timed'|'not-held'} */
  const reuse = timed.length === 0 ? 'none-timed'
    : timed.every((x) => {
      const u = transport.reuse[x.endpointId];
      return Boolean(u) && u.warmSamples === WARM_SAMPLE_COUNT && u.reused === WARM_SAMPLE_COUNT;
    }) ? 'held' : 'not-held';

  /** @type {{id:string, text:string}[]} */
  const notices = [];
  if (environment.proxy) notices.push({ id: 'PROXY_NOT_USED', text: COPY.proxyNotice });
  if (environment.extraCa) notices.push({ id: 'EXTRA_CERTIFICATE_AUTHORITIES', text: COPY.extraCaNotice });
  if (result.state === 'nothing-measured') notices.push({ id: 'NOTHING_MEASURED', text: COPY.nothingMeasured });
  else if (unstable.length + defects.length + failed.length > 0) notices.push({ id: 'PARTIAL_RUN', text: RUN_NOTICES.PARTIAL_RUN });

  return {
    state: result.state,
    observer: { id: city.id, label: city.label, ...coordinateClaims(city.lat, city.lon) },
    headline,
    access: d.rows.length > 0 ? measured(d.accessMs, UNITS.MS, METHODS.ACCESS_BASELINE) : null,
    accessSetter: setter || null,
    rows,
    unstable,
    defects,
    failed,
    phases,
    reuse,
    reuseStatement: reuse === 'held' ? COPY.reuseHeld : reuse === 'none-timed' ? COPY.reuseNoneTimed : COPY.reuseNotHeld,
    requests: {
      made: measured(transport.requestsMade, UNITS.UNITLESS, METHODS.REQUESTS_MADE),
      planned: computed(plan.total, UNITS.UNITLESS, METHODS.CLI_REQUEST_PLAN),
    },
    selfTest: result.selfTest.map((x) => ({
      label: x.label,
      passed: x.passed,
      // Two engine details describe the page (a clock a browser clamps, a bar on screen). The
      // command line states the same checks in its own terms rather than repeat a false detail.
      detail: x.label === 'Display precision' ? COPY.engineDisplayPrecision
        : x.label === 'Identity at display precision' ? COPY.engineDisplayIdentity
          : x.detail,
    })),
    notices,
  };
}

/**
 * The phases of one endpoint's warm up connection, each a claim or a stated absence.
 * @param {import('../core/data/endpoints.js').Endpoint} e
 * @param {{lat:number, lon:number}} city
 * @param {import('./transport.js').Phases|undefined} p
 */
export function phaseEntry(e, city, p) {
  const connected = Boolean(p) && (p.address !== null || p.tcpMs !== null);
  if (!p || !connected) {
    return { endpoint: e, connected: false, belowFloor: false, dns: null, tcp: null, tls: null, address: null, tlsVersion: null, failedAttempts: p ? measured(p.failedAttempts, UNITS.UNITLESS, METHODS.FAILED_CONNECTION_ATTEMPTS) : null };
  }
  const { floorMs } = geometry(/** @type {any} */ (city), e.id);
  const belowFloor = p.tcpMs !== null && p.tcpMs < floorMs;
  return {
    endpoint: e,
    connected: true,
    belowFloor,
    dns: p.dnsMs === null ? null : measured(p.dnsMs, UNITS.MS, METHODS.DNS_LOOKUP_TIME),
    // A TCP connect time faster than light is never shown as a result. The notice stands in
    // its place.
    tcp: p.tcpMs === null || belowFloor ? null : measured(p.tcpMs, UNITS.MS, METHODS.TCP_CONNECT_TIME),
    tls: p.tlsMs === null ? null : measured(p.tlsMs, UNITS.MS, METHODS.TLS_HANDSHAKE_TIME),
    address: p.address === null ? null : reported(p.address, UNITS.TEXT, METHODS.CONNECTED_ADDRESS),
    tlsVersion: p.tlsVersion === null ? null : reported(p.tlsVersion, UNITS.TEXT, METHODS.TLS_VERSION),
    failedAttempts: measured(p.failedAttempts, UNITS.UNITLESS, METHODS.FAILED_CONNECTION_ATTEMPTS),
  };
}

/* --------------------------------------------------------------------------------------------
 * Text. Every line is parts; the sink is the only writer.
 * ------------------------------------------------------------------------------------------ */

/**
 * An endpoint by its city and its region code. The code is an identifier, never a figure, and
 * sits in parentheses so a city name that carries its own comma still reads as one place.
 * @param {import('../core/data/endpoints.js').Endpoint} e @param {string} [tail]
 */
const place = (e, tail = '') => [t(e.city + ' ('), id(e.region), t(')' + tail)];

/**
 * @param {any} out
 * @param {ReturnType<typeof buildReport>} r
 */
export function printReport(out, r) {
  /** @type {Map<string, string>} */
  const methods = new Map();
  /** @param {any[]} parts */
  const note = (parts) => {
    for (const k of claimsIn(parts)) if (!methods.has(k.method)) methods.set(k.method, k.badge);
    return parts;
  };
  /** @param {any[]} parts @param {object} [o] */
  const line = (parts, o) => out.line(note(parts), o);
  const plain = out.mode === 'plain';

  /**
   * A figure with its label, for plain mode: one line, one complete sentence, the badge word and
   * the method included (the claim's a11yLabel). Text mode joins figures onto one line instead.
   * @param {string} label @param {import('../core/claim.js').Claim} claim @param {number} indent
   */
  const figureLine = (label, claim, indent) => out.item([t(label)], note([c(claim)]), { indent, labelWidth: 0 });

  line([t(REGION_COORDINATE_DISCLAIMER)]);
  out.blank();
  line([t(COPY.measureObserver + r.observer.label + COPY.measureObserverClose)]);
  if (plain) {
    line([t(COPY.latitude), c(r.observer.lat)]);
    line([t(COPY.longitude), c(r.observer.lon)]);
  } else {
    line([t(COPY.measureObserverCoordinate), c(r.observer.lat), t(', '), c(r.observer.lon), t('.')]);
  }
  line([t(COPY.clientStack)]);

  for (const n of r.notices) {
    out.blank();
    line([t(n.text)]);
  }

  if (r.headline) {
    out.blank();
    out.heading(COPY.headlineLead);
    line(r.headline.parts);
  }
  if (r.access && r.accessSetter) {
    out.blank();
    line([t(COPY.accessLead), ...place(r.accessSetter, COPY.accessSame), c(r.access), t('.')]);
  }

  if (r.rows.length > 0) {
    out.blank();
    out.heading(COPY.rowsLead);
    for (const row of r.rows) {
      out.blank();
      line(place(row.endpoint));
      if (plain) {
        figureLine(COPY.rowDistance, row.cells.distance, 2);
        figureLine(COPY.rowRoundTrip, row.cells.roundTrip, 2);
        figureLine(COPY.rowPhysics, row.cells.physics, 2);
        figureLine(COPY.rowAccess, row.cells.access, 2);
        figureLine(COPY.rowRoute, row.cells.route, 2);
      } else {
        line([t(COPY.rowDistance + COPY.rowSep), c(row.cells.distance)], { indent: 2 });
        line([
          t(COPY.rowRoundTrip + COPY.rowSep), c(row.cells.roundTrip),
          t(COPY.rowEquals + COPY.rowPhysics + COPY.rowSep), c(row.cells.physics),
          t(COPY.rowPlus + COPY.rowAccess + COPY.rowSep), c(row.cells.access),
          t(COPY.rowPlus + COPY.rowRoute + COPY.rowSep), c(row.cells.route),
        ], { indent: 2, hang: 4 });
      }
      if (row.cells.ratio) {
        if (plain) {
          figureLine(COPY.rowRatio, row.cells.ratio, 2);
          out.item([t(COPY.rowVerdict)], [t(/** @type {string} */ (row.verdictText))], { indent: 2, labelWidth: 0 });
        } else {
          line([t(COPY.rowRatio + COPY.rowSep), c(row.cells.ratio), t('. ' + row.verdictText)], { indent: 2, hang: 4 });
        }
      } else {
        line([pp('COMPUTED', /** @type {string} */ (row.suppressedReason), METHODS.ROUTE_RATIO)], { indent: 2, hang: 4 });
      }
    }
  }

  if (r.unstable.length > 0) {
    out.blank();
    out.heading(COPY.unstableLead);
    for (const x of r.unstable) {
      if (plain) {
        line(place(x.endpoint, '.'), { indent: 2 });
        figureLine(COPY.rowSpread, x.spread, 2);
        line([t(x.reason)], { indent: 2 });
      } else {
        line([...place(x.endpoint, ': ' + COPY.rowSpread + COPY.rowSep), c(x.spread), t('. ' + x.reason)], { indent: 2, hang: 4 });
      }
    }
  }

  if (r.defects.length > 0) {
    out.blank();
    out.heading(COPY.defectsLead);
    for (const x of r.defects) {
      if (plain) {
        line(place(x.endpoint, '.'), { indent: 2 });
        figureLine(COPY.rowPhysics, x.floor, 2);
        line([t(x.reason)], { indent: 2 });
      } else {
        line([...place(x.endpoint, ': ' + COPY.rowPhysics + COPY.rowSep), c(x.floor), t('. ' + x.reason)], { indent: 2, hang: 4 });
      }
    }
  }

  if (r.failed.length > 0) {
    out.blank();
    out.heading(COPY.failedLead);
    for (const x of r.failed) {
      line([...place(x.endpoint, ': ' + x.reason + (x.failureReason ? ' ' + x.failureReason : ''))], { indent: 2, hang: 4 });
    }
  }

  if (r.state === 'done' && r.unstable.length + r.defects.length + r.failed.length === 0) {
    out.blank();
    line([t(COPY.allUsable)]);
  }

  out.blank();
  out.heading(COPY.phasesHeading);
  line([t(COPY.phasesLead)]);
  for (const p of r.phases) {
    out.blank();
    line(place(p.endpoint));
    if (!p.connected) {
      line([t(COPY.phaseNoConnection)], { indent: 2 });
      continue;
    }
    /** @type {[string, import('../core/claim.js').Claim|null][]} */
    const figures = [
      [COPY.phaseDns, p.dns],
      [COPY.phaseTcp, p.tcp],
      [COPY.phaseTls, p.tls],
      [COPY.phaseAddress, p.address],
      [COPY.phaseTlsVersion, p.tlsVersion],
      [COPY.phaseFailedAttempts, p.failedAttempts],
    ];
    for (const [label, claim] of figures) {
      const o = { indent: 2, labelWidth: plain ? 0 : 30 };
      if (label === COPY.phaseTcp && p.belowFloor) out.item([t(label)], [t(COPY.phaseTcpBelowFloorShort)], o);
      else if (claim) out.item([t(label)], note([c(claim)]), o);
      else out.item([t(label)], [t(COPY.phaseNotObserved)], o);
    }
  }
  if (r.phases.some((p) => p.belowFloor)) {
    out.blank();
    line([t(COPY.phaseTcpBelowFloor)]);
  }
  out.blank();
  line([t(r.reuseStatement)]);

  out.blank();
  if (plain) {
    line([t(COPY.requestsMade), c(r.requests.made)]);
    line([t(COPY.requestsPlannedLead), c(r.requests.planned)]);
  } else {
    line([t(COPY.requestsMade), c(r.requests.made), t(COPY.requestsOf), c(r.requests.planned), t(COPY.requestsPlanned)]);
  }

  out.blank();
  out.heading(COPY.runSelfTestLead);
  for (const x of r.selfTest) {
    out.item([t(x.passed ? COPY.selftestPass : COPY.selftestFail)], [t(x.label)], { indent: 2, labelWidth: 8 });
  }
  if (r.selfTest.some((x) => !x.passed)) line([t(COPY.selftestSomeFailed)], { indent: 2 });

  if (!plain && methods.size > 0) {
    // Plain mode already printed each method beside its figure.
    out.blank();
    out.heading(COPY.methodsLead);
    for (const [method, badge] of methods) out.line([pp(badge, method, method)], { indent: 2 });
  }

  out.blank();
  out.line([t(COPY.sourcesPointerMeasure)]);
  out.line([t(COPY.independence)]);
}

/* --------------------------------------------------------------------------------------------
 * JSON. One document; every figure through figure(), every absence with its reason.
 * ------------------------------------------------------------------------------------------ */

/**
 * @param {ReturnType<typeof buildReport>} r
 * @param {string} version
 */
export function reportJSON(r, version) {
  const plan = cliPlan();
  const noRatio = absent(NO_RATIO_WITHOUT_A_ROUND_TRIP);
  /** @param {{endpoint:import('../core/data/endpoints.js').Endpoint}} x */
  const who = (x) => ({ endpointId: x.endpoint.id, region: x.endpoint.region, city: x.endpoint.city, host: x.endpoint.measurementHost });

  const endpoints = [
    ...r.rows.map((row) => ({
      ...who(row),
      status: 'ok',
      distance: figure(row.cells.distance),
      roundTrip: figure(row.cells.roundTrip),
      physics: figure(row.cells.physics),
      access: figure(row.cells.access),
      route: figure(row.cells.route),
      ratio: row.cells.ratio ? figure(row.cells.ratio) : absent(/** @type {string} */ (row.suppressedReason)),
      verdict: row.verdict ? { kind: row.verdict, text: row.verdictText } : absent(/** @type {string} */ (row.suppressedReason)),
    })),
    ...r.unstable.map((x) => ({
      ...who(x),
      status: 'unstable',
      distance: figure(x.distance),
      physics: figure(x.floor),
      spread: figure(x.spread),
      roundTrip: absent(x.reason), access: absent(x.reason), route: absent(x.reason),
      ratio: noRatio, verdict: noRatio,
    })),
    ...r.defects.map((x) => ({
      ...who(x),
      status: 'defect',
      distance: figure(x.distance),
      physics: figure(x.floor),
      defect: { kind: 'faster-than-light', reason: x.reason },
      roundTrip: absent(x.reason), access: absent(x.reason), route: absent(x.reason),
      ratio: noRatio, verdict: noRatio,
    })),
    ...r.failed.map((x) => ({
      ...who(x),
      status: x.status,
      distance: figure(x.distance),
      physics: figure(x.floor),
      failure: { kind: x.status, reason: x.failureReason || x.reason },
      roundTrip: absent(x.reason), access: absent(x.reason), route: absent(x.reason),
      ratio: noRatio, verdict: noRatio,
    })),
  ];

  const phases = r.phases.map((p) => {
    const gone = absent(COPY.phaseNoConnection);
    const unseen = absent(COPY.phaseNotObserved);
    /** @param {import('../core/claim.js').Claim|null} k */
    const f = (k) => (!p.connected ? gone : k ? figure(k) : unseen);
    return {
      endpointId: p.endpoint.id,
      connected: p.connected,
      dnsLookup: f(p.dns),
      tcpConnect: p.belowFloor ? absent(COPY.phaseTcpBelowFloor) : f(p.tcp),
      tlsHandshake: f(p.tls),
      connectedAddress: f(p.address),
      tlsVersion: f(p.tlsVersion),
      failedConnectionAttempts: p.failedAttempts ? figure(p.failedAttempts) : gone,
    };
  });

  return documentFor('measure', version, {
    state: r.state,
    coordinateDisclaimer: REGION_COORDINATE_DISCLAIMER,
    clientStack: COPY.clientStack,
    observer: {
      id: r.observer.id,
      label: r.observer.label,
      source: COPY.observerSource,
      lat: figure(r.observer.lat),
      lon: figure(r.observer.lon),
    },
    plan: planJSON(planClaims(plan), plan),
    notices: r.notices,
    headline: r.headline
      ? {
        endpointId: r.headline.endpointId,
        sentence: plainTextOf(r.headline.parts),
        roundTrip: figure(r.headline.cells.roundTrip),
        physics: figure(r.headline.cells.physics),
        access: figure(r.headline.cells.access),
        route: figure(r.headline.cells.route),
        onTheTable: r.headline.cells.onTheTable ? figure(r.headline.cells.onTheTable) : absent(COPY.noOnTheTable),
      }
      : absent(COPY.nothingMeasured),
    accessBaseline: r.access && r.accessSetter
      ? { value: figure(r.access), setBy: r.accessSetter.id }
      : absent(COPY.nothingMeasured),
    endpoints,
    phases,
    warmSampleReuse: { state: r.reuse, statement: r.reuseStatement },
    requests: { made: figure(r.requests.made), planned: figure(r.requests.planned) },
    selfTest: r.selfTest,
    sources: COPY.sourcesPointerMeasure,
    independence: COPY.independence,
  });
}

/** @param {any[]} parts */
function plainTextOf(parts) {
  return parts.map((p) => (p.kind === 'claim' ? figure(p.claim).text : p.value)).join('');
}

/* --------------------------------------------------------------------------------------------
 * The command.
 * ------------------------------------------------------------------------------------------ */

/**
 * The exit code a finished run earns. DESIGN-CLI item 11: 1 is a named failure. A run that
 * measured nothing is one. So is a run whose own self test failed: every engine check is a
 * consistency check on this run's figures, so a failure there is a defect in photontax, and a
 * script reading the exit code must not take the figures above it as a clean result. --help
 * lists "a self test failed" under exit code 1, and this is where that holds for measure.
 * @param {{state:string, selfTest:readonly {passed:boolean}[]}} result
 * @returns {number}
 */
export function measureExitCode(result) {
  if (result.state !== 'done') return EXIT.FAILED;
  return result.selfTest.every((x) => x.passed) ? EXIT.DONE : EXIT.FAILED;
}

/**
 * @typedef {Object} MeasureContext
 * @property {string} version
 * @property {Record<string, string|undefined>} env
 * @property {readonly string[]} [execArgv]
 * @property {AbortSignal} [signal] Aborted on an interrupt.
 * @property {(options: any) => any} [createTransport] Tests inject a transport over a local server.
 * @property {() => number} [now]
 * @property {number} [timeoutMs]
 * @property {number} [concurrency] Tests only, so a scripted clock is not shared by two endpoints
 *   at once. Production passes nothing and the engine works on its own four at a time.
 */

/**
 * @param {any} out
 * @param {MeasureContext} ctx
 * @param {{id:string, label:string, lat:number, lon:number}} city
 * @returns {Promise<number>} The exit code.
 */
export async function runMeasure(out, ctx, city) {
  const environment = environmentFacts(ctx.env, ctx.execArgv);
  if (environment.tlsOff) {
    out.note([t(COPY.tlsRefused)]);
    if (out.json) {
      out.document(documentFor('measure', ctx.version, {
        state: 'refused',
        failure: { kind: 'refused-environment', reason: COPY.tlsRefused },
      }));
    }
    return EXIT.FAILED;
  }

  // The plan, on stderr, before the first request. DESIGN trap 14: say exactly what is about to
  // happen before it happens.
  const plan = cliPlan();
  for (const l of planLines(planClaims(plan), out.mode)) out.note(l);
  for (const h of plan.hosts) out.note([id(h)], { indent: 2 });
  out.note([t(COPY.planNoFacility)]);
  if (environment.proxy) out.note([t(COPY.proxyNotice)]);
  if (environment.extraCa) out.note([t(COPY.extraCaNotice)]);
  out.note([t(COPY.progressMeasuring + city.label + COPY.progressMeasuringClose)]);

  const transport = (ctx.createTransport || createNodeTransport)({
    userAgent: userAgentFor(ctx.version),
    now: ctx.now,
  });
  const interrupted = () => Boolean(ctx.signal && ctx.signal.aborted);

  /** @type {import('../measure/index.js').EngineResult} */
  let result;
  try {
    result = await measure({
      pickedCity: { lat: city.lat, lon: city.lon, label: city.label },
      readFacility: false,
      concurrency: ctx.concurrency,
      deps: {
        now: ctx.now,
        signal: ctx.signal,
        timeoutMs: ctx.timeoutMs,
        probeFor: (/** @type {string} */ h) => transport.probeFor(h),
        measureEndpoint: async (/** @type {any} */ e, /** @type {any} */ d) => {
          const row = await measureEndpoint(e, { ...d, classifyFailure: cliClassifyFailure });
          if (!interrupted()) progress(out, e, row.status);
          return row;
        },
      },
    });
  } finally {
    transport.close();
  }

  // Nothing partial is reported: the notice went out when the interrupt arrived.
  if (interrupted()) return EXIT.INTERRUPTED;

  const report = buildReport({ result, city, transport, environment });
  if (out.json) out.document(reportJSON(report, ctx.version));
  else printReport(out, report);
  return measureExitCode(result);
}

/**
 * One discrete progress line on stderr. Words only: no figure, no spinner, nothing redrawn.
 * @param {any} out
 * @param {{city:string, region:string}} e
 * @param {string} status
 */
function progress(out, e, status) {
  const word = status === 'ok' ? COPY.progressTimed
    : status === 'unstable' ? COPY.progressUnstable
      : COPY.progressNotMeasured;
  out.note([t(e.city + ' ('), id(e.region), t('): ' + word)], { indent: 2 });
}
