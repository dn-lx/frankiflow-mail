import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chipQuery,
  combineQuery,
  filterTokens,
  formatSearch,
  freeText,
  isIsoDate,
  parseSearch,
  removeToken,
  tokenizeSearch,
} from '../src/lib/mail/search.ts';
import {
  appendThreads,
  compareThreads,
  displayNameOf,
  fromLocalInputValue,
  groupBy,
  mergeThreads,
  messagesToMove,
  neighbourId,
  otherParticipants,
  outboundRecipients,
  patchThreads,
  rangeIds,
  removeThreads,
  sameThread,
  showsRecipients,
  snoozePresets,
  sortThreads,
  staysInView,
  successorId,
  toLocalInputValue,
} from '../src/lib/mail/threads.ts';
import { buildSearchQuery, isFolder, parseView, viewHref } from '../src/components/shell/view.ts';
import type { Message, ThreadSummary } from '../src/lib/backend/types.ts';

function makeThread(id: string, lastMessageAt: string, overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id,
    subject: `Subject ${id}`,
    lastMessageAt,
    messageCount: 1,
    unreadCount: 0,
    participants: ['Anna Schmidt'],
    preview: 'Preview text',
    isStarred: false,
    isPinned: false,
    priority: 'normal',
    hasAttachments: false,
    labelIds: [],
    mailboxIds: ['mb-info'],
    latestMessageId: `msg-${id}`,
    ...overrides,
  };
}

function makeMessage(id: string, folder: Message['folder'], overrides: Partial<Message> = {}): Message {
  return {
    id,
    threadId: 'th-1',
    mailboxId: 'mb-info',
    direction: folder === 'sent' ? 'outbound' : folder === 'drafts' ? 'draft' : 'inbound',
    folder,
    from: { address: 'anna@example.de', name: 'Anna' },
    to: ['info@frankiflow.de'],
    cc: [],
    bcc: [],
    subject: 'Subj',
    textBody: 'Body',
    htmlBody: '<p>Body</p>',
    preview: 'Body',
    isRead: true,
    isStarred: false,
    isPinned: false,
    priority: 'normal',
    hasAttachments: false,
    attachments: [],
    labelIds: [],
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('search parser and tokenizer', () => {
  it('tokenizes quoted phrases, operators, and free text', () => {
    const tokens = tokenizeSearch('from:"Anna Schmidt" subject:Angebot "Grundreinigung Büro" is:unread has:attachment');
    assert.deepEqual(tokens, [
      { kind: 'from', value: 'Anna Schmidt', valid: true },
      { kind: 'subject', value: 'Angebot', valid: true },
      { kind: 'text', value: 'Grundreinigung Büro', valid: true },
      { kind: 'is', value: 'unread', valid: true },
      { kind: 'has', value: 'attachment', valid: true },
    ]);
  });

  it('validates is:, has:, before:, after: operators and marks invalid ones', () => {
    const tokens = tokenizeSearch('is:STARRED is:bogus has:attachments has:foo before:2026-02-28 before:2026-02-30 after:yesterday');
    assert.deepEqual(tokens, [
      { kind: 'is', value: 'starred', valid: true },
      { kind: 'is', value: 'bogus', valid: false },
      { kind: 'has', value: 'attachments', valid: true },
      { kind: 'has', value: 'foo', valid: false },
      { kind: 'before', value: '2026-02-28', valid: true },
      { kind: 'before', value: '2026-02-30', valid: false },
      { kind: 'after', value: 'yesterday', valid: false },
    ]);
    assert.equal(isIsoDate('2024-02-29'), true);
    assert.equal(isIsoDate('2025-02-29'), false);
  });

  it('parseSearch collects only valid operator values and deduplicates is: flags', () => {
    const parsed = parseSearch(
      'from:anna to:info@frankiflow.de subject:"Büro Süd" label:Kunden is:unread is:UNREAD is:pinned is:invalid has:attachment before:2026-04-01 after:2026-03-01 Rechnung',
    );
    assert.deepEqual(parsed.from, ['anna']);
    assert.deepEqual(parsed.to, ['info@frankiflow.de']);
    assert.deepEqual(parsed.subject, ['Büro Süd']);
    assert.deepEqual(parsed.labels, ['Kunden']);
    assert.deepEqual(parsed.is, ['unread', 'pinned']);
    assert.equal(parsed.hasAttachment, true);
    assert.equal(parsed.before, '2026-04-01');
    assert.equal(parsed.after, '2026-03-01');
    assert.deepEqual(parsed.text, ['Rechnung']);
  });

  it('removeToken removes the specified token and re-quotes multi-word tokens', () => {
    const q = 'from:"Anna Schmidt" is:unread "Büro Reinigung" label: Wichtig';
    // Note: `label:` with empty value is an invalid token at index 3, `Wichtig` is text at index 4
    const q2 = 'from:"Anna Schmidt" is:unread "Büro Reinigung" label:Wichtig';
    assert.equal(removeToken(q2, 1), 'from:"Anna Schmidt" "Büro Reinigung" label:Wichtig');
    assert.equal(removeToken(q2, 0), 'is:unread "Büro Reinigung" label:Wichtig');
    assert.equal(removeToken(q2, 99), 'from:"Anna Schmidt" is:unread "Büro Reinigung" label:Wichtig');
    assert.equal(formatSearch(tokenizeSearch(q)), 'from:"Anna Schmidt" is:unread "Büro Reinigung" Wichtig');
  });

  it('filterTokens returns only operator tokens with their original indices', () => {
    const chips = filterTokens('Hallo from:anna Welt is:starred');
    assert.deepEqual(chips, [
      { index: 1, token: { kind: 'from', value: 'anna', valid: true } },
      { index: 3, token: { kind: 'is', value: 'starred', valid: true } },
    ]);
  });
});

describe('thread sorting, merging, navigation, and move helpers', () => {
  it('sorts pinned threads first, then newest first, with deterministic id tie-breaker', () => {
    const a = makeThread('th-b', '2026-03-10T10:00:00.000Z');
    const b = makeThread('th-a', '2026-03-10T10:00:00.000Z');
    const c = makeThread('th-c', '2026-03-01T10:00:00.000Z', { isPinned: true });
    const d = makeThread('th-d', '2026-03-12T10:00:00.000Z');

    const sorted = sortThreads([a, d, b, c]);
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['th-c', 'th-d', 'th-a', 'th-b'],
    );
    assert.equal(compareThreads(b, a), -1);
  });

  it('mergeThreads preserves pinned-first/newest order, keeps unchanged references, and retains older infinite-scroll pages', () => {
    const pinned = makeThread('th-pin', '2026-03-01T08:00:00.000Z', { isPinned: true });
    const t1 = makeThread('th-1', '2026-03-10T12:00:00.000Z');
    const t2 = makeThread('th-2', '2026-03-09T12:00:00.000Z');
    const olderLoaded = makeThread('th-old', '2026-03-01T12:00:00.000Z');
    const current = [pinned, t1, t2, olderLoaded];

    // Identical fresh when complete=true returns the exact same array reference if nothing dropped
    assert.equal(mergeThreads(current, current, true), current);

    // Fresh page has a new thread, an updated t1, drops t2 (within window), and is incomplete (so olderLoaded survives)
    const tNew = makeThread('th-new', '2026-03-11T12:00:00.000Z');
    const t1Updated = makeThread('th-1', '2026-03-10T12:00:00.000Z', { unreadCount: 2 });
    const cutoffKeeper = makeThread('th-cutoff', '2026-03-08T12:00:00.000Z');

    const merged = mergeThreads(current, [ { ...pinned }, tNew, t1Updated, cutoffKeeper ], false);
    assert.deepEqual(
      merged.map((t) => t.id),
      ['th-pin', 'th-new', 'th-1', 'th-cutoff', 'th-old'],
    );
    // Unchanged pinned object reference is preserved
    assert.equal(merged[0], pinned);
    assert.equal(sameThread(t1, t1Updated), false);
  });

  it('appendThreads, removeThreads, patchThreads, rangeIds, neighbourId, and successorId', () => {
    const t1 = makeThread('th-1', '2026-03-10T10:00:00.000Z');
    const t2 = makeThread('th-2', '2026-03-09T10:00:00.000Z');
    const t3 = makeThread('th-3', '2026-03-08T10:00:00.000Z');

    const appended = appendThreads([t1, t2], [t2, t3]);
    assert.deepEqual(appended.map((t) => t.id), ['th-1', 'th-2', 'th-3']);

    assert.deepEqual(removeThreads(appended, ['th-2']).map((t) => t.id), ['th-1', 'th-3']);

    const patched = patchThreads(appended, ['th-3'], () => ({ isPinned: true }));
    assert.deepEqual(patched.map((t) => t.id), ['th-3', 'th-1', 'th-2']);

    const order = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual(rangeIds(order, 'd', 'b'), ['b', 'c', 'd']);
    assert.equal(neighbourId(order, 'b', 'next'), 'c');
    assert.equal(neighbourId(order, 'a', 'prev'), undefined);
    assert.equal(neighbourId(order, undefined, 'next'), 'a');

    assert.equal(successorId(order, ['b', 'c']), 'd');
    assert.equal(successorId(order, ['d', 'e']), 'c');
    assert.equal(successorId(order, order), undefined);
  });

  it('messagesToMove and staysInView respect folder boundaries', () => {
    const mInbox = makeMessage('m-in', 'inbox');
    const mSent = makeMessage('m-sent', 'sent');
    const mDraft = makeMessage('m-draft', 'drafts');
    const mArchive = makeMessage('m-arch', 'archive');
    const all = [mInbox, mSent, mDraft, mArchive];

    // Archiving from inbox touches only inbox messages (leaves sent/drafts alone)
    assert.deepEqual(
      messagesToMove(all, 'inbox', 'archive').map((m) => m.id),
      ['m-in'],
    );
    // Trashing from 'starred' or 'all' moves everything except drafts/scheduled
    assert.deepEqual(
      messagesToMove(all, 'starred', 'trash').map((m) => m.id),
      ['m-in', 'm-sent', 'm-arch'],
    );
    assert.equal(staysInView('inbox', 'archive'), false);
    assert.equal(staysInView('all', 'archive'), true);
    assert.equal(staysInView('all', 'trash'), false);

    const grouped = groupBy(all, (m) => m.direction);
    assert.equal(grouped.get('inbound')?.length, 2);
  });

  it('snoozePresets computes laterToday, tomorrow 08:00, and nextMonday 08:00', () => {
    // Morning on a Wednesday (2026-03-04 10:15 local)
    const morning = new Date(2026, 2, 4, 10, 15, 0, 0);
    const p1 = snoozePresets(morning);
    assert.ok(p1.laterToday);
    assert.equal(p1.laterToday.getHours(), 14);
    assert.equal(p1.laterToday.getMinutes(), 0);
    assert.equal(p1.tomorrow.getDate(), 5);
    assert.equal(p1.tomorrow.getHours(), 8);
    assert.equal(p1.nextMonday.getDay(), 1);
    assert.equal(p1.nextMonday.getDate(), 9);
    assert.equal(p1.nextMonday.getHours(), 8);

    // Late evening (20:30 local) -> +3h crosses midnight, so laterToday is undefined
    const late = new Date(2026, 2, 4, 20, 30, 0, 0);
    assert.equal(snoozePresets(late).laterToday, undefined);

    // On a Monday, nextMonday is 7 days later
    const monday = new Date(2026, 2, 2, 9, 0, 0, 0);
    assert.equal(snoozePresets(monday).nextMonday.getDate(), 9);

    const inputVal = toLocalInputValue(p1.tomorrow);
    const parsed = fromLocalInputValue(inputVal);
    assert.ok(parsed);
    assert.equal(parsed.getTime(), p1.tomorrow.getTime());
  });
});

describe('search input vs. filter chips', () => {
  it('freeText keeps free text and invalid operators; chipQuery keeps valid operators', () => {
    const q = 'has:attachment is:unread Angebot is:bogus';
    assert.equal(freeText(q), 'Angebot is:bogus');
    assert.equal(chipQuery(q), 'has:attachment is:unread');
    assert.equal(freeText('has:attachment is:unread'), '');
  });

  it('combineQuery puts chips first and does not duplicate operators typed again', () => {
    assert.equal(combineQuery('is:unread', 'Rechnung'), 'is:unread Rechnung');
    assert.equal(combineQuery('is:unread', 'is:unread from:anna'), 'is:unread from:anna');
    assert.equal(combineQuery('', ''), '');
    assert.equal(combineQuery('has:attachment', ''), 'has:attachment');
  });
});

describe('recipients for Sent / Drafts rows', () => {
  const own = [
    { address: 'team@frankiflow.de', displayName: 'FrankiFlow Team' },
    { address: 'info@frankiflow.de', displayName: 'FrankiFlow' },
  ];

  it('showsRecipients only for sent, drafts and scheduled', () => {
    assert.equal(showsRecipients('sent'), true);
    assert.equal(showsRecipients('drafts'), true);
    assert.equal(showsRecipients('scheduled'), true);
    assert.equal(showsRecipients('inbox'), false);
  });

  it('displayNameOf reads "Name <addr>" and bare addresses', () => {
    assert.equal(displayNameOf('Katrin Weber <k.weber@example.de>'), 'Katrin Weber');
    assert.equal(displayNameOf('"Weber, Katrin" <k.weber@example.de>'), 'Weber, Katrin');
    assert.equal(displayNameOf('<k.weber@example.de>'), 'k.weber@example.de');
    assert.equal(displayNameOf('lukas@example.de'), 'lukas@example.de');
  });

  it('otherParticipants drops own mailboxes by address or display name (case-insensitive)', () => {
    assert.deepEqual(otherParticipants(['FrankiFlow Team', 'Katrin Weber'], own), ['Katrin Weber']);
    assert.deepEqual(otherParticipants(['TEAM@frankiflow.de', 'lukas@example.de'], own), ['lukas@example.de']);
    assert.deepEqual(otherParticipants(['FrankiFlow <info@frankiflow.de>'], own), []);
    assert.deepEqual(otherParticipants(['Anna', 'anna'], []), ['Anna']);
  });

  it('outboundRecipients takes To and Cc of the latest outbound or draft message', () => {
    const msgs = [
      makeMessage('m1', 'sent', { to: ['Old Person <old@example.de>'] }),
      makeMessage('m2', 'inbox', { to: ['team@frankiflow.de'] }),
      makeMessage('m3', 'sent', { to: ['Katrin Weber <k@example.de>'], cc: ['Lukas Schmidt <l@example.de>', 'k@example.de'] }),
    ];
    assert.deepEqual(outboundRecipients(msgs), ['Katrin Weber', 'Lukas Schmidt', 'k@example.de']);
    assert.deepEqual(outboundRecipients([makeMessage('d', 'drafts', { to: [] })]), []);
    assert.deepEqual(outboundRecipients([makeMessage('i', 'inbox')]), []);
  });
});

describe('parseView and viewHref URL round-trip', () => {
  it('round-trips folder, mailbox, label, thread, and search query with spaces and umlauts', () => {
    const base = new URLSearchParams('demo=1');
    const initial = parseView(base);
    assert.deepEqual(initial, {
      mailbox: 'all',
      folder: 'inbox',
      labelId: undefined,
      search: undefined,
      filter: undefined,
      threadId: undefined,
    });

    const query = 'from:"Müller & Söhne" Betreff:Büroreinigung Größenübersicht äöüß';
    const href = viewHref(base, initial, {
      mailbox: 'mb-info',
      folder: 'sent',
      search: query,
      filter: 'unread',
      threadId: 'th-07',
    });
    assert.ok(href.startsWith('/mail/?'));

    const sp = new URLSearchParams(href.slice('/mail/?'.length));
    assert.equal(sp.get('demo'), '1');
    assert.equal(sp.get('r'), 'unread');
    const parsed = parseView(sp);
    assert.deepEqual(parsed, {
      mailbox: 'mb-info',
      folder: 'sent',
      labelId: undefined,
      search: query,
      filter: 'unread',
      threadId: 'th-07',
    });

    // Changing folder/mailbox/label keeps the filter.
    const nextFolderHref = viewHref(sp, parsed, { folder: 'archive', labelId: null, search: null, threadId: null });
    assert.equal(parseView(new URLSearchParams(nextFolderHref.slice('/mail/?'.length))).filter, 'unread');

    // Resetting back to default inbox + clearing filter clears mail params while preserving demo=1
    const backHref = viewHref(sp, parsed, {
      mailbox: 'all',
      folder: 'inbox',
      search: null,
      filter: null,
      threadId: null,
    });
    assert.equal(backHref, '/mail/?demo=1');
  });

  it('ignores invalid r values and buildSearchQuery appends filter operators', () => {
    assert.equal(parseView(new URLSearchParams('r=bogus')).filter, undefined);
    assert.equal(parseView(new URLSearchParams('r=unstarred')).filter, 'unstarred');

    assert.equal(buildSearchQuery(undefined, undefined), undefined);
    assert.equal(buildSearchQuery('Rechnung', undefined), 'Rechnung');
    assert.equal(buildSearchQuery(undefined, 'unread'), 'is:unread');
    assert.equal(buildSearchQuery(undefined, 'read'), 'is:read');
    assert.equal(buildSearchQuery(undefined, 'starred'), 'is:starred');
    assert.equal(buildSearchQuery(undefined, 'unstarred'), 'is:unstarred');
    assert.equal(buildSearchQuery('from:anna', 'unstarred'), 'from:anna is:unstarred');
  });

  it('defaults folder to all when a label is set without an explicit folder', () => {
    const sp = new URLSearchParams('l=lbl-angebote');
    const view = parseView(sp);
    assert.equal(view.folder, 'all');
    assert.equal(view.labelId, 'lbl-angebote');
    assert.equal(isFolder('snoozed'), true);
    assert.equal(isFolder('unknown'), false);
  });
});

import { matchesListFilter } from '../src/components/shell/view.ts';
describe('matchesListFilter (conversation level)', () => {
  const t = (unreadCount: number, isStarred: boolean) => ({ unreadCount, isStarred });
  it('unread / read follow the conversation unread count', () => {
    assert.equal(matchesListFilter(t(1, false), 'unread'), true);
    assert.equal(matchesListFilter(t(0, false), 'unread'), false);
    assert.equal(matchesListFilter(t(0, false), 'read'), true);
    assert.equal(matchesListFilter(t(2, false), 'read'), false);
  });
  it('a conversation with any starred message is not "unstarred"', () => {
    assert.equal(matchesListFilter(t(0, true), 'unstarred'), false);
    assert.equal(matchesListFilter(t(0, true), 'starred'), true);
    assert.equal(matchesListFilter(t(0, false), 'unstarred'), true);
  });
  it('no filter keeps everything', () => {
    assert.equal(matchesListFilter(t(3, true), undefined), true);
  });
});
