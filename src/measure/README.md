# src/measure  MEASUREMENT team

Owns the warm HTTPS round trip and the three way decomposition. DESIGN 2.1, DESIGN 4 C2, DESIGN
4 C3, DESIGN 5, DESIGN 7.3, traps 2, 3, 4, 5, 9, 13, 14.

Output shapes and every rule they must satisfy: `../core/contracts/measurement.js` and
`../core/contracts/decomposition.js`. Both are validated at the boundary inside this folder, so
a malformed run fails where it was produced.

Start here:
- The measured quantity is a warm HTTPS round trip. Open the connection, DISCARD the first
  response, then take the minimum of 7 on the kept alive connection.
- Contact only the hosts in `MEASUREMENT_HOSTS`. Only `fetch()` with an absolute URL written as
  a literal. Side channel request constructs are detected and refused by `scripts/gate-csp.mjs`.
- Zero network activity on page load. One explicit button.
- A failure is a stated state with a reason, never a zero and never a spinner.

## The files

| file | what it owns |
|---|---|
| `index.js` | the public surface. `measure()` runs the whole thing end to end |
| `transport.js` | every network destination, written as a literal. The declaration the gate reads |
| `clock.js` | the monotonic reading, and the only rounding function in the engine |
| `roundtrip.js` | the warm up, the 7 samples, the minimum, and every failure path |
| `trace.js` | the REPORTED facility, and the honest handling of a proxy or a VPN |
| `colo-sites.js` | facility coordinates. Empty in V1, with the receipt for why |
| `observer.js` | the observer point. REPORTED facility or a city the reader chose. No third source |
| `decompose.js` | physics, access and route. The product |
| `run.js` | the run, the concurrency cap, and the true request count for the consent line |
| `selftest.js` | the engine half of the checks the reader can run in the browser |
| `reasons.js` | every stated sentence a degraded outcome is allowed to say |

## Four things a reader of this code should know

**Every destination is a literal, on purpose.** `scripts/gate-csp.mjs` finds hosts by reading
`fetch("https://...` out of the source. A URL assembled from a variable is a request the gate
cannot see. `transport.js` therefore spells out all thirteen, once, and the rest of the engine
dispatches through a frozen table. `test/measure-transport.test.js` runs the gate own scanner
over this folder and asserts the used set equals the declared set.

**Route can never be negative, as arithmetic rather than as hope.** `accessMs` is the minimum of
the same double values that each row subtracts from, so every difference is non negative before
rounding and stays non negative after it. The row that set the baseline carries exactly zero.
There is no clamp anywhere, because a clamp would hide this going wrong instead of preventing it.

**The impossible is screened before the baseline, not after.** A result faster than light for its
stated geography has a negative surplus, and the baseline is a minimum, so one of them left in
step 2 would set a negative baseline and inflate every other row on the page. The hand computed
fixture records what that unscreened baseline would have been, which is how the test proves the
ordering matters rather than asserting that it does.

**The observer point is the whole honesty of the page.** There are two sources and no third. In
V1 the REPORTED branch cannot fire because no facility coordinate can be cited yet, so the page
asks for a city and labels every distance as computed from that choice. `colo-sites.js` carries
the receipt, and `assertColoSite` refuses a row that arrives later without a citation.

## Proven by

`test/measure-transport.test.js`, `test/measure-roundtrip.test.js`,
`test/measure-decompose.test.js`, `test/measure-trace.test.js`, `test/measure-engine.test.js`.

Expectations come from `test/fixtures/measure-hand-computed.json`, produced by an implementation
that shares no code with the product: the spherical law of cosines instead of the haversine, the
floor written out longhand from the SI constant and the group index, and the largest remainder
apportionment written again from scratch. Two independent implementations agreeing is evidence.
One implementation agreeing with itself is not.
