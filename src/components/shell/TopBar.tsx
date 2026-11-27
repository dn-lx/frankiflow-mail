'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Button, DemoBadge, Icon, IconButton } from '@/components/ui';
import {
  chipQuery,
  combineQuery,
  filterTokens,
  freeText,
  isChipToken,
  removeToken,
  tokenizeSearch,
  type SearchToken,
} from '@/lib/mail/search';
import styles from './AppShell.module.css';
import './strings';

const DEBOUNCE_MS = 250;

export interface TopBarProps {
  /** Committed search (from the URL). */
  query: string;
  onSearch: (q: string) => void;
  inputRef: Ref<HTMLInputElement>;
  /** Hamburger for the drawer (tablet; phones use the bottom bar). */
  showMenuButton: boolean;
  menuOpen: boolean;
  onOpenMenu: () => void;
  menuButtonRef: Ref<HTMLButtonElement>;
  onHelp: () => void;
  /** Compose button in the bar (tablet, where the sidebar is a drawer). */
  onCompose?: () => void;
  /** Phone layout: short placeholder. */
  compact: boolean;
  /** Hide the demo badge (the open drawer shows its own). */
  hideDemo: boolean;
}

export function chipText(tok: SearchToken, t: (key: string) => string): string {
  switch (tok.kind) {
    case 'is':
      return tok.valid ? t(`search.is.${tok.value}`) : `is:${tok.value}`;
    case 'has':
      return tok.valid ? t('search.op.has') : `has:${tok.value}`;
    case 'text':
      return tok.value;
    default:
      return `${t(`search.op.${tok.kind}`)}: ${tok.value}`;
  }
}

export function TopBar({
  query,
  onSearch,
  inputRef,
  showMenuButton,
  menuOpen,
  onOpenMenu,
  menuButtonRef,
  onHelp,
  onCompose,
  compact,
  hideDemo,
}: TopBarProps) {
  const { mode, t } = useApp();
  const inputId = useId();
  // The input shows only free text; recognised operators are chips (part of `query`).
  const [text, setText] = useState(() => freeText(query));
  const lastEmitted = useRef(query);
  /** Chip part the typed text is combined with (set whenever the input is re-synced). */
  const baseChips = useRef(chipQuery(query));
  const timer = useRef<number | undefined>(undefined);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  /** Input text and query of the last re-sync: unchanged text maps back to exactly that query (no reorder, no reload). */
  const synced = useRef({ text: freeText(query), query });

  const resync = (q: string) => {
    baseChips.current = chipQuery(q);
    const next = freeText(q);
    synced.current = { text: next, query: q };
    setText(next);
  };

  const queryFor = (value: string) =>
    value === synced.current.text ? synced.current.query : combineQuery(baseChips.current, value.trim());

  // Sync when the URL changes from elsewhere (chip removal, back button, folder switch).
  useEffect(() => {
    if (query !== lastEmitted.current) {
      lastEmitted.current = query;
      window.clearTimeout(timer.current);
      resync(query);
    }
  }, [query]);

  const commit = (q: string) => {
    window.clearTimeout(timer.current);
    if (q === lastEmitted.current) return;
    lastEmitted.current = q;
    onSearchRef.current(q);
  };

  // Debounced search while typing (the input keeps what was typed until Enter).
  useEffect(() => {
    const q = queryFor(text);
    if (q === lastEmitted.current) return;
    timer.current = window.setTimeout(() => commit(q), DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [text]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = queryFor(text);
    commit(q);
    // Typed operators become chips.
    resync(q);
  };

  const clearAll = () => {
    commit('');
    resync('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (text || query) clearAll();
      else e.currentTarget.blur();
    }
  };

  const chips = filterTokens(query).filter((c) => isChipToken(c.token));

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
            placeholder={compact ? t('search.placeholderShort') : t('search.placeholder')}
            title={t('search.hint')}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Operators typed but not yet submitted turn into chips when leaving the field.
              if (!tokenizeSearch(text).some(isChipToken)) return;
              const q = queryFor(text);
              commit(q);
              resync(q);
            }}
          />
          {(text || query) && (
            <IconButton icon="x" size="sm" label={t('search.clear')} className={styles.searchClear} onClick={clearAll} />
          )}
        </form>
      </div>
      <div className={styles.topActions}>
        {mode === 'demo' && !hideDemo && <DemoBadge className={styles.topBarDemo} />}
        {onCompose && (
          <Button variant="primary" icon="edit" className={styles.topCompose} onClick={onCompose} aria-keyshortcuts="c">
            {t('shell.compose')}
          </Button>
        )}
        <Button
          variant="ghost"
          className={styles.helpButton}
          aria-label={t('help.open')}
          title={t('help.tooltip')}
          aria-keyshortcuts="?"
          onClick={onHelp}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
            aria-hidden="true"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M7 16h10" />
          </svg>
        </Button>
      </div>
      {chips.length > 0 && (
        <ul role="list" className={styles.chips} aria-label={t('search.filters')}>
          {chips.map(({ index, token }) => {
            const label = chipText(token, t);
            return (
              <li key={`${index}-${token.kind}-${token.value}`}>
                <span className={styles.chip}>
                  <span className={styles.chipText}>{label}</span>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={t('search.removeFilter', { filter: label })}
                    title={t('search.removeFilter', { filter: label })}
                    onClick={() => {
                      const next = removeToken(query, index);
                      commit(next);
                      resync(next);
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
    </header>
  );
}
