'use client';

import { useEffect, useId, useRef, type ReactNode, type MouseEvent, type SyntheticEvent } from 'react';
import { IconButton } from './IconButton';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  /** Called on Escape, backdrop click or the close button. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row at the bottom. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** aria-label for the close button. */
  closeLabel?: string;
  /** Set false to keep the dialog open on backdrop click. */
  dismissOnBackdrop?: boolean;
  className?: string;
}

/**
 * Modal dialog on the native <dialog> element (built-in focus trap and inert
 * background). Focus returns to the previously focused element on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = 'Schließen',
  dismissOnBackdrop = true,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    // On close or unmount while open: close first (removes inert), then restore focus.
    return () => {
      if (dialog.open) dialog.close();
      const el = returnFocus.current;
      returnFocus.current = null;
      if (el && el.isConnected) el.focus();
    };
  }, [open]);

  const handleCancel = (e: SyntheticEvent<HTMLDialogElement>) => {
    // Escape: keep the dialog controlled by `open`.
    e.preventDefault();
    onClose();
  };

  const handleClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, styles[size], className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={handleCancel}
      onClick={handleClick}
    >
      {open && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <IconButton icon="x" label={closeLabel} onClick={onClose} />
          </header>
          {description && (
            <p id={descId} className={styles.description}>
              {description}
            </p>
          )}
          {children != null && <div className={styles.body}>{children}</div>}
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
