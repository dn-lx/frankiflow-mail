import type { ComponentProps } from 'react';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import type { ButtonSize, ButtonVariant } from './Button';
import styles from './Button.module.css';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  icon: IconName;
  /** Required: the accessible name and tooltip. Shown as text when `showLabel` is set. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Toggle state (sets aria-pressed). */
  pressed?: boolean;
  loading?: boolean;
  /**
   * Shows `label` as visible text next to the icon. The accessible name then
   * comes from that text, so the name always matches what is shown.
   */
  showLabel?: boolean;
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  pressed,
  loading = false,
  showLabel = false,
  disabled,
  className,
  type = 'button',
  title,
  ...rest
}: IconButtonProps) {
  const cls = [styles.button, styles.iconButton, showLabel && styles.withLabel, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ');
  // A tooltip that differs from the visible text / name confuses voice control users; keep it equal to the label
  // unless the caller supplies one (which then only adds a description, not the name).
  return (
    <button
      data-variant={variant}
      {...rest}
      type={type}
      className={cls}
      aria-label={showLabel ? undefined : label}
      title={title ?? (showLabel ? undefined : label)}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
    >
      {loading ? <Spinner size="sm" /> : <Icon name={icon} size={size === 'sm' ? 16 : 20} />}
      {showLabel && <span className={styles.label}>{label}</span>}
    </button>
  );
}
