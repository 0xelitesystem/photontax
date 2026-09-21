// THE TEN SECOND REVEAL, as timing and as order. DESIGN 5.
//
// The reveal has one job: convert a number the visitor already half knew into a decomposition
// they did not know existed, and do it before they scroll. The order is the argument, so the
// order lives here as data rather than as a pile of setTimeout calls spread through the DOM
// layer, and it is unit tested with a fake clock.
//
// THE SEQUENCE, and why each beat is where it is.
//
//   second 0        The page is painted. Nothing has touched the network. One control is on
//                   screen and it already has focus, and beside it, in words, the exact request
//                   count and the destination list (trap 14). A single line is already
//                   computed from arithmetic alone, so a reader who never clicks has already
//                   received a true, sourced fact.
//
//   second 3        The click. One arc at a time, as each region first answers, a thin arc
//                   draws from the reported serving facility to that region and settles to a
//                   dim grey.
//
//   seconds 4 to 7  Each row's bar fills in three segments, IN THIS ORDER, and the order is
//                   the whole trick:
//                     1. PHYSICS, first, because it is already known before any measurement.
//                        The reader watches the unavoidable part of their latency appear
//                        before anything has been measured. That is the argument, made
//                        visually, before a single word of it is read.
//                     2. ACCESS, next, the same width on every single row. Its constancy is
//                        visible at a glance, which is how a reader understands what it is
//                        without reading the label.
//                     3. ROUTE, last, and it is the only segment that differs in a way the
//                        reader can act on.
//
//   seconds 7 to 10 The rows re sort by route surplus, worst first. The worst arc lights. The
//                   sentence composes underneath with its four figures counting up.
//
// PHYSICS CAN FILL BEFORE ANY MEASUREMENT AND IT IS IMPORTANT THAT IT DOES. The floor comes
// from two coordinates and a constant, so every physics segment on the page is known at the
// moment of the click and needs nothing from the network. The access and route segments cannot
// appear until the whole run is in, because the access baseline is the MINIMUM surplus over
// every endpoint and a minimum is not known until the last one lands. The animation is
// therefore not decoration over a wait: it is the honest shape of what is known when.
//
// prefers-reduced-motion: reduce cuts to the final state. It does not animate more slowly.
// DESIGN 6.6 and the globe contract both require that, and the contract refuses a scene with
// reducedMotion set and any arc below full progress.
//
// Isomorphic: no node:* imports and no DOM. The clock is injected.

/**
 * The timings, in milliseconds. These are the CSS transition durations too: styles.js pins the
 * same numbers, and test/ui.test.js asserts the two agree, so the choreography cannot drift
 * away from the stylesheet that performs it.
 */
export const TIMING = Object.freeze({
  /** One arc draws over this long, and the next starts this long after the previous one. */
  arcDrawMs: 520,
  arcStaggerMs: 90,
  /** The three segments of one bar. The delays are what produce physics, then access, then route. */
  segmentFillMs: 560,
  accessDelayMs: 240,
  routeDelayMs: 520,
  /** Rows changing places, worst first. */
  reorderMs: 420,
  /** The four figures in the headline sentence counting up. */
  countUpMs: 900,
  /** How long after the run lands before the sentence starts composing. */
  headlineDelayMs: 260,
});

/** Reduced motion: everything is instant and nothing is skipped. */
export const TIMING_REDUCED = Object.freeze(
  Object.fromEntries(Object.keys(TIMING).map((k) => [k, 0])),
);

/** @param {boolean} reducedMotion @returns {Readonly<Record<string, number>>} */
export function timingFor(reducedMotion) {
  return reducedMotion ? TIMING_REDUCED : TIMING;
}

/**
 * The three segments, in the order they animate. Exported as data because the order IS the
 * argument and a test asserts it, rather than it being implied by the order of three lines
 * somewhere in a DOM function.
 */
export const SEGMENT_ORDER = Object.freeze(['physics', 'access', 'route']);

/**
 * Which segments may be shown at a given stage of the reveal.
 *
 * 'floors'   after the click and before the run completes. Physics only, because physics is
 *            all that is known: it comes from two coordinates and a constant.
 * 'full'     after the run completes, when the access baseline exists because every endpoint
 *            has landed and a minimum can be taken.
 *
 * @param {'idle'|'floors'|'full'} stage
 * @returns {readonly string[]}
 */
export function segmentsVisibleAt(stage) {
  if (stage === 'idle') return Object.freeze([]);
  if (stage === 'floors') return Object.freeze(['physics']);
  if (stage === 'full') return SEGMENT_ORDER;
  throw new RangeError('segmentsVisibleAt: unknown stage ' + JSON.stringify(stage));
}

/**
 * Cubic ease out. Used for the count up so the figures decelerate into their final value
 * instead of arriving at a constant rate, which reads as a slot machine.
 * @param {number} x 0 to 1
 * @returns {number}
 */
export function easeOutCubic(x) {
  const clamped = x < 0 ? 0 : (x > 1 ? 1 : x);
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * The value a counting figure should show at a moment in time.
 *
 * Counts from zero, never from a previous reading, because a figure that counts between two
 * real values would be showing numbers this page never measured on its way there. Counting up
 * from zero is visibly an animation; counting between two measurements would look like data.
 *
 * @param {number} target
 * @param {number} elapsedMs
 * @param {number} durationMs
 * @returns {number}
 */
export function countUpValue(target, elapsedMs, durationMs) {
  if (durationMs <= 0) return target;
  const p = easeOutCubic(elapsedMs / durationMs);
  return target * p;
}

/**
 * Drive a count up with an injected clock and an injected frame scheduler, so the whole thing
 * is testable with no browser and no waiting.
 *
 * @param {Object} opts
 * @param {number} opts.durationMs
 * @param {(fraction:number) => void} opts.onFrame Called with 0..1 on every frame, and exactly
 *   once with 1 at the end, so a caller can always rely on the final frame landing on the real
 *   value rather than on whatever the easing produced at the last tick.
 * @param {() => number} opts.now
 * @param {(cb:(t:number)=>void) => any} opts.schedule
 * @returns {void}
 */
export function driveCountUp(opts) {
  const start = opts.now();
  if (opts.durationMs <= 0) { opts.onFrame(1); return; }
  const step = () => {
    const elapsed = opts.now() - start;
    if (elapsed >= opts.durationMs) { opts.onFrame(1); return; }
    opts.onFrame(easeOutCubic(elapsed / opts.durationMs));
    opts.schedule(step);
  };
  opts.schedule(step);
}

/**
 * The stagger delay for the nth arc. DESIGN 5: one arc at a time, as each region first answers.
 * @param {number} index
 * @param {boolean} reducedMotion
 * @returns {number}
 */
export function arcDelayMs(index, reducedMotion) {
  return reducedMotion ? 0 : index * TIMING.arcStaggerMs;
}
