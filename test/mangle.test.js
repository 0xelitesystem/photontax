// THE SHIPPED-OUTPUT COMPACTOR (scripts/mangle.mjs).
//
// The page ships smaller than its source, so something rewrites it, and a rewriter that is
// subtly wrong produces a page that looks fine on the one screen somebody checks. These tests
// exist so that it cannot be subtly wrong quietly:
//
//   1. the snippet tests below pin the cases where a naive rewriter corrupts working code,
//   2. the whole-repo test evaluates EVERY module the page ships, both plain and compacted, and
//      compares every exported value, so a rename that crossed a scope boundary or a removed
//      space that glued two tokens together fails here rather than in a browser.
//
// scripts/build.mjs also compiles the assembled page with node:vm before writing it, and
// test/ui.test.js executes the script that is actually inside index.html. This file is the
// layer in between: it checks the transform itself rather than the artifact.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { shortenNames, compactJs, constToLet, compactCss, segmentJs } from '../scripts/mangle.mjs';
import { wrapModule, buildGraph } from '../scripts/build.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Compare two values BY CONTENT rather than by the identity of their prototypes. Every snippet
 * here runs in its own vm context, so an array built inside one is not an instance of the Array
 * this file sees, and a strict deep comparison fails on two values that are equal in every way
 * a reader cares about. Serialising both sides asks the question that was meant.
 */
const same = (a, b, message) => assert.equal(JSON.stringify(a), JSON.stringify(b), message);

/** The three transforms in the order the build applies them. */
const shrink = (src) => constToLet(compactJs(shortenNames(src, { file: 'test' }).code, 'test'), 'test');

/** Evaluate a snippet as a function body and return what it returns. */
const evaluate = (body, sandbox = {}) => {
  const context = vm.createContext(sandbox);
  return new vm.Script('(function () {\n' + body + '\n})()').runInContext(context);
};

describe('the compactor preserves what the code means', () => {
  test('a renamed binding keeps its value through every reference', () => {
    const body = 'const someLongName = 3;\nconst anotherLongName = someLongName * 7;\n'
      + 'return anotherLongName + someLongName;';
    assert.equal(evaluate(shrink(body)), evaluate(body));
    assert.equal(evaluate(shrink(body)), 24);
  });

  test('a property is never renamed, even when a local shares its name', () => {
    const body = 'const value = { value: 11, other: 2 };\nreturn value.value + value.other;';
    const small = shrink(body);
    assert.equal(evaluate(small), 13);
    assert.ok(small.includes('.value'), 'the property access survives: ' + small);
  });

  test('a shorthand key is written back as an explicit key, which is how exports survive', () => {
    const body = 'const exportedThing = 5;\nreturn { exportedThing };';
    const small = shrink(body);
    same(evaluate(small), { exportedThing: 5 });
    assert.ok(!small.includes('{exportedThing}'), 'the shorthand was expanded: ' + small);
  });

  test('a free global is never renamed, because nothing here declares it', () => {
    const body = 'const local = 2;\nreturn aProvidedGlobal * local;';
    assert.equal(evaluate(shrink(body), { aProvidedGlobal: 21 }), 42);
  });

  test('string, template and regex content is untouched', () => {
    const body = "const sep = '//';\nconst re = /\\/\\//;\nconst t = `a // b ${sep} c`;\n"
      + 'return [sep, re.source, t];';
    same(evaluate(shrink(body)), evaluate(body));
    same(evaluate(shrink(body)), ['//', '\\/\\/', 'a // b // c']);
  });

  test('a space that two tokens need to stay apart is kept', () => {
    assert.equal(compactJs('a + +b; c - -d; let x = typeof y'), 'a+ +b;c- -d;let x=typeof y');
    assert.equal(compactJs('return x\ny = 1'), 'return x\ny=1');
    assert.equal(compactJs('f(a,\n b);\n{\n c }'), 'f(a,b);{c}');
  });

  test('automatic semicolon insertion is not disturbed: a newline after return survives', () => {
    const body = 'function f() {\n  return\n  1;\n}\nreturn f();';
    assert.equal(evaluate(shrink(body)), undefined);
    assert.equal(evaluate(shrink(body)), evaluate(body));
  });

  test('constToLet rewrites a declaration and never a key, a property or literal text', () => {
    assert.equal(constToLet('const{a}=o;const[b]=p;const c=1'), 'let{a}=o;let[b]=p;let c=1');
    assert.equal(constToLet('x.const;({const:1});"const a"'), 'x.const;({const:1});"const a"');
  });

  test('segmentJs puts every byte back where it found it', async () => {
    const src = await readFile(path.join(REPO, 'src/ui/viewmodel.js'), 'utf8');
    assert.equal(segmentJs(src, 'viewmodel.js').map((s) => s.text).join(''), src);
  });
});

describe('the stylesheet compactor preserves what a rule means', () => {
  test('a descendant combinator is not collapsed into a compound selector', () => {
    assert.equal(compactCss('.panel .badge { color: red; }'), '.panel .badge{color:red}');
  });

  test('a media query keeps the space its syntax requires', () => {
    assert.equal(
      compactCss('@media screen and (min-width: 40rem) {\n  a { b: c; }\n}'),
      '@media screen and (min-width:40rem){a{b:c}}',
    );
  });

  test('a space before a colon survives, because it separates a descendant from a pseudo class', () => {
    assert.equal(compactCss('a :hover { x: y; }'), 'a :hover{x:y}');
    assert.equal(compactCss('a:hover { x: y; }'), 'a:hover{x:y}');
  });

  test('quoted content is never touched', () => {
    assert.equal(
      compactCss('[data-badge="A  B"] { content: "a  b"; }'),
      '[data-badge="A  B"]{content:"a  b"}',
    );
  });

  test('a comment cannot glue two tokens together', () => {
    assert.equal(compactCss('.a/* x */.b { c: d }'), '.a .b{c:d}');
    assert.equal(compactCss('.a { /* x */ c: d }'), '.a{c:d}');
  });
});

describe('every module the page ships', () => {
  test('exports the same names and the same values compacted as it does plain', async () => {
    const modules = await buildGraph(
      ['src/ui/main.js', 'src/ui/adapters.js', 'src/measure/index.js', 'src/render/index.js'],
      (rel) => readFile(path.join(REPO, rel), 'utf8'),
    );
    assert.ok(modules.length > 40, 'the graph found the page: ' + modules.length + ' modules');

    const build = (minifyOption) => {
      const code = modules.map((m) => wrapModule(m.src, m.rel, minifyOption)).join('\n');
      const context = vm.createContext({ __m: {}, window: undefined, document: undefined });
      new vm.Script(code).runInContext(context);
      return context.__m;
    };
    const plain = build({ minify: false });
    const shipped = build({});

    for (const { rel } of modules) {
      assert.ok(shipped[rel], rel + ' is missing from the compacted bundle');
      same(
        Object.keys(shipped[rel]).sort(),
        Object.keys(plain[rel]).sort(),
        rel + ' lost or gained an export when it was compacted',
      );

      for (const name of Object.keys(plain[rel])) {
        const a = plain[rel][name];
        const b = shipped[rel][name];
        if (typeof a === 'function') {
          assert.equal(typeof b, 'function', rel + '.' + name + ' stopped being a function');
          assert.equal(b.length, a.length, rel + '.' + name + ' changed arity');
          continue;
        }
        // Runs of whitespace are collapsed on BOTH sides before comparing, and the reason is
        // recorded rather than hidden. scripts/minify.mjs trims every line of the module and
        // drops the blank ones, and it does so across template literals too, so a multi line
        // template ships with its indentation gone. That predates this compactor and is
        // harmless for the only such values in this repo, which are the GLSL shader sources in
        // src/globe/shaders.js, where whitespace between tokens carries no meaning. It is
        // pinned as its own assertion below so it cannot quietly become something else.
        const flat = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : x));
        assert.equal(flat(b), flat(a), rel + '.' + name + ' changed value when compacted');
      }
    }
  });

  // THE ONE DIFFERENCE THE TEST ABOVE TOLERATES, WRITTEN DOWN. Anything beyond this and the
  // comparison above fails, which is the point of pinning it here.
  test('ships its GLSL with the indentation gone and every token in the same order', async () => {
    const modules = await buildGraph(['src/render/index.js'],
      (rel) => readFile(path.join(REPO, rel), 'utf8'));
    assert.ok(modules.some((m) => m.rel === 'src/globe/shaders.js'), 'the shaders module is in the page');

    // The whole graph is evaluated, in its topological order, rather than the one module:
    // shaders.js imports the ribbon expansion snippet from pipeline.js, so on its own it
    // destructures an undefined entry in the registry.
    const run = (opts) => {
      const code = modules.map((m) => wrapModule(m.src, m.rel, opts)).join('\n');
      const context = vm.createContext({ __m: {} });
      new vm.Script(code).runInContext(context);
      return context.__m['src/globe/shaders.js'];
    };
    const plain = run({ minify: false });
    const small = run({});

    for (const name of ['SPHERE_VS', 'SPHERE_FS', 'ATMOSPHERE_FS', 'RIBBON_VS', 'MARKER_FS']) {
      assert.equal(typeof small[name], 'string', name + ' is still a string');
      assert.equal(small[name].split(/\s+/).filter(Boolean).join(' '),
        plain[name].split(/\s+/).filter(Boolean).join(' '),
        name + ' changed more than its whitespace');
      assert.ok(small[name].startsWith('#version 300 es'),
        name + ' still opens with its version directive, which GLSL requires first');
      assert.ok(small[name].length <= plain[name].length, name + ' did not grow');
    }
  });

  test('and is genuinely smaller for it', async () => {
    const modules = await buildGraph(
      ['src/ui/main.js', 'src/ui/adapters.js', 'src/measure/index.js', 'src/render/index.js'],
      (rel) => readFile(path.join(REPO, rel), 'utf8'),
    );
    const size = (opts) => modules.reduce((n, m) => n + wrapModule(m.src, m.rel, opts).length, 0);
    const plain = size({ minify: false });
    const shipped = size({});
    assert.ok(shipped < plain * 0.75,
      'the compacted bundle is at most three quarters of the plain one: ' + shipped + ' of ' + plain);
  });
});
