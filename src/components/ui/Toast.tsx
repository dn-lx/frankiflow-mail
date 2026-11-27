'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { useOptionalApp } from '../providers/AppProvider';
import styles from './Toast.module.css';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss; default 6000. 0 keeps it until closed. */
  duration?: number;
}

export type ToastFn = (options: ToastOptions) => string;

/** Callable as `toast(opts)`; also exposes `.toast` and `.dismiss`. */
export type ToastApi = ToastFn & { toast: ToastFn; dismiss: (id: string) => void };

interface ToastItem extends ToastOptions {
  id: string;
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 6000;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const toast: ToastFn = (options) => {
      const id = `toast-${++counter}`;
      setItems((list) => [...list, { ...options, id }].slice(-MAX_VISIBLE));
      return id;
    };
    return Object.assign(toast, { toast, dismiss });
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion items={items} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({ items, dismiss }: { items: ToastItem[]; dismiss: (id: string) => void }) {
  const app = useOptionalApp();
  const t = app?.t;
  return (
    // Always mounted so screen readers pick up additions politely.
    <div className={styles.region} role="status" aria-live="polite" aria-label={t ? t('common.notifications') : undefined}>
      {items.map((item) => (
        <ToastView key={item.id} item={item} dismiss={dismiss} closeLabel={t ? t('common.close') : 'Schließen'} />
      ))}
    </div>
  );
}

function ToastView({ item, dismiss, closeLabel }: { item: ToastItem; dismiss: (id: string) => void; closeLabel: string }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration ?? DEFAULT_DURATION);

  useEffect(() => {
    if (paused || remaining.current <= 0) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(1, remaining.current - (Date.now() - started));
    };
  }, [paused, dismiss, item.id]);

  const tone = item.tone ?? 'info';
  return (
    <div
      className={[styles.toast, styles[tone]].join(' ')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      {tone !== 'info' && (
        <span className={styles.icon}>
          <Icon name={tone === 'error' ? 'alert' : 'check'} size={18} />
        </span>
      )}
      <p className={styles.message}>{item.message}</p>
      {item.actionLabel && item.onAction && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            item.onAction?.();
            dismiss(item.id);
          }}
        >
          {item.actionLabel}
        </button>
      )}
      <IconButton icon="x" label={closeLabel} size="sm" className={styles.close} onClick={() => dismiss(item.id)} />
    </div>
  );
}
