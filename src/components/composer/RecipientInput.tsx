'use client';

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import type { Contact, MailBackend } from '@/lib/backend/types';
import { emailProblem, formatAddress, parseAddressList, splitAddressText, type ParsedAddress } from '@/lib/mail/addresses';
import { Icon } from '../ui/Icon';
import { newRecipientId, toRecipients } from './recipients.ts';
import type { Recipient } from './types';
import styles from './Composer.module.css';

export { newRecipientId, toRecipients };

export interface RecipientInputHandle {
  /** Turns any typed text into chips and returns the resulting list. */
  commit(): Recipient[];
  focus(): void;
}

export interface RecipientInputProps {
  label: string;
  value: Recipient[];
  onChange: (next: Recipient[]) => void;
  backend: MailBackend;
  t: (key: string, vars?: Record<string, string | number>) => string;
  handleRef?: Ref<RecipientInputHandle>;
  /** Extra controls at the end of the row (Cc / Bcc links). */
  trailing?: ReactNode;
}

function hasOpenQuoteOrAngle(text: string): boolean {
  const quotes = (text.match(/"/g) ?? []).length;
  if (quotes % 2 === 1) return true;
  return text.lastIndexOf('<') > text.lastIndexOf('>');
}

export function RecipientInput({ label, value, onChange, backend, t, handleRef, trailing }: RecipientInputProps) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const textRef = useRef(text);
  textRef.current = text;
  const focused = useRef(false);
  const seq = useRef(0);
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const errorId = `${baseId}-error`;
  const labelId = `${baseId}-label`;

  const closeList = useCallback(() => {
    seq.current += 1;
    setOpen(false);
    setActive(-1);
    setSuggestions([]);
  }, []);

  const addParsed = useCallback(
    (parsed: ParsedAddress[]): Recipient[] => {
      const base = valueRef.current;
      const keys = new Set(base.map((r) => r.address.toLowerCase()));
      const next = [...base];
      for (const p of parsed) {
        const key = p.address.toLowerCase();
        if (!p.address || keys.has(key)) continue;
        keys.add(key);
        next.push({ id: newRecipientId(), address: p.address, name: p.name });
      }
      if (next.length !== base.length) {
        valueRef.current = next;
        onChange(next);
      }
      return next;
    },
    [onChange],
  );

  const commitText = useCallback(
    (raw: string): Recipient[] => {
      setText('');
      textRef.current = '';
      closeList();
      const parsed = parseAddressList(raw);
      if (!parsed.length) return valueRef.current;
      return addParsed(parsed);
    },
    [addParsed, closeList],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      commit: () => (textRef.current.trim() ? commitText(textRef.current) : valueRef.current),
      focus: () => inputRef.current?.focus(),
    }),
    [commitText],
  );

  // Contact suggestions (debounced; stale responses ignored).
  useEffect(() => {
    const q = text.trim();
    if (!q || /[,;]/.test(q)) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const my = ++seq.current;
    const timer = window.setTimeout(() => {
      backend
        .suggestContacts(q)
        .then((list) => {
          if (my !== seq.current) return;
          const have = new Set(valueRef.current.map((r) => r.address.toLowerCase()));
          const filtered = list.filter((c) => !have.has(c.address.toLowerCase())).slice(0, 8);
          setSuggestions(filtered);
          setOpen(filtered.length > 0 && focused.current);
          setActive(filtered.length > 0 && !q.includes('@') ? 0 : -1);
        })
        .catch(() => {
          if (my !== seq.current) return;
          setSuggestions([]);
          setOpen(false);
        });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [text, backend]);

  const choose = (contact: Contact) => {
    setText('');
    textRef.current = '';
    closeList();
    addParsed([{ name: contact.name, address: contact.address, raw: contact.address }]);
    inputRef.current?.focus();
  };

  const remove = (id: string, refocus = true) => {
    const chip = valueRef.current.find((r) => r.id === id);
    const next = valueRef.current.filter((r) => r.id !== id);
    valueRef.current = next;
    onChange(next);
    if (chip) setAnnouncement(t('composer.recipient.removed', { address: chip.address }));
    if (refocus) inputRef.current?.focus();
  };

  const edit = (chip: Recipient) => {
    const pending = textRef.current.trim();
    if (pending) commitText(pending);
    const next = valueRef.current.filter((r) => r.id !== chip.id);
    valueRef.current = next;
    onChange(next);
    const formatted = formatAddress(chip);
    setText(formatted);
    textRef.current = formatted;
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(formatted.length, formatted.length);
    });
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (/[,;\n]/.test(v) && !hasOpenQuoteOrAngle(v)) {
      const endsWithSep = /[,;\n]\s*$/.test(v);
      const parts = splitAddressText(v);
      if (endsWithSep || parts.length > 1) {
        const rest = endsWithSep ? '' : parts[parts.length - 1];
        const head = endsWithSep ? parts : parts.slice(0, -1);
        addParsed(parseAddressList(head.join(',')));
        setText(rest);
        textRef.current = rest;
        return;
      }
    }
    setText(v);
    textRef.current = v;
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted || !(/[,;\n]/.test(pasted) || pasted.includes('@'))) return;
    e.preventDefault();
    // Replace the current selection (or insert at the caret) instead of appending.
    const current = textRef.current;
    const input = inputRef.current;
    const start = input?.selectionStart ?? current.length;
    const end = input?.selectionEnd ?? start;
    commitText(`${current.slice(0, start)}${pasted}${current.slice(end)}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const count = suggestions.length;
    switch (e.key) {
      case 'ArrowDown':
        if (!count) return;
        e.preventDefault();
        setOpen(true);
        setActive((a) => (a + 1) % count);
        return;
      case 'ArrowUp':
        if (!count) return;
        e.preventDefault();
        setOpen(true);
        setActive((a) => (a <= 0 ? count - 1 : a - 1));
        return;
      case 'Enter': {
        if (e.ctrlKey || e.metaKey) {
          // Send shortcut: commit first, then let it bubble to the window.
          if (textRef.current.trim()) commitText(textRef.current);
          return;
        }
        e.preventDefault();
        const pick = open && active >= 0 ? suggestions[active] : undefined;
        if (pick) choose(pick);
        else if (textRef.current.trim()) commitText(textRef.current);
        return;
      }
      case 'Tab': {
        const pick = open && active >= 0 ? suggestions[active] : undefined;
        if (pick) {
          setText('');
          textRef.current = '';
          closeList();
          addParsed([{ name: pick.name, address: pick.address, raw: pick.address }]);
        } else if (textRef.current.trim()) {
          commitText(textRef.current);
        }
        return;
      }
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          closeList();
        }
        return;
      case 'Backspace':
        if (textRef.current === '' && valueRef.current.length) {
          e.preventDefault();
          const last = valueRef.current[valueRef.current.length - 1];
          remove(last.id);
        }
        return;
      default:
    }
  };

  const invalid = value.filter((r) => emailProblem(r.address) !== null);
  const activeId = open && active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <div className={styles.recipientRow}>
      <div className={styles.fieldRow} role="group" aria-labelledby={labelId}>
        <label id={labelId} htmlFor={inputId} className={styles.fieldLabel}>
          {label}
        </label>
        <div className={styles.chipArea} onClick={(e) => e.target === e.currentTarget && inputRef.current?.focus()}>
          {value.length > 0 && (
            <ul role="list" className={styles.chips} aria-label={t('composer.recipient.listLabel', { field: label })}>
              {value.map((r) => {
                const problem = emailProblem(r.address);
                const shown = r.name ? r.name : r.address;
                return (
                  <li key={r.id} className={[styles.chip, problem && styles.chipInvalid].filter(Boolean).join(' ')}>
                    <button
                      type="button"
                      className={styles.chipLabel}
                      title={problem ? t(`composer.email.${problem}`, { address: r.address }) : formatAddress(r)}
                      aria-label={
                        problem
                          ? t('composer.recipient.editInvalid', { address: r.address })
                          : t('composer.recipient.edit', { address: formatAddress(r) })
                      }
                      onClick={() => edit(r)}
                    >
                      {problem && <Icon name="alert" size={14} />}
                      <span className={styles.chipText}>{shown}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.chipRemove}
                      aria-label={t('composer.recipient.remove', { address: r.address })}
                      title={t('composer.recipient.remove', { address: r.address })}
                      onClick={() => remove(r.id)}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <input
            ref={inputRef}
            id={inputId}
            className={styles.chipInput}
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-describedby={invalid.length ? errorId : undefined}
            aria-invalid={invalid.length ? true : undefined}
            value={text}
            onChange={onInputChange}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={() => {
              focused.current = false;
              if (textRef.current.trim()) commitText(textRef.current);
              else closeList();
            }}
          />
        </div>
        {trailing}
        <ul
          id={listId}
          role="listbox"
          aria-label={t('composer.recipient.suggestions')}
          className={styles.listbox}
          hidden={!open}
        >
          {open &&
            suggestions.map((c, i) => (
              <li
                key={c.address}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={[styles.option, i === active && styles.optionActive].filter(Boolean).join(' ')}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c);
                }}
                onMouseMove={() => setActive(i)}
              >
                {c.name ? <span className={styles.optionName}>{c.name}</span> : null}
                <span className={styles.optionAddress}>{c.address}</span>
              </li>
            ))}
        </ul>
      </div>
      {invalid.length > 0 && (
        <p id={errorId} className={styles.fieldError}>
          {invalid
            .map((r) => t(`composer.email.${emailProblem(r.address) ?? 'invalid'}`, { address: r.address }))
            .join(' ')}
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
