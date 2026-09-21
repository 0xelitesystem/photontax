#!/usr/bin/env node
// A SMALL, CONSERVATIVE MINIFIER. Zero dependencies, because the repo has none.
//
// WHY THIS EXISTS. DESIGN 6.3 makes the payload a gate rather than an aspiration: the single
// file must transfer under 40 KB gzipped. This repository also writes long comments on purpose,
// because the reasoning behind a claim boundary is the part that rots first. Those two are only
// in conflict if the shipped page is the source file. It is not: the source stays fully
// commented and the build strips the commentary out of the copy that travels.
//
// The first build of the page came to 105 KB gzipped, of which the great majority was prose.
//
// WHAT IT DOES, AND DELIBERATELY NOTHING MORE.
//   - removes line and block comments
//   - trims leading and trailing whitespace on every line and drops blank lines
// It does NOT rename anything, does not remove newlines between statements, and does not touch
// anything inside a string, a template literal or a regular expression. Renaming is where a
// hand written minifier goes wrong, and the saving from renaming in a gzipped payload is small
// because gzip already models repeated identifiers well.
//
// HOW IT AVOIDS THE CLASSIC BUG. A naive comment stripper corrupts `'https://x'` and
// `/\/\//.test(s)`. This one is a character scanner with an explicit state for each of: a
// single quoted string, a double quoted string, a template literal (with nesting through
// `${ ... }`), a regular expression literal, a line comment and a block comment.
//
// Telling `/` as division from `/` as the start of a regular expression is the one genuinely
// ambiguous case in JavaScript lexing. The rule used here is the standard one: a `/` begins a
// regular expression when the previous significant token cannot end an expression, which means
// a punctuator such as ( , = : [ ! & | ? { } ; or an arithmetic operator, or one of the
// keywords that must be followed by an expression. Anything else, including an identifier, a
// number, a closing bracket or a closing parenthesis, means division.
//
// AND HOW IT IS KEPT HONEST. scripts/build.mjs compiles the minified page with node:vm before
// writing it, so a minifier bug is a build failure rather than a blank page, and
// test/ui.test.js evaluates every minified module and compares its exports against the values
// the unminified module produces.

/** Keywords after which a `/` must start a regular expression rather than a division. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case',
  'do', 'else', 'yield', 'await',
]);

/** Punctuators after which a `/` must start a regular expression. */
const REGEX_PRECEDING_PUNCTUATION = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^',
  '<', '>',
]);

/**
 * @param {string} out The output written so far.
 * @returns {boolean} True when a `/` at this position begins a regular expression.
 */
function slashStartsRegex(out) {
  let i = out.length - 1;
  while (i >= 0 && /\s/.test(out[i])) i -= 1;
  if (i < 0) return true;
  const ch = out[i];
  if (REGEX_PRECEDING_PUNCTUATION.has(ch)) return true;
  if (/[A-Za-z_$]/.test(ch)) {
    let j = i;
    while (j >= 0 && /[\w$]/.test(out[j])) j -= 1;
    return REGEX_PRECEDING_KEYWORDS.has(out.slice(j + 1, i + 1));
  }
  return false;
}

/**
 * Remove comments without touching string, template or regular expression content.
 * @param {string} src
 * @returns {string}
 */
export function stripComments(src) {
  let out = '';
  let i = 0;
  /** Depth of `${` inside template literals, so a nested template closes correctly. */
  const templateStack = [];

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      // A block comment between two tokens must not glue them together, and must not leave a
      // gap where there was none either.
      if (/[\w$]/.test(out[out.length - 1] || '') && /[\w$]/.test(src[i] || '')) out += ' ';
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch; i += 1;
      while (i < src.length) {
        out += src[i];
        if (src[i] === '\\') { out += src[i + 1]; i += 2; continue; }
        if (src[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (ch === '`') {
      out += ch; i += 1;
      templateStack.push('template');
      while (i < src.length && templateStack.length > 0) {
        if (src[i] === '\\') { out += src[i] + src[i + 1]; i += 2; continue; }
        if (src[i] === '`') { out += src[i]; i += 1; templateStack.pop(); continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          // Hand the substitution back to the main scanner so comments inside it are stripped
          // and a nested template literal is handled by the same code path.
          out += '${'; i += 2;
          let depth = 1;
          let inner = '';
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth += 1;
            if (src[i] === '}') { depth -= 1; if (depth === 0) break; }
            inner += src[i]; i += 1;
          }
          out += stripComments(inner) + '}';
          i += 1;
          continue;
        }
        out += src[i]; i += 1;
      }
      continue;
    }
    if (ch === '/' && slashStartsRegex(out)) {
      out += ch; i += 1;
      let inClass = false;
      while (i < src.length) {
        out += src[i];
        if (src[i] === '\\') { out += src[i + 1]; i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { i += 1; break; }
        i += 1;
      }
      while (i < src.length && /[a-z]/.test(src[i])) { out += src[i]; i += 1; }
      continue;
    }

    // Normal state, so this whitespace is between tokens rather than inside a literal. Runs of
    // it collapse to one character, which is safe here for the same reason it would be unsafe
    // two branches up: the scanner knows it is not inside a string, a template or a regular
    // expression.
    if ((ch === ' ' || ch === '	') && (out[out.length - 1] === ' ' || out[out.length - 1] === '	')) {
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Strip comments, then trim every line and drop the blank ones.
 *
 * Newlines between statements are KEPT. Removing them would require deciding where automatic
 * semicolon insertion matters, which is a much larger correctness surface than this saves:
 * gzip compresses a newline to almost nothing.
 *
 * @param {string} src
 * @returns {string}
 */
export function minify(src) {
  return stripComments(src)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
