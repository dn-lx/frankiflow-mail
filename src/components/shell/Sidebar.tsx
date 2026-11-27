'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Badge, Button, Icon, IconButton, Menu, Select, useToast } from '@/components/ui';
import type { Folder, Label, Mailbox } from '@/lib/backend/types';
import { describeError } from '@/lib/i18n';
import { CreateLabelDialog, DeleteLabelDialog } from './LabelDialogs';
import { FOLDER_ICONS, NAV_FOLDERS, type MailView, type ViewPatch } from './view';
import type { Counts } from './hooks';
import styles from './AppShell.module.css';
import './strings';

export interface SidebarProps {
  view: MailView;
  mailboxes: Mailbox[] | null;
  labels: Label[];
  counts: Counts;
  metaError: boolean;
  onRetryMeta: () => void;
  hrefFor: (patch: ViewPatch) => string;
  onNavigate: (patch: ViewPatch) => void;
  onCompose: () => void;
  /** Drawer mode: close button + close after navigation. */
  onClose?: () => void;
}

/** Drafts and Scheduled show totals; the rest unread counts. */
function countLabel(folder: Folder, n: number, t: (k: string, v?: Record<string, number>) => string): string {
  return folder === 'drafts' || folder === 'scheduled' ? t('shell.itemCount', { count: n }) : t('shell.unreadCount', { count: n });
}

export function Sidebar({ view, mailboxes, labels, counts, metaError, onRetryMeta, hrefFor, onNavigate, onCompose, onClose }: SidebarProps) {
  const { backend, session, mode, t, lang, refreshSession } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Label | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await backend.signOut();
      await refreshSession();
      router.replace('/login/');
    } catch (err) {
      toast({ tone: 'error', message: `${t('shell.signOutFailed')} ${describeError(lang, err)}` });
      setSigningOut(false);
    }
  };

  const afterNav = () => onClose?.();
  const activeFolder = view.labelId ? null : view.folder;

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarTop}>
        <Button
          variant="primary"
          icon="edit"
          className={styles.compose}
          onClick={() => {
            onClose?.();
            onCompose();
          }}
          aria-keyshortcuts="c"
        >
          {t('shell.compose')}
        </Button>
        {mode === 'demo' && (
          <Badge tone="warning" title={t('demo.badgeLabel')} className={styles.demoBadge}>
            <span aria-hidden="true">{t('demo.badge')}</span>
            <span className="sr-only">{t('demo.badgeLabel')}</span>
          </Badge>
        )}
        {onClose && <IconButton icon="x" label={t('shell.closeMenu')} onClick={onClose} />}
      </div>

      {metaError ? (
        <div className={styles.metaError} role="alert">
          <span>{t('shell.loadSidebarError')}</span>
          <Button size="sm" icon="refresh" onClick={onRetryMeta}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        mailboxes &&
        mailboxes.length > 1 && (
          <Select
            label={t('shell.mailbox')}
            className={styles.mailboxSelect}
            value={view.mailbox}
            onChange={(e) => {
              onNavigate({ mailbox: e.target.value, threadId: null });
              afterNav();
            }}
            options={[
              { value: 'all', label: t('shell.allMailboxes') },
              ...mailboxes.map((m) => ({ value: m.id, label: m.displayName ? `${m.displayName} · ${m.address}` : m.address })),
            ]}
          />
        )
      )}
      {mailboxes && mailboxes.length === 1 && <p className={styles.singleMailbox}>{mailboxes[0]!.address}</p>}

      <nav aria-label={t('shell.folders')} className={styles.nav}>
        <ul role="list" className={styles.navList}>
          {NAV_FOLDERS.map((f) => {
            const n = counts[f] ?? 0;
            const current = activeFolder === f;
            return (
              <li key={f}>
                <Link
                  href={hrefFor({ folder: f, labelId: null, search: null, threadId: null })}
                  className={[styles.navItem, current && styles.navCurrent, n > 0 && f === 'inbox' && styles.navUnread].filter(Boolean).join(' ')}
                  aria-current={current ? 'page' : undefined}
                  onClick={afterNav}
                >
                  <Icon name={FOLDER_ICONS[f]} size={18} />
                  <span className={styles.navText}>{t(`folder.${f}`)}</span>
                  {n > 0 && (
                    <span className={styles.navCount}>
                      <span aria-hidden="true">{n > 999 ? '999+' : n}</span>
                      <span className="sr-only">, {countLabel(f, n, t)}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className={styles.labels} aria-labelledby="sidebar-labels-heading">
        <div className={styles.labelsHead}>
          <h2 id="sidebar-labels-heading" className={styles.sectionTitle}>
            {t('shell.labels')}
          </h2>
          <IconButton icon="plus" size="sm" label={t('shell.labelCreate')} onClick={() => setCreating(true)} />
        </div>
        {labels.length === 0 ? (
          <p className={styles.muted}>{t('shell.labelsEmpty')}</p>
        ) : (
          <ul role="list" className={styles.navList}>
            {labels.map((l) => {
              const current = view.labelId === l.id;
              return (
                <li key={l.id} className={styles.labelRow}>
                  <Link
                    href={hrefFor({ folder: 'all', labelId: l.id, search: null, threadId: null })}
                    className={[styles.navItem, current && styles.navCurrent].filter(Boolean).join(' ')}
                    aria-current={current ? 'page' : undefined}
                    onClick={afterNav}
                  >
                    <span className={styles.labelDot} style={{ '--label-color': l.color } as CSSProperties} aria-hidden="true" />
                    <span className={styles.navText}>{l.name}</span>
                  </Link>
                  <Menu
                    size="sm"
                    className={styles.labelMenu}
                    label={t('shell.labelActions', { name: l.name })}
                    items={[
                      {
                        id: 'delete',
                        icon: 'trash',
                        label: t('shell.labelDeleteItem'),
                        danger: true,
                        onSelect: () => setDeleting(l),
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className={styles.sidebarBottom}>
        <Link href="/settings/" className={styles.navItem} onClick={afterNav}>
          <Icon name="settings" size={18} />
          <span className={styles.navText}>{t('shell.settings')}</span>
        </Link>
        {mode === 'demo' && (
          <Link href="/demo-admin/" className={styles.navItem} onClick={afterNav}>
            <Icon name="users" size={18} />
            <span className={styles.navText}>{t('shell.testUsers')}</span>
          </Link>
        )}
        <div className={styles.account}>
          <Icon name="user" size={18} />
          <span className={styles.accountEmail} title={session?.email}>
            <span className="sr-only">{t('shell.signedInAs')} </span>
            {session?.email}
          </span>
          <IconButton icon="logout" size="sm" label={t('auth.signOut')} loading={signingOut} onClick={signOut} />
        </div>
      </div>

      {creating && (
        <CreateLabelDialog
          labels={labels}
          onClose={() => setCreating(false)}
          onCreated={() => onRetryMeta()}
        />
      )}
      {deleting && (
        <DeleteLabelDialog
          label={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(l) => {
            onRetryMeta();
            if (view.labelId === l.id) onNavigate({ folder: 'inbox', labelId: null, threadId: null });
          }}
        />
      )}
    </div>
  );
}
