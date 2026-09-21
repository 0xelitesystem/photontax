// SHOW THE MATHS. The second beat, and the credibility moment.
//
// DESIGN 5: "A 'show the maths' control under the sentence expands into the live recomputation:
// the two coordinates, the haversine in full, the constant with its source, the division, the
// seven raw samples with the minimum highlighted, and the subtraction. Every printed digit
// traced to either a physical constant or a sample the reader's own machine just took. Nothing
// is hidden and nothing is rounded before it is shown."
//
// So this module prints the WORKING, not the answer. Every intermediate term of the haversine
// is a separate value with its own badge. The constant is shown as its two inputs and the
// division between them, not as a result to be trusted. The seven samples are all there, in
// the order they were taken, with the minimum marked, so a reader can see for themselves that
// the estimator is a minimum and not a mean.
//
// Two precision rules, and they pull in opposite directions on purpose.
//
//   MILLISECONDS ARE ALWAYS WHOLE. performance.now() is clamped to 1 ms in Firefox and Safari
//   outside cross origin isolation, so a decimal millisecond would claim a precision the
//   platform cannot supply (trap 9). claim.js enforces this and there is no way around it.
//
//   EVERYTHING ELSE IS SHOWN AT FULL WORKING PRECISION. A central angle printed to four places
//   is not a claim about a clock, it is a step of arithmetic the reader is being invited to
//   repeat. Rounding it would defeat the entire panel.
//
// The one figure that sits awkwardly between those is the published floor constant, 9.7948
// milliseconds of round trip floor per 1000 km. It is a derived constant rather than a reading
// off a clock, and DESIGN 7.1 publishes it to four decimals, so it is carried as a unitless
// value with the words "milliseconds of round trip floor per 1000 km" printed beside it. The
// unit is in the prose where a reader will see it, and the millisecond rounding rule is not
// quietly bypassed for anything that came from a timer.
//
// Isomorphic: no node:* imports and no DOM.

import { measured, reported, computed, inferred, UNITS, METHODS } from '../core/claim.js';
import { greatCircleTerms } from '../core/geo.js';
import {
  C_VACUUM_M_S, FIBRE_GROUP_INDEX_1550NM, V_FIBRE_KM_S, FLOOR_MS_PER_1000_KM,
  EARTH_MEAN_RADIUS_KM, VERDICT_AT_FLOOR_MAX, VERDICT_NORMAL_MAX, RATIO_MIN_DISTANCE_KM,
} from '../core/constants.js';
import { VERDICT_TEXT, RATIO_SUPPRESSED_REASON } from '../core/contracts/decomposition.js';
import { endpointById } from '../core/data/endpoints.js';
import { REGION_COORDINATE_DISCLAIMER } from '../core/data/disclaimers.js';
import { t, c, pp, plainText } from './parts.js';

/** The note every inferred coordinate carries. DESIGN 2.4: the assumption before the number. */
const COORD_NOTE = REGION_COORDINATE_DISCLAIMER;

/**
 * @typedef {Object} MathsStep
 * @property {string} id
 * @property {string} label Short uppercase heading. Never contains a digit.
 * @property {string} lead One sentence of prose stating what this step does, before it does it.
 * @property {import('./parts.js').Part[][]} lines Each line is a sentence built from parts.
 * @property {string|null} sourceId A citation shown under the step, when one applies.
 */

/**
 * A coordinate pair as two claims. The badge depends on where the coordinate came from, and
 * that distinction is the entire reason this function takes a `basis` rather than assuming.
 *
 * A Cloudflare colo CODE is REPORTED: Cloudflare's own edge named the facility that terminated
 * the connection. The LATITUDE AND LONGITUDE of that facility are not reported by anybody, they
 * are a city centre this tool chose, so they are INFERRED even when the label above them is
 * REPORTED. Conflating the two would be the exact mistake DESIGN 2 exists to prevent, and it
 * would be the flattering one.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {{lat:import('../core/claim.js').Claim, lon:import('../core/claim.js').Claim}}
 */
export function coordinateClaims(lat, lon) {
  return {
    lat: inferred(lat, UNITS.UNITLESS, METHODS.REGION_CITY_CENTRE, { decimals: 4, note: COORD_NOTE }),
    lon: inferred(lon, UNITS.UNITLESS, METHODS.REGION_CITY_CENTRE, { decimals: 4, note: COORD_NOTE }),
  };
}

/**
 * STEP 1. Both coordinates, and what kind of thing each one is.
 * @param {{label:string, lat:number, lon:number, source:string, colo:string|null}} observer
 * @param {import('../core/data/endpoints.js').Endpoint} endpoint
 * @returns {MathsStep}
 */
export function stepCoordinates(observer, endpoint) {
  const obs = coordinateClaims(observer.lat, observer.lon);
  const dst = coordinateClaims(endpoint.lat, endpoint.lon);

  /** @type {import('./parts.js').Part[][]} */
  const lines = [];

  if (observer.source === 'cloudflare-colo' && observer.colo) {
    lines.push([
      t('Serving facility, as named by Cloudflare for this connection: '),
      c(reported(observer.colo, UNITS.TEXT, METHODS.CLOUDFLARE_COLO), 'visible'),
      t('.'),
    ]);
  } else {
    lines.push([t('Observer city, chosen by you because the serving facility could not be read: ' + observer.label + '.')]);
  }

  lines.push([
    t('Observer coordinate, latitude then longitude: '),
    c(obs.lat, 'sr'), t(', '), c(obs.lon, 'sr'),
    t('.'),
  ]);
  lines.push([
    t(endpoint.providerRegionName + ' coordinate, latitude then longitude: '),
    c(dst.lat, 'sr'), t(', '), c(dst.lon, 'sr'),
    t('.'),
  ]);

  return {
    id: 'coordinates',
    label: 'The two coordinates',
    lead: COORD_NOTE + ' Both points below are city centres, so every number that follows is a '
      + 'floor for a city and not for a building.',
    lines,
    sourceId: 'wikidata_coordinates',
  };
}

/**
 * STEP 2. The haversine, every term of it.
 * @param {{lat:number, lon:number}} from
 * @param {{lat:number, lon:number}} to
 * @returns {MathsStep}
 */
export function stepHaversine(from, to) {
  const g = greatCircleTerms(from, to);
  const u = (v, d) => computed(v, UNITS.UNITLESS, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: d });

  return {
    id: 'haversine',
    label: 'The great circle, in full',
    lead: 'A cable is a line on a sphere and the great circle is the shortest such line, so this '
      + 'distance is the shortest one any cable between these two points could possibly be. '
      + 'Every term is printed; nothing here is asserted.',
    lines: [
      [t('Latitude difference in radians: '), c(u(g.dPhiRad, 6), 'sr'), t('.')],
      [t('Longitude difference in radians: '), c(u(g.dLambdaRad, 6), 'sr'), t('.')],
      [
        t('Haversine term, sine squared of half the latitude difference plus the product of the '
          + 'two latitude cosines and sine squared of half the longitude difference: '),
        c(u(g.h, 6), 'sr'), t('.'),
      ],
      [t('Central angle in radians, twice the arcsine of the square root of that term: '), c(u(g.centralAngleRad, 6), 'sr'), t('.')],
      [
        t('Sphere radius in kilometres, the IUGG mean Earth radius: '),
        c(computed(EARTH_MEAN_RADIUS_KM, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 4, sourceId: 'iugg_mean_radius' }), 'sr'),
        t('.'),
      ],
      [
        t('Central angle times radius gives the great circle distance: '),
        c(computed(g.distanceKm, UNITS.KM, METHODS.GREAT_CIRCLE_HAVERSINE, { decimals: 3, sourceId: 'iugg_mean_radius' }), 'visible'),
        t('.'),
      ],
    ],
    sourceId: 'iugg_mean_radius',
  };
}

/**
 * STEP 3. The constant, as its inputs and the division between them.
 * @returns {MathsStep}
 */
export function stepConstant() {
  const cVac = computed(C_VACUUM_M_S, UNITS.UNITLESS, METHODS.FIBRE_SPEED, { sourceId: 'si_metre' });
  const n = computed(FIBRE_GROUP_INDEX_1550NM, UNITS.UNITLESS, METHODS.FIBRE_SPEED, { decimals: 4, sourceId: 'corning_smf28' });
  const v = computed(V_FIBRE_KM_S, UNITS.KM_PER_S, METHODS.FIBRE_SPEED, { decimals: 5, sourceId: 'corning_smf28' });
  const per1000 = computed(FLOOR_MS_PER_1000_KM, UNITS.UNITLESS, METHODS.FIBRE_FLOOR, { decimals: 4, sourceId: 'corning_smf28' });

  return {
    id: 'constant',
    label: 'The constant, and where it comes from',
    lead: 'Two inputs and one division. The first input is a definition and carries no '
      + 'uncertainty at all; the second is a published property of the standard long haul '
      + 'fibre. This is the only empirical number anywhere in the floor.',
    lines: [
      [
        t('Speed of light in vacuum, metres per second, exact by the SI definition of the metre: '),
        c(cVac, 'visible'), t('.'),
      ],
      [
        pp('COMPUTED',
          'Group index, not phase index. Group index governs how fast a modulated signal '
          + 'travels, and a modulated signal is what carries data, so using the phase index here '
          + 'would be a category error that quietly shifts every floor in the product. The value '
          + 'is the effective group index of refraction of Corning SMF-28 fibre at 1550 nm, the '
          + 'standard long haul single mode fibre and the window every long haul system runs in.',
          METHODS.FIBRE_SPEED),
      ],
      [
        t('Effective group index of refraction of the fibre, dimensionless: '),
        c(n, 'visible'), t('.'),
      ],
      [
        t('Dividing the first by the second, then by a thousand to reach kilometres per second, '
          + 'gives the speed of a signal in the glass: '),
        c(v, 'visible'), t('.'),
      ],
      [
        t('Two thousand kilometres of glass at that speed is the round trip floor for one '
          + 'thousand kilometres of separation, in milliseconds: '),
        c(per1000, 'visible'),
        t(' milliseconds of round trip floor per one thousand kilometres.'),
      ],
    ],
    sourceId: 'corning_smf28',
  };
}

/**
 * STEP 4. The division that produces this row's floor.
 * @param {import('../core/contracts/decomposition.js').RowDecomposition} row
 * @returns {MathsStep}
 */
export function stepFloor(row) {
  const roundTripKm = computed(2 * row.distanceKm, UNITS.KM, METHODS.FIBRE_FLOOR, { decimals: 3, sourceId: 'corning_smf28' });
  const v = computed(V_FIBRE_KM_S, UNITS.KM_PER_S, METHODS.FIBRE_SPEED, { decimals: 5, sourceId: 'corning_smf28' });
  const floor = computed(row.floorMs, UNITS.MS, METHODS.FIBRE_FLOOR, { sourceId: 'corning_smf28' });

  return {
    id: 'floor',
    label: 'The division',
    lead: 'Twice the distance, because it is a round trip, divided by the speed in the glass. '
      + 'No part of this number is attributed to either direction, because a round trip is one '
      + 'number covering two paths that are frequently different.',
    lines: [
      [t('Distance there and back, in kilometres: '), c(roundTripKm, 'sr'), t('.')],
      [t('Divided by the speed in fibre, in kilometres per second: '), c(v, 'sr'), t('.')],
      [t('Times a thousand, for milliseconds. The floor for this row: '), c(floor, 'visible'), t('.')],
    ],
    sourceId: 'corning_smf28',
  };
}

/**
 * STEP 5. The raw samples, all of them, with the minimum marked.
 *
 * The warm up response is not among these. It is discarded before the first sample is taken,
 * so the connection is already open and already through its TLS handshake, and the samples
 * below are request and response on a kept alive connection (trap 5).
 *
 * @param {{samplesMs:number[], roundTripMs:number|null, spreadMs:number|null, status:string}} m
 * @returns {MathsStep & {samples:{claim:import('../core/claim.js').Claim, isMin:boolean}[]}}
 */
export function stepSamples(m) {
  const min = m.roundTripMs;
  let markedOnce = false;
  const samples = m.samplesMs.map((s) => {
    const isMin = !markedOnce && min !== null && s === min;
    if (isMin) markedOnce = true;
    return { claim: measured(s, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP), isMin };
  });

  /** @type {import('./parts.js').Part[][]} */
  const lines = [];
  if (m.spreadMs !== null) {
    lines.push([
      t('Spread between the largest and the smallest of those samples: '),
      c(measured(m.spreadMs, UNITS.MS, METHODS.SAMPLE_SPREAD), 'sr'),
      t('.'),
    ]);
  }
  if (min !== null) {
    lines.push([
      t('The estimator is the minimum, not the mean. A mean keeps the server think time and the '
        + 'scheduler noise that the minimum removes. The figure this tool uses: '),
      c(measured(min, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP), 'visible'),
      t('.'),
    ]);
  }

  return {
    id: 'samples',
    label: 'The raw samples your own machine took',
    lead: 'The connection is opened and the first response is thrown away, so these are all '
      + 'request and response times on a connection that is already open and already through '
      + 'its TLS handshake. Every one of them is a warm HTTPS round trip and contains transport, '
      + 'TLS record processing and server think time.',
    lines,
    samples,
    sourceId: null,
  };
}

/**
 * STEP 6. The access baseline, which is the step nobody else does.
 * @param {import('../core/contracts/decomposition.js').DecompositionRun} run
 * @returns {MathsStep}
 */
export function stepAccess(run) {
  const setter = endpointById(run.accessFromEndpointId);
  const access = measured(run.accessMs, UNITS.MS, METHODS.ACCESS_BASELINE);

  return {
    id: 'access',
    label: 'Your own access cost, measured once',
    lead: 'For every endpoint, subtract that endpoint floor from what was actually measured. The '
      + 'smallest of those differences is the fixed cost your own connection carries to every '
      + 'destination: last mile scheduling, the equipment in your building, the local loop. It '
      + 'is yours, it is the same to every destination, and it is subtracted from all of them. '
      + 'Without this step the nearest region reads as if it were many times its own floor, '
      + 'because a fixed cost is sitting on top of a floor near zero.',
    lines: [
      [
        t('The smallest surplus over every endpoint measured in this run, which is your access '
          + 'baseline: '),
        c(access, 'visible'), t('.'),
      ],
      [t('The endpoint that set it: ' + (setter ? setter.providerRegionName : 'the nearest usable region')
        + '. That endpoint route surplus is therefore exactly zero by construction, which is '
        + 'also the self consistency check on the whole run.')],
    ],
    sourceId: null,
  };
}

/**
 * STEP 7. The subtraction, and then the ratio and the verdict.
 * @param {import('../core/contracts/decomposition.js').RowDecomposition} row
 * @returns {MathsStep}
 */
export function stepSubtraction(row) {
  const rt = measured(row.roundTripMs, UNITS.MS, METHODS.WARM_HTTPS_ROUND_TRIP);
  const floor = computed(row.floorMs, UNITS.MS, METHODS.FIBRE_FLOOR, { sourceId: 'corning_smf28' });
  const access = measured(row.accessMs, UNITS.MS, METHODS.ACCESS_BASELINE);
  const route = measured(row.routeMs, UNITS.MS, METHODS.ROUTE_SURPLUS);

  /** @type {import('./parts.js').Part[][]} */
  const lines = [
    [
      t('Measured warm HTTPS round trip: '), c(rt, 'sr'),
      t('. Minus the computed floor: '), c(floor, 'sr'),
      t('. Minus your measured access baseline: '), c(access, 'sr'),
      t('. What is left is the route surplus: '), c(route, 'visible'), t('.'),
    ],
  ];

  if (row.routeRatio === null) {
    lines.push([pp('COMPUTED', RATIO_SUPPRESSED_REASON, METHODS.ROUTE_RATIO)]);
    lines.push([
      t('The distance gate is fixed and printed: no ratio of any kind is rendered under '),
      c(computed(RATIO_MIN_DISTANCE_KM, UNITS.KM, METHODS.ROUTE_RATIO), 'sr'),
      t('.'),
    ]);
  } else {
    const ratio = computed(row.routeRatio, UNITS.RATIO, METHODS.ROUTE_RATIO, { decimals: 4 });
    lines.push([
      t('The measured round trip with your own access cost taken out, divided by the floor, is '
        + 'the route ratio: '),
      c(ratio, 'visible'), t('.'),
    ]);
    lines.push([
      t('The two thresholds are fixed, published and never tuned per visitor. At or below '),
      c(computed(VERDICT_AT_FLOOR_MAX, UNITS.RATIO, METHODS.VERDICT_FROM_RATIO, { decimals: 2 }), 'sr'),
      t(' a route is already inside the geometry of cable itself. Above '),
      c(computed(VERDICT_NORMAL_MAX, UNITS.RATIO, METHODS.VERDICT_FROM_RATIO, { decimals: 2 }), 'sr'),
      t(' it is materially longer than the geography requires.'),
    ]);
    lines.push([t('Verdict: ' + VERDICT_TEXT[/** @type {'AT_FLOOR'|'NORMAL'|'ON_THE_TABLE'} */ (row.verdict)])]);
    if (row.verdict === 'ON_THE_TABLE' && typeof row.msOnTheTable === 'number') {
      lines.push([
        t('The route surplus, less the part of it that cable geometry alone would explain, is '
          + 'what is on the table: '),
        c(computed(row.msOnTheTable, UNITS.MS, METHODS.VERDICT_FROM_RATIO), 'visible'),
        t('.'),
      ]);
    }
  }

  return {
    id: 'subtraction',
    label: 'The subtraction, the ratio and the verdict',
    lead: 'Three numbers that add back to the one at the top of the row, then one division and '
      + 'two fixed thresholds.',
    lines,
    sourceId: null,
  };
}

/**
 * The whole panel for one row.
 * @param {Object} input
 * @param {import('../core/contracts/decomposition.js').RowDecomposition} input.row
 * @param {import('../core/contracts/decomposition.js').DecompositionRun} input.run
 * @param {{label:string, lat:number, lon:number, source:string, colo:string|null}} input.observer
 * @param {{samplesMs:number[], roundTripMs:number|null, spreadMs:number|null, status:string}} input.measurement
 * @returns {MathsStep[]}
 */
export function buildMaths(input) {
  const endpoint = endpointById(input.row.endpointId);
  if (!endpoint) throw new RangeError('buildMaths: unknown endpoint ' + input.row.endpointId);
  return [
    stepCoordinates(input.observer, endpoint),
    stepHaversine(
      { lat: input.observer.lat, lon: input.observer.lon },
      { lat: endpoint.lat, lon: endpoint.lon },
    ),
    stepConstant(),
    stepFloor(input.row),
    stepSamples(input.measurement),
    stepAccess(input.run),
    stepSubtraction(input.row),
  ];
}

/**
 * The plain text form of a whole panel, for the aria summary and for a text export. Every
 * figure in it still carries its badge word, because plainText renders through renderClaim.
 * @param {MathsStep[]} steps
 * @returns {string}
 */
export function mathsPlainText(steps) {
  return steps.map((s) => s.label + '. ' + s.lead + ' ' + s.lines.map(plainText).join(' ')).join('\n\n');
}
