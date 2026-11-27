import type { ComponentProps, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  icon?: IconName;
  iconEnd?: IconName;
  fullWidth?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconEnd,
  fullWidth,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const cls = [styles.button, styles[variant], styles[size], fullWidth && styles.full, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      data-variant={variant}
      {...rest}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner size="sm" /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children != null && <span className={styles.label}>{children}</span>}
      {iconEnd && !loading && <Icon name={iconEnd} size={size === 'sm' ? 16 : 18} />}
    </button>
  );
}
