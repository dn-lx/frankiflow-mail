import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../src/lib/backend/demo/seed.ts';
import {
  matchesSearch,
  normalizeSearchText,
  parseSearch,
} from '../src/lib/backend/demo/search.ts';
import type { Message } from '../src/lib/backend/types.ts';

// Fixed clock so the seed timestamps (and the date operators) are deterministic.
const FIXED_NOW = Date.parse('2026-11-27T12:00:00.000Z');

interface Fixture {
  messages: Map<string, Message>;
  labels: Map<string, string>;
}

async function loadFixture(): Promise<Fixture> {
  const state = await createSeedState(FIXED_NOW);
  return {
    messages: new Map(state.messages.map((m): [string, Message] => [m.id, m])),
    labels: new Map(state.labels.map((l): [string, string] => [l.name, l.id])),
  };
}

function hits(fx: Fixture, query: string, messageId: string): boolean {
  const msg = fx.messages.get(messageId);
  assert.ok(msg, `seed message ${messageId} is missing`);
  return matchesSearch(msg, parseSearch(query), fx.labels);
}

describe('parseSearch', () => {
  it('parses operators, quoted phrases and free text', () => {
    const parsed = parseSearch(
      'from:katrin subject:Büro label:Angebote is:unread has:attachment "Wohnungs reinigung" freitag'
    );
    assert.deepEqual(parsed.from, ['katrin']);
    assert.deepEqual(parsed.subject, ['buro']);
    assert.deepEqual(parsed.labels, ['angebote']);
    assert.equal(parsed.isUnread, true);
    assert.equal(parsed.hasAttachment, true);
    assert.deepEqual(parsed.textTerms, ['wohnungs reinigung', 'freitag']);
  });

  it('parses to:, is:read/starred/pinned and before:/after: dates', () => {
    const parsed = parseSearch(
      'to:team@frankiflow.de is:read is:starred is:pinned before:2026-11-27 after:2026-11-01'
    );
    assert.deepEqual(parsed.to, ['team@frankiflow.de']);
    assert.equal(parsed.isUnread, false);
    assert.equal(parsed.isStarred, true);
    assert.equal(parsed.isPinned, true);
    assert.equal(parsed.before, '2026-11-27');
    assert.equal(parsed.after, '2026-11-01');
  });

  it('an empty query has no terms and matches every message', async () => {
    const fx = await loadFixture();
    const parsed = parseSearch('   ');
    assert.deepEqual(parsed.textTerms, []);
    assert.equal(matchesSearch(fx.messages.get('msg-01')!, parsed, fx.labels), true);
  });
});

describe('normalizeSearchText', () => {
  it('strips accents, folds ß to ss and lowercases', () => {
    assert.equal(normalizeSearchText('Größe Äpfel'), 'grosse apfel');
    assert.equal(normalizeSearchText('BÜRO'), 'buro');
  });
});

describe('matchesSearch on seed messages', () => {
  it('from: matches sender name or address', async () => {
    const fx = await loadFixture();
    assert.equal(hits(fx, 'from:katrin', 'msg-01'), true);
    assert.equal(hits(fx, 'from:katrin', 'msg-02'), false);
    assert.equal(hits(fx, 'from:katrin.weber@example.de', 'msg-01'), true);
  });

  it('to: matches recipients', async () => {
    const fx = await loadFixture();
    assert.equal(hits(fx, 'to:team@frankiflow.de', 'msg-06'), true);
    assert.equal(hits(fx, 'to:team@frankiflow.de', 'msg-01'), false);
  });

  it('subject: matches the subject line only', async () => {
    const fx = await loadFixture();
    assert.equal(hits(fx, 'subject:anfrage', 'msg-01'), true);
    assert.equal(hits(fx, 'subject:anfrage', 'msg-07'), false);
    // msg-01's body contains "Wohnung" but not in the subject.
    assert.equal(hits(fx, 'subject:Sachsenhausen', 'msg-01'), true);
    assert.equal(hits(fx, 'subject:Freitag', 'msg-01'), false);
  });

  it('is:unread and is:read', async () => {
    const fx = await loadFixture();
    assert.equal(hits(fx, 'is:unread', 'msg-01'), true);
    assert.equal(hits(fx, 'is:unread', 'msg-03a'), false);
    assert.equal(hits(fx, 'is:read', 'msg-03a'), true);
    assert.equal(hits(fx, 'is:read', 'msg-01'), false);
  });

  it('is:starred, is:unstarred and is:pinned', async () => {
    const fx = await loadFixture();
    assert.equal(hits(fx, 'is:starred', 'msg-01'), true);
    assert.equal(hits(fx, 'is:starred', 'msg-02'), false);
    assert.equal(hits(fx, 'is:unstarred', 'msg-01'), false);
    assert.equal(hits(fx, 'is:unstarred', 'msg-02'), true);
    assert.equal(hits(fx, 'is:pinned', 'msg-01'), true);
    assert.equal(hits(fx, 'is:pinned', 'msg-02'), false);
  });

  it('has:attachment', async () => {
    const fx = await loadFixture();
    assert.equal(hits(fx, 'has:attachment', 'msg-02'), true);
    assert.equal(hits(fx, 'has:attachment', 'msg-01'), false);
  });

  it('label: matches by label name, case-insensitively, and rejects unknown labels', async () => {
    const fx = await loadFixture();
    assert.equal(hits(fx, 'label:Angebote', 'msg-01'), true);
    assert.equal(hits(fx, 'label:angebote', 'msg-01'), true);
    assert.equal(hits(fx, 'label:Angebote', 'msg-06'), false);
    assert.equal(hits(fx, 'label:Unbekannt', 'msg-01'), false);
  });

  it('before: and after: compare against the message date (YYYY-MM-DD)', async () => {
    const fx = await loadFixture();
    // msg-01 was received 2026-11-27 at about 10:40 UTC.
    assert.equal(hits(fx, 'before:2026-11-27', 'msg-01'), false);
    assert.equal(hits(fx, 'before:2026-11-28', 'msg-01'), true);
    assert.equal(hits(fx, 'after:2026-11-27', 'msg-01'), true);
    assert.equal(hits(fx, 'after:2026-11-28', 'msg-01'), false);
    // msg-29 was received 2026-10-26.
    assert.equal(hits(fx, 'before:2026-11-01', 'msg-29'), true);
    assert.equal(hits(fx, 'after:2026-11-01', 'msg-29'), false);
  });

  it('quoted phrases must match as a whole, in order', async () => {
    const fx = await loadFixture();
    assert.equal(hits(fx, '"Wohnungsreinigung in Sachsenhausen"', 'msg-01'), true);
    assert.equal(hits(fx, '"Sachsenhausen Wohnungsreinigung"', 'msg-01'), false);
  });

  it('free text is case- and accent-insensitive', async () => {
    const fx = await loadFixture();
    // msg-02 subject: "Anfrage Büroreinigung Westend (320 m², 2x wöchentlich)"
    assert.equal(hits(fx, 'BÜROREINIGUNG', 'msg-02'), true);
    assert.equal(hits(fx, 'buroreinigung', 'msg-02'), true);
    assert.equal(hits(fx, 'Westend', 'msg-02'), true);
    assert.equal(hits(fx, 'wochentlich', 'msg-02'), true);
    // msg-31 subject: "Angebot Büroreinigung Berger Straße"
    assert.equal(hits(fx, 'STRASSE', 'msg-31'), true);
    assert.equal(hits(fx, 'Straße', 'msg-31'), true);
    assert.equal(hits(fx, 'Zahlungserinnerung', 'msg-02'), false);
  });

  it('operators combine with AND semantics', async () => {
    const fx = await loadFixture();
    assert.equal(hits(fx, 'from:katrin is:unread', 'msg-01'), true);
    assert.equal(hits(fx, 'from:katrin is:read', 'msg-01'), false);
    assert.equal(hits(fx, 'from:katrin label:Angebote Sachsenhausen', 'msg-01'), true);
    assert.equal(hits(fx, 'from:katrin label:Rechnungen', 'msg-01'), false);
  });
});
