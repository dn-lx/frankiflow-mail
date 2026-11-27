import type { CSSProperties, ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success';

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
