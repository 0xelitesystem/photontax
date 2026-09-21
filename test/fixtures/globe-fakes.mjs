// Shared fakes for the globe integration test. GLOBE team.
//
// Not a test file. It holds a Document, a Window and a WebGL2 context that are just real
// enough to drive src/globe/index.js end to end in Node, and no more than that. Every method
// here exists because the module under test calls it; nothing is here speculatively, which is
// what keeps a fake from quietly becoming a second implementation of the browser.

/** @param {string} tag @param {string|null} ns */
function makeElement(tag, ns) {
  return {
    tagName: tag.toLowerCase(),
    namespaceURI: ns,
    children: [],
    attrs: {},
    style: {},
    textContent: '',
    listeners: {},
    parentNode: null,
    tabIndex: -1,
    type: '',
    width: 0,
    height: 0,
    rect: { width: 400, height: 400 },
    clientWidth: 400,
    clientHeight: 400,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    replaceChild(next, old) {
      this.children = this.children.map((c) => (c === old ? next : c));
      next.parentNode = this;
      old.parentNode = null;
      return old;
    },
    get firstChild() { return this.children[0] || null; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    },
    dispatch(type, ev) { for (const fn of (this.listeners[type] || []).slice()) fn(ev || {}); },
    getBoundingClientRect() { return this.rect; },
    /** Depth first search over the tree, by predicate. Only the test uses it. */
    find(pred) {
      for (const c of this.children) {
        if (pred(c)) return c;
        const deeper = c.find ? c.find(pred) : null;
        if (deeper) return deeper;
      }
      return null;
    },
    findAll(pred, out = []) {
      for (const c of this.children) {
        if (pred(c)) out.push(c);
        if (c.findAll) c.findAll(pred, out);
      }
      return out;
    },
  };
}

/**
 * @param {{getContext?: (name:string, attrs:object) => any}} [opts]
 */
export function fakeDocument(opts = {}) {
  const doc = {
    hidden: false,
    listeners: {},
    createElement(tag) {
      const el = makeElement(tag, null);
      el.ownerDocument = doc;
      if (tag === 'canvas') el.getContext = opts.getContext || (() => null);
      return el;
    },
    createElementNS(ns, tag) {
      const el = makeElement(tag, ns);
      el.ownerDocument = doc;
      return el;
    },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    },
    dispatch(type, ev) { for (const fn of (this.listeners[type] || []).slice()) fn(ev || {}); },
  };
  doc.defaultView = null;
  return doc;
}

/**
 * A window with a MANUAL animation frame queue. Frames only happen when the test says so,
 * which is the only way to assert that the render loop stops when it is supposed to.
 */
export function fakeWindow(opts = {}) {
  let nextId = 1;
  const queue = new Map();
  return {
    devicePixelRatio: opts.devicePixelRatio || 1,
    matchMedia: opts.matchMedia || (() => ({ matches: false })),
    requestAnimationFrame(fn) { const id = nextId++; queue.set(id, fn); return id; },
    cancelAnimationFrame(id) { queue.delete(id); },
    /** How many frames are waiting. Zero means the loop has stopped. */
    get pending() { return queue.size; },
    /** Run every queued callback once, at the given timestamp. */
    tick(timeMs) {
      const due = [...queue.entries()];
      queue.clear();
      for (const [, fn] of due) fn(timeMs);
      return due.length;
    },
  };
}

const GL_ENUM = [
  'TRIANGLES', 'LINES', 'LINE_STRIP', 'LINE_LOOP', 'POINTS', 'DEPTH_TEST', 'BLEND', 'CULL_FACE',
  'LEQUAL', 'BACK', 'FRONT', 'ONE', 'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'UNSIGNED_INT', 'FLOAT',
  'ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER', 'STATIC_DRAW', 'DYNAMIC_DRAW', 'COLOR_BUFFER_BIT',
  'DEPTH_BUFFER_BIT', 'VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS',
  'ALIASED_LINE_WIDTH_RANGE',
];

/** A WebGL2 context that records every call. Reports a maximum line width of 1, as real ones do. */
export function recordingGl(canvas) {
  const log = [];
  let nextId = 1;
  const obj = (kind) => ({ kind, id: nextId++ });
  const record = (m, ...a) => { log.push({ m, a }); };
  const gl = {
    canvas: canvas || { width: 0, height: 0 },
    log,
    calls: (name) => log.filter((e) => e.m === name),
  };
  for (const n of GL_ENUM) gl[n] = 'GL_' + n;
  return Object.assign(gl, {
    createShader: () => obj('shader'),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: () => {},
    createProgram: () => obj('program'),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    deleteProgram: () => record('deleteProgram'),
    getUniformLocation: (p, n) => ({ name: n }),
    getParameter: (p) => (p === gl.ALIASED_LINE_WIDTH_RANGE ? [1, 1] : null),
    createVertexArray: () => obj('vao'),
    bindVertexArray: () => {},
    deleteVertexArray: () => record('deleteVertexArray'),
    createBuffer: () => obj('buffer'),
    bindBuffer: () => {},
    bufferData: () => {},
    deleteBuffer: () => record('deleteBuffer'),
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    viewport: (...a) => record('viewport', ...a),
    clearColor: () => {},
    clearDepth: () => {},
    clear: () => record('clear'),
    enable: () => {},
    disable: () => {},
    depthFunc: () => {},
    depthMask: () => {},
    cullFace: () => {},
    blendFunc: () => {},
    useProgram: () => {},
    uniformMatrix4fv: () => {},
    uniform1f: () => {},
    uniform2f: () => {},
    uniform3f: () => {},
    uniform3fv: () => {},
    drawElements: (...a) => record('drawElements', ...a),
  });
}
