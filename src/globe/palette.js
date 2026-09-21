// The globe palette, taken from the tokens and never invented here. GLOBE team. DESIGN 6.2,
// DESIGN 6.6.
//
// src/core/tokens.js is the single source of truth for every colour in this product, and
// scripts/gate-contrast.mjs does the WCAG arithmetic on it. This module does exactly one
// thing: turn those token strings into the float triples WebGL wants, and name which token
// plays which role in the scene. It declares no colour of its own, so there is no colour in
// the globe that the contrast gate has never seen.
//
// THE COLOUR BUDGET, which is the art direction in one paragraph. The ground is near black.
// Coastlines are a single restrained grey. Idle arcs are a dimmer grey still. Exactly one
// thing in the entire scene is saturated: the accent, and it is spent on the single worst
// offender. If a second element ever wants the accent, the answer is no, because the reason
// the one line reads at all is that nothing else competes with it.
//
// A NOTE ON WHAT IS AND IS NOT CONTRAST GATED. The contrast gate governs TEXT on a SURFACE.
// A coastline stroke on the ocean is not text and is not gated as text; it is a graphical
// object, and its legibility is an art direction question, not a WCAG 1.4.3 one. Every piece
// of TEXT this module is responsible for, which is the endpoint list that gives the globe its
// keyboard path, sits on an opaque surface token and is listed in GLOBE_TEXT_PAIRS below,
// where test/globe-a11y.test.js recomputes the ratio by math rather than looking at it.
//
// Isomorphic: no node:* imports and no DOM.

import { THEMES, PAIRS, AA_NORMAL, contrastRatio } from '../core/tokens.js';

/**
 * Hex to a linear float triple for a shader uniform.
 *
 * The values stay in sRGB. The renderer draws into a default, non colour managed WebGL
 * drawing buffer, so a value written to gl_FragColor is treated as sRGB by the compositor.
 * Converting to linear here and not converting back would lighten every token away from the
 * value the contrast gate checked, which would quietly break the one property this product
 * cannot get wrong.
 *
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new TypeError('hexToRgb: expected #rrggbb, got ' + JSON.stringify(hex));
  const v = m[1];
  return [
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255,
  ];
}

/**
 * Alpha values for the scene, gathered here so the whole colour budget is auditable on one
 * screen. They are opacities, not colours, so they are not tokens and not contrast gated.
 */
export const ALPHA = Object.freeze({
  /**
   * The atmosphere shell at the limb. One backface rendered shell, additive, depth tested and
   * not depth writing (DESIGN 6.1). Held well under 1: additive blending saturates towards
   * white, and DESIGN 6.2 says nothing in this scene is white.
   */
  atmosphere: 0.6,
  /** The same shell on the light theme, composited over rather than added. See globePalette. */
  atmosphereLight: 0.5,
  /** The faint inner rim that separates the disc from a page of the same near black. */
  surfaceRim: 0.85,
  /** An arc that is neither selected nor the worst offender. */
  arcIdle: 0.7,
  /** The selected arc. Brighter, still not the accent: the accent belongs to one line. */
  arcSelected: 0.9,
  /** The worst offender. The only saturated thing on screen. */
  arcWorst: 1,
  /**
   * The halo under the worst offender only. A wide, very dim second pass of the SAME accent,
   * which is the one place in the scene worth spending anything extra: the entire colour
   * budget exists so that one line reads, and a halo is how a thin stroke reads without being
   * made thick. No other element gets one.
   */
  arcWorstHalo: 0.16,
  /** The dash that travels along an arc, added over it. Never particles (DESIGN 6.2). */
  flow: 0.5,
});

/**
 * Stroke widths in CSS pixels, before the device pixel ratio. Constant at any zoom, which is
 * the entire reason for the screen space ribbon.
 */
export const WIDTH_PX = Object.freeze({
  coastline: 1.1,
  arcIdle: 1.4,
  arcSelected: 2,
  arcWorst: 2.6,
  marker: 3.6,
  markerWorst: 5.4,
  /** Multiplier on the worst arc width for its halo pass. */
  arcWorstHalo: 4,
});

/**
 * Resolve the scene colours for a theme.
 * @param {'dark'|'light'} themeName
 */
export function globePalette(themeName) {
  const theme = THEMES[themeName];
  if (!theme) throw new TypeError('globePalette: unknown theme ' + JSON.stringify(themeName));
  const dark = themeName === 'dark';

  // THE ONE PLACE THE TWO THEMES ARE NOT A SUBSTITUTION. An atmosphere on a near black ground
  // is light added at the limb. The same additive pass on a light ground saturates straight to
  // white and the globe dissolves into the page, which is not a smaller version of the right
  // answer, it is the wrong one. On light, the limb is a soft darkening composited over
  // instead, and the body's edge lift runs towards the rule token rather than the raised
  // surface, because on light the raised surface is the LIGHTER of the two and lifting towards
  // it would flatten exactly the edge it is there to draw.
  const atmosphereBlend = dark ? 'add' : 'over';

  return Object.freeze({
    themeName,
    /** The ocean and the page behind it are the same token. DESIGN 6.2. */
    ocean: hexToRgb(theme.surface.base),
    /**
     * The shift at the limb that gives the disc an edge without a texture.
     *
     * On dark this used to run towards the RAISED surface, #14171a against an ocean and a page
     * of #0a0a0a, a difference of ten values out of 255. It was invisible, and with it the
     * whole planet read as a grey circle of coastline floating on the page with no body and no
     * edge.
     *
     * It runs to the rule token in both themes now, #2a2e33 on dark: three times the
     * separation from the ocean that raised gave, so the sphere has a body and an edge, and
     * far enough from the coastline grey that the strokes are still the brightest thing on
     * it. Running it to the coastline token itself was tried and rejected by looking at the
     * render: the Fresnel band is a large fraction of a small disc, and the planet came out a
     * pale moon with the coastlines lost in it, which is the opposite of DESIGN 6.2's near
     * black ocean. No new colour either way, and none of the accent.
     */
    oceanRim: hexToRgb(theme.line.rule),
    /** DESIGN 6.2: thin luminous strokes, never white. */
    coastline: hexToRgb(theme.line.coastline),
    arcIdle: hexToRgb(theme.line.arcIdle),
    arcSelected: hexToRgb(theme.text.inkSoft),
    arcWorst: hexToRgb(theme.line.arcActive),
    atmosphere: hexToRgb(dark ? theme.line.arcIdle : theme.line.coastline),
    atmosphereBlend,
    atmosphereAlpha: dark ? ALPHA.atmosphere : ALPHA.atmosphereLight,
    marker: hexToRgb(theme.text.inkFaint),
    markerWorst: hexToRgb(theme.line.arcActive),
    observer: hexToRgb(theme.text.inkSoft),
  });
}

/**
 * Colour and width for one arc state.
 * @param {ReturnType<typeof globePalette>} pal
 * @param {'idle'|'selected'|'worst'} state
 */
export function arcStyle(pal, state) {
  if (state === 'worst') return { rgb: pal.arcWorst, alpha: ALPHA.arcWorst, widthPx: WIDTH_PX.arcWorst };
  if (state === 'selected') return { rgb: pal.arcSelected, alpha: ALPHA.arcSelected, widthPx: WIDTH_PX.arcSelected };
  return { rgb: pal.arcIdle, alpha: ALPHA.arcIdle, widthPx: WIDTH_PX.arcIdle };
}

/**
 * Every text token this module places on a surface, and where. test/globe-a11y.test.js walks
 * this list, recomputes the WCAG 2.x ratio in both themes, and fails under AA_NORMAL. It also
 * asserts each pairing is one src/core/tokens.js PAIRS already permits, so the globe cannot
 * introduce a combination the house palette never sanctioned.
 */
export const GLOBE_TEXT_PAIRS = Object.freeze([
  Object.freeze({ surface: 'raised', text: 'ink', where: 'endpoint list item label' }),
  Object.freeze({ surface: 'raised', text: 'inkSoft', where: 'endpoint list secondary line' }),
  Object.freeze({ surface: 'raised', text: 'inkFaint', where: 'the coastline attribution line' }),
  Object.freeze({ surface: 'raised', text: 'accent', where: 'the worst offender list item' }),
  Object.freeze({ surface: 'base', text: 'ink', where: 'the no WebGL2 fallback notice' }),
  Object.freeze({ surface: 'base', text: 'inkSoft', where: 'the fallback map caption' }),
]);

/**
 * The arithmetic, exported so the test and the browser self test run the same code rather than
 * two implementations of the same formula.
 * @returns {{surface:string, text:string, where:string, theme:string, ratio:number, pass:boolean, sanctioned:boolean}[]}
 */
export function globeContrastReport() {
  const out = [];
  for (const pair of GLOBE_TEXT_PAIRS) {
    const sanctioned = PAIRS.some((p) => p.surface === pair.surface && p.text === pair.text);
    for (const themeName of ['dark', 'light']) {
      const theme = THEMES[themeName];
      const ratio = contrastRatio(theme.text[pair.text], theme.surface[pair.surface]);
      out.push({
        surface: pair.surface,
        text: pair.text,
        where: pair.where,
        theme: themeName,
        ratio,
        pass: ratio >= AA_NORMAL,
        sanctioned,
      });
    }
  }
  return out;
}
