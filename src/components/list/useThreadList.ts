'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import type { Folder, ThreadSummary } from '@/lib/backend/types';
import { describeError } from '@/lib/i18n';
import { appendThreads, compareThreads, mergeThreads } from '@/lib/mail/threads';

export const PAGE_SIZE = 50;
const MAX_REFRESH = 500;
const LIVE_DEBOUNCE_MS = 300;

export interface ThreadListQuery {
  mailboxId?: string;
  folder: Folder;
  labelId?: string;
  search?: string;
}

export interface ThreadExtras {
  snoozedUntil?: string;
  scheduledAt?: string;
  isDraft?: boolean;
}

export type ListStatus = 'loading' | 'ready' | 'error';

export interface ThreadListData {
  query: ThreadListQuery;
  /** What the user sees: server data with pending optimistic changes applied. */
  threads: ThreadSummary[];
  status: ListStatus;
  error?: string;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreFailed: boolean;
  refreshing: boolean;
  extras: Record<string, ThreadExtras>;
  loadMore: () => void;
  /** Re-fetches the loaded window and merges it in (keeps scroll, selection, focus). */
  refresh: () => Promise<void>;
  retry: () => void;
  /** Hides threads until the returned function is called. */
  hide: (ids: readonly string[]) => () => void;
  /** Overrides fields of threads until the returned function is called. */
  override: (ids: readonly string[], patch: (t: ThreadSummary) => Partial<ThreadSummary>) => () => void;
}

interface Layer {
  token: number;
  ids: Set<string>;
  patch?: (t: ThreadSummary) => Partial<ThreadSummary>;
}

let layerToken = 0;

export function useThreadList(query: ThreadListQuery): ThreadListData {
  const { backend, lang } = useApp();
  const [base, setBase] = useState<ThreadSummary[]>([]);
  const [status, setStatus] = useState<ListStatus>('loading');
  const [error, setError] = useState<string | undefined>();
  const [nextBefore, setNextBefore] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden] = useState<Layer[]>([]);
  const [overrides, setOverrides] = useState<Layer[]>([]);
  const [extras, setExtras] = useState<Record<string, ThreadExtras>>({});

  const key = JSON.stringify([query.mailboxId ?? null, query.folder, query.labelId ?? null, query.search ?? null]);
  const queryRef = useRef(query);
  queryRef.current = query;
  const gen = useRef(0);
  const baseRef = useRef(base);
  baseRef.current = base;
  const nextBeforeRef = useRef(nextBefore);
  nextBeforeRef.current = nextBefore;
  const loadingMoreRef = useRef(false);
  const langRef = useRef(lang);
  langRef.current = lang;

  const fetchPage = useCallback(
    (limit: number, before?: string) => {
      const q = queryRef.current;
      return backend.listThreads({
        mailboxId: q.mailboxId,
        folder: q.folder,
        labelId: q.labelId,
        search: q.search,
        limit,
        before,
      });
    },
    [backend],
  );

  // Initial load whenever the query changes.
  const load = useCallback(() => {
    const g = ++gen.current;
    setStatus('loading');
    setError(undefined);
    setBase([]);
    setNextBefore(undefined);
    setLoadMoreFailed(false);
    setExtras({});
    loadingMoreRef.current = false;
    setLoadingMore(false);
    fetchPage(PAGE_SIZE)
      .then((res) => {
        if (g !== gen.current) return;
        setBase([...res.threads].sort(compareThreads));
        setNextBefore(res.nextBefore);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (g !== gen.current) return;
        setError(describeError(langRef.current, err));
        setStatus('error');
      });
  }, [fetchPage]);

  useEffect(() => {
    load();
  }, [key, load]);

  const refresh = useCallback(async () => {
    const g = gen.current;
    const loaded = baseRef.current.length;
    const limit = Math.min(Math.max(PAGE_SIZE, loaded), MAX_REFRESH);
    setRefreshing(true);
    extrasKeys.current.clear();
    try {
      const res = await fetchPage(limit);
      if (g !== gen.current) return;
      setBase((cur) => mergeThreads(cur, res.threads, !res.nextBefore));
      if (baseRef.current.length <= limit) setNextBefore(res.nextBefore);
      setStatus('ready');
      setError(undefined);
    } catch (err) {
      if (g !== gen.current) return;
      // Keep showing what we have; only surface the error if nothing is shown.
      if (baseRef.current.length === 0) {
        setError(describeError(langRef.current, err));
        setStatus('error');
      }
      throw err;
    } finally {
      if (g === gen.current) setRefreshing(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    const before = nextBeforeRef.current;
    if (!before || loadingMoreRef.current) return;
    const g = gen.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    fetchPage(PAGE_SIZE, before)
      .then((res) => {
        if (g !== gen.current) return;
        setBase((cur) => appendThreads(cur, res.threads));
        setNextBefore(res.nextBefore);
      })
      .catch(() => {
        if (g === gen.current) setLoadMoreFailed(true);
      })
      .finally(() => {
        if (g !== gen.current) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [fetchPage]);

  // Live updates: debounce, then merge (never reset the list).
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        refresh().catch(() => undefined);
      }, LIVE_DEBOUNCE_MS);
    };
    const unsubscribe = backend.onChange(schedule);
    window.addEventListener('online', schedule);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('online', schedule);
    };
  }, [backend, refresh]);

  // Snooze / schedule times are not in ThreadSummary: fetch them for the (small) Snoozed and Scheduled lists.
  const needsExtras = query.folder === 'snoozed' || query.folder === 'scheduled';
  const extrasKeys = useRef(new Map<string, string>());
  useEffect(() => {
    if (!needsExtras) return;
    const g = gen.current;
    const todo = base.filter((t) => extrasKeys.current.get(t.id) !== `${t.latestMessageId}|${t.lastMessageAt}`);
    if (todo.length === 0) return;
    for (const t of todo) extrasKeys.current.set(t.id, `${t.latestMessageId}|${t.lastMessageAt}`);
    void Promise.all(
      todo.map((t) =>
        backend.getThread(t.id).then(
          (msgs) => {
            const snoozed = msgs.filter((m) => m.snoozedUntil).map((m) => m.snoozedUntil as string).sort();
            const scheduled = msgs.filter((m) => m.scheduledAt).map((m) => m.scheduledAt as string).sort();
            return [t.id, { snoozedUntil: snoozed[snoozed.length - 1], scheduledAt: scheduled[0] }] as const;
          },
          () => {
            extrasKeys.current.delete(t.id);
            return [t.id, null] as const;
          },
        ),
      ),
    ).then((entries) => {
      if (g !== gen.current) return;
      setExtras((cur) => {
        const next = { ...cur };
        for (const [id, ex] of entries) {
          if (ex !== null) next[id] = ex;
        }
        return next;
      });
    });
  }, [base, needsExtras, backend]);
  useEffect(() => {
    extrasKeys.current = new Map();
  }, [key]);

  const hide = useCallback((ids: readonly string[]) => {
    const token = ++layerToken;
    setHidden((cur) => [...cur, { token, ids: new Set(ids) }]);
    return () => setHidden((cur) => cur.filter((l) => l.token !== token));
  }, []);

  const override = useCallback((ids: readonly string[], patch: (t: ThreadSummary) => Partial<ThreadSummary>) => {
    const token = ++layerToken;
    setOverrides((cur) => [...cur, { token, ids: new Set(ids), patch }]);
    return () => setOverrides((cur) => cur.filter((l) => l.token !== token));
  }, []);

  // Clear optimistic layers when the view changes.
  useEffect(() => {
    setHidden([]);
    setOverrides([]);
  }, [key]);

  const threads = useMemo(() => {
    if (hidden.length === 0 && overrides.length === 0) return base;
    const hiddenIds = new Set<string>();
    for (const l of hidden) for (const id of l.ids) hiddenIds.add(id);
    let changed = false;
    const out: ThreadSummary[] = [];
    for (const t of base) {
      if (hiddenIds.has(t.id)) {
        changed = true;
        continue;
      }
      let next = t;
      for (const l of overrides) if (l.patch && l.ids.has(t.id)) next = { ...next, ...l.patch(next) };
      if (next !== t) changed = true;
      out.push(next);
    }
    if (!changed) return base;
    return out.sort(compareThreads);
  }, [base, hidden, overrides]);

  return {
    query,
    threads,
    status,
    error,
    hasMore: !!nextBefore,
    loadingMore,
    loadMoreFailed,
    refreshing,
    extras,
    loadMore,
    refresh,
    retry: load,
    hide,
    override,
  };
}
