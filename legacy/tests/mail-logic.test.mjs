// Characterization tests for pure-ish mail helpers in assets/app.js.
// The real helper definitions are read from the source file and evaluated in an
// isolated vm context with controlled state, CONFIG, clock and browser globals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE_LINES = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8').split(/\r?\n/);
const FIXED_NOW = Date.parse('2026-03-15T12:00:00Z');

// Returns the top-level declaration for `name`. Multi-line function bodies end at
// the first following line that is exactly `}`; one-line declarations are taken as is.
function extract(name) {
  const start = new RegExp(`^(?:async\\s+)?function\\s+${name}\\(|^const\\s+${name}\\s*=`);
  const starts = SOURCE_LINES.flatMap((line, index) => (start.test(line) ? [index] : []));
  assert.equal(starts.length, 1, `expected exactly one declaration of ${name}`);
  const first = starts[0];
  if (!SOURCE_LINES[first].trimEnd().endsWith('{')) return SOURCE_LINES[first];
  const end = SOURCE_LINES.indexOf('}', first);
  assert.ok(end > first, `could not find end of ${name}`);
  return SOURCE_LINES.slice(first, end + 1).join('\n');
}

const HELPERS = [
  'arr', 'addresses', 'hasAttachments', 'accountByAddress', 'accountForMessage',
  'labelsFor', 'threadFor', 'effectiveFolder', 'advancedMatch', 'currentMessages',
  'replyRecipients', 'filePayload', 'filterSummary',
];
const HELPER_SOURCE = HELPERS.map(extract).join('\n');

function makeState(overrides = {}) {
  return {
    attachmentMessageIds: new Set(), messages: [], accounts: [], labels: [], messageLabels: [],
    settings: null, folder: 'inbox', mobileQuickFilter: 'all', search: '', composer: null,
    ...overrides,
  };
}

function load({ state = makeState(), mailbox = 'mail@frankiflow.de', mobile = false } = {}) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(FIXED_NOW); }
    static now() { return FIXED_NOW; }
  }
  const context = vm.createContext({
    state,
    CONFIG: { mailbox },
    Date: FixedDate,
    btoa: globalThis.btoa,
    window: { matchMedia: () => ({ matches: mobile }) },
    document: undefined,
  });
  const helpers = vm.runInContext(`${HELPER_SOURCE}\n({${HELPERS.join(',')}})`, context, { filename: 'app-helpers.js' });
  return { ...helpers, state };
}

const plain = value => JSON.parse(JSON.stringify(value));
// Array.from (called from the test realm) copies the sandbox array into a test-realm array.
const ids = list => Array.from(list, m => m.id);

const msg = (id, extra = {}) => ({
  id, folder: 'inbox', direction: 'inbound', is_read: true, is_starred: false, is_pinned: false,
  subject: '', from_address: '', to_addresses: [], cc_addresses: [], created_at: '2026-03-01T00:00:00Z', ...extra,
});

test('search: empty and whitespace queries match everything', () => {
  const { advancedMatch } = load();
  assert.equal(advancedMatch(msg('a'), ''), true);
  assert.equal(advancedMatch(msg('a'), '   '), true);
});

test('search: from/to/subject operators are case-insensitive substring matches', () => {
  const { advancedMatch } = load();
  const m = msg('a', { from_address: 'Alice@Example.com', to_addresses: ['Bob@Corp.de', 'carol@corp.de'], subject: 'Quarterly Report' });
  assert.equal(advancedMatch(m, 'from:alice'), true);
  assert.equal(advancedMatch(m, 'FROM:EXAMPLE.COM'), true);
  assert.equal(advancedMatch(m, 'from:bob'), false);
  assert.equal(advancedMatch(m, 'to:carol'), true);
  assert.equal(advancedMatch(m, 'to:bob@corp'), true);
  assert.equal(advancedMatch(m, 'to:alice'), false);
  assert.equal(advancedMatch(m, 'subject:quarterly'), true);
  assert.equal(advancedMatch(m, 'subject:invoice'), false);
  assert.equal(advancedMatch(m, 'from:alice subject:invoice'), false, 'all operators must match');
});

test('search: is: operators', () => {
  const { advancedMatch } = load();
  const unread = msg('u', { is_read: false });
  const flagged = msg('f', { is_starred: true, is_pinned: true, priority: 'high', is_muted: true });
  assert.equal(advancedMatch(unread, 'is:unread'), true);
  assert.equal(advancedMatch(flagged, 'is:unread'), false);
  assert.equal(advancedMatch(flagged, 'is:read'), true);
  assert.equal(advancedMatch(unread, 'is:read'), false);
  for (const v of ['starred', 'pinned', 'important', 'muted']) {
    assert.equal(advancedMatch(flagged, `is:${v}`), true, v);
    assert.equal(advancedMatch(unread, `is:${v}`), false, v);
  }
  assert.equal(advancedMatch(msg('n', { priority: 'normal' }), 'is:important'), false);
});

test('search: unknown operators and unknown values are ignored', () => {
  const { advancedMatch } = load();
  const m = msg('a', { subject: 'Hello' });
  assert.equal(advancedMatch(m, 'foo:bar'), true);
  assert.equal(advancedMatch(m, 'is:whatever'), true);
  assert.equal(advancedMatch(m, 'has:nothing'), true);
  assert.equal(advancedMatch(m, 'foo:bar hello'), true);
  assert.equal(advancedMatch(m, 'foo:bar goodbye'), false);
  // A leading colon is not an operator; it is searched as free text.
  assert.equal(advancedMatch(m, ':hello'), false);
  assert.equal(advancedMatch(msg('b', { subject: 'note :hello' }), ':hello'), true);
});

test('search: has:attachment uses the message flag or loaded attachment metadata', () => {
  const state = makeState({ attachmentMessageIds: new Set(['meta']) });
  const { advancedMatch, hasAttachments } = load({ state });
  assert.equal(hasAttachments(msg('flag', { has_attachments: true })), true);
  assert.equal(hasAttachments(msg('meta', { has_attachments: false })), true);
  assert.equal(hasAttachments(msg('none')), false);
  assert.equal(advancedMatch(msg('flag', { has_attachments: true }), 'has:attachment'), true);
  assert.equal(advancedMatch(msg('meta'), 'has:attachment'), true);
  assert.equal(advancedMatch(msg('none'), 'has:attachment'), false);
});

test('search: in: uses the effective folder, including expired snoozes', () => {
  const { advancedMatch, effectiveFolder } = load();
  const expired = msg('s1', { folder: 'snoozed', snoozed_until: '2026-03-15T11:59:00Z' });
  const pending = msg('s2', { folder: 'snoozed', snoozed_until: '2026-03-15T12:01:00Z' });
  assert.equal(effectiveFolder(expired), 'inbox');
  assert.equal(effectiveFolder(pending), 'snoozed');
  assert.equal(advancedMatch(expired, 'in:inbox'), true);
  assert.equal(advancedMatch(pending, 'in:inbox'), false);
  assert.equal(advancedMatch(pending, 'in:SNOOZED'), true);
});

test('search: before/after compare the received, sent or created stamp and ignore invalid dates', () => {
  const { advancedMatch } = load();
  const received = msg('r', { received_at: '2026-02-10T10:00:00Z', created_at: '2026-01-01T00:00:00Z' });
  const sentOnly = msg('s', { sent_at: '2026-02-20T10:00:00Z' });
  assert.equal(advancedMatch(received, 'before:2026-02-11'), true);
  assert.equal(advancedMatch(received, 'before:2026-02-10'), false);
  assert.equal(advancedMatch(received, 'after:2026-02-09'), true);
  assert.equal(advancedMatch(received, 'after:2026-02-11'), false);
  assert.equal(advancedMatch(sentOnly, 'after:2026-02-15'), true);
  assert.equal(advancedMatch(received, 'before:notadate after:alsonot'), true);
});

test('search: label: matches label names by substring', () => {
  const state = makeState({
    labels: [{ id: 'l1', name: 'Clients VIP' }, { id: 'l2', name: 'Finance' }],
    messageLabels: [{ message_id: 'a', label_id: 'l1' }],
  });
  const { advancedMatch } = load({ state });
  assert.equal(advancedMatch(msg('a'), 'label:vip'), true);
  assert.equal(advancedMatch(msg('a'), 'label:finance'), false);
  assert.equal(advancedMatch(msg('b'), 'label:vip'), false);
});

test('search: free text must match every term across sender, subject, body and recipients', () => {
  const { advancedMatch } = load();
  const m = msg('a', {
    from_address: 'alice@example.com', from_name: 'Alice Smith', subject: 'Booking', preview: 'Room ready',
    text_body: 'Checkout at noon', to_addresses: ['desk@hotel.de'], cc_addresses: ['manager@hotel.de'],
  });
  assert.equal(advancedMatch(m, 'smith booking'), true);
  assert.equal(advancedMatch(m, 'ROOM noon'), true);
  assert.equal(advancedMatch(m, 'desk manager'), true);
  assert.equal(advancedMatch(m, '"room ready"'), true);
  assert.equal(advancedMatch(m, 'booking invoice'), false);
});

test('list: pinned first, then newest; one representative per thread', () => {
  const state = makeState({
    messages: [
      msg('t1-old', { thread_id: 't1', received_at: '2026-03-01T00:00:00Z' }),
      msg('t1-new', { thread_id: 't1', received_at: '2026-03-05T00:00:00Z' }),
      msg('t2-pinned-old', { thread_id: 't2', is_pinned: true, received_at: '2026-02-01T00:00:00Z' }),
      msg('t2-new', { thread_id: 't2', received_at: '2026-03-10T00:00:00Z' }),
      msg('solo', { sent_at: '2026-03-07T00:00:00Z' }),
      msg('elsewhere', { folder: 'archive', received_at: '2026-03-12T00:00:00Z' }),
    ],
  });
  const { currentMessages } = load({ state });
  assert.deepEqual(ids(currentMessages()), ['t2-pinned-old', 'solo', 't1-new']);
});

test('list: conversation view off keeps every message', () => {
  const state = makeState({
    settings: { conversation_view: false },
    messages: [
      msg('t1-old', { thread_id: 't1', received_at: '2026-03-01T00:00:00Z' }),
      msg('t1-new', { thread_id: 't1', received_at: '2026-03-05T00:00:00Z' }),
    ],
  });
  const { currentMessages, threadFor } = load({ state });
  assert.deepEqual(ids(currentMessages()), ['t1-new', 't1-old']);
  assert.deepEqual(ids(threadFor(state.messages[0])), ['t1-old']);
});

test('list: starred folder excludes trash and search filters the list', () => {
  const state = makeState({
    folder: 'starred',
    search: 'subject:keep',
    messages: [
      msg('a', { is_starred: true, subject: 'keep me', received_at: '2026-03-02T00:00:00Z' }),
      msg('b', { is_starred: true, subject: 'keep trash', folder: 'trash' }),
      msg('c', { is_starred: true, subject: 'other' }),
    ],
  });
  const { currentMessages } = load({ state });
  assert.deepEqual(ids(currentMessages()), ['a']);
});

test('thread: ascending by creation, without drafts, falling back to the message', () => {
  const state = makeState({
    messages: [
      msg('late', { thread_id: 't', created_at: '2026-03-03T00:00:00Z' }),
      msg('draft', { thread_id: 't', folder: 'drafts', direction: 'draft', created_at: '2026-03-04T00:00:00Z' }),
      msg('early', { thread_id: 't', created_at: '2026-03-01T00:00:00Z' }),
      msg('unrelated', { thread_id: 'other', created_at: '2026-03-02T00:00:00Z' }),
    ],
  });
  const { threadFor } = load({ state });
  assert.deepEqual(ids(threadFor(state.messages[0])), ['early', 'late']);
  assert.deepEqual(ids(threadFor(msg('x'))), ['x']);
  assert.deepEqual(ids(threadFor(state.messages[1])), ['early', 'late']);
});

test('reply: prefers reply_to and returns only that address for a plain reply', () => {
  const { replyRecipients } = load();
  const m = msg('a', { reply_to: 'Replies@Ext.com', from_address: 'alice@ext.com', to_addresses: ['mail@frankiflow.de', 'bob@ext.com'] });
  assert.deepEqual(plain(replyRecipients(m, false)), { to: 'Replies@Ext.com', cc: [] });
});

test('reply all: excludes all own addresses and dedupes case-insensitively, keeping first casing', () => {
  const state = makeState({ accounts: [{ address: ' Info@FrankiFlow.de ' }, { address: 'mail@frankiflow.de' }, { address: '' }] });
  const { replyRecipients } = load({ state, mailbox: 'Team@FrankiFlow.de' });
  const m = msg('a', {
    from_address: ' Alice@Ext.com ',
    to_addresses: ['alice@ext.com', 'MAIL@frankiflow.de', 'Bob@Ext.com', 'team@frankiflow.de'],
    cc_addresses: ['bob@ext.com', ' info@frankiflow.de', 'Carol@Ext.com', '', null],
  });
  assert.deepEqual(plain(replyRecipients(m, true)), { to: 'Alice@Ext.com', cc: ['Bob@Ext.com', 'Carol@Ext.com'] });
  assert.deepEqual(plain(replyRecipients(m, false)), { to: 'Alice@Ext.com', cc: [] });
});

test('reply: own sent message falls back to its recipients', () => {
  const state = makeState({ accounts: [{ address: 'info@frankiflow.de' }] });
  const { replyRecipients } = load({ state });
  const sent = msg('a', { direction: 'outbound', from_address: 'Info@FrankiFlow.de', to_addresses: ['x@ext.com', 'info@frankiflow.de'], cc_addresses: ['y@ext.com'] });
  assert.deepEqual(plain(replyRecipients(sent, false)), { to: 'x@ext.com', cc: [] });
  assert.deepEqual(plain(replyRecipients(sent, true)), { to: 'x@ext.com', cc: ['y@ext.com'] });
});

test('reply: no usable recipients yields empty results', () => {
  const { replyRecipients } = load();
  assert.deepEqual(plain(replyRecipients(msg('a', { from_address: 'mail@frankiflow.de', to_addresses: ['MAIL@frankiflow.de'] }), true)), { to: '', cc: [] });
  assert.deepEqual(plain(replyRecipients(undefined, true)), { to: '', cc: [] });
  assert.deepEqual(plain(replyRecipients(msg('b', { from_address: '', to_addresses: null, cc_addresses: undefined }), false)), { to: '', cc: [] });
});

test('filter summary: defaults when no conditions or actions are set', () => {
  const { filterSummary } = load();
  assert.equal(filterSummary({}), 'Any inbound mail → No action');
  assert.equal(filterSummary({ conditions: { has_attachment: 'any' }, actions: { priority: 'normal' } }), 'Any inbound mail → No action');
});

test('filter summary: lists conditions and actions in fixed order', () => {
  const state = makeState({ labels: [{ id: 'l1', name: 'Clients' }] });
  const { filterSummary } = load({ state });
  const all = {
    conditions: { has_attachment: 'yes', account_address: 'info@frankiflow.de', body_contains: 'invoice', subject_contains: 'Order', to_contains: 'sales', from_contains: 'shop' },
    actions: { is_pinned: true, priority: 'high', is_starred: true, is_read: true, folder: 'archive', label_id: 'l1' },
  };
  assert.equal(
    filterSummary(all),
    'from “shop” · to “sales” · subject “Order” · body “invoice” · received at info@frankiflow.de · has attachment'
      + ' → label Clients, move to archive, mark read, star, high priority, pin',
  );
  assert.equal(filterSummary({ conditions: { has_attachment: 'no' }, actions: { label_id: 'missing' } }), 'no attachment → label selected');
});

test('file payload: base64-encodes binary files in chunks and falls back to no content type', async () => {
  // Larger than two 32768-byte chunks; each chunk (including the 5-byte tail) differs from the others.
  const big = new Uint8Array(0x8000 * 2 + 5);
  for (let i = 0; i < big.length; i++) big[i] = (i * 7 + Math.floor(i / 0x8000) * 13) % 256;
  assert.notDeepEqual(Array.from(big.subarray(0, 5)), Array.from(big.subarray(0x8000 * 2)));
  assert.notDeepEqual(Array.from(big.subarray(0, 5)), Array.from(big.subarray(0x8000, 0x8000 + 5)));
  const small = new Uint8Array([0, 255, 128, 10, 13]);
  const file = (name, type, bytes) => ({ name, type, arrayBuffer: async () => bytes.buffer.slice(0) });
  const state = makeState({ composer: { files: [file('big.bin', 'application/octet-stream', big), file('raw', '', small)] } });
  const { filePayload } = load({ state });
  const out = await filePayload();
  assert.equal(out.length, 2);
  assert.equal(out[0].filename, 'big.bin');
  assert.equal(out[0].contentType, 'application/octet-stream');
  assert.equal(out[0].content, Buffer.from(big).toString('base64'));
  assert.equal(out[1].filename, 'raw');
  assert.equal(out[1].contentType, undefined);
  assert.ok('contentType' in out[1]);
  assert.equal(out[1].content, Buffer.from(small).toString('base64'));
  assert.equal((await load().filePayload()).length, 0);
});
