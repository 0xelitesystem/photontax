// THE NEVER CLAIMED REGISTRY. DESIGN 2.5, DESIGN 7.4, traps 4, 8, 15, 17 and 20.
//
// DESIGN trap 15 names language drift as the single biggest risk in the whole project, and
// says it will happen during copywriting, not during coding. That is why this list is code and
// not a style note: scripts/gate-vocabulary.mjs fails the build on any of it.
//
// THIS FILE IS THE ONE PLACE IN THE REPO THAT IS ALLOWED TO CONTAIN THESE TERMS, because it is
// the registry of what is forbidden. scripts/gate-vocabulary.mjs excludes exactly this file and
// the gate fixture directories, and nothing else. Every other file under src/, docs/ and
// README.md is scanned in full.
//
// Nothing here is softened. DESIGN trap 20 is explicit: a claim that cannot be supported is
// cut, not reworded into something vaguer that means the same thing.
//
// Isomorphic: no node:* imports and no DOM.

/**
 * @typedef {Object} BannedRule
 * @property {string} id Stable identifier, quoted in the gate failure message.
 * @property {RegExp} pattern Global, case insensitive where that is safe.
 * @property {string} designRef The section or trap that bans it.
 * @property {string} why One sentence a person can act on.
 */

/**
 * Literal strings that are legitimate proper nouns and must never be treated as a violation.
 * They are masked out of the text before the patterns run.
 *
 * gcping is the reason this list exists. DESIGN 1 requires the README to name and credit the
 * gcping project explicitly, and DESIGN 3 sources the Google region list from it. A word
 * boundary alone already protects most of these, but masking them first means the gate cannot
 * be broken by someone later relaxing a boundary, and it documents the intent.
 */
export const PROPER_NOUN_EXCEPTIONS = Object.freeze([
  'GoogleCloudPlatform/gcping',
  'global.gcping.com',
  'gcping.com',
  'gcping',
  'cloudpingtest.com',
  'cloudpingtest',
  'cloudping.me',
  'cloudping',
]);

/**
 * The banned vocabulary. DESIGN 7.4 lists the grep; DESIGN 2.5 gives the reason for each.
 * @type {readonly BannedRule[]}
 */
export const BANNED = Object.freeze([
  Object.freeze({
    id: 'traceroute',
    pattern: /\btrace ?routes?\b/gi,
    designRef: 'DESIGN 2.5, trap 15',
    why: 'A browser has no raw sockets, no ICMP surface and no TTL control. The Resource Timing '
      + 'spec additionally zeroes every connection phase field for a cross origin resource with '
      + 'no Timing-Allow-Origin header, and none of the measurement endpoints send that header, '
      + 'so this tool cannot even separate name resolution from TLS. The claim is impossible, '
      + 'not merely unimplemented.',
  }),
  Object.freeze({
    id: 'icmp-round-trip-words',
    pattern: /\bpings?\b|\bpinging\b|\bpinged\b|\bRTTs?\b/g,
    designRef: 'DESIGN 2.1, trap 4',
    why: 'The measured quantity is a warm HTTPS round trip. It contains transport, TLS record '
      + 'processing and server think time. Calling it by either of these names states a smaller '
      + 'and cleaner number than the one that was actually taken, which is an error in the '
      + 'flattering direction. Use "warm HTTPS round trip". The proper nouns gcping, '
      + 'cloudping.me and cloudpingtest are masked before this rule runs.',
  }),
  Object.freeze({
    id: 'hop',
    pattern: /\bhops?\b|\bper[- ]hop\b|\bhop[- ]counts?\b/gi,
    designRef: 'DESIGN 2.5, trap 15',
    why: 'A hop list is unobtainable from a browser for the same reason a trace is. There is no '
      + 'honest version of this word in this product.',
  }),
  Object.freeze({
    id: 'actual-route',
    pattern: /\bactual routes?\b|\breal routes?\b|\btrue paths?\b|\bactual paths?\b/gi,
    designRef: 'DESIGN 2.5, trap 15',
    why: 'The industry own authoritative map states that its cable routes are stylized and do '
      + 'not reflect precise geolocation. The claim is unsourceable at any price, not merely '
      + 'unmeasured. The product sells a floor, which is provable, not a path, which is not.',
  }),
  Object.freeze({
    id: 'per-visitor-cable-attribution',
    pattern: /\byour (?:traffic|packets?|data|bytes|request)\b[^.]{0,60}\b(?:crossed|travelled|traveled|went (?:through|via|over)|took)\b/gi,
    designRef: 'DESIGN 2.5, trap 15',
    why: 'Attributing a specific visitor to a specific physical path. Nothing in the web '
      + 'platform can support it.',
  }),
  Object.freeze({
    id: 'visitor-as-path',
    pattern: /\byour (?:AS|ASN|BGP) paths?\b|\byour autonomous system path\b/gi,
    designRef: 'DESIGN 2.5',
    why: 'Roughly 0.3 percent of visitors are a routing vantage point, and BGP is destination '
      + 'based, asymmetric, and carries no geography.',
  }),
  Object.freeze({
    id: 'visitor-geolocation',
    // The place name has to be capitalised for the first alternative to fire. That is not
    // laziness, it is what separates a geolocation claim ("You are in Denver") from the
    // product own required verdict sentence ("You are at the floor."), which DESIGN 4 C3 fixes
    // word for word and which an unanchored version of this rule wrongly flagged.
    // This rule is case SENSITIVE on purpose, so the leading words are spelled with explicit
    // character classes. The first alternative needs the place name to be capitalised, and an
    // /i flag would destroy that distinction.
    pattern: /[Yy]ou are (?:located |currently )?(?:in|at|near)\s+(?:the\s+)?[A-Z][a-z]|[Yy]our (?:exact |approximate )?(?:location|position|coordinates)\b|[Ww]e (?:have )?geolocated you\b|[Bb]ased on your IP\b|[Ww]e (?:detected|determined|know) (?:that )?you\b/g,
    designRef: 'DESIGN 2.5, trap 7',
    why: 'IP geolocation returns a national fallback centroid for a large share of addresses, '
      + 'which is the coordinate behind a well known lawsuit against a Kansas farm. The page '
      + 'never plots the visitor. The observer point is the serving Cloudflare facility, which '
      + 'is REPORTED by Cloudflare about its own network.',
  }),
  Object.freeze({
    id: 'cable-dataset-identifiers',
    pattern: /\bcable-geo\b|\blanding[- ]points?\b|\bsubmarinecablemap\b|\bcable_?geo\b/gi,
    designRef: 'DESIGN 3.1, trap 8',
    why: 'No submarine cable data of any kind is in this product, on four independent grounds: '
      + 'the open dataset no longer exists, the current data is licensed annually, the live '
      + 'endpoint sends no CORS header so a browser cannot read it, and the vendor states the '
      + 'geometry is stylized. These identifiers are what the build would reach for first.',
  }),
  Object.freeze({
    id: 'cable-length-total',
    pattern: /\b\d[\d,.]*\s*(?:million|thousand|billion)?\s*(?:km|kilomet(?:re|er)s?|miles?)\b[^.]{0,50}\bcables?\b|\bcables?\b[^.]{0,50}\b\d[\d,.]*\s*(?:million|thousand|billion)?\s*(?:km|kilomet(?:re|er)s?|miles?)\b/gi,
    designRef: 'DESIGN 2.5, trap 20',
    why: 'The original pitch headline figure contradicts the current published figure and does '
      + 'not match the sum of published per cable lengths either. It was cut, not softened. No '
      + 'cable length total of any kind ships.',
  }),
  Object.freeze({
    id: 'cable-count-total',
    pattern: /\b\d[\d,]*\s+(?:active\s+|submarine\s+|subsea\s+|undersea\s+)?cables?\b|\bcable count\b/gi,
    designRef: 'DESIGN 2.5, trap 20',
    why: 'Same as the length total. No cable count ships either. Note that the phrase '
      + '"submarine cable" on its own is permitted, because the README has to be able to say '
      + 'that this tool ships none of that data.',
  }),
  Object.freeze({
    id: 'directional-attribution',
    pattern: /\b(?:outbound|inbound|upstream|downstream|one[- ]way|outward|return)\s+(?:latency|leg|trip|delay|time)\b/gi,
    designRef: 'DESIGN 2.5, trap 17',
    why: 'A round trip is one number covering two paths that are frequently different. Splitting '
      + 'it or attributing it to a direction is a claim the measurement cannot support. Say '
      + '"round trip" every time.',
  }),
  Object.freeze({
    id: 'prediction-language',
    pattern: /\byour users will (?:see|get|experience)\b|\bpredicted latency\b|\bexpected latency for your users\b/gi,
    designRef: 'DESIGN 4 C4',
    why: 'The region picker reports floors, not predictions. Your users will never do better '
      + 'than the floor, and this tool cannot tell you how much worse they will do, because it '
      + 'has not measured them. That refusal is the honest half of the feature.',
  }),
  Object.freeze({
    id: 'assistant-attribution',
    pattern: /\bco-authored-by\b|\bgenerated (?:with|by) (?:claude|an? AI)\b|\bwritten by (?:claude|an? AI)\b|\bAI[- ]assist(?:ed|ance)\b/gi,
    designRef: 'House build spec',
    why: 'The work reads as solely 0xelitesystem. This bans attribution, not vocabulary.',
  }),
  Object.freeze({
    id: 'unicode-dashes',
    pattern: /[—–]/g,
    designRef: 'House build spec',
    why: 'No em dashes or en dashes anywhere. Use a comma, a period, parentheses, or the word '
      + '"to" for a range.',
  }),
]);

/**
 * The character proper nouns are masked with.
 *
 * It must satisfy three things and each one has cost something already:
 *   1. it appears in no BANNED pattern, so masking can never CREATE a match. Asserted by test.
 *   2. it is not a word character, so a \b boundary either side of a masked run behaves the
 *      same as it would against whitespace.
 *   3. it is printable ASCII. An earlier revision of this file used U+0000, which is correct
 *      arithmetically and wrong in every other way: a NUL byte makes grep, diff and several
 *      editors treat the whole source file as binary, so the file that defines the banned
 *      vocabulary became invisible to exactly the kind of text tool that would audit it.
 */
const MASK_CHAR = '#';
/**
 * Replace every proper noun exception with a same length run of a character that cannot appear
 * in any pattern, so offsets stay correct for line and column reporting.
 * @param {string} text
 * @returns {string}
 */
export function maskProperNouns(text) {
  let out = text;
  for (const noun of PROPER_NOUN_EXCEPTIONS) {
    // Longest first is guaranteed by the ordering of PROPER_NOUN_EXCEPTIONS above.
    let from = 0;
    for (;;) {
      const at = out.toLowerCase().indexOf(noun.toLowerCase(), from);
      if (at === -1) break;
      out = out.slice(0, at) + MASK_CHAR.repeat(noun.length) + out.slice(at + noun.length);
      from = at + noun.length;
    }
  }
  return out;
}

/**
 * @typedef {Object} VocabularyHit
 * @property {string} ruleId
 * @property {string} designRef
 * @property {string} why
 * @property {string} match The offending text.
 * @property {number} line 1 based.
 * @property {number} column 1 based.
 * @property {string} lineText
 */

/**
 * Scan one document. Pure, so the gate and the browser self test can share it.
 * @param {string} text
 * @returns {VocabularyHit[]}
 */
export function scanVocabulary(text) {
  const masked = maskProperNouns(text);
  /** @type {VocabularyHit[]} */
  const hits = [];

  // Line start offsets, computed once, so a hit can report line and column without rescanning.
  const lineStarts = [0];
  for (let i = 0; i < masked.length; i++) if (masked[i] === '\n') lineStarts.push(i + 1);
  const locate = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
  };

  for (const rule of BANNED) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
    let m;
    while ((m = re.exec(masked)) !== null) {
      const { line, column } = locate(m.index);
      const lineEnd = masked.indexOf('\n', lineStarts[line - 1]);
      hits.push({
        ruleId: rule.id,
        designRef: rule.designRef,
        why: rule.why,
        match: text.slice(m.index, m.index + m[0].length),
        line,
        column,
        lineText: text.slice(lineStarts[line - 1], lineEnd === -1 ? text.length : lineEnd).trim(),
      });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  hits.sort((a, b) => a.line - b.line || a.column - b.column);
  return hits;
}
