'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import buttonStyles from './Button.module.css';
import styles from './Menu.module.css';

export type MenuItem =
  | {
      id: string;
      label: string;
      onSelect: () => void;
      icon?: IconName;
      /** Keyboard hint shown on the right, e.g. "e". */
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Renders as menuitemcheckbox with this state. */
      checked?: boolean;
    }
  | { id: string; separator: true };

export interface MenuProps {
  /** Accessible name of the trigger (also tooltip for icon triggers). */
  label: string;
  items: MenuItem[];
  /** Icon-only trigger (default "more"). Ignored when `triggerContent` is set. */
  icon?: IconName;
  /** Text trigger content; renders a secondary-style button with a chevron. */
  triggerContent?: ReactNode;
  align?: 'start' | 'end';
  /** Open upwards (e.g. in bottom bars). */
  placement?: 'bottom' | 'top';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

type ActionItem = Extract<MenuItem, { onSelect: () => void }>;
const isAction = (item: MenuItem): item is ActionItem => !('separator' in item);

/** Menu button pattern: arrow keys, Home/End, type-ahead, Escape, Tab and click outside close. */
export function Menu({
  label,
  items,
  icon = 'more',
  triggerContent,
  align = 'end',
  placement = 'bottom',
  size = 'md',
  disabled,
  className,
}: MenuProps) {
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
    (focusOnOpen.current === 'last' ? els[els.length - 1] : els[0])?.focus();
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

  const select = (item: ActionItem) => {
    close(true);
    item.onSelect();
  };

  const commonTrigger = {
    id: triggerId,
    ref: triggerRef,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: toggle,
    onKeyDown: onTriggerKeyDown,
    disabled,
  };

  return (
    <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(' ')}>
      {triggerContent != null ? (
        <button
          type="button"
          {...commonTrigger}
          aria-label={label}
          className={[buttonStyles.button, buttonStyles.secondary, buttonStyles[size]].join(' ')}
        >
          <span className={buttonStyles.label}>{triggerContent}</span>
          <Icon name="chevron-down" size={16} />
        </button>
      ) : (
        <IconButton icon={icon} label={label} size={size} {...commonTrigger} />
      )}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          tabIndex={-1}
          className={[styles.menu, styles[align], styles[placement]].join(' ')}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) =>
            isAction(item) ? (
              <button
                key={item.id}
                type="button"
                data-menu-item=""
                role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={item.checked}
                tabIndex={-1}
                disabled={item.disabled}
                className={[styles.item, item.danger && styles.danger].filter(Boolean).join(' ')}
                onClick={() => select(item)}
              >
                <span className={styles.icon}>
                  {item.checked ? <Icon name="check" size={18} /> : item.icon ? <Icon name={item.icon} size={18} /> : null}
                </span>
                <span className={styles.text}>{item.label}</span>
                {item.shortcut && (
                  <kbd className={styles.shortcut} aria-hidden="true">
                    {item.shortcut}
                  </kbd>
                )}
              </button>
            ) : (
              <div key={item.id} role="separator" className={styles.separator} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
