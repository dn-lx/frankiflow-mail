import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import {
  evaluatePasswordStrength,
  sanitizeEditorHtml,
  type PurifyLike,
} from '../src/components/settings/sanitize.ts';
import { mapAuthError } from '../src/components/auth/helpers.ts';

function createPurify(): PurifyLike {
  const { window } = new JSDOM('');
  return DOMPurify(window) as unknown as PurifyLike;
}

describe('sanitizeEditorHtml', () => {
  it('fails closed and returns empty string when no DOM or purify is available', () => {
    assert.equal(sanitizeEditorHtml('<p>Hello <strong>World</strong></p>'), '');
    assert.equal(sanitizeEditorHtml('<script>alert(1)</script>'), '');
  });

  it('strips img tags with onerror handlers and script tags', () => {
    const purify = createPurify();
    const out = sanitizeEditorHtml(
      '<p>Hi</p><img src="x" onerror="alert(1)"><script>alert(2)</script>',
      purify,
    );
    assert.equal(out.includes('<img'), false);
    assert.equal(out.includes('onerror'), false);
    assert.equal(out.includes('<script'), false);
    assert.equal(out.includes('<p>Hi</p>'), true);
  });

  it('strips javascript: and leading-space JAVASCRIPT: links and target/rel on unsafe links', () => {
    const purify = createPurify();
    const out1 = sanitizeEditorHtml(
      '<a href="javascript:alert(1)" target="_blank" rel="noopener">bad</a>',
      purify,
    );
    assert.equal(/href/i.test(out1), false);
    assert.equal(/javascript:/i.test(out1), false);
    assert.equal(/target/i.test(out1), false);

    const out2 = sanitizeEditorHtml('<a href=" JAVASCRIPT:alert(1)">bad2</a>', purify);
    assert.equal(/href/i.test(out2), false);
    assert.equal(/javascript:/i.test(out2), false);
  });

  it('strips data: URLs from links', () => {
    const purify = createPurify();
    const out = sanitizeEditorHtml(
      '<a href="data:text/html,<script>alert(1)</script>">data</a>',
      purify,
    );
    assert.equal(/href/i.test(out), false);
    assert.equal(/data:/i.test(out), false);
  });

  it('rewrites safe https and mailto links with target="_blank" and rel="noopener noreferrer"', () => {
    const purify = createPurify();
    const out = sanitizeEditorHtml(
      '<a href="https://frankiflow.de" target="_self" rel="opener">Site</a> <a href="mailto:info@frankiflow.de">Mail</a>',
      purify,
    );
    assert.equal(out.includes('href="https://frankiflow.de"'), true);
    assert.equal(out.includes('href="mailto:info@frankiflow.de"'), true);
    assert.equal(out.includes('target="_blank"'), true);
    assert.equal(out.includes('rel="noopener noreferrer"'), true);
    assert.equal(out.includes('target="_self"'), false);
  });

  it('preserves allowed formatting tags', () => {
    const purify = createPurify();
    const input = '<p><strong>Bold</strong> and <em>italic</em><br></p><ul><li>One</li></ul>';
    const out = sanitizeEditorHtml(input, purify);
    assert.equal(out.includes('<strong>Bold</strong>'), true);
    assert.equal(out.includes('<em>italic</em>'), true);
    assert.equal(out.includes('<ul><li>One</li></ul>'), true);
  });
});

describe('evaluatePasswordStrength', () => {
  it('scores passwords under 8 characters as weak (0)', () => {
    assert.deepEqual(evaluatePasswordStrength('abc123'), {
      score: 0,
      key: 'settings.account.strengthWeak',
    });
  });

  it('scores 8+ char simple passwords as fair (1)', () => {
    assert.deepEqual(evaluatePasswordStrength('abcdefgh'), {
      score: 1,
      key: 'settings.account.strengthFair',
    });
  });

  it('scores 12+ char simple or 8+ char varied passwords as good (2)', () => {
    assert.deepEqual(evaluatePasswordStrength('abcdefghijkl'), {
      score: 2,
      key: 'settings.account.strengthGood',
    });
    assert.deepEqual(evaluatePasswordStrength('Abcdefg1'), {
      score: 2,
      key: 'settings.account.strengthGood',
    });
  });

  it('scores 12+ char varied passwords as strong (3)', () => {
    assert.deepEqual(evaluatePasswordStrength('StrongPass123!'), {
      score: 3,
      key: 'settings.account.strengthStrong',
    });
  });
});

describe('mapAuthError', () => {
  const t = (key: string) => key;

  it('maps known auth and network error codes', () => {
    assert.equal(mapAuthError('auth:invalid', true, t), 'auth.error.invalid');
    assert.equal(mapAuthError(' auth:not-authorized ', true, t), 'auth.error.notAuthorized');
    assert.equal(mapAuthError('network:offline', true, t), 'auth.error.offline');
  });

  it('maps offline state to offline error even for unknown codes', () => {
    assert.equal(mapAuthError('unknown:err', false, t), 'auth.error.offline');
    assert.equal(mapAuthError(undefined, false, t), 'auth.error.offline');
  });

  it('falls back to generic error when online with unknown code', () => {
    assert.equal(mapAuthError('something:else', true, t), 'auth.error.generic');
    assert.equal(mapAuthError(undefined, true, t), 'auth.error.generic');
  });
});
