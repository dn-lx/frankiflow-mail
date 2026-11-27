'use client';

import { useEffect, useId, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { useApp } from '@/components/providers/AppProvider';
import { Button, IconButton } from '@/components/ui';
import './strings';
import styles from './SettingsView.module.css';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'span',
  'div',
];

const ALLOWED_ATTR = ['href', 'target', 'rel'];

const SAFE_LINK_RE = /^(https?:\/\/|mailto:)[^\s]+$/i;

/**
 * Sanitizes signature or template HTML with DOMPurify and ensures safe links.
 */
export function sanitizeEditorHtml(rawHtml: string): string {
  if (typeof window === 'undefined') {
    return rawHtml;
  }
  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  doc.querySelectorAll('a').forEach((anchor) => {
    const href = (anchor.getAttribute('href') ?? '').trim();
    if (!SAFE_LINK_RE.test(href)) {
      anchor.removeAttribute('href');
    } else {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return doc.body.innerHTML;
}

/**
 * Replaces the children of an element with sanitized DOM nodes without using dangerouslySetInnerHTML.
 */
function populateEditorDom(el: HTMLDivElement, html: string): void {
  const clean = sanitizeEditorHtml(html);
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  const nodes = Array.from(doc.body.childNodes);
  el.replaceChildren(...nodes);
}

export interface RichEditorProps {
  label: string;
  /** Key signifying which item is loaded (e.g. mailboxId or templateId). When this key changes, the DOM is reset to `value`. */
  contextKey: string;
  value: string;
  onChange: (nextHtml: string) => void;
  disabled?: boolean;
}

export function RichEditor({
  label,
  contextKey,
  value,
  onChange,
  disabled = false,
}: RichEditorProps) {
  const { t } = useApp();
  const labelId = useId();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const loadedContextRef = useRef<string>('');
  const lastEmittedRef = useRef<string>(value);
  const savedRangeRef = useRef<Range | null>(null);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkError, setLinkError] = useState<string | null>(null);

  // Sync initial value or when contextKey changes (e.g. switching mailbox or template)
  // without resetting the DOM while the user is typing.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (loadedContextRef.current !== contextKey || (value !== lastEmittedRef.current && document.activeElement !== el)) {
      populateEditorDom(el, value);
      loadedContextRef.current = contextKey;
      lastEmittedRef.current = value;
    }
  }, [contextKey, value]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    const sanitized = sanitizeEditorHtml(el.innerHTML);
    lastEmittedRef.current = sanitized;
    onChange(sanitized);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const applyFormat = (cmd: 'bold' | 'italic') => {
    const el = editorRef.current;
    if (!el || disabled) return;
    el.focus();
    restoreSelection();
    try {
      document.execCommand(cmd, false);
    } catch {
      /* fallback if execCommand is unsupported */
    }
    saveSelection();
    emitChange();
  };

  const handleOpenLinkBar = () => {
    saveSelection();
    setLinkError(null);
    setLinkUrl('https://');
    setLinkOpen((prev) => !prev);
  };

  const handleInsertLink = () => {
    const trimmed = linkUrl.trim();
    if (!SAFE_LINK_RE.test(trimmed)) {
      setLinkError(t('settings.editor.linkInvalid'));
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    restoreSelection();

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const anchor = document.createElement('a');
      anchor.href = trimmed;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      if (range.collapsed) {
        anchor.textContent = trimmed;
        range.insertNode(anchor);
      } else {
        const contents = range.extractContents();
        anchor.appendChild(contents);
        range.insertNode(anchor);
      }
    } else {
      const anchor = document.createElement('a');
      anchor.href = trimmed;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = trimmed;
      el.appendChild(anchor);
    }

    setLinkOpen(false);
    setLinkError(null);
    emitChange();
  };

  return (
    <div className={styles.editorWrapper}>
      <span id={labelId} className={styles.editorLabel}>
        {label}
      </span>

      <div className={styles.editorBox}>
        <div className={styles.editorToolbar} role="toolbar" aria-label={label}>
          <IconButton
            icon="bold"
            label={t('settings.editor.bold')}
            size="sm"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            onClick={() => applyFormat('bold')}
          />
          <IconButton
            icon="italic"
            label={t('settings.editor.italic')}
            size="sm"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            onClick={() => applyFormat('italic')}
          />
          <IconButton
            icon="link"
            label={t('settings.editor.link')}
            size="sm"
            pressed={linkOpen}
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            onClick={handleOpenLinkBar}
          />
        </div>

        {linkOpen && (
          <div className={styles.linkBar}>
            <input
              type="url"
              className={styles.linkInput}
              aria-label={t('settings.editor.linkUrlLabel')}
              placeholder={t('settings.editor.linkUrlPlaceholder')}
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                if (linkError) setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleInsertLink();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setLinkOpen(false);
                }
              }}
            />
            <Button type="button" variant="primary" size="sm" onClick={handleInsertLink}>
              {t('settings.editor.linkInsert')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLinkOpen(false)}>
              {t('common.cancel')}
            </Button>
            {linkError && (
              <span className={styles.linkError} role="alert">
                {linkError}
              </span>
            )}
          </div>
        )}

        <div
          ref={editorRef}
          className={styles.editorSurface}
          contentEditable={!disabled}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelId}
          suppressContentEditableWarning
          onInput={emitChange}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={() => {
            saveSelection();
            emitChange();
          }}
        />
      </div>
    </div>
  );
}
