import type { ComponentProps } from 'react';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import type { ButtonSize, ButtonVariant } from './Button';
import styles from './Button.module.css';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  icon: IconName;
  /** Required: used as aria-label and tooltip. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Toggle state (sets aria-pressed). */
  pressed?: boolean;
  loading?: boolean;
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  pressed,
  loading = false,
  disabled,
  className,
  type = 'button',
  title,
  ...rest
}: IconButtonProps) {
  const cls = [styles.button, styles.iconButton, styles[variant], styles[size], className].filter(Boolean).join(' ');
  return (
    <button
      {...rest}
      type={type}
      className={cls}
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
    >
      {loading ? <Spinner size="sm" /> : <Icon name={icon} size={size === 'sm' ? 16 : 20} />}
    </button>
  );
}
