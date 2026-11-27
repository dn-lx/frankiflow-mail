'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setMode } from '@/lib/backend';
import type { DemoUser } from '@/lib/backend/types';
import { useApp } from '@/components/providers/AppProvider';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  DemoBadge,
  Dialog,
  EmptyState,
  Select,
  Skeleton,
  TextField,
  useToast,
} from '@/components/ui';
import { mapAuthError } from './LoginView';
import { PasswordField } from './PasswordField';
import './strings';
import styles from './DemoAdminView.module.css';

const SEED_MAILBOX_ADDRESSES = ['info@frankiflow.de', 'team@frankiflow.de'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DemoAdminView() {
  const { backend, mode, session, t, lang, setSettings, refreshSession, online } = useApp();
  const toast = useToast();
  const router = useRouter();

  const [users, setUsers] = useState<DemoUser[]>([]);
  const [loading, setLoading] = useState(mode === 'demo');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Store passwords entered in this session so "Sign in as" does not ask again for a user just created.
  const recentPasswordsRef = useRef<Map<string, string>>(new Map());

  // Create user form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [selectedMailboxes, setSelectedMailboxes] = useState<string[]>(['info@frankiflow.de']);
  const [newPersonalMailbox, setNewPersonalMailbox] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Sign-in-as dialog state
  const [signInTarget, setSignInTarget] = useState<DemoUser | null>(null);
  const [signInPassword, setSignInPassword] = useState('');
  const [signingInEmail, setSigningInEmail] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Reset confirmation dialog
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadUsers = useCallback(async () => {
    if (mode !== 'demo') return;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await backend.listDemoUsers();
      setUsers(list);
    } catch {
      setLoadError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [backend, mode, t]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const availableMailboxes = useMemo(() => {
    const set = new Set<string>(SEED_MAILBOX_ADDRESSES);
    for (const u of users) {
      for (const addr of u.mailboxAddresses) {
        if (addr) set.add(addr.toLowerCase());
      }
    }
    return Array.from(set);
  }, [users]);

  const toggleMailbox = (addr: string, checked: boolean) => {
    setSelectedMailboxes((prev) => {
      if (checked) return prev.includes(addr) ? prev : [...prev, addr];
      return prev.filter((item) => item !== addr);
    });
  };

  const performSignInAs = async (targetEmail: string, pwd: string): Promise<boolean> => {
    setSigningInEmail(targetEmail);
    setSignInError(null);
    try {
      const res = await backend.signIn(targetEmail, pwd);
      if (!res.ok) {
        setSignInError(mapAuthError(res.error, online, t));
        return false;
      }
      recentPasswordsRef.current.set(targetEmail.toLowerCase(), pwd);
      await refreshSession();
      toast({ message: t('demoAdmin.signedInToast', { email: targetEmail }), tone: 'success' });
      router.push('/mail/');
      return true;
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : String(err);
      setSignInError(mapAuthError(code, online, t));
      return false;
    } finally {
      setSigningInEmail(null);
    }
  };

  const handleSignInAsClick = async (u: DemoUser) => {
    const remembered = recentPasswordsRef.current.get(u.email.toLowerCase());
    if (remembered) {
      const ok = await performSignInAs(u.email, remembered);
      if (ok) return;
    } else {
      setSignInError(null);
    }
    setSignInTarget(u);
    setSignInPassword('');
  };

  const handleConfirmSignInDialog = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!signInTarget) return;
    if (!signInPassword) {
      setSignInError(t('auth.error.required'));
      return;
    }
    const ok = await performSignInAs(signInTarget.email, signInPassword);
    if (ok) {
      setSignInTarget(null);
      setSignInPassword('');
    }
  };

  const handleCreateUser = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const mailboxSet = new Set<string>(selectedMailboxes.map((m) => m.trim().toLowerCase()).filter(Boolean));
    if (newPersonalMailbox && cleanEmail) {
      mailboxSet.add(cleanEmail);
    }
    const mailboxAddresses = Array.from(mailboxSet);

    if (
      !cleanName ||
      !EMAIL_RE.test(cleanEmail) ||
      password.length < 8 ||
      mailboxAddresses.length === 0
    ) {
      setCreateError(t('demoAdmin.errorInvalidUser'));
      return;
    }

    setCreating(true);
    try {
      await backend.createDemoUser({
        name: cleanName,
        email: cleanEmail,
        password,
        role,
        mailboxAddresses,
      });
      recentPasswordsRef.current.set(cleanEmail, password);
      setName('');
      setEmail('');
      setPassword('');
      setRole('member');
      toast({ message: t('demoAdmin.createdToast', { email: cleanEmail }), tone: 'success' });
      try {
        const updated = await backend.listDemoUsers();
        setUsers(updated);
      } catch {
        setLoadError(t('common.error'));
      }
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : String(err);
      if (code === 'demo:user-exists') {
        setCreateError(t('demoAdmin.errorUserExists'));
      } else {
        setCreateError(t('common.error'));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleResetDemo = async () => {
    setResetting(true);
    try {
      await backend.resetDemo();
      recentPasswordsRef.current.clear();
      setResetOpen(false);
      toast({ message: t('demoAdmin.resetDoneToast'), tone: 'success' });
      try {
        await refreshSession();
        const freshUsers = await backend.listDemoUsers();
        setUsers(freshUsers);
      } catch {
        setLoadError(t('common.error'));
      }
    } catch {
      toast({ message: t('common.error'), tone: 'error' });
    } finally {
      setResetting(false);
    }
  };

  const backHref = session ? '/mail/' : '/login/';
  const backLabel = t(session ? 'demoAdmin.backToMail' : 'demoAdmin.backToLogin');

  if (mode !== 'demo') {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.liveCard} aria-labelledby="demo-live-only-title">
            <Badge tone="warning">Live</Badge>
            <h1 id="demo-live-only-title" className={styles.title}>
              {t('demoAdmin.liveOnlyTitle')}
            </h1>
            <p className={styles.subtitle}>{t('demoAdmin.liveOnlyText')}</p>
            <div className={styles.liveActions}>
              <Link prefetch={false} href={backHref} className={styles.backLink}>
                {backLabel}
              </Link>
              <Button variant="secondary" onClick={() => setMode('demo')}>
                {t('demoAdmin.switchToDemo')}
              </Button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const trimmedEmailPreview = email.trim().toLowerCase();

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.topHeader}>
          <div className={styles.navRow}>
            <Link prefetch={false} href={backHref} className={styles.backLink}>
              ← {backLabel}
            </Link>
            <div className={styles.langSwitch} role="group" aria-label={t('auth.lang.label')}>
              <button
                type="button"
                className={[styles.langBtn, lang === 'de' && styles.langBtnActive].filter(Boolean).join(' ')}
                aria-pressed={lang === 'de'}
                onClick={() => void setSettings({ language: 'de' })}
              >
                {t('auth.lang.de')}
              </button>
              <button
                type="button"
                className={[styles.langBtn, lang === 'en' && styles.langBtnActive].filter(Boolean).join(' ')}
                aria-pressed={lang === 'en'}
                onClick={() => void setSettings({ language: 'en' })}
              >
                {t('auth.lang.en')}
              </button>
            </div>
          </div>

          <div className={styles.titleBlock}>
            <div className={styles.titleLine}>
              <h1 className={styles.title}>{t('demoAdmin.title')}</h1>
              <DemoBadge />
            </div>
            <p className={styles.subtitle}>{t('demoAdmin.subtitle')}</p>
            {session && (
              <p className={styles.sessionInfo}>
                {t('demoAdmin.signedInAs', { email: session.email })}
              </p>
            )}
          </div>
        </header>

        <section className={styles.sectionCard} aria-labelledby="demo-users-heading">
          <div className={styles.sectionHeader}>
            <h2 id="demo-users-heading" className={styles.sectionTitle}>
              {t('demoAdmin.usersHeading')}
            </h2>
          </div>

          {loading ? (
            <div className={styles.skeletonList} aria-busy="true">
              <Skeleton height={64} />
              <Skeleton height={64} />
            </div>
          ) : loadError ? (
            <div className={styles.errorBox} role="alert">
              <p>{loadError}</p>
              <Button variant="secondary" icon="refresh" onClick={() => void loadUsers()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              icon="users"
              title={t('demoAdmin.usersEmptyTitle')}
              text={t('demoAdmin.usersEmptyText')}
              headingLevel={3}
            />
          ) : (
            <ul className={styles.userList} role="list">
              {users.map((u) => {
                const isCurrent = session?.email.toLowerCase() === u.email.toLowerCase();
                return (
                  <li key={u.email} className={styles.userRow}>
                    <div className={styles.userMain}>
                      <Avatar name={u.name} address={u.email} size="md" />
                      <div className={styles.userMeta}>
                        <div className={styles.userNameRow}>
                          <span className={styles.userName}>{u.name}</span>
                          <Badge tone="neutral" className={styles.rolePill}>
                            {t(u.role === 'admin' ? 'demoAdmin.roleAdmin' : 'demoAdmin.roleMember')}
                          </Badge>
                          {isCurrent && (
                            <Badge tone="success">{t('demoAdmin.activeBadge')}</Badge>
                          )}
                        </div>
                        <span className={styles.userEmail}>{u.email}</span>
                        <div className={styles.mailboxBadges}>
                          {u.mailboxAddresses.map((addr) => (
                            <span key={addr} className={styles.mailboxAddr}>
                              {addr}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className={styles.userActions}>
                      {isCurrent ? (
                        <span className={styles.currentUserLabel}>
                          {t('demoAdmin.currentlySignedIn')}
                        </span>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={signingInEmail === u.email}
                          onClick={() => void handleSignInAsClick(u)}
                        >
                          {t('demoAdmin.signInAs')}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.sectionCard} aria-labelledby="demo-create-heading">
          <h2 id="demo-create-heading" className={styles.sectionTitle}>
            {t('demoAdmin.createHeading')}
          </h2>

          {createError && (
            <div className={styles.errorAlert} role="alert">
              {createError}
            </div>
          )}

          <form className={styles.createForm} onSubmit={handleCreateUser} noValidate>
            <div className={styles.formGrid}>
              <TextField
                label={t('demoAdmin.nameLabel')}
                name="name"
                placeholder={t('demoAdmin.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={creating}
              />
              <TextField
                label={t('demoAdmin.emailLabel')}
                type="email"
                name="email"
                placeholder={t('demoAdmin.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={creating}
              />
            </div>

            <div className={styles.formGrid}>
              <PasswordField
                label={t('demoAdmin.passwordLabel')}
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={creating}
                showLabel={t('auth.login.showPassword')}
                hideLabelText={t('auth.login.hidePassword')}
              />

              <Select
                label={t('demoAdmin.roleLabel')}
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'member')}
                disabled={creating}
                options={[
                  { value: 'member', label: t('demoAdmin.roleMember') },
                  { value: 'admin', label: t('demoAdmin.roleAdmin') },
                ]}
              />
            </div>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>{t('demoAdmin.mailboxesLabel')}</legend>
              <div className={styles.checkboxList}>
                {availableMailboxes.map((addr) => (
                  <Checkbox
                    key={addr}
                    label={addr}
                    checked={selectedMailboxes.includes(addr)}
                    onChange={(e) => toggleMailbox(addr, e.target.checked)}
                    disabled={creating}
                  />
                ))}
                <Checkbox
                  label={
                    trimmedEmailPreview
                      ? t('demoAdmin.newPersonalMailboxWithEmail', { email: trimmedEmailPreview })
                      : t('demoAdmin.newPersonalMailbox')
                  }
                  checked={newPersonalMailbox}
                  onChange={(e) => setNewPersonalMailbox(e.target.checked)}
                  disabled={creating}
                />
              </div>
            </fieldset>

            <div className={styles.formActions}>
              <Button type="submit" variant="primary" icon="plus" loading={creating}>
                {t('demoAdmin.createSubmit')}
              </Button>
            </div>
          </form>
        </section>

        <section className={styles.sectionCard} aria-labelledby="demo-reset-heading">
          <div className={styles.resetRow}>
            <div>
              <h2 id="demo-reset-heading" className={styles.sectionTitle}>
                {t('demoAdmin.resetHeading')}
              </h2>
              <p className={styles.resetDesc}>{t('demoAdmin.resetDesc')}</p>
            </div>
            <Button variant="danger" className={styles.dangerBtn} onClick={() => setResetOpen(true)}>
              {t('demoAdmin.resetButton')}
            </Button>
          </div>
        </section>
      </div>

      <Dialog
        open={signInTarget !== null}
        onClose={() => setSignInTarget(null)}
        title={t('demoAdmin.passwordDialogTitle', { email: signInTarget?.email ?? '' })}
        description={t('demoAdmin.passwordDialogDesc')}
        closeLabel={t('common.close')}
      >
        <form id="demo-signin-form" className={styles.dialogForm} onSubmit={handleConfirmSignInDialog}>
          {signInTarget?.email.toLowerCase() === 'demo@frankiflow.de' && (
            <div className={styles.demoHintRow}>
              <span>{t('demoAdmin.passwordDialogDemoHint')}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSignInPassword('demo1234');
                  setSignInError(null);
                }}
              >
                {t('auth.login.fillDemo')}
              </Button>
            </div>
          )}

          {signInError && (
            <div className={styles.errorAlert} role="alert">
              {signInError}
            </div>
          )}

          <PasswordField
            label={t('auth.login.password')}
            value={signInPassword}
            onChange={(e) => {
              setSignInPassword(e.target.value);
              if (signInError) setSignInError(null);
            }}
            autoComplete="current-password"
            required
            showLabel={t('auth.login.showPassword')}
            hideLabelText={t('auth.login.hidePassword')}
          />

          <div className={styles.dialogFooterBtns}>
            <Button type="button" variant="secondary" onClick={() => setSignInTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={signingInEmail === signInTarget?.email}
            >
              {t('auth.login.submit')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t('demoAdmin.resetConfirmTitle')}
        description={t('demoAdmin.resetConfirmText')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)} disabled={resetting}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" className={styles.dangerBtn} loading={resetting} onClick={() => void handleResetDemo()}>
              {t('demoAdmin.resetButton')}
            </Button>
          </>
        }
      />
    </main>
  );
}
