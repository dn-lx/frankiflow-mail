'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import styles from './PasswordField.module.css';

export interface PasswordFieldProps extends Omit<ComponentProps<'input'>, 'children' | 'type'> {
  label: ReactNode;
  hint?: ReactNode;
  /** Shown below the field and announced; marks the input invalid. */
  error?: ReactNode;
  hideLabel?: boolean;
  /** Accessible label when the password is hidden (e.g. "Show password"). */
  showLabel: string;
  /** Accessible label when the password is visible (e.g. "Hide password"). */
  hideLabelText: string;
}

export function PasswordField({
  label,
  hint,
  error,
  hideLabel,
  showLabel,
  hideLabelText,
  id,
  className,
  disabled,
  ...rest
}: PasswordFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [visible, setVisible] = useState(false);

  const describedBy =
    [hint && hintId, error && errorId, rest['aria-describedby']].filter(Boolean).join(' ') || undefined;
  const toggleLabel = visible ? hideLabelText : showLabel;

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : styles.label}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          {...rest}
          id={inputId}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          className={styles.input}
          aria-invalid={error ? true : rest['aria-invalid']}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className={styles.toggleBtn}
          aria-pressed={visible}
          aria-label={toggleLabel}
          title={toggleLabel}
          disabled={disabled}
          onClick={() => setVisible((prev) => !prev)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {visible ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <path d="m1 1 22 22" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
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
