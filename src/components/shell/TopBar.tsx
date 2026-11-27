'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Button, Icon, IconButton } from '@/components/ui';
import { filterTokens, removeToken, type SearchToken } from '@/lib/mail/search';
import styles from './AppShell.module.css';
import './strings';

const DEBOUNCE_MS = 250;

export interface TopBarProps {
  /** Committed search (from the URL). */
  query: string;
  onSearch: (q: string) => void;
  inputRef: Ref<HTMLInputElement>;
  showMenuButton: boolean;
  menuOpen: boolean;
  onOpenMenu: () => void;
  menuButtonRef: Ref<HTMLButtonElement>;
  onHelp: () => void;
}

export function chipText(tok: SearchToken, t: (key: string) => string): string {
  switch (tok.kind) {
    case 'is':
      return tok.valid ? t(`search.is.${tok.value}`) : `is:${tok.value}`;
    case 'has':
      return t('search.op.has');
    case 'text':
      return tok.value;
    default:
      return `${t(`search.op.${tok.kind}`)}: ${tok.value}`;
  }
}

export function TopBar({ query, onSearch, inputRef, showMenuButton, menuOpen, onOpenMenu, menuButtonRef, onHelp }: TopBarProps) {
  const { t } = useApp();
  const inputId = useId();
  const [text, setText] = useState(query);
  const lastEmitted = useRef(query);
  const timer = useRef<number | undefined>(undefined);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  // Sync when the URL changes from elsewhere (chip removal, back button, folder switch).
  useEffect(() => {
    if (query !== lastEmitted.current) {
      lastEmitted.current = query;
      window.clearTimeout(timer.current);
      setText(query);
    }
  }, [query]);

  const emit = (value: string) => {
    window.clearTimeout(timer.current);
    const v = value.trim();
    if (v === lastEmitted.current) return;
    lastEmitted.current = v;
    onSearchRef.current(v);
  };

  // Debounced search while typing.
  useEffect(() => {
    if (text.trim() === lastEmitted.current) return;
    timer.current = window.setTimeout(() => emit(text), DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [text]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    emit(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (text) {
        setText('');
        emit('');
      } else {
        e.currentTarget.blur();
      }
    }
  };

  const chips = filterTokens(query);

  return (
    <header className={styles.topBar}>
      {showMenuButton && (
        <IconButton
          ref={menuButtonRef}
          icon="menu"
          label={t('shell.openMenu')}
          aria-expanded={menuOpen}
          aria-controls="mail-sidebar"
          onClick={onOpenMenu}
        />
      )}
      <div className={styles.searchArea}>
        <form role="search" className={styles.searchForm} onSubmit={onSubmit}>
          <label htmlFor={inputId} className="sr-only">
            {t('search.label')}
          </label>
          <Icon name="search" size={18} className={styles.searchIcon} />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            className={styles.searchInput}
            placeholder={t('search.placeholder')}
            title={t('search.hint')}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {text && (
            <IconButton
              icon="x"
              size="sm"
              label={t('search.clear')}
              className={styles.searchClear}
              onClick={() => {
                setText('');
                emit('');
              }}
            />
          )}
        </form>
        {chips.length > 0 && (
          <ul role="list" className={styles.chips} aria-label={t('search.filters')}>
            {chips.map(({ index, token }) => {
              const label = chipText(token, t);
              return (
                <li key={`${index}-${token.kind}-${token.value}`}>
                  <span className={[styles.chip, !token.valid && styles.chipInvalid].filter(Boolean).join(' ')} title={token.valid ? undefined : t('search.invalid')}>
                    {!token.valid && <Icon name="alert" size={14} label={t('search.invalid')} />}
                    <span className={styles.chipText}>{label}</span>
                    <button
                      type="button"
                      className={styles.chipRemove}
                      aria-label={t('search.removeFilter', { filter: label })}
                      title={t('search.removeFilter', { filter: label })}
                      onClick={() => {
                        const next = removeToken(query, index);
                        lastEmitted.current = next;
                        setText(next);
                        onSearchRef.current(next);
                      }}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className={styles.helpButton}
        aria-label={t('help.open')}
        title={`${t('help.open')} (?)`}
        aria-keyshortcuts="?"
        onClick={onHelp}
      >
        <span aria-hidden="true">?</span>
      </Button>
    </header>
  );
}
