// Composer logic: address parsing and reply rules, HTML cleaning (jsdom + DOMPurify),
// and the initial window content built by buildSnapshot. Runs in Node without a browser.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jsdom from 'jsdom';
import DOMPurify from 'dompurify';
import type { Mailbox, Message, Signature } from '../src/lib/backend/types.ts';
import type { ReplyMode } from '../src/lib/mail/addresses.ts';
import {
  emailProblem,
  formatAddress,
  namesFromMessage,
  parseAddressList,
  preferTypedAddress,
  replyAllRecipients,
  replyRecipients,
  replySubject,
  stripSubjectPrefixes,
} from '../src/lib/mail/addresses.ts';
import { createHtmlKit, escapeHtml, normalizeLink, textToHtml } from '../src/components/composer/html-core.ts';
import type { HtmlEnv } from '../src/components/composer/html-core.ts';
import { buildSnapshot } from '../src/components/composer/snapshot.ts';
import type { SnapshotDeps } from '../src/components/composer/snapshot.ts';
import { toRecipients } from '../src/components/composer/recipients.ts';
import type { ComposeInit, ComposerSnapshot } from '../src/components/composer/types.ts';

const { JSDOM } = jsdom;

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const dom = new JSDOM('');
const win = dom.window as unknown as Window & typeof globalThis;
const env: HtmlEnv = { win, purify: DOMPurify(win) };
const kit = createHtmlKit(env);

/** Echoes the key and the variables, so tests can see what was passed. */
const t = (key: string, vars?: Record<string, string | number>): string =>
  [key, ...Object.values(vars ?? {})].join('|');

const deps: SnapshotDeps = { html: kit, formatDate: (iso) => `D(${iso})` };

function mailbox(id: string, address: string, extra: Partial<Mailbox> = {}): Mailbox {
  return { id, address, displayName: '', isPrimary: false, canSend: true, ...extra };
}

const info = mailbox('mb-info', 'info@frankiflow.de', { isPrimary: true });
const team = mailbox('mb-team', 'team@frankiflow.de');
const readOnly = mailbox('mb-x', 'x@frankiflow.de', { canSend: false });
const mailboxes = [info, team, readOnly];

const signatures: Signature[] = [{ id: 's1', mailboxId: 'mb-info', html: '<p>Gruss Info</p>', isDefault: true }];

function makeMessage(over: Partial<Message> = {}): Message {
  return {
    id: 'm-1',
    threadId: 'th-1',
    mailboxId: 'mb-info',
    direction: 'inbound',
    folder: 'inbox',
    from: { address: 'kunde@example.de', name: 'Kunde GmbH' },
    to: ['info@frankiflow.de'],
    cc: [],
    bcc: [],
    subject: 'Angebot',
    textBody: 'Hallo',
    htmlBody: '',
    preview: '',
    isRead: true,
    isStarred: false,
    isPinned: false,
    priority: 'normal',
    hasAttachments: false,
    attachments: [],
    labelIds: [],
    receivedAt: '2026-01-01T10:00:00Z',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    ...over,
  };
}

function must<T>(value: T | null): T {
  assert.notEqual(value, null, 'expected a value, got null');
  return value as T;
}

function addresses(list: { address: string }[]): string[] {
  return list.map((r) => r.address);
}

/* ------------------------------------------------------------------ */
/* Address parsing                                                     */
/* ------------------------------------------------------------------ */

describe('parseAddressList', () => {
  it('reads Name <address> into name and address', () => {
    const [p] = parseAddressList('Anna Muster <anna@x.de>');
    assert.equal(p.name, 'Anna Muster');
    assert.equal(p.address, 'anna@x.de');
    assert.equal(p.raw, 'Anna Muster <anna@x.de>');
  });

  it('keeps commas inside quoted names', () => {
    const list = parseAddressList('"Doe, John" <j@d.de>, bob@y.com');
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'Doe, John');
    assert.equal(list[0].address, 'j@d.de');
    assert.equal(list[1].name, '');
    assert.equal(list[1].address, 'bob@y.com');
  });

  it('splits on semicolons, commas and newlines (LF and CRLF)', () => {
    const list = parseAddressList('a@x.de; b@y.de\nc@z.de\r\nd@w.de,e@v.de');
    assert.deepEqual(addresses(list), ['a@x.de', 'b@y.de', 'c@z.de', 'd@w.de', 'e@v.de']);
  });

  it('does not split on separators inside angle brackets', () => {
    const list = parseAddressList('"Team; Info" <info@x.de>');
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Team; Info');
    assert.equal(list[0].address, 'info@x.de');
  });

  it('keeps invalid entries so the UI can flag them', () => {
    const list = parseAddressList('kein-at, ok@x.de');
    assert.deepEqual(addresses(list), ['kein-at', 'ok@x.de']);
    assert.equal(emailProblem(list[0].address), 'missing-at');
    assert.equal(emailProblem(list[1].address), null);
  });

  it('splits whitespace-separated bare addresses', () => {
    assert.deepEqual(addresses(parseAddressList('a@x.de b@y.de')), ['a@x.de', 'b@y.de']);
  });

  it('strips mailto: and drops empty tokens', () => {
    assert.deepEqual(addresses(parseAddressList(' ,, mailto:a@x.de ;')), ['a@x.de']);
    assert.deepEqual(parseAddressList(' , ;'), []);
    assert.deepEqual(parseAddressList(''), []);
  });
});

describe('emailProblem', () => {
  it('accepts ordinary addresses', () => {
    assert.equal(emailProblem('anna.muster+tag@frankiflow.de'), null);
  });

  it('explains each kind of problem', () => {
    assert.equal(emailProblem(''), 'empty');
    assert.equal(emailProblem('a b@x.de'), 'spaces');
    assert.equal(emailProblem('ab.de'), 'missing-at');
    assert.equal(emailProblem('@x.de'), 'missing-local');
    assert.equal(emailProblem('a@'), 'missing-domain');
    assert.equal(emailProblem('a@localhost'), 'missing-domain');
    assert.equal(emailProblem('a@x.d'), 'invalid');
    assert.equal(emailProblem('müller@x.de'), 'invalid');
    assert.equal(emailProblem('a..b@x.de'), 'invalid');
  });
});

describe('formatAddress', () => {
  it('quotes names that contain commas', () => {
    assert.equal(formatAddress({ name: 'Doe, John', address: 'j@d.de' }), '"Doe, John" <j@d.de>');
  });

  it('shows just the address when there is no distinct name', () => {
    assert.equal(formatAddress({ name: 'a@x.de', address: 'A@x.de' }), 'A@x.de');
    assert.equal(formatAddress({ address: 'a@x.de' }), 'a@x.de');
  });
});

/* ------------------------------------------------------------------ */
/* Reply recipients and subjects                                       */
/* ------------------------------------------------------------------ */

describe('replyAllRecipients', () => {
  const own = ['info@frankiflow.de', 'Team@FrankiFlow.de'];

  it('excludes own addresses case-insensitively', () => {
    const msg = makeMessage({
      from: { address: 'Kunde@Example.de', name: '' },
      to: ['INFO@frankiflow.de', 'b@x.de'],
      cc: ['team@frankiflow.de', 'anna@x.de'],
    });
    const { to, cc } = replyAllRecipients(msg, own);
    assert.deepEqual(to, ['Kunde@Example.de', 'b@x.de']);
    assert.deepEqual(cc, ['anna@x.de']);
  });

  it('deduplicates across To and Cc (an address appears only once overall)', () => {
    const msg = makeMessage({
      to: ['b@x.de', 'B@x.de'],
      cc: ['b@x.de', 'c@x.de', 'C@X.DE'],
    });
    const { to, cc } = replyAllRecipients(msg, own);
    assert.deepEqual(to, ['kunde@example.de', 'b@x.de']);
    assert.deepEqual(cc, ['c@x.de']);
  });

  it('does not reply to itself when the message is one of our own sent mails', () => {
    const msg = makeMessage({ from: { address: 'INFO@frankiflow.de', name: '' }, to: ['kunde@example.de'], cc: [] });
    assert.deepEqual(replyAllRecipients(msg, own).to, ['kunde@example.de']);
  });
});

describe('replyRecipients', () => {
  it('replies to Reply-To when it is set', () => {
    const msg = makeMessage({ replyTo: 'support@example.de' });
    assert.deepEqual(replyRecipients(msg, ['info@frankiflow.de']), ['support@example.de']);
  });

  it('replies to the original recipients for our own sent mail', () => {
    const msg = makeMessage({ from: { address: 'info@frankiflow.de', name: '' }, to: ['kunde@example.de'] });
    assert.deepEqual(replyRecipients(msg, ['info@frankiflow.de']), ['kunde@example.de']);
  });
});

describe('replySubject', () => {
  const cases: [string, ReplyMode, 'de' | 'en', string][] = [
    ['Angebot', 'reply', 'de', 'AW: Angebot'],
    ['Angebot', 'reply', 'en', 'Re: Angebot'],
    ['AW: AW: Angebot', 'replyAll', 'de', 'AW: Angebot'],
    ['Re: Re[2]: Hello', 'reply', 'en', 'Re: Hello'],
    ['Antw: Angebot', 'replyAll', 'de', 'AW: Angebot'],
    ['Fwd: Angebot', 'forward', 'de', 'WG: Angebot'],
    ['WG: Angebot', 'forward', 'en', 'Fwd: Angebot'],
    ['Fwd: Re: Angebot', 'forward', 'en', 'Fwd: Angebot'],
    ['', 'reply', 'de', 'AW:'],
  ];

  for (const [subject, mode, lang, expected] of cases) {
    it(`${JSON.stringify(subject)} (${mode}, ${lang}) -> ${JSON.stringify(expected)}`, () => {
      assert.equal(replySubject(subject, mode, lang), expected);
    });
  }

  it('does not treat "Re?" in a question as a prefix', () => {
    assert.equal(replySubject('Re? Are you coming?', 'reply', 'en'), 'Re: Re? Are you coming?');
    assert.equal(stripSubjectPrefixes('Re? Are you coming?'), 'Re? Are you coming?');
  });

  it('strips stacked prefixes', () => {
    assert.equal(stripSubjectPrefixes('WG: AW: Re: Thema'), 'Thema');
  });
});

/* ------------------------------------------------------------------ */
/* HTML cleaning (jsdom + DOMPurify)                                   */
/* ------------------------------------------------------------------ */

describe('cleanHtml and friends', () => {
  it('removes <script> elements and their content', () => {
    const out = kit.cleanComposeHtml('<p>Hi</p><script>alert(1)</script>');
    assert.ok(!/<script/i.test(out));
    assert.ok(!out.includes('alert'));
    assert.ok(out.includes('<p>Hi</p>'));
  });

  it('removes onerror handlers from images', () => {
    const out = kit.cleanHtml('<img src="data:image/png;base64,iVBORw0KGgo=" onerror="alert(1)">');
    assert.ok(!/onerror/i.test(out));
    assert.ok(out.includes('<img'));
  });

  it('removes javascript: links but keeps the text', () => {
    const out = kit.cleanComposeHtml('<a href="javascript:alert(1)">klick</a>');
    assert.ok(!/javascript/i.test(out));
    assert.ok(out.includes('klick'));
  });

  it('keeps safe http(s) and mailto links, and drops event handlers', () => {
    const out = kit.cleanComposeHtml('<a href="https://frankiflow.de" onclick="x()">Web</a> <a href="mailto:a@b.de">Mail</a>');
    assert.ok(out.includes('href="https://frankiflow.de"'));
    assert.ok(out.includes('href="mailto:a@b.de"'));
    assert.ok(!/onclick/i.test(out));
  });

  it('keeps basic formatting', () => {
    const out = kit.cleanComposeHtml('<p><b>Fett</b> <i>kursiv</i> <u>unter</u></p><ul><li>eins</li></ul>');
    assert.ok(out.includes('<b>Fett</b>'));
    assert.ok(out.includes('<i>kursiv</i>'));
    assert.ok(out.includes('<u>unter</u>'));
    assert.ok(out.includes('<ul><li>eins</li></ul>'));
  });

  it('strips styles and classes', () => {
    assert.equal(kit.cleanPastedHtml('<p class="x" style="color:red">t</p>'), '<p>t</p>');
  });

  it('drops remote images unless they are allowed', () => {
    assert.ok(!kit.cleanHtml('<img src="https://e.com/a.png">').includes('<img'));
    assert.ok(kit.cleanHtml('<img src="https://e.com/a.png">', { allowRemoteImages: true }).includes('https://e.com/a.png'));
  });

  it('keeps the composer markers only for composed content', () => {
    const html = '<div data-ff-signature="">S</div>';
    assert.ok(kit.cleanComposeHtml(html).includes('data-ff-signature'));
    assert.ok(!kit.cleanPastedHtml(html).includes('data-ff-signature'));
  });

  it('returns empty results without a DOM (server render)', () => {
    const none = createHtmlKit(null);
    assert.equal(none.cleanHtml('<p>x</p>'), '');
    assert.equal(none.htmlToText('<p>x</p>'), '');
  });
});

describe('htmlToText', () => {
  it('turns paragraphs and bullet lists into lines', () => {
    assert.equal(kit.htmlToText('<p>Hallo</p><ul><li>eins</li><li>zwei</li></ul>'), 'Hallo\n- eins\n- zwei');
  });

  it('numbers ordered lists', () => {
    assert.equal(kit.htmlToText('<ol><li>a</li><li>b</li></ol>'), '1. a\n2. b');
  });

  it('turns line breaks into newlines', () => {
    assert.equal(kit.htmlToText('a<br>b'), 'a\nb');
  });

  it('appends link targets that differ from the link text', () => {
    assert.equal(
      kit.htmlToText('<p>Siehe <a href="https://frankiflow.de/angebot">Angebot</a></p>'),
      'Siehe Angebot (https://frankiflow.de/angebot)',
    );
  });

  it('quotes blockquotes', () => {
    assert.equal(kit.htmlToText('<blockquote><p>x</p></blockquote>'), '> x');
  });
});

describe('ownText', () => {
  it('leaves out the quoted original and the signature', () => {
    const html = '<p>Mein Text</p><blockquote data-ff-quote="">Alt</blockquote><div data-ff-signature="">Sig</div>';
    assert.equal(kit.ownText(html), 'Mein Text');
  });
});

describe('normalizeLink', () => {
  it('adds https to bare domains', () => {
    assert.equal(normalizeLink('frankiflow.de'), 'https://frankiflow.de');
    assert.equal(normalizeLink('  https://x.de/a  '), 'https://x.de/a');
  });

  it('turns an email address into a mailto link', () => {
    assert.equal(normalizeLink('a@b.de'), 'mailto:a@b.de');
    assert.equal(normalizeLink('mailto:a@b.de'), 'mailto:a@b.de');
  });

  it('rejects empty input, spaces and dangerous schemes', () => {
    assert.equal(normalizeLink(''), null);
    assert.equal(normalizeLink('   '), null);
    assert.equal(normalizeLink('hallo welt'), null);
    assert.equal(normalizeLink('javascript:alert(1)'), null);
  });
});

describe('escapeHtml and textToHtml', () => {
  it('escapes markup characters', () => {
    assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('makes paragraphs and line breaks from plain text', () => {
    assert.equal(textToHtml('a\nb\n\nc'), '<p>a<br>b</p><p>c</p>');
    assert.equal(textToHtml('  '), '');
  });
});

/* ------------------------------------------------------------------ */
/* Recipients                                                          */
/* ------------------------------------------------------------------ */

describe('toRecipients', () => {
  it('drops empty and case-insensitive duplicate addresses', () => {
    const list = toRecipients(parseAddressList('A@x.de, a@x.de, , b@x.de'));
    assert.deepEqual(addresses(list), ['A@x.de', 'b@x.de']);
    assert.notEqual(list[0].id, list[1].id);
  });
});

describe('recipient entry helpers', () => {
  it('prefers the typed text over a suggestion when it contains "@"', () => {
    assert.equal(preferTypedAddress('foo@'), true);
    assert.equal(preferTypedAddress('katrin.weber@example.de'), true);
    assert.equal(preferTypedAddress('  kat  '), false);
    assert.equal(preferTypedAddress(''), false);
  });

  it('uses the suggestion after the user moved through the list with the arrow keys', () => {
    assert.equal(preferTypedAddress('foo@', true), false);
  });

  it('collects display names from From, To and Cc', () => {
    const names = namesFromMessage({
      from: { address: 'Katrin.Weber@example.de', name: 'Katrin Weber' },
      to: ['"Doe, John" <john@x.de>', 'plain@x.de'],
      cc: ['Anna <anna@x.de>'],
    });
    assert.equal(names.get('katrin.weber@example.de'), 'Katrin Weber');
    assert.equal(names.get('john@x.de'), 'Doe, John');
    assert.equal(names.get('anna@x.de'), 'Anna');
    assert.equal(names.has('plain@x.de'), false);
  });
});

/* ------------------------------------------------------------------ */
/* Window content (buildSnapshot)                                      */
/* ------------------------------------------------------------------ */

describe('buildSnapshot', () => {
  it('returns null when no mailbox can send', () => {
    assert.equal(buildSnapshot({ mode: 'new' }, undefined, [readOnly], [], 'de', t, deps), null);
  });

  it('starts a new message from the primary sendable mailbox with its signature', () => {
    const snap = must(buildSnapshot({ mode: 'new' }, undefined, mailboxes, signatures, 'de', t, deps));
    assert.equal(snap.mailboxId, 'mb-info');
    assert.equal(snap.subject, '');
    assert.equal(snap.dirty, false);
    assert.ok(snap.html.includes('data-ff-signature'));
    assert.ok(snap.html.includes('Gruss Info'));
  });

  it('falls back to the primary mailbox when the requested one cannot send', () => {
    const init: ComposeInit = { mode: 'new', mailboxId: 'mb-x' };
    assert.equal(must(buildSnapshot(init, undefined, mailboxes, [], 'de', t, deps)).mailboxId, 'mb-info');
  });

  it('parses prefilled recipients', () => {
    const init: ComposeInit = { mode: 'new', to: ['Anna <anna@x.de>', 'bob@y.de; anna@x.de'] };
    const snap = must(buildSnapshot(init, undefined, mailboxes, [], 'de', t, deps));
    assert.deepEqual(addresses(snap.to), ['anna@x.de', 'bob@y.de']);
    assert.equal(snap.to[0].name, 'Anna');
  });

  it('replies with German subject, the sender as recipient and the quoted original', () => {
    const msg = makeMessage();
    const snap = must(buildSnapshot({ mode: 'reply', message: msg }, msg, mailboxes, signatures, 'de', t, deps));
    assert.deepEqual(addresses(snap.to), ['kunde@example.de']);
    assert.equal(snap.subject, 'AW: Angebot');
    assert.equal(snap.inReplyToMessageId, 'm-1');
    assert.ok(snap.html.includes('data-ff-quote'));
    assert.ok(snap.html.includes('Hallo'));
    assert.ok(snap.html.includes('D(2026-01-01T10:00:00Z)'), 'quote header uses the injected date formatter');
  });

  it('shows the sender name on reply chips', () => {
    const msg = makeMessage();
    const snap = must(buildSnapshot({ mode: 'reply', message: msg }, msg, mailboxes, signatures, 'de', t, deps));
    assert.equal(snap.to[0].name, 'Kunde GmbH');
  });

  it('starts new mails, replies and forwards with an empty paragraph above the signature', () => {
    const msg = makeMessage();
    for (const mode of ['new', 'reply', 'forward'] as const) {
      const init: ComposeInit = mode === 'new' ? { mode } : { mode, message: msg };
      const snap = must(buildSnapshot(init, mode === 'new' ? undefined : msg, mailboxes, signatures, 'de', t, deps));
      assert.ok(snap.html.startsWith('<p><br></p><div data-ff-signature'), `${mode}: ${snap.html.slice(0, 60)}`);
      const sig = snap.html.indexOf('data-ff-signature');
      const quote = snap.html.indexOf('data-ff-quote');
      if (mode !== 'new') assert.ok(quote > sig, `${mode}: quote below the signature`);
    }
  });

  it('replies to the original recipients when replying to our own sent mail', () => {
    const msg = makeMessage({ from: { address: 'info@frankiflow.de', name: '' }, to: ['kunde@example.de'] });
    const snap = must(buildSnapshot({ mode: 'reply', message: msg }, msg, mailboxes, [], 'de', t, deps));
    assert.deepEqual(addresses(snap.to), ['kunde@example.de']);
  });

  it('reply all excludes our mailboxes and deduplicates', () => {
    const msg = makeMessage({
      to: ['info@frankiflow.de', 'team@frankiflow.de', 'b@x.de'],
      cc: ['B@x.de', 'c@x.de'],
    });
    const snap = must(buildSnapshot({ mode: 'replyAll', message: msg }, msg, mailboxes, [], 'en', t, deps));
    assert.deepEqual(addresses(snap.to), ['kunde@example.de', 'b@x.de']);
    assert.deepEqual(addresses(snap.cc), ['c@x.de']);
    assert.equal(snap.showCc, true);
    assert.equal(snap.subject, 'Re: Angebot');
  });

  it('forwards with WG: subject, no recipients and the original attachments', () => {
    const msg = makeMessage({
      hasAttachments: true,
      attachments: [{ id: 'a1', messageId: 'm-1', filename: 'preis.pdf', contentType: 'application/pdf', size: 1000 }],
    });
    const snap = must(buildSnapshot({ mode: 'forward', message: msg }, msg, mailboxes, [], 'de', t, deps));
    assert.equal(snap.subject, 'WG: Angebot');
    assert.deepEqual(snap.to, []);
    assert.equal(snap.inReplyToMessageId, undefined);
    assert.equal(snap.attachments.length, 1);
    assert.equal(snap.attachments[0].id, 'meta-a1');
    assert.equal(snap.attachments[0].meta?.filename, 'preis.pdf');
  });

  it('restores a saved draft and strips scripts from its body', () => {
    const draft = makeMessage({
      id: 'd-1',
      direction: 'draft',
      folder: 'drafts',
      from: { address: 'info@frankiflow.de', name: '' },
      subject: 'Entwurf',
      to: ['a@x.de'],
      cc: ['c@x.de'],
      htmlBody: '<p>Entwurf <script>x()</script>Text</p>',
    });
    const snap: ComposerSnapshot = must(
      buildSnapshot({ mode: 'draft', draftId: 'd-1', message: draft }, draft, mailboxes, [], 'de', t, deps),
    );
    assert.equal(snap.draftId, 'd-1');
    assert.equal(snap.subject, 'Entwurf');
    assert.deepEqual(addresses(snap.to), ['a@x.de']);
    assert.equal(snap.showCc, true);
    assert.equal(snap.mailboxId, 'mb-info');
    assert.equal(snap.dirty, false);
    assert.ok(snap.html.includes('Entwurf'));
    assert.ok(!snap.html.includes('script'));
  });
});
