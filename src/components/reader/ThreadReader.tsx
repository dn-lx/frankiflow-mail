'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useComposer } from '@/components/composer';
import { SnoozeMenu } from '@/components/list/SnoozeMenu';
import { useApp } from '@/components/providers/AppProvider';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Menu,
  Skeleton,
  useToast,
  type MenuItem,
} from '@/components/ui';
import type { Label, Mailbox, Message, Priority } from '@/lib/backend/types';
import { describeError } from '@/lib/i18n';
import { MessageView } from './MessageView';
import { openPrintView } from './printThread';
import './strings';
import styles from './ThreadReader.module.css';

export interface ThreadReaderProps {
  threadId: string;
  mailboxId?: string;
  onBack: () => void;
  onNavigate: (dir: 'next' | 'prev') => void;
  onRemoved: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

export function ThreadReader({
  threadId,
  mailboxId,
  onBack,
  onNavigate,
  onRemoved,
}: ThreadReaderProps) {
  const { backend, settings, lang, t } = useApp();
  const composer = useComposer();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingForever, setDeletingForever] = useState(false);

  const markedReadThreadRef = useRef<string | null>(null);

  const loadThread = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const [msgs, lbls, mbs] = await Promise.all([
          backend.getThread(threadId),
          backend.listLabels(),
          backend.listMailboxes(),
        ]);
        setMessages(msgs);
        setLabels(lbls);
        setMailboxes(mbs);

        if (markedReadThreadRef.current !== threadId) {
          markedReadThreadRef.current = threadId;
          const unreadIds = msgs.filter((m) => !m.isRead).map((m) => m.id);
          if (unreadIds.length > 0) {
            await backend.updateMessages(unreadIds, { isRead: true });
            setMessages((prev) =>
              prev.map((m) => (unreadIds.includes(m.id) ? { ...m, isRead: true } : m)),
            );
          }
        }
      } catch (err) {
        if (!silent) setError(describeError(lang, err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [backend, threadId, lang],
  );

  useEffect(() => {
    markedReadThreadRef.current = null;
    void loadThread(false);
  }, [loadThread]);

  useEffect(() => {
    return backend.onChange(() => {
      void loadThread(true);
    });
  }, [backend, loadThread]);

  const latestMessage = messages[messages.length - 1];
  const allIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const userAddresses = useMemo(() => mailboxes.map((m) => m.address), [mailboxes]);

  const subject = latestMessage?.subject || messages[0]?.subject || t('reader.noSubject');
  const isStarred = messages.some((m) => m.isStarred);
  const isPinned = messages.some((m) => m.isPinned);
  const priority: Priority = latestMessage?.priority ?? 'normal';
  const allInTrashOrSpam =
    messages.length > 0 && messages.every((m) => m.folder === 'trash' || m.folder === 'spam');
  const isSpam = messages.length > 0 && messages.every((m) => m.folder === 'spam');

  const threadLabelIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of messages) {
      for (const id of m.labelIds) set.add(id);
    }
    return set;
  }, [messages]);

  const threadLabels = useMemo(
    () => labels.filter((l) => threadLabelIds.has(l.id)),
    [labels, threadLabelIds],
  );

  const moveThread = useCallback(
    async (targetFolder: Message['folder'], toastKey: string, folderLabel?: string) => {
      if (allIds.length === 0) return;
      const snapshot = messages.map((m) => ({
        id: m.id,
        folder: m.folder,
        snoozedUntil: m.snoozedUntil ?? null,
      }));
      try {
        await backend.updateMessages(allIds, { folder: targetFolder, snoozedUntil: null });
        onRemoved();
        toast({
          message: folderLabel ? t(toastKey, { folder: folderLabel }) : t(toastKey),
          tone: 'info',
          actionLabel: t('common.undo'),
          onAction: () => {
            const byFolder = new Map<Message['folder'], string[]>();
            for (const s of snapshot) {
              const list = byFolder.get(s.folder) ?? [];
              list.push(s.id);
              byFolder.set(s.folder, list);
            }
            for (const [f, ids] of byFolder) {
              void backend.updateMessages(ids, { folder: f }).catch((err) => {
                toast({ message: describeError(lang, err), tone: 'error' });
              });
            }
          },
        });
      } catch (err) {
        toast({ message: describeError(lang, err), tone: 'error' });
      }
    },
    [allIds, messages, backend, onRemoved, toast, t, lang],
  );

  const handleDelete = useCallback(() => {
    if (allInTrashOrSpam) {
      setConfirmDeleteOpen(true);
    } else {
      void moveThread('trash', 'reader.toast.deleted');
    }
  }, [allInTrashOrSpam, moveThread]);

  const handleConfirmDeleteForever = useCallback(async () => {
    if (allIds.length === 0) return;
    setDeletingForever(true);
    try {
      await backend.deleteForever(allIds);
      setConfirmDeleteOpen(false);
      toast({ message: t('reader.toast.deletedForever'), tone: 'info' });
      onRemoved();
    } catch (err) {
      toast({ message: describeError(lang, err), tone: 'error' });
    } finally {
      setDeletingForever(false);
    }
  }, [allIds, backend, toast, t, onRemoved, lang]);

  const handleToggleStar = useCallback(async () => {
    if (allIds.length === 0) return;
    const next = !isStarred;
    setMessages((prev) => prev.map((m) => ({ ...m, isStarred: next })));
    try {
      await backend.updateMessages(allIds, { isStarred: next });
      toast({
        message: t(next ? 'reader.toast.starred' : 'reader.toast.unstarred'),
        tone: 'info',
      });
    } catch (err) {
      setMessages((prev) => prev.map((m) => ({ ...m, isStarred: !next })));
      toast({ message: describeError(lang, err), tone: 'error' });
    }
  }, [allIds, isStarred, backend, toast, t, lang]);

  const handleTogglePin = useCallback(async () => {
    if (allIds.length === 0) return;
    const next = !isPinned;
    setMessages((prev) => prev.map((m) => ({ ...m, isPinned: next })));
    try {
      await backend.updateMessages(allIds, { isPinned: next });
      toast({
        message: t(next ? 'reader.toast.pinned' : 'reader.toast.unpinned'),
        tone: 'info',
      });
    } catch (err) {
      setMessages((prev) => prev.map((m) => ({ ...m, isPinned: !next })));
      toast({ message: describeError(lang, err), tone: 'error' });
    }
  }, [allIds, isPinned, backend, toast, t, lang]);

  const handlePriority = useCallback(
    async (next: Priority) => {
      if (allIds.length === 0) return;
      setMessages((prev) => prev.map((m) => ({ ...m, priority: next })));
      try {
        await backend.updateMessages(allIds, { priority: next });
        toast({ message: t('reader.toast.priority'), tone: 'info' });
      } catch (err) {
        toast({ message: describeError(lang, err), tone: 'error' });
      }
    },
    [allIds, backend, toast, t, lang],
  );

  const handleMarkUnread = useCallback(async () => {
    if (allIds.length === 0) return;
    try {
      await backend.updateMessages(allIds, { isRead: false });
      toast({ message: t('reader.toast.markedUnread'), tone: 'info' });
      onBack();
    } catch (err) {
      toast({ message: describeError(lang, err), tone: 'error' });
    }
  }, [allIds, backend, toast, t, onBack, lang]);

  const handleSnooze = useCallback(
    async (isoUntil: string) => {
      if (allIds.length === 0) return;
      const snapshot = messages.map((m) => ({ id: m.id, folder: m.folder }));
      try {
        await backend.updateMessages(allIds, { folder: 'snoozed', snoozedUntil: isoUntil });
        onRemoved();
        toast({
          message: t('reader.toast.snoozed'),
          tone: 'info',
          actionLabel: t('common.undo'),
          onAction: () => {
            for (const s of snapshot) {
              void backend.updateMessages([s.id], { folder: s.folder, snoozedUntil: null });
            }
          },
        });
      } catch (err) {
        toast({ message: describeError(lang, err), tone: 'error' });
      }
    },
    [allIds, messages, backend, onRemoved, toast, t, lang],
  );

  const handleToggleLabel = useCallback(
    async (labelId: string) => {
      if (allIds.length === 0) return;
      const has = threadLabelIds.has(labelId);
      try {
        await backend.updateMessages(
          allIds,
          has ? { labelIdsRemove: [labelId] } : { labelIdsAdd: [labelId] },
        );
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            labelIds: has
              ? m.labelIds.filter((id) => id !== labelId)
              : Array.from(new Set([...m.labelIds, labelId])),
          })),
        );
        toast({ message: t('reader.toast.labelsUpdated'), tone: 'info' });
      } catch (err) {
        toast({ message: describeError(lang, err), tone: 'error' });
      }
    },
    [allIds, threadLabelIds, backend, toast, t, lang],
  );

  const handleReply = useCallback(
    (msg: Message) => {
      composer.open({ mode: 'reply', message: msg, mailboxId: mailboxId ?? msg.mailboxId });
    },
    [composer, mailboxId],
  );

  const handleReplyAll = useCallback(
    (msg: Message) => {
      composer.open({ mode: 'replyAll', message: msg, mailboxId: mailboxId ?? msg.mailboxId });
    },
    [composer, mailboxId],
  );

  const handleForward = useCallback(
    (msg: Message) => {
      composer.open({ mode: 'forward', message: msg, mailboxId: mailboxId ?? msg.mailboxId });
    },
    [composer, mailboxId],
  );

  const handlePrint = useCallback(() => {
    const ok = openPrintView(
      subject,
      messages,
      lang,
      t,
      settings.loadRemoteImages === 'always',
    );
    if (!ok) {
      toast({ message: t('reader.toast.printBlocked'), tone: 'error' });
    }
  }, [subject, messages, lang, t, settings.loadRemoteImages, toast]);

  // Reader keyboard shortcuts: r, a, f, e, #, s
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      if (!latestMessage) return;

      switch (e.key) {
        case 'r':
          e.preventDefault();
          handleReply(latestMessage);
          break;
        case 'a':
          e.preventDefault();
          handleReplyAll(latestMessage);
          break;
        case 'f':
          e.preventDefault();
          handleForward(latestMessage);
          break;
        case 'e':
          e.preventDefault();
          void moveThread('archive', 'reader.toast.archived');
          break;
        case '#':
          e.preventDefault();
          handleDelete();
          break;
        case 's':
          e.preventDefault();
          void handleToggleStar();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    latestMessage,
    handleReply,
    handleReplyAll,
    handleForward,
    moveThread,
    handleDelete,
    handleToggleStar,
  ]);

  const moveItems: MenuItem[] = useMemo(
    () => [
      {
        id: 'move-inbox',
        label: t('reader.folder.inbox'),
        icon: 'inbox',
        onSelect: () => void moveThread('inbox', 'reader.toast.moved', t('reader.folder.inbox')),
      },
      {
        id: 'move-archive',
        label: t('reader.folder.archive'),
        icon: 'archive',
        onSelect: () => void moveThread('archive', 'reader.toast.moved', t('reader.folder.archive')),
      },
      {
        id: 'move-spam',
        label: t('reader.folder.spam'),
        icon: 'alert',
        onSelect: () => void moveThread('spam', 'reader.toast.moved', t('reader.folder.spam')),
      },
      {
        id: 'move-trash',
        label: t('reader.folder.trash'),
        icon: 'trash',
        danger: true,
        onSelect: () => void moveThread('trash', 'reader.toast.moved', t('reader.folder.trash')),
      },
    ],
    [moveThread, t],
  );

  const labelItems: MenuItem[] = useMemo(
    () =>
      labels.map((l) => ({
        id: `label-${l.id}`,
        label: l.name,
        checked: threadLabelIds.has(l.id),
        onSelect: () => void handleToggleLabel(l.id),
      })),
    [labels, threadLabelIds, handleToggleLabel],
  );

  const moreItems: MenuItem[] = useMemo(
    () => [
      {
        id: 'pin',
        label: t(isPinned ? 'reader.unpin' : 'reader.pin'),
        icon: 'pin',
        checked: isPinned,
        onSelect: () => void handleTogglePin(),
      },
      {
        id: 'prio-high',
        label: t('reader.priority.high'),
        checked: priority === 'high',
        onSelect: () => void handlePriority('high'),
      },
      {
        id: 'prio-normal',
        label: t('reader.priority.normal'),
        checked: priority === 'normal',
        onSelect: () => void handlePriority('normal'),
      },
      {
        id: 'prio-low',
        label: t('reader.priority.low'),
        checked: priority === 'low',
        onSelect: () => void handlePriority('low'),
      },
      { id: 'sep-1', separator: true },
      {
        id: 'unread',
        label: t('reader.markUnread'),
        onSelect: () => void handleMarkUnread(),
      },
      {
        id: 'print',
        label: t('reader.print'),
        icon: 'file',
        onSelect: handlePrint,
      },
      { id: 'sep-2', separator: true },
      {
        id: 'prev',
        label: t('reader.prev'),
        icon: 'chevron-left',
        shortcut: 'k',
        onSelect: () => onNavigate('prev'),
      },
      {
        id: 'next',
        label: t('reader.next'),
        icon: 'chevron-right',
        shortcut: 'j',
        onSelect: () => onNavigate('next'),
      },
    ],
    [
      t,
      isPinned,
      handleTogglePin,
      priority,
      handlePriority,
      handleMarkUnread,
      handlePrint,
      onNavigate,
    ],
  );

  if (loading) {
    return (
      <section className={styles.root} aria-busy="true" aria-label={t('common.loading')}>
        <div className={styles.toolbar}>
          <IconButton icon="chevron-left" label={t('reader.back')} onClick={onBack} />
          <Skeleton width={180} height={24} />
        </div>
        <div className={styles.scrollBody}>
          <div className={styles.skeletonHeader}>
            <Skeleton width="65%" height={28} />
            <Skeleton width={100} height={20} />
          </div>
          <div className={styles.skeletonCard}>
            <Skeleton lines={4} height={16} />
          </div>
          <div className={styles.skeletonCard}>
            <Skeleton lines={3} height={16} />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.root}>
        <div className={styles.toolbar}>
          <IconButton icon="chevron-left" label={t('reader.back')} onClick={onBack} />
        </div>
        <div className={styles.stateCenter}>
          <EmptyState
            icon="alert"
            title={t('reader.loadError.title')}
            text={error}
            action={
              <Button variant="primary" icon="refresh" onClick={() => void loadThread(false)}>
                {t('common.retry')}
              </Button>
            }
          />
        </div>
      </section>
    );
  }

  if (messages.length === 0) {
    return (
      <section className={styles.root}>
        <div className={styles.toolbar}>
          <IconButton icon="chevron-left" label={t('reader.back')} onClick={onBack} />
        </div>
        <div className={styles.stateCenter}>
          <EmptyState
            icon="inbox"
            title={t('reader.notFound.title')}
            text={t('reader.notFound.text')}
            action={
              <Button variant="secondary" icon="chevron-left" onClick={onBack}>
                {t('reader.back')}
              </Button>
            }
          />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.root} aria-label={subject}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <IconButton icon="chevron-left" label={t('reader.back')} onClick={onBack} />
          <IconButton
            icon="archive"
            label={`${t('reader.archive')} (e)`}
            onClick={() => void moveThread('archive', 'reader.toast.archived')}
          />
          <IconButton
            icon="trash"
            label={
              allInTrashOrSpam
                ? t('reader.deleteForever')
                : `${t('reader.delete')} (#)`
            }
            onClick={handleDelete}
          />
          <IconButton
            icon="alert"
            label={t(isSpam ? 'reader.notSpam' : 'reader.spam')}
            onClick={() =>
              void moveThread(
                isSpam ? 'inbox' : 'spam',
                isSpam ? 'reader.toast.notSpam' : 'reader.toast.spam',
              )
            }
          />
          <IconButton
            icon={isStarred ? 'star-filled' : 'star'}
            label={`${t(isStarred ? 'reader.unstar' : 'reader.star')} (s)`}
            pressed={isStarred}
            onClick={() => void handleToggleStar()}
          />
          <SnoozeMenu onPick={(iso) => void handleSnooze(iso)} />
          <Menu label={t('reader.move')} icon="inbox" items={moveItems} />
          {labels.length > 0 && (
            <Menu label={t('reader.labels')} icon="tag" items={labelItems} />
          )}
        </div>
        <div className={styles.toolbarGroup}>
          <Menu label={t('reader.more')} icon="more" items={moreItems} />
        </div>
      </header>

      <div className={styles.scrollBody}>
        <div className={styles.threadHeader}>
          <h1 className={styles.subject}>{subject}</h1>
          <div className={styles.badges}>
            <Badge tone="neutral">
              {messages.length === 1
                ? t('reader.messageCountOne')
                : t('reader.messageCount', { count: messages.length })}
            </Badge>
            {priority === 'high' && <Badge tone="danger">{t('reader.priority.high')}</Badge>}
            {threadLabels.map((lbl) => (
              <Badge key={lbl.id} color={lbl.color}>
                {lbl.name}
              </Badge>
            ))}
          </div>
        </div>

        <div className={styles.messages}>
          {messages.map((msg, idx) => (
            <MessageView
              key={msg.id}
              message={msg}
              defaultExpanded={idx === messages.length - 1}
              canCollapse={messages.length > 1}
              userAddresses={userAddresses}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
            />
          ))}
        </div>

        {latestMessage && (
          <div className={styles.desktopReplyBar}>
            <Button variant="secondary" icon="reply" onClick={() => handleReply(latestMessage)}>
              {t('reader.reply')}
            </Button>
            <Button variant="secondary" icon="reply-all" onClick={() => handleReplyAll(latestMessage)}>
              {t('reader.replyAll')}
            </Button>
            <Button variant="secondary" icon="forward" onClick={() => handleForward(latestMessage)}>
              {t('reader.forward')}
            </Button>
          </div>
        )}
      </div>

      {latestMessage && (
        <nav className={styles.phoneBottomBar} aria-label={t('reader.reply')}>
          <Button
            variant="secondary"
            icon="reply"
            className={styles.phoneAction}
            onClick={() => handleReply(latestMessage)}
          >
            {t('reader.reply')}
          </Button>
          <Button
            variant="secondary"
            icon="reply-all"
            className={styles.phoneAction}
            onClick={() => handleReplyAll(latestMessage)}
          >
            {t('reader.replyAll')}
          </Button>
          <Button
            variant="secondary"
            icon="forward"
            className={styles.phoneAction}
            onClick={() => handleForward(latestMessage)}
          >
            {t('reader.forward')}
          </Button>
        </nav>
      )}

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={t('reader.confirmDeleteTitle')}
        description={t('reader.confirmDeleteText')}
        size="sm"
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deletingForever}
              onClick={() => void handleConfirmDeleteForever()}
            >
              {t('reader.deleteForever')}
            </Button>
          </>
        }
      />
    </section>
  );
}
