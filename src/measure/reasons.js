// THE FIXED SENTENCES. Every degraded outcome in the measurement engine says one of these,
// character for character, and nothing composes a new one at the call site.
//
// DESIGN trap 13: a third party that does not answer degrades to a stated "source unavailable"
// rather than a blank or a zero. DESIGN 2.1 and the measurement contract go further: a failed
// or blocked endpoint carries null and a reason, never a zero and never a spinner.
//
// Why these live in one frozen table rather than at the throw site:
//   1. A sentence written at the call site is a sentence nobody reviewed. These are reviewed
//      once, here, against the vocabulary gate.
//   2. A test can assert the exact text, so softening one later is a visible diff.
//   3. DESIGN trap 15 names language drift as the biggest risk in the project. The engine is
//      where the excuses would be written, so the engine gets a fixed vocabulary.
//
// Every sentence obeys the claim boundary. None of them guesses at a cause the browser cannot
// observe. Where two causes are indistinguishable from inside a page, the sentence says both.
//
// Isomorphic: no node:* imports and no DOM.

/**
 * Reasons attached to an EndpointMeasurement with status 'failed' or 'blocked'.
 * @type {Readonly<Record<string, string>>}
 */
export const FAILURE_REASONS = Object.freeze({
  /** fetch() rejected. The browser gives one opaque error for several different causes. */
  REQUEST_REFUSED:
    'This browser reported a generic network error, which covers a request stopped by an '
    + 'extension or a policy, a cross origin response the browser refused to expose, and a '
    + 'host that could not be reached. A page cannot tell those apart, so this row states all '
    + 'of them rather than choosing one.',

  /** Our own AbortController fired. The request left and nothing came back in time. */
  TIMED_OUT:
    'No response arrived within the time limit printed beside this run. The request is '
    + 'abandoned rather than waited on, and no number is produced for it.',

  /** The visitor or the page cancelled the run. */
  CANCELLED:
    'This run was stopped before this endpoint finished. Nothing partial is reported.',

  /** Fewer than the required number of warm samples completed. */
  INCOMPLETE_SAMPLES:
    'Fewer warm samples completed than the method requires, so there is no minimum to report. '
    + 'A partial set would be a different measurement wearing this one name.',

  /** The browser says it has no network at all. */
  OFFLINE:
    'This browser reports that it has no network connection. The floor calculator and the '
    + 'globe still work; nothing can be measured.',

  /** A response arrived but its body could not be read to completion. */
  BODY_UNREADABLE:
    'A response began and then could not be read to completion, so the wall time it would '
    + 'have produced covers a different amount of work than the other samples and is discarded.',
});

/**
 * Run level notices. These are not failures. They are facts about the run that change how the
 * numbers must be read, and every one of them is either REPORTED by the far end or observed
 * directly by this page. None is inferred from an address.
 * @type {Readonly<Record<string, string>>}
 */
export const RUN_NOTICES = Object.freeze({
  /** Every endpoint came back blocked. DESIGN 6.4 no-network state. */
  NOTHING_MEASURED:
    'Every request this page made was refused before it produced a timing. A privacy '
    + 'extension, a corporate policy, or a browser setting that blocks requests to other sites '
    + 'will each do this. Nothing was measured, so nothing is shown as measured.',

  /** cdn-cgi/trace did not answer. DESIGN trap 7: ask, do not guess. */
  TRACE_UNAVAILABLE:
    'The serving edge did not answer, so this page holds no reported facility for this '
    + 'connection. It does not look your address up instead. Choose your city and every '
    + 'distance on this page is computed from that choice, labelled as your choice.',

  /**
   * The trace answered but no cited coordinate exists for the facility it named.
   * See colo-sites.js for why that table ships empty in V1.
   */
  COLO_WITHOUT_COORDINATE:
    'The serving edge named the facility that terminated this connection, and this page holds '
    + 'no coordinate for that facility from a source it can cite. The facility code is shown '
    + 'as reported and the distances are computed from the city you choose, labelled as your '
    + 'choice. An uncited coordinate would be a made up number wearing a badge.',

  /** warp=on. Cloudflare reporting its own tunnel. */
  WARP_TUNNEL:
    'The serving edge reports that this connection arrives through Cloudflare WARP. The round '
    + 'trip therefore includes that tunnel, and the facility named is where the tunnel comes '
    + 'out rather than where you are sitting.',

  /** gateway=on. Cloudflare Zero Trust, that is, a managed corporate egress. */
  GATEWAY_PROXY:
    'The serving edge reports that this connection arrives through a Cloudflare Zero Trust '
    + 'gateway, which is a managed proxy operated by whoever administers this machine. Its '
    + 'fixed cost is inside the measured access baseline.',

  /** rbi=on. The browser is not on the machine of the person reading the page. */
  REMOTE_BROWSER:
    'The serving edge reports remote browser isolation on this connection, which means the '
    + 'browser taking these timings is running in a data centre rather than on the machine in '
    + 'front of you. Nothing here describes your own connection, so no result is presented as '
    + 'if it did.',

  /** The honest default. Absence of evidence stated as absence of evidence. */
  NO_TUNNEL_REPORTED:
    'The serving edge reports no Cloudflare tunnel on this connection. It cannot report a VPN '
    + 'or a proxy that is not its own, and this page does not guess at one. Any such '
    + 'intermediary sits inside the measured access baseline along with the rest of your fixed '
    + 'connection cost, which is the reason that baseline is measured rather than assumed.',

  /** Some rows survived, some did not. Counted, never hidden. */
  PARTIAL_RUN:
    'Some endpoints produced no usable number in this run. They are counted and named rather '
    + 'than dropped quietly, and the access baseline is taken over the endpoints that did.',
});

/**
 * Reasons a row is excluded from the decomposition. DESIGN 7.3 requires each of these to be
 * counted and surfaced with its cause named, never averaged in and never clamped.
 * @type {Readonly<Record<string, string>>}
 */
export const EXCLUSION_REASONS = Object.freeze({
  FASTER_THAN_LIGHT:
    'This round trip is shorter than the time light needs in fibre to cover the distance twice, '
    + 'so the distance, the number, or both are wrong. The usual cause is an anycast address '
    + 'answering from a facility that is not the one the coordinate describes. It is reported '
    + 'as a defect and it is not used in any total.',

  UNSTABLE_SPREAD:
    'The warm samples for this endpoint spread further apart than a stable reading allows, so '
    + 'the spread is reported in place of a single number. A confident figure here would be a '
    + 'figure the samples do not support.',

  NOT_MEASURED:
    'This endpoint produced no usable round trip in this run, so it contributes nothing to the '
    + 'access baseline and appears in no total.',
});
