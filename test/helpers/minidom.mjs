// A MINIMAL DOM, so the page itself can be tested rather than only the functions behind it.
//
// This repository has zero dependencies, including zero dev dependencies, so there is no jsdom
// and there is not going to be one. What the UI tests actually need is narrow: build elements,
// set attributes and text, walk text nodes, and resolve a custom property. That is small enough
// to write honestly, and writing it keeps the dependency count at zero.
//
// WHAT THIS BUYS, AND IT IS THE POINT OF THE WHOLE FILE. The most important assertion in this
// product is that no figure reaches a reader without a badge. Checking that against a view
// model checks the intent. Checking it against a rendered document checks the result, which is
// what the build gate does to the source and what the shipped self test does in the browser.
// With this, the test suite does it too, to the same page, before either of them runs.
//
// It is deliberately incomplete. querySelector understands only the handful of selector shapes
// the page uses, and it throws on anything else rather than silently returning null, because a
// selector helper that quietly answers "no match" turns a broken test into a passing one.

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

class MiniNode {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.childNodes = [];
    this.parentNode = null;
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === ELEMENT_NODE ? this.parentNode : null;
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

class MiniText extends MiniNode {
  constructor(value) {
    super(TEXT_NODE);
    this.nodeValue = String(value);
  }

  get textContent() { return this.nodeValue; }
}

class MiniElement extends MiniNode {
  constructor(tagName, namespace) {
    super(ELEMENT_NODE);
    this.tagName = String(tagName).toUpperCase();
    this.localName = String(tagName).toLowerCase();
    this.namespaceURI = namespace || null;
    this.attributes = new Map();
    this.style = {};
    this.listeners = new Map();
    this.focused = false;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

  hasAttribute(name) { return this.attributes.has(name); }

  removeAttribute(name) { this.attributes.delete(name); }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatch(type, event) {
    for (const fn of this.listeners.get(type) || []) fn(event || {});
  }

  focus() { this.focused = true; }

  /** The select element the city picker uses. */
  get value() {
    if (this.attributes.has('value')) return this.getAttribute('value');
    const first = this.children.find((c) => c.localName === 'option');
    return first ? first.getAttribute('value') : '';
  }

  set value(v) { this.setAttribute('value', v); }

  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }

  set textContent(v) {
    this.childNodes.length = 0;
    if (v !== '') this.appendChild(new MiniText(v));
  }

  matches(selector) {
    const parts = selector.trim();
    const attr = /^([.\w-]*)\[([\w-]+)="([^"]*)"\]$/.exec(parts);
    if (attr) {
      const head = attr[1];
      if (head && !this.matches(head)) return false;
      return this.getAttribute(attr[2]) === attr[3];
    }
    if (parts.startsWith('.')) {
      const cls = (this.getAttribute('class') || '').split(/\s+/);
      return cls.includes(parts.slice(1));
    }
    if (/^[a-z]+$/i.test(parts)) return this.localName === parts.toLowerCase();
    throw new Error('minidom: querySelector does not understand ' + JSON.stringify(selector)
      + '. Teach it the shape rather than letting a test pass on a silent null.');
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType !== ELEMENT_NODE) continue;
        if (c.matches(selector)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    out.forEach = Array.prototype.forEach.bind(out);
    return out;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length ? all[0] : null;
  }
}

class MiniTreeWalker {
  constructor(root, whatToShow) {
    this.queue = [];
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (whatToShow === 4 && c.nodeType === TEXT_NODE) this.queue.push(c);
        if (c.nodeType === ELEMENT_NODE) walk(c);
      }
    };
    walk(root);
    this.i = 0;
  }

  nextNode() {
    return this.i < this.queue.length ? this.queue[this.i++] : null;
  }
}

/**
 * Build a window with just enough surface for the page.
 *
 * @param {Object} [opts]
 * @param {Record<string,string>} [opts.cssVars] What getComputedStyle resolves on the root.
 * @param {boolean} [opts.reducedMotion]
 * @param {boolean} [opts.prefersLight]
 * @param {string} [opts.search]
 * @returns {any}
 */
export function makeWindow(opts = {}) {
  const doc = {
    createElement: (tag) => new MiniElement(tag, null),
    createElementNS: (ns, tag) => new MiniElement(tag, ns),
    createTextNode: (v) => new MiniText(v),
    createTreeWalker: (root, whatToShow) => new MiniTreeWalker(root, whatToShow),
  };
  doc.documentElement = new MiniElement('html');
  doc.body = new MiniElement('body');
  doc.documentElement.appendChild(doc.body);
  doc.getElementById = (id) => doc.body.querySelectorAll('[id="' + id + '"]')[0] || null;

  const store = new Map();
  // A virtual clock that ADVANCES. A frame scheduler that fires immediately against a clock
  // frozen at zero turns any duration driven animation into unbounded recursion, which is a
  // property of the harness and not of the page, and it cost an afternoon to see that.
  let clock = 0;
  const win = {
    document: doc,
    devicePixelRatio: 2,
    location: { search: opts.search || '' },
    performance: { now: () => clock },
    requestAnimationFrame: (cb) => { clock += 16; cb(clock); return 0; },
    setTimeout: (cb) => { cb(); return 0; },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
    },
    matchMedia: (q) => ({
      matches: q.includes('reduced-motion')
        ? Boolean(opts.reducedMotion)
        : Boolean(opts.prefersLight),
    }),
    getComputedStyle: () => ({
      getPropertyValue: (name) => (opts.cssVars ? (opts.cssVars[name] || '') : ''),
    }),
  };
  doc.defaultView = win;
  return win;
}

/** Serialise an element subtree to text, for eyeballing a failure. */
export function textOf(node) { return node.textContent; }

export { MiniElement, MiniText };
