# photontax working guide

How to run it, how to read the three numbers, and the situations it was built to settle. The page
is chapters 1 to 8; the command line, `npx photontax`, is chapter 9.

Every figure quoted in this guide comes from the committed capture fixture in `src/ui/fixture.js`,
from the constants in `src/core/constants.js`, or from the plan and exit codes the command line
prints, so all of it is reproducible from a clean clone by `npm test`. None of it is anyone's
private measurement. The numbers you will see on your own screen are your own, and nothing else
is.

---

## 1. What it does

photontax measures the warm HTTPS round trip from your own machine to public cloud regions and
splits every result into three parts: the time light in fibre physically needs for that distance,
the fixed cost of your own connection, and the surplus your route adds.

## 2. Why it exists

A latency figure is at least three costs added together and they have nothing to do with each
other: the distance, which is physics; your access link, which is your provider's; and the path,
which is somebody's routing. Every other latency tool hands you one number for the three, so
optimising the wrong one is the default outcome. The split exists to end that argument in about
ten seconds, and the part you can actually change is the only part worth a ticket.

## 3. Quickstart

There is nothing to install. The whole tool is one HTML file.

- Live: https://0xelitesystem.github.io/photontax/
- From a clone: open `index.html`. That is the entire procedure.
- From a terminal, on Node 22 or later: `npx photontax --help`. Chapter 9 covers it.

**Before you touch anything** the page has already told you something true, computed from two
bundled coordinates with no network at all: the great circle distance between two cloud regions
and the round trip that light in glass cannot beat over it. The shipped pair is Ashburn, Virginia
to Mumbai.

**Press "Measure my floor".** The page asks which city you are nearest, because it does not look
you up and it never will. Pick one of the 39 cities in the bundled table. Then it makes a small
timed request to each of the twelve measured cloud endpoints and prints one row per region. This
is the committed capture fixture:

| region | distance | round trip | physics | access | route | ratio |
|---|---|---|---|---|---|---|
| Mumbai `ap-south-1` | 12855 km | 251 ms | 126 ms | 9 ms | 116 ms | 1.92x |
| Tokyo `ap-northeast-1` | 10871 km | 185 ms | 107 ms | 9 ms | 69 ms | 1.65x |
| Sydney `ap-southeast-2` | 15674 km | 205 ms | 154 ms | 9 ms | 42 ms | 1.27x |
| Sao Paulo `sa-east-1` | 7665 km | 124 ms | 75 ms | 9 ms | 40 ms | 1.53x |
| Frankfurt `eu-central-1` | 6549 km | 92 ms | 64 ms | 9 ms | 19 ms | 1.29x |
| N. Virginia `us-east-1` | 0 km | 9 ms | 0 ms | 9 ms | 0 ms | no ratio |

That is the committed capture fixture: TCP connect minimums recorded once from a machine in
Virginia, with the physics computed from the Ashburn, Virginia city centre as the observer point.
`npm test` reproduces it cell for cell from `src/ui/fixture.js`. A live run times warm HTTPS
round trips from your own machine, so yours will have different numbers and the same shape.

Add up any row and you get its total. That is a rule the code enforces, not a courtesy: the three
parts are apportioned to whole milliseconds by largest remainder so the printed integers sum
exactly to the printed total, and the view model validator refuses a row where they do not. If
you add up a row on screen and get something else, the tool is broken and you have correctly
concluded so.

Two more buttons, both worth pressing on the first visit:

- **Show the maths** reprints every term of the calculation, recomputed live rather than recalled:
  the constant, the group index, the speed in fibre, the haversine, the floor, the samples, the
  access baseline and the subtraction.
- **Run the self test** runs twelve checks in your browser against the run you just took, and
  prints a pass or fail line for each, including the faster than light screen, the decomposition
  identity, and the WCAG contrast arithmetic over the theme you are looking at.

Outside the browser:

```
npm test              939 tests, no dependencies, no browser
npm run gates         the four build gates and their positive controls
npm run verify        both, plus the coastline, fixture, physics and build checks
npm run physics:check the constant and two published great circles, offline
npm run physics:live  the same, then measures THIS machine against the twelve endpoints
```

### The three numbers, and what each one is for

Take the Mumbai row above. Of 251 milliseconds:

- **126 ms is physics.** Two times the great circle distance, divided by the speed of light in
  single mode fibre. No deployment decision will ever move it.
- **9 ms is access.** The fixed cost of the connection itself, the same 9 ms it pays to every
  destination on the list. On your own run it belongs to your last mile, not to anything you
  built.
- **116 ms is route.** The only part anyone can do anything about.

Three numbers, three different tickets, three different places to send them.

The ratio is `(round trip minus access) / floor`, and the verdicts are published rather than
asserted:

| ratio | verdict |
|---|---|
| at or below 1.15 | You are at the floor. This will not get faster without moving the service closer. |
| at or below 1.6 | Normal. Your route is roughly the shape of the cable, not the great circle. |
| above 1.6 | Your path is materially longer than the geography requires. |

Below 500 km of separation no ratio is rendered at all, only absolute milliseconds. The
`us-east-1` row shows why. In the fixture it shares the observer city centre, so its floor is
0 ms and a ratio would be a division by zero. A little further out it is merely absurd: the test
suite's short row, 55.6 km away with a 12 ms round trip on a 0.54 ms floor, reads as 22.04x if
you do not measure and subtract the access baseline. Measuring it returns that row to 1.00x by
construction, and the endpoint that set the baseline carries a route surplus of exactly zero.

## 4. Use cases

### 4.1 Choosing a cloud region for a user population

**Situation.** You are deploying a service and the region list has forty entries. Someone has
already said "just use us-east-1" and someone else has already said "put it closer to the users",
and neither of them has a number.

**What you do.** Open the page from a machine on the same continent as the users you care about,
or ask a colleague in that city to open it and screenshot the table. Pick their nearest city in
the picker. Read the `physics` column, then the `route` column.

**What you learn.** The `physics` column is the hard floor for each candidate region from that
population, and it is the same for everybody regardless of provider, carrier or budget. The
`route` column tells you which of the candidate regions currently has a path worth having. A
region that is 1,000 km further away but sits at 1.15x can easily beat a nearer one at 2.0x.

**The action it leads to.** Shortlist on `physics`, because that is the part that cannot be fixed,
then choose among the shortlist on `route` and re-measure in a month before you commit. Write the
floor into the design document, so the next person to ask "why not the nearest region" gets an
arithmetic answer.

### 4.2 Deciding whether a slow API is the network or the code

**Situation.** Users in Singapore say the app is slow. Your dashboard says server processing is
40 ms. Somebody is wrong and the argument has been running for two days.

**What you do.** Have someone in Singapore open the page, pick Singapore, and measure. Read the
Singapore row, and read the whole `round trip` column against the `physics` column.

**What you learn.** The floor between those two points is a number no amount of code can go under.
If the floor is already most of the user-visible latency, the code is not the problem and the
40 ms server figure is honest. If the route surplus is large and the floor is small, the transit
path is the problem. If both are small and the app still feels slow, the time is being spent
somewhere neither of these numbers covers, which is usually the number of round trips rather than
the length of one.

**The action it leads to.** Three different tickets, and this tells you which one to open:
re-architect (physics), talk to the network (route), or profile the application (neither). It also
kills the fourth option, which is optimising the server for a problem that was never on the
server.

### 4.3 Proving to a vendor that the route and not the distance is the cost

**Situation.** Your provider or transit vendor says the latency is "just distance" and there is
nothing to do. You believe them less than they would like.

**What you do.** Run a measurement, screenshot the table, and press "show the maths" so the
screenshot includes the recomputed terms. Send both.

**What you learn.** The floor is arithmetic from two coordinates and one published physical
constant, so it is not a position that can be negotiated. The row separates what the geography
costs from what their path adds, and the ratio column states the surplus as a multiple rather than
as an opinion.

**The action it leads to.** Take the conversation from "it is slow" to "this path is 2.05x the
geography while the same distance elsewhere on your network is 1.3x". That is a question with an
answer. It also tells you when to stop pushing: a row already at or below 1.15x is inside the
geometry of cable itself and there is nothing for them to fix.

### 4.4 Setting an honest latency budget or service level objective

**Situation.** Someone has proposed a 100 ms p99 for a global service, and the number came from a
competitor's marketing page rather than from geometry.

**What you do.** Pull the floor for every region pair the service actually spans. The page does
this live for the region you are measuring from; the arithmetic is `9.7948 ms per 1000 km of
great circle separation`, round trip, so you can do the rest on paper.

**What you learn.** Whether the proposed budget is physically possible at all. New York to London
is 5570.2 km, a floor of 54.56 ms round trip, before a single byte is processed. Los Angeles to
Tokyo is 8819.4 km, a floor of 86.38 ms. A single-region 100 ms global p99 that includes either of
those pairs is not an ambitious target, it is an arithmetic error.

**The action it leads to.** Either set the budget per region rather than globally, or change the
architecture so the request does not cross that distance, which usually means regional replicas or
edge termination. Put the floor in the SLO document next to the target, so the target is defended
by arithmetic and not by whoever argues hardest.

### 4.5 Checking whether a CDN or a private backbone is worth paying for

**Situation.** A vendor is quoting for a premium network product on the promise of lower latency.
The quote has a percentage in it and no baseline.

**What you do.** Measure before you buy, and record the `route` column and the ratios. Measure
again from the same machine and the same picked city after the trial is live.

**What you learn.** The most that any network product can ever return is the `route` number, and
not all of it. Physics is not for sale and access is your own last mile, which the vendor does not
touch. If a region sits at 1.15x, the route surplus is near zero and there is nothing left for the
product to win there, however good it is. If it sits at 2.0x, roughly half of that round trip is
in play.

**The action it leads to.** Compute the vendor's best case as a fraction of user-visible latency
before the meeting, not after the invoice. Evaluate the trial against the `route` column only, and
treat any claimed improvement larger than the route surplus as a measurement error somewhere.

### 4.6 Teaching a team why a number cannot go below a floor

**Situation.** An engineer, or a stakeholder, keeps asking for a latency target that light cannot
meet. Explaining it in a meeting has not worked twice.

**What you do.** Share the link and let them press the button themselves, or run it in the room.
Start on the pre-click line, which needs no network at all, then press "show the maths".

**What you learn.** They learn it, rather than being told it. The page recomputes every term in
front of them: the SI definition of the metre, the fibre group index, the division, the haversine,
the floor. Nothing is asserted and nothing is recalled from a cache.

**The action it leads to.** The conversation moves from "make it faster" to "move it closer or
send fewer round trips", which are the two things that actually work. Bookmark the page in the
team channel; it is the cheapest way to stop the same meeting happening a third time.

### 4.7 Triaging your own connection before you blame anything else

**Situation.** Everything feels slow today, from every service, and you do not know whether it is
you, your office, or the internet.

**What you do.** Measure, and read the `access` column, which is the same value on every row.

**What you learn.** The access baseline is the minimum, over every measured endpoint, of `round
trip minus that endpoint's floor`. It is the fixed cost of your own connection, paid to every
destination on earth. On a healthy wired connection it is single digit milliseconds. If it is
40 ms, the problem is on your side of the connection rather than at any destination, and nothing
will be fast today regardless of where it is.

**The action it leads to.** A high access baseline is a ticket for your own ISP or your own office
network, and it is the one measurement that tells you to stop investigating the remote service
entirely. A normal baseline with a bad route column points the other way.

### 4.8 Spotting a latency claim that is impossible

**Situation.** A dashboard, a status page or a vendor benchmark shows a round trip to a distant
region that seems too good. You suspect an anycast address is answering from somewhere nearer than
the label says.

**What you do.** Compare the claimed number against the floor for that distance, which the page
computes for you. Or measure the same endpoint yourself and press "run the self test".

**What you learn.** The faster than light screen is the check that matters here, and it is not
hypothetical. An anycast address answers from whichever node is nearest the caller, so a result
attributed to a region on the other side of the planet can come back in less time than light needs
to cross the distance. That is not a fast network, it is a measurement of somewhere else. Any such
row is dropped before the access baseline is taken, counted, and named as a defect. It is never
averaged in and never clamped, because one of them inside the baseline step would drag the
baseline negative and quietly corrupt every other row on the page.

**The action it leads to.** Stop trusting the label on that endpoint. Either the address is
anycast, or the region attribution is wrong. Either way, a benchmark built on it is measuring a
different facility from the one it names.

### 4.9 Demonstrating it with no network, or on a locked-down one

**Situation.** You want to show this in a talk, in a recorded video, or on a corporate network
where outbound requests to other sites are blocked. Or you are debugging a network that is already
down, which is exactly when a latency tool is most useful and least likely to work.

**What you do.** Add `?fixture=1` to the address. For a clean capture with no chrome, add
`&clean=1`.

**What you learn.** The page loads the committed capture fixture instead of measuring, so the table
is frame identical today and in two years regardless of whose connection is in the room. A banner
says so in plain words, because the one way this product fails completely is a reader believing a
figure that is not about them. The fixture holds TCP connect minimums recorded once from a
machine in Virginia, every figure built from them is labelled as a fixture figure rather than a
warm HTTPS round trip, and no samples are shown because none were published. Those minimums are
the only thing taken from the fixture: every distance and every floor is still recomputed live,
from the Ashburn, Virginia city centre as the observer point, by the same haversine and the same
constant a real run uses.

Everything except the measurement works with the network completely down anyway. The globe, the
great circle distance, the floor, the constant and the self test are all arithmetic over data
already in the file.

**The action it leads to.** Record the demo once and it stays correct. On a blocked network,
demonstrate the arithmetic half and say plainly that the measurement half needs outbound requests.

## 5. Getting the most out of it

**Read the `access` column before anything else.** It is the same number on every row, and it is
the one that tells you whether this run is worth reading at all. A large access baseline makes
every route figure on the page less interesting, because you are looking at your own last mile.

**Take more than one run, at more than one time of day.** A single run is a single sample of a
path that changes. The tool takes seven warm samples per endpoint and reports the minimum, which
removes local noise, but it cannot remove the fact that routes change hourly.

**Believe the unstable rows.** If the seven warm samples for an endpoint spread more than 30 ms
apart, the row reports its spread instead of a single number. That is not a failure to measure, it
is a refusal to print a confident figure the samples do not support. An unstable row is itself the
finding: that path is not merely slow, it is inconsistent, which is worse for a user.

**Do not read a ratio under 500 km, because there is not one.** Below that separation a fixed
access cost sitting on a near zero floor produces an artifact, not a result. The page shows
absolute milliseconds only, deliberately.

**The URL flags are the non-obvious feature.** `?fixture=1` loads the committed fixture and shows
a banner, `?clean=1` strips the page down for a capture, `?replay=1` drives the globe for a
recording. They are read from the address only and never from storage, so one URL is the whole
configuration for a screenshot script.

**Press "show the maths" at least once, and read it.** Most people press the button, read the
table and leave. The maths panel is where the tool stops being a number and starts being something
you can reuse: `9.7948 ms per 1000 km` round trip is a figure you can apply on paper to any pair
of coordinates you like, forever, with no tool at all.

**Every value on screen carries one of four badges, and the badge changes what the number means.**
MEASURED means your own machine did it. REPORTED means a third party stated a fact about itself.
COMPUTED means arithmetic from a constant and a coordinate, reproducible offline. INFERRED means a
model, with its assumptions printed before the number. A number without a badge cannot be rendered
at all: the value type throws on every implicit path to text, and the build fails on any digit in
the page that is not inside an element carrying a badge.

**The tool is honest about the one thing everyone gets wrong.** Region coordinates are INFERRED,
always. A provider publishes a city or an area, not a building, so the floor is a floor for the
CITY. Microsoft publishes 37.3719, -79.8164 for its own `eastus` region and "Virginia" as that
region's physical location; that point is 275.6 km from Ashburn, and the page recomputes that
distance in front of you with the same haversine it uses everywhere else.

**The bundled table is larger than what gets measured.** 56 region rows ship with coordinates; 12
of them have a measurement host and are timed. The other 44 are there so their cities can be
picked as your own location and so the catalogue is auditable. 22 further regions were cut entirely
because the provider published no single city for them, and the cut list ships in the repository
rather than in a commit message.

## 6. What it does not do

- **The measured number is not an ICMP round trip.** It is a warm HTTPS round trip, and it contains
  transport, TLS record processing and server think time. It is not a network layer measurement,
  the page never calls it one, and the build fails on both of those words.
- **Region coordinates are city centres, not buildings.** Every floor derived from one is a floor
  for the city. The same is true of the point you pick for yourself: it is a city centre, not your
  desk.
- **It cannot tell you which cable your connection used,** or the path it followed, or the machines
  along the way. A browser has no raw sockets and no ICMP, and there is no TTL control anywhere in
  the platform. For any cross origin resource without a `Timing-Allow-Origin` header, the Resource
  Timing specification zeroes the connection, DNS and TLS timestamps; none of the measured
  endpoints sends that header, which was checked before they were chosen. The page cannot even
  separate name resolution from TLS.
- **It does not geolocate you.** IP geolocation returns a national fallback centroid for a large
  share of addresses, so the page asks instead. Your answer never leaves the browser.
- **The facility code has no coordinate behind it.** The serving edge reports a three letter code
  for the connection it terminated, and that is REPORTED and shown. No catalogue of facility
  coordinates was available from a source the page may both read and redistribute, so the table of
  them ships empty and you pick a city. Substituting the airport of the same name would be a
  fabricated coordinate wearing an honest badge.
- **It does not split the round trip by direction.** A round trip is one number covering two paths
  that are frequently different. The page says "round trip" every time and never claims one leg.
- **It says nothing about submarine cables.** No cable geometry, no shore terminations, no counts,
  no lengths, anywhere in the product.
- **It is one vantage point.** Your machine, your connection, at one moment. It is not a
  measurement campaign and it does not claim to represent your users unless your users are sitting
  where you are.
- **The 1.13 route factor is not displayed anywhere,** even though it is the derivation behind the
  1.15 verdict threshold, because the script that derives it does not ship yet. A number whose
  derivation a reader cannot run is a number to cut.

## 7. Troubleshooting

**Every row comes back refused and nothing is measured.** A privacy extension, a corporate policy
or a browser setting that blocks requests to other sites will each do this, and a page cannot tell
them apart, so the notice on screen states all of them rather than picking one. Nothing is shown as
measured, because nothing was. Try a different network or a browser profile with no extensions.

**One row failed and the rest worked.** Read the reason sentence on the row. The four that occur in
practice are a generic network error (which covers an extension, a policy and an unreachable host,
indistinguishable from inside a page), a timeout, fewer warm samples than the method requires, and
a response that began and could not be read to completion. None of them produces a number, because
a partial set would be a different measurement wearing the same name.

**A row shows a spread instead of a number.** Its seven warm samples spread more than 30 ms apart.
That is the correct output for an unstable path. Run it again; if it stays unstable, that is the
finding.

**A row was dropped as faster than light.** The round trip came back shorter than light needs in
fibre to cover that distance twice, so the distance, the number, or both are wrong. The usual cause
is an anycast address answering from a facility the coordinate does not describe. It is reported as
a defect and used in no total.

**The serving facility is not reported.** The trace endpoint did not answer. The page does not look
your address up instead. Pick your city and every distance is computed from that choice and
labelled as your choice.

**The globe never appears.** It is a separate same-origin file fetched two animation frames after
the page mounts, and it is decorative. Before it lands, and on a browser that never gets it, there
is a drawn placeholder at the size it will take plus a sentence saying what happened, so the page
does not move under you. The result is the table; nothing about the globe's absence affects a
single number.

**Your ratios look worse than the ones in the README.** Expected, and not a defect. The published
rule of thumb from the literature is to multiply line of sight distance by 2.1, and a well
connected machine sits below that while a worse connection sits above it. A result above 2.1x from
a poor access network is unremarkable. The only result that would be remarkable is one below 1.00x,
and that is the one the faster than light screen refuses to publish at all.

**Nothing happens when you press the button.** Check that you answered the city picker. The
measurement cannot start without an observer coordinate, because there is nothing to compute a
floor from.

## 8. How to verify the numbers yourself

**In the page, press "Run the self test".** It runs against the run you just took and prints a pass
or fail line for each of twelve checks: the constant recomputed, the floor identity to four
decimals, five great circles with closed form answers (including a point against itself, pole to
pole, and a quarter of the equator), the published `eastus` coordinate against Ashburn, an
antipodal sanity bound, the faster than light screen, the decomposition identity on every row, the
access baseline rule, the 500 km distance gate, sample stability, provenance completeness (zero
unbadged figures), and WCAG contrast computed from the custom properties the browser actually
resolved in the theme you are looking at.

**Offline, check the physics:**

```
npm run physics:check
```

It recomputes the constant longhand from the two cited primary sources and reproduces two published
great circles from their coordinates. On this tree it prints `v in fibre 204190.47677 km/s`, `floor
per 1000 km round trip 9.7948 ms`, `New York to London 5570.2 km, floor 54.56 ms` and `Los Angeles
to Tokyo 8819.4 km, floor 86.38 ms`, each against its published value, and it verifies that the
shipped haversine and the independent one agree to 1e-9 km.

It also prints a NOTE that is worth reading rather than skipping: Los Angeles to Tokyo is 8819.4 km
against the coordinate the design used and 8815.5 km against the Wikidata coordinate the product
ships. The two candidate points for Tokyo are 4.017 km apart and the floors differ by 0.0383 ms.
That disagreement is not an error to be tidied away, it is the INFERRED label doing its job. At the
whole millisecond this product renders, it disappears entirely, which is both the honest reason it
does not matter here and the honest reason not to trust any floor to more precision than that.

**Live, check the floor against the world:**

```
npm run physics:live
```

This measures your machine against the same twelve endpoints using a different client from the
page's, and decomposes the result with arithmetic written again from scratch. It prints a table
with the columns `region  distance  floor  measured  naive  access  route  ratio`, then the access
baseline, the rows measured, the count dropped as faster than light, and the min, median and max
ratio over the rows above 500 km. It then asserts that every reported row is slower than light for
its own geography, that the access baseline is not negative, that the endpoint which set the
baseline carries exactly zero route surplus, and that the median ratio falls inside the band the
design requires. Those are your numbers, about your connection, and they are the only ones on the
page that are.

**Check the whole build:**

```
npm test          939 tests on this tree, all passing
npm run gates     vocabulary, badge completeness, contrast by math, declared hosts
npm run verify    both, plus coastline, fixture, physics and build checks
```

Each gate carries positive controls that run on every invocation, and the test suite asserts that
each one exits non zero when it should, because a gate nobody has watched fail is not a gate.

**Check what it can contact.** The page makes no network request at all until you press the button.
When you do, it contacts thirteen hosts and nothing else: `www.cloudflare.com` once, to read which
facility served you, and twelve `dynamodb.<region>.amazonaws.com` endpoints, timed. The browser is
told to refuse everything else by a Content-Security-Policy `connect-src` allowlist in the page
head, and `npm run gates` fails if the set of hosts reachable from the code and the set declared in
that policy differ in either direction, so the list cannot quietly grow. Each timed request sends no
credential and its response is discarded; only the wall time is kept, in your browser, until you
close the tab. The one thing stored on your device is which theme you picked. The command line
contacts only the twelve `dynamodb` hosts, only from `photontax measure`, and never the
Cloudflare endpoint; `photontax plan` lists them without contacting anything, and chapter 9 has
the rest.

**Check that the committed page is what the source produces:**

```
npm run build -- --check
```

`index.html` and `assets/globe.js` are both generated and both committed. The check fails if either
is not what the modules under `src/` produce.

**Regenerate the inputs rather than trusting them:**

```
npm run endpoints:check   fail if the committed region table has drifted from the live catalogues
npm run coastline:check   fail if the committed coastline is not what the Natural Earth source produces
npm run fixture:check     fail if the committed measurement fixture is not what the script produces
npm run globe:validate    recompute every geometric figure the globe relies on
```

## 9. Command line

### 9.1 What it does

`photontax` is the page's own engine, run from a terminal on Node 22 or later. `measure` makes
the same warm HTTPS measurement the page makes, from the machine it runs on, and splits every
result into physics, access and route with the same arithmetic. The other commands are offline:
the cities it knows, its exact plan, the floor between any two bundled places with every term
printed, its own self test, and its sources.

```
npx photontax                                      one offline fact, then a pointer to --help
npx photontax measure --city "Ashburn, Virginia"   measure from this machine
npx photontax cities                               the cities --city accepts
npx photontax plan                                 what measure contacts, and how many requests
npx photontax floor London Tokyo                   the physics floor between two bundled places
npx photontax selftest                             the offline checks
npx photontax sources                              every data source and its attribution
```

Every command takes `--json` (one document for a program, schema `photontax.cli/1`) or `--plain`
(one complete sentence per figure, for a screen reader or a log), and `--no-color`. `--help`
lists everything, including the exit codes: 0 done, 1 a named failure, 2 a usage error, 130
interrupted.

### 9.2 Why it is useful

The page answers for the machine a person is sitting at. Most of the machines that matter are not
that one: the server you are about to rent, the build runner that times out, the office network
behind a security appliance. A terminal reaches all of them, over SSH and inside a CI job,
with no browser and no display.

A Node process can also see what a page cannot, and the command line reports it with the same
badges as everything else:

- **Proof that the method held.** Every warm sample must ride the connection its warm up opened,
  and the socket says on each request whether it did. An endpoint where one did not is reported
  as not measured, never as a figure. The page can only assume this.
- **The connection phases** of each warm up connection: DNS lookup time, TCP connect time, TLS
  handshake time, the connected address and the TLS version, one sample each. They sit beside
  the round trip and are never subtracted from it.
- **A reason for every failure.** A name that did not resolve, a refused connection, a certificate
  that failed its check, a redirect, a time limit: each has its own sentence, where a browser
  hides the cause.

### 9.3 How to use it well

**Name the right city.** `--city` is required because photontax never looks anyone up, and every
floor is computed from the city you name. Run `photontax cities` and pick the nearest bundled
city to the machine, not to you. Over SSH to a server in Frankfurt, the answer is Frankfurt. A
wrong city moves every floor, and with it every access and route figure.

**Run `photontax plan` first on a machine you do not own.** It prints exactly what `measure` will
contact without contacting it: 96 HTTPS GET requests, 8 to each of the 12 AWS DynamoDB regional
endpoints, 4 endpoints at once, no request allowed more than 8000 ms, no retries, and at most
192000 ms on the network in all. If a firewall policy or a change ticket needs the host list,
this is it.

**Read the access line before the rows.** It is the same on every row. On a laptop it is your
own last mile; on a server it is that machine's own connection. It is paid on every row, so a
large one says the machine's own connection is the first thing to look at, before any
destination.

**Believe the unstable rows and the notices.** An endpoint whose seven warm samples spread more
than 30 ms apart prints its spread, not a figure. A notice about a proxy setting, an extra
certificate authority, or a TCP connect time below the floor is the report telling you what it
could not rule out.

**Keep the JSON when you want a record.** `--json` carries every figure with its badge, method
and display text, and every absent figure with its reason. It does not carry a timestamp, so put
the date in the file name. Values are at display precision, the same whole milliseconds the text
shows.

**Use the exit code, not the figures, to gate a script.** 0 means the run finished and its own
self test passed; 1 means a named failure. Figures move with the time of day; a threshold on
them fails for reasons that are not yours.

**Run it once, not in a loop.** Each run is 96 requests to someone else's public endpoints.
There is no repeat option on purpose. Two runs at different times of day tell you more than
twenty in a row.

### 9.4 Use cases

#### 9.4.1 Choosing a region for a VPS that talks to a cloud region

**Situation.** You are renting a small server that will call a cloud database or API in one
region, and the provider offers you several locations. The sales page lists them by city and
says nothing about the path to where your data lives.

**What you do.** Rent the cheapest trial instance in each candidate location, or use ones you
already have. On each, run `npx photontax measure --city <that location's city>` and keep the
output. Before you rent anything, `npx photontax floor <candidate city> <region code>` prints the
floor from each candidate to the region you depend on, offline, with the arithmetic.

**What you learn.** The `physics` figure is the hard minimum for each candidate, the same for
every provider. The `route` figure is what that location's network currently adds on top. The
access line is the instance's own connection cost, which can differ between providers in the
same city.

**The action it leads to.** Shortlist on physics, choose on route and access, and write both into
the decision so the next person does not repeat the argument. A location that is further on the
map but sits at the floor can beat a nearer one with a long route.

#### 9.4.2 Checking a CI runner

**Situation.** A build that calls a cloud API is slow or flaky on the hosted runners and fine on
your laptop, and nobody can say whether the runner's network is the difference.

**What you do.** Add one job step, run by hand or on a schedule rather than on every commit,
naming the city the runner is documented to be in, or the nearest bundled one:

```
npx photontax measure --city "<city>" --json > photontax-$(date +%F).json
```

Keep the file as a build artifact, and run the same command on your laptop with your own city.

**What you learn.** The report says "this machine's access cost", and on a runner that is the
runner's. Compare the access line and the route column of the two files. If the runner's access
cost is large, every call it makes pays it; if its routes are long to the region your build
calls, that region is the problem, not your code. If the run itself fails, the reason sentence
says whether the name did not resolve, the connection was refused, or a certificate failed.

**The action it leads to.** Move the job to a runner in another location, move the dependency to
a region the runner reaches well, or stop suspecting the network and profile the build. Gate the
job on the exit code only.

#### 9.4.3 Spotting a local proxy or middlebox

**Situation.** You suspect the office network, a VPN client or a security appliance is ending
connections locally and inspecting them, and you would like evidence rather than a feeling.

**What you do.** Run `measure` with the city the machine is in, and read the connection phases,
then the notices.

**What you learn.** Three things can each point at something between this machine and the
endpoints. A TCP connect time below the physics floor to a distant endpoint is something light in
fibre cannot do, so the report replaces the figure with a notice: a device near the machine
answered the connection. `NODE_EXTRA_CA_CERTS` being set earns its own notice, because a local
interception authority can end TLS near the machine. And a warm sample that did not ride its warm
up connection fails that endpoint with a stated reason, which a connection pooling or
rewriting device can cause. The connected address of each endpoint is printed as text, so you can
compare it with what your own resolver reports for the same name.

**The action it leads to.** If the notice appears, every latency figure from that network is a
measurement of the device, not of the internet, and should be taken from outside it. If it does
not appear, the connections were not answered below the floor, which rules out the simplest
explanation and moves the question elsewhere.

#### 9.4.4 Comparing two networks

**Situation.** Wired office connection or the phone hotspot; the old ISP or the new one; with the
VPN or without it. Each has an advocate and nobody has two sets of numbers from the same machine.

**What you do.** On the same machine, with the same `--city`, run it once on each network:

```
npx photontax measure --city "<city>" --json > network-a.json
npx photontax measure --city "<city>" --json > network-b.json
```

**What you learn.** The physics column is identical in both files by construction: same
coordinates, same constant. Everything that differs is the network. The access line compares the
two connections' own fixed cost; the route column, row by row, compares what each network's
routing adds on the way to the same twelve endpoints. In each file,
`.accessBaseline.value.value` is the access figure in milliseconds, and
`.endpoints[] | {region, route: .route.value}` lists the routes for `jq`; a route that is not
shown is `{"suppressed": true, "reason": "..."}` rather than a number.

**The action it leads to.** Choose the network on the figure you care about. A lower access cost
helps every destination; a shorter route helps only the regions it is shorter to. Run both again
at another time of day before you sign anything.

#### 9.4.5 Putting a floor into a design document, with no network at all

**Situation.** A design review wants a latency target for a service in one region used from
another, and the proposed number came from a slide.

**What you do.** `npx photontax floor London Tokyo` prints the great circle between the two
bundled city centres and the round trip floor over it, with every term: the haversine, the
constant, the division. `photontax floor` takes a city from `photontax cities`, or any bundled
region by its id or region code, such as `photontax floor "Ashburn, Virginia" eu-west-2`. Add
`--plain` for sentences you can paste.

**What you learn.** Whether the target is physically possible before anybody measures anything.
No cable can beat the floor, and the output says why in arithmetic a reviewer can redo by hand.

**The action it leads to.** Paste the floor and its working next to the target. A target under the
floor is not ambitious, it is an arithmetic error, and the document now says so on its own.

### 9.5 When something looks wrong

**`measure` refuses to run.** `NODE_TLS_REJECT_UNAUTHORIZED` is set to `0`, which turns
certificate checking off. photontax never measures over a connection it has not verified. Unset
it; the exit code is 1 and nothing was contacted.

**A notice says a proxy is set.** `HTTPS_PROXY`, `HTTP_PROXY`, `NODE_USE_ENV_PROXY` or a relative
is set. photontax never uses a proxy, because timing through one would time the proxy, so it went
direct. On a network that allows nothing but the proxy, every endpoint then fails with a stated
reason, and that is the correct result: there is no direct path to measure.

**Every endpoint failed.** Read the reason sentences. A name that did not resolve points at DNS; a
refused or timed out connection points at a firewall that blocks outbound HTTPS to these hosts.
Nothing is shown as measured, and the exit code is 1.

**A usage error.** The sentence on stderr names the problem and the exit code is 2. The usual one
is a city that is not bundled: `photontax cities` lists them all, and the match is exact apart
from letter case.

**The figures differ from the page on the same machine.** Expected. The command line measures
HTTPS over TCP from Node, offering HTTP/1.1 only; a browser may negotiate a newer protocol through
a different client stack. The report says so above its first figure.

### 9.6 What the command line does not do

- **It does not look anyone up.** No location service, no address lookup, and no request to the
  Cloudflare endpoint the page reads. The observer point is the city you name, and it never leaves
  the machine.
- **It does not place an address on a map.** The connected address is REPORTED by DNS and printed
  as text. Your own address is never asked for, printed or stored.
- **It writes no file.** Output goes to the terminal, or wherever you redirect it.
- **It does not retry, repeat or run in the background.** One run, one plan, printed first.
- **It does not measure the path.** Like the page, it times round trips and splits them. It names
  no machine between here and there, and it never splits a round trip by direction.
- **It does not replace the page.** The page shows the same split for the machine a person is
  sitting at, with the globe and the maths panel; the command line is for the machines nobody is
  sitting at.

---

## Related

[auditrail](https://github.com/0xelitesystem/auditrail) is built on the same rule applied to a
different subject: read what is already on disk, price or measure it with a stated method, print
the method next to the figure, and refuse to publish anything the reader cannot recompute. If
auditrail's tool reliability finding shows repeated timeouts on network-touching tool calls,
photontax is how you find out whether the floor, your access link or the route explains them.
