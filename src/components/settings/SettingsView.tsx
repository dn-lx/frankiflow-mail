'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Mailbox, Settings, Signature, Template } from '@/lib/backend/types';
import { describeError, translate } from '@/lib/i18n';
import { useApp } from '@/components/providers/AppProvider';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Select,
  Skeleton,
  Switch,
  TextField,
  useToast,
} from '@/components/ui';
import { PasswordField } from '@/components/auth/PasswordField';
import { RichEditor } from './RichEditor';
import { escapeHtml, evaluatePasswordStrength, sanitizeEditorHtml } from './sanitize';
import './strings';
import styles from './SettingsView.module.css';

export { evaluatePasswordStrength };

type SectionId =
  | 'appearance'
  | 'reading'
  | 'sending'
  | 'signatures'
  | 'templates'
  | 'account'
  | 'shortcuts';

interface SignatureDraft {
  id: string;
  mailboxId: string;
  html: string;
  isDefault: boolean;
  dirty: boolean;
}

const SECTIONS: { id: SectionId; labelKey: string }[] = [
  { id: 'appearance', labelKey: 'settings.section.appearance' },
  { id: 'reading', labelKey: 'settings.section.reading' },
  { id: 'sending', labelKey: 'settings.section.sending' },
  { id: 'signatures', labelKey: 'settings.section.signatures' },
  { id: 'templates', labelKey: 'settings.section.templates' },
  { id: 'account', labelKey: 'settings.section.account' },
  { id: 'shortcuts', labelKey: 'settings.section.shortcuts' },
];

const SHORTCUTS_LIST: { keys: string[]; labelKey: string }[] = [
  { keys: ['j', 'k'], labelKey: 'settings.shortcuts.nextPrev' },
  { keys: ['Enter'], labelKey: 'settings.shortcuts.open' },
  { keys: ['u'], labelKey: 'settings.shortcuts.back' },
  { keys: ['c'], labelKey: 'settings.shortcuts.compose' },
  { keys: ['/'], labelKey: 'settings.shortcuts.search' },
  { keys: ['e'], labelKey: 'settings.shortcuts.archive' },
  { keys: ['#'], labelKey: 'settings.shortcuts.delete' },
  { keys: ['s'], labelKey: 'settings.shortcuts.star' },
  { keys: ['r'], labelKey: 'settings.shortcuts.reply' },
  { keys: ['a'], labelKey: 'settings.shortcuts.replyAll' },
  { keys: ['f'], labelKey: 'settings.shortcuts.forward' },
  { keys: ['?'], labelKey: 'settings.shortcuts.help' },
  { keys: ['Ctrl/⌘', 'Enter'], labelKey: 'settings.shortcuts.send' },
];

function stripHtmlPreview(html: string): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export function SettingsView() {
  const { backend, session, settings, setSettings, mode, t, lang, refreshSession } = useApp();
  const toast = useToast();
  const router = useRouter();

  const [activeSection, setActiveSection] = useState<SectionId>('appearance');
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Mailboxes & signatures state
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>('');
  const [sigDrafts, setSigDrafts] = useState<Record<string, SignatureDraft>>({});
  const [savingSignature, setSavingSignature] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null); // 'new' or template.id
  const [tplName, setTplName] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplHtml, setTplHtml] = useState('');
  const [tplDirty, setTplDirty] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Unsaved changes leave confirmation dialog
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [pendingExit, setPendingExit] = useState<
    { type: 'href'; href: string } | { type: 'signout' } | null
  >(null);

  const loadAuxData = useCallback(async () => {
    if (!session) {
      setLoadingData(false);
      router.replace('/login/');
      return;
    }
    setLoadingData(true);
    setDataError(null);
    try {
      const [mbs, sigs, tpls] = await Promise.all([
        backend.listMailboxes(),
        backend.listSignatures(),
        backend.listTemplates(),
      ]);
      setMailboxes(mbs);
      setTemplates(tpls);

      const draftsMap: Record<string, SignatureDraft> = {};
      for (const mb of mbs) {
        const ownMatch = sigs.find((s) => s.mailboxId === mb.id);
        const match = ownMatch ?? (mb.isPrimary ? sigs.find((s) => !s.mailboxId) : undefined);
        draftsMap[mb.id] = {
          id: ownMatch?.id ?? '',
          mailboxId: mb.id,
          html:
            match?.html ??
            `<p>${escapeHtml(t('settings.signatures.defaultGreeting'))}<br><strong>${escapeHtml(mb.displayName)}</strong></p>`,
          isDefault: match ? match.isDefault : true,
          dirty: false,
        };
      }
      setSigDrafts(draftsMap);
      setSelectedMailboxId((prev) => (prev && mbs.some((m) => m.id === prev) ? prev : mbs[0]?.id ?? ''));
    } catch {
      setDataError(t('settings.loadError'));
    } finally {
      setLoadingData(false);
    }
  }, [backend, router, session, t]);

  useEffect(() => {
    void loadAuxData();
  }, [loadAuxData]);

  const hasDirtySignature = useMemo(
    () => Object.values(sigDrafts).some((d) => d.dirty),
    [sigDrafts],
  );
  const hasDirtyPassword = newPassword.length > 0 || repeatPassword.length > 0;
  const hasUnsavedChanges = hasDirtySignature || (editingTemplateId !== null && tplDirty) || hasDirtyPassword;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleNavigateClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      setPendingExit({ type: 'href', href });
      setLeaveDialogOpen(true);
    }
  };

  const handleImmediateSetting = async (patch: Partial<Settings>) => {
    const nextLang = patch.language ?? lang;
    try {
      await setSettings(patch);
      toast({ message: translate(nextLang, 'settings.savedToast'), tone: 'success' });
    } catch {
      toast({ message: translate(lang, 'common.error'), tone: 'error' });
    }
  };

  const activeSigDraft = selectedMailboxId ? sigDrafts[selectedMailboxId] : undefined;

  const updateActiveSignature = (patch: Partial<Pick<SignatureDraft, 'html' | 'isDefault'>>) => {
    if (!selectedMailboxId) return;
    setSigDrafts((prev) => {
      const current = prev[selectedMailboxId];
      if (!current) return prev;
      return {
        ...prev,
        [selectedMailboxId]: {
          ...current,
          ...patch,
          dirty: true,
        },
      };
    });
  };

  const handleSaveSignature = async () => {
    if (!activeSigDraft) return;
    setSavingSignature(true);
    try {
      const cleanHtml = sanitizeEditorHtml(activeSigDraft.html);
      const toSave: Signature = {
        id: activeSigDraft.id,
        mailboxId: activeSigDraft.mailboxId,
        html: cleanHtml,
        isDefault: activeSigDraft.isDefault,
      };
      await backend.saveSignature(toSave);
      const freshSigs = await backend.listSignatures();
      const savedMatch = freshSigs.find((s) => s.mailboxId === activeSigDraft.mailboxId);
      setSigDrafts((prev) => ({
        ...prev,
        [activeSigDraft.mailboxId]: {
          id: savedMatch?.id ?? activeSigDraft.id,
          mailboxId: activeSigDraft.mailboxId,
          html: cleanHtml,
          isDefault: activeSigDraft.isDefault,
          dirty: false,
        },
      }));
      toast({ message: t('settings.signatures.savedToast'), tone: 'success' });
    } catch {
      toast({ message: t('common.error'), tone: 'error' });
    } finally {
      setSavingSignature(false);
    }
  };

  const handleStartNewTemplate = () => {
    setEditingTemplateId('new');
    setTplName('');
    setTplSubject('');
    setTplHtml('<p></p>');
    setTplDirty(false);
    setTplError(null);
  };

  const handleStartEditTemplate = (tpl: Template) => {
    setEditingTemplateId(tpl.id);
    setTplName(tpl.name);
    setTplSubject(tpl.subject);
    setTplHtml(tpl.html);
    setTplDirty(false);
    setTplError(null);
  };

  const handleCancelTemplateForm = () => {
    setEditingTemplateId(null);
    setTplDirty(false);
    setTplError(null);
  };

  const handleSaveTemplate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanName = tplName.trim();
    if (!cleanName) {
      setTplError(t('settings.templates.validationError'));
      return;
    }
    setSavingTemplate(true);
    setTplError(null);
    try {
      const cleanHtml = sanitizeEditorHtml(tplHtml);
      const saved = await backend.saveTemplate({
        id: editingTemplateId === 'new' || !editingTemplateId ? '' : editingTemplateId,
        name: cleanName,
        subject: tplSubject.trim(),
        html: cleanHtml,
      });
      setTemplates((prev) => {
        const exists = prev.some((item) => item.id === saved.id);
        return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved];
      });
      setEditingTemplateId(null);
      setTplDirty(false);
      toast({ message: t('settings.templates.savedToast', { name: saved.name }), tone: 'success' });
    } catch {
      toast({ message: t('common.error'), tone: 'error' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleConfirmDeleteTemplate = async () => {
    if (!deleteTarget) return;
    setDeletingTemplate(true);
    try {
      await backend.deleteTemplate(deleteTarget.id);
      setTemplates((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      if (editingTemplateId === deleteTarget.id) {
        setEditingTemplateId(null);
        setTplDirty(false);
      }
      setDeleteTarget(null);
      toast({ message: t('settings.templates.deletedToast'), tone: 'success' });
    } catch {
      toast({ message: t('common.error'), tone: 'error' });
    } finally {
      setDeletingTemplate(false);
    }
  };

  const handleChangePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError(null);
    const minLength = mode === 'live' ? 12 : 8;
    if (newPassword.length < minLength) {
      setPasswordError(
        t(mode === 'live' ? 'settings.account.passwordTooShortLive' : 'settings.account.passwordTooShort'),
      );
      return;
    }
    if (newPassword !== repeatPassword) {
      setPasswordError(t('settings.account.passwordMismatch'));
      return;
    }
    setSavingPassword(true);
    try {
      const res = await backend.changePassword(newPassword);
      if (!res.ok) {
        const msg = res.error ? describeError(lang, res.error) : t('settings.account.passwordErrorGeneric');
        setPasswordError(msg);
        toast({ message: msg, tone: 'error' });
        return;
      }
      setNewPassword('');
      setRepeatPassword('');
      toast({ message: t('settings.account.passwordSavedToast'), tone: 'success' });
    } catch (err: unknown) {
      const msg = describeError(lang, err);
      setPasswordError(msg);
      toast({ message: msg, tone: 'error' });
    } finally {
      setSavingPassword(false);
    }
  };

  const performSignOut = async () => {
    setSigningOut(true);
    try {
      await backend.signOut();
      await refreshSession();
      toast({ message: t('settings.account.signedOutToast'), tone: 'info' });
      router.replace('/login/');
    } catch {
      toast({ message: t('common.error'), tone: 'error' });
    } finally {
      setSigningOut(false);
    }
  };

  const handleSignOutClick = () => {
    if (hasUnsavedChanges) {
      setPendingExit({ type: 'signout' });
      setLeaveDialogOpen(true);
      return;
    }
    void performSignOut();
  };

  if (!session) {
    return null;
  }

  const jumpToSection = (id: SectionId) => {
    setActiveSection(id);
    const el = document.getElementById(`settings-section-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const strength = evaluatePasswordStrength(newPassword);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.topRow}>
            <Link prefetch={false} href="/mail/" className={styles.backLink} onClick={(e) => handleNavigateClick(e, '/mail/')}>
              ← {t('settings.backToMail')}
            </Link>
            {hasUnsavedChanges && (
              <Badge tone="warning">{t('settings.unsavedBadge')}</Badge>
            )}
          </div>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{t('settings.title')}</h1>
            <p className={styles.subtitle}>{t('settings.subtitle')}</p>
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        <nav className={styles.sideNav} aria-label={t('settings.navLabel')}>
          <ul className={styles.navList} role="list">
            {SECTIONS.map((sec) => (
              <li key={sec.id}>
                <button
                  type="button"
                  className={[
                    styles.navBtn,
                    activeSection === sec.id && styles.navBtnActive,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={activeSection === sec.id ? 'true' : undefined}
                  onClick={() => jumpToSection(sec.id)}
                >
                  {t(sec.labelKey)}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className={styles.content}>
          {dataError && (
            <div className={styles.errorBanner} role="alert">
              <span>{dataError}</span>
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void loadAuxData()}>
                {t('common.retry')}
              </Button>
            </div>
          )}

          {/* 1. Appearance */}
          <section
            id="settings-section-appearance"
            className={styles.sectionCard}
            aria-labelledby="heading-appearance"
          >
            <div className={styles.sectionHeader}>
              <h2 id="heading-appearance" className={styles.sectionTitle}>
                {t('settings.section.appearance')}
              </h2>
              <p className={styles.sectionDesc}>{t('settings.appearance.desc')}</p>
            </div>

            <div className={styles.fieldsGrid}>
              <Select
                label={t('settings.appearance.theme')}
                value={settings.theme}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'system' || val === 'light' || val === 'dark') {
                    void handleImmediateSetting({ theme: val });
                  }
                }}
                options={[
                  { value: 'system', label: t('settings.appearance.themeSystem') },
                  { value: 'light', label: t('settings.appearance.themeLight') },
                  { value: 'dark', label: t('settings.appearance.themeDark') },
                ]}
              />

              <Select
                label={t('settings.appearance.density')}
                value={settings.density}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'comfortable' || val === 'compact') {
                    void handleImmediateSetting({ density: val });
                  }
                }}
                options={[
                  { value: 'comfortable', label: t('settings.appearance.densityComfortable') },
                  { value: 'compact', label: t('settings.appearance.densityCompact') },
                ]}
              />

              <Select
                label={t('settings.appearance.readingPane')}
                value={settings.readingPane}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'right' || val === 'bottom' || val === 'off') {
                    void handleImmediateSetting({ readingPane: val });
                  }
                }}
                options={[
                  { value: 'right', label: t('settings.appearance.readingPaneRight') },
                  { value: 'bottom', label: t('settings.appearance.readingPaneBottom') },
                  { value: 'off', label: t('settings.appearance.readingPaneOff') },
                ]}
              />

              <Select
                label={t('settings.appearance.language')}
                value={settings.language}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'de' || val === 'en') {
                    void handleImmediateSetting({ language: val });
                  }
                }}
                options={[
                  { value: 'de', label: t('settings.appearance.langDe') },
                  { value: 'en', label: t('settings.appearance.langEn') },
                ]}
              />
            </div>
          </section>

          {/* 2. Reading */}
          <section
            id="settings-section-reading"
            className={styles.sectionCard}
            aria-labelledby="heading-reading"
          >
            <div className={styles.sectionHeader}>
              <h2 id="heading-reading" className={styles.sectionTitle}>
                {t('settings.section.reading')}
              </h2>
            </div>

            <div className={styles.stackFields}>
              <Switch
                label={t('settings.reading.conversationView')}
                description={t('settings.reading.conversationViewDesc')}
                checked={settings.conversationView}
                onChange={(checked) => void handleImmediateSetting({ conversationView: checked })}
              />

              <Select
                label={t('settings.reading.remoteImages')}
                value={settings.loadRemoteImages}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'ask' || val === 'always') {
                    void handleImmediateSetting({ loadRemoteImages: val });
                  }
                }}
                options={[
                  { value: 'ask', label: t('settings.reading.remoteImagesAsk') },
                  { value: 'always', label: t('settings.reading.remoteImagesAlways') },
                ]}
              />
            </div>
          </section>

          {/* 3. Sending */}
          <section
            id="settings-section-sending"
            className={styles.sectionCard}
            aria-labelledby="heading-sending"
          >
            <div className={styles.sectionHeader}>
              <h2 id="heading-sending" className={styles.sectionTitle}>
                {t('settings.section.sending')}
              </h2>
            </div>

            <Select
              label={t('settings.sending.undoSend')}
              hint={t('settings.sending.undoSendHint')}
              value={String(settings.undoSendSeconds)}
              onChange={(e) => {
                const num = Number(e.target.value);
                if (num === 0 || num === 5 || num === 10) {
                  void handleImmediateSetting({ undoSendSeconds: num });
                }
              }}
              options={[
                { value: '0', label: t('settings.sending.undo0') },
                { value: '5', label: t('settings.sending.undo5') },
                { value: '10', label: t('settings.sending.undo10') },
              ]}
            />
          </section>

          {/* 4. Signatures */}
          <section
            id="settings-section-signatures"
            className={styles.sectionCard}
            aria-labelledby="heading-signatures"
          >
            <div className={styles.sectionHeader}>
              <h2 id="heading-signatures" className={styles.sectionTitle}>
                {t('settings.section.signatures')}
              </h2>
              <p className={styles.sectionDesc}>{t('settings.signatures.desc')}</p>
            </div>

            {loadingData ? (
              <div className={styles.skeletonBlock} aria-busy="true">
                <Skeleton height={38} />
                <Skeleton height={130} />
              </div>
            ) : mailboxes.length === 0 ? (
              <EmptyState
                icon="inbox"
                title={t('settings.signatures.emptyTitle')}
                text={t('settings.signatures.emptyText')}
                headingLevel={3}
              />
            ) : (
              <div className={styles.stackFields}>
                <Select
                  label={t('settings.signatures.mailboxLabel')}
                  value={selectedMailboxId}
                  onChange={(e) => setSelectedMailboxId(e.target.value)}
                  options={mailboxes.map((mb) => ({
                    value: mb.id,
                    label: `${mb.displayName} <${mb.address}>`,
                  }))}
                />

                {activeSigDraft && (
                  <>
                    <RichEditor
                      label={t('settings.signatures.editorLabel')}
                      contextKey={`sig-${activeSigDraft.mailboxId}`}
                      value={activeSigDraft.html}
                      onChange={(html) => updateActiveSignature({ html })}
                      disabled={savingSignature}
                    />

                    <Switch
                      label={t('settings.signatures.defaultToggle')}
                      description={t('settings.signatures.defaultToggleDesc')}
                      checked={activeSigDraft.isDefault}
                      onChange={(checked) => updateActiveSignature({ isDefault: checked })}
                      disabled={savingSignature}
                    />

                    <div className={styles.actionRow}>
                      <Button
                        type="button"
                        variant="primary"
                        loading={savingSignature}
                        onClick={() => void handleSaveSignature()}
                      >
                        {t('settings.signatures.saveBtn')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {/* 5. Templates */}
          <section
            id="settings-section-templates"
            className={styles.sectionCard}
            aria-labelledby="heading-templates"
          >
            <div className={styles.sectionHeaderRow}>
              <div>
                <h2 id="heading-templates" className={styles.sectionTitle}>
                  {t('settings.section.templates')}
                </h2>
                <p className={styles.sectionDesc}>{t('settings.templates.desc')}</p>
              </div>
              {editingTemplateId === null && (
                <Button variant="secondary" icon="plus" onClick={handleStartNewTemplate}>
                  {t('settings.templates.newBtn')}
                </Button>
              )}
            </div>

            {editingTemplateId !== null && (
              <form className={styles.templateForm} onSubmit={handleSaveTemplate} noValidate>
                <h3 className={styles.subHeading}>
                  {t(
                    editingTemplateId === 'new'
                      ? 'settings.templates.formCreateTitle'
                      : 'settings.templates.formEditTitle',
                  )}
                </h3>

                {tplError && (
                  <div className={styles.inlineError} role="alert">
                    {tplError}
                  </div>
                )}

                <div className={styles.fieldsGrid}>
                  <TextField
                    label={t('settings.templates.nameLabel')}
                    placeholder={t('settings.templates.namePlaceholder')}
                    value={tplName}
                    onChange={(e) => {
                      setTplName(e.target.value);
                      setTplDirty(true);
                      if (tplError) setTplError(null);
                    }}
                    required
                    disabled={savingTemplate}
                  />
                  <TextField
                    label={t('settings.templates.subjectLabel')}
                    placeholder={t('settings.templates.subjectPlaceholder')}
                    value={tplSubject}
                    onChange={(e) => {
                      setTplSubject(e.target.value);
                      setTplDirty(true);
                    }}
                    disabled={savingTemplate}
                  />
                </div>

                <RichEditor
                  label={t('settings.templates.bodyLabel')}
                  contextKey={`tpl-${editingTemplateId}`}
                  value={tplHtml}
                  onChange={(html) => {
                    setTplHtml(html);
                    setTplDirty(true);
                  }}
                  disabled={savingTemplate}
                />

                <div className={styles.actionRow}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCancelTemplateForm}
                    disabled={savingTemplate}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" variant="primary" loading={savingTemplate}>
                    {t('settings.templates.saveBtn')}
                  </Button>
                </div>
              </form>
            )}

            {loadingData ? (
              <div className={styles.skeletonBlock} aria-busy="true">
                <Skeleton height={64} />
                <Skeleton height={64} />
              </div>
            ) : templates.length === 0 ? (
              editingTemplateId === null && (
                <EmptyState
                  icon="file"
                  title={t('settings.templates.emptyTitle')}
                  text={t('settings.templates.emptyText')}
                  headingLevel={3}
                  action={
                    <Button variant="primary" icon="plus" onClick={handleStartNewTemplate}>
                      {t('settings.templates.newBtn')}
                    </Button>
                  }
                />
              )
            ) : (
              <ul className={styles.templateList} role="list">
                {templates.map((tpl) => (
                  <li key={tpl.id} className={styles.templateItem}>
                    <div className={styles.templateInfo}>
                      <span className={styles.templateName}>{tpl.name}</span>
                      {tpl.subject && (
                        <span className={styles.templateSubject}>{tpl.subject}</span>
                      )}
                      <p className={styles.templatePreview}>{stripHtmlPreview(tpl.html)}</p>
                    </div>
                    <div className={styles.templateActions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="edit"
                        disabled={editingTemplateId !== null}
                        onClick={() => handleStartEditTemplate(tpl)}
                      >
                        {t('settings.templates.editBtn')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        onClick={() => setDeleteTarget(tpl)}
                      >
                        {t('settings.templates.deleteBtn')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 6. Account */}
          <section
            id="settings-section-account"
            className={styles.sectionCard}
            aria-labelledby="heading-account"
          >
            <div className={styles.sectionHeaderRow}>
              <h2 id="heading-account" className={styles.sectionTitle}>
                {t('settings.section.account')}
              </h2>
              <Button
                variant="secondary"
                icon="logout"
                loading={signingOut}
                onClick={handleSignOutClick}
              >
                {t('auth.signOut')}
              </Button>
            </div>

            <dl className={styles.accountMeta}>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>{t('settings.account.emailLabel')}</dt>
                <dd className={styles.metaValue}>{session?.email ?? '—'}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>{t('settings.account.modeLabel')}</dt>
                <dd className={styles.metaValue}>
                  <Badge tone={mode === 'demo' ? 'accent' : 'success'}>
                    {t(mode === 'demo' ? 'settings.account.modeDemo' : 'settings.account.modeLive')}
                  </Badge>
                </dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>{t('settings.account.roleLabel')}</dt>
                <dd className={styles.metaValue}>
                  <Badge tone="neutral" className={styles.rolePill}>
                    {t(session?.role === 'admin' ? 'settings.account.roleAdmin' : 'settings.account.roleMember')}
                  </Badge>
                </dd>
              </div>
            </dl>

            {mode === 'demo' && (
              <div>
                <Link prefetch={false}
                  href="/demo-admin/"
                  className={styles.demoAdminLink}
                  onClick={(e) => handleNavigateClick(e, '/demo-admin/')}
                >
                  {t('settings.account.demoUsersLink')} →
                </Link>
              </div>
            )}

            <hr className={styles.divider} />

            <form className={styles.passwordForm} onSubmit={handleChangePassword} noValidate>
              <h3 className={styles.subHeading}>{t('settings.account.passwordHeading')}</h3>
              <p className={styles.sectionDesc}>{t('settings.account.passwordMinHint')}</p>

              {passwordError && (
                <div className={styles.inlineError} role="alert">
                  {passwordError}
                </div>
              )}

              <div className={styles.fieldsGrid}>
                <PasswordField
                  label={t('settings.account.newPassword')}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  disabled={savingPassword}
                  showLabel={t('settings.account.showPassword')}
                  hideLabelText={t('settings.account.hidePassword')}
                />

                <PasswordField
                  label={t('settings.account.repeatPassword')}
                  autoComplete="new-password"
                  value={repeatPassword}
                  onChange={(e) => {
                    setRepeatPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  disabled={savingPassword}
                  showLabel={t('settings.account.showPassword')}
                  hideLabelText={t('settings.account.hidePassword')}
                />
              </div>

              {newPassword.length > 0 && (
                <div className={styles.strengthBox} role="status">
                  <div className={styles.strengthMeter} aria-hidden="true">
                    <span
                      className={[
                        styles.strengthBar,
                        styles[`strengthLevel${strength.score}`],
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    />
                  </div>
                  <span className={styles.strengthText}>
                    {t('settings.account.strengthLabel', { level: t(strength.key) })}
                  </span>
                </div>
              )}

              <div className={styles.actionRow}>
                <Button type="submit" variant="primary" loading={savingPassword}>
                  {t('settings.account.passwordSaveBtn')}
                </Button>
              </div>
            </form>
          </section>

          {/* 7. Keyboard shortcuts */}
          <section
            id="settings-section-shortcuts"
            className={styles.sectionCard}
            aria-labelledby="heading-shortcuts"
          >
            <div className={styles.sectionHeader}>
              <h2 id="heading-shortcuts" className={styles.sectionTitle}>
                {t('settings.section.shortcuts')}
              </h2>
              <p className={styles.sectionDesc}>{t('settings.shortcuts.desc')}</p>
            </div>

            <dl className={styles.shortcutList}>
              {SHORTCUTS_LIST.map((item) => (
                <div key={item.labelKey} className={styles.shortcutRow}>
                  <dt className={styles.shortcutDesc}>{t(item.labelKey)}</dt>
                  <dd className={styles.shortcutKeys}>
                    {item.keys.map((k, idx) => (
                      <span key={k} className={styles.kbdGroup}>
                        {idx > 0 && <span className={styles.kbdSep}>+</span>}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </main>
      </div>

      {/* Template delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('settings.templates.deleteConfirmTitle')}
        description={t('settings.templates.deleteConfirmText', { name: deleteTarget?.name ?? '' })}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deletingTemplate}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              className={styles.dangerBtn}
              loading={deletingTemplate}
              onClick={() => void handleConfirmDeleteTemplate()}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      />

      {/* Leave with unsaved changes confirmation dialog */}
      <Dialog
        open={leaveDialogOpen}
        onClose={() => {
          setLeaveDialogOpen(false);
          setPendingExit(null);
        }}
        title={t('settings.leaveConfirmTitle')}
        description={t('settings.leaveConfirmText')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setLeaveDialogOpen(false);
                setPendingExit(null);
              }}
            >
              {t('settings.stay')}
            </Button>
            <Button
              variant="danger"
              className={styles.dangerBtn}
              onClick={() => {
                const exit = pendingExit;
                setLeaveDialogOpen(false);
                setPendingExit(null);
                if (exit?.type === 'signout') {
                  void performSignOut();
                } else {
                  router.push(exit?.href ?? '/mail/');
                }
              }}
            >
              {t('settings.leaveDiscard')}
            </Button>
          </>
        }
      />
    </div>
  );
}
