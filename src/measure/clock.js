// THE CLOCK. DESIGN 2.1, DESIGN trap 9.
//
// One job: hand the engine a monotonic millisecond reading, and refuse to let any part of the
// product claim more precision than the platform can supply.
//
// performance.now() is clamped by every shipping browser. Chrome clamps to 100 microseconds.
// Firefox and Safari clamp to 1 millisecond outside cross origin isolation, and this page is
// not cross origin isolated because that would require COOP and COEP headers that GitHub Pages
// does not send and that would break the cross origin measurement fetches anyway. So the
// honest display precision is a whole millisecond, everywhere, on every browser, forever.
//
// Full precision is kept on the objects for the arithmetic. It is never rendered. The two
// helpers below are the only sanctioned way to turn an internal number into a displayed one.
//
// Isomorphic: no node:* imports and no DOM.

import { DISPLAY_PRECISION_MS } from '../core/constants.js';

/**
 * A monotonic clock reading in milliseconds.
 *
 * performance.now() where it exists, which is every browser and Node 16 and later. Date.now()
 * is the fallback and it is NOT monotonic: a clock step during a sample would corrupt that
 * sample. The fallback is here so the engine runs at all in an exotic host, and the run records
 * which clock it used so a reader is never told a wall clock reading is a monotonic one.
 *
 * @returns {number} Milliseconds since an arbitrary origin. Only differences are meaningful.
 */
export function now() {
  if (typeof performance === 'object' && performance !== null && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Which clock now() would use. Recorded on the run so the method statement is accurate rather
 * than assumed.
 * @returns {'performance.now'|'Date.now'}
 */
export function clockSource() {
  if (typeof performance === 'object' && performance !== null && typeof performance.now === 'function') {
    return 'performance.now';
  }
  return 'Date.now';
}

/**
 * Round an internal millisecond value to the precision this product is allowed to display.
 *
 * This is the ONLY rounding function in the measurement engine. It exists so that "whole
 * milliseconds only" is a call anybody can grep for rather than a convention somebody has to
 * remember. DISPLAY_PRECISION_MS is 1, and a test pins that, so this is Math.round with a
 * reason attached to it.
 *
 * @param {number} ms
 * @returns {number} A whole number of milliseconds.
 */
export function wholeMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new TypeError('wholeMs: expected a finite number, got ' + String(ms));
  }
  return Math.round(ms / DISPLAY_PRECISION_MS) * DISPLAY_PRECISION_MS;
}

/**
 * True when a number is already at displayable precision. Used by the self test to assert that
 * nothing sub millisecond escaped, rather than trusting that it did not.
 * @param {number} ms
 * @returns {boolean}
 */
export function isDisplayablePrecision(ms) {
  return Number.isFinite(ms) && Number.isInteger(ms / DISPLAY_PRECISION_MS);
}
