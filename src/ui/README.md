# src/ui  the page and the ten second reveal

DESIGN 5, 6.2, 6.3, 6.6 and the README outline in 8.2.

Nothing here imports the measurement engine or the renderer. The UI publishes ports and the
build fills them, so the page loads, states what is missing, and keeps every arithmetic feature
working when either of the other two is absent.

## The modules, in the order it is worth reading them

| file | what it is |
|---|---|
| `parts.js` | Sentences as an ordered list of prose runs and Claims, never as a string. `t()` REFUSES a prose run containing a digit, so a figure cannot reach a sentence without its badge |
| `dom.js` | The only place a number becomes an element. `claimNode()` stamps `data-claim-badge` before it writes the text. No `innerHTML`, anywhere, ever |
| `pairs.js` | Every foreground over background combination the page places, as data |
| `styles.js` | Generates the stylesheet FROM `pairs.js` and refuses to emit a pair `tokens.js` does not declare. Build time only; the page never imports it, so the banned colour registry never reaches the page |
| `wcag.js` | The relative luminance maths, for the browser self test. A second implementation on purpose; the reason is at the top of the file and a test pins the two together |
| `premeasurement.js` | The true, sourced fact a reader gets before clicking anything, recomputed from two bundled coordinates |
| `viewmodel.js` | The view model, built from the displayed integers so the bar always adds up |
| `maths.js` | Show the maths. Every intermediate term of the haversine, the constant as its two inputs, the seven raw samples, the subtraction |
| `selftest.js` | The checks the page runs on itself, including the two that need a live document |
| `reveal.js` | The choreography as data: the order of the three segments, the timings, the easing |
| `page.js` | Every element, and the state changes |
| `globeinput.js` | The scene handed to the renderer. An arc is a great circle and carries no intermediate point |
| `citypicker.js` | The one question this page asks, because it will not guess where you are |
| `ports.js` | The seam. Engine and renderer register here |
| `adapters.js` | Fills the ports from the other teams modules. Pure, so it is tested |
| `fixture.js` | The committed capture fixture behind `?fixture=1` |
| `main.js` | Bootstrap and state. The only module with a side effect |
| `hosts.js` | Every host the page can contact, printed on screen, equal by test to what the gate enforces |

## The rules that shaped all of it

1. **No figure without a badge.** Proven three ways: `t()` refuses one at construction, the build
   gate scans the assembled page, and the shipped self test walks the rendered document.
2. **The DOM is authoritative and the canvas is decorative.** The result is a real table.
3. **Nothing touches the network until the button is pressed**, and the exact request count and
   the full destination list are on screen before it.
4. **Every empty state is stated.** No spinner, no zero, no blank cell.
5. **Contrast by arithmetic**, in both themes, by script, never by eye.

## Testing

`test/ui.test.js`, with `test/helpers/minidom.mjs`. The last suite in that file executes the
script inside the shipped `index.html` and drives the fixture reveal through it, which is the
difference between the code being right and the file we ship being right.
