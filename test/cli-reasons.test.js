// The command line failure sentences, src/cli/reasons.js. DESIGN-CLI section 1: Node error codes
// map to fixed, reviewed sentences; nothing echoes an error message (it can carry server supplied
// text); a code the table does not know gets a fixed sentence that says so.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLI_FAILURE_REASONS, PROBE_ERROR_CODES, causeFor, errorCode, cliClassifyFailure,
} from '../src/cli/reasons.js';
import { scanVocabulary } from '../src/core/vocabulary.js';

/** @param {string} code @param {string} [message] */
const err = (code, message = 'boom from the far end \u001b[2J') => Object.assign(new Error(message), { code });

describe('every Node error code DESIGN-CLI names lands on its own fixed sentence', () => {
  const table = [
    ['ENOTFOUND', 'failed', 'NAME_NOT_FOUND'],
    ['EAI_NONAME', 'failed', 'NAME_NOT_FOUND'],
    ['EAI_AGAIN', 'failed', 'RESOLVER_UNAVAILABLE'],
    ['EAI_FAIL', 'failed', 'RESOLVER_UNAVAILABLE'],
    ['ECONNREFUSED', 'blocked', 'CONNECTION_REFUSED'],
    ['ECONNRESET', 'failed', 'CONNECTION_RESET'],
    ['EPIPE', 'failed', 'CONNECTION_RESET'],
    ['ETIMEDOUT', 'failed', 'CONNECT_TIMED_OUT'],
    ['EHOSTUNREACH', 'failed', 'UNREACHABLE'],
    ['ENETUNREACH', 'failed', 'UNREACHABLE'],
    ['CERT_HAS_EXPIRED', 'blocked', 'CERTIFICATE'],
    ['CERT_NOT_YET_VALID', 'blocked', 'CERTIFICATE'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'blocked', 'CERTIFICATE'],
    ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'blocked', 'CERTIFICATE'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'blocked', 'CERTIFICATE'],
    ['HOSTNAME_MISMATCH', 'blocked', 'CERTIFICATE'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'blocked', 'SELF_SIGNED'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'blocked', 'SELF_SIGNED'],
    ['EPROTO', 'failed', 'TLS_FAILED'],
    ['ERR_SSL_WRONG_VERSION_NUMBER', 'failed', 'TLS_FAILED'],
    [PROBE_ERROR_CODES.REDIRECT, 'failed', 'REDIRECT'],
    [PROBE_ERROR_CODES.BODY_CAP, 'failed', 'BODY_CAP'],
    [PROBE_ERROR_CODES.SOCKET_NOT_REUSED, 'failed', 'SOCKET_NOT_REUSED'],
    ['E_SOMETHING_NEW', 'failed', 'UNNAMED'],
    ['', 'failed', 'UNNAMED'],
  ];
  for (const [code, status, key] of table) {
    test((code || '(no code)') + ' is ' + key, () => {
      assert.deepEqual(causeFor(code), { status, key });
      const c = cliClassifyFailure(err(code), false, false);
      assert.equal(c.status, status);
      assert.equal(c.reason, CLI_FAILURE_REASONS[key]);
    });
  }
});

describe('the classifier', () => {
  test('an interrupted run wins over every other cause, then the deadline', () => {
    assert.equal(cliClassifyFailure(err('ECONNREFUSED'), true, true).reason, CLI_FAILURE_REASONS.INTERRUPTED);
    assert.equal(cliClassifyFailure(err('ECONNREFUSED'), true, false).reason, CLI_FAILURE_REASONS.DEADLINE);
  });

  test('an abort nobody on this side fired is stated as an interruption, not guessed at', () => {
    const e = Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' });
    assert.equal(cliClassifyFailure(e, false, false).reason, CLI_FAILURE_REASONS.INTERRUPTED);
  });

  test('the transport\'s own refusals keep their reason even when they surface as an abort', () => {
    const e = Object.assign(new Error('x'), { name: 'AbortError', code: PROBE_ERROR_CODES.BODY_CAP });
    assert.equal(cliClassifyFailure(e, false, false).reason, CLI_FAILURE_REASONS.BODY_CAP);
  });

  test('the code is found on the error, on its cause, or on the first error of an aggregate', () => {
    assert.equal(errorCode(err('ENOTFOUND')), 'ENOTFOUND');
    assert.equal(errorCode(Object.assign(new Error('fetch failed'), { cause: err('EAI_AGAIN') })), 'EAI_AGAIN');
    assert.equal(errorCode(new AggregateError([err('ECONNREFUSED'), err('ETIMEDOUT')])), 'ECONNREFUSED');
    assert.equal(errorCode('a string'), '');
    assert.equal(errorCode(null), '');
  });

  test('the error message, which the far end can write, is never the reason', () => {
    const c = cliClassifyFailure(err('ECONNRESET', 'server says \u001b]52;c;x\u0007 hello'), false, false);
    assert.ok(!c.reason.includes('server says'));
    assert.ok(Object.values(CLI_FAILURE_REASONS).includes(c.reason));
  });

  test('the statuses are the engine\'s two, and nothing is ever ok', () => {
    for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'CERT_HAS_EXPIRED', 'X']) {
      assert.ok(['failed', 'blocked'].includes(cliClassifyFailure(err(code), false, false).status));
    }
  });
});

describe('the sentences themselves', () => {
  test('frozen, and every one carries no digit: a failure carries no number', () => {
    assert.ok(Object.isFrozen(CLI_FAILURE_REASONS));
    assert.ok(Object.isFrozen(PROBE_ERROR_CODES));
    for (const [k, s] of Object.entries(CLI_FAILURE_REASONS)) {
      assert.equal(/\d/.test(s), false, k);
      assert.ok(s.endsWith('.'), k);
    }
  });

  test('every one passes the shipped vocabulary scanner', () => {
    for (const [k, s] of Object.entries(CLI_FAILURE_REASONS)) assert.deepEqual(scanVocabulary(s), [], k);
  });

  test('none says this browser or this page: the command line states its own causes', () => {
    for (const [k, s] of Object.entries(CLI_FAILURE_REASONS)) {
      assert.equal(/\bthis (?:browser|page)\b/i.test(s), false, k);
    }
  });
});
