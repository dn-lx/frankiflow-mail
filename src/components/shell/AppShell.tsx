'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { EmptyState, Icon, useToast } from '@/components/ui';
import { useComposer } from '@/components/composer';
import { ThreadReader } from '@/components/reader';
import { ThreadList, focusThreadRow, primaryActionFor, useThreadActions, useThreadList, type ThreadListQuery } from '@/components/list';
import type { Folder, ThreadSummary } from '@/lib/backend/types';
import { describeError } from '@/lib/i18n';
import { neighbourId, successorId } from '@/lib/mail/threads';
import { LIST_MAX, LIST_MIN, useCounts, useLayout, useListWidth, useMailMeta } from './hooks';
import { ShortcutHelp } from './ShortcutHelp';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { MailView, ViewPatch } from './view';
import styles from './AppShell.module.css';
import './strings';

export interface AppShellProps {
  view: MailView;
  navigate: (patch: ViewPatch, opts?: { replace?: boolean }) => void;
  hrefFor: (patch: ViewPatch) => string;
}

const LIST_ID = 'mail-list';
const G_TIMEOUT_MS = 1500;
const G_TARGETS: Record<string, Folder> = { i: 'inbox', s: 'starred', d: 'drafts', t: 'sent' };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(target.type);
  }
  return false;
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('a[href], button, input, select, textarea, [role="menuitem"], [role="separator"]');
}

export function AppShell({ view, navigate, hrefFor }: AppShellProps) {
  const { backend, settings, t, lang } = useApp();
  const toast = useToast();
  const composer = useComposer();
  const layout = useLayout();
  const isDesktop = layout === 'desktop';
  const isPhone = layout === 'phone';
  const pane: 'right' | 'bottom' | 'off' = isPhone
    ? 'off'
    : !isDesktop && settings.readingPane === 'bottom'
      ? 'right'
      : settings.readingPane;
  const reading = !!view.threadId;
  const mailboxId = view.mailbox === 'all' ? undefined : view.mailbox;

  const query = useMemo<ThreadListQuery>(
    () => ({ mailboxId, folder: view.folder, labelId: view.labelId, search: view.search }),
    [mailboxId, view.folder, view.labelId, view.search],
  );
  const queryKey = `${mailboxId ?? ''}|${view.folder}|${view.labelId ?? ''}|${view.search ?? ''}`;
  const data = useThreadList(query);
  const meta = useMailMeta();
  const counts = useCounts(mailboxId);

  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | undefined>(view.threadId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [listWidth, setListWidth] = useListWidth();
  const [dragging, setDragging] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const openedFromList = useRef(false);

  const order = useMemo(() => data.threads.map((th) => th.id), [data.threads]);

  useEffect(() => {
    setSelection(new Set());
    setActiveId(sRef.current.view.threadId);
  }, [queryKey]);

  useEffect(() => {
    if (view.threadId) setActiveId(view.threadId);
  }, [view.threadId]);

  const drawerMode = !isDesktop;

  // Latest values for stable callbacks and the global key handler.
  const s = { view, navigate, order, activeId, selection, isPhone, data, reading, drawerOpen, drawerMode };
  const sRef = useRef(s);
  sRef.current = s;

  const onRemoved = useCallback((ids: readonly string[]) => {
    const cur = sRef.current;
    const next = successorId(cur.order, ids);
    if (cur.view.threadId && ids.includes(cur.view.threadId)) {
      cur.navigate({ threadId: cur.isPhone ? null : (next ?? null) }, { replace: true });
    }
    if (cur.activeId && ids.includes(cur.activeId)) setActiveId(next);
  }, []);

  const actions = useThreadActions({ data, folder: view.folder, labelId: view.labelId, labels: meta.labels, onRemoved });

  const composerRef = useRef(composer);
  composerRef.current = composer;
  const compose = useCallback(() => {
    composerRef.current.open({ mode: 'new', mailboxId });
  }, [mailboxId]);

  const openThread = useCallback(
    (thread: ThreadSummary) => {
      const cur = sRef.current;
      setActiveId(thread.id);
      if (cur.view.folder === 'drafts') {
        backend
          .getThread(thread.id)
          .then((msgs) => {
            const draft = [...msgs].reverse().find((m) => m.direction === 'draft' || m.folder === 'drafts');
            if (draft) composerRef.current.open({ mode: 'draft', draftId: draft.id, message: draft, mailboxId: draft.mailboxId });
            else sRef.current.navigate({ threadId: thread.id });
          })
          .catch((err: unknown) => toast({ tone: 'error', message: describeError(lang, err) }));
        return;
      }
      if (cur.view.threadId === thread.id) return;
      // First open from the list pushes a history entry; moving between threads replaces it.
      const replace = !!cur.view.threadId;
      if (!replace) openedFromList.current = true;
      cur.navigate({ threadId: thread.id }, { replace });
    },
    [backend, lang, toast],
  );

  const backToList = useCallback(() => {
    const cur = sRef.current;
    const id = cur.view.threadId;
    if (!id) return;
    if (openedFromList.current) {
      openedFromList.current = false;
      window.history.back();
    } else {
      cur.navigate({ threadId: null }, { replace: true });
    }
    window.setTimeout(() => focusThreadRow(id), 60);
  }, []);

  const navigateThread = useCallback((dir: 'next' | 'prev') => {
    const cur = sRef.current;
    const id = neighbourId(cur.order, cur.view.threadId ?? cur.activeId, dir);
    if (id) {
      setActiveId(id);
      if (cur.view.threadId) cur.navigate({ threadId: id }, { replace: true });
      if (dir === 'next' && cur.order.indexOf(id) >= cur.order.length - 3 && cur.data.hasMore) cur.data.loadMore();
    } else if (dir === 'next' && cur.data.hasMore) {
      cur.data.loadMore();
    }
  }, []);

  const onReaderRemoved = useCallback(() => {
    const cur = sRef.current;
    const id = cur.view.threadId;
    if (!id) return;
    onRemoved([id]);
    const unhide = cur.data.hide([id]);
    cur.data
      .refresh()
      .catch(() => undefined)
      .finally(unhide);
  }, [onRemoved]);

  const focusSearch = useCallback(() => {
    const cur = sRef.current;
    if (cur.isPhone && cur.view.threadId) {
      cur.navigate({ threadId: null }, { replace: true });
      window.setTimeout(() => searchRef.current?.focus(), 60);
      return;
    }
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  // Global keyboard shortcuts (the reader handles r a f e # s while a thread is open).
  useEffect(() => {
    let gPending = false;
    let gTimer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('[role="menu"], dialog, [role="dialog"][aria-modal="true"]')) return;
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      const cur = sRef.current;
      if (cur.drawerOpen) return;
      const key = e.key;

      if (gPending) {
        gPending = false;
        window.clearTimeout(gTimer);
        const folder = G_TARGETS[key];
        if (folder) {
          e.preventDefault();
          cur.navigate({ folder, labelId: null, search: null, threadId: null });
        }
        return;
      }

      const active = cur.activeId && cur.order.includes(cur.activeId) ? cur.activeId : cur.order[0];
      const activeThread = () => cur.data.threads.find((th) => th.id === active);
      const targets = () => (cur.selection.size > 0 ? cur.order.filter((id) => cur.selection.has(id)) : active ? [active] : []);

      switch (key) {
        case 'g':
          gPending = true;
          gTimer = window.setTimeout(() => {
            gPending = false;
          }, G_TIMEOUT_MS);
          return;
        case 'j':
        case 'k': {
          e.preventDefault();
          const dir = key === 'j' ? 'next' : 'prev';
          if (cur.reading) {
            navigateThread(dir);
          } else {
            const id = neighbourId(cur.order, cur.activeId && cur.order.includes(cur.activeId) ? cur.activeId : undefined, dir);
            if (id) {
              setActiveId(id);
              focusThreadRow(id);
              if (dir === 'next' && cur.order.indexOf(id) >= cur.order.length - 3 && cur.data.hasMore) cur.data.loadMore();
            }
          }
          return;
        }
        case 'Enter':
          if (isInteractive(e.target)) return;
        // falls through
        case 'o': {
          const th = activeThread();
          if (th) {
            e.preventDefault();
            openThread(th);
          }
          return;
        }
        case 'x': {
          const id = active;
          if (!id) return;
          e.preventDefault();
          setSelection((sel) => {
            const next = new Set(sel);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
          return;
        }
        case 'u':
          if (cur.view.threadId) {
            e.preventDefault();
            backToList();
          }
          return;
        case 'c':
          e.preventDefault();
          compose();
          return;
        case '/':
          e.preventDefault();
          focusSearch();
          return;
        case '?':
          e.preventDefault();
          setHelpOpen(true);
          return;
        case 'Escape':
          if (cur.selection.size > 0) {
            e.preventDefault();
            setSelection(new Set());
          }
          return;
      }

      // List actions when no thread is open (the reader owns these keys otherwise).
      if (cur.reading) return;
      const ids = targets();
      if (ids.length === 0) return;
      if (key === 'e') {
        e.preventDefault();
        const p = primaryActionFor(cur.view.folder);
        setSelection(new Set());
        if (p.target === 'archive') actions.archive(ids);
        else actions.move(ids, p.target);
      } else if (key === '#') {
        if (cur.view.folder === 'trash') return; // permanent delete only via the confirm dialog
        e.preventDefault();
        setSelection(new Set());
        actions.trash(ids);
      } else if (key === 's') {
        e.preventDefault();
        const threads = cur.data.threads.filter((th) => ids.includes(th.id));
        actions.setStarred(ids, threads.some((th) => !th.isStarred));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(gTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [actions, backToList, compose, focusSearch, navigateThread, openThread]);

  // Tab title with the inbox unread count.
  const labelName = view.labelId ? meta.labels.find((l) => l.id === view.labelId)?.name : undefined;
  const folderName = labelName ?? t(`folder.${view.folder}`);
  const listTitle = view.search ? `${t('shell.searchResults')} · ${folderName}` : folderName;
  const inboxUnread = counts.inbox ?? 0;
  const docTitle = inboxUnread > 0 ? t('shell.titleUnread', { count: inboxUnread, folder: folderName }) : t('shell.title', { folder: folderName });
  useEffect(() => {
    // Next re-applies the static metadata title after client navigations and hydration,
    // which can land after this effect. Re-assert ours whenever <head> or <title> changes.
    const apply = () => {
      if (document.title !== docTitle) document.title = docTitle;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [docTitle]);

  // Drawer (tablet / phone).
  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);
  useEffect(() => {
    if (!drawerOpen) return;
    const first = drawerRef.current?.querySelector<HTMLElement>('button, a[href], select');
    first?.focus();
  }, [drawerOpen]);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  }, []);
  const onDrawerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && drawerOpen && !isDesktop && !e.defaultPrevented) {
      e.preventDefault();
      closeDrawer();
    }
  };

  const onSearch = useCallback((q: string) => {
    sRef.current.navigate({ search: q || null }, { replace: true });
  }, []);

  const listVisible = !(reading && pane === 'off');
  const readerVisible = reading || pane !== 'off';
  const showTopBar = !(isPhone && reading);

  const shellStyle = { '--list-w': `${listWidth}px` } as CSSProperties;

  return (
    <div
      className={[styles.shell, dragging && styles.dragging].filter(Boolean).join(' ')}
      data-layout={layout}
      data-pane={pane}
      data-reading={reading ? 'true' : 'false'}
      style={shellStyle}
    >
      <a href={`#${LIST_ID}`} className={styles.skip} inert={drawerMode && drawerOpen}>
        {t('shell.skipToList')}
      </a>

      <div
        id="mail-sidebar"
        ref={drawerRef}
        className={[styles.sidebarWrap, drawerMode && styles.drawer, drawerMode && drawerOpen && styles.drawerOpen].filter(Boolean).join(' ')}
        inert={drawerMode && !drawerOpen}
        onKeyDown={onDrawerKeyDown}
        {...(drawerMode ? { role: 'dialog', 'aria-modal': drawerOpen, 'aria-label': t('shell.nav') } : {})}
      >
        <Sidebar
          view={view}
          mailboxes={meta.mailboxes}
          labels={meta.labels}
          counts={counts}
          metaError={meta.error}
          onRetryMeta={meta.reload}
          hrefFor={hrefFor}
          onNavigate={(patch) => navigate(patch)}
          onCompose={compose}
          onClose={drawerMode ? closeDrawer : undefined}
        />
      </div>
      {drawerMode && drawerOpen && <div className={styles.scrim} aria-hidden="true" onClick={closeDrawer} />}

      <main className={styles.main} inert={drawerMode && drawerOpen}>
        {showTopBar && (
          <TopBar
            query={view.search ?? ''}
            onSearch={onSearch}
            inputRef={searchRef}
            showMenuButton={drawerMode}
            menuOpen={drawerOpen}
            onOpenMenu={() => setDrawerOpen(true)}
            menuButtonRef={menuButtonRef}
            onHelp={() => setHelpOpen(true)}
          />
        )}
        <div className={styles.panes}>
          <div className={[styles.listPane, !listVisible && styles.offscreen].filter(Boolean).join(' ')} inert={!listVisible}>
            <ThreadList
              id={LIST_ID}
              data={data}
              actions={actions}
              folder={view.folder}
              labelId={view.labelId}
              search={view.search}
              title={listTitle}
              labels={meta.labels}
              openId={view.threadId}
              activeId={activeId}
              onActiveChange={setActiveId}
              selection={selection}
              onSelectionChange={setSelection}
              onOpen={openThread}
              hrefFor={(id) => hrefFor({ threadId: id })}
              onClearSearch={() => onSearch('')}
            />
          </div>
          {pane === 'right' && (
            <Splitter
              width={listWidth}
              onChange={setListWidth}
              onDragging={setDragging}
              label={t('shell.resizeList')}
            />
          )}
          {readerVisible && (
            <div className={styles.readerPane}>
              {view.threadId ? (
                <ThreadReader
                  key={view.threadId}
                  threadId={view.threadId}
                  mailboxId={mailboxId}
                  onBack={backToList}
                  onNavigate={navigateThread}
                  onRemoved={onReaderRemoved}
                />
              ) : (
                <div className={styles.placeholder}>
                  <EmptyState icon="inbox" title={t('shell.selectThread')} text={isDesktop ? t('shell.selectThreadText') : undefined} />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {isPhone && !reading && (
        <nav className={styles.bottomBar} aria-label={t('shell.bottomNav')} inert={drawerMode && drawerOpen}>
          <Link
            href={hrefFor({ folder: 'inbox', labelId: null, search: null, threadId: null })}
            className={styles.bottomItem}
            aria-current={view.folder === 'inbox' && !view.labelId ? 'page' : undefined}
          >
            <span className={styles.bottomIcon}>
              <Icon name="inbox" size={22} />
              {inboxUnread > 0 && (
                <span className={styles.bottomBadge} aria-hidden="true">
                  {inboxUnread > 99 ? '99+' : inboxUnread}
                </span>
              )}
            </span>
            <span>{t('folder.inbox')}</span>
            {inboxUnread > 0 && <span className="sr-only">, {t('shell.unreadCount', { count: inboxUnread })}</span>}
          </Link>
          <button type="button" className={styles.bottomItem} onClick={focusSearch}>
            <Icon name="search" size={22} />
            <span>{t('shell.search')}</span>
          </button>
          <button type="button" className={[styles.bottomItem, styles.bottomCompose].join(' ')} onClick={compose}>
            <span className={styles.bottomComposeIcon}>
              <Icon name="edit" size={22} />
            </span>
            <span>{t('shell.compose')}</span>
          </button>
          <button
            type="button"
            className={styles.bottomItem}
            aria-expanded={drawerOpen}
            aria-controls="mail-sidebar"
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="menu" size={22} />
            <span>{t('shell.folders')}</span>
          </button>
        </nav>
      )}

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

const KEY_STEP = 16;

function Splitter({
  width,
  onChange,
  onDragging,
  label,
}: {
  width: number;
  onChange: (w: number) => void;
  onDragging: (d: boolean) => void;
  label: string;
}) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const startX = e.clientX;
    const startW = width;
    el.setPointerCapture(e.pointerId);
    onDragging(true);
    const move = (ev: PointerEvent) => onChange(startW + ev.clientX - startX);
    const up = () => {
      onDragging(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = width - KEY_STEP;
    else if (e.key === 'ArrowRight') next = width + KEY_STEP;
    else if (e.key === 'Home') next = LIST_MIN;
    else if (e.key === 'End') next = LIST_MAX;
    if (next !== null) {
      e.preventDefault();
      onChange(next);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={LIST_ID}
      aria-valuenow={width}
      aria-valuemin={LIST_MIN}
      aria-valuemax={LIST_MAX}
      tabIndex={0}
      className={styles.splitter}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(380)}
    />
  );
}
