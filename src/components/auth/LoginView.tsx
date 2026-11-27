'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setMode } from '@/lib/backend';
import { useApp } from '@/components/providers/AppProvider';
import { Button, DemoBadge, TextField } from '@/components/ui';
import { mapAuthError } from './helpers';
import { PasswordField } from './PasswordField';
import './strings';
import styles from './LoginView.module.css';

export { mapAuthError };

export function LoginView() {
  const { backend, mode, t, lang, setSettings, refreshSession, online } = useApp();
  const router = useRouter();

  // Audit L10: never prefill a remembered email address.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCapsCheck = (e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  };

  const handleFillDemo = () => {
    setEmail('demo@frankiflow.de');
    setPassword('demo1234');
    setErrorMsg(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg(t('auth.error.required'));
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await backend.signIn(trimmedEmail, password);
      if (!res.ok) {
        const msg = mapAuthError(res.error, online, t);
        setErrorMsg(msg);
        return;
      }
      await refreshSession();
      router.replace('/mail/');
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : String(err);
      const msg = mapAuthError(code, online, t);
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-heading">
        <div className={styles.cardTop}>
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

        <header className={styles.header}>
          <img
            src="/icon.svg"
            alt=""
            width={48}
            height={48}
            className={styles.logo}
          />
          <div className={styles.titleRow}>
            <h1 id="login-heading" className={styles.title}>
              {t('auth.login.title')}
            </h1>
            {mode === 'demo' && <DemoBadge />}
          </div>
          <p className={styles.subtitle}>
            {t(mode === 'demo' ? 'auth.login.subtitleDemo' : 'auth.login.subtitle')}
          </p>
        </header>

        {mode === 'demo' && (
          <div className={styles.demoBanner} role="region" aria-label={t('demo.badgeLabel')}>
            <span className={styles.demoHintText}>{t('auth.login.demoHint')}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleFillDemo}
            >
              {t('auth.login.fillDemo')}
            </Button>
          </div>
        )}

        {errorMsg && (
          <div className={styles.errorAlert} role="alert">
            {errorMsg}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <TextField
            label={t('auth.login.email')}
            type="email"
            name="email"
            autoComplete="username"
            placeholder={t('auth.login.emailPlaceholder')}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            onKeyDown={handleCapsCheck}
            onKeyUp={handleCapsCheck}
            required
            disabled={submitting}
          />

          <PasswordField
            label={t('auth.login.password')}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            onKeyDown={handleCapsCheck}
            onKeyUp={handleCapsCheck}
            required
            disabled={submitting}
            showLabel={t('auth.login.showPassword')}
            hideLabelText={t('auth.login.hidePassword')}
          />

          {capsLock && (
            <p className={styles.capsHint} role="status">
              {t('auth.login.capsLock')}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={submitting}
            className={styles.submitBtn}
          >
            {t('auth.login.submit')}
          </Button>
        </form>

        <p className={styles.forgotNote}>{t('auth.login.forgotNote')}</p>

        <div className={styles.divider} role="separator">
          <span>{t('auth.login.divider')}</span>
        </div>

        {mode === 'live' ? (
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => setMode('demo')}
          >
            {t('auth.login.tryDemo')}
          </Button>
        ) : (
          <div className={styles.demoFooter}>
            <Link prefetch={false} href="/demo-admin/" className={styles.demoLink}>
              {t('auth.login.manageDemoUsers')}
            </Link>
            <button
              type="button"
              className={styles.liveLinkBtn}
              onClick={() => setMode('live')}
            >
              {t('auth.login.backToLive')}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
