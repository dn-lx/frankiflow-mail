'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Button, Checkbox, Dialog, EmptyState, IconButton, Menu, Skeleton, useToast, type IconName, type MenuItem } from '@/components/ui';
import type { Folder, Label, ThreadSummary } from '@/lib/backend/types';
import { describeError } from '@/lib/i18n';
import {
  neighbourId,
  otherParticipants,
  rangeIds,
  showsRecipients,
  type ConcreteFolder,
  type OwnIdentity,
} from '@/lib/mail/threads';
import { matchesListFilter, type ListFilter } from '@/components/shell/view';
import { FilterMenu } from './FilterMenu';
import { ThreadRow, primaryActionFor, type RowCallbacks } from './ThreadRow';
import type { ThreadActions } from './useThreadActions';
import type { ThreadListData } from './useThreadList';
import styles from './ThreadList.module.css';
import './strings';

export interface ThreadListProps {
  id?: string;
  data: ThreadListData;
  actions: ThreadActions;
  folder: Folder;
  labelId?: string;
  search?: string;
  filter?: ListFilter;
  /** Heading shown above the list (folder, label or "Search results"). */
  title: string;
  /** Second line under the title, e.g. the selected mailbox. */
  subtitle?: string;
  labels: Label[];
  /** The user's own mailboxes (Sent / Drafts rows show the other people). */
  ownMailboxes?: readonly OwnIdentity[] | null;
  openId?: string;
  activeId?: string;
  onActiveChange: (id: string) => void;
  selection: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  onOpen: (thread: ThreadSummary) => void;
  hrefFor: (threadId: string) => string;
  onClearSearch: () => void;
  onFilterChange: (next: ListFilter | undefined) => void;
  onClearFilter: () => void;
}

/** Focuses (and scrolls to) the row link of a thread, if rendered. */
export function focusThreadRow(id: string): boolean {
  const el = document.querySelector<HTMLElement>(`[data-thread-link="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.focus();
  el.scrollIntoView({ block: 'nearest' });
  return true;
}

const MOVE_TARGETS: readonly ConcreteFolder[] = ['inbox', 'archive', 'spam', 'trash'];
const SKELETON_ROWS = 8;

export function ThreadList({
  id,
  data,
  actions,
  folder,
  labelId,
  search,
  filter,
  title,
  subtitle,
  labels,
  ownMailboxes,
  openId,
  activeId,
  onActiveChange,
  selection,
  onSelectionChange,
  onOpen,
  hrefFor,
  onClearSearch,
  onFilterChange,
  onClearFilter,
}: ThreadListProps) {
  const { backend, settings, t, lang, online } = useApp();
  const compact = settings.density === 'compact';
  const toast = useToast();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const anchorRef = useRef<string | null>(null);
  const focusInside = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [emptying, setEmptying] = useState(false);

  const threads = useMemo(
    () => (filter ? data.threads.filter((th) => matchesListFilter(th, filter)) : data.threads),
    [data.threads, filter],
  );
  const order =useMemo(() => threads.map((th) => th.id), [threads]);
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l] as const)), [labels]);
  const effectiveActive = activeId && order.includes(activeId) ? activeId : openId && order.includes(openId) ? openId : order[0];

  // Latest values for stable row callbacks (rows are memoised).
  const live = useRef({ order, selection, onSelectionChange, onActiveChange, onOpen, actions, folder });
  live.current = { order, selection, onSelectionChange, onActiveChange, onOpen, actions, folder };

  const askDeleteForever = useCallback((ids: string[]) => setConfirmDelete(ids), []);

  const cb = useMemo<RowCallbacks>(
    () => ({
      open: (thread) => live.current.onOpen(thread),
      toggleSelect: (tid, shift) => {
        const { order: o, selection: sel, onSelectionChange: set } = live.current;
        const next = new Set(sel);
        if (shift && anchorRef.current && anchorRef.current !== tid) {
          for (const r of rangeIds(o, anchorRef.current, tid)) next.add(r);
        } else if (next.has(tid)) next.delete(tid);
        else next.add(tid);
        anchorRef.current = tid;
        set(next);
      },
      focusRow: (tid) => live.current.onActiveChange(tid),
      moveFocus: (tid, dir) => {
        const o = live.current.order;
        const target = dir === 'first' ? o[0] : dir === 'last' ? o[o.length - 1] : neighbourId(o, tid, dir);
        if (!target) return;
        live.current.onActiveChange(target);
        focusThreadRow(target);
      },
      archive: (tid) => {
        const p = primaryActionFor(live.current.folder);
        if (p.target === 'archive') live.current.actions.archive([tid]);
        else live.current.actions.move([tid], p.target);
      },
      trash: (tid) => {
        if (live.current.folder === 'trash') askDeleteForever([tid]);
        else live.current.actions.trash([tid]);
      },
      setRead: (tid, read) => live.current.actions.setRead([tid], read),
      setStarred: (tid, starred) => live.current.actions.setStarred([tid], starred),
      snooze: (tid, iso) => live.current.actions.snooze([tid], iso),
    }),
    [askDeleteForever],
  );

  // Infinite scroll.
  const { hasMore, loadingMore, loadMoreFailed, loadMore } = data;
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollerRef.current;
    if (!el || !root || !hasMore || loadingMore || loadMoreFailed) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root, rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, loadMoreFailed, loadMore, threads.length]);

  // If the focused row disappeared (archived, live update), keep focus in the list.
  useEffect(() => {
    if (!focusInside.current || !effectiveActive) return;
    const ae = document.activeElement;
    if (!ae || ae === document.body) focusThreadRow(effectiveActive);
  }, [order, effectiveActive]);

  // Drop selected ids that are no longer listed.
  useEffect(() => {
    if (selection.size === 0) return;
    const present = new Set(order);
    let stale = false;
    for (const sid of selection) if (!present.has(sid)) stale = true;
    if (stale) onSelectionChange(new Set([...selection].filter((sid) => present.has(sid))));
  }, [order, selection, onSelectionChange]);

  const selectedIds = useMemo(() => order.filter((tid) => selection.has(tid)), [order, selection]);
  const selectedThreads = useMemo(() => threads.filter((th) => selection.has(th.id)), [threads, selection]);
  const allSelected = order.length > 0 && selectedIds.length === order.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleAll = () => onSelectionChange(allSelected || someSelected ? new Set() : new Set(order));
  const clear = () => onSelectionChange(new Set());

  const selectControl = (
    <div className={styles.selectSplit}>
      <Checkbox
        className={styles.headerCheck}
        label={t('list.selectAll')}
        hideLabel
        checked={allSelected}
        indeterminate={someSelected}
        disabled={order.length === 0}
        onChange={toggleAll}
      />
      <FilterMenu value={filter} onChange={onFilterChange} />
    </div>
  );

  const bulk = (fn: (ids: string[]) => void) => () => {
    const ids = selectedIds;
    clear();
    fn(ids);
  };

  const primary = primaryActionFor(folder);
  const anyUnread = selectedThreads.some((th) => th.unreadCount > 0);

  const labelItems: MenuItem[] = labels.length
    ? labels.map((l) => {
        const all = selectedThreads.length > 0 && selectedThreads.every((th) => th.labelIds.includes(l.id));
        return {
          id: `label-${l.id}`,
          label: l.name,
          checked: all,
          onSelect: () => actions.setLabel(selectedIds, l.id, !all),
        };
      })
    : [{ id: 'none', label: t('list.noLabels'), disabled: true, onSelect: () => undefined }];

  // Everything beyond archive / delete / read goes into "⋮" so the bar fits a 320px column.
  const moreItems: MenuItem[] = [
    {
      id: 'unread',
      icon: 'inbox',
      label: anyUnread ? t('list.markUnread') : t('list.markRead'),
      onSelect: bulk((ids) => actions.setRead(ids, !anyUnread)),
    },
    ...(folder !== 'spam' && folder !== 'trash'
      ? [{ id: 'spam', icon: 'alert' as const, label: t('list.spam'), onSelect: bulk((ids) => actions.spam(ids)) }]
      : []),
    { id: 'sep1', separator: true },
    ...MOVE_TARGETS.filter((f) => f !== folder).map<MenuItem>((f) => ({
      id: `move-${f}`,
      icon: f === 'inbox' ? 'inbox' : f === 'archive' ? 'archive' : f === 'spam' ? 'alert' : 'trash',
      label: t('list.moveTo', { folder: t(`folder.${f}`) }),
      onSelect: bulk((ids) => actions.move(ids, f)),
    })),
    { id: 'sep2', separator: true },
    ...labelItems.map<MenuItem>((item) =>
      'separator' in item
        ? item
        : { ...item, icon: 'tag', label: item.disabled ? item.label : t('list.labelItem', { label: item.label }) },
    ),
    { id: 'sep3', separator: true },
    { id: 'clear', icon: 'x', label: t('list.clearSelection'), onSelect: clear },
  ];

  /** "To" line for Sent / Drafts / Scheduled, or outbound-only threads in any view. */
  const toMode = showsRecipients(folder);
  const recipientsFor = (th: ThreadSummary): string | null | undefined => {
    const hasExtras = Object.prototype.hasOwnProperty.call(data.extras, th.id);
    const fetched = data.extras[th.id]?.recipients;
    if (fetched !== undefined) return fetched.length ? fetched.join(', ') : '';
    if (hasExtras && !toMode) return undefined;
    const ownOnly = !!ownMailboxes && otherParticipants(th.participants, ownMailboxes).length === 0;
    if (toMode || ownOnly) {
      const others = otherParticipants(th.participants, ownMailboxes ?? []);
      if (others.length && ownMailboxes) return others.join(', ');
      return null;
    }
    return undefined;
  };

  const canEmptyFolder = (folder === 'spam' || folder === 'trash') && !labelId && !search && !filter && threads.length > 0;
  const emptyCurrentFolder = async () => {
    if (folder !== 'spam' && folder !== 'trash') return;
    setEmptying(true);
    try {
      const allThreads: ThreadSummary[] = [];
      let before: string | undefined;
      for (;;) {
        const res = await backend.listThreads({ mailboxId: data.query.mailboxId, folder, limit: 200, before });
        allThreads.push(...res.threads);
        if (!res.nextBefore || res.threads.length === 0) break;
        before = res.nextBefore;
      }
      const msgs = (await Promise.all(allThreads.map((th) => backend.getThread(th.id)))).flat();
      const targetIds = msgs.filter((m) => m.folder === folder).map((m) => m.id);
      if (targetIds.length > 0) await backend.deleteForever(targetIds);
      setConfirmEmpty(false);
      onSelectionChange(new Set());
      toast({ tone: 'success', message: t(folder === 'spam' ? 'list.done.emptiedSpam' : 'list.done.emptiedTrash') });
      await data.refresh().catch(() => undefined);
    } catch (err) {
      toast({ tone: 'error', message: t('list.actionFailed', { error: describeError(lang, err) }) });
    } finally {
      setEmptying(false);
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && selection.size > 0) {
      e.preventDefault();
      clear();
    }
  };

  // One element for both states so the select control (and focus on its chevron) survives
  // switching between the title header and the bulk bar.
  const bulkMode = selectedIds.length > 0;
  const showSelect = bulkMode || data.status !== 'ready' || order.length > 0 || !!filter;
  const header = (
    <div
      className={[styles.header, bulkMode && styles.bulk].filter(Boolean).join(' ')}
      role={bulkMode ? 'toolbar' : undefined}
      aria-label={bulkMode ? t('list.bulkActions') : undefined}
    >
      {showSelect ? selectControl : null}
      {bulkMode ? (
        <>
        <span className={styles.bulkCount} aria-live="polite">
          <span className={styles.bulkCountLong}>{t('list.selected', { count: selectedIds.length })}</span>
          <span className={styles.bulkCountShort} aria-hidden="true">
            {selectedIds.length}
          </span>
        </span>
        <span className={styles.spacer} />
        <div className={styles.bulkActions}>
          <IconButton
            icon={primary.icon}
            label={t(primary.labelKey, { folder: t('folder.inbox') })}
            onClick={bulk((ids) => (primary.target === 'archive' ? actions.archive(ids) : actions.move(ids, primary.target)))}
          />
          <IconButton
            icon="trash"
            label={folder === 'trash' ? t('list.deleteForever') : t('list.delete')}
            onClick={() => {
              if (folder === 'trash') askDeleteForever(selectedIds);
              else bulk((ids) => actions.trash(ids))();
            }}
          />
          <IconButton
            icon={anyUnread ? 'check' : 'inbox'}
            label={anyUnread ? t('list.markRead') : t('list.markUnread')}
            onClick={bulk((ids) => actions.setRead(ids, anyUnread))}
          />
          <Menu label={t('common.more')} items={moreItems} />
        </div>
        </>
      ) : (
        <>
        <div className={styles.titleBlock}>
          <h1 className={styles.title} id={id ? `${id}-title` : undefined}>
            {title}
          </h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <span className={styles.spacer} />
        {canEmptyFolder && (
          <Button size="sm" variant="ghost" className={styles.emptyFolderBtn} onClick={() => setConfirmEmpty(true)}>
            {t(folder === 'spam' ? 'list.emptySpam' : 'list.emptyTrash')}
          </Button>
        )}
        <IconButton
          icon="refresh"
          label={t('list.refresh')}
          loading={data.refreshing && data.status === 'ready'}
          onClick={() => {
            data.refresh().catch(() => undefined);
          }}
        />
        </>
      )}
    </div>
  );

  let body;
  if (data.status === 'loading') {
    body = (
      <div className={styles.skeletons} aria-busy="true">
        <span className="sr-only" role="status">
          {t('list.loading')}
        </span>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className={styles.skeletonRow} aria-hidden="true">
            <Skeleton circle width={compact ? 28 : 36} />
            <div className={styles.skeletonText}>
              <Skeleton width={`${50 + ((i * 17) % 35)}%`} height={14} />
              <Skeleton width={`${70 + ((i * 11) % 25)}%`} height={14} />
              <Skeleton width="90%" height={12} />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (data.status === 'error') {
    body = (
      <div role="alert">
        <EmptyState
          icon="alert"
          title={online ? t('list.errorTitle') : t('list.offlineTitle')}
          text={online ? data.error : t('list.offlineText')}
          action={
            <Button variant="primary" icon="refresh" onClick={data.retry}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    );
  } else if (threads.length === 0) {
    if (filter) {
      const icon: IconName = filter === 'starred' ? 'star' : 'inbox';
      body = (
        <EmptyState
          icon={icon}
          title={t(`list.empty.filter.${filter}.title`)}
          text={t('list.empty.filter.text')}
          action={
            <Button icon="x" onClick={onClearFilter}>
              {t('list.clearFilter')}
            </Button>
          }
        />
      );
    } else {
      const kind = search ? 'search' : labelId ? 'label' : folder;
      const icon: IconName =
        kind === 'search' ? 'search' : kind === 'label' ? 'tag' : kind === 'all' ? 'list' : kind === 'starred' ? 'star' : kind === 'snoozed' ? 'alarm' : kind === 'sent' ? 'send' : kind === 'drafts' ? 'file' : kind === 'scheduled' ? 'clock' : kind === 'archive' ? 'archive' : kind === 'spam' ? 'alert' : kind === 'trash' ? 'trash' : 'inbox';
      body = (
        <EmptyState
          icon={icon}
          title={t(`list.empty.${kind}.title`)}
          text={t(`list.empty.${kind}.text`, { query: search ?? '' })}
          action={
            search ? (
              <Button icon="x" onClick={onClearSearch}>
                {t('search.clear')}
              </Button>
            ) : undefined
          }
        />
      );
    }
  } else {
    body = (
      <ul
        role="list"
        className={styles.rows}
        aria-labelledby={id && selectedIds.length === 0 ? `${id}-title` : undefined}
        aria-label={id && selectedIds.length === 0 ? undefined : title}
      >
        {threads.map((th) => (
          <ThreadRow
            key={th.id}
            thread={th}
            href={hrefFor(th.id)}
            folder={folder}
            active={th.id === effectiveActive}
            open={th.id === openId}
            selected={selection.has(th.id)}
            selectionMode={selection.size > 0}
            compact={compact}
            labels={labelMap}
            extras={data.extras[th.id]}
            recipients={recipientsFor(th)}
            lang={lang}
            t={t}
            cb={cb}
          />
        ))}
        <li ref={sentinelRef} className={styles.footer}>
          {loadingMore ? (
            <span role="status">{t('list.loadingMore')}</span>
          ) : loadMoreFailed ? (
            <Button size="sm" icon="refresh" onClick={loadMore}>
              {t('list.loadMore')}
            </Button>
          ) : hasMore ? (
            <Button size="sm" variant="ghost" onClick={loadMore}>
              {t('list.loadMore')}
            </Button>
          ) : threads.length > 10 ? (
            <span className={styles.end}>{t('list.end')}</span>
          ) : null}
        </li>
      </ul>
    );
  }

  return (
    <section
      id={id}
      className={styles.list}
      aria-labelledby={id && selectedIds.length === 0 ? `${id}-title` : undefined}
      aria-label={selectedIds.length > 0 ? title : undefined}
      onKeyDown={onListKeyDown}
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focusInside.current = false;
      }}
    >
      {header}
      <div ref={scrollerRef} className={styles.scroller} data-list-scroller="">
        {body}
      </div>
      {confirmDelete && (
        <Dialog
          open
          onClose={() => setConfirmDelete(null)}
          title={t('list.deleteForeverTitle')}
          description={t('list.deleteForeverText', { count: confirmDelete.length })}
          size="sm"
          closeLabel={t('common.close')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                icon="trash"
                autoFocus
                onClick={() => {
                  const ids = confirmDelete;
                  setConfirmDelete(null);
                  onSelectionChange(new Set());
                  void actions.deleteForever(ids);
                }}
              >
                {t('list.deleteForever')}
              </Button>
            </>
          }
        />
      )}
      {confirmEmpty && (folder === 'spam' || folder === 'trash') && (
        <Dialog
          open
          onClose={() => {
            if (!emptying) setConfirmEmpty(false);
          }}
          title={t(folder === 'spam' ? 'list.emptySpamTitle' : 'list.emptyTrashTitle')}
          description={t(folder === 'spam' ? 'list.emptySpamText' : 'list.emptyTrashText')}
          size="sm"
          closeLabel={t('common.close')}
          footer={
            <>
              <Button variant="ghost" disabled={emptying} onClick={() => setConfirmEmpty(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" icon="trash" loading={emptying} autoFocus onClick={() => void emptyCurrentFolder()}>
                {t(folder === 'spam' ? 'list.emptySpam' : 'list.emptyTrash')}
              </Button>
            </>
          }
        />
      )}
    </section>
  );
}
