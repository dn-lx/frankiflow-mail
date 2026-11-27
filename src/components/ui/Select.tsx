'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Form.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'children'> {
  label: ReactNode;
  /** Either pass options or <option> children. */
  options?: SelectOption[];
  children?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
}

export function Select({ label, options, children, hint, error, hideLabel, id, className, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={selectId} className={hideLabel ? 'sr-only' : styles.label}>
        {label}
      </label>
      <span className={styles.selectWrap}>
        <select
          {...rest}
          id={selectId}
          className={[styles.input, styles.select].join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          {options
            ? options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))
            : children}
        </select>
        <Icon name="chevron-down" size={16} className={styles.selectIcon} />
      </span>
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
