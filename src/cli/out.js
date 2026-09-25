// THE ONLY WRITER. DESIGN-CLI section 0, items 3, 12 and 13.
//
// Nothing else under src/cli touches process.stdout, process.stderr or console. The test suite
// scans for it and so does gate-badges, because a second writer is a second place a figure could
// reach a reader without its badge, or a byte from the network could reach a terminal without
// being made inert.
//
// WHAT THIS MODULE GUARANTEES, and each one is tested:
//
//   1. Only parts are printed. A line is built from prose runs, Claims, provenance prose, and
//      the command line's two extra kinds (see ./parts.js). A plain string is taken as a prose
//      run and therefore refused if it carries a digit. So a bare number has no path out.
//   2. Every line is sanitised at write time. C0 controls except newline and tab, DEL, the C1
//      range, the bidi controls and every other Unicode format character are removed, except a
//      zero width joiner or non joiner between two letters, where some scripts need one.
//      Printable non ASCII passes untouched, so Montréal and São Paulo stay as the provider
//      spelled them. An escape sequence from anywhere (a server, a resolver, an argument)
//      arrives as inert text.
//   3. Colour is decoration only. The badge WORD is always printed; colour is added after
//      sanitising, only to the badge word and headings, and only when the output is a terminal
//      and neither NO_COLOR, --no-color, --plain nor --json says otherwise. FORCE_COLOR turns it
//      on for a non terminal. WCAG 1.4.1: nothing is carried by colour alone.
//   4. Text wraps at COLUMNS (80 when unset) and a figure is never split across two lines.
//   5. A reader that goes away (EPIPE, as when the output is piped into head) is not an error:
//      writing stops quietly, the run is told, and the exit code is 0.
//   6. With --json, stdout carries exactly one JSON document and nothing else.

import { renderClaim } from '../core/claim.js';
import { t, pp } from '../ui/parts.js';
import { isIdentifier } from './parts.js';
import { COPY } from './copy.js';

/** The wrap width when COLUMNS is unset and the output is not a terminal. */
export const DEFAULT_WIDTH = 80;
/** Narrower than this and wrapping stops being useful; COLUMNS below it is raised to it. */
export const MIN_WIDTH = 20;
/** The least room a labelled item's text is given beside its label before the item stacks. */
export const MIN_TEXT_COLUMNS = 24;

/**
 * C0 except tab and newline, DEL, C1, and the bidi controls named in DESIGN-CLI item 3. The line
 * and paragraph separators go too: neither is printable, and a terminal that honours one starts
 * a line the text never asked for. Every character here is written as an escape, never raw, so
 * this file cannot itself carry the thing it removes.
 */
const STRIP = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]/g;
/** Every other Unicode format character. */
const FORMAT = /\p{Cf}/gu;
/** A letter or a combining mark: what a joiner may sit between. */
const WORDLIKE = /^[\p{L}\p{M}]$/u;

/** @param {string} s @param {number} i @returns {string} the whole character ending before i */
function charBefore(s, i) {
  if (i <= 0) return '';
  const lo = s.charCodeAt(i - 1);
  return lo >= 0xDC00 && lo <= 0xDFFF && i >= 2 ? s.slice(i - 2, i) : s[i - 1];
}

/** @param {string} s @param {number} i @returns {string} the whole character starting at i */
function charAt(s, i) {
  if (i >= s.length) return '';
  const cp = s.codePointAt(i);
  return cp === undefined ? '' : String.fromCodePoint(cp);
}

/**
 * Make text inert for a terminal. Pure. DESIGN-CLI section 0 item 3.
 * @param {unknown} text
 * @returns {string}
 */
export function sanitize(text) {
  const s = String(text).replace(STRIP, '');
  return s.replace(FORMAT, (ch, offset, whole) => {
    if ((ch === '\u200C' || ch === '\u200D')
      && WORDLIKE.test(charBefore(whole, offset))
      && WORDLIKE.test(charAt(whole, offset + ch.length))) {
      return ch;
    }
    return '';
  });
}

/**
 * Whether colour goes on a stream. Colour never carries meaning, so every doubt resolves to off.
 * @param {{isTTY?:boolean}|undefined} stream
 * @param {Record<string, string|undefined>} env
 * @param {{json?:boolean, plain?:boolean, noColor?:boolean}} flags
 * @returns {boolean}
 */
export function colourFor(stream, env, flags) {
  if (flags.json || flags.plain || flags.noColor) return false;
  if (typeof env.NO_COLOR === 'string' && env.NO_COLOR !== '') return false;
  // An empty FORCE_COLOR is treated as unset, the same rule NO_COLOR follows. 0 and false turn
  // colour off, as Node reads them; any other value turns it on.
  if (typeof env.FORCE_COLOR === 'string' && env.FORCE_COLOR.trim() !== '') {
    const f = env.FORCE_COLOR.trim().toLowerCase();
    return !(f === '0' || f === 'false');
  }
  if (env.TERM === 'dumb') return false;
  return Boolean(stream && stream.isTTY);
}

/**
 * The wrap width: COLUMNS when it is a whole number, else a terminal's own width, else the
 * default. Never narrower than MIN_WIDTH.
 * @param {{isTTY?:boolean, columns?:number}|undefined} stream
 * @param {Record<string, string|undefined>} env
 * @returns {number}
 */
export function widthFor(stream, env) {
  const raw = env.COLUMNS;
  if (typeof raw === 'string' && /^\d{1,4}$/.test(raw.trim())) {
    return Math.max(MIN_WIDTH, Number(raw.trim()));
  }
  if (stream && stream.isTTY && Number.isInteger(stream.columns) && /** @type {number} */ (stream.columns) > 0) {
    return Math.max(MIN_WIDTH, /** @type {number} */ (stream.columns));
  }
  return DEFAULT_WIDTH;
}

const SGR = Object.freeze({ MEASURED: '36', REPORTED: '35', COMPUTED: '33', INFERRED: '34', strong: '1' });

/**
 * @param {string} text
 * @param {string|undefined} style
 * @param {boolean} on
 * @returns {string}
 */
function paint(text, style, on) {
  if (!on || !style || !(style in SGR)) return text;
  const code = /** @type {Record<string,string>} */ (SGR)[style];
  return '\u001b[' + code + 'm' + text + '\u001b[' + (style === 'strong' ? '22' : '39') + 'm';
}

/**
 * @typedef {{text:string, atomic?:boolean, style?:string}} Piece
 */

/**
 * Turn parts into sanitised pieces. The only place a Claim becomes text on a terminal, and it
 * goes through renderClaim, so the badge word is always there.
 * @param {readonly any[]} parts
 * @param {'text'|'plain'} mode
 * @returns {Piece[]}
 */
export function piecesFor(parts, mode) {
  /** @type {Piece[]} */
  const out = [];
  let afterPlainClaim = false;
  for (const raw of parts) {
    const p = typeof raw === 'string' ? t(raw) : raw;
    if (p === null || typeof p !== 'object') throw new TypeError('out: a line is built from parts, got ' + typeof p);
    switch (p.kind) {
      case 'text': {
        // Re-checked here, not trusted: an object that merely has the shape of a prose run did
        // not go through t(), so it could carry a digit. t() refuses one.
        let v = sanitize(t(p.value).value);
        // In the linear form a claim ends with its own full stop, so a run that begins with one
        // would print two.
        if (afterPlainClaim && v.startsWith('.')) v = v.slice(1);
        out.push({ text: v });
        break;
      }
      case 'prose':
        // The same for provenance prose: it must still name its badge and its method.
        pp(p.badge, p.value, p.method);
        out.push({ text: sanitize(p.value) + ' ' });
        out.push({ text: '[' + sanitize(p.badge) + ']', atomic: true, style: p.badge });
        if (mode === 'plain') out.push({ text: ' ' + sanitize(p.method) });
        break;
      case 'id':
        if (!isIdentifier(p.value)) throw new TypeError('out: an id part must hold a shipped identifier');
        out.push({ text: sanitize(p.value), atomic: true });
        break;
      case 'arg':
        out.push({ text: '"' + sanitize(p.value) + '"' });
        break;
      case 'claim': {
        const r = renderClaim(p.claim);
        if (mode === 'plain') {
          out.push({ text: sanitize(r.valueText) + ', ', atomic: true });
          out.push({ text: r.badgeLabel, atomic: true, style: r.badge });
          out.push({ text: '.', atomic: true });
          out.push({ text: ' ' + sanitize((r.note ? r.note + ' ' : '') + r.method) });
        } else {
          out.push({ text: sanitize(r.valueText) + ' ', atomic: true });
          out.push({ text: '[' + r.badgeLabel + ']', atomic: true, style: r.badge });
        }
        break;
      }
      default:
        throw new TypeError('out: unknown part kind ' + JSON.stringify(p.kind));
    }
    afterPlainClaim = mode === 'plain' && p.kind === 'claim';
  }
  return out;
}

/** Where a sentence or clause ends: a run that starts with one of these after a figure. */
const CLAUSE_BREAK = /^[\s]*[.,;:]+[\s]*/;

/**
 * The linear form's rule, DESIGN-CLI item 12: one complete sentence per figure. A line holding
 * several figures is broken after each figure whose next prose run starts a new clause, and that
 * run loses its leading punctuation, because the figure's own sentence (value, badge word, note,
 * method) already ends with a full stop. A run that carries the sentence on without punctuation
 * stays on the figure's line. Pure.
 * @param {readonly any[]} parts
 * @returns {any[][]}
 */
export function splitForPlain(parts) {
  /** @type {any[][]} */
  const groups = [];
  /** @type {any[]} */
  let cur = [];
  let afterClaim = false;
  for (const raw of parts) {
    const p = typeof raw === 'string' ? t(raw) : raw;
    if (afterClaim && p && p.kind === 'text' && CLAUSE_BREAK.test(p.value)) {
      groups.push(cur);
      cur = [];
      const rest = p.value.replace(CLAUSE_BREAK, '');
      if (rest.length > 0) cur.push({ kind: 'text', value: rest });
      afterClaim = false;
      continue;
    }
    cur.push(p);
    afterClaim = Boolean(p) && p.kind === 'claim';
  }
  if (cur.length > 0) groups.push(cur);
  return groups.filter((g) => g.length > 0);
}

/**
 * Group pieces into words. A space inside a prose run separates words; an atomic piece (a
 * figure, an identifier, a badge word) is never split and joins whatever touches it.
 * @param {Piece[]} pieces
 * @returns {Piece[][]}
 */
export function wordsOf(pieces) {
  /** @type {Piece[][]} */
  const words = [];
  /** @type {Piece[]} */
  let cur = [];
  const flush = () => { if (cur.length > 0) { words.push(cur); cur = []; } };
  for (const piece of pieces) {
    if (piece.atomic) { cur.push(piece); continue; }
    const chunks = piece.text.replace(/[\t\n]/g, ' ').split(' ');
    chunks.forEach((chunk, i) => {
      if (i > 0) flush();
      if (chunk.length > 0) cur.push({ text: chunk, style: piece.style });
    });
  }
  flush();
  return words;
}

/** @param {Piece[]} word @returns {number} */
const widthOf = (word) => word.reduce((n, p) => n + [...p.text].length, 0);

/**
 * Greedy wrap. The first line starts after `first`; every later line starts `hang` columns in.
 * A word longer than the line is printed whole on a line of its own rather than split.
 * @param {Piece[][]} words
 * @param {{width:number, first:string, firstWidth:number, hang:number, colour:boolean}} o
 * @returns {string[]}
 */
export function layout(words, o) {
  /** @param {Piece[]} w */
  const draw = (w) => w.map((p) => paint(p.text, p.style, o.colour)).join('');
  const lines = [];
  let cur = o.first;
  let used = o.firstWidth;
  let empty = true;
  for (const w of words) {
    const n = widthOf(w);
    if (empty) { cur += draw(w); used += n; empty = false; continue; }
    if (used + 1 + n <= o.width) { cur += ' ' + draw(w); used += 1 + n; continue; }
    lines.push(cur);
    cur = ' '.repeat(o.hang) + draw(w);
    used = o.hang + n;
  }
  lines.push(cur);
  return lines;
}

/**
 * @typedef {Object} OutOptions
 * @property {NodeJS.WritableStream & {isTTY?:boolean, columns?:number}} [stdout]
 * @property {NodeJS.WritableStream & {isTTY?:boolean, columns?:number}} [stderr]
 * @property {Record<string, string|undefined>} [env]
 * @property {boolean} [json]
 * @property {boolean} [plain]
 * @property {boolean} [noColor]
 */

/**
 * The sink. One per run.
 * @param {OutOptions} [options]
 */
export function createOut(options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const env = options.env || process.env;
  const flags = { json: Boolean(options.json), plain: Boolean(options.plain), noColor: Boolean(options.noColor) };
  /** @type {'text'|'plain'} */
  const mode = flags.plain ? 'plain' : 'text';
  const width = widthFor(stdout, env);
  const colour = { stdout: colourFor(stdout, env, flags), stderr: colourFor(stderr, env, flags) };
  const closed = { stdout: false, stderr: false };
  /** @type {(() => void)[]} */
  const whenClosed = [];
  let jsonWritten = false;

  /** @param {'stdout'|'stderr'} which */
  const markClosed = (which) => {
    if (closed[which]) return;
    closed[which] = true;
    if (which === 'stdout') for (const fn of whenClosed.splice(0)) fn();
  };
  // Any error on an output stream means the reader is gone (EPIPE when piped into head, for
  // one). It is not the user's problem and it is never printed: writing simply stops.
  for (const [which, stream] of /** @type {const} */ ([['stdout', stdout], ['stderr', stderr]])) {
    if (stream && typeof stream.on === 'function') stream.on('error', () => markClosed(which));
  }

  /** @param {'stdout'|'stderr'} which @param {string} text */
  const emit = (which, text) => {
    if (closed[which]) return;
    const stream = which === 'stdout' ? stdout : stderr;
    try {
      stream.write(text);
    } catch {
      markClosed(which);
    }
  };

  /**
   * @param {readonly any[]} parts
   * @param {{indent?:number, hang?:number, label?:readonly any[], labelWidth?:number, strong?:boolean}} o
   * @param {boolean} paintOn
   * @returns {string[]}
   */
  const renderOne = (parts, o, paintOn) => {
    const indent = o.indent || 0;
    let pieces = piecesFor(parts, mode);
    if (o.strong) pieces = pieces.map((p) => ({ ...p, style: p.style || 'strong' }));
    if (o.label) {
      const labelPieces = piecesFor(o.label, mode).map((p) => ({ ...p, atomic: true }));
      const labelText = labelPieces.map((p) => paint(p.text, p.style, paintOn)).join('');
      const labelLen = widthOf(labelPieces);
      if (mode === 'plain') {
        // No columns in the linear form: the label leads the sentence.
        return layout(wordsOf([...labelPieces, { text: ': ' }, ...pieces]),
          { width, first: ' '.repeat(indent), firstWidth: indent, hang: indent + 2, colour: paintOn });
      }
      const words = wordsOf(pieces);
      const col = o.labelWidth || 0;
      // On a narrow terminal a label column would leave the text too little room, and a figure
      // would stick out past the edge; the item is stacked instead.
      const roomy = width - col >= MIN_TEXT_COLUMNS;
      if (words.length > 0 && roomy && indent + labelLen + 2 <= col) {
        const first = ' '.repeat(indent) + labelText + ' '.repeat(col - indent - labelLen);
        return layout(words, { width, first, firstWidth: col, hang: col, colour: paintOn });
      }
      // The label does not fit its column, or the terminal is too narrow for columns: the label
      // gets a line of its own and the text starts below it.
      const head = ' '.repeat(indent) + labelText;
      if (words.length === 0) return [head];
      const textCol = roomy ? col : indent + 2;
      return [head, ...layout(words, { width, first: ' '.repeat(textCol), firstWidth: textCol, hang: textCol, colour: paintOn })];
    }
    // A paragraph wraps flush with its own first line. A list item that wants a hanging indent
    // asks for one.
    const hang = o.hang === undefined ? indent : o.hang;
    return layout(wordsOf(pieces), { width, first: ' '.repeat(indent), firstWidth: indent, hang, colour: paintOn });
  };

  /**
   * @param {readonly any[]} parts
   * @param {{indent?:number, hang?:number, label?:readonly any[], labelWidth?:number, strong?:boolean}} o
   * @param {boolean} paintOn
   * @param {'stdout'|'stderr'} which
   * @returns {string[]}
   */
  const render = (parts, o, paintOn, which) => {
    // The user's own argument is echoed only in a usage error, which goes to stderr. On stdout
    // it would be text this program did not write, carrying whatever digits it likes.
    if (which === 'stdout' && [...parts, ...(o.label || [])].some((p) => p && p.kind === 'arg')) {
      throw new TypeError('out: the user\'s own argument is echoed on stderr only');
    }
    if (mode !== 'plain') return renderOne(parts, o, paintOn);
    const groups = splitForPlain(parts);
    if (groups.length <= 1) return renderOne(parts, o, paintOn);
    const indent = o.indent || 0;
    return groups.flatMap((g, i) => renderOne(g, i === 0 ? o : { indent }, paintOn));
  };

  const refuseTextInJson = () => {
    if (flags.json) {
      throw new TypeError('out: with --json, stdout carries one JSON document and nothing else');
    }
  };

  return {
    mode,
    width,
    colour,
    get json() { return flags.json; },
    /** True once the reader of stdout has gone. */
    get closed() { return closed.stdout; },
    /** @param {() => void} fn Called once, when the reader of stdout goes away. */
    onClosed(fn) { if (closed.stdout) fn(); else whenClosed.push(fn); },

    /**
     * Render without writing: the exact lines a call would print. Used by tests and by the
     * width check on the help text.
     * @param {readonly any[]} parts
     * @param {{indent?:number, hang?:number, label?:readonly any[], labelWidth?:number, strong?:boolean}} [o]
     */
    lines(parts, o = {}) { return render(parts, o, false, 'stdout'); },

    /** A line on stdout. @param {readonly any[]} parts @param {object} [o] */
    line(parts, o = {}) {
      refuseTextInJson();
      for (const l of render(parts, o, colour.stdout, 'stdout')) emit('stdout', l + '\n');
    },
    /** A labelled row on stdout, the label in a column. @param {readonly any[]} label @param {readonly any[]} parts @param {object} [o] */
    item(label, parts, o = {}) {
      refuseTextInJson();
      for (const l of render(parts, { indent: 2, labelWidth: 16, ...o, label }, colour.stdout, 'stdout')) emit('stdout', l + '\n');
    },
    /** A heading on stdout. Prose only. @param {string} text */
    heading(text) {
      refuseTextInJson();
      for (const l of render([t(text)], { strong: true }, colour.stdout, 'stdout')) emit('stdout', l + '\n');
    },
    /** An empty line on stdout. */
    blank() { refuseTextInJson(); emit('stdout', '\n'); },

    /** A line on stderr: the plan, a notice, progress, a usage error. @param {readonly any[]} parts @param {object} [o] */
    note(parts, o = {}) {
      for (const l of render(parts, o, colour.stderr, 'stderr')) emit('stderr', l + '\n');
    },
    /** A labelled row on stderr. @param {readonly any[]} label @param {readonly any[]} parts @param {object} [o] */
    noteItem(label, parts, o = {}) {
      for (const l of render(parts, { indent: 2, labelWidth: 16, ...o, label }, colour.stderr, 'stderr')) emit('stderr', l + '\n');
    },

    /**
     * The one JSON document. Serialised, then sanitised as a whole: JSON.stringify already
     * escapes C0 controls, and the sanitiser removes DEL, C1, bidi and format characters, which
     * can only sit inside string values.
     * @param {object} doc
     */
    document(doc) {
      if (!flags.json) throw new TypeError('out.document: only with --json');
      if (jsonWritten) throw new TypeError('out.document: stdout carries exactly one JSON document');
      jsonWritten = true;
      emit('stdout', sanitize(JSON.stringify(doc, null, 2)) + '\n');
    },

    /**
     * A defect in photontax itself. The one path that prints text not built from parts: a stack
     * trace carries line numbers, and a bug report needs them. Still sanitised, still stderr.
     * @param {unknown} err
     */
    internalError(err) {
      for (const l of render([t(COPY.internalError)], {}, colour.stderr, 'stderr')) emit('stderr', l + '\n');
      const detail = err !== null && typeof err === 'object' && 'stack' in err ? String(/** @type {any} */ (err).stack) : String(err);
      emit('stderr', sanitize(detail) + '\n');
    },
  };
}
