'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Icon } from '@/components/ui';
import buttonStyles from '@/components/ui/Button.module.css';
import menuStyles from '@/components/ui/Menu.module.css';
import type { ListFilter } from '@/components/shell/view';
import styles from './ThreadList.module.css';

export interface FilterMenuProps {
  value: ListFilter | undefined;
  onChange: (next: ListFilter | undefined) => void;
}

const OPTIONS: readonly (ListFilter | undefined)[] = [undefined, 'unread', 'read', 'starred', 'unstarred'];

/** Filter dropdown next to the list's select-all checkbox (menuitemradio group). */
export function FilterMenu({ value, onChange }: FilterMenuProps) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusOnOpen = useRef<'first' | 'last'>('first');
  const menuId = useId();
  const triggerId = useId();

  const itemEls = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[data-menu-item]:not(:disabled)') ?? []);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const els = itemEls();
    const target = focusOnOpen.current === 'last' ? els[els.length - 1] : els[0];
    (target ?? menuRef.current)?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const toggle = () => {
    focusOnOpen.current = 'first';
    setOpen((o) => !o);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusOnOpen.current = e.key === 'ArrowUp' ? 'last' : 'first';
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = itemEls();
    const index = els.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => els[(i + els.length) % els.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(index < 0 ? -1 : index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(-1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const ch = e.key.toLowerCase();
          const start = index + 1;
          for (let n = 0; n < els.length; n++) {
            const el = els[(start + n) % els.length];
            if (el?.textContent?.trim().toLowerCase().startsWith(ch)) {
              el.focus();
              break;
            }
          }
        }
    }
  };

  const select = (next: ListFilter | undefined) => {
    close(true);
    onChange(next);
  };

  return (
    <div ref={rootRef} className={menuStyles.root}>
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        aria-label={t('list.filter')}
        title={t('list.filterTooltip')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        className={[buttonStyles.button, buttonStyles.iconButton, buttonStyles.ghost, buttonStyles.sm, styles.filterButton].join(' ')}
      >
        <Icon name="chevron-down" size={16} />
        {value && <span className={styles.filterDot} aria-hidden="true" />}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          tabIndex={-1}
          className={[menuStyles.menu, menuStyles.start, menuStyles.bottom].join(' ')}
          onKeyDown={onMenuKeyDown}
        >
          {OPTIONS.map((opt) => {
            const active = value === opt;
            const label = t(opt ? `list.filter.${opt}` : 'list.filter.all');
            return (
              <button
                key={opt ?? 'all'}
                type="button"
                data-menu-item=""
                role="menuitemradio"
                aria-checked={active}
                tabIndex={-1}
                className={menuStyles.item}
                onClick={() => select(opt)}
              >
                <span className={menuStyles.icon}>{active ? <Icon name="check" size={18} /> : null}</span>
                <span className={menuStyles.text}>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
