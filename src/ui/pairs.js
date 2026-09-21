// EVERY foreground over background combination the page produces, as data.
//
// DESIGN 6.6: WCAG AA verified by math, in both themes, by script, never by eye.
//
// This list is read by three different things, which is the reason it is a module of its own
// rather than a constant inside the stylesheet generator:
//
//   src/ui/styles.js   generates the CSS FROM this list at build time, and refuses to emit a
//                      rule for a pair that src/core/tokens.js PAIRS does not declare. A
//                      combination nobody has checked cannot be produced at all.
//   test/ui.test.js    recomputes the WCAG 2.x ratio for every entry in BOTH themes against
//                      tokens.js, with no browser involved.
//   src/ui/selftest.js runs the same arithmetic IN THE PAGE, against the custom properties the
//                      browser actually resolved, so a reader can watch the contrast claim be
//                      recomputed rather than take our word for it.
//
// The third one is the interesting one. A static check proves the palette is sound. Reading
// the resolved custom properties proves the page shipped the palette it was checked against.
//
// `surface` on a transparent element is a claim about its ancestor, and the page keeps that
// claim true structurally: .pt-panel is the only element that repaints a surface, so anything
// inside a panel declares `raised` and anything outside one declares `base`. DESIGN 6.6
// requires exactly this for labels sitting over the moving canvas, which are contrast tested
// against an opaque token background and never against the canvas.
//
// Isomorphic: no node:* imports and no DOM.

/**
 * @typedef {Object} UsedPair
 * @property {string} selector The CSS selector this applies to.
 * @property {string} surface Surface token this element sits on.
 * @property {string|null} text Text token, or null for a surface only rule.
 * @property {boolean} paints Whether the rule sets background-color itself.
 */

/** @type {readonly UsedPair[]} */
export const USED_PAIRS = Object.freeze([
  Object.freeze({ selector: 'body', surface: 'base', text: 'ink', paints: true }),
  Object.freeze({ selector: '.pt-panel', surface: 'raised', text: 'ink', paints: true }),
  Object.freeze({ selector: '.pt-lede', surface: 'base', text: 'ink', paints: false }),
  // THE TWO FIGURES IN THE HOOK, AND THE ONLY PROSE THE ACCENT IS SPENT ON.
  //
  // The owner's reading of the old opening frame was that it carried no accent anywhere, and
  // it was correct: the accent lived on the button and the button was below the fold. The
  // button is now in the frame, and the accent also marks the two numbers the whole page is
  // about, which is the same rule DESIGN 6.2 applies inside the scene stated for the page:
  // the colour budget exists so that ONE thing reads.
  //
  // This sits after the .pt-lede entry so it wins at higher specificity, and it is the accent
  // token on base, which tokens.js PAIRS already declares and the gate already computes at
  // 17.12:1 dark and 5.46:1 light.
  Object.freeze({ selector: '.pt-lede .pt-num', surface: 'base', text: 'accent', paints: false }),
  Object.freeze({ selector: '.pt-prose', surface: 'base', text: 'inkSoft', paints: false }),
  Object.freeze({ selector: '.pt-prose-panel', surface: 'raised', text: 'inkSoft', paints: false }),
  Object.freeze({ selector: '.pt-fine', surface: 'base', text: 'inkFaint', paints: false }),
  Object.freeze({ selector: '.pt-fine-panel', surface: 'raised', text: 'inkFaint', paints: false }),
  Object.freeze({ selector: '.pt-accent', surface: 'base', text: 'accent', paints: false }),
  Object.freeze({ selector: '.pt-accent-panel', surface: 'raised', text: 'accent', paints: false }),
  Object.freeze({ selector: '.pt-button', surface: 'accentFill', text: 'onAccent', paints: true }),
  // THE QUIET BUTTON, AND WHY IT IS HERE NOW.
  //
  // .pt-button-quiet overrides the filled button's BACKGROUND to transparent and said nothing
  // about its colour, so it inherited color: var(--text-on-accent) from .pt-button. On the
  // accent fill that token is near black and correct; on the page's own dark surface, which is
  // what a transparent button actually sits on, it is near black on near black. Both header
  // controls rendered as empty outlined boxes with invisible labels.
  //
  // The contrast gate reported 34 of 34 pairs passing at the same moment, and it was right:
  // it walks PAIRS, and nobody had ever told it this combination existed. A gate checks what
  // it is told about. Declaring the pair is what makes it checkable, and the arithmetic then
  // runs on it in both themes like every other pair. Found by looking at a screenshot.
  //
  // paints: false, so only the colour is emitted and the transparent background in the layout
  // rules survives. It is listed after .pt-button so that the later rule wins at equal
  // specificity.
  Object.freeze({ selector: '.pt-button-quiet', surface: 'base', text: 'ink', paints: false }),
  Object.freeze({ selector: '.pt-badge[data-claim-badge="MEASURED"]', surface: 'base', text: 'badgeMeasured', paints: false }),
  Object.freeze({ selector: '.pt-badge[data-claim-badge="REPORTED"]', surface: 'base', text: 'badgeReported', paints: false }),
  Object.freeze({ selector: '.pt-badge[data-claim-badge="COMPUTED"]', surface: 'base', text: 'badgeComputed', paints: false }),
  Object.freeze({ selector: '.pt-badge[data-claim-badge="INFERRED"]', surface: 'base', text: 'badgeInferred', paints: false }),
  Object.freeze({ selector: '.pt-panel .pt-badge[data-claim-badge="MEASURED"]', surface: 'raised', text: 'badgeMeasured', paints: false }),
  Object.freeze({ selector: '.pt-panel .pt-badge[data-claim-badge="REPORTED"]', surface: 'raised', text: 'badgeReported', paints: false }),
  Object.freeze({ selector: '.pt-panel .pt-badge[data-claim-badge="COMPUTED"]', surface: 'raised', text: 'badgeComputed', paints: false }),
  Object.freeze({ selector: '.pt-panel .pt-badge[data-claim-badge="INFERRED"]', surface: 'raised', text: 'badgeInferred', paints: false }),
]);

/**
 * The distinct (surface, text) combinations, deduplicated. This is what the browser self test
 * walks, because a selector is a stylesheet detail and a colour pair is the thing WCAG has an
 * opinion about.
 * @type {readonly {surface:string, text:string}[]}
 */
export const USED_COLOUR_PAIRS = Object.freeze(
  [...new Map(
    USED_PAIRS.filter((p) => p.text !== null)
      .map((p) => [p.surface + '/' + p.text, { surface: p.surface, text: /** @type {string} */ (p.text) }]),
  ).values()].map((p) => Object.freeze(p)),
);

/**
 * Non text colour use: strokes, rules and the three bar segment fills. WCAG 1.4.3 governs text
 * and none of these carry any: the page never prints a figure inside a bar segment, precisely
 * so no reader has to resolve a number against a moving coloured fill.
 *
 * DESIGN 6.2 sets the three. Physics is the neutral off white because it is the part that
 * cannot move. Access is dim grey and identical on every row, which is how its constancy
 * becomes legible at a glance without reading a label. Route is the only segment that differs
 * in a way a reader can act on, and the only one with any saturation.
 */
export const SEGMENT_TOKENS = Object.freeze({
  physics: 'var(--text-ink)',
  access: 'var(--line-arc-idle)',
  route: 'var(--text-badge-inferred)',
});

/** The custom property name for a token, matching what themeToCssVars emits. */
export function cssVarName(group, token) {
  return '--' + group + '-' + token.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
