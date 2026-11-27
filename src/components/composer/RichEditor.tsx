'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Icon, type IconName } from '../ui/Icon';
import { TextField } from '../ui/TextField';
import { cleanPastedHtml, escapeHtml, normalizeLink, signatureInner, textToHtml } from './html';
import styles from './Composer.module.css';

export interface RichEditorHandle {
  getHtml(): string;
  /** Replaces the content of the signature block (if any). */
  setSignature(signatureHtml: string | undefined): void;
  /** Inserts HTML at the last caret position (or at the top). */
  insertHtml(html: string): void;
  /** Focuses the editor with the caret in the user's own text, above signature and quote. */
  focusStart(): void;
}

export interface RichEditorProps {
  initialHtml: string;
  label: string;
  /** Shown in the empty first paragraph above the signature. */
  placeholder: string;
  onInput: () => void;
  /** Image files pasted that are too big to inline, or other pasted files. */
  onFiles: (files: File[]) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  handleRef?: Ref<RichEditorHandle>;
}

type Command = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList';

interface ToolButton {
  id: string;
  icon?: IconName;
  labelKey: string;
  shortcut?: string;
  command?: Command;
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const INLINE_IMAGE_LIMIT = 1.5 * 1024 * 1024;

const TOOLS: ToolButton[] = [
  { id: 'bold', icon: 'bold', labelKey: 'composer.tool.bold', shortcut: 'B', command: 'bold' },
  { id: 'italic', icon: 'italic', labelKey: 'composer.tool.italic', shortcut: 'I', command: 'italic' },
  { id: 'underline', icon: 'underline', labelKey: 'composer.tool.underline', shortcut: 'U', command: 'underline' },
  { id: 'ul', icon: 'list', labelKey: 'composer.tool.bulleted', command: 'insertUnorderedList' },
  { id: 'ol', icon: 'list-ordered', labelKey: 'composer.tool.numbered', command: 'insertOrderedList' },
  { id: 'link', icon: 'link', labelKey: 'composer.tool.link', shortcut: 'K' },
  { id: 'quote', icon: 'quote', labelKey: 'composer.tool.quote' },
  { id: 'clear', labelKey: 'composer.tool.clear' },
];

type ActiveState = Record<string, boolean>;

/** Blocks that are not the user's own text: signature, quote header and quoted original. */
const MARKER_SELECTOR = '[data-ff-signature],[data-ff-quote-header],[data-ff-quote]';
/** Attribute that carries the placeholder text; never saved (DOMPurify drops unknown data-* attributes). */
const PLACEHOLDER_ATTR = 'data-ff-placeholder';

/** Top-level nodes before the first signature / quote block: where the user writes. */
function ownNodes(root: HTMLElement): Node[] {
  const out: Node[] = [];
  for (const child of Array.from(root.childNodes)) {
    if (child instanceof Element && child.matches(MARKER_SELECTOR)) break;
    out.push(child);
  }
  return out;
}

function isBlank(node: Node): boolean {
  if ((node.textContent ?? '').trim()) return false;
  return !(node instanceof Element && node.querySelector('img,li,hr,table'));
}

/** True when `node` sits in the user's own text area of `root`. */
function inOwnArea(root: HTMLElement, node: Node | null): boolean {
  if (!node || node === root || !root.contains(node)) return false;
  let n: Node = node;
  while (n.parentNode && n.parentNode !== root) n = n.parentNode;
  return ownNodes(root).includes(n);
}

/** Inline SVG for "clear formatting" (a T with a slash); decorative, the button has a label. */
function ClearFormatIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 5h12M11 5l-3 14M4 4l16 16" />
    </svg>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(file);
  });
}

export function RichEditor({ initialHtml, label, placeholder, onInput, onFiles, t, handleRef }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  const [active, setActive] = useState<ActiveState>({});
  const [focused, setFocused] = useState(false);
  /** Focus that comes from our own code (toolbar commands), not from the user entering the body. */
  const programmaticFocus = useRef(false);
  /** A pointer press started while the editor was not focused yet. */
  const pointerEntry = useRef(false);
  const pointerDown = useRef(false);
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;
  const [focusIndex, setFocusIndex] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkNeedsText, setLinkNeedsText] = useState(false);
  const linkAnchor = useRef<HTMLAnchorElement | null>(null);
  const pendingLink = useRef<null | { kind: 'apply'; url: string; text: string } | { kind: 'remove' }>(null);
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const mod = isMac() ? '⌘' : 'Strg+';

  /**
   * Makes sure there is an own-text block above signature / quote (creates an empty
   * paragraph when needed) and shows the placeholder on it while it is empty.
   */
  const syncOwnArea = useCallback((create = false): Node[] => {
    const el = editorRef.current;
    if (!el) return [];
    let own = ownNodes(el).filter((n) => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? '').trim() !== '');
    if (!own.length) {
      // Only add a paragraph when asked (open / focus), never while the user is editing.
      if (!create) return own;
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      el.insertBefore(p, el.firstChild);
      own = [p];
    }
    const empty = own.every(isBlank);
    const first = own[0];
    el.querySelectorAll(`[${PLACEHOLDER_ATTR}]`).forEach((n) => {
      if (!empty || n !== first) n.removeAttribute(PLACEHOLDER_ATTR);
    });
    if (empty && first instanceof HTMLElement) first.setAttribute(PLACEHOLDER_ATTR, placeholderRef.current);
    return own;
  }, []);

  /** Puts the caret at the end of the user's own text (start of the empty first paragraph). */
  const placeCaretInOwnArea = useCallback(() => {
    const el = editorRef.current;
    const sel = typeof document !== 'undefined' ? document.getSelection() : null;
    if (!el || !sel) return;
    const own = syncOwnArea(true);
    // Empty: the first paragraph (where the placeholder is); otherwise after the last own text.
    const target = own.every(isBlank) ? own[0] : own[own.length - 1];
    if (!target) return;
    const r = document.createRange();
    if (target.nodeType === Node.TEXT_NODE) {
      r.setStart(target, (target.textContent ?? '').length);
    } else if (target.nodeName === 'BR') {
      r.setStartBefore(target);
    } else if (target.nodeName === 'HR' || target.nodeName === 'IMG') {
      r.setStartAfter(target);
    } else if (isBlank(target)) {
      r.setStart(target, 0);
    } else {
      r.selectNodeContents(target);
      r.collapse(false);
    }
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    lastRange.current = r.cloneRange();
  }, [syncOwnArea]);

  const selectionInOwnArea = (): boolean => {
    const el = editorRef.current;
    const sel = document.getSelection();
    return !!el && !!sel && sel.rangeCount > 0 && inOwnArea(el, sel.anchorNode);
  };

  // Initial content only; afterwards the DOM is the source of truth.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = initialHtml || '<p><br></p>';
    syncOwnArea(true);
  }, []);

  // Language switch: update the placeholder text in place.
  useEffect(() => {
    syncOwnArea();
  }, [placeholder, syncOwnArea]);

  const insideEditor = (node: Node | null) => !!node && !!editorRef.current && editorRef.current.contains(node);

  const updateActive = useCallback(() => {
    if (typeof document === 'undefined') return;
    const sel = document.getSelection();
    if (!sel || !insideEditor(sel.anchorNode)) return;
    const next: ActiveState = {};
    for (const tool of TOOLS) {
      if (!tool.command) continue;
      try {
        next[tool.id] = document.queryCommandState(tool.command);
      } catch {
        next[tool.id] = false;
      }
    }
    let n: Node | null = sel.anchorNode;
    while (n && n !== editorRef.current) {
      if (n instanceof HTMLElement && n.tagName === 'BLOCKQUOTE') next.quote = true;
      if (n instanceof HTMLElement && n.tagName === 'A') next.link = true;
      n = n.parentNode;
    }
    setActive((prev) => {
      const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      for (const k of keys) if (!!prev[k] !== !!next[k]) return next;
      return prev;
    });
  }, []);

  useEffect(() => {
    const onSelection = () => {
      const sel = document.getSelection();
      if (sel && sel.rangeCount && insideEditor(sel.anchorNode)) {
        lastRange.current = sel.getRangeAt(0).cloneRange();
        updateActive();
      }
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [updateActive]);

  const focusProgrammatically = (el: HTMLElement) => {
    programmaticFocus.current = true;
    try {
      el.focus({ preventScroll: true });
    } finally {
      programmaticFocus.current = false;
    }
  };

  const restoreSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement !== el) focusProgrammatically(el);
    const sel = document.getSelection();
    if (!sel) return;
    const range = lastRange.current;
    if (range && insideEditor(range.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (!sel.rangeCount || !insideEditor(sel.anchorNode)) {
      const r = document.createRange();
      r.setStart(el, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const changed = () => {
    syncOwnArea();
    onInputRef.current();
    updateActive();
  };

  const exec = (command: string, value?: string) => {
    restoreSelection();
    try {
      document.execCommand('styleWithCSS', false, 'false');
    } catch {
      /* not supported */
    }
    document.execCommand(command, false, value);
    changed();
  };

  const insertHtml = (html: string) => {
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    changed();
  };

  useImperativeHandle(
    handleRef,
    () => ({
      // The placeholder attribute is display-only; keep it out of saved HTML.
      getHtml: () => (editorRef.current?.innerHTML ?? '').replace(/\sdata-ff-placeholder="[^"]*"/g, ''),
      setSignature: (signatureHtml) => {
        const block = editorRef.current?.querySelector('[data-ff-signature]');
        if (block) block.innerHTML = signatureInner(signatureHtml);
        syncOwnArea();
      },
      insertHtml,
      focusStart: () => {
        const el = editorRef.current;
        if (!el) return;
        focusProgrammatically(el);
        placeCaretInOwnArea();
        const sel = document.getSelection();
        const node = sel && sel.rangeCount ? sel.anchorNode : null;
        const block = node instanceof Element ? node : node?.parentElement;
        block?.scrollIntoView?.({ block: 'nearest' });
      },
    }),
    [],
  );

  const enclosingAnchor = (): HTMLAnchorElement | null => {
    const range = lastRange.current;
    let n: Node | null = range ? range.startContainer : null;
    while (n && n !== editorRef.current) {
      if (n instanceof HTMLAnchorElement) return n;
      n = n.parentNode;
    }
    return null;
  };

  const openLinkDialog = () => {
    const anchor = enclosingAnchor();
    linkAnchor.current = anchor;
    const range = lastRange.current;
    const selected = range && insideEditor(range.startContainer) ? range.toString() : '';
    setLinkEditing(!!anchor);
    setLinkUrl(anchor ? anchor.getAttribute('href') ?? '' : '');
    setLinkText(anchor ? anchor.textContent ?? '' : selected);
    setLinkNeedsText(!anchor && !selected.trim());
    setLinkError('');
    setLinkOpen(true);
  };

  const submitLink = () => {
    const url = normalizeLink(linkUrl);
    if (!url) {
      setLinkError(t('composer.link.invalid'));
      return;
    }
    pendingLink.current = { kind: 'apply', url, text: linkText.trim() };
    setLinkOpen(false);
  };

  // Apply after the modal is closed (the editor is inert while it is open).
  useEffect(() => {
    if (linkOpen) return;
    const pending = pendingLink.current;
    if (!pending) return;
    pendingLink.current = null;
    const anchor = linkAnchor.current;
    linkAnchor.current = null;
    if (pending.kind === 'remove') {
      if (anchor && anchor.isConnected) {
        const parent = anchor.parentNode;
        while (anchor.firstChild) parent?.insertBefore(anchor.firstChild, anchor);
        anchor.remove();
        changed();
      }
      return;
    }
    if (anchor && anchor.isConnected) {
      anchor.setAttribute('href', pending.url);
      if (pending.text && pending.text !== anchor.textContent) anchor.textContent = pending.text;
      changed();
      return;
    }
    const range = lastRange.current;
    const hasSelection = !!range && !range.collapsed && insideEditor(range.startContainer);
    if (hasSelection) {
      exec('createLink', pending.url);
    } else {
      const text = pending.text || pending.url.replace(/^mailto:/, '');
      insertHtml(`<a href="${escapeHtml(pending.url)}">${escapeHtml(text)}</a>&nbsp;`);
    }
  }, [linkOpen]);

  const toggleQuote = () => {
    restoreSelection();
    const inQuote = !!active.quote;
    document.execCommand('formatBlock', false, inQuote ? '<p>' : '<blockquote>');
    changed();
  };

  const clearFormatting = () => {
    exec('removeFormat');
  };

  const runTool = (tool: ToolButton) => {
    if (tool.command) exec(tool.command);
    else if (tool.id === 'link') openLinkDialog();
    else if (tool.id === 'quote') toggleQuote();
    else if (tool.id === 'clear') clearFormatting();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const modKey = e.ctrlKey || e.metaKey;
    if (!modKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i' || k === 'u') {
      e.preventDefault();
      exec(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
    } else if (k === 'k') {
      e.preventDefault();
      e.stopPropagation();
      const sel = document.getSelection();
      if (sel && sel.rangeCount) lastRange.current = sel.getRangeAt(0).cloneRange();
      openLinkDialog();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const dt = e.clipboardData;
    const html = dt.getData('text/html');
    const text = dt.getData('text/plain');
    const files = Array.from(dt.files ?? []);
    if (!html && !text && files.length) {
      e.preventDefault();
      const small = files.filter((f) => f.type.startsWith('image/') && f.size <= INLINE_IMAGE_LIMIT && /png|jpe?g|gif|webp/i.test(f.type));
      const rest = files.filter((f) => !small.includes(f));
      if (rest.length) onFiles(rest);
      const sel = document.getSelection();
      if (sel && sel.rangeCount) lastRange.current = sel.getRangeAt(0).cloneRange();
      void Promise.all(small.map(readFileAsDataUrl)).then((urls) => {
        const imgs = urls
          .filter((u) => u.startsWith('data:image/'))
          .map((u) => `<img src="${escapeHtml(u)}" alt="">`)
          .join('');
        if (imgs) insertHtml(cleanPastedHtml(imgs));
      }).catch(() => undefined);
      return;
    }
    e.preventDefault();
    // Rich HTML that is stripped to nothing falls back to the plain text.
    const clean = (html ? cleanPastedHtml(html) : '') || textToHtml(text);
    if (!clean) return;
    document.execCommand('insertHTML', false, clean);
    changed();
  };

  const onToolbarKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = TOOLS.length;
    let next = -1;
    if (e.key === 'ArrowRight') next = (focusIndex + 1) % n;
    else if (e.key === 'ArrowLeft') next = (focusIndex - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    setFocusIndex(next);
    toolbarRef.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };

  return (
    <div className={styles.editorWrap}>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={t('composer.toolbar')}
        className={[styles.toolbar, focused && styles.toolbarFocused].filter(Boolean).join(' ')}
        onKeyDown={onToolbarKeyDown}
      >
        {TOOLS.map((tool, i) => {
          const name = t(tool.labelKey);
          const tip = tool.shortcut ? `${name} (${mod}${tool.shortcut})` : name;
          const pressable = tool.command || tool.id === 'quote';
          return (
            <button
              key={tool.id}
              type="button"
              className={styles.toolButton}
              tabIndex={i === focusIndex ? 0 : -1}
              aria-label={name}
              title={tip}
              aria-pressed={pressable ? !!active[tool.id] : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onFocus={() => setFocusIndex(i)}
              onClick={() => runTool(tool)}
            >
              {tool.icon ? <Icon name={tool.icon} size={18} /> : <ClearFormatIcon />}
            </button>
          );
        })}
      </div>
      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-placeholder={placeholder}
        spellCheck
        onInput={changed}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onPointerDown={() => {
          pointerDown.current = true;
          pointerEntry.current = document.activeElement !== editorRef.current;
        }}
        onClick={(e) => {
          const entering = pointerEntry.current;
          pointerEntry.current = false;
          pointerDown.current = false;
          const sel = document.getSelection();
          if (sel && sel.rangeCount && !sel.isCollapsed) return; // the user selected text
          // Clicking the empty area below the content, or entering the body by clicking
          // signature / quote: start in the user's own text instead.
          if (e.target === e.currentTarget || (entering && !selectionInOwnArea())) placeCaretInOwnArea();
        }}
        onFocus={() => {
          setFocused(true);
          if (programmaticFocus.current || pointerDown.current) return;
          // Keyboard focus (Tab): the browser may restore an old caret; move it to the own text.
          window.requestAnimationFrame(() => {
            if (document.activeElement !== editorRef.current) return;
            const sel = document.getSelection();
            if (sel && sel.rangeCount && !sel.isCollapsed) return; // keep a deliberate selection
            if (!selectionInOwnArea()) placeCaretInOwnArea();
          });
        }}
        onBlur={() => {
          setFocused(false);
          pointerDown.current = false;
          const sel = document.getSelection();
          if (sel && sel.rangeCount && insideEditor(sel.anchorNode)) lastRange.current = sel.getRangeAt(0).cloneRange();
        }}
      />
      <Dialog
        open={linkOpen}
        onClose={() => {
          pendingLink.current = null;
          setLinkOpen(false);
        }}
        title={linkEditing ? t('composer.link.editTitle') : t('composer.link.title')}
        closeLabel={t('common.close')}
        size="sm"
        footer={
          <>
            {linkEditing && (
              <Button
                variant="ghost"
                onClick={() => {
                  pendingLink.current = { kind: 'remove' };
                  setLinkOpen(false);
                }}
              >
                {t('composer.link.remove')}
              </Button>
            )}
            <Button
              onClick={() => {
                pendingLink.current = null;
                setLinkOpen(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={submitLink}>
              {t('composer.link.apply')}
            </Button>
          </>
        }
      >
        <form
          className={styles.dialogForm}
          onSubmit={(e) => {
            e.preventDefault();
            submitLink();
          }}
        >
          <TextField
            label={t('composer.link.url')}
            value={linkUrl}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              setLinkError('');
            }}
            placeholder="https://"
            inputMode="url"
            autoFocus
            error={linkError || undefined}
          />
          {(linkNeedsText || linkEditing) && (
            <TextField label={t('composer.link.text')} value={linkText} onChange={(e) => setLinkText(e.target.value)} />
          )}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Dialog>
    </div>
  );
}
