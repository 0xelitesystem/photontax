# photontax

How much of your latency is physics, and how much is your route?

Live demo: https://0xelitesystem.github.io/photontax/

A single HTML file. No account, no key, no cookie, no analytics, no upload, no backend, and no
network call at all until you press the button.

## Use

Open the page. Before you touch anything it has already told you something true: the great
circle distance between two cloud regions and the round trip that light in glass cannot beat
over it, both recomputed in front of you from two coordinates and a physical constant.

Press **Measure my floor**. The page asks which city you are nearest, because it does not look
you up and it never will. Then it makes a small timed request to each of twelve public cloud
endpoints and splits every result three ways:

| region | distance | round trip | physics | access | route | ratio |
|---|---|---|---|---|---|---|
| Mumbai `ap-south-1` | 12924 km | 251 ms | 127 ms | 8 ms | 116 ms | 1.92x |
| Tokyo `ap-northeast-1` | 10944 km | 185 ms | 107 ms | 9 ms | 69 ms | 1.64x |
| Sydney `ap-southeast-2` | 15664 km | 205 ms | 154 ms | 8 ms | 43 ms | 1.28x |
| Sao Paulo `sa-east-1` | 7592 km | 124 ms | 74 ms | 8 ms | 42 ms | 1.56x |
| Frankfurt `eu-central-1` | 6602 km | 92 ms | 65 ms | 8 ms | 19 ms | 1.29x |
| N. Virginia `us-east-1` | 83 km | 9 ms | 1 ms | 8 ms | 0 ms | no ratio |

Add up any row and you get its total. That is not a courtesy, it is a rule the code enforces:
the three parts are apportioned to whole milliseconds by largest remainder so that the printed
integers sum exactly to the printed total, and the view model validator refuses a row where
they do not. A reader who adds up the numbers on screen and gets something else has correctly
concluded the tool is broken.

Read the Mumbai row. Of 251 milliseconds, **127 is the speed of light in fibre** and no
deployment decision will ever move it. **8 is the fixed cost of that connection itself**, the
same 8 milliseconds it pays to every destination on the list, and it belongs to the last mile
rather than to anything you built. **116 is the route**, and that is the only part anyone can
do anything about.

Three numbers, three different tickets, three different places to send them. That is the whole
product. The last row is why the middle number exists: 83 km away, an 8 millisecond fixed cost
sitting on a 0.8 millisecond floor reads as **11.35x** if you do not measure and subtract it,
and the person best placed to check the tool is the one who would see that first. Measuring the
access baseline returns it to exactly 1.00x, by construction.

Every figure above is reproduced by `npm test` from the round trips in
`src/ui/fixture.js`, so none of it is a screenshot of a claim.

## Why this exists

Every latency tool gives you a number. [gcping](https://github.com/GoogleCloudPlatform/gcping)
gives you an excellent one, and it established the browser measurement technique this tool
uses: open the connection, discard the first response, take the minimum of several warm
requests on a kept alive connection. cloudping and its relatives do the same for other
catalogues.

None of them tells you which part of the number you can change.

A latency figure is at least three costs added together, and they have nothing to do with each
other: the distance, which is physics; your own access link, which is your provider's; and the
path, which is somebody's routing. Optimising the wrong one is the default outcome of having a
single number, and the decomposition here exists to end that argument in about ten seconds.

## What this measures, and what it does not

Every value on the page carries one of four badges, spelled out as a word and drawn as a
distinct shape, never distinguished by colour alone. A number without a badge cannot be
rendered: the value type throws on every implicit path to text, the only text producing
function always emits the badge, and the build fails on any digit in the page that is not inside
an element carrying one.

**MEASURED. Your own machine did this.**

| fact | exact method | precision claimed |
|---|---|---|
| Warm HTTPS round trip to an endpoint | Open the connection, discard the first response, then take the minimum of 7 further request and response wall times on the kept alive connection, bracketed by `performance.now()` | Whole milliseconds, never a decimal |
| Access baseline | The minimum, over all measured endpoints, of (round trip minus that endpoint's computed floor) | Whole milliseconds |
| Route surplus | round trip minus floor minus access baseline | Whole milliseconds |

The measured quantity is a **warm HTTPS round trip**. It contains transport, TLS record
processing and server think time. It is not an ICMP measurement and it is not a network layer
round trip, the page never calls it either of those, and the build fails on both words.

**REPORTED. A third party states a fact about itself.**

| fact | source |
|---|---|
| Which Cloudflare facility served this connection | `cloudflare.com/cdn-cgi/trace`, field `colo` |
| Cloud region names, codes and endpoint hostnames | The provider's own published catalogue |

**COMPUTED. Arithmetic from a constant and a coordinate, reproducible offline.**

| fact | computation |
|---|---|
| Great circle distance | Haversine on a sphere of radius 6371.0088 km |
| Speed of light in fibre | 299792458 / 1.4682 = 204190.5 km/s |
| Round trip fibre floor | 2 x distance / 204190.5 x 1000 ms, which is 9.7948 ms per 1000 km |

**INFERRED. A model, with its assumptions on screen before the number.**

| inference | why it is not a measurement |
|---|---|
| Where a cloud region is | The provider publishes a city or an area, not a building. The coordinate used is the centre of that place, so the floor is a floor for the CITY. Microsoft publishes 37.3719, -79.8164 for its own `eastus` region and "Virginia" as that region's physical location; that point is 275.6 km from Ashburn, Virginia, and the page recomputes that distance in front of you with the same haversine it uses everywhere else |
| Where you are | Only if you tell it. You pick a city from a list and the answer never leaves the browser |

### What it will never tell you

- **Which cable your connection used.** A browser has no raw sockets and no ICMP. The WICG
  Direct Sockets specification exposes only `TCPSocket`, `UDPSocket` and `TCPServerSocket`,
  gated `[SecureContext, IsolatedContext]` with a Permissions Policy default allowlist of
  `none`, which excludes ordinary web pages. There is no TTL control anywhere in the platform.
- **The path a connection follows, or the machines along the way.** Same reason. There is more: for any
  cross origin resource without a `Timing-Allow-Origin` header, the Resource Timing
  specification zeroes `domainLookupStart`, `domainLookupEnd`, `connectStart`, `connectEnd`,
  `secureConnectionStart`, `requestStart`, `responseStart` and `nextHopProtocol`. None of the
  endpoints this tool measures sends that header, which was verified before they were chosen.
  This page cannot separate name resolution from TLS, let alone name a machine in between.
- **Where you are.** It does not geolocate anybody. IP geolocation returns a national fallback
  centroid for a large share of addresses, and the page would rather ask.
- **Which direction the surplus happened in.** A round trip is one number covering two paths
  that are frequently different. The page says "round trip" every time and never splits it.
- **Anything about submarine cables.** No cable geometry of any kind, no shore terminations,
  and no total of their number or their length appears anywhere in this product.

## The maths

The whole calculation, in order. The page prints every one of these terms on screen when you
press "show the maths", recomputed live rather than recalled.

```
c       = 299792458 m/s                SI definition of the metre, exact by definition
n       = 1.4682                       Corning SMF-28 effective group index at 1550 nm
v       = c / n / 1000                 = 204190.47677 km/s, published as 204190.5
R       = 6371.0088 km                 IUGG mean Earth radius R1

distance(A, B) = R * 2 * asin(sqrt(hav))      haversine, every term printed
floor(E)       = 2 * distance / v * 1000      = 9.7948 ms per 1000 km of separation

1. floor(E)      computed from two coordinates. No measurement, no network
2. access        = min over all E of ( measured(E) - floor(E) )
3. route(E)      = measured(E) - floor(E) - access
4. ratio(E)      = ( measured(E) - access ) / floor(E)
```

Step 2 is the step that makes the rest correct, and it is the reason this is not a ratio with a
nicer chart on it.

**The verdict thresholds are published rather than asserted.** The median ratio of published
long haul cable length to the great circle distance between the same two ends of that same
system is
about 1.13, so a route inside 1.15 is already inside the geometry of cable itself and cannot be
improved by routing. Above 1.6 a path is materially longer than the geography requires.

| ratio | verdict |
|---|---|
| at or below 1.15 | You are at the floor. This will not get faster without moving the service closer. |
| at or below 1.6 | Normal. Your route is roughly the shape of the cable, not the great circle. |
| above 1.6 | Your path is materially longer than the geography requires. |

**Below 500 km no ratio is rendered at all**, for the reason the `us-east-1` row above
demonstrates. Absolute milliseconds only.

**The 1.13 factor is not displayed anywhere in this product**, because the script that derives
it does not ship yet. A number whose derivation a reader cannot run is a number to cut, not to
soften, and there is a flag in `src/core/constants.js` holding it out of the page until the
derivation exists.

## Verification

Press **Run the self test** on the page. It runs in the browser, against the run you just took,
and prints a pass or fail line for each of these.

| check | assertion |
|---|---|
| Constant | `299792458 / 1.4682` recomputed, and it rounds to the published figure |
| Floor identity | `floor(1000 km)` recomputed to four decimals |
| Great circle | Five great circles with a closed form answer, including a point against itself, pole to pole and a quarter of the equator |
| Published region coordinate | The distance from Microsoft's published `eastus` point to Ashburn, recomputed |
| Antipodal sanity | The longest separation in the shipped table is under the longest great circle possible on the modelled sphere |
| **Faster than light screen** | **Zero measured results are below their own floor.** Any that are get dropped, counted and named as defects, never averaged in and never clamped |
| Decomposition identity | On every row, physics plus access plus route equals the measured round trip |
| Access baseline | It is the minimum surplus over all endpoints, and it is not negative |
| Distance gate | No ratio is rendered under 500 km |
| Sample stability | Seven warm samples per endpoint, and any endpoint whose samples span more than 30 ms is marked unstable and shows its spread instead of a single number |
| Provenance completeness | Every text run containing a figure sits inside an element carrying a badge. Zero unbadged figures |
| Contrast | Every colour pair the page places, read back from the custom properties the browser resolved, computed by the WCAG relative luminance formula, in the theme you are looking at |

The faster than light screen is the one that matters, and it is not hypothetical. An anycast
address answers from whichever node is nearest the caller, so a result attributed to a region
on the other side of the planet can come back in less time than light needs to cross the
distance. That is not a fast network, it is a measurement of somewhere else. The research pass
behind this tool hit a large share of exactly that against one anycast target. A build without
this screen publishes impossible claims on its front page and looks confident doing it.

The share is deliberately not quoted here. It came from an artifact this repository does not
ship, so nothing on disk can recompute it, and a figure nobody can check is one to cut rather
than to hedge.

### The floor, checked against reality

A floor is a claim about the world, so `npm run physics:live` checks it against the world. It
recomputes the constant longhand from the two cited primary sources, reproduces two published
great circles from their coordinates, then measures this machine against the same twelve
endpoints using a different client from the page's, and decomposes the result with arithmetic
written again from scratch.

Run on 2026-09-21 from a connection whose serving edge reported itself as `IAD`:

| | |
|---|---|
| endpoints that answered | 12 of 12 |
| results faster than light for their geography | 0 |
| access baseline | 6.69 ms |
| route ratio, 11 pairs over 500 km | min 1.29x, median 1.59x, max 2.05x |

Two real city pairs, against the published figures:

| pair | recomputed | published |
|---|---|---|
| New York to London | 5570.2 km, floor 54.56 ms | 5570.2 km, 54.56 ms |
| Los Angeles to Tokyo | 8819.4 km, floor 86.38 ms | 8819.4 km, 86.38 ms |

**And here is the gap, stated rather than smoothed.** Those two reproduce exactly only against
the coordinates they were computed from. Against the Wikidata coordinate this product actually
ships for Tokyo, Los Angeles to Tokyo is **8815.5 km**, not 8819.4. The two candidate points
for Tokyo are 4.017 km apart and the floors differ by 0.04 ms. That disagreement is not an
error to be tidied away, it is the INFERRED label doing its job: the coordinate is a city, and
a city is not a building. At the whole millisecond this product renders, the difference
disappears entirely, which is the honest reason it does not matter here and the honest reason
you should not trust a floor to more precision than that.

The measured median of 1.59x is compared against a published rule of thumb, quoted verbatim:

> "Previous measurement campaigns suggest the following rule of thumb for estimating Internet
> latency: multiply line-of-sight distance by 2.1, then divide by the speed of light in fiber."
>
> Bozkurt, Aqeel, Bhattacherjee, Chandrasekaran, Godfrey, Laughlin, Maggs and Singla,
> *Dissecting Latency in the Internet's Fiber Infrastructure*, [arXiv:1811.10737](https://arxiv.org/abs/1811.10737)

This machine came in **below** that figure, at 1.59x against 2.1x. That is the expected
direction and not a contradiction: the rule of thumb is a median over many measurement
campaigns and many access networks, and this is one well connected machine on one of them. A
result *above* 2.1x would be equally unremarkable from a worse connection. What would not be
unremarkable is a result below 1.00x, and that is the one the faster than light screen refuses
to publish at all.

Outside the browser, `npm run verify` runs the test suite and four build gates: the banned
vocabulary list, the badge completeness scan over the shipped page and every module, the
contrast arithmetic over every declared pair in both themes, and the declared host check. Each
gate carries positive controls that run on every invocation, and the test suite asserts that
each one exits non zero when it should, because a gate nobody has watched fail is not a gate.

## Privacy

No account. No key. No cookie. No analytics. No upload. No backend. Nothing is stored about you
anywhere, because there is nowhere to store it.

The page makes **no network request at all** until you press the button. When you do, it
contacts exactly these hosts and nothing else, and the browser is told to refuse anything else
by a Content-Security-Policy `connect-src` allowlist in the page head:

```
www.cloudflare.com                       read once, to learn which facility served you
dynamodb.af-south-1.amazonaws.com        timed
dynamodb.ap-east-1.amazonaws.com         timed
dynamodb.ap-northeast-1.amazonaws.com    timed
dynamodb.ap-south-1.amazonaws.com        timed
dynamodb.ap-southeast-1.amazonaws.com    timed
dynamodb.ap-southeast-2.amazonaws.com    timed
dynamodb.eu-central-1.amazonaws.com      timed
dynamodb.eu-north-1.amazonaws.com        timed
dynamodb.eu-west-2.amazonaws.com         timed
dynamodb.il-central-1.amazonaws.com      timed
dynamodb.sa-east-1.amazonaws.com         timed
dynamodb.us-east-1.amazonaws.com         timed
```

Each timed request sends no credential, and its response is discarded; only the wall time is
kept, in your browser, until you close the tab. The build checks that the set of hosts reachable
from the code and the set declared in that policy are **equal**, and fails on a host in either
one and missing from the other, so this list cannot quietly grow.

The one thing stored on your device is which theme you picked.

## Run locally

Open `index.html`. That is the whole procedure.

Everything except the measurement works with the network completely down: the globe, the great
circle distance, the floor, the constant and the self test are all arithmetic over data that is
already in the file. That is deliberate, because the person most likely to want this tool is
debugging a network that is already broken.

## Build

```
npm test      the test suite, no dependencies, no browser
npm run gates the four build gates and their positive controls
npm run verify both
npm run build rebuild index.html and assets/globe.js from the modules under src/
```

`index.html` and `assets/globe.js` are both **generated** and both committed. Edit the modules
under `src/`, then run the build; `npm run build -- --check` fails if either committed file is
not what the source produces.

The build inlines the module graph into one file, generates the stylesheet from the palette in
`src/core/tokens.js`, generates the Content-Security-Policy from the shipped endpoint dataset,
strips the source commentary out of the copy that travels, shortens local bindings and removes
the whitespace JavaScript does not need, compacts the stylesheet, compiles the assembled code
with `node:vm` before writing it so that a minifier bug is a build failure rather than a blank
page, renders the opening frame into the document so that first paint does not wait for the
script, splits the decorative globe into `assets/globe.js`, and reports both payloads against
their budgets.

The source stays fully commented. Only the copy that travels is compacted, and none of it
renames a property, a key or anything the scanner cannot classify with certainty, so a page
that is subtly wrong is not a thing this build can produce: `test/ui.test.js` runs the script
that is actually inside `index.html` and compares its exports against the values the plain
modules produce.

One module is deliberately never inlined and the build fails if it becomes reachable from the
page: `src/core/vocabulary.js` is the registry of banned phrases and necessarily contains every
one of them, so a page containing it would fail the very scan it exists to feed.

Everything else regenerates:

```
npm run endpoints:refresh   rewrite the region table from the live provider catalogues
npm run endpoints:check     fail if the committed table has drifted from them
npm run coastline:build     rebuild the coastline payload from the Natural Earth source
npm run coastline:check     fail if the committed payload is not what the source produces
npm run fixture:measure     rebuild the hand computed measurement fixture
npm run fixture:check       fail if the committed fixture is not what the script produces
npm run globe:validate      recompute every geometric figure the globe relies on
npm run physics:live        measure THIS machine against the twelve endpoints and check the floor
```

### What it weighs, and when it paints

Every figure below is measured, and both gates are green. Reproduce them with `npm run build`
and `npm run fcp`.

| | | |
|---|---|---|
| first contentful paint, cold cache, Fast 3G | **648 ms** | against a 1,000 ms budget |
| `index.html`, gzip level 9, the bytes before that paint | **54,407 B** | against a 56,294 B critical path budget |
| `assets/globe.js`, fetched after the paint | 33,323 B | |
| both files, what a first visit costs | **87,730 B** | against a 91,504 B total page budget |
| first contentful paint, no throttling | 132 ms | a reference line, not the gate |
| `index.html` on disk | 199,923 B | |
| frame rate, idle rotation | 61 fps | |
| modules, critical path and deferred | 39 and 16 | |

Measured in headless Edge on 2026-09-21 with hardware acceleration on, so the WebGL globe is
live for these numbers rather than the flat map fallback. Nine cold cache passes for the
throttled figure, median reported, a fresh browser context each time; the nine samples ran 632
to 664 ms, so the median is not carrying a lucky run. The throttled profile is
the Fast 3G preset by its constants rather than by its name, because names move: 562.5 ms of
added latency, 1.6 Mbit/s down and 750 Kbit/s up, each at the 90 percent factor the preset
applies, which is 188,743.68 B/s. Both files are served with `Content-Encoding: gzip`, the way
GitHub Pages serves them.

**Two files, and the split is this tool's own argument applied to itself.** The caption over
the result table says: "This table is the result; the globe is decorative." So the globe does
not sit in front of the first paint. `index.html` carries the opening frame, the stylesheet,
and the UI, claim and measurement code. `assets/globe.js` carries the WebGL2 renderer, its
geometry, its shaders, the SVG fallback and the Natural Earth coastline, and the page asks for
it two animation frames after it has mounted.

Nothing about that weakens what this page promises:

- **Zero third party requests before you press the button.** The deferred file is served from
  this page's own origin, by a relative path, out of this repository. It names no host.
- **The `connect-src` allowlist is unchanged.** It is the same 13 hosts it was, and
  `npm run gates` still fails if the set used in code and the set declared in the page head
  disagree in either direction. `script-src` gained `'self'` and nothing else.
- **Nothing is fetched to paint the page.** `index.html` contains no `src`, no stylesheet link
  and no resource hint. The build fails if one appears.
- **The globe's absence is a stated condition, never a blank.** Before it lands, and on a
  browser that never gets it, there is a drawn placeholder at the size the globe will take, so
  the page does not move under you, and a sentence saying what happened.

**The opening frame is rendered into the document at build time.** The page used to ship an
empty `<div id="app">`, so nothing could paint until the whole payload had arrived, parsed and
run. `scripts/prerender.mjs` now calls the page's own `buildSkipLink()`, `buildMasthead()` and
`buildHero()` against a small build time DOM and writes the result into the file. There is one
source of truth for that markup, which is why the live page taking over is invisible. The
measured response still does not end until 868 ms; the paint is at 648 ms, because the browser
is painting the frame while the rest of the bytes are still arriving.

**Where the bytes are**, by marginal cost, which is what the file loses when that area is taken
out of it and the only honest way to split one gzip stream:

```
index.html, 54,407 B
    22,729  src/ui        the page, the maths panel, the self test, the reader facing copy
    16,053  src/core      claims, the four contract validators, endpoints, citations
     7,355  src/measure   the engine, the transport, the three way decomposition
     3,075  the stylesheet
     2,120  the opening frame, rendered into the document at build time
       707  head, CSP, JSON LD, noscript

assets/globe.js, 33,323 B
    17,415  src/globe     WebGL2 renderer, geometry, camera, shaders, a11y, SVG fallback
    14,657  src/globe/coastline-data.js   Natural Earth 110m, 14,106 points, base64
       745  src/core/contracts/globe.js   the one contract only the globe needs
       534  src/render    the port adapter
```

About 29.5 KB of that is English prose inside string literals: the validator messages, the
method sentence that travels next to every number, and the copy on the page. It does not
compress further, and it is the thing this tool is for. It is also why the budget is what it
is: an earlier design document set one 40 KB budget for one file, written before the product
existed, and deleting the entire globe would not have met it. The budget was re-costed against
the artifact rather than the artifact cut down to the estimate, and the pair above is what
replaced it. Each budget is the measured figure plus 1,887 B, which is ten milliseconds of
Fast 3G transfer, so the headroom on a byte budget is stated in the unit of the gate it serves.

## Data and attribution

The headline path depends on no third party dataset at all. It is your own measurement, two
physical constants, a haversine and a list of hostnames. That is what makes this tool work on a
locked down corporate network, and it is what keeps the licence clean.

| source | what it gives | licence |
|---|---|---|
| Your own browser | Every measured millisecond | Yours. It is your measurement of your own connection |
| SI definition of the metre | The speed of light in vacuum, exactly | A definition, not a work |
| Corning SMF-28 product information sheet | Effective group index of refraction at 1550 nm | A published physical property, cited as a fact |
| IUGG mean Earth radius | The sphere the haversine runs on | A derived geodetic constant, cited as a fact |
| Amazon Web Services regional endpoint catalogue | Region codes, region names and endpoint hostnames | Published operator catalogue; factual identifiers only |
| [GoogleCloudPlatform/gcping](https://github.com/GoogleCloudPlatform/gcping) | Google Cloud region codes and names | Apache 2.0. The project also established the browser measurement technique used here |
| Wikidata, property P625 | Every city coordinate, with the item id per row so you can re-pull it | CC0 |
| Cloudflare `cdn-cgi/trace` | Which facility served your connection | A public diagnostic endpoint reporting on your own connection. Nothing is stored |

| Natural Earth 110m coastline | The globe outline, 5,022 points bundled in the page | Public domain. See the notices below |

Deliberately not used: submarine cable datasets in every form, scraped mirrors of them,
PeeringDB, Cloudflare Radar, RIPEstat, CAIDA, IODA, and the public OpenStreetMap tile and
Overpass instances. Each was checked and each failed on licence, on CORS, on a missing licence
entirely, on an acceptable use policy, or on being too sparse to carry the analysis.

## Independence

photontax is an independent project. It is not affiliated with, endorsed by, or connected to
Amazon, Google, Cloudflare, Fastly, or any other company named in this repository. Those names
appear because the tool measures endpoints those companies publish, and because the tool cites
the documentation those companies wrote. Measuring a public endpoint is not an endorsement by
its owner, and no company named here has reviewed, approved or sponsored this work.

## Third party notices

This page bundles one third party asset and no third party code. Every other dependency is a
cited fact, not a work: a physical constant, a geodetic constant, a hostname or a coordinate.

### Natural Earth

The globe outline is built from Natural Earth 110m coastline data. Natural Earth is in the
public domain and states that crediting is unnecessary. It is credited anyway, because a
product whose entire subject is provenance does not take an uncredited asset merely because it
is allowed to.

Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.

That line is one of the two citations Natural Earth itself suggests. The following sentences
are quoted verbatim from the Natural Earth Terms of Use,
https://www.naturalearthdata.com/about/terms-of-use/, read on 2026-09-21:

> "All versions of Natural Earth raster + vector map data found on this website are in the
> public domain."
>
> "You may use the maps in any manner, including modifying the content and design, electronic
> dissemination, and offset printing."
>
> "No permission is needed to use Natural Earth."
>
> "Crediting the authors is unnecessary."
>
> "The authors provide Natural Earth as a public service and are not responsible for any
> problems relating to accuracy, content, design, and how it is used."

Those are the sentences that were read and checked. The page carries more than them; nothing
else from it is reproduced here, because a quotation nobody verified is worse than a link.

The bundled payload is derived from that source rather than copied from it: the 110m coastline
layer is quantised, deduplicated, delta encoded, zigzag varint packed and base64 inlined by
`scripts/build-coastline.mjs`. What ships is 134 lines and 5,022 points, 13,796 bytes of binary
and 18,396 bytes as base64. `npm run coastline:check` fails if the committed payload is not
what that script produces from the source, so the derivation is auditable rather than asserted.

### No third party code

There are zero runtime dependencies and zero build dependencies. The matrix maths, the WebGL2
renderer, the minifier, the bundler and the four gates are all written for this repository, so
no third party copyright notice travels in the page. `src/globe/mat4.js` in particular is
written from the formulae rather than lifted from an existing library, for exactly that reason.

### Attribution this page gives that it is not required to give

The measurement technique is not original to this project. The browser method of opening a
connection, discarding the first response and taking the minimum of several warm requests on a
kept alive connection was established by
[gcping](https://github.com/GoogleCloudPlatform/gcping) (Apache 2.0), which also publishes the
Google Cloud region catalogue this repository snapshots. photontax is what you get when that
measurement is given a physical baseline and a verdict.

## License

MIT. Copyright (c) 2026 0xelitesystem.

The full licence text is in [LICENSE](LICENSE). The bundled Natural Earth data is public domain
and carries no licence obligation of its own; see Third party notices above.
