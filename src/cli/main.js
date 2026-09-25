// THE COMMAND LINE ENTRY. DESIGN-CLI sections 0 and 1.
//
// A hand written, strict argument parser (DESIGN-CLI item 1: no parser dependency), then one
// dispatch. Strict means: every token is either a known command, a known option, or the value
// a known option takes; anything else is a usage error with exit code 2, stated in words on
// stderr, and nothing runs. An option is never guessed from a prefix, a city is never guessed
// from a partial name, and no host, URL, port or base URL is accepted from anywhere
// (DESIGN-CLI item 6: there is no option that could carry one).
//
// This module prints nothing itself. Every line leaves through ./out.js, which the gates hold
// to be the only writer under src/cli.
//
// THE INTERRUPT (DESIGN-CLI item 8). The first interrupt aborts every request in flight through
// the run's AbortSignal, prints one line on stderr, and the run ends with exit code 130 once the
// abandoned requests have unwound, with nothing partial reported. A second interrupt while that
// unwinding is still going on ends the process at once, with the same code.

import { readFileSync } from 'node:fs';
import { t, arg } from './parts.js';
import { COPY, EXIT, NAME } from './copy.js';
import { createOut } from './out.js';
import {
  runFact, runHelp, runVersion, runCities, runPlan, runSources, runFloor, runSelftest,
  resolveCity, resolvePlace,
} from './commands.js';
import { runMeasure } from './report.js';

/** Every command, in the order --help lists them. */
export const COMMANDS = Object.freeze(['measure', 'cities', 'plan', 'floor', 'selftest', 'sources']);

/** Options that take no value, and the flag each one sets. */
const SWITCHES = Object.freeze({
  '--json': 'json',
  '--plain': 'plain',
  '--no-color': 'noColor',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
});

/** Options that take exactly one value. */
const VALUED = Object.freeze({ '--city': 'city' });

/**
 * @typedef {Object} Flags
 * @property {boolean} json
 * @property {boolean} plain
 * @property {boolean} noColor
 * @property {boolean} help
 * @property {boolean} version
 * @property {string|null} city
 */

/**
 * @typedef {{ok:true, action:string, flags:Flags,
 *   city?:import('../ui/citypicker.js').PickableCity,
 *   from?:{id:string,label:string,lat:number,lon:number},
 *   to?:{id:string,label:string,lat:number,lon:number}}} Parsed
 * @typedef {{ok:false, flags:Flags|null, message:any[], hint:string}} ParseError
 */

/**
 * @param {string} reason A fixed sentence from COPY.
 * @param {string|null} echoed The user's own token, echoed back quoted, or null.
 * @param {Flags|null} flags
 * @param {string} [hint]
 * @returns {ParseError}
 */
function usage(reason, echoed, flags, hint = COPY.usageHint) {
  const message = echoed === null ? [t(COPY.usagePrefix + reason)] : [t(COPY.usagePrefix + reason), arg(echoed)];
  return { ok: false, flags, message, hint };
}

/**
 * Parse argv. Pure: no output, no environment, no network.
 * @param {readonly string[]} argv The arguments after the program name.
 * @returns {Parsed|ParseError}
 */
export function parseArgs(argv) {
  /** @type {Flags} */
  const flags = { json: false, plain: false, noColor: false, help: false, version: false, city: null };
  const seen = new Set();
  /** @type {string[]} */
  const positionals = [];
  let rest = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i]);
    if (rest || token === '-' || !token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    if (token === '--') {
      rest = true;
      continue;
    }
    const eq = token.startsWith('--') ? token.indexOf('=') : -1;
    const name = eq > 0 ? token.slice(0, eq) : token;
    const inline = eq > 0 ? token.slice(eq + 1) : null;

    if (Object.prototype.hasOwnProperty.call(SWITCHES, name)) {
      if (inline !== null) return usage(COPY.usageNoValue, name, null);
      const key = /** @type {'json'|'plain'|'noColor'|'help'|'version'} */ (SWITCHES[/** @type {keyof typeof SWITCHES} */ (name)]);
      if (seen.has(key)) return usage(COPY.usageRepeated, name, null);
      seen.add(key);
      flags[key] = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(VALUED, name)) {
      if (seen.has('city')) return usage(COPY.usageRepeated, name, null);
      let value = inline;
      if (value === null) {
        const next = argv[i + 1];
        // The next token is the value unless it is itself an option; a missing value is never
        // filled by swallowing the option after it.
        if (next === undefined || (String(next).startsWith('-') && String(next) !== '-')) {
          return usage(COPY.usageMissingValue, name, null);
        }
        value = String(next);
        i += 1;
      }
      if (value.trim().length === 0) return usage(COPY.usageMissingValue, name, null);
      seen.add('city');
      flags.city = value;
      continue;
    }
    // Only the option name is echoed, never an inline value, which could be anything.
    return usage(COPY.usageUnknownOption, name, null);
  }

  if (flags.json && flags.plain) return usage(COPY.usageJsonPlain, null, flags);

  const command = positionals.length > 0 ? positionals[0] : null;
  if (command !== null && !COMMANDS.includes(command)) {
    return usage(COPY.usageUnknownCommand, command, flags);
  }
  if (flags.city !== null && command !== 'measure') return usage(COPY.usageCityOnlyMeasure, null, flags);

  // --help and --version answer before any command runs, and ask nothing of its arguments
  // beyond their being well formed.
  if (flags.help) return { ok: true, action: 'help', flags };
  if (flags.version) return { ok: true, action: 'version', flags };

  if (command === null) return { ok: true, action: 'fact', flags };

  if (command === 'floor') {
    if (positionals.length !== 3) return usage(COPY.usageFloorArgs, null, flags);
    const from = resolvePlace(positionals[1]);
    if (!from) return usage(COPY.usageUnknownPlace, positionals[1], flags, COPY.usageUnknownPlaceHint);
    const to = resolvePlace(positionals[2]);
    if (!to) return usage(COPY.usageUnknownPlace, positionals[2], flags, COPY.usageUnknownPlaceHint);
    return { ok: true, action: 'floor', flags, from, to };
  }

  if (positionals.length > 1) return usage(COPY.usageExtraArgument, positionals[1], flags);

  if (command === 'measure') {
    if (flags.city === null) return usage(COPY.usageCityRequired, null, flags, COPY.usageUnknownCityHint);
    const city = resolveCity(flags.city);
    if (!city) return usage(COPY.usageUnknownCity, flags.city, flags, COPY.usageUnknownCityHint);
    return { ok: true, action: 'measure', flags, city };
  }
  return { ok: true, action: command, flags };
}

/** A released version string: three dot separated integers, optionally a pre-release tag. */
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

/**
 * The version, read from the package's own manifest so it cannot drift from what npm installed.
 * @returns {string}
 */
export function packageVersion() {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  if (manifest.name !== NAME || typeof manifest.version !== 'string' || !VERSION_RE.test(manifest.version)) {
    throw new Error('main: the package manifest next to this command line is not photontax\'s own');
  }
  return manifest.version;
}

/**
 * @typedef {Object} Io Everything main reaches outside itself, injectable for tests.
 * @property {NodeJS.WritableStream & {isTTY?:boolean, columns?:number}} [stdout]
 * @property {NodeJS.WritableStream & {isTTY?:boolean, columns?:number}} [stderr]
 * @property {Record<string, string|undefined>} [env]
 * @property {readonly string[]} [execArgv]
 * @property {string} [version]
 * @property {(signal: string, handler: () => void) => (() => void)} [onSignal] Subscribes, and
 *   returns the unsubscribe.
 * @property {(code: number) => void} [exit] Used only by a second interrupt.
 * @property {(options: any) => any} [createTransport]
 * @property {() => number} [now]
 * @property {number} [timeoutMs]
 * @property {number} [concurrency]
 */

/** @type {(signal: string, handler: () => void) => (() => void)} */
const processSignal = (signal, handler) => {
  process.on(signal, handler);
  return () => { process.off(signal, handler); };
};

/**
 * Run the command line. Resolves to the exit code; never rejects.
 * @param {readonly string[]} argv
 * @param {Io} [io]
 * @returns {Promise<number>}
 */
export async function main(argv, io = {}) {
  const env = io.env || process.env;
  const parsed = parseArgs(argv);
  const flags = parsed.flags;
  const out = createOut({
    stdout: io.stdout,
    stderr: io.stderr,
    env,
    json: Boolean(parsed.ok && flags && flags.json),
    plain: Boolean(flags && flags.plain),
    noColor: Boolean(flags && flags.noColor),
  });

  if (!parsed.ok) {
    out.note(parsed.message);
    out.note([t(parsed.hint)]);
    return EXIT.USAGE;
  }

  const controller = new AbortController();
  let interrupted = false;
  const onInterrupt = () => {
    if (interrupted) {
      (io.exit || process.exit)(EXIT.INTERRUPTED);
      return;
    }
    interrupted = true;
    controller.abort();
    out.note([t(COPY.interrupted)]);
  };
  const unsubscribe = (io.onSignal || processSignal)('SIGINT', onInterrupt);

  /** @type {number} */
  let code;
  try {
    const version = io.version || packageVersion();
    const ctx = {
      version,
      env,
      execArgv: io.execArgv || process.execArgv,
      signal: controller.signal,
      createTransport: io.createTransport,
      now: io.now,
      timeoutMs: io.timeoutMs,
      concurrency: io.concurrency,
    };
    switch (parsed.action) {
      case 'help': code = runHelp(out, ctx); break;
      case 'version': code = runVersion(out, ctx); break;
      case 'fact': code = runFact(out, ctx); break;
      case 'cities': code = runCities(out, ctx); break;
      case 'plan': code = runPlan(out, ctx); break;
      case 'sources': code = runSources(out, ctx); break;
      case 'floor': code = runFloor(out, ctx, /** @type {any} */ (parsed.from), /** @type {any} */ (parsed.to)); break;
      case 'selftest': code = await runSelftest(out, ctx); break;
      case 'measure': code = await runMeasure(out, ctx, /** @type {any} */ (parsed.city)); break;
      default: throw new Error('main: no handler for ' + parsed.action);
    }
  } catch (err) {
    out.internalError(err);
    code = EXIT.FAILED;
  } finally {
    unsubscribe();
  }

  if (interrupted) return EXIT.INTERRUPTED;
  // A reader that went away (a pipe into head, say) is not a failure of this run.
  if (out.closed) return EXIT.DONE;
  return code;
}
