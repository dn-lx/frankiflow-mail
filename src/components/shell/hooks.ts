'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import type { Folder, Label, Mailbox } from '@/lib/backend/types';

export type Layout = 'phone' | 'tablet' | 'desktop';

const PHONE_MAX = 699;
const TABLET_MAX = 1099;

function readLayout(): Layout {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  return w <= PHONE_MAX ? 'phone' : w <= TABLET_MAX ? 'tablet' : 'desktop';
}

function subscribeLayout(cb: () => void): () => void {
  const phone = window.matchMedia(`(max-width: ${PHONE_MAX}px)`);
  const tablet = window.matchMedia(`(max-width: ${TABLET_MAX}px)`);
  phone.addEventListener('change', cb);
  tablet.addEventListener('change', cb);
  return () => {
    phone.removeEventListener('change', cb);
    tablet.removeEventListener('change', cb);
  };
}

/** phone < 700px ≤ tablet < 1100px ≤ desktop (matches AppShell.module.css). */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribeLayout, readLayout, () => 'desktop');
}

/** Calls `fn` (debounced) whenever the backend reports a change. */
export function useBackendChange(fn: () => void, delay = 400): void {
  const { backend } = useApp();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = backend.onChange(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ref.current(), delay);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [backend, delay]);
}

export interface MailMeta {
  mailboxes: Mailbox[] | null;
  labels: Label[];
  error: boolean;
  reload: () => void;
}

/** Mailboxes and labels, refreshed on backend changes. */
export function useMailMeta(): MailMeta {
  const { backend } = useApp();
  const [mailboxes, setMailboxes] = useState<Mailbox[] | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    Promise.all([backend.listMailboxes(), backend.listLabels()])
      .then(([mb, lb]) => {
        setMailboxes((cur) => (cur && JSON.stringify(cur) === JSON.stringify(mb) ? cur : mb));
        setLabels((cur) => (JSON.stringify(cur) === JSON.stringify(lb) ? cur : lb));
        setError(false);
      })
      .catch(() => setError(true));
  }, [backend]);

  useEffect(() => {
    reload();
  }, [reload]);
  useBackendChange(reload, 600);

  return { mailboxes, labels, error, reload };
}

export type Counts = Partial<Record<Folder, number>>;

/** Unread counts per folder (drafts / scheduled: totals), refreshed on changes. */
export function useCounts(mailboxId: string | undefined): Counts {
  const { backend } = useApp();
  const [counts, setCounts] = useState<Counts>({});
  const reqRef = useRef(0);

  const reload = useCallback(() => {
    const id = ++reqRef.current;
    backend
      .counts(mailboxId)
      .then((c) => {
        if (id !== reqRef.current) return;
        setCounts((cur) => (JSON.stringify(cur) === JSON.stringify(c) ? cur : c));
      })
      .catch(() => undefined);
  }, [backend, mailboxId]);

  useEffect(() => {
    reload();
  }, [reload]);
  useBackendChange(reload, 500);

  return counts;
}

const WIDTH_KEY = 'ffmail.listWidth';
export const LIST_MIN = 300;
export const LIST_MAX = 640;
export const LIST_DEFAULT = 380;

export function useListWidth(): [number, (w: number) => void] {
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return LIST_DEFAULT;
    try {
      const v = Number(window.localStorage.getItem(WIDTH_KEY));
      return v >= LIST_MIN && v <= LIST_MAX ? v : LIST_DEFAULT;
    } catch {
      return LIST_DEFAULT;
    }
  });
  const timer = useRef<number | undefined>(undefined);
  const set = useCallback((w: number) => {
    const clamped = Math.round(Math.min(LIST_MAX, Math.max(LIST_MIN, w)));
    setWidth(clamped);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(WIDTH_KEY, String(clamped));
      } catch {
        /* storage unavailable */
      }
    }, 300);
  }, []);
  return [width, set];
}
