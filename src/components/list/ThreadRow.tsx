'use client';

import { memo, useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { Avatar, Badge, Checkbox, Icon, IconButton, Menu, type IconName, type MenuItem } from '@/components/ui';
import type { Folder, Label, ThreadSummary } from '@/lib/backend/types';
import { formatListTime, type Lang } from '@/lib/i18n';
import { snoozePresets, type ConcreteFolder } from '@/lib/mail/threads';
import { SnoozeMenu } from './SnoozeMenu';
import type { ThreadExtras } from './useThreadList';
import styles from './ThreadList.module.css';

export interface RowCallbacks {
  open: (thread: ThreadSummary, e: MouseEvent | KeyboardEvent) => void;
  toggleSelect: (id: string, shift: boolean) => void;
  focusRow: (id: string) => void;
  moveFocus: (id: string, dir: 'next' | 'prev' | 'first' | 'last') => void;
  archive: (id: string) => void;
  trash: (id: string) => void;
  setRead: (id: string, read: boolean) => void;
  setStarred: (id: string, starred: boolean) => void;
  snooze: (id: string, iso: string) => void;
}

export interface ThreadRowProps {
  thread: ThreadSummary;
  href: string;
  folder: Folder;
  active: boolean;
  open: boolean;
  selected: boolean;
  selectionMode: boolean;
  compact?: boolean;
  labels: ReadonlyMap<string, Label>;
  extras?: ThreadExtras;
  /**
   * Sent / Drafts / Scheduled: recipients shown as "To: …" instead of the sender.
   * undefined = show the sender; null = not known yet; '' = no recipient.
   */
  recipients?: string | null;
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  cb: RowCallbacks;
}

/** Where the row's "primary" action goes in a folder (archive, or back to the inbox), and how it is labelled. */
export function primaryActionFor(folder: Folder): { target: ConcreteFolder; labelKey: string; icon: IconName } {
  if (folder === 'trash') return { target: 'inbox', labelKey: 'list.restore', icon: 'inbox' };
  if (folder === 'spam') return { target: 'inbox', labelKey: 'list.notSpam', icon: 'inbox' };
  if (folder === 'archive') return { target: 'inbox', labelKey: 'list.moveTo', icon: 'inbox' };
  return { target: 'archive', labelKey: 'list.archive', icon: 'archive' };
}

function shortDateTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function ThreadRowImpl({
  thread,
  href,
  folder,
  active,
  open,
  selected,
  selectionMode,
  compact = false,
  labels,
  extras,
  recipients,
  lang,
  t,
  cb,
}: ThreadRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const unread = thread.unreadCount > 0;
  const subject = thread.subject.trim() || t('list.noSubject');
  const toMode = recipients !== undefined;
  const sender = toMode
    ? recipients === null
      ? t('list.to', { names: '…' })
      : recipients === ''
        ? t('list.noRecipient')
        : t('list.to', { names: recipients })
    : thread.participants.length
      ? thread.participants.join(', ')
      : t('list.me');
  const firstName = toMode ? (recipients ? (recipients.split(', ')[0] ?? '') : '') : (thread.participants[0] ?? '');
  const trashLike = folder === 'trash';

  // Roving tab stop: only the active row's controls are in the tab order.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    row.querySelectorAll<HTMLElement>('a, input, button:not([data-menu-item])').forEach((el) => {
      el.tabIndex = active ? 0 : -1;
    });
  });

  const onLinkKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cb.moveFocus(thread.id, 'next');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cb.moveFocus(thread.id, 'prev');
    } else if (e.key === 'Home') {
      e.preventDefault();
      cb.moveFocus(thread.id, 'first');
    } else if (e.key === 'End') {
      e.preventDefault();
      cb.moveFocus(thread.id, 'last');
    } else if (e.key === ' ' && !e.shiftKey) {
      e.preventDefault();
      cb.toggleSelect(thread.id, false);
    }
  };

  const onLinkClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle new-tab / new-window clicks.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    if (e.shiftKey) {
      cb.toggleSelect(thread.id, true);
      return;
    }
    cb.open(thread, e);
  };

  const presets = snoozePresets();
  const primary = primaryActionFor(folder);
  const primaryLabel = t(primary.labelKey, { folder: t('folder.inbox') });
  const canSnooze = folder !== 'trash' && folder !== 'spam' && folder !== 'drafts' && folder !== 'scheduled' && folder !== 'sent';
  const touchItems: MenuItem[] = [
    { id: 'primary', icon: primary.icon, label: primaryLabel, onSelect: () => cb.archive(thread.id) },
    { id: 'trash', icon: 'trash', label: trashLike ? t('list.deleteForever') : t('list.delete'), danger: true, onSelect: () => cb.trash(thread.id) },
    {
      id: 'read',
      icon: 'check',
      label: unread ? t('list.markRead') : t('list.markUnread'),
      onSelect: () => cb.setRead(thread.id, unread),
    },
  ];
  if (canSnooze) {
    touchItems.push(
      { id: 'sep', separator: true },
      {
        id: 'snooze-tomorrow',
        icon: 'alarm',
        label: `${t('snooze.label')}: ${t('snooze.tomorrow', { time: '08:00' })}`,
        onSelect: () => cb.snooze(thread.id, presets.tomorrow.toISOString()),
      },
      {
        id: 'snooze-monday',
        icon: 'alarm',
        label: `${t('snooze.label')}: ${t('snooze.nextMonday', { time: '08:00' })}`,
        onSelect: () => cb.snooze(thread.id, presets.nextMonday.toISOString()),
      },
    );
  }

  const timeIso = folder === 'scheduled' && extras?.scheduledAt ? extras.scheduledAt : thread.lastMessageAt;
  const shownLabels = thread.labelIds.map((id) => labels.get(id)).filter((l): l is Label => !!l);
  const hideStar = folder === 'spam' || folder === 'trash';
  const showWhen = (folder === 'snoozed' && !!extras?.snoozedUntil) || (folder === 'scheduled' && !!extras?.scheduledAt);

  return (
    <li
      ref={rowRef}
      className={[
        styles.row,
        unread && styles.unread,
        selected && styles.selected,
        open && styles.open,
        active && styles.active,
        selectionMode && styles.selectionMode,
        canSnooze ? styles.hover4 : styles.hover3,
      ]
        .filter(Boolean)
        .join(' ')}
      data-thread-id={thread.id}
    >
      <div className={styles.select}>
        <Avatar name={firstName} size="md" className={styles.avatar} />
        <Checkbox
          className={styles.check}
          label={t('list.selectThread', { subject })}
          hideLabel
          checked={selected}
          onChange={() => undefined}
          onClick={(e) => {
            e.stopPropagation();
            cb.toggleSelect(thread.id, e.shiftKey);
          }}
          onFocus={() => cb.focusRow(thread.id)}
        />
      </div>

      <a
        href={href}
        className={styles.link}
        data-thread-link={thread.id}
        aria-current={open ? 'true' : undefined}
        onClick={onLinkClick}
        onKeyDown={onLinkKeyDown}
        onFocus={() => cb.focusRow(thread.id)}
      >
        <span className={styles.line1}>
          {unread && <span className={styles.dot} aria-hidden="true" />}
          {unread && <span className="sr-only">{t('list.unread')}, </span>}
          {folder === 'drafts' && (
            <span className={styles.draft}>{t('list.draft')}</span>
          )}
          <span className={styles.sender}>{sender}</span>
          {thread.messageCount > 1 && (
            <span className={styles.count}>
              <span aria-hidden="true">{thread.messageCount}</span>
              <span className="sr-only">, {t('list.messages', { count: thread.messageCount })}</span>
            </span>
          )}
          <time className={styles.time} dateTime={timeIso}>
            {folder === 'scheduled' && extras?.scheduledAt ? shortDateTime(timeIso, lang) : formatListTime(timeIso, lang)}
          </time>
        </span>
        <span className={styles.line2}>
          {thread.priority === 'high' && (
            <span className={styles.priority} title={t('list.highPriority')}>
              <span aria-hidden="true">!</span>
              <span className="sr-only">{t('list.highPriority')}, </span>
            </span>
          )}
          {thread.isPinned && <Icon name="pin" size={14} className={styles.pin} label={t('list.pinned')} />}
          <span className={styles.subject}>{subject}</span>
          {compact &&
            shownLabels.slice(0, 2).map((l) => (
              <Badge key={l.id} color={l.color} className={styles.chip}>
                {l.name}
              </Badge>
            ))}
          {compact && shownLabels.length > 2 && <Badge className={styles.chip}>+{shownLabels.length - 2}</Badge>}
          {thread.hasAttachments && <Icon name="paperclip" size={14} className={styles.clip} label={t('list.hasAttachments')} />}
        </span>
        {!compact && thread.preview && <span className={styles.preview}>{thread.preview}</span>}
        {(showWhen || (!compact && shownLabels.length > 0)) && (
          <span className={styles.meta}>
            {folder === 'snoozed' && extras?.snoozedUntil && (
              <span className={styles.when}>
                <Icon name="alarm" size={14} />
                {t('list.snoozedUntil', { time: shortDateTime(extras.snoozedUntil, lang) })}
              </span>
            )}
            {folder === 'scheduled' && extras?.scheduledAt && (
              <span className={styles.when}>
                <Icon name="clock" size={14} />
                {t('list.scheduledFor', { time: shortDateTime(extras.scheduledAt, lang) })}
              </span>
            )}
            {!compact &&
              shownLabels.slice(0, 3).map((l) => (
                <Badge key={l.id} color={l.color} className={styles.chip}>
                  {l.name}
                </Badge>
              ))}
            {!compact && shownLabels.length > 3 && <Badge className={styles.chip}>+{shownLabels.length - 3}</Badge>}
          </span>
        )}
      </a>

      <div className={styles.side}>
        {!hideStar && (
          <IconButton
            icon={thread.isStarred ? 'star-filled' : 'star'}
            label={thread.isStarred ? t('list.unstar') : t('list.star')}
            pressed={thread.isStarred}
            size="sm"
            className={[styles.star, thread.isStarred && styles.starOn].filter(Boolean).join(' ')}
            onClick={() => cb.setStarred(thread.id, !thread.isStarred)}
            onFocus={() => cb.focusRow(thread.id)}
          />
        )}
        <div className={styles.touchMenu}>
          <Menu label={t('list.rowActions')} items={touchItems} size="sm" />
        </div>
      </div>

      {/* Per-row hover actions; not while several rows are selected (the bulk bar acts then). */}
      {!selectionMode && (
        <div className={styles.hoverActions}>
          <IconButton icon={primary.icon} label={primaryLabel} size="sm" onClick={() => cb.archive(thread.id)} />
          <IconButton
            icon="trash"
            label={trashLike ? t('list.deleteForever') : t('list.delete')}
            size="sm"
            onClick={() => cb.trash(thread.id)}
          />
          <IconButton
            icon={unread ? 'check' : 'inbox'}
            label={unread ? t('list.markRead') : t('list.markUnread')}
            size="sm"
            onClick={() => cb.setRead(thread.id, unread)}
          />
          {canSnooze && <SnoozeMenu size="sm" onPick={(iso) => cb.snooze(thread.id, iso)} />}
        </div>
      )}
    </li>
  );
}

export const ThreadRow = memo(ThreadRowImpl);
