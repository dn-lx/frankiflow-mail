'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SendResult } from '@/lib/backend/types';
import { describeError, formatFullDate } from '@/lib/i18n';
import { useApp } from '../providers/AppProvider';
import { useToast } from '../ui/Toast';
import { ComposerWindow, type Resources } from './ComposerWindow';
import type { ComposeInit, SendRequest, WindowEntry, WindowView } from './types';
import styles from './Composer.module.css';
import './strings';

export interface ComposerApi {
  open: (init?: ComposeInit) => void;
}

const MAX_WINDOWS = 3;

const ComposerContext = createContext<ComposerApi | null>(null);

const noop: ComposerApi = { open: () => undefined };

/** `{ open(init?) }`. Outside a ComposerProvider it does nothing. */
export function useComposer(): ComposerApi {
  return useContext(ComposerContext) ?? noop;
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

interface PendingSend {
  timer: number | null;
  toastId: string;
  started: boolean;
  request: SendRequest;
}

let windowCounter = 0;

export function ComposerProvider({ children }: { children: ReactNode }) {
  const { backend, t, lang, settings } = useApp();
  const toast = useToast();
  const phone = useMedia('(max-width: 639px)');
  const compact = useMedia('(max-width: 1023px)');

  const [windows, setWindows] = useState<WindowEntry[]>([]);
  const windowsRef = useRef<WindowEntry[]>([]);
  const [resources, setResources] = useState<Resources>({ status: 'idle', mailboxes: [], signatures: [], templates: [] });

  const draftIds = useRef(new Map<string, string>());
  const dirtyKeys = useRef(new Set<string>());
  const pending = useRef(new Map<string, PendingSend>());

  // Latest values for stable callbacks.
  const live = useRef({ t, lang, settings, compact, toast, backend });
  live.current = { t, lang, settings, compact, toast, backend };

  const commit = useCallback((next: WindowEntry[]) => {
    windowsRef.current = next;
    setWindows(next);
  }, []);

  /* ----- shared data (mailboxes, signatures, templates) ----- */

  const loadResources = useCallback(async () => {
    setResources((r) => ({ ...r, status: 'loading' }));
    try {
      const [mailboxes, signatures, templates] = await Promise.all([
        backend.listMailboxes(),
        backend.listSignatures().catch(() => []),
        backend.listTemplates().catch(() => []),
      ]);
      setResources({ status: 'ready', mailboxes, signatures, templates });
    } catch {
      setResources((r) => ({ ...r, status: 'error' }));
    }
  }, [backend]);

  useEffect(() => {
    if (windows.length > 0 && resources.status === 'idle') void loadResources();
  }, [windows.length, resources.status, loadResources]);

  /* ----- window management ----- */

  /** On small screens only one window is open at a time. */
  const withFocus = useCallback((list: WindowEntry[], key: string): WindowEntry[] => {
    const { compact: isCompact } = live.current;
    return list.map((w) => {
      if (w.key === key) return { ...w, view: w.view === 'minimized' ? 'docked' : w.view, focusToken: w.focusToken + 1 };
      if (isCompact && w.view !== 'minimized') return { ...w, view: 'minimized' };
      return w;
    });
  }, []);

  const addWindow = useCallback(
    (entry: Omit<WindowEntry, 'key' | 'view' | 'focusToken'>, draftId?: string) => {
      windowCounter += 1;
      const key = `composer-${windowCounter}`;
      if (draftId) draftIds.current.set(key, draftId);
      const next: WindowEntry = { ...entry, key, view: 'docked', focusToken: 1 };
      const others = windowsRef.current.map((w) =>
        w.view === 'expanded' ? { ...w, view: 'docked' as const } : w,
      );
      commit(withFocus([...others, next], key));
    },
    [commit, withFocus],
  );

  const open = useCallback(
    (init: ComposeInit = { mode: 'new' }) => {
      const { t: tr, toast: notify } = live.current;
      const draftId = init.mode === 'draft' ? init.draftId ?? init.message?.id : undefined;
      if (draftId) {
        for (const [key, id] of draftIds.current) {
          if (id === draftId && windowsRef.current.some((w) => w.key === key)) {
            commit(withFocus(windowsRef.current, key));
            return;
          }
        }
        for (const p of pending.current.values()) {
          if (p.request.snapshot.draftId === draftId && !p.started) {
            notify({ message: tr('composer.alreadySending') });
            return;
          }
        }
      }
      if (windowsRef.current.length >= MAX_WINDOWS) {
        notify({ message: tr('composer.tooMany', { max: MAX_WINDOWS }), tone: 'error' });
        return;
      }
      addWindow({ init: { ...init, draftId: draftId ?? init.draftId } }, draftId);
    },
    [addWindow, commit, withFocus],
  );

  const onView = useCallback(
    (key: string, view: WindowView) => {
      let list = windowsRef.current;
      if (view === 'docked' || view === 'expanded') list = withFocus(list, key);
      commit(
        list.map((w) => {
          if (w.key === key) return { ...w, view };
          if (view === 'expanded' && w.view === 'expanded') return { ...w, view: 'docked' };
          return w;
        }),
      );
    },
    [commit, withFocus],
  );

  const onClosed = useCallback(
    (key: string) => {
      draftIds.current.delete(key);
      dirtyKeys.current.delete(key);
      commit(windowsRef.current.filter((w) => w.key !== key));
    },
    [commit],
  );

  const onDirty = useCallback((key: string, dirty: boolean) => {
    if (dirty) dirtyKeys.current.add(key);
    else dirtyKeys.current.delete(key);
  }, []);

  const onDraftId = useCallback((key: string, id: string) => {
    draftIds.current.set(key, id);
  }, []);

  const onOpenDraft = useCallback((id: string) => open({ mode: 'draft', draftId: id }), [open]);

  /* ----- sending with undo ----- */

  const reopen = useCallback(
    (request: SendRequest, error?: string) => {
      addWindow(
        { init: { mode: 'draft', draftId: request.snapshot.draftId }, snapshot: request.snapshot, error },
        request.snapshot.draftId,
      );
    },
    [addWindow],
  );

  const sendErrorMessage = useCallback((error: string | undefined): string => {
    const { t: tr, lang: lg } = live.current;
    if (!error) return tr('composer.send.failed');
    if (error === 'network:offline') return tr('composer.send.offline');
    if (error.startsWith('compose:invalid-recipient')) return tr('composer.validate.invalidGeneric');
    if (/^(auth|permission|network):/.test(error)) return describeError(lg, new Error(error.replace(/:.*$/, ':')));
    return tr('composer.send.failed');
  }, []);

  const fire = useCallback(
    async (key: string) => {
      const entry = pending.current.get(key);
      if (!entry || entry.started) return;
      entry.started = true;
      entry.timer = null;
      const { backend: b, toast: notify, t: tr, lang: lg } = live.current;
      let result: SendResult;
      try {
        result = await b.send(entry.request.draft);
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : 'send:failed' };
      }
      pending.current.delete(key);
      notify.dismiss(entry.toastId);
      const scheduledAt = entry.request.draft.scheduledAt;
      if (result.ok) {
        notify({
          message: scheduledAt
            ? tr('composer.sent.scheduled', { when: formatFullDate(scheduledAt, lg) })
            : tr('composer.sent.ok'),
          tone: 'success',
        });
      } else if (result.error === 'send:unconfirmed') {
        // Never resend automatically; the user must check Sent first.
        notify({ message: tr('composer.send.unconfirmed'), tone: 'error', duration: 0 });
      } else {
        const message = sendErrorMessage(result.error);
        notify({ message, tone: 'error' });
        reopen(entry.request, message);
      }
    },
    [reopen, sendErrorMessage],
  );

  const undo = useCallback(
    (key: string) => {
      const entry = pending.current.get(key);
      const { toast: notify, t: tr } = live.current;
      if (!entry) return;
      if (entry.started) {
        notify({ message: tr('composer.undoTooLate') });
        return;
      }
      if (entry.timer !== null) window.clearTimeout(entry.timer);
      pending.current.delete(key);
      notify.dismiss(entry.toastId);
      reopen(entry.request);
    },
    [reopen],
  );

  const onQueueSend = useCallback(
    (key: string, request: SendRequest) => {
      const { settings: s, toast: notify, t: tr } = live.current;
      draftIds.current.delete(key);
      dirtyKeys.current.delete(key);
      commit(windowsRef.current.filter((w) => w.key !== key));
      const sendKey = `send-${key}-${Date.now()}`;
      const seconds = s.undoSendSeconds;
      const scheduled = !!request.draft.scheduledAt;
      const entry: PendingSend = { timer: null, toastId: '', started: false, request };
      pending.current.set(sendKey, entry);
      const message = scheduled ? tr('composer.sending.scheduled') : tr('composer.sending');
      if (seconds > 0) {
        entry.toastId = notify({
          message,
          actionLabel: tr('common.undo'),
          onAction: () => undo(sendKey),
          duration: 0,
        });
        entry.timer = window.setTimeout(() => void fire(sendKey), seconds * 1000);
      } else {
        entry.toastId = notify({ message, duration: 0 });
        void fire(sendKey);
      }
    },
    [commit, fire, undo],
  );

  /* ----- protect unsaved work on tab close ----- */

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyKeys.current.size === 0 && pending.current.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const api = useMemo<ComposerApi>(() => ({ open }), [open]);
  const expanded = !phone && windows.some((w) => w.view === 'expanded');

  return (
    <ComposerContext.Provider value={api}>
      {children}
      {expanded && (
        <div
          className={styles.backdrop}
          aria-hidden="true"
          onClick={() => {
            const w = windowsRef.current.find((x) => x.view === 'expanded');
            if (w) onView(w.key, 'docked');
          }}
        />
      )}
      {windows.length > 0 && (
        <div className={styles.dock} aria-label={t('composer.region')} role="region">
          {windows.map((w) => (
            <ComposerWindow
              key={w.key}
              entry={w}
              resources={resources}
              phone={phone}
              onReloadResources={() => void loadResources()}
              onView={onView}
              onClosed={onClosed}
              onQueueSend={onQueueSend}
              onDirty={onDirty}
              onDraftId={onDraftId}
              onOpenDraft={onOpenDraft}
            />
          ))}
        </div>
      )}
    </ComposerContext.Provider>
  );
}
