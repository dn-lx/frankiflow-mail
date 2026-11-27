'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import styles from './Form.module.css';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'children'> {
  label: ReactNode;
  hint?: ReactNode;
  /** Shown below the field and announced; marks the input invalid. */
  error?: ReactNode;
  hideLabel?: boolean;
}

export function TextField({ label, hint, error, hideLabel, id, className, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint && hintId, error && errorId, rest['aria-describedby']].filter(Boolean).join(' ') || undefined;
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : styles.label}>
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : rest['aria-invalid']}
        aria-describedby={describedBy}
      />
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
