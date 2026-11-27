import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoBackend } from '../src/lib/backend/demo/index.ts';
import type {
  Draft,
  Folder,
  MailBackend,
  ThreadQuery,
  ThreadSummary,
} from '../src/lib/backend/types.ts';
import { createMemoryStorage } from './helpers/memory-storage.ts';

const ADMIN_EMAIL = 'demo@frankiflow.de';
const ADMIN_PASSWORD = 'demo1234';
const INFO = 'mb-info';
const TEAM = 'mb-team';
const DAY_MS = 86_400_000;

async function signedInBackend(): Promise<MailBackend> {
  const backend = createDemoBackend(createMemoryStorage());
  const result = await backend.signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.equal(result.ok, true);
  return backend;
}

async function listAll(
  backend: MailBackend,
  folder: Folder,
  mailboxId?: string
): Promise<ThreadSummary[]> {
  const q: ThreadQuery = { folder, limit: 500 };
  if (mailboxId) q.mailboxId = mailboxId;
  const { threads } = await backend.listThreads(q);
  return threads;
}

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    mailboxId: INFO,
    to: ['kunde@example.de'],
    cc: [],
    bcc: [],
    subject: 'Testnachricht',
    html: '<p>Hallo</p>',
    text: 'Hallo',
    attachments: [],
    ...overrides,
  };
}

describe('session', () => {
  it('getSession is null before sign-in and returns the session after', async () => {
    const backend = createDemoBackend(createMemoryStorage());
    assert.equal(await backend.getSession(), null);

    const result = await backend.signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert.equal(result.ok, true);

    const session = await backend.getSession();
    assert.ok(session);
    assert.equal(session.email, ADMIN_EMAIL);
    assert.equal(session.role, 'admin');
    assert.equal(session.mode, 'demo');
  });

  it('wrong password returns auth:invalid and creates no session', async () => {
    const backend = createDemoBackend(createMemoryStorage());
    assert.deepEqual(await backend.signIn(ADMIN_EMAIL, 'falsch-123'), { ok: false, error: 'auth:invalid' });
    assert.equal(await backend.getSession(), null);
  });

  it('signOut clears the session', async () => {
    const backend = await signedInBackend();
    await backend.signOut();
    assert.equal(await backend.getSession(), null);
  });

  it('session survives creating a new backend on the same storage', async () => {
    const storage = createMemoryStorage();
    const first = createDemoBackend(storage);
    await first.signIn(ADMIN_EMAIL, ADMIN_PASSWORD);

    const second = createDemoBackend(storage);
    const session = await second.getSession();
    assert.ok(session);
    assert.equal(session.email, ADMIN_EMAIL);
  });
});

describe('folders', () => {
  it('inbox lists threads with pinned first, then newest first', async () => {
    const backend = await signedInBackend();
    const threads = await listAll(backend, 'inbox');
    assert.ok(threads.length > 0);
    assert.equal(threads[0].id, 'th-01');
    assert.equal(threads[0].isPinned, true);

    let seenUnpinned = false;
    for (let i = 0; i < threads.length; i += 1) {
      if (!threads[i].isPinned) {
        seenUnpinned = true;
      } else {
        assert.equal(seenUnpinned, false, 'pinned thread listed after an unpinned one');
      }
      if (i > 0 && threads[i - 1].isPinned === threads[i].isPinned) {
        assert.ok(
          threads[i - 1].lastMessageAt >= threads[i].lastMessageAt,
          'threads are not sorted newest first'
        );
      }
    }
  });

  it('all excludes spam and trash threads', async () => {
    const backend = await signedInBackend();
    // Sanity check against the seed: these threads exist in spam/trash.
    const spam = (await listAll(backend, 'spam')).map((t) => t.id);
    const trash = (await listAll(backend, 'trash')).map((t) => t.id);
    assert.ok(spam.includes('th-43'));
    assert.ok(trash.includes('th-44'));
    assert.ok(trash.includes('th-45'));

    const ids = (await listAll(backend, 'all')).map((t) => t.id);
    assert.ok(ids.includes('th-01'));
    for (const id of [...spam, ...trash]) {
      assert.equal(ids.includes(id), false, `${id} must not appear in all`);
    }
  });

  it('starred shows only starred threads', async () => {
    const backend = await signedInBackend();
    const threads = await listAll(backend, 'starred');
    assert.ok(threads.length > 0);
    for (const t of threads) {
      assert.equal(t.isStarred, true, `${t.id} is not starred`);
    }
    const ids = threads.map((t) => t.id);
    assert.ok(ids.includes('th-01'));
    assert.equal(ids.includes('th-02'), false);
  });

  it('pagination with limit and before returns disjoint pages', async () => {
    const backend = await signedInBackend();
    const first = await backend.listThreads({ folder: 'inbox', limit: 10 });
    assert.equal(first.threads.length, 10);
    const cursor = first.nextBefore;
    assert.ok(cursor, 'expected a nextBefore cursor when more threads exist');

    const second = await backend.listThreads({ folder: 'inbox', limit: 10, before: cursor });
    assert.equal(second.threads.length, 10);

    const firstIds = new Set(first.threads.map((t) => t.id));
    for (const t of second.threads) {
      assert.equal(firstIds.has(t.id), false, `${t.id} appears on both pages`);
    }
  });

  it('walking all pages yields the full inbox exactly once and in order', async () => {
    const backend = await signedInBackend();
    const everything = (await listAll(backend, 'inbox')).map((t) => t.id);

    const walked: string[] = [];
    let before: string | undefined;
    for (let page = 0; page < 50; page += 1) {
      const q: ThreadQuery = { folder: 'inbox', limit: 7 };
      if (before) q.before = before;
      const result = await backend.listThreads(q);
      walked.push(...result.threads.map((t) => t.id));
      before = result.nextBefore;
      if (!before) break;
    }

    assert.deepEqual(walked, everything);
    assert.equal(new Set(walked).size, walked.length);
  });
});

describe('threads and counts', () => {
  it('getThread returns the messages oldest first', async () => {
    const backend = await signedInBackend();
    const messages = await backend.getThread('th-05');
    assert.deepEqual(
      messages.map((m) => m.id),
      [
        'msg-05a',
        'msg-05b',
        'msg-05c',
        'msg-05d',
        'msg-05e',
        'msg-05f',
        'msg-05g',
        'msg-05h',
      ]
    );
  });

  it('getThread rejects an unknown thread with not-found', async () => {
    const backend = await signedInBackend();
    await assert.rejects(backend.getThread('th-does-not-exist'), {
      message: 'not-found',
    });
  });

  it('counts drop after marking a message read', async () => {
    const backend = await signedInBackend();
    const before = await backend.counts();
    assert.ok((before.inbox ?? 0) > 0);

    // msg-01 is unread, starred and in the inbox.
    await backend.updateMessages(['msg-01'], { isRead: true });

    const after = await backend.counts();
    assert.equal(after.inbox, (before.inbox ?? 0) - 1);
    assert.equal(after.starred, (before.starred ?? 0) - 1);
  });

  it('a thread with an inbound message in inbox and our reply in sent shows messageCount 2 in both', async () => {
    const backend = await signedInBackend();
    const info = (await backend.listMailboxes()).find((mb) => mb.id === INFO);
    assert.ok(info);

    // Sending to our own address yields an inbound copy in the info inbox
    // and the outbound message in sent, both in one thread.
    const result = await backend.send(
      makeDraft({ to: [info.address], subject: 'Konversation Zählung' })
    );
    assert.equal(result.ok, true);

    const inboxThread = (await listAll(backend, 'inbox', INFO)).find(
      (t) => t.subject === 'Konversation Zählung'
    );
    const sentThread = (await listAll(backend, 'sent', INFO)).find(
      (t) => t.latestMessageId === result.messageId
    );
    assert.ok(inboxThread, 'thread missing from inbox');
    assert.ok(sentThread, 'thread missing from sent');
    assert.equal(inboxThread.id, sentThread.id);
    assert.equal(inboxThread.messageCount, 2);
    assert.equal(sentThread.messageCount, 2);
  });
});

describe('message updates', () => {
  it('archive moves a thread out of the inbox and back again', async () => {
    const backend = await signedInBackend();
    await backend.updateMessages(['msg-01'], { folder: 'archive' });
    assert.ok((await listAll(backend, 'archive', INFO)).some((t) => t.id === 'th-01'));
    assert.equal((await listAll(backend, 'inbox', INFO)).some((t) => t.id === 'th-01'), false);

    await backend.updateMessages(['msg-01'], { folder: 'inbox' });
    assert.ok((await listAll(backend, 'inbox', INFO)).some((t) => t.id === 'th-01'));
  });

  it('move to trash puts the thread in trash', async () => {
    const backend = await signedInBackend();
    await backend.updateMessages(['msg-02'], { folder: 'trash' });
    assert.ok((await listAll(backend, 'trash')).some((t) => t.id === 'th-02'));
    assert.equal((await listAll(backend, 'all')).some((t) => t.id === 'th-02'), false);
  });

  it('star and unstar', async () => {
    const backend = await signedInBackend();
    await backend.updateMessages(['msg-02'], { isStarred: true });
    assert.ok((await listAll(backend, 'starred')).some((t) => t.id === 'th-02'));

    await backend.updateMessages(['msg-02'], { isStarred: false });
    assert.equal((await listAll(backend, 'starred')).some((t) => t.id === 'th-02'), false);
  });

  it('pin and unpin reorder the inbox', async () => {
    const backend = await signedInBackend();
    await backend.updateMessages(['msg-02'], { isPinned: true });
    const pinned = await listAll(backend, 'inbox', INFO);
    assert.deepEqual(
      pinned.slice(0, 2).map((t) => t.id).sort(),
      ['th-01', 'th-02']
    );
    assert.equal(pinned[0].isPinned, true);
    assert.equal(pinned[1].isPinned, true);

    await backend.updateMessages(['msg-02'], { isPinned: false });
    const unpinned = await listAll(backend, 'inbox', INFO);
    assert.equal(unpinned[0].id, 'th-01');
    assert.equal(unpinned.find((t) => t.id === 'th-02')?.isPinned, false);
  });

  it('label add and remove', async () => {
    const backend = await signedInBackend();
    // msg-02 starts with lbl-angebote only.
    await backend.updateMessages(['msg-02'], { labelIdsAdd: ['lbl-privat'] });
    let [msg] = await backend.getThread('th-02');
    assert.deepEqual(msg.labelIds.slice().sort(), ['lbl-angebote', 'lbl-privat']);

    await backend.updateMessages(['msg-02'], { labelIdsRemove: ['lbl-angebote'] });
    [msg] = await backend.getThread('th-02');
    assert.deepEqual(msg.labelIds, ['lbl-privat']);
  });

  it('deleteForever rejects messages outside trash and spam', async () => {
    const backend = await signedInBackend();
    await assert.rejects(backend.deleteForever(['msg-01']), {
      message: 'permission:denied',
    });
    const [msg] = await backend.getThread('th-01');
    assert.equal(msg.id, 'msg-01');
  });

  it('deleteForever removes messages from trash', async () => {
    const backend = await signedInBackend();
    await backend.deleteForever(['msg-44']);
    await assert.rejects(backend.getThread('th-44'), { message: 'not-found' });
    assert.equal((await listAll(backend, 'trash')).some((t) => t.id === 'th-44'), false);
  });
});

describe('drafts', () => {
  it('saveDraft makes the draft appear in drafts', async () => {
    const backend = await signedInBackend();
    const { id } = await backend.saveDraft(makeDraft({ subject: 'Entwurf Alpha' }));
    const drafts = await listAll(backend, 'drafts', INFO);
    assert.ok(
      drafts.some((t) => t.latestMessageId === id && t.subject === 'Entwurf Alpha')
    );
  });

  it('saveDraft with an existing id updates that draft', async () => {
    const backend = await signedInBackend();
    const { id } = await backend.saveDraft(makeDraft({ subject: 'Entwurf Beta' }));
    const second = await backend.saveDraft(
      makeDraft({ id, subject: 'Entwurf Beta überarbeitet' })
    );
    assert.equal(second.id, id);
    const drafts = await listAll(backend, 'drafts', INFO);
    const matching = drafts.filter((t) => t.latestMessageId === id);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].subject, 'Entwurf Beta überarbeitet');
  });

  it('deleteDraft removes the draft', async () => {
    const backend = await signedInBackend();
    const { id } = await backend.saveDraft(makeDraft({ subject: 'Entwurf Gamma' }));
    await backend.deleteDraft(id);
    const drafts = await listAll(backend, 'drafts', INFO);
    assert.equal(drafts.some((t) => t.latestMessageId === id), false);
  });

  it('sending a saved draft removes the draft and sends it', async () => {
    const backend = await signedInBackend();
    const { id } = await backend.saveDraft(makeDraft({ subject: 'Entwurf Delta' }));
    const result = await backend.send(makeDraft({ id, subject: 'Entwurf Delta' }));
    assert.equal(result.ok, true);

    const drafts = await listAll(backend, 'drafts', INFO);
    assert.equal(drafts.some((t) => t.latestMessageId === id), false);
    const sent = await listAll(backend, 'sent', INFO);
    assert.ok(sent.some((t) => t.subject === 'Entwurf Delta'));
  });
});

describe('send', () => {
  it('rejects an invalid recipient with compose:invalid-recipient', async () => {
    const backend = await signedInBackend();
    await assert.rejects(
      backend.send(makeDraft({ to: ['kein-gueltiger-empfaenger'] })),
      { message: 'compose:invalid-recipient' }
    );
    await assert.rejects(backend.send(makeDraft({ to: [] })), {
      message: 'compose:invalid-recipient',
    });
  });

  it('a sent message appears in Sent', async () => {
    const backend = await signedInBackend();
    const result = await backend.send(makeDraft({ subject: 'Versand Test Sent' }));
    assert.equal(result.ok, true);
    assert.ok(result.messageId);

    const sent = await listAll(backend, 'sent', INFO);
    assert.ok(
      sent.some(
        (t) => t.latestMessageId === result.messageId && t.subject === 'Versand Test Sent'
      )
    );
  });

  it('sending to team@frankiflow.de delivers to that mailbox inbox', async () => {
    const backend = await signedInBackend();
    const result = await backend.send(
      makeDraft({ to: ['team@frankiflow.de'], subject: 'Interne Frage Einsatz' })
    );
    assert.equal(result.ok, true);

    const teamInbox = await listAll(backend, 'inbox', TEAM);
    const delivered = teamInbox.find((t) => t.subject === 'Interne Frage Einsatz');
    assert.ok(delivered, 'message was not delivered to the team inbox');
    // The thread also contains the outbound copy in the info mailbox's Sent.
    assert.ok(delivered.mailboxIds.includes(TEAM));
  });

  it('a reply stays in its existing thread', async () => {
    const backend = await signedInBackend();
    const before = await backend.getThread('th-03');
    assert.equal(before.length, 2);

    const result = await backend.send(
      makeDraft({
        subject: 'Re: Treppenhausreinigung Bornheim',
        inReplyToMessageId: 'msg-03a',
      })
    );
    assert.equal(result.ok, true);

    const after = await backend.getThread('th-03');
    assert.equal(after.length, 3);
    const reply = after[after.length - 1];
    assert.equal(reply.id, result.messageId);
    assert.equal(reply.threadId, 'th-03');
  });

  it('a future scheduledAt lands in Scheduled, not Sent', async () => {
    const backend = await signedInBackend();
    const scheduledAt = new Date(Date.now() + 2 * DAY_MS).toISOString();
    const result = await backend.send(
      makeDraft({ subject: 'Geplant Test', scheduledAt })
    );
    assert.equal(result.ok, true);

    const scheduled = await listAll(backend, 'scheduled', INFO);
    assert.ok(scheduled.some((t) => t.latestMessageId === result.messageId));
    const sent = await listAll(backend, 'sent', INFO);
    assert.equal(sent.some((t) => t.latestMessageId === result.messageId), false);
  });
});

describe('demo users', () => {
  const TEAM_USER = {
    email: 'team-only@example.com',
    name: 'Team Only',
    role: 'member' as const,
    mailboxAddresses: ['team@frankiflow.de'],
    password: 'teampass123',
  };

  it('a team-only user sees only the team mailbox and cannot see info threads', async () => {
    const backend = await signedInBackend();
    await backend.createDemoUser(TEAM_USER);

    const result = await backend.signIn(TEAM_USER.email, TEAM_USER.password);
    assert.equal(result.ok, true);
    const session = await backend.getSession();
    assert.equal(session?.email, TEAM_USER.email);

    const mailboxes = await backend.listMailboxes();
    assert.deepEqual(mailboxes.map((m) => m.id), [TEAM]);

    const inbox = await listAll(backend, 'inbox');
    assert.ok(inbox.some((t) => t.id === 'th-06'));
    for (const t of inbox) {
      assert.deepEqual(t.mailboxIds, [TEAM], `${t.id} leaks a non-team mailbox`);
    }

    const infoOnly = await listAll(backend, 'all', INFO);
    assert.equal(infoOnly.length, 0);
    await assert.rejects(backend.getThread('th-01'), { message: 'not-found' });
  });

  it('a team-only user cannot update a message of the info mailbox', async () => {
    const backend = await signedInBackend();
    await backend.createDemoUser(TEAM_USER);
    await backend.signIn(TEAM_USER.email, TEAM_USER.password);

    await assert.rejects(backend.updateMessages(['msg-01'], { isRead: true }), {
      message: 'not-found',
    });
    // The team mailbox is still updatable.
    await backend.updateMessages(['msg-06'], { isRead: true });
  });

  it('a duplicate email rejects with demo:user-exists', async () => {
    const backend = await signedInBackend();
    await assert.rejects(
      backend.createDemoUser({
        ...TEAM_USER,
        email: ADMIN_EMAIL,
      }),
      { message: 'demo:user-exists' }
    );
  });

  it('listDemoUsers returns no password fields', async () => {
    const backend = await signedInBackend();
    await backend.createDemoUser(TEAM_USER);
    const users = await backend.listDemoUsers();
    assert.equal(users.length, 2);
    for (const u of users) {
      assert.deepEqual(Object.keys(u).sort(), ['email', 'mailboxAddresses', 'name', 'role']);
    }
    assert.equal(JSON.stringify(users).includes('assword'), false);
  });

  it('resetDemo restores the seed and removes created users and sent mail', async () => {
    const storage = createMemoryStorage();
    const backend = createDemoBackend(storage);
    await backend.signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    const inboxBefore = (await backend.counts()).inbox;
    const threadsBefore = (await listAll(backend, 'all')).length;

    await backend.createDemoUser(TEAM_USER);
    await backend.updateMessages(['msg-01'], { isRead: true });
    await backend.send(makeDraft({ subject: 'Wird zurückgesetzt' }));

    await backend.resetDemo();
    await backend.signIn(ADMIN_EMAIL, ADMIN_PASSWORD);

    const users = await backend.listDemoUsers();
    assert.deepEqual(users.map((u) => u.email), [ADMIN_EMAIL]);
    assert.equal((await backend.counts()).inbox, inboxBefore);
    assert.equal((await listAll(backend, 'all')).length, threadsBefore);
    assert.equal(
      (await listAll(backend, 'sent', INFO)).some((t) => t.subject === 'Wird zurückgesetzt'),
      false
    );
  });
});
