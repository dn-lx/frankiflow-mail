import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  text?: ReactNode;
  /** e.g. a <Button>. */
  action?: ReactNode;
  /** Heading level of the title; default 2. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function EmptyState({ icon, title, text, action, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={[styles.empty, className].filter(Boolean).join(' ')}>
      {icon && (
        <span className={styles.icon}>
          <Icon name={icon} size={28} />
        </span>
      )}
      <Heading className={styles.title}>{title}</Heading>
      {text && <p className={styles.text}>{text}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
