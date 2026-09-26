# Changelog

Release notes for the npm package and the page. Newest first. Every figure below is recomputed
by the test suite or printed by the command it names; none of it is a measurement anyone took.

## 0.2.0

### A command line

photontax is now also a command line, run with `npx photontax` on Node 22 or later. It is the
page's own engine, unchanged, behind a Node transport; the README section "Command line" and the
USAGE chapter of the same name cover every command.

- `photontax measure --city <city>` measures from the machine it runs on with the page's method:
  one discarded warm up and seven warm samples per endpoint, the minimum kept, the 30 ms spread
  rule, the faster than light screen, the access baseline and the route. It makes 96 HTTPS GET
  requests to the 12 AWS DynamoDB regional endpoints and contacts no other host. `photontax plan`
  prints that count, the hosts and the time limits without contacting anything.
- The observer point is always a city named with `--city`. The command line never looks anyone
  up and never makes the page's Cloudflare facility request.
- Every warm sample must ride the connection its warm up opened, and the socket says whether it
  did. An endpoint where one did not is reported as not measured, never as a figure.
- Figures only Node can see, from each warm up connection and kept apart from the round trip:
  DNS lookup time, TCP connect time, TLS handshake time, failed connection attempts, the
  connected address and the TLS version. A TCP connect time below the physics floor is a notice
  that something near the machine answered, never a result.
- Offline commands: `cities`, `plan`, `floor <from> <to>` with every term of the arithmetic,
  `selftest` and `sources`. With no command it prints one offline fact.
- `--json` prints one document naming its schema, `photontax.cli/1`, with every figure carrying
  its badge, value, unit, method and display text, and every absent figure a reason. `--plain`
  prints one complete sentence per figure for a screen reader or a log. `NO_COLOR`, `--no-color`
  and output that is not a terminal all turn colour off, and the badge word is always printed.
- Exit codes: 0 done, 1 a named failure, 2 a usage error, 130 interrupted.
- Certificate checking is always on and a run is refused when `NODE_TLS_REJECT_UNAUTHORIZED`
  turns it off. Redirects are failures. Response bodies are capped and discarded. Proxy settings
  are never used, and the run says so when one is set.
- Every request sends `User-Agent: photontax/<version> (+https://github.com/0xelitesystem/photontax)`
  and nothing else about the person running it. Nothing is written to disk.

### The page

- The capture fixture (`?fixture=1`) is labelled as what it is: TCP connect minimums recorded
  once from a machine in Virginia, with their own method sentences, instead of warm HTTPS round
  trips. It no longer shows made up samples. Its observer point is the bundled Ashburn, Virginia
  city centre, and the README and USAGE tables are rebuilt from it and pinned cell for cell by
  `npm test`.

### Checks

- `scripts/gate-csp.mjs` reads Node network calls as well as browser ones: only
  `src/cli/transport.js` may open a connection, only with a literal https URL, and every such
  host is counted into the set that must equal the page's `connect-src` list.
- `scripts/gate-badges.mjs` fails on any terminal write under `src/cli` outside the one output
  module, which strips control, bidirectional and format characters from every line it prints.
- The vocabulary gate now scans `USAGE.md`.
- `npm run verify:ci`, run before every publish, is `npm run verify` without the one step that
  downloads its source, so a publish needs no browser and no network.

### Packaging

- `package.json` gains the `photontax` bin, and its `files` list names LICENSE and exactly the
  modules the command line loads; `test/cli-package.test.js` holds the list to the import graph
  in both directions. The page, the globe, the tests and the scripts are not in the package.
- `.github/workflows/release.yml` publishes a `v` tag to npm with provenance and rehearses with
  `npm publish --dry-run` when run by hand. Both actions are pinned to full commits.

## 0.1.0

2026-09-21. The page: the warm HTTPS round trip from the reader's own machine to twelve public
cloud endpoints, each split into physics, access and route, every figure badged.
