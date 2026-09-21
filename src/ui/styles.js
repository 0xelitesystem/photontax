// THE STYLESHEET, GENERATED FROM THE PALETTE. DESIGN 6.2 (art direction), DESIGN 6.6 (WCAG AA
// verified by math), DESIGN 6.3 (first paint budget).
//
// WHY THE CSS IS GENERATED RATHER THAN WRITTEN.
//
// scripts/gate-contrast.mjs proves that every pair in tokens.js PAIRS clears 4.5:1 in both
// themes. That is necessary and it is not sufficient: it says the palette is sound, not that
// the page uses it soundly. A stylesheet written by hand can still put a text token on a
// surface PAIRS never listed, and no gate that reads tokens.js alone will ever notice.
//
// So this file does not contain a stylesheet. It contains USED_PAIRS, a list of every place
// the page puts a foreground on a background, and a generator that emits CSS FROM that list.
// Two consequences, and the second is the one that matters:
//
//   1. test/ui.test.js walks USED_PAIRS, asserts each entry exists in tokens.js PAIRS, and
//      recomputes the WCAG ratio for it in BOTH themes. Verified by math, by script, never by
//      eye, exactly as DESIGN 6.6 requires.
//   2. buildCss() THROWS on an entry that is not in PAIRS. It is not possible to ship a
//      combination nobody has checked, because the stylesheet cannot be produced at all.
//
// Colour values never appear here. Every rule references a custom property emitted by
// themeToCssVars(), so the only hex digits that reach docs/index.html are token values, which
// is what gate-contrast's undeclared hex scan requires.
//
// Build time only. The page never imports this module; scripts/build.mjs calls it and inlines
// the result, so tokens.js (which must name the banned house colours in order to reject them)
// is never copied into shipped HTML.

import { DARK, LIGHT, PAIRS, themeToCssVars, contrastRatio, THEMES, AA_NORMAL } from '../core/tokens.js';
import { USED_PAIRS, SEGMENT_TOKENS } from './pairs.js';

export { USED_PAIRS, SEGMENT_TOKENS };

/** @param {UsedPair} p @returns {string} */
function pairKey(p) { return p.surface + '/' + p.text; }

/**
 * Check one USED_PAIRS entry against tokens.js. Throws rather than warns: a stylesheet that
 * cannot be produced is a stylesheet that cannot ship broken.
 * @param {UsedPair} p
 */
function assertPairDeclared(p) {
  if (p.text === null) return;
  const declared = PAIRS.some((q) => q.surface === p.surface && q.text === p.text);
  if (!declared) {
    throw new RangeError('styles: ' + p.selector + ' puts text token "' + p.text + '" on surface "'
      + p.surface + '", which src/core/tokens.js PAIRS does not list. The contrast gate walks '
      + 'PAIRS, so this combination has never been checked by anything. Add it to PAIRS and let '
      + 'the gate compute it, or use a token the design already put there.');
  }
  for (const [themeName, theme] of Object.entries(THEMES)) {
    const r = contrastRatio(theme.text[p.text], theme.surface[p.surface]);
    if (!(r >= AA_NORMAL)) {
      throw new RangeError('styles: ' + p.selector + ' in the ' + themeName + ' theme computes '
        + r.toFixed(2) + ':1, below ' + AA_NORMAL + ':1.');
    }
  }
}

/**
 * The colour rules, emitted from USED_PAIRS and from nothing else.
 * @returns {string}
 */
function colourRules() {
  const seen = new Set();
  const out = [];
  for (const p of USED_PAIRS) {
    assertPairDeclared(p);
    const key = pairKey(p) + '|' + p.selector;
    if (seen.has(key)) throw new RangeError('styles: duplicate rule for ' + p.selector);
    seen.add(key);
    const decls = [];
    if (p.paints) decls.push('background-color: var(--surface-' + kebab(p.surface) + ')');
    if (p.text) decls.push('color: var(--text-' + kebab(p.text) + ')');
    if (p.extra) decls.push(p.extra);
    out.push(p.selector + ' { ' + decls.join('; ') + '; }');
  }
  return out.join('\n');
}

/** @param {string} s @returns {string} */
function kebab(s) { return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()); }

/**
 * Structure, spacing and motion. No colour value of any kind appears below; every colour is a
 * custom property emitted by themeToCssVars or a rule emitted by colourRules.
 *
 * Type: a system font stack and nothing else. DESIGN 6.3 forbids a font loaded from a network,
 * and a web font is also the single most common reason a page that is otherwise 40 KB paints
 * late. Numerals are tabular everywhere a figure sits in a column, because a latency table
 * whose digits jitter as it animates reads as broken even when it is right.
 */
const LAYOUT = String.raw`
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  letter-spacing: 0.01em;
}
.pt-num, .pt-table td, .pt-table th { font-variant-numeric: tabular-nums; }
.pt-mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-variant-numeric: tabular-nums;
}

/* Skip link. Keyboard reaches the authoritative table without traversing the decorative scene. */
.pt-skip {
  position: absolute; left: -9999px; top: 0; z-index: 10;
  padding: 0.6rem 1rem; border-radius: 0 0 6px 0;
}
.pt-skip:focus { left: 0; }

.pt-shell { max-width: 72rem; margin: 0 auto; padding: 0 1.25rem 5rem; }
/* The shell that holds the masthead. Its 5rem of bottom padding is for a reading section and
   it was 80 px of nothing between the wordmark and the hook. */
.pt-shell-tight { padding-bottom: 0; }

/* ---- The scene. The canvas is decorative; the DOM below it is authoritative. ---- */
/* Full bleed, and exactly full bleed. This used to carry margin: 0 -1.25rem to cancel
   the shell's padding, from when the scene lived INSIDE .pt-shell. It does not: it is a
   sibling of the shell and a direct child of the mount point, so the negative margin had no
   padding to cancel and simply made the page forty pixels wider than the viewport. The body
   then scrolled horizontally on every screen size, which is a defect on its own and hides
   real overflow when you go looking for it. */
.pt-scene { position: relative; margin: 0; }
.pt-canvas-wrap {
  position: relative;
  aspect-ratio: 16 / 9;
  max-height: 62vh;
  /* max-height on an aspect-ratio box shrinks its WIDTH too, so on a wide window the scene was
     a globe hard against the left edge with half the viewport empty beside it. Centring it is
     one line and it is the difference between a composition and an accident. */
  margin-inline: auto;
  overflow: hidden;
}
.pt-canvas-wrap > canvas, .pt-canvas-wrap > svg { display: block; width: 100%; height: 100%; }
.pt-scene-overlay {
  position: absolute; left: 1.25rem; bottom: 1.25rem; right: 1.25rem;
  display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end;
  pointer-events: none;
}
.pt-scene-overlay > * { pointer-events: auto; }

/* ---- Panels. The ONLY element that repaints a surface, which is what keeps every
   "this text sits on raised" claim in USED_PAIRS structurally true. ---- */
.pt-panel {
  border: 1px solid var(--line-rule);
  border-radius: 10px;
  padding: 1rem 1.15rem;
}
.pt-panel-tight { padding: 0.7rem 0.9rem; }

.pt-masthead {
  display: flex; flex-wrap: wrap; gap: 1rem; align-items: baseline;
  justify-content: space-between;
  padding: 1.5rem 0 1rem;
}
.pt-wordmark {
  font-size: 1.05rem; font-weight: 650; letter-spacing: 0.14em; text-transform: uppercase;
  margin: 0;
}
.pt-controls { display: flex; gap: 0.5rem; flex-wrap: wrap; }

/* THE HOOK, AT DISPLAY SIZE. It used to be set at body-plus, sat under a full bleed globe,
   and was cut off below the fold on a laptop. It is the strongest true sentence this product
   owns, so it leads and it is the largest thing on the page. */
.pt-lede { font-size: clamp(1.7rem, 3.7vw, 2.85rem); line-height: 1.1; margin: 0 0 1.1rem; font-weight: 640; letter-spacing: -0.021em; text-wrap: balance; }
/* display: inline, and it is not cosmetic. .pt-claim is inline-flex everywhere else, which
   makes it an ATOMIC inline box, and the line breaker is allowed to break immediately after an
   atomic box even with no whitespace there. The sentence is "... is 12855 km. Light in glass
   ...", so the break landed between the figure and the full stop and the next line of the
   headline began with a lone period. As a non atomic inline there is no break opportunity at
   that boundary at all, and nowrap keeps the figure and its badge together. */
.pt-lede .pt-claim { display: inline; white-space: nowrap; }
.pt-lede .pt-claim .pt-badge { margin-left: 0.3em; }
/* The badge stays legible without scaling with the display type, which would turn a four
   letter provenance word into a second headline. */
.pt-lede .pt-badge { font-size: 0.72rem; letter-spacing: 0.1em; }
/* ---- THE OPENING FRAME. DESIGN 5 second 0, and the layout that makes it true. ----

   The hierarchy used to be inverted: a full bleed 16 by 9 globe took the whole width above
   the fold, the sentence that makes the point was pushed under it, and the only control on
   the page was off screen entirely. The scene is decorative by the product's own words, so
   it is now a square card beside the words rather than the centrepiece, and the words and the
   button own the frame.

   Square, not 16 by 9, and that is the whole reason the globe reads at all. The camera fits
   the sphere to 0.8 of the NDC HALF HEIGHT (DEFAULT_NDC_RADIUS in src/globe/camera.js), so in
   a 16 by 9 box the disc is eight tenths of the height and the other seven ninths of the width
   is empty page. Same pixels, no dead space, a visibly larger planet. ---- */
.pt-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  gap: clamp(1.5rem, 4vw, 3.25rem);
  align-items: center;
  padding-top: 0.25rem;
  padding-bottom: 2rem;
}
.pt-hero .pt-section { padding-top: 0.9rem; }
.pt-hero .pt-section:first-child { padding-top: 0; }
.pt-hero .pt-prose { font-size: 0.92rem; max-width: 56ch; margin-bottom: 0; }
.pt-hero .pt-fine { font-size: 0.78rem; }
.pt-hero .pt-h2 { margin-bottom: 0.6rem; font-size: 0.95rem; }
.pt-hero #floor .pt-fine { max-width: 72ch; }
.pt-hero .pt-cta { align-items: center; gap: 0.9rem 1.25rem; }
.pt-hero .pt-hostlist { columns: 2 11rem; }
.pt-hero-scene { display: flex; flex-direction: column; justify-content: center; align-items: center; }
.pt-hero-scene .pt-scene { width: 100%; max-width: 23rem; }
.pt-hero-note { font-size: 0.88rem; max-width: 23rem; margin: 1.1rem 0 0; }
/* The one accent above the card. DESIGN 6.2 spends the accent budget inside the SCENE on a
   single arc; this is page chrome and not a scene element, and it is what puts the accent in
   the opening frame beside the button rather than leaving the frame colourless. */
.pt-hero-scene .pt-scene::before {
  content: ''; display: block;
  width: 3.5rem; height: 2px; border-radius: 2px; margin: 0 0 0.8rem;
  background-color: var(--line-arc-active);
}
.pt-hero-scene .pt-canvas-wrap {
  aspect-ratio: 1 / 1;
  max-height: none;
  border: 1px solid var(--line-rule);
  border-radius: 14px;
}
.pt-hero-scene .pt-scene-overlay { left: 0.7rem; right: 0.7rem; bottom: 0.7rem; }
.pt-scene-note { margin-top: 0.7rem; }

/* ---- The stand in, for the moment before the deferred globe arrives and for a browser that
   never gets one. DESIGN 6.3 takes the renderer off the critical path, so SOMETHING has to
   hold that space, at that size, or the page reflows under the reader as it lands. A drawn
   disc with one accent great circle is a better answer than an empty box, and it is the same
   silhouette the renderer paints into. Decorative: the wrap above it carries the text
   alternative and this is aria-hidden. ---- */
.pt-globe-standin { position: absolute; inset: 0; display: grid; place-items: center; }
.pt-globe-standin::before {
  content: '';
  grid-area: 1 / 1;
  width: 80%; aspect-ratio: 1 / 1; border-radius: 50%;
  border: 1px solid var(--line-coastline);
  background-image: radial-gradient(circle at 34% 30%, var(--surface-raised), var(--surface-base) 70%);
}
.pt-globe-standin-arc {
  grid-area: 1 / 1;
  width: 80%; aspect-ratio: 1 / 1; border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: var(--line-arc-active);
  transform: rotate(-38deg);
}

.pt-prose, .pt-prose-panel { margin: 0 0 0.75rem; max-width: 62ch; }
.pt-fine, .pt-fine-panel { font-size: 0.82rem; line-height: 1.5; margin: 0; }
.pt-section { padding-top: 2.5rem; }
.pt-h2 { font-size: 1.1rem; font-weight: 650; letter-spacing: 0.09em; text-transform: uppercase; margin: 0 0 0.9rem; }
.pt-h3 { font-size: 0.95rem; font-weight: 650; margin: 1.25rem 0 0.5rem; }
.pt-rule { border: 0; border-top: 1px solid var(--line-rule); margin: 2rem 0 0; }

/* ---- The one focused control. DESIGN 5: a single button, already focused, with the exact
   request count and destination list printed beside it BEFORE any click. ---- */
.pt-cta { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start; }
.pt-button {
  font: inherit; font-weight: 650; letter-spacing: 0.02em;
  border: 1px solid var(--surface-accent-fill);
  border-radius: 8px; padding: 0.75rem 1.4rem; cursor: pointer;
}
.pt-button:disabled { cursor: progress; opacity: 0.75; }
.pt-button-quiet {
  background-color: transparent; border-color: var(--line-rule);
  font-weight: 550; padding: 0.4rem 0.8rem; font-size: 0.85rem; border-radius: 6px;
}
:focus-visible { outline: 3px solid var(--line-arc-active); outline-offset: 2px; }

/* ---- Badges. Text plus a distinct SHAPE, never colour alone. DESIGN 6.6, trap 19. ---- */
.pt-claim { display: inline-flex; align-items: baseline; gap: 0.32em; white-space: nowrap; }
.pt-badge {
  display: inline-flex; align-items: center; gap: 0.25em;
  font-size: 0.66em; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
}
.pt-badge svg { width: 0.72em; height: 0.72em; overflow: visible; flex: none; }
.pt-badge-shape { fill: currentColor; stroke: currentColor; }
.pt-badge-shape-hollow { fill: none; stroke: currentColor; stroke-width: 2.4; }
.pt-legend { display: flex; flex-wrap: wrap; gap: 0.6rem 1.6rem; list-style: none; margin: 0; padding: 0; }

/* ---- The table. DESIGN 6.6: this is the authoritative result and the canvas is not. ---- */
.pt-table-wrap { overflow-x: auto; }
.pt-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.pt-table caption { text-align: left; padding-bottom: 0.6rem; }
.pt-table th, .pt-table td { text-align: right; padding: 0.55rem 0.5rem; border-bottom: 1px solid var(--line-rule); vertical-align: top; }
.pt-table th:first-child, .pt-table td:first-child { text-align: left; }
.pt-table thead th { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 650; white-space: nowrap; }
.pt-table tbody tr { transition: transform 420ms ease; }
.pt-row-region { display: block; font-weight: 600; }

/* ---- The three segment stacked bar. Physics, then access, then route, in that order,
   because the order IS the argument. DESIGN 5 seconds 4 to 7. ---- */
.pt-bar-cell { width: 34%; min-width: 11rem; }
/* The verdict is a sentence and the region is a name. Left to themselves in a table that is
   already wider than most windows, both collapsed to about one word per line. Giving each a
   floor makes the table wider than the viewport on a laptop, which is correct and handled:
   .pt-table-wrap scrolls horizontally, so the TABLE scrolls and the page never does. */
.pt-table th:first-child, .pt-table td:first-child { min-width: 9.5rem; }
.pt-cell-verdict { min-width: 15rem; text-align: left; }
.pt-cell-roundtrip, .pt-cell-ratio { min-width: 7rem; }
.pt-bar { display: flex; height: 0.72rem; border-radius: 3px; overflow: hidden; background-color: transparent; }
.pt-seg { height: 100%; width: 0; transition: width 560ms cubic-bezier(0.22, 0.7, 0.24, 1); }
.pt-seg-physics { background-color: __SEG_PHYSICS__; }
.pt-seg-access  { background-color: __SEG_ACCESS__; }
.pt-seg-route   { background-color: __SEG_ROUTE__; }
.pt-seg-access  { transition-delay: 240ms; }
.pt-seg-route   { transition-delay: 520ms; }

/* ---- The maths panel. The credibility moment, so it is readable rather than compact. ---- */
.pt-maths summary { cursor: pointer; font-weight: 650; padding: 0.5rem 0; }
.pt-maths summary::marker { content: ''; }
.pt-maths summary::-webkit-details-marker { display: none; }
.pt-maths summary::before { content: '+ '; }
.pt-maths[open] summary::before { content: '- '; }
.pt-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.1rem; }
.pt-step { display: grid; gap: 0.3rem; }
.pt-step-label { font-size: 0.72rem; letter-spacing: 0.09em; text-transform: uppercase; font-weight: 650; }
.pt-expr { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4em; font-size: 0.95rem; }
.pt-samples { display: flex; flex-wrap: wrap; gap: 0.4rem; list-style: none; margin: 0.2rem 0 0; padding: 0; }
.pt-sample { border: 1px solid var(--line-rule); border-radius: 5px; padding: 0.2rem 0.5rem; }
.pt-sample-min { border-color: var(--line-arc-active); border-width: 2px; }

.pt-kv { display: grid; grid-template-columns: minmax(8rem, max-content) 1fr; gap: 0.35rem 1rem; margin: 0; }
.pt-kv dt { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; }
.pt-kv dd { margin: 0; }

.pt-hostlist { columns: 2 16rem; list-style: none; margin: 0.4rem 0 0; padding: 0; font-size: 0.78rem; }
.pt-sources { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.9rem; }
.pt-selftest { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; font-size: 0.85rem; }
.pt-selftest li { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; }
.pt-status { font-weight: 700; letter-spacing: 0.08em; font-size: 0.72rem; }

.pt-headline { font-size: clamp(1.25rem, 2.9vw, 1.9rem); line-height: 1.3; font-weight: 600; letter-spacing: -0.012em; margin: 0 0 0.5rem; }
.pt-headline .pt-claim { white-space: nowrap; }

.pt-visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
[hidden] { display: none !important; }

/* One column before the two column frame would squeeze either side. The copy comes first in
   the document, so the sentence and the button stay in the opening frame on a phone and the
   globe follows them, which is the correct order for a decoration. */
@media (max-width: 62rem) {
  .pt-hero { grid-template-columns: minmax(0, 1fr); gap: 1.75rem; }
  .pt-hero-scene .pt-scene { max-width: 21rem; }
}

@media (min-width: 62.01rem) {
  /* Fill the frame. The opening frame is the whole viewport under the masthead and the
     content is centred in it, so there is no dead band under the fold line. */
  .pt-hero { min-height: calc(100vh - 8.5rem); }
}

@media (max-width: 40rem) {
  .pt-canvas-wrap { aspect-ratio: 4 / 3; }
  .pt-hero .pt-hostlist { columns: 1; }
  .pt-scene-overlay { position: static; padding: 0 1.25rem; }
  .pt-bar-cell { width: auto; min-width: 7rem; }
  .pt-table { font-size: 0.8rem; }
}

/* DESIGN 6.6: reduced motion kills the flow animation, the rotation and every camera tween,
   and cuts to the final state. It does not merely slow them down. */
@media (prefers-reduced-motion: reduce) {
  .pt-seg, .pt-table tbody tr { transition: none !important; }
  .pt-seg-access, .pt-seg-route { transition-delay: 0ms !important; }
}
`;

/**
 * The whole stylesheet: token custom properties for both themes, then the colour rules
 * generated from USED_PAIRS, then the colourless layout.
 *
 * The theme is chosen by an explicit data-theme attribute when the reader has picked one and
 * by prefers-color-scheme otherwise, so both themes are real and both are gated.
 *
 * @returns {string}
 */
/**
 * The placeholders LAYOUT carries for the three bar segment fills, and the token each is
 * replaced by.
 *
 * THIS LIST USED TO BE WRITTEN INLINE AND IT WAS WRONG. The replacements named
 * `${'PHYSICS'}` while the template said `__SEG_PHYSICS__`, so String.replace looked for a
 * needle that was not there, found nothing, changed nothing, and returned the string unharmed.
 * The page shipped with `background-color: __SEG_PHYSICS__` in its stylesheet, which a browser
 * discards as an invalid declaration, so all three segments of the stacked bar rendered
 * transparent. That bar is the centrepiece of the reveal, and the page had been through a full
 * test suite and four gates without anybody seeing it, because nothing rendered colour.
 *
 * A silent no-op replace is the whole failure. assertNoPlaceholders below makes it loud.
 */
const SEGMENT_PLACEHOLDERS = Object.freeze([
  Object.freeze({ token: '__SEG_PHYSICS__', value: () => SEGMENT_TOKENS.physics }),
  Object.freeze({ token: '__SEG_ACCESS__', value: () => SEGMENT_TOKENS.access }),
  Object.freeze({ token: '__SEG_ROUTE__', value: () => SEGMENT_TOKENS.route }),
]);

/**
 * Refuse a stylesheet with an unsubstituted placeholder in it.
 *
 * A browser drops an invalid declaration silently, so the consequence of missing one is a
 * missing colour and not an error, and a missing colour on a decorative fill is exactly the
 * kind of thing a test suite with no renderer will never see.
 *
 * @param {string} css
 */
function assertNoPlaceholders(css) {
  const left = css.match(/__[A-Z][A-Z0-9_]*__|\$\{[^}]*\}/g);
  if (left) {
    throw new RangeError('styles: the stylesheet still contains ' + [...new Set(left)].join(', ')
      + '. A browser discards an invalid declaration in silence, so this would have shipped as '
      + 'a missing colour rather than as an error. Every placeholder in LAYOUT must appear in '
      + 'SEGMENT_PLACEHOLDERS.');
  }
}

export function buildCss() {
  const rules = colourRules();
  let layout = LAYOUT;
  for (const p of SEGMENT_PLACEHOLDERS) {
    if (!layout.includes(p.token)) {
      throw new RangeError('styles: SEGMENT_PLACEHOLDERS names ' + p.token + ', which is not in '
        + 'LAYOUT. A replacement that matches nothing is a replacement that does nothing.');
    }
    layout = layout.split(p.token).join(p.value());
  }
  assertNoPlaceholders(layout);

  return [
    ':root {\n' + themeToCssVars(DARK) + '\n  color-scheme: dark;\n}',
    '@media (prefers-color-scheme: light) {\n  :root:not([data-theme="dark"]) {\n'
      + themeToCssVars(LIGHT).replace(/^/gm, '  ') + '\n    color-scheme: light;\n  }\n}',
    ':root[data-theme="light"] {\n' + themeToCssVars(LIGHT) + '\n  color-scheme: light;\n}',
    ':root[data-theme="dark"] {\n' + themeToCssVars(DARK) + '\n  color-scheme: dark;\n}',
    rules,
    layout.trim(),
  ].join('\n\n');
}
