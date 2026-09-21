#!/usr/bin/env node
// THE SHIPPED-OUTPUT COMPACTOR. Zero dependencies, because this repo has none.
//
// scripts/minify.mjs already strips the commentary out of the copy that travels. That was not
// enough: DESIGN 6.3 sets the payload gate at 40 KiB gzipped and comment stripping alone left
// the page at 91,391 B. This file adds the two remaining safe transforms.
//
//   shortenNames(src)  renames local bindings to short names. The rename is ONE TO ONE, so no
//                      two names ever merge and shadowing is unchanged by construction. A name
//                      is renamed only where the scan can classify EVERY occurrence of it with
//                      certainty and the snippet declares it. Property names, object keys,
//                      labels, free globals and anything ambiguous are left alone everywhere.
//   compactJs(src)     removes the spaces and newlines JavaScript does not need. A space stays
//                      wherever two tokens would merge; a newline is dropped only where
//                      automatic semicolon insertion cannot depend on it.
//   constToLet(src)    writes every const DECLARATION as let, two bytes each. The sources run
//                      and are tested with const; the keywords differ only for code that
//                      assigns to a const binding, which would already throw in the tree.
//
// PROVENANCE. This is the scanner from the sibling flagship at
// 3. GitHub/_staging/_flagship/auditrail/scripts/build.mjs, which has its own test suite for
// it at auditrail/test/build/minify.test.js. It is reused here rather than rewritten, because
// a second hand written JavaScript lexer is a second place for the same bug to live. The
// copies are independent: neither repo may import from the other, since both ship alone.
//
// HOW IT IS KEPT HONEST HERE. scripts/build.mjs compiles the assembled page with node:vm
// before writing it, so a transform that swallows a token is a build failure and never a blank
// page. test/mangle.test.js evaluates every transformed module against the untransformed one,
// and test/ui.test.js executes the script that is actually inside index.html.

/* ------------------------------------------------------------------------------------------
 * 1. Segmenting JavaScript
 * ---------------------------------------------------------------------------------------- */

const KW_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await', 'extends']);
// Identifier characters: ASCII letters, digits, _ and $, plus anything outside ASCII.
const NON_ASCII = String.fromCharCode(0x80) + '-' + String.fromCharCode(0xffff);
const ID_START = new RegExp('[A-Za-z_$' + NON_ASCII + ']');
const ID_PART = new RegExp('[A-Za-z0-9_$' + NON_ASCII + ']');

export class BuildError extends Error {
  constructor(message) { super(message); this.name = 'BuildError'; }
}

/**
 * Split JavaScript source into segments. Concatenating every segment's text gives the
 * source back exactly.
 * @param {string} src
 * @param {string} [file] for error messages
 * @returns {{ type: 'code'|'string'|'template'|'regex'|'comment', text: string, start: number }[]}
 */
export function segmentJs(src, file = '<input>') {
  const segs = [];
  const n = src.length;
  let i = 0;
  let codeStart = 0;
  let last = '';            // last significant token in code: '' | 'id:<word>' | 'num' | 'str' | 're' | punct
  let depth = 0;            // brace depth in code
  const tplStack = [];      // brace depth at which each open template substitution resumes its template
  const fail = (msg) => { throw new BuildError(file + ': ' + msg + ' at offset ' + i); };
  const flush = (end) => { if (end > codeStart) segs.push({ type: 'code', text: src.slice(codeStart, end), start: codeStart }); };
  const push = (type, start, end) => { segs.push({ type, text: src.slice(start, end), start }); codeStart = end; };

  // Read template text starting at `start` (a backtick or the "}" closing a substitution).
  // Returns the index after the chunk and whether the template ended.
  const readTemplate = (start) => {
    let j = start + 1;
    for (;;) {
      if (j >= n) fail('unterminated template literal');
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') return { end: j + 1, closed: true };
      if (c === '$' && src[j + 1] === '{') return { end: j + 2, closed: false };
      j++;
    }
  };

  if (src.startsWith('#!')) {
    const j = src.indexOf('\n');
    push('comment', 0, j < 0 ? n : j);
    i = j < 0 ? n : j;
  }

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      flush(i);
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      push('comment', i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      flush(i);
      const j = src.indexOf('*/', i + 2);
      if (j < 0) fail('unterminated block comment');
      push('comment', i, j + 2);
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      flush(i);
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n') fail('unterminated string');
        j++;
      }
      if (j >= n) fail('unterminated string');
      push('string', i, j + 1);
      i = j + 1;
      last = 'str';
      continue;
    }
    if (c === '`') {
      flush(i);
      const r = readTemplate(i);
      push('template', i, r.end);
      i = r.end;
      if (!r.closed) tplStack.push(depth);
      else last = 'str';
      continue;
    }
    if (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === depth) {
      flush(i);
      tplStack.pop();
      const r = readTemplate(i);
      push('template', i, r.end);
      i = r.end;
      if (!r.closed) tplStack.push(depth);
      else last = 'str';
      continue;
    }
    if (c === '/') {
      if (regexAllowed(last)) {
        flush(i);
        let j = i + 1;
        let inClass = false;
        for (;;) {
          if (j >= n || src[j] === '\n') fail('unterminated regular expression');
          const x = src[j];
          if (x === '\\') { j += 2; continue; }
          if (x === '[') inClass = true;
          else if (x === ']') inClass = false;
          else if (x === '/' && !inClass) break;
          j++;
        }
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        push('regex', i, j);
        i = j;
        last = 're';
        continue;
      }
      last = '/';
      i++;
      continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < n && ID_PART.test(src[j])) j++;
      last = 'id:' + src.slice(i, j);
      i = j;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i + 1;
      while (j < n && /[0-9a-zA-Z_.]/.test(src[j])) j++;
      last = 'num';
      i = j;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    last = c;
    i++;
  }
  if (tplStack.length) fail('unterminated template substitution');
  flush(n);
  return segs;
}

/**
 * @param {string} last
 * @returns {boolean}
 */
function regexAllowed(last) {
  if (last === '') return true;
  if (last === 'num' || last === 'str' || last === 're') return false;
  if (last.startsWith('id:')) return KW_BEFORE_REGEX.has(last.slice(3));
  return !(last === ')' || last === ']' || last === '}');
}

/**
 * Remove comments, indentation, trailing spaces and blank lines outside strings, templates
 * and regex literals. Newlines are kept so automatic semicolon insertion is unchanged.
 * @param {string} src
 * @param {string} [file]
 * @returns {string}
/* ------------------------------------------------------------------------------------------
 * 1b. Short names and tight spacing (still no parser dependency)
 *
 * shortenNames() gives local bindings short names. The rename is ONE-TO-ONE and applied to
 * every binding and reference of a name across the whole bundle, so scoping and shadowing are
 * unchanged by construction: two names never merge, and a new name is never an identifier that
 * already occurs in the code, a keyword or a known global. Property names are never renamed.
 * A token scan that tracks brackets gives every identifier occurrence a role:
 *   prop     after "." or "?." or "#", an object literal key or method name, a class member
 *   ref      a binding or a reference
 *   short    a shorthand property ({ a } or { a = 1 }), written back as { a: newName }
 *   unknown  anything the scan cannot classify with certainty (labels, class fields, keys in a
 *            brace that might be a block): that name is then left alone everywhere.
 * A name is renamed only when the bundle declares it (const, let, var, function, class,
 * parameters, catch, destructuring) in every top-level region that references it, so a free
 * global is never renamed, even one missing from KNOWN_GLOBALS.
 * ---------------------------------------------------------------------------------------- */

const RESERVED_WORDS = new Set((
  'break case catch class const continue debugger default delete do else enum export extends false finally for ' +
  'function if import in instanceof new null return super switch this throw true try typeof var void while with ' +
  'yield let static implements interface package private protected public await async get set of from as target ' +
  'meta constructor prototype arguments eval undefined NaN Infinity globalThis __proto__ accessor using'
).split(' '));

/** Globals of Node and of browser pages and workers. Never renamed, never used as a new name. */
const KNOWN_GLOBALS = new Set((
  'Object Function Array Number parseFloat parseInt Boolean String Symbol Date Promise RegExp Error AggregateError ' +
  'EvalError RangeError ReferenceError SyntaxError TypeError URIError JSON Math Intl ArrayBuffer SharedArrayBuffer ' +
  'Atomics Uint8Array Int8Array Uint16Array Int16Array Uint32Array Int32Array Float16Array Float32Array Float64Array ' +
  'Uint8ClampedArray BigUint64Array BigInt64Array DataView Map BigInt Set WeakMap WeakSet Proxy Reflect ' +
  'FinalizationRegistry WeakRef Iterator decodeURI decodeURIComponent encodeURI encodeURIComponent escape unescape ' +
  'isFinite isNaN console WebAssembly process Buffer global require module exports __filename __dirname ' +
  'setTimeout clearTimeout setInterval clearInterval setImmediate clearImmediate queueMicrotask structuredClone ' +
  'atob btoa URL URLSearchParams TextEncoder TextDecoder TextEncoderStream TextDecoderStream AbortController ' +
  'AbortSignal EventTarget Event CustomEvent ErrorEvent MessageChannel MessagePort MessageEvent BroadcastChannel Blob ' +
  'File FileReader FileList performance Performance PerformanceObserver fetch Request Response Headers FormData ' +
  'WebSocket EventSource XMLHttpRequest crypto Crypto CryptoKey SubtleCrypto navigator Navigator DOMException ' +
  'ReadableStream WritableStream TransformStream CompressionStream DecompressionStream ByteLengthQueuingStrategy ' +
  'CountQueuingStrategy localStorage sessionStorage Storage indexedDB caches window self document location history ' +
  'screen frames parent top opener name status closed length origin event external customElements alert confirm ' +
  'prompt print open close stop focus blur find postMessage onmessage onerror onmessageerror importScripts ' +
  'requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback getComputedStyle matchMedia ' +
  'getSelection scroll scrollTo scrollBy showDirectoryPicker showOpenFilePicker showSaveFilePicker ' +
  'createImageBitmap reportError devicePixelRatio innerWidth innerHeight outerWidth outerHeight scrollX scrollY ' +
  'visualViewport isSecureContext crossOriginIsolated trustedTypes Worker SharedWorker Image ImageData ImageBitmap ' +
  'OffscreenCanvas CanvasRenderingContext2D Path2D DOMParser XMLSerializer MutationObserver ResizeObserver ' +
  'IntersectionObserver Element HTMLElement HTMLCanvasElement HTMLInputElement HTMLButtonElement ' +
  'HTMLAnchorElement HTMLImageElement HTMLTemplateElement SVGElement Node NodeList Document DocumentFragment ' +
  'FileSystemHandle FileSystemDirectoryHandle FileSystemFileHandle DataTransfer DataTransferItem KeyboardEvent ' +
  'MouseEvent PointerEvent DragEvent FocusEvent InputEvent Clipboard ClipboardItem Option Audio CSS Notification ' +
  'WorkerGlobalScope DedicatedWorkerGlobalScope Deno Bun'
).split(' '));

const PUNCTUATORS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=',
  '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const BLOCK_BEFORE_BRACE = new Set(['else', 'try', 'finally', 'do', 'catch']);
const EXPR_BEFORE_BRACE = new Set(['return', 'throw', 'case', 'typeof', 'in', 'of', 'new', 'delete', 'void', 'yield', 'await', 'instanceof', 'const', 'let', 'var']);
const CONTROL_BEFORE_PAREN = new Set(['if', 'for', 'while', 'switch', 'with', 'return', 'typeof', 'void', 'delete', 'await', 'yield', 'in', 'of', 'new', 'throw', 'case', 'else', 'do', 'instanceof']);
const MEMBER_MODIFIERS = new Set(['get', 'set', 'async', 'static']);

/**
 * @typedef {{ t: 'id'|'num'|'p'|'lit'|'tpl', v: string, s: number, e: number, open?: boolean, close?: boolean }} JsToken
 */

/**
 * Tokens of the code parts of a script: identifiers (keywords included), numbers and
 * punctuators; each string or regex literal is one token; each template chunk is one token
 * that may close ("}" first) and open ("${" last) a substitution.
 * @param {string} src
 * @param {string} [file]
 * @returns {JsToken[]}
 */
export function tokenizeJs(src, file) {
  /** @type {JsToken[]} */
  const toks = [];
  for (const s of segmentJs(src, file)) {
    if (s.type === 'comment') continue;
    if (s.type === 'string' || s.type === 'regex') { toks.push({ t: 'lit', v: s.text, s: s.start, e: s.start + s.text.length }); continue; }
    if (s.type === 'template') {
      toks.push({ t: 'tpl', v: s.text, s: s.start, e: s.start + s.text.length, close: s.text[0] === '}', open: s.text.endsWith('${') });
      continue;
    }
    const text = s.text;
    const n = text.length;
    let i = 0;
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      const at = s.start + i;
      if (ID_START.test(c) || c === '\\') {
        let j = i + 1;
        while (j < n && (ID_PART.test(text[j]) || text[j] === '\\')) j++;
        toks.push({ t: 'id', v: text.slice(i, j), s: at, e: s.start + j });
        i = j;
        continue;
      }
      if ((c >= '0' && c <= '9') || (c === '.' && text[i + 1] >= '0' && text[i + 1] <= '9')) {
        let j = i + 1;
        while (j < n && /[0-9a-zA-Z_.]/.test(text[j])) j++;
        toks.push({ t: 'num', v: text.slice(i, j), s: at, e: s.start + j });
        i = j;
        continue;
      }
      let p = PUNCTUATORS.find((x) => text.startsWith(x, i)) ?? c;
      if (p === '?.' && text[i + 2] >= '0' && text[i + 2] <= '9') p = '?';
      toks.push({ t: 'p', v: p, s: at, e: at + p.length });
      i += p.length;
    }
  }
  return toks;
}

/**
 * Rename local bindings to short names (see the section comment above).
 * @param {string} src     a script body (no import or export statements)
 * @param {{ file?: string, reserved?: Iterable<string> }} [opts]
 * @returns {{ code: string, renamed: Map<string, string> }}
 */
export function shortenNames(src, opts = {}) {
  const file = opts.file ?? '<input>';
  const toks = tokenizeJs(src, file);
  const N = toks.length;
  const reserved = new Set(opts.reserved ?? []);
  const isP = (k, v) => k >= 0 && k < N && toks[k].t === 'p' && toks[k].v === v;
  const afterDot = (k) => k > 0 && toks[k - 1].t === 'p' && (toks[k - 1].v === '.' || toks[k - 1].v === '?.');
  const isKw = (k, set) => k >= 0 && k < N && toks[k].t === 'id' && set.has(toks[k].v) && !afterDot(k);
  const kw = (k, v) => k >= 0 && k < N && toks[k].t === 'id' && toks[k].v === v && !afterDot(k);

  // Pass 1: bracket frames, colon kinds, top-level regions.
  const match = new Int32Array(N).fill(-1);
  /** @type {any[]} */
  const frameOf = new Array(N);
  /** @type {(string|undefined)[]} */
  const colon = new Array(N);
  const region = new Int32Array(N);
  const top = new Uint8Array(N);
  let cur = { kind: 'block', q: 0, cq: 0, cls: false, open: -1 };
  const stack = [];
  let reg = 0;
  const closerOf = (k) => (k === 'paren' ? ')' : k === 'bracket' ? ']' : '}');
  const braceKind = (i) => {
    if (cur.cls) return 'class';
    const p = i > 0 ? toks[i - 1] : null;
    if (!p) return 'block';
    if (p.t === 'p') {
      if (p.v === ')' || p.v === '=>' || p.v === ';' || p.v === '}' || p.v === '{') return 'block';
      if (p.v === ':') return colon[i - 1] === 'case' || colon[i - 1] === 'label' ? 'block' : 'obj';
      if (p.v === ']') return 'unknown';
      return 'obj';
    }
    if (p.t === 'id' && !afterDot(i - 1)) {
      if (BLOCK_BEFORE_BRACE.has(p.v)) return 'block';
      if (EXPR_BEFORE_BRACE.has(p.v)) return 'obj';
    }
    if (p.t === 'tpl' && p.open) return 'obj';
    return 'unknown';
  };
  for (let i = 0; i < N; i++) {
    const tk = toks[i];
    if (!stack.length && tk.t === 'id' && /^(const|let|var|function|class)$/.test(tk.v) && !afterDot(i)) reg++;
    region[i] = reg;
    top[i] = stack.length ? 0 : 1;
    frameOf[i] = cur;
    if (tk.t === 'p') {
      const v = tk.v;
      if (v === '{' || v === '(' || v === '[') {
        const kind = v === '(' ? 'paren' : v === '[' ? 'bracket' : braceKind(i);
        if (v === '{') cur.cls = false;
        stack.push(cur);
        cur = { kind, q: 0, cq: 0, cls: false, open: i };
      } else if (v === '}' || v === ')' || v === ']') {
        if (!stack.length || closerOf(cur.kind) !== v) throw new BuildError(file + ': unbalanced "' + v + '" at offset ' + tk.s);
        match[cur.open] = i;
        match[i] = cur.open;
        cur = stack.pop();
      } else if (v === '?') cur.q++;
      else if (v === ':') {
        if (cur.q > 0) { cur.q--; colon[i] = 'ternary'; }
        else if (cur.kind === 'obj' || cur.kind === 'class') colon[i] = 'key';
        else if (cur.cq > 0) { cur.cq--; colon[i] = 'case'; }
        else colon[i] = 'label';
      }
    } else if (tk.t === 'tpl') {
      if (tk.close) {
        if (cur.kind !== 'tpl') throw new BuildError(file + ': unbalanced template substitution at offset ' + tk.s);
        match[cur.open] = i;
        match[i] = cur.open;
        cur = stack.pop();
      }
      if (tk.open) { stack.push(cur); cur = { kind: 'tpl', q: 0, cq: 0, cls: false, open: i }; }
    } else if (tk.t === 'id' && !afterDot(i)) {
      if (tk.v === 'case' && cur.kind !== 'obj' && cur.kind !== 'class') cur.cq++;
      else if (tk.v === 'class' && !isP(i + 1, ':')) cur.cls = true;
    }
  }
  if (stack.length) throw new BuildError(file + ': unbalanced brackets at the end of the input');

  // Pass 2: binding frames (parameter lists and destructuring patterns).
  const bind = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const tk = toks[i];
    if (tk.t !== 'p') continue;
    if (tk.v === '(') {
      const j = match[i];
      if (isP(j + 1, '=>')) bind[i] = 1;
      else if (isP(j + 1, '{') && i > 0 && toks[i - 1].t === 'id' && !isKw(i - 1, CONTROL_BEFORE_PAREN)) bind[i] = 1;
    } else if (tk.v === '{' || tk.v === '[') {
      const F = frameOf[i];
      if (isKw(i - 1, new Set(['const', 'let', 'var']))) bind[i] = 1;
      else if (F.open >= 0 && bind[F.open] && i > 0 && toks[i - 1].t === 'p' &&
        (['(', '[', ',', '...', '{'].includes(toks[i - 1].v) || (toks[i - 1].v === ':' && colon[i - 1] === 'key'))) bind[i] = 1;
    }
  }

  // Pass 3: roles and declarations.
  /** @type {(string|null)[]} */
  const role = new Array(N).fill(null);
  const unsafe = new Set();
  const declaredIn = new Map();   // name -> Set of regions
  const declaredTop = new Set();
  const keyPos = (k, F) => k >= 0 && toks[k].t === 'p' && ((toks[k].v === '{' && k === F.open) || toks[k].v === ',');
  for (let i = 0; i < N; i++) {
    const tk = toks[i];
    if (tk.t !== 'id' || RESERVED_WORDS.has(tk.v)) continue;
    const F = frameOf[i];
    const prev = i > 0 ? toks[i - 1] : null;
    let r;
    if (prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.' || prev.v === '#')) r = 'prop';
    else if (F.kind === 'obj') {
      if (keyPos(i - 1, F)) {
        if (isP(i + 1, ':') || isP(i + 1, '(')) r = 'prop';
        else if (isP(i + 1, ',') || isP(i + 1, '=') || (isP(i + 1, '}') && match[i + 1] === F.open)) r = 'short';
        else r = 'unknown';
      } else if ((isKw(i - 1, MEMBER_MODIFIERS) && keyPos(i - 2, F)) ||
        (isP(i - 1, '*') && (keyPos(i - 2, F) || (kw(i - 2, 'async') && keyPos(i - 3, F))))) {
        r = isP(i + 1, '(') ? 'prop' : 'unknown';
      } else r = 'ref';
    } else if (F.kind === 'class') {
      const p = i > 0 ? toks[i - 1] : null;
      const memberStart = p && ((p.t === 'p' && ['{', '}', ';', '*'].includes(p.v)) || isKw(i - 1, MEMBER_MODIFIERS));
      r = memberStart && isP(i + 1, '(') ? 'prop' : 'unknown';
    } else if (F.kind === 'unknown' && keyPos(i - 1, F)) r = 'unknown';
    else if (isP(i + 1, ':') && colon[i + 1] === 'label') r = 'unknown';
    else if (kw(i - 1, 'break') || kw(i - 1, 'continue')) r = 'unknown';
    else r = 'ref';
    role[i] = r;
    if (r === 'unknown') { unsafe.add(tk.v); continue; }
    if (r === 'prop') continue;
    // Declarations.
    let declared = false;
    if (kw(i - 1, 'const') || kw(i - 1, 'let') || kw(i - 1, 'var') || kw(i - 1, 'function') || kw(i - 1, 'class')) declared = true;
    else if (isP(i - 1, '*') && kw(i - 2, 'function')) declared = true;
    else if (isP(i + 1, '=>')) declared = true;
    else if (F.open >= 0 && bind[F.open] && prev && prev.t === 'p' &&
      (['(', '[', ',', '...', '{'].includes(prev.v) || (prev.v === ':' && colon[i - 1] === 'key')) &&
      i + 1 < N && toks[i + 1].t === 'p' && [',', ')', ']', '}', '='].includes(toks[i + 1].v)) declared = true;
    if (declared) {
      if (top[i] || (i > 0 && top[i - 1] && F.open < 0)) declaredTop.add(tk.v);
      let set = declaredIn.get(tk.v);
      if (!set) declaredIn.set(tk.v, (set = new Set()));
      set.add(region[i]);
    }
  }

  // Which names may be renamed: declared, never unclassifiable, and declared in every region
  // that references them (or at the top level of the bundle).
  const count = new Map();
  const regionsOf = new Map();
  const used = new Set(reserved);
  for (let i = 0; i < N; i++) {
    const tk = toks[i];
    if (tk.t !== 'id') continue;
    used.add(tk.v);
    if (role[i] === 'ref' || role[i] === 'short') {
      count.set(tk.v, (count.get(tk.v) ?? 0) + 1);
      let set = regionsOf.get(tk.v);
      if (!set) regionsOf.set(tk.v, (set = new Set()));
      set.add(region[i]);
    }
  }
  const candidates = [];
  for (const [name, c] of count) {
    if (unsafe.has(name) || reserved.has(name) || KNOWN_GLOBALS.has(name) || RESERVED_WORDS.has(name)) continue;
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) continue;
    const decl = declaredIn.get(name);
    if (!decl) continue;
    if (!declaredTop.has(name) && ![...regionsOf.get(name)].every((g) => decl.has(g))) continue;
    candidates.push([name, c]);
  }
  candidates.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const renamed = new Map();
  const gen = shortNameGenerator((x) => !used.has(x) && !RESERVED_WORDS.has(x) && !KNOWN_GLOBALS.has(x) && !JS_ALL_KEYWORDS.has(x));
  for (const [name] of candidates) {
    const nn = gen.next().value;
    if (nn.length >= name.length) continue;
    renamed.set(name, nn);
  }

  let out = '';
  let pos = 0;
  for (let i = 0; i < N; i++) {
    const tk = toks[i];
    if (tk.t !== 'id' || (role[i] !== 'ref' && role[i] !== 'short')) continue;
    const nn = renamed.get(tk.v);
    if (!nn) continue;
    out += src.slice(pos, tk.s) + (role[i] === 'short' ? tk.v + ':' + nn : nn);
    pos = tk.e;
  }
  out += src.slice(pos);
  return { code: out, renamed };
}

/** Every reserved word of JavaScript, including the strict-mode and contextual ones. */
const JS_ALL_KEYWORDS = new Set([...RESERVED_WORDS, 'do', 'if', 'in', 'of', 'as', 'is']);

/**
 * Short identifiers in length order: a..z A..Z _ $, then two characters, and so on.
 * @param {(name: string) => boolean} ok
 */
function* shortNameGenerator(ok) {
  const first = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$';
  const rest = first + '0123456789';
  for (let len = 1; ; len++) {
    const idx = new Array(len).fill(0);
    for (;;) {
      let name = first[idx[0]];
      for (let k = 1; k < len; k++) name += rest[idx[k]];
      if (ok(name)) yield name;
      let k = len - 1;
      while (k >= 0) {
        idx[k]++;
        if (idx[k] < (k === 0 ? first.length : rest.length)) break;
        idx[k] = 0;
        k--;
      }
      if (k < 0) break;
    }
  }
}

/**
 * Remove the spaces and newlines that JavaScript does not need, outside strings, templates and
 * regex literals. A space stays where two tokens would merge (identifier or number characters
 * on both sides, "+ +", "- -", a number before "."), and where it would create "<!--", "-->",
 * "?." or a comment. A newline is dropped only after "{", "(", "[", "," or ";" or before "}",
 * ")" or "]", where automatic semicolon insertion cannot depend on it.
 * @param {string} src
 * @param {string} [file]
 * @returns {string}
 */
export function compactJs(src, file) {
  const segs = segmentJs(src, file).filter((s) => s.type !== 'comment');
  const idc = (ch) => ch !== undefined && (ID_PART.test(ch) || ch === '\\');
  let out = '';
  let regexEnd = -1;   // out.length right after the last regex literal (its flags must not grow)
  for (let si = 0; si < segs.length; si++) {
    const s = segs[si];
    if (s.type !== 'code') { out += s.text; if (s.type === 'regex') regexEnd = out.length; continue; }
    const t = s.text.replace(/\r/g, '');
    const nextFirst = si + 1 < segs.length ? segs[si + 1].text[0] : undefined;
    let i = 0;
    while (i < t.length) {
      const c = t[i];
      if (c !== ' ' && c !== '\t' && c !== '\n') { out += c; i++; continue; }
      let j = i;
      let nl = false;
      while (j < t.length && (t[j] === ' ' || t[j] === '\t' || t[j] === '\n')) { if (t[j] === '\n') nl = true; j++; }
      const a = out[out.length - 1];
      const b = j < t.length ? t[j] : nextFirst;
      i = j;
      if (a === undefined || b === undefined) { if (nl && a !== undefined) out += '\n'; continue; }
      if (nl) {
        if ('{([,;'.includes(a) || '})]'.includes(b)) continue;
        out += '\n';
        continue;
      }
      const keep = (idc(a) && idc(b)) || (out.length === regexEnd && idc(b)) || (a === '+' && b === '+') || (a === '-' && b === '-') ||
        (/[0-9]/.test(a) && b === '.') || (a === '<' && b === '!') || (a === '-' && b === '>') ||
        (a === '?' && b === '.') || (a === '/' && (b === '/' || b === '*'));
      if (keep) out += ' ';
    }
  }
  return out;
}

/**
 * Turn every `const` declaration into `let`, two bytes each. The sources run and are tested
 * with const, and the two keywords differ only for code that assigns to a const binding, which
 * would already throw in the source tree. Only a `const` that starts a declaration changes
 * (followed by a name, "{" or "[", and not after ".", "?." or "#"); a property or key named
 * const, and text inside strings, templates and regex literals, never change.
 * @param {string} src
 * @param {string} [file]
 * @returns {string}
 */
export function constToLet(src, file) {
  const toks = tokenizeJs(src, file);
  let out = '';
  let pos = 0;
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.t !== 'id' || tk.v !== 'const') continue;
    const prev = i > 0 ? toks[i - 1] : null;
    const next = i + 1 < toks.length ? toks[i + 1] : null;
    if (prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.' || prev.v === '#')) continue;
    if (!next || !(next.t === 'id' || (next.t === 'p' && (next.v === '{' || next.v === '[')))) continue;
    out += src.slice(pos, tk.s) + 'let';
    pos = tk.e;
  }
  return out + src.slice(pos);
}

/* ------------------------------------------------------------------------------------------
 * CSS. The stylesheet was the one part of the page still shipping exactly as authored, with
 * its comments and its indentation, because minify.mjs is a JavaScript scanner.
 * ---------------------------------------------------------------------------------------- */

/**
 * Remove the comments and the insignificant whitespace from a stylesheet.
 *
 * DELIBERATELY CONSERVATIVE, because a stylesheet that is subtly wrong looks fine on the one
 * screen the author checks. Three whitespace positions are load bearing in CSS and none of
 * them is touched:
 *   - the descendant combinator: `.panel .badge` is not `.panel.badge`, so a space between two
 *     selector parts survives. Only whitespace that touches `{ } ; ,` or FOLLOWS a `:` goes.
 *   - `@media screen and (min-width: 40em)`: removing the space before `(` would give
 *     `and(min-width:40em)`, which is a syntax error, so whitespace around brackets survives.
 *   - a space BEFORE `:` separates a descendant from a pseudo class, as in `a :hover`, which
 *     is not `a:hover`, so only the space after a colon goes.
 * String content is never touched: the scanner has an explicit state for a quoted value, so a
 * selector like `[data-claim-badge="MEASURED"]` and a `content: "a b"` both survive intact.
 *
 * @param {string} src
 * @returns {string}
 */
export function compactCss(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
      // A comment between two tokens must not glue them together.
      if (!/[\s{};:,]/.test(out[out.length - 1] || '{') && !/[\s{};:,]/.test(src[i] || '}')) out += ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n) {
        out += src[i];
        if (src[i] === '\\') { out += src[i + 1]; i += 2; continue; }
        if (src[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(src[j])) j += 1;
      const before = out[out.length - 1];
      const after = src[j];
      i = j;
      if (before === undefined || after === undefined) continue;
      if ('{};,'.includes(before) || '{};,'.includes(after) || before === ':') continue;
      out += ' ';
      continue;
    }
    // The last declaration in a block does not need its semicolon.
    if (c === '}' && out[out.length - 1] === ';') out = out.slice(0, -1);
    out += c;
    i += 1;
  }
  return out.trim();
}
