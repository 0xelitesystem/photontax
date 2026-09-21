// THE BANNED COLOUR REGISTRY. Two house values that shipped broken once already.
//
// WHY THIS IS ITS OWN FILE, AND WHY IT IS UNDER scripts/ RATHER THAN UNDER src/.
//
// A registry has to name what it rejects, so whatever file holds this list is a file that
// contains the very strings the banned colour scan exists to find. For as long as the list
// lived inside src/core/tokens.js, tokens.js had to be exempt from that scan AND had to be
// kept out of the shipped page entirely, or the page would have failed the gate for carrying
// the values the gate keeps out of pages.
//
// That was tolerable while tokens.js was only a build time input to the stylesheet. It stopped
// being tolerable the moment src/globe/palette.js needed the same palette AT RUNTIME, to hand
// real colour values to a shader. A module that cannot ship cannot be imported by a module
// that does, and the build said so.
//
// So the two strings moved here instead. Nothing in src/ imports this file and nothing can:
// scripts/ is not shipped copy, and the only consumer is scripts/gate-contrast.mjs. The gate
// is now STRICTER than it was, because src/core/tokens.js is no longer exempt from anything.
// There is no file under src/ that the banned colour scan skips.
//
// Replacements, for whoever hits the gate: #8a4d00 for warn, #a82d14 for error. Both are
// declared tokens and both are checked by math in both themes.

/**
 * Values the house gate rejects outright. #a05a00 and #b8341a fail AA on the light ground.
 * @type {readonly string[]}
 */
export const BANNED_COLOURS = Object.freeze(['#a05a00', '#b8341a']);

/** The replacement for each, so a failure message can say what to use instead. */
export const BANNED_COLOUR_REPLACEMENTS = Object.freeze({
  '#a05a00': '#8a4d00',
  '#b8341a': '#a82d14',
});
