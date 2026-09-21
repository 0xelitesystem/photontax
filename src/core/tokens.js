// The palette, as data. DESIGN 6.2 (art direction) and DESIGN 6.6 (WCAG AA verified by math).
//
// The palette lives here rather than only in CSS for one reason: scripts/gate-contrast.mjs has
// to compute the arithmetic for every text token against every surface that token actually
// sits on, in both themes, and fail the build below 4.5:1. A gate that reads a rendered page
// only sees the colours that happen to be painted at that moment, which is how a token that is
// only used once a result appears can ship broken. This file is the single source of truth and
// the CSS is generated from it.
//
// PAIRS below is the load bearing part. A full cross product would be dishonest in the other
// direction: it would fail on combinations the design never puts together. PAIRS states, for
// each surface, exactly which text tokens the UI is permitted to place on it. Putting a token
// on a surface that is not listed is a UI bug, and the gate has nothing to say about a pairing
// the design forbids.
//
// Standing house rule, restated because it is how a bad token reached 137 repos: --muted is
// never a text colour. There is no muted text token in this file. inkFaint is the least
// prominent text token and it clears AA on every surface it is allowed on.
//
// Isomorphic: no node:* imports and no DOM.

/**
 * @typedef {Object} Theme
 * @property {Record<string,string>} surface Opaque background colours.
 * @property {Record<string,string>} text Foreground colours.
 * @property {Record<string,string>} line Non text strokes. Not contrast gated as text.
 */

/**
 * Dark theme. DESIGN 6.2: ocean #0a0a0a, coastlines in #9aa0a6 and never white, and #d4ff3a
 * reserved exclusively for the worst offender row and the active selection. The entire colour
 * budget of the scene exists so that one line can pop.
 * @type {Theme}
 */
export const DARK = Object.freeze({
  surface: Object.freeze({
    // The page and the ocean. DESIGN 6.2.
    base: '#0a0a0a',
    // Opaque panel behind any label that sits over the moving canvas. DESIGN 6.6: labels are
    // contrast tested against this token and never against the canvas.
    raised: '#14171a',
    // The accent used as a fill, with onAccent text on it.
    accentFill: '#d4ff3a',
  }),
  text: Object.freeze({
    ink: '#e6e6e6',          // body text. DESIGN 6.6 table: 15.86:1 on base.
    inkSoft: '#b9c0c7',      // secondary prose. 10.77:1 on base.
    inkFaint: '#9aa0a6',     // least prominent text. 7.50:1 on base.
    accent: '#d4ff3a',       // 17.12:1 on base. One line only.
    onAccent: '#0a0a0a',     // ink on the accent fill. 17.12:1.
    badgeMeasured: '#7ee0c8',
    badgeReported: '#8ab4f8',
    badgeComputed: '#b9c0c7',
    badgeInferred: '#f0b429',
  }),
  line: Object.freeze({
    coastline: '#9aa0a6',    // DESIGN 6.2: thin luminous strokes, never white.
    arcIdle: '#6b7178',
    arcActive: '#d4ff3a',
    rule: '#2a2e33',
  }),
});

/**
 * Light theme. Brand light ground #e8ebef with #2d6b00 as the accent. The light ground is the
 * darker of the two light surfaces, so it is the worst case and every ratio below is computed
 * against it as well as against raised.
 * @type {Theme}
 */
export const LIGHT = Object.freeze({
  surface: Object.freeze({
    base: '#e8ebef',
    raised: '#f7f8fa',
    accentFill: '#2d6b00',
  }),
  text: Object.freeze({
    ink: '#101317',
    inkSoft: '#41484f',
    inkFaint: '#454c54',
    accent: '#2d6b00',
    onAccent: '#ffffff',
    badgeMeasured: '#0b5d4a',
    badgeReported: '#0f4c96',
    badgeComputed: '#41484f',
    badgeInferred: '#7a4a00',
  }),
  line: Object.freeze({
    coastline: '#5a626a',
    arcIdle: '#7c848c',
    arcActive: '#2d6b00',
    rule: '#c6ccd3',
  }),
});

/** @type {Readonly<Record<'dark'|'light', Theme>>} */
export const THEMES = Object.freeze({ dark: DARK, light: LIGHT });

/**
 * Which text tokens the UI is permitted to place on which surface. The contrast gate walks
 * exactly this list, in both themes. Adding a pairing here is a commitment to pass the maths.
 *
 * Every pairing below is normal sized text and is gated at 4.5:1. Nothing in this product is
 * allowed to rely on the 3.0:1 large text allowance: the numbers are small, they are the
 * product, and a reader squinting at a latency figure is the wrong place to spend a concession.
 */
export const PAIRS = Object.freeze([
  Object.freeze({ surface: 'base', text: 'ink' }),
  Object.freeze({ surface: 'base', text: 'inkSoft' }),
  Object.freeze({ surface: 'base', text: 'inkFaint' }),
  Object.freeze({ surface: 'base', text: 'accent' }),
  Object.freeze({ surface: 'base', text: 'badgeMeasured' }),
  Object.freeze({ surface: 'base', text: 'badgeReported' }),
  Object.freeze({ surface: 'base', text: 'badgeComputed' }),
  Object.freeze({ surface: 'base', text: 'badgeInferred' }),
  Object.freeze({ surface: 'raised', text: 'ink' }),
  Object.freeze({ surface: 'raised', text: 'inkSoft' }),
  Object.freeze({ surface: 'raised', text: 'inkFaint' }),
  Object.freeze({ surface: 'raised', text: 'accent' }),
  Object.freeze({ surface: 'raised', text: 'badgeMeasured' }),
  Object.freeze({ surface: 'raised', text: 'badgeReported' }),
  Object.freeze({ surface: 'raised', text: 'badgeComputed' }),
  Object.freeze({ surface: 'raised', text: 'badgeInferred' }),
  Object.freeze({ surface: 'accentFill', text: 'onAccent' }),
]);

/** WCAG 2.x AA threshold for normal sized text. */
export const AA_NORMAL = 4.5;

// The two banned house values do NOT live here. They are in scripts/banned-colours.mjs, and
// that file explains why: a module that names the strings the banned colour scan looks for
// cannot be a module that ships, and this one has to ship because src/globe/palette.js hands
// these values to a shader at runtime.

/**
 * sRGB relative luminance, WCAG 2.x definition. Input is #rrggbb, lower case or upper.
 * @param {string} hex
 * @returns {number}
 */
export function relativeLuminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new TypeError('relativeLuminance: expected #rrggbb, got ' + JSON.stringify(hex));
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
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Emit the palette as CSS custom properties, so the stylesheet is generated from this file and
 * cannot drift from what the gate checked.
 * @param {Theme} theme
 * @returns {string}
 */
export function themeToCssVars(theme) {
  const lines = [];
  for (const [k, v] of Object.entries(theme.surface)) lines.push('  --surface-' + kebab(k) + ': ' + v + ';');
  for (const [k, v] of Object.entries(theme.text)) lines.push('  --text-' + kebab(k) + ': ' + v + ';');
  for (const [k, v] of Object.entries(theme.line)) lines.push('  --line-' + kebab(k) + ': ' + v + ';');
  return lines.join('\n');
}

/** @param {string} s @returns {string} */
function kebab(s) {
  return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
