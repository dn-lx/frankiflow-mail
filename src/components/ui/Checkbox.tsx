'use client';

import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import styles from './Form.module.css';

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'children'> {
  label: ReactNode;
  /** Keep the label for screen readers only (e.g. row selection checkboxes). */
  hideLabel?: boolean;
  indeterminate?: boolean;
}

export function Checkbox({ label, hideLabel, indeterminate = false, className, ref, ...rest }: CheckboxProps) {
  const inner = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const setRef = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  return (
    <label className={[styles.check, className].filter(Boolean).join(' ')}>
      <input {...rest} ref={setRef} type="checkbox" className={styles.checkbox} />
      <span className={hideLabel ? 'sr-only' : styles.checkLabel}>{label}</span>
    </label>
  );
}
