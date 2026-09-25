// THE COMMAND LINE'S FAILURE SENTENCES. DESIGN-CLI section 1, "CLI reasons table".
//
// A page is handed one opaque error for every network failure, on purpose, so the page states
// all the causes in one sentence rather than picking one (src/measure/reasons.js). Node hands
// the command line an error CODE, which names the cause. That is a real gain in honesty, and it
// only stays one if every code lands on a fixed sentence written and reviewed here, once,
// against the vocabulary gate. Nothing composes a failure sentence at the call site, nothing
// echoes an error message (it can carry server supplied text), and a code this table does not
// know gets a fixed sentence that says so rather than a guess.
//
// Every sentence here is digit free. A failure carries no number, because the number it would
// carry is the one that could not be measured.
//
// Isomorphic in the sense that matters: no Node module is imported. The classifier has the
// signature of classifyFailure in src/measure/roundtrip.js and reaches the engine through
// deps.measureEndpoint, exactly as the core step documented.

/**
 * The typed errors the command line transport raises itself. Each is a refusal of a sample that
 * would otherwise have been timed as though it were a clean one.
 */
export const PROBE_ERROR_CODES = Object.freeze({
  SOCKET_NOT_REUSED: 'PHOTONTAX_SOCKET_NOT_REUSED',
  REDIRECT: 'PHOTONTAX_REDIRECT',
  BODY_CAP: 'PHOTONTAX_BODY_CAP',
});

/**
 * The fixed sentences, keyed by cause.
 * @type {Readonly<Record<string, string>>}
 */
export const CLI_FAILURE_REASONS = Object.freeze({
  NAME_NOT_FOUND:
    'The name of this endpoint did not resolve through the operating system resolver on this '
    + 'machine, so no connection was attempted and nothing is measured for it.',
  RESOLVER_UNAVAILABLE:
    'The operating system resolver on this machine could not answer for this endpoint when '
    + 'asked, so no connection was attempted. That is a temporary failure of the resolver, not a '
    + 'statement that the name does not exist.',
  CONNECTION_REFUSED:
    'The connection to this endpoint was refused. The refusal came from the endpoint or from '
    + 'something between it and this machine, and this command line does not guess which.',
  CONNECTION_RESET:
    'The connection was closed from the other side before the response had finished arriving, '
    + 'so the time it would have produced covers less work than a complete sample and is '
    + 'discarded.',
  CONNECT_TIMED_OUT:
    'The operating system on this machine gave up on the connection before it was '
    + 'established. No request was sent and nothing is measured for this endpoint.',
  UNREACHABLE:
    'The operating system on this machine reported the endpoint address, or the network it '
    + 'sits on, as unreachable. No request was sent and nothing is measured for this endpoint.',
  CERTIFICATE:
    'The certificate this endpoint presented did not verify against the certificate '
    + 'authorities this machine trusts, so the connection was abandoned before any request was '
    + 'sent. Certificate checking is never turned off by this command line.',
  SELF_SIGNED:
    'The endpoint presented a self signed certificate, which a public cloud endpoint does not '
    + 'do and a local interception proxy does. The connection was abandoned before any request '
    + 'was sent. This command line does not guess which one it was talking to.',
  TLS_FAILED:
    'The TLS handshake with this endpoint failed before it completed, so no request was sent '
    + 'and nothing is measured for this endpoint.',
  REDIRECT:
    'The endpoint answered with a redirect. A followed redirect is two round trips reported as '
    + 'one, so a redirect is a stated failure here, exactly as it is on the page.',
  BODY_CAP:
    'The response was larger than the most this command line reads from any response, so it '
    + 'was abandoned unread. A response that large is not the small fixed answer the method '
    + 'times.',
  SOCKET_NOT_REUSED:
    'A warm sample did not ride the connection the warm up opened, so it would have contained '
    + 'a fresh connection setup. The endpoint is reported as failed rather than given a minimum '
    + 'that includes a handshake. The usual cause is the far end closing the connection after '
    + 'each response.',
  DEADLINE:
    'No response arrived within the time limit on each request, stated in the plan printed '
    + 'before this run. The request is abandoned rather than waited on, and no number is '
    + 'produced for it.',
  INTERRUPTED:
    'This run was interrupted before this endpoint finished. Nothing partial is reported.',
  UNNAMED:
    'The request failed with an error this command line has no reviewed sentence for. It is '
    + 'not guessed at, and nothing is measured for this endpoint.',
});

/**
 * The code a thrown value carries, looked for where Node puts it: on the error, on its cause,
 * or on the first error of an aggregate (a connection that tried several addresses).
 * @param {unknown} err
 * @returns {string}
 */
export function errorCode(err) {
  /** @param {unknown} e */
  const own = (e) => (e !== null && typeof e === 'object' && typeof /** @type {any} */ (e).code === 'string'
    ? /** @type {any} */ (e).code : '');
  if (err === null || typeof err !== 'object') return '';
  const e = /** @type {any} */ (err);
  return own(e) || own(e.cause) || (Array.isArray(e.errors) && e.errors.length > 0 ? own(e.errors[0]) : '');
}

/**
 * Map a Node error code to its cause key and status. 'blocked' is kept for a refusal (the far
 * end, or something in front of it, said no); 'failed' is everything that simply did not
 * complete. Both leave the endpoint unmeasured, with the sentence, and never with a zero.
 * @param {string} code
 * @returns {{status:'failed'|'blocked', key:string}}
 */
export function causeFor(code) {
  if (code === PROBE_ERROR_CODES.SOCKET_NOT_REUSED) return { status: 'failed', key: 'SOCKET_NOT_REUSED' };
  if (code === PROBE_ERROR_CODES.REDIRECT) return { status: 'failed', key: 'REDIRECT' };
  if (code === PROBE_ERROR_CODES.BODY_CAP) return { status: 'failed', key: 'BODY_CAP' };
  if (code === 'ENOTFOUND' || code === 'EAI_NONAME' || code === 'EAI_NODATA') return { status: 'failed', key: 'NAME_NOT_FOUND' };
  if (code.startsWith('EAI_')) return { status: 'failed', key: 'RESOLVER_UNAVAILABLE' };
  if (code === 'ECONNREFUSED') return { status: 'blocked', key: 'CONNECTION_REFUSED' };
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED') return { status: 'failed', key: 'CONNECTION_RESET' };
  if (code === 'ETIMEDOUT') return { status: 'failed', key: 'CONNECT_TIMED_OUT' };
  if (['EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'EHOSTDOWN', 'EADDRNOTAVAIL'].includes(code)) {
    return { status: 'failed', key: 'UNREACHABLE' };
  }
  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return { status: 'blocked', key: 'SELF_SIGNED' };
  }
  if (code.startsWith('CERT_') || code.startsWith('ERR_TLS_CERT') || code.startsWith('UNABLE_TO_')
    || code === 'HOSTNAME_MISMATCH') {
    return { status: 'blocked', key: 'CERTIFICATE' };
  }
  if (code === 'EPROTO' || code.startsWith('ERR_SSL_') || code.startsWith('ERR_TLS_')) {
    return { status: 'failed', key: 'TLS_FAILED' };
  }
  return { status: 'failed', key: 'UNNAMED' };
}

/**
 * The command line classifier. Same signature and same two statuses as classifyFailure in
 * src/measure/roundtrip.js, injected through deps.measureEndpoint.
 *
 * @param {unknown} err
 * @param {boolean} deadlineFired True when the engine's own timer aborted the request.
 * @param {boolean} runCancelled True when the whole run was interrupted.
 * @returns {{status:'failed'|'blocked', reason:string}}
 */
export function cliClassifyFailure(err, deadlineFired, runCancelled) {
  if (runCancelled) return { status: 'failed', reason: CLI_FAILURE_REASONS.INTERRUPTED };
  if (deadlineFired) return { status: 'failed', reason: CLI_FAILURE_REASONS.DEADLINE };
  const name = err !== null && typeof err === 'object' && 'name' in err ? String(/** @type {any} */ (err).name) : '';
  const code = errorCode(err);
  if (name === 'AbortError' && code !== PROBE_ERROR_CODES.SOCKET_NOT_REUSED
    && code !== PROBE_ERROR_CODES.REDIRECT && code !== PROBE_ERROR_CODES.BODY_CAP) {
    return { status: 'failed', reason: CLI_FAILURE_REASONS.INTERRUPTED };
  }
  const cause = causeFor(code);
  return { status: cause.status, reason: CLI_FAILURE_REASONS[cause.key] };
}
