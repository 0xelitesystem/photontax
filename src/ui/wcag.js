// WCAG 2.x relative luminance and contrast ratio, for the SHIPPED page.
//
// This is the same arithmetic as src/core/tokens.js. It is written out a second time here for
// one structural reason, and the reason is worth stating so nobody deletes this file as a
// duplicate:
//
//   tokens.js declares BANNED_COLOURS, the two house values that shipped broken once already.
//   A registry has to name what it rejects, so tokens.js is the one file exempt from
//   gate-contrast's banned value scan. Inlining it into docs/index.html would copy those two
//   values into a file that is NOT exempt, and the gate would fail on the page for containing
//   the very strings that exist to keep them out of pages. So the page never imports tokens.js,
//   the stylesheet is generated from it at BUILD time instead, and the browser self test uses
//   this module.
//
// The duplication is not left on trust. test/ui.test.js asserts these two functions agree with
// the tokens.js implementation to within 1e-12 over every token value in both themes plus a
// deterministic sweep of the colour cube, and that both reject the same malformed input. If
// they ever diverge, the test fails before anyone sees a page.
//
// Isomorphic: no node:* imports and no DOM.

/**
 * sRGB relative luminance, WCAG 2.x definition.
 * @param {string} hex '#rrggbb', either case. Anything else throws.
 * @returns {number}
 */
export function relativeLuminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(typeof hex === 'string' ? hex.trim() : '');
  if (!m) {
    // Refused rather than coerced. A NaN ratio compares false against every threshold, so a
    // malformed colour that returned NaN would pass a contrast check silently.
    throw new TypeError('relativeLuminance: expected #rrggbb, got ' + JSON.stringify(hex));
  }
  const v = m[1];
  const chan = [0, 2, 4].map((i) => {
    const s = parseInt(v.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

/**
 * WCAG 2.x contrast ratio between two opaque colours. Order independent.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG 2.x AA threshold for normal sized text. Nothing in this page uses the large allowance. */
export const AA_NORMAL = 4.5;

/**
 * Normalise a colour the browser resolved from a custom property. getComputedStyle returns the
 * author value for a custom property, so this is normally already '#rrggbb', but a reader can
 * override a variable and browsers differ on whitespace and case.
 * @param {string} value
 * @returns {string}
 */
export function normaliseHex(value) {
  const v = String(value).trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return '#' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3];
  return v;
}
