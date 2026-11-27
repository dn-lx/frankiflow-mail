'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useOptionalApp } from '../providers/AppProvider';
import { translate } from '@/lib/i18n';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success' | 'demo';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Optional colour dot (e.g. a label colour). Decorative; text carries the meaning. */
  color?: string;
  title?: string;
  className?: string;
}

export function Badge({ children, tone = 'neutral', color, title, className }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')} title={title}>
      {color && <span className={styles.dot} style={{ '--badge-dot': color } as CSSProperties} aria-hidden="true" />}
      {children}
    </span>
  );
}

export interface DemoBadgeProps {
  className?: string;
}

/** The one "DEMO" marker used on every screen (mailbox header, login, demo admin). */
export function DemoBadge({ className }: DemoBadgeProps) {
  const app = useOptionalApp();
  const t = app?.t ?? ((key: string) => translate('de', key));
  const description = t('demo.badgeLabel');
  return (
    <span className={[styles.badge, styles.demo, className].filter(Boolean).join(' ')} title={description}>
      <span aria-hidden="true">{t('demo.badge')}</span>
      <span className="sr-only">{description}</span>
    </span>
  );
}
