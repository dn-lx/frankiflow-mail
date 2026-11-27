'use client';

import { useId, type ReactNode } from 'react';
import styles from './Form.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** On/off toggle (role="switch"); label on the left, toggle on the right. */
export function Switch({ checked, onChange, label, description, disabled, id, className }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const labelId = `${switchId}-label`;
  const descId = `${switchId}-desc`;
  return (
    <div className={[styles.switchRow, className].filter(Boolean).join(' ')}>
      <span className={styles.switchText}>
        <label id={labelId} htmlFor={switchId} className={styles.label}>
          {label}
        </label>
        {description && (
          <span id={descId} className={styles.hint}>
            {description}
          </span>
        )}
      </span>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} aria-hidden="true" />
      </button>
    </div>
  );
}
