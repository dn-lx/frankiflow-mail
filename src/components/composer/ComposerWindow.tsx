'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { Mailbox, Message, OutgoingAttachment, AttachmentMeta, Signature, Template } from '@/lib/backend/types';
import { formatFullDate } from '@/lib/i18n';
import { isValidEmail } from '@/lib/mail/addresses';
import { useApp } from '../providers/AppProvider';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Menu, type MenuItem } from '../ui/Menu';
import { Select } from '../ui/Select';
import { Skeleton } from '../ui/Skeleton';
import { TextField } from '../ui/TextField';
import { useToast } from '../ui/Toast';
import { cleanComposeHtml, cleanHtml, htmlKit, htmlToText, ownText } from './html';
import { RecipientInput, type RecipientInputHandle } from './RecipientInput';
import { RichEditor, type RichEditorHandle } from './RichEditor';
import { buildSnapshot, loadDraftMessage, pickSignature, sendableMailboxes } from './snapshot';
import type { ComposeAttachment, ComposerSnapshot, Recipient, SendRequest, WindowEntry, WindowView } from './types';
import styles from './Composer.module.css';
import './strings';

export interface Resources {
  status: 'idle' | 'loading' | 'ready' | 'error';
  mailboxes: Mailbox[];
  signatures: Signature[];
  templates: Template[];
}

export interface ComposerWindowProps {
  entry: WindowEntry;
  resources: Resources;
  phone: boolean;
  onReloadResources: () => void;
  onView: (key: string, view: WindowView) => void;
  onClosed: (key: string) => void;
  onQueueSend: (key: string, request: SendRequest) => void;
  onDirty: (key: string, dirty: boolean) => void;
  onDraftId: (key: string, id: string) => void;
  onOpenDraft: (id: string) => void;
}

/** Limits from docs/v2/live-contract.md section 5 (lower than the 20 MB product limit). */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
export const MAX_FILES = 14;
const AUTOSAVE_MS = 3000;
const ATTACHMENT_WORDS = /anhang|angehängt|attached|attachment/i;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

let attachmentCounter = 0;

export function formatSize(bytes: number, lang: 'de' | 'en'): string {
  const loc = lang === 'de' ? 'de-DE' : 'en-GB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

function nextAt(days: number, hour: number, from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function nextMonday(from = new Date()): Date {
  const day = from.getDay(); // 0 Sun .. 6 Sat
  const add = ((8 - day) % 7) || 7;
  return nextAt(add, 8, from);
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isDialogTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('dialog');
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

interface FrameProps {
  title: string;
  view: WindowView;
  phone: boolean;
  closing?: boolean;
  onToggleMinimize: () => void;
  onToggleExpand: () => void;
  onClose: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  onDragOver?: (e: DragEvent<HTMLElement>) => void;
  onDragLeave?: (e: DragEvent<HTMLElement>) => void;
  onDrop?: (e: DragEvent<HTMLElement>) => void;
  children: ReactNode;
}

function Frame({
  title,
  view,
  phone,
  closing,
  onToggleMinimize,
  onToggleExpand,
  onClose,
  onKeyDown,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: FrameProps) {
  const { t } = useApp();
  const titleId = useId();
  const minimized = view === 'minimized';
  const expanded = view === 'expanded' && !phone;
  const cls = [
    styles.window,
    minimized && styles.windowMinimized,
    expanded && styles.windowExpanded,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section
      className={cls}
      role="dialog"
      aria-modal={false}
      aria-labelledby={titleId}
      data-composer-window=""
      onKeyDown={(e) => {
        onKeyDown?.(e);
        // Keep the shell's single-key shortcuts away from the composer.
        e.stopPropagation();
      }}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className={styles.titleBar}>
        <h2 id={titleId} className={styles.title}>
          <button
            type="button"
            className={styles.titleButton}
            onClick={onToggleMinimize}
            aria-expanded={!minimized}
            title={minimized ? t('composer.restore') : t('composer.minimize')}
          >
            {title}
          </button>
        </h2>
        <div className={styles.titleActions}>
          {/* Full screen (phones, tablets): minimising has no visible place to go, so it is only offered to restore. */}
          {(!phone || minimized) && (
            <IconButton
              icon="chevron-down"
              size="sm"
              className={[styles.headerButton, minimized && styles.flip].filter(Boolean).join(' ')}
              label={minimized ? t('composer.restore') : t('composer.minimize')}
              onClick={onToggleMinimize}
            />
          )}
          {!phone && (
            <IconButton
              icon={expanded ? 'minimize' : 'maximize'}
              size="sm"
              className={styles.headerButton}
              label={expanded ? t('composer.collapse') : t('composer.expand')}
              onClick={onToggleExpand}
            />
          )}
          <IconButton
            icon="x"
            size="sm"
            className={styles.headerButton}
            label={t('composer.closeSave')}
            loading={closing}
            onClick={onClose}
          />
        </div>
      </header>
      <div className={[styles.body, minimized && styles.bodyHidden].filter(Boolean).join(' ')}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Window: loads what it needs, then renders the form                  */
/* ------------------------------------------------------------------ */

export function ComposerWindow(props: ComposerWindowProps) {
  const { entry, resources, phone, onReloadResources, onView, onClosed } = props;
  const { backend, t, lang } = useApp();
  const needsDraft = !entry.snapshot && entry.init.mode === 'draft' && !entry.init.message && !!entry.init.draftId;
  const [draftMessage, setDraftMessage] = useState<Message | undefined>(entry.init.message);
  const [draftState, setDraftState] = useState<'idle' | 'loading' | 'error'>(needsDraft ? 'loading' : 'idle');
  const [snapshot, setSnapshot] = useState<ComposerSnapshot | null>(entry.snapshot ?? null);
  const [noMailbox, setNoMailbox] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!needsDraft || !entry.init.draftId) return;
    let cancelled = false;
    setDraftState('loading');
    loadDraftMessage(backend, entry.init.draftId)
      .then((m) => {
        if (cancelled) return;
        setDraftMessage(m);
        setDraftState('idle');
      })
      .catch(() => {
        if (!cancelled) setDraftState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [backend, needsDraft, entry.init.draftId, attempt]);

  useEffect(() => {
    if (snapshot || resources.status !== 'ready' || draftState !== 'idle') return;
    if (needsDraft && !draftMessage) return;
    const built = buildSnapshot(entry.init, draftMessage, resources.mailboxes, resources.signatures, lang, t, {
      html: htmlKit(),
      formatDate: (iso) => formatFullDate(iso, lang),
    });
    if (built) setSnapshot(built);
    else setNoMailbox(true);
  }, [snapshot, resources, draftState, needsDraft, draftMessage, entry.init, lang, t]);

  if (snapshot) return <ComposerForm {...props} initial={snapshot} />;

  const toggleMinimize = () => onView(entry.key, entry.view === 'minimized' ? 'docked' : 'minimized');
  const toggleExpand = () => onView(entry.key, entry.view === 'expanded' ? 'docked' : 'expanded');
  const failed = resources.status === 'error' || draftState === 'error';

  return (
    <Frame
      title={t('composer.newMessage')}
      view={entry.view}
      phone={phone}
      onToggleMinimize={toggleMinimize}
      onToggleExpand={toggleExpand}
      onClose={() => onClosed(entry.key)}
    >
      {noMailbox ? (
        <div className={styles.stateBox}>
          <Icon name="alert" size={24} />
          <p>{t('composer.noMailbox')}</p>
        </div>
      ) : failed ? (
        <div className={styles.stateBox} role="alert">
          <Icon name="alert" size={24} />
          <p>{draftState === 'error' ? t('composer.draftLoadError') : t('composer.loadError')}</p>
          <Button
            icon="refresh"
            onClick={() => {
              if (resources.status === 'error') onReloadResources();
              if (draftState === 'error') setAttempt((a) => a + 1);
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <div className={styles.skeletonBox} aria-busy="true" aria-label={t('common.loading')}>
          <Skeleton height={20} width="100%" />
          <Skeleton height={20} width="100%" />
          <Skeleton height={20} width="60%" />
          <Skeleton height={140} width="100%" />
        </div>
      )}
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

type ConfirmState =
  | null
  | { kind: 'discard' }
  | { kind: 'closeUnsaved' }
  | { kind: 'warn'; warnings: string[]; scheduledAt?: string };

function ComposerForm({
  entry,
  resources,
  phone,
  initial,
  onView,
  onClosed,
  onQueueSend,
  onDirty,
  onDraftId,
  onOpenDraft,
}: ComposerWindowProps & { initial: ComposerSnapshot }) {
  const { backend, t, lang, online, mode } = useApp();
  const toast = useToast();
  const key = entry.key;

  const [mailboxId, setMailboxId] = useState(initial.mailboxId);
  const [to, setTo] = useState<Recipient[]>(initial.to);
  const [cc, setCc] = useState<Recipient[]>(initial.cc);
  const [bcc, setBcc] = useState<Recipient[]>(initial.bcc);
  const [showCc, setShowCc] = useState(initial.showCc || initial.cc.length > 0);
  const [showBcc, setShowBcc] = useState(initial.showBcc || initial.bcc.length > 0);
  const [subject, setSubject] = useState(initial.subject);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>(initial.attachments);
  const [status, setStatus] = useState<SaveStatus>(initial.draftId && !initial.dirty ? 'saved' : 'idle');
  const [attachError, setAttachError] = useState('');
  const [sendError, setSendError] = useState(entry.error ?? '');
  /** Send was blocked by invalid recipients; the inline message stays until they are fixed. */
  const [invalidBlocked, setInvalidBlocked] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [dragging, setDragging] = useState(false);

  const editor = useRef<RichEditorHandle>(null);
  const toHandle = useRef<RecipientInputHandle>(null);
  const ccHandle = useRef<RecipientInputHandle>(null);
  const bccHandle = useRef<RecipientInputHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const subjectId = useId();
  const fromId = useId();

  const draftIdRef = useRef<string | undefined>(initial.draftId);
  const inReplyTo = useRef<string | undefined>(initial.inReplyToMessageId);
  const lastHtml = useRef(initial.html);
  const versionRef = useRef(initial.dirty ? 1 : 0);
  const savedVersion = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | null>(null);
  const closedRef = useRef(false);
  const sendingRef = useRef(false);
  const reportedDirty = useRef(false);

  const state = { mailboxId, to, cc, bcc, showCc, showBcc, subject, attachments };
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Updates the latest-values ref synchronously, before the next render (save and send read it). */
  const patchState = (patch: Partial<typeof state>) => {
    stateRef.current = { ...stateRef.current, ...patch };
  };

  const sendable = sendableMailboxes(resources.mailboxes);
  const offlineLive = !online && mode === 'live';

  /* ----- saving ----- */

  const setDirty = useCallback(
    (dirty: boolean) => {
      if (reportedDirty.current === dirty) return;
      reportedDirty.current = dirty;
      onDirty(key, dirty);
    },
    [key, onDirty],
  );

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const buildDraft = (overrides?: Partial<typeof state>) => {
    const s = { ...stateRef.current, ...overrides };
    const rawHtml = editor.current ? editor.current.getHtml() : lastHtml.current;
    lastHtml.current = rawHtml;
    const html = cleanComposeHtml(rawHtml);
    const files: (OutgoingAttachment | AttachmentMeta)[] = s.attachments.map((a) =>
      a.meta ? a.meta : { filename: a.filename, contentType: a.contentType, size: a.size, data: a.data as Blob },
    );
    return {
      html,
      draft: {
        id: draftIdRef.current,
        mailboxId: s.mailboxId,
        to: s.to.map((r) => r.address),
        cc: s.cc.map((r) => r.address),
        bcc: s.bcc.map((r) => r.address),
        subject: s.subject.trim(),
        html,
        text: htmlToText(html),
        inReplyToMessageId: inReplyTo.current,
        attachments: files,
      },
    };
  };

  const doSave = async (): Promise<boolean> => {
    const version = versionRef.current;
    setStatus('saving');
    try {
      const { draft } = buildDraft();
      const { id } = await backend.saveDraft(draft);
      if (draftIdRef.current !== id) {
        draftIdRef.current = id;
        onDraftId(key, id);
      }
      savedVersion.current = Math.max(savedVersion.current, version);
      if (versionRef.current === savedVersion.current) {
        setStatus('saved');
        setDirty(false);
      } else {
        setStatus('idle');
      }
      return true;
    } catch {
      setStatus('error');
      return false;
    }
  };

  /** Saves if there are unsaved changes. Never runs two saves at once for this draft. */
  const runSave = async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current;
    if (closedRef.current && !sendingRef.current) return true;
    if (versionRef.current === savedVersion.current) return true;
    if (inFlight.current) return runSaveRef.current();
    const p = doSave();
    inFlight.current = p;
    try {
      return await p;
    } finally {
      if (inFlight.current === p) inFlight.current = null;
    }
  };
  const runSaveRef = useRef(runSave);
  runSaveRef.current = runSave;

  const markChanged = () => {
    versionRef.current += 1;
    setDirty(true);
    setStatus((s) => (s === 'saving' ? s : 'idle'));
    clearTimer();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void runSaveRef.current();
    }, AUTOSAVE_MS);
  };

  // Restored content that was never saved counts as a change.
  useEffect(() => {
    if (initial.dirty) {
      setDirty(true);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        void runSaveRef.current();
      }, AUTOSAVE_MS);
    }
    return () => {
      clearTimer();
      // Navigating away: keep the work (best effort; the window is gone).
      if (!closedRef.current && versionRef.current !== savedVersion.current) void runSaveRef.current();
    };
  }, []);

  // Minimising saves.
  useEffect(() => {
    if (entry.view === 'minimized' && versionRef.current !== savedVersion.current) {
      clearTimer();
      void runSaveRef.current();
    }
  }, [entry.view]);

  /* ----- focus ----- */

  useEffect(() => {
    if (entry.view === 'minimized') return;
    const id = window.requestAnimationFrame(() => {
      if (!stateRef.current.to.length) toHandle.current?.focus();
      else editor.current?.focusStart();
    });
    return () => window.cancelAnimationFrame(id);
  }, [entry.focusToken]);

  /* ----- field changes ----- */

  const changeTo = (next: Recipient[]) => {
    patchState({ to: next });
    setTo(next);
    markChanged();
  };
  const changeCc = (next: Recipient[]) => {
    patchState({ cc: next });
    setCc(next);
    markChanged();
  };
  const changeBcc = (next: Recipient[]) => {
    patchState({ bcc: next });
    setBcc(next);
    markChanged();
  };
  const changeSubject = (next: string) => {
    patchState({ subject: next });
    setSubject(next);
    markChanged();
  };

  const changeFrom = (id: string) => {
    if (id === stateRef.current.mailboxId) return;
    patchState({ mailboxId: id });
    setMailboxId(id);
    editor.current?.setSignature(pickSignature(resources.signatures, id)?.html);
    if (editor.current) lastHtml.current = editor.current.getHtml();
    markChanged();
  };

  const onEditorInput = () => {
    // Keep the latest body HTML in sync: during unmount the editor ref is already
    // detached, and buildDraft() then falls back to lastHtml.
    lastHtml.current = editor.current?.getHtml() ?? lastHtml.current;
    markChanged();
  };

  const insertTemplate = (tpl: Template) => {
    if (!stateRef.current.subject.trim() && tpl.subject) setSubject(tpl.subject);
    const html = cleanHtml(tpl.html, { allowRemoteImages: true });
    if (html) editor.current?.insertHtml(html);
    markChanged();
  };

  /* ----- attachments ----- */

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    const current = stateRef.current.attachments;
    let total = current.reduce((sum, a) => sum + a.size, 0);
    let count = current.length;
    const accepted: ComposeAttachment[] = [];
    const errors: string[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        errors.push(t('composer.attach.fileTooBig', { name: f.name, max: formatSize(MAX_FILE_BYTES, lang) }));
      } else if (count >= MAX_FILES) {
        errors.push(t('composer.attach.tooMany', { name: f.name, max: MAX_FILES }));
      } else if (total + f.size > MAX_TOTAL_BYTES) {
        errors.push(t('composer.attach.totalTooBig', { name: f.name, max: formatSize(MAX_TOTAL_BYTES, lang) }));
      } else {
        attachmentCounter += 1;
        accepted.push({
          id: `att-${attachmentCounter}`,
          filename: f.name || 'file',
          contentType: f.type || 'application/octet-stream',
          size: f.size,
          data: f,
        });
        total += f.size;
        count += 1;
      }
    }
    setAttachError(errors.join(' '));
    if (accepted.length) {
      const next = [...current, ...accepted];
      stateRef.current = { ...stateRef.current, attachments: next };
      setAttachments(next);
      markChanged();
    }
  };

  const removeAttachment = (id: string) => {
    const next = stateRef.current.attachments.filter((a) => a.id !== id);
    stateRef.current = { ...stateRef.current, attachments: next };
    setAttachments(next);
    setAttachError('');
    markChanged();
  };

  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragging) setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !e.currentTarget.contains(next)) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  /* ----- close / discard ----- */

  const close = async () => {
    if (closing) return;
    clearTimer();
    if (versionRef.current !== savedVersion.current || inFlight.current) {
      setClosing(true);
      const ok = await runSaveRef.current();
      setClosing(false);
      if (!ok) {
        setConfirm({ kind: 'closeUnsaved' });
        return;
      }
      const id = draftIdRef.current;
      toast({
        message: t('composer.draftSaved'),
        tone: 'success',
        ...(id ? { actionLabel: t('composer.open'), onAction: () => onOpenDraft(id) } : {}),
      });
    }
    closedRef.current = true;
    setDirty(false);
    onClosed(key);
  };

  const closeWithoutSaving = () => {
    setConfirm(null);
    closedRef.current = true;
    clearTimer();
    setDirty(false);
    onClosed(key);
  };

  const discard = async () => {
    setDiscarding(true);
    clearTimer();
    closedRef.current = true;
    if (inFlight.current) await inFlight.current;
    const id = draftIdRef.current;
    if (id) {
      try {
        await backend.deleteDraft(id);
      } catch {
        closedRef.current = false;
        setDiscarding(false);
        setConfirm(null);
        toast({ message: t('composer.discardFailed'), tone: 'error' });
        return;
      }
    }
    setDiscarding(false);
    setConfirm(null);
    setDirty(false);
    onClosed(key);
    toast({ message: t('composer.discarded') });
  };

  /* ----- send ----- */

  const commitRecipients = () => ({
    to: toHandle.current?.commit() ?? stateRef.current.to,
    cc: ccHandle.current?.commit() ?? stateRef.current.cc,
    bcc: bccHandle.current?.commit() ?? stateRef.current.bcc,
  });

  const startSend = async (scheduledAt?: string, skipWarnings = false) => {
    if (sendingRef.current || closedRef.current) return;
    if (offlineLive) {
      setSendError(t('composer.send.offline'));
      return;
    }
    const lists = commitRecipients();
    if (!lists.to.length) {
      setSendError(t('composer.validate.noRecipient'));
      toHandle.current?.focus();
      return;
    }
    const invalid = [...lists.to, ...lists.cc, ...lists.bcc].filter((r) => !isValidEmail(r.address));
    if (invalid.length) {
      // Shown inline above the footer for as long as invalid chips remain.
      setSendError('');
      setInvalidBlocked(true);
      return;
    }
    setInvalidBlocked(false);
    if (!skipWarnings) {
      const warnings: string[] = [];
      if (!stateRef.current.subject.trim()) warnings.push(t('composer.warn.noSubject'));
      const html = editor.current?.getHtml() ?? lastHtml.current;
      if (!stateRef.current.attachments.length && ATTACHMENT_WORDS.test(ownText(html))) {
        warnings.push(t('composer.warn.noAttachment'));
      }
      if (warnings.length) {
        setConfirm({ kind: 'warn', warnings, scheduledAt });
        return;
      }
    }
    sendingRef.current = true;
    setSending(true);
    setSendError('');
    clearTimer();
    // Store the latest content first, so nothing is lost if the tab closes during the undo delay.
    stateRef.current = { ...stateRef.current, ...lists };
    if (versionRef.current !== savedVersion.current || inFlight.current) await runSaveRef.current();
    const { draft, html } = buildDraft(lists);
    const s = stateRef.current;
    const snapshot: ComposerSnapshot = {
      draftId: draftIdRef.current,
      mailboxId: s.mailboxId,
      to: lists.to,
      cc: lists.cc,
      bcc: lists.bcc,
      showCc: s.showCc || lists.cc.length > 0,
      showBcc: s.showBcc || lists.bcc.length > 0,
      subject: s.subject,
      html,
      attachments: s.attachments,
      inReplyToMessageId: inReplyTo.current,
      dirty: versionRef.current !== savedVersion.current,
    };
    closedRef.current = true;
    setDirty(false);
    onQueueSend(key, { snapshot, draft: { ...draft, id: draftIdRef.current, ...(scheduledAt ? { scheduledAt } : {}) } });
  };

  const scheduleItems: MenuItem[] = [
    {
      id: 'tomorrow',
      label: t('composer.schedule.tomorrow'),
      icon: 'clock',
      onSelect: () => void startSend(nextAt(1, 8).toISOString()),
    },
    {
      id: 'monday',
      label: t('composer.schedule.monday'),
      icon: 'clock',
      onSelect: () => void startSend(nextMonday().toISOString()),
    },
    { id: 'sep', separator: true },
    {
      id: 'custom',
      label: t('composer.schedule.custom'),
      icon: 'edit',
      onSelect: () => {
        setScheduleValue(toLocalInput(nextAt(1, 8)));
        setScheduleError('');
        setScheduleOpen(true);
      },
    },
  ];

  const submitSchedule = () => {
    const d = new Date(scheduleValue);
    if (!scheduleValue || Number.isNaN(d.getTime())) {
      setScheduleError(t('composer.schedule.invalid'));
      return;
    }
    if (d.getTime() < Date.now() + 2 * 60 * 1000) {
      setScheduleError(t('composer.schedule.tooSoon'));
      return;
    }
    setScheduleOpen(false);
    void startSend(d.toISOString());
  };

  const templateItems: MenuItem[] = resources.templates.length
    ? resources.templates.map((tpl) => ({ id: tpl.id, label: tpl.name, onSelect: () => insertTemplate(tpl) }))
    : [{ id: 'none', label: t('composer.templates.none'), onSelect: () => undefined, disabled: true }];

  const moreItems: MenuItem[] = [
    ...scheduleItems.map((item): MenuItem =>
      'separator' in item
        ? { id: `schedule-${item.id}`, separator: true }
        : {
            ...item,
            id: `schedule-${item.id}`,
            label: t('composer.more.scheduleItem', { when: item.label }),
            disabled: item.disabled || sending || offlineLive,
          },
    ),
    { id: 'more-sep', separator: true },
    ...templateItems.map((item): MenuItem =>
      'separator' in item
        ? item
        : {
            ...item,
            id: `template-${item.id}`,
            icon: 'file',
            label: item.disabled ? item.label : t('composer.more.templateItem', { name: item.label }),
          },
    ),
  ];

  const invalidList = invalidBlocked ? [...to, ...cc, ...bcc].filter((r) => !isValidEmail(r.address)) : [];

  /* ----- keyboard ----- */

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (isDialogTarget(e.target)) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void startSend();
    } else if (e.key === 'Escape' && entry.view === 'expanded') {
      e.preventDefault();
      onView(key, 'docked');
    }
  };

  /* ----- render ----- */

  const title = subject.trim() || t('composer.newMessage');
  const sendDisabled = sending || offlineLive;

  let statusNode: ReactNode = null;
  if (status === 'saving') statusNode = t('composer.status.saving');
  else if (status === 'saved') statusNode = t('composer.status.saved');
  else if (status === 'error')
    statusNode = (
      <button type="button" className={styles.statusRetry} onClick={() => void runSaveRef.current()}>
        <Icon name="alert" size={14} />
        {t('composer.status.error')}
      </button>
    );

  const ccLinks = (
    <span className={styles.ccLinks}>
      {!showCc && (
        <button
          type="button"
          className={styles.linkButton}
          aria-label={t('composer.addCc')}
          onClick={() => {
            patchState({ showCc: true });
            setShowCc(true);
            window.requestAnimationFrame(() => ccHandle.current?.focus());
          }}
        >
          Cc
        </button>
      )}
      {!showBcc && (
        <button
          type="button"
          className={styles.linkButton}
          aria-label={t('composer.addBcc')}
          onClick={() => {
            patchState({ showBcc: true });
            setShowBcc(true);
            window.requestAnimationFrame(() => bccHandle.current?.focus());
          }}
        >
          Bcc
        </button>
      )}
    </span>
  );

  return (
    <Frame
      title={title}
      view={entry.view}
      phone={phone}
      closing={closing}
      onToggleMinimize={() => onView(key, entry.view === 'minimized' ? 'docked' : 'minimized')}
      onToggleExpand={() => onView(key, entry.view === 'expanded' ? 'docked' : 'expanded')}
      onClose={() => void close()}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {offlineLive && (
        <div className={styles.notice} role="status">
          <Icon name="alert" size={16} />
          <span>{t('composer.offline')}</span>
        </div>
      )}
      <div className={styles.scroll}>
        <div className={styles.fields}>
          <div className={styles.fieldRow}>
            <label htmlFor={fromId} className={styles.fieldLabel}>
              {t('composer.from')}
            </label>
            <div className={styles.fromWrap}>
              <Select
                id={fromId}
                label={t('composer.from')}
                hideLabel
                value={mailboxId}
                onChange={(e) => changeFrom(e.target.value)}
                options={sendable.map((m) => ({
                  value: m.id,
                  label: m.displayName ? `${m.displayName} <${m.address}>` : m.address,
                }))}
              />
            </div>
          </div>
          <RecipientInput
            label={t('composer.to')}
            value={to}
            onChange={changeTo}
            backend={backend}
            t={t}
            handleRef={toHandle}
            trailing={showCc && showBcc ? undefined : ccLinks}
          />
          {showCc && (
            <RecipientInput label="Cc" value={cc} onChange={changeCc} backend={backend} t={t} handleRef={ccHandle} />
          )}
          {showBcc && (
            <RecipientInput label="Bcc" value={bcc} onChange={changeBcc} backend={backend} t={t} handleRef={bccHandle} />
          )}
          <div className={styles.fieldRow}>
            <label htmlFor={subjectId} className={styles.fieldLabel}>
              {t('composer.subject')}
            </label>
            <input
              id={subjectId}
              className={styles.subjectInput}
              type="text"
              placeholder={t('composer.subjectPlaceholder')}
              value={subject}
              maxLength={998}
              onChange={(e) => changeSubject(e.target.value)}
            />
          </div>
        </div>

        <RichEditor
          handleRef={editor}
          initialHtml={initial.html}
          label={t('composer.body')}
          placeholder={t('composer.bodyPlaceholder')}
          onInput={onEditorInput}
          onFiles={addFiles}
          t={t}
        />

        {attachments.length > 0 && (
          <ul role="list" className={styles.attachments} aria-label={t('composer.attach.list')}>
            {attachments.map((a) => (
              <li key={a.id} className={styles.attachment}>
                <Icon name="paperclip" size={16} />
                <span className={styles.attachmentName} title={a.filename}>
                  {a.filename}
                </span>
                <span className={styles.attachmentSize}>{formatSize(a.size, lang)}</span>
                <IconButton
                  icon="x"
                  size="sm"
                  label={t('composer.attach.remove', { name: a.filename })}
                  onClick={() => removeAttachment(a.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {attachError && (
          <p className={styles.attachError} role="alert">
            {attachError}
          </p>
        )}
      </div>

      {invalidList.length > 0 && (
        <div className={[styles.alert, styles.footerAlert].join(' ')} role="alert">
          <Icon name="alert" size={16} />
          <span className={styles.alertText}>
            {t('composer.validate.invalid', { list: invalidList.map((r) => r.address).join(', ') })}
          </span>
        </div>
      )}
      {sendError && (
        <div className={[styles.alert, styles.footerAlert].join(' ')} role="alert">
          <Icon name="alert" size={16} />
          <span className={styles.alertText}>{sendError}</span>
          <IconButton icon="x" size="sm" label={t('common.close')} onClick={() => setSendError('')} />
        </div>
      )}
      <footer className={styles.footer}>
        <div className={styles.sendGroup}>
          <Button
            variant="primary"
            icon="send"
            loading={sending}
            disabled={sendDisabled}
            title={t('composer.sendHint')}
            onClick={() => void startSend()}
          >
            {t('composer.send')}
          </Button>
          <Menu
            className={styles.wideOnly}
            label={t('composer.schedule')}
            icon="clock"
            items={scheduleItems}
            placement="top"
            align="start"
            disabled={sendDisabled}
          />
        </div>
        <IconButton icon="paperclip" label={t('composer.attach.add')} onClick={() => fileInput.current?.click()} />
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <Menu
          className={styles.wideOnly}
          label={t('composer.templates')}
          icon="file"
          items={templateItems}
          placement="top"
          align="start"
        />
        {/* Narrow widths: schedule and templates move into one overflow menu so the bar stays on one row. */}
        <Menu className={styles.narrowOnly} label={t('composer.more')} items={moreItems} placement="top" align="start" />
        <span className={styles.status} role="status" aria-live="polite">
          {statusNode}
        </span>
        <IconButton icon="trash" label={t('composer.discard')} onClick={() => setConfirm({ kind: 'discard' })} />
      </footer>

      {dragging && (
        <div className={styles.dropOverlay} aria-hidden="true">
          <Icon name="paperclip" size={28} />
          <span>{t('composer.attach.drop')}</span>
        </div>
      )}

      <Dialog
        open={confirm?.kind === 'discard'}
        onClose={() => setConfirm(null)}
        title={t('composer.discardTitle')}
        description={t('composer.discardText')}
        closeLabel={t('common.close')}
        size="sm"
        footer={
          <div className={styles.dialogActions}>
            <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={discarding} onClick={() => void discard()}>
              {t('composer.discardConfirm')}
            </Button>
          </div>
        }
      />
      <Dialog
        open={confirm?.kind === 'closeUnsaved'}
        onClose={() => setConfirm(null)}
        title={t('composer.unsavedTitle')}
        description={t('composer.unsavedText')}
        closeLabel={t('common.close')}
        size="sm"
        footer={
          <div className={styles.dialogActions}>
            <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={closeWithoutSaving}>
              {t('composer.closeWithoutSaving')}
            </Button>
          </div>
        }
      />
      <Dialog
        open={confirm?.kind === 'warn'}
        onClose={() => setConfirm(null)}
        title={t('composer.warnTitle')}
        closeLabel={t('common.close')}
        footer={
          // Desktop: side by side, right aligned (primary on the right).
          // Phones: full width, stacked, primary first (see .dialogActions).
          <div className={styles.dialogActions}>
            <Button onClick={() => setConfirm(null)}>{t('composer.warnBack')}</Button>
            <Button
              variant="primary"
              icon="send"
              onClick={() => {
                const scheduledAt = confirm?.kind === 'warn' ? confirm.scheduledAt : undefined;
                setConfirm(null);
                void startSend(scheduledAt, true);
              }}
            >
              {t('composer.warnSend')}
            </Button>
          </div>
        }
      >
        {confirm?.kind === 'warn' && (
          <ul className={styles.warnList}>
            {confirm.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </Dialog>
      <Dialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title={t('composer.schedule.customTitle')}
        closeLabel={t('common.close')}
        size="sm"
        footer={
          <div className={styles.dialogActions}>
            <Button onClick={() => setScheduleOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" icon="clock" onClick={submitSchedule}>
              {t('composer.schedule.confirm')}
            </Button>
          </div>
        }
      >
        <form
          className={styles.dialogForm}
          onSubmit={(e) => {
            e.preventDefault();
            submitSchedule();
          }}
        >
          <TextField
            type="datetime-local"
            label={t('composer.schedule.when')}
            value={scheduleValue}
            min={toLocalInput(new Date())}
            onChange={(e) => {
              setScheduleValue(e.target.value);
              setScheduleError('');
            }}
            error={scheduleError || undefined}
            hint={
              scheduleValue && !Number.isNaN(new Date(scheduleValue).getTime())
                ? formatFullDate(new Date(scheduleValue).toISOString(), lang)
                : undefined
            }
          />
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Dialog>
    </Frame>
  );
}
