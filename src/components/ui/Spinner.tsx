import styles from './Spinner.module.css';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Announced to screen readers. Omit when the surrounding element already says it is busy. */
  label?: string;
  className?: string;
}

export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  const cls = [styles.spinner, styles[size], className].filter(Boolean).join(' ');
  if (!label) return <span className={cls} aria-hidden="true" />;
  return (
    <span role="status" className={styles.wrap}>
      <span className={cls} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
