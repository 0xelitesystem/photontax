#!/usr/bin/env node
// THE OPENING FRAME, RENDERED AT BUILD TIME INTO THE DOCUMENT.
//
// DESIGN 6.3. The page used to ship an empty `<div id="app">` and build every element in the
// browser, which means first contentful paint could not happen until the whole payload had
// arrived AND been parsed AND been executed. On a throttled Fast 3G profile that is the entire
// budget spent before a single pixel of the product is on screen, and it is why the measured
// figure was 1,172 ms against a 1,000 ms gate.
//
// So the build runs the page's own opening frame here, against a small document of its own,
// and writes the result into the file. The browser then paints the hook, the button and the
// consent sentence while the rest of the bytes are still arriving.
//
// THE MARKUP IS NOT WRITTEN TWICE, AND THAT IS THE ONLY REASON THIS IS ALLOWED TO EXIST. This
// file contains no copy and no element names. It calls Page.buildSkipLink(), buildMasthead()
// and buildHero() -- the same three methods src/ui/main.js calls in the browser -- against a
// DOM small enough to write honestly, and serialises what comes back. A hand written copy of
// the hero in a build script is a second source of truth that drifts on the first edit, and
// the drift would show up as the page flashing one thing and then another.
//
// WHAT THE SMALL DOM HAS TO SUPPORT is exactly what src/ui/dom.js calls: createElement,
// createElementNS, createTextNode, setAttribute, appendChild, insertBefore, removeChild,
// firstChild, and addEventListener as a no op, because the hero attaches click handlers that
// mean nothing until the real page takes over. Anything else throws rather than returning
// undefined, because a silently missing DOM method is a silently missing element.
//
// Build time only. Nothing here ships.

import { Page } from '../src/ui/page.js';
import { buildViewModel } from '../src/ui/viewmodel.js';
import { runSelfTest } from '../src/ui/selftest.js';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Elements with no closing tag in the HTML serialisation. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr']);

class Node {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.childNodes = [];
    this.parentNode = null;
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child, ref) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i === -1) this.childNodes.push(child);
    else this.childNodes.splice(i, 0, child);
    return child;
  }

  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i !== -1) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  get firstChild() { return this.childNodes[0] || null; }

  get children() { return this.childNodes.filter((n) => n.nodeType === ELEMENT_NODE); }
}

class TextNode extends Node {
  constructor(value) { super(TEXT_NODE); this.nodeValue = String(value); }

  get textContent() { return this.nodeValue; }

  set textContent(v) { this.nodeValue = String(v); }
}

class Element extends Node {
  constructor(tagName, namespace) {
    super(ELEMENT_NODE);
    this.localName = String(tagName).toLowerCase();
    this.tagName = this.localName.toUpperCase();
    this.namespaceURI = namespace || null;
    this.attributes = new Map();
  }

  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }

  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

  removeAttribute(name) { this.attributes.delete(name); }

  /** Handlers mean nothing in a document that is a string. Accepted, ignored, never stored. */
  addEventListener() { /* no op by design, see the header */ }

  focus() { /* no op: there is nobody here to focus */ }

  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }

  set textContent(v) {
    this.childNodes = [];
    this.appendChild(new TextNode(v));
  }

  /**
   * The page builds elements and appends them; it does not query them back out during the
   * hero build. Refusing rather than returning null is what keeps that true: if a future edit
   * starts selecting inside the hero, this throws at build time instead of prerendering a
   * subtly different page from the one the browser makes.
   */
  querySelector(sel) {
    throw new Error('prerender: querySelector(' + JSON.stringify(sel) + ') was called while '
      + 'building the opening frame. This small DOM does not implement it on purpose. See the '
      + 'header of scripts/prerender.mjs.');
  }
}

/** The document the hero is built against. */
export function createDocument() {
  return {
    documentElement: new Element('html'),
    createElement: (tag) => new Element(tag),
    createElementNS: (ns, tag) => new Element(tag, ns),
    createTextNode: (value) => new TextNode(value),
  };
}

/** @param {string} s @returns {string} */
function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} s @returns {string} */
function escapeAttr(s) {
  // The quote and the ampersand are the two that MUST be escaped inside a double quoted
  // attribute value. The angle brackets are escaped as well, which the parser does not require
  // and which costs four bytes in a title attribute nobody reads, because an attribute value
  // that can never contain a bracket is one fewer thing a reviewer has to reason about.
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Serialise one node to HTML.
 *
 * Inside an `<svg>` the HTML parser is in foreign content mode, where a self closing tag is
 * legal and is how the four badge shapes are written. Outside it, a void element gets no
 * closing tag and everything else gets one.
 *
 * @param {Node} node
 * @param {boolean} [foreign] True once inside an svg subtree.
 * @returns {string}
 */
export function serialize(node, foreign = false) {
  if (node.nodeType === TEXT_NODE) return escapeText(node.nodeValue);
  if (node.nodeType !== ELEMENT_NODE) {
    throw new TypeError('prerender: cannot serialise node type ' + node.nodeType);
  }
  const name = node.localName;
  const attrs = [...node.attributes.entries()]
    .map(([k, v]) => ' ' + k + '="' + escapeAttr(v) + '"')
    .join('');
  const inSvg = foreign || name === 'svg';
  const open = '<' + name + attrs;

  if (!inSvg && VOID.has(name)) return open + '>';
  if (inSvg && node.childNodes.length === 0) return open + '/>';

  const inner = node.childNodes.map((c) => serialize(c, inSvg)).join('');
  return open + '>' + inner + '</' + name + '>';
}

/**
 * Build the opening frame and return it as HTML.
 *
 * The three methods below are the first three things src/ui/main.js mounts, in the same order,
 * from the same view model. Everything after them is below the fold and is built in the
 * browser, because it either needs a measurement that has not happened or it is not what the
 * reader is looking at while the rest of the bytes land.
 *
 * @param {{hasEngine:boolean, rendererDeferred:boolean}} opts
 * @returns {string}
 */
export function renderOpeningFrame(opts) {
  const doc = createDocument();
  const previous = globalThis.document;
  globalThis.document = doc;
  try {
    const page = new Page(doc, {
      reducedMotion: false,
      hasEngine: opts.hasEngine,
      hasRenderer: false,
      rendererDeferred: opts.rendererDeferred,
    });
    const vm = buildViewModel({
      state: 'idle',
      selfTest: runSelfTest({}),
      hasCoastline: opts.rendererDeferred,
    });
    return [page.buildSkipLink(), page.buildMasthead(), page.buildHero(vm)]
      .map((n) => serialize(n))
      .join('\n');
  } finally {
    globalThis.document = previous;
  }
}
