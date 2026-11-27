import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRAME_CSP_ALLOWED,
  FRAME_CSP_BLOCKED,
  MESSAGE_FRAME_SANDBOX,
  PRINT_FRAME_SANDBOX,
  cspMetaTag,
  frameCsp,
} from '../src/components/reader/frame-policy.ts';

function directive(csp: string, name: string): string[] | null {
  for (const part of csp.split(';')) {
    const tokens = part.trim().split(/\s+/);
    if (tokens[0] === name) return tokens.slice(1);
  }
  return null;
}

describe('message frame policy', () => {
  it('sandbox is exactly popups-only (no scripts, no same origin)', () => {
    assert.equal(MESSAGE_FRAME_SANDBOX, 'allow-popups allow-popups-to-escape-sandbox');
    assert.ok(!MESSAGE_FRAME_SANDBOX.includes('allow-scripts'));
    assert.ok(!MESSAGE_FRAME_SANDBOX.includes('allow-same-origin'));
  });

  it('print sandbox never allows scripts', () => {
    assert.ok(!PRINT_FRAME_SANDBOX.includes('allow-scripts'));
  });

  it('CSP strings contain no sandbox relaxations', () => {
    for (const csp of [FRAME_CSP_BLOCKED, FRAME_CSP_ALLOWED]) {
      assert.ok(!csp.includes('allow-scripts'));
      assert.ok(!csp.includes('allow-same-origin'));
    }
  });

  it('blocked CSP allows only data: and cid: images', () => {
    assert.deepEqual(directive(FRAME_CSP_BLOCKED, 'img-src'), ['data:', 'cid:']);
    assert.ok(!directive(FRAME_CSP_BLOCKED, 'img-src')!.includes('https:'));
  });

  it('allowed CSP adds https: but never http:', () => {
    assert.deepEqual(directive(FRAME_CSP_ALLOWED, 'img-src'), ['data:', 'cid:', 'https:']);
    assert.ok(!FRAME_CSP_ALLOWED.includes('http:'));
  });

  it('both CSPs lock down everything else', () => {
    for (const csp of [FRAME_CSP_BLOCKED, FRAME_CSP_ALLOWED]) {
      assert.deepEqual(directive(csp, 'default-src'), ["'none'"]);
      assert.deepEqual(directive(csp, 'media-src'), ["'none'"]);
      assert.deepEqual(directive(csp, 'style-src'), ["'unsafe-inline'"]);
      assert.deepEqual(directive(csp, 'font-src'), ['data:']);
      assert.deepEqual(directive(csp, 'frame-src'), ["'none'"]);
      assert.deepEqual(directive(csp, 'form-action'), ["'none'"]);
      assert.deepEqual(directive(csp, 'base-uri'), ["'none'"]);
      assert.equal(directive(csp, 'script-src'), null);
    }
  });

  it('frameCsp and cspMetaTag pick the right policy', () => {
    assert.equal(frameCsp(false), FRAME_CSP_BLOCKED);
    assert.equal(frameCsp(true), FRAME_CSP_ALLOWED);
    const meta = cspMetaTag(false);
    assert.match(meta, /^<meta http-equiv="Content-Security-Policy" content="[^"]+">$/);
    assert.ok(meta.includes('img-src data: cid:;'));
  });
});
