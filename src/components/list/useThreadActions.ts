'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { useToast } from '@/components/ui';
import type { Folder, Label, Message, MessagePatch } from '@/lib/backend/types';
import { describeError } from '@/lib/i18n';
import { groupBy, messagesToMove, staysInView, type ConcreteFolder } from '@/lib/mail/threads';
import type { ThreadListData } from './useThreadList';
import './strings';

export interface ThreadActions {
  archive: (ids: readonly string[]) => void;
  trash: (ids: readonly string[]) => void;
  spam: (ids: readonly string[]) => void;
  move: (ids: readonly string[], folder: ConcreteFolder) => void;
  snooze: (ids: readonly string[], isoUntil: string) => void;
  setRead: (ids: readonly string[], read: boolean) => void;
  setStarred: (ids: readonly string[], starred: boolean) => void;
  setLabel: (ids: readonly string[], labelId: string, add: boolean) => void;
  deleteForever: (ids: readonly string[]) => Promise<void>;
}

interface Options {
  data: ThreadListData;
  folder: Folder;
  labelId?: string;
  labels: Label[];
  /** Called synchronously before threads disappear from the current view. */
  onRemoved: (ids: readonly string[]) => void;
}

type Prev = { id: string; folder: Message['folder']; snoozedUntil: string | null };

export function useThreadActions({ data, folder, labelId, labels, onRemoved }: Options): ThreadActions {
  const { backend, t, lang } = useApp();
  const toast = useToast();

  // Keep the latest values without re-creating the action functions.
  const ref = useRef({ data, folder, labelId, labels, onRemoved, t, lang });
  ref.current = { data, folder, labelId, labels, onRemoved, t, lang };

  const countText = useCallback((n: number) => (n === 1 ? ref.current.t('list.conversation') : ref.current.t('list.conversations', { count: n })), []);

  const fail = useCallback(
    (err: unknown, key: 'list.actionFailed' | 'list.undoFailed' = 'list.actionFailed') => {
      toast({ tone: 'error', message: ref.current.t(key, { error: describeError(ref.current.lang, err) }) });
    },
    [toast],
  );

  const loadThreads = useCallback(
    async (ids: readonly string[]) => (await Promise.all(ids.map((id) => backend.getThread(id)))).flat(),
    [backend],
  );

  /** Moves threads optimistically and offers Undo. */
  const moveTo = useCallback(
    (ids: readonly string[], target: ConcreteFolder | 'snooze', message: string, until?: string) => {
      if (ids.length === 0) return;
      const { data: d, folder: view } = ref.current;
      const dest: ConcreteFolder = target === 'snooze' ? 'snoozed' : target;
      const removes = !staysInView(view, dest);
      if (removes) ref.current.onRemoved(ids);
      const unhide = removes ? d.hide(ids) : () => undefined;
      let undone = false;

      const work = (async (): Promise<Prev[]> => {
        const msgs = messagesToMove(await loadThreads(ids), view, target);
        if (msgs.length === 0) return [];
        const prev = msgs.map((m) => ({ id: m.id, folder: m.folder, snoozedUntil: m.snoozedUntil ?? null }));
        const patch: MessagePatch = target === 'snooze' ? { folder: 'snoozed', snoozedUntil: until ?? null } : { folder: target };
        if (target !== 'snooze' && view === 'snoozed') patch.snoozedUntil = null;
        await backend.updateMessages(
          msgs.map((m) => m.id),
          patch,
        );
        return prev;
      })();

      work.then(
        async () => {
          if (undone) return;
          await ref.current.data.refresh().catch(() => undefined);
          unhide();
        },
        (err: unknown) => {
          unhide();
          fail(err);
          ref.current.data.refresh().catch(() => undefined);
        },
      );

      toast({
        tone: 'success',
        message,
        actionLabel: ref.current.t('common.undo'),
        onAction: () => {
          undone = true;
          unhide();
          void (async () => {
            try {
              const prev = await work;
              const groups = groupBy(prev, (p) => `${p.folder}|${p.snoozedUntil ?? ''}`);
              for (const group of groups.values()) {
                const first = group[0] as Prev;
                await backend.updateMessages(
                  group.map((p) => p.id),
                  { folder: first.folder, snoozedUntil: first.snoozedUntil },
                );
              }
              toast({ message: ref.current.t('list.done.undone') });
            } catch (err) {
              fail(err, 'list.undoFailed');
            } finally {
              ref.current.data.refresh().catch(() => undefined);
            }
          })();
        },
      });
    },
    [backend, fail, loadThreads, toast],
  );

  const archive = useCallback(
    (ids: readonly string[]) => moveTo(ids, 'archive', ref.current.t('list.done.archive', { count: countText(ids.length) })),
    [moveTo, countText],
  );
  const trash = useCallback(
    (ids: readonly string[]) => moveTo(ids, 'trash', ref.current.t('list.done.trash', { count: countText(ids.length) })),
    [moveTo, countText],
  );
  const spam = useCallback(
    (ids: readonly string[]) => moveTo(ids, 'spam', ref.current.t('list.done.spam', { count: countText(ids.length) })),
    [moveTo, countText],
  );
  const move = useCallback(
    (ids: readonly string[], target: ConcreteFolder) =>
      moveTo(
        ids,
        target,
        ref.current.t('list.done.move', { count: countText(ids.length), folder: ref.current.t(`folder.${target}`) }),
      ),
    [moveTo, countText],
  );
  const snooze = useCallback(
    (ids: readonly string[], isoUntil: string) => {
      const time = new Intl.DateTimeFormat(ref.current.lang === 'de' ? 'de-DE' : 'en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(isoUntil));
      moveTo(ids, 'snooze', ref.current.t('list.done.snooze', { count: countText(ids.length), time }), isoUntil);
    },
    [moveTo, countText],
  );

  const setRead = useCallback(
    (ids: readonly string[], read: boolean) => {
      if (ids.length === 0) return;
      const d = ref.current.data;
      const threads = d.threads.filter((th) => ids.includes(th.id));
      const clear = d.override(ids, (th) => ({ unreadCount: read ? 0 : Math.max(1, th.unreadCount) }));
      void (async () => {
        try {
          if (read) {
            const msgs = (await loadThreads(ids)).filter((m) => !m.isRead);
            if (msgs.length) await backend.updateMessages(msgs.map((m) => m.id), { isRead: true });
          } else {
            await backend.updateMessages(
              threads.map((th) => th.latestMessageId),
              { isRead: false },
            );
          }
          toast({ message: ref.current.t(read ? 'list.done.read' : 'list.done.unread') });
          await ref.current.data.refresh().catch(() => undefined);
        } catch (err) {
          fail(err);
        } finally {
          clear();
        }
      })();
    },
    [backend, fail, loadThreads, toast],
  );

  const setStarred = useCallback(
    (ids: readonly string[], starred: boolean) => {
      if (ids.length === 0) return;
      const { data: d, folder: view } = ref.current;
      const threads = d.threads.filter((th) => ids.includes(th.id));
      const removes = view === 'starred' && !starred;
      if (removes) ref.current.onRemoved(ids);
      const clear = removes ? d.hide(ids) : d.override(ids, () => ({ isStarred: starred }));
      void (async () => {
        try {
          if (starred) {
            await backend.updateMessages(
              threads.map((th) => th.latestMessageId),
              { isStarred: true },
            );
          } else {
            const msgs = (await loadThreads(ids)).filter((m) => m.isStarred);
            if (msgs.length) await backend.updateMessages(msgs.map((m) => m.id), { isStarred: false });
          }
          await ref.current.data.refresh().catch(() => undefined);
        } catch (err) {
          fail(err);
        } finally {
          clear();
        }
      })();
    },
    [backend, fail, loadThreads],
  );

  const setLabel = useCallback(
    (ids: readonly string[], labelId: string, add: boolean) => {
      if (ids.length === 0) return;
      const { data: d, labelId: viewLabel } = ref.current;
      const label = ref.current.labels.find((l) => l.id === labelId);
      const removes = !add && viewLabel === labelId;
      if (removes) ref.current.onRemoved(ids);
      const clear = removes
        ? d.hide(ids)
        : d.override(ids, (th) => ({
            labelIds: add ? Array.from(new Set([...th.labelIds, labelId])) : th.labelIds.filter((l) => l !== labelId),
          }));
      let undone = false;
      const work = (async (): Promise<string[]> => {
        const msgs = (await loadThreads(ids)).filter((m) => m.labelIds.includes(labelId) !== add);
        if (msgs.length === 0) return [];
        const changed = msgs.map((m) => m.id);
        await backend.updateMessages(changed, add ? { labelIdsAdd: [labelId] } : { labelIdsRemove: [labelId] });
        return changed;
      })();
      work.then(
        async () => {
          if (undone) return;
          await ref.current.data.refresh().catch(() => undefined);
          clear();
        },
        (err: unknown) => {
          clear();
          fail(err);
        },
      );
      const name = label?.name ?? '';
      toast({
        tone: 'success',
        message: ref.current.t(add ? 'list.done.labelAdd' : 'list.done.labelRemove', { label: name }),
        actionLabel: ref.current.t('common.undo'),
        onAction: () => {
          undone = true;
          clear();
          void (async () => {
            try {
              const changed = await work;
              if (changed.length) {
                await backend.updateMessages(changed, add ? { labelIdsRemove: [labelId] } : { labelIdsAdd: [labelId] });
              }
              toast({ message: ref.current.t('list.done.undone') });
            } catch (err) {
              fail(err, 'list.undoFailed');
            } finally {
              ref.current.data.refresh().catch(() => undefined);
            }
          })();
        },
      });
    },
    [backend, fail, loadThreads, toast],
  );

  const deleteForever = useCallback(
    async (ids: readonly string[]) => {
      if (ids.length === 0) return;
      const d = ref.current.data;
      ref.current.onRemoved(ids);
      const unhide = d.hide(ids);
      try {
        const msgs = (await loadThreads(ids)).filter((m) => m.folder === 'trash' || m.folder === 'spam');
        if (msgs.length) await backend.deleteForever(msgs.map((m) => m.id));
        toast({ tone: 'success', message: ref.current.t('list.done.deleted', { count: countText(ids.length) }) });
        await ref.current.data.refresh().catch(() => undefined);
      } catch (err) {
        fail(err);
      } finally {
        unhide();
      }
    },
    [backend, countText, fail, loadThreads, toast],
  );

  return useMemo(
    () => ({ archive, trash, spam, move, snooze, setRead, setStarred, setLabel, deleteForever }),
    [archive, trash, spam, move, snooze, setRead, setStarred, setLabel, deleteForever],
  );
}
