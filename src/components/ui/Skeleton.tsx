import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  /** Renders this many text lines (last one shorter). */
  lines?: number;
  className?: string;
}

/** Decorative loading placeholder. Pair with an aria-busy container or a Spinner label. */
export function Skeleton({ width, height, circle, lines, className }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <span className={[styles.lines, className].filter(Boolean).join(' ')} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={styles.skeleton} style={{ width: i === lines - 1 ? '60%' : '100%', height }} />
        ))}
      </span>
    );
  }
  const style: CSSProperties = { width, height: circle ? (height ?? width) : height };
  return (
    <span
      className={[styles.skeleton, circle && styles.circle, className].filter(Boolean).join(' ')}
      style={style}
      aria-hidden="true"
    />
  );
}
