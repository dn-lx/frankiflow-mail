'use client';

import { useId, useState, type FormEvent } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Button, Dialog, Menu, type MenuItem } from '@/components/ui';
import { fromLocalInputValue, snoozePresets, toLocalInputValue } from '@/lib/mail/threads';
import type { Lang } from '@/lib/i18n';
import formStyles from '@/components/ui/Form.module.css';
import './strings';

export interface SnoozeMenuProps {
  /** Called with the ISO timestamp to snooze until. */
  onPick: (isoUntil: string) => void;
  /** Trigger label (default "Snooze"). */
  label?: string;
  size?: 'sm' | 'md';
  align?: 'start' | 'end';
  placement?: 'bottom' | 'top';
  disabled?: boolean;
  className?: string;
}

function timeOf(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Snooze picker: later today, tomorrow 08:00, next Monday 08:00, or a custom date and time. */
export function SnoozeMenu({ onPick, label, size = 'md', align = 'end', placement, disabled, className }: SnoozeMenuProps) {
  const { t, lang } = useApp();
  const [customOpen, setCustomOpen] = useState(false);
  // Recomputed on every render; the menu re-renders when opened, so presets stay current.
  const presets = snoozePresets(new Date());

  const items: MenuItem[] = [];
  if (presets.laterToday) {
    const d = presets.laterToday;
    items.push({ id: 'later', icon: 'clock', label: t('snooze.laterToday', { time: timeOf(d, lang) }), onSelect: () => onPick(d.toISOString()) });
  }
  items.push(
    {
      id: 'tomorrow',
      icon: 'sun',
      label: t('snooze.tomorrow', { time: timeOf(presets.tomorrow, lang) }),
      onSelect: () => onPick(presets.tomorrow.toISOString()),
    },
    {
      id: 'monday',
      icon: 'alarm',
      label: t('snooze.nextMonday', { time: timeOf(presets.nextMonday, lang) }),
      onSelect: () => onPick(presets.nextMonday.toISOString()),
    },
    { id: 'sep', separator: true },
    { id: 'custom', icon: 'edit', label: t('snooze.custom'), onSelect: () => setCustomOpen(true) },
  );

  return (
    <>
      <Menu
        label={label ?? t('snooze.label')}
        icon="alarm"
        items={items}
        size={size}
        align={align}
        placement={placement}
        disabled={disabled}
        className={className}
      />
      {customOpen && (
        <CustomSnoozeDialog
          onClose={() => setCustomOpen(false)}
          onPick={(iso) => {
            setCustomOpen(false);
            onPick(iso);
          }}
        />
      )}
    </>
  );
}

function CustomSnoozeDialog({ onClose, onPick }: { onClose: () => void; onPick: (iso: string) => void }) {
  const { t } = useApp();
  const formId = useId();
  const inputId = useId();
  const [value, setValue] = useState(() => toLocalInputValue(snoozePresets(new Date()).tomorrow));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const d = fromLocalInputValue(value);
    if (!d || d.getTime() <= Date.now()) {
      setError(t('snooze.past'));
      return;
    }
    onPick(d.toISOString());
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('snooze.customTitle')}
      size="sm"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form={formId} icon="alarm">
            {t('snooze.confirm')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className={formStyles.field}>
        <label htmlFor={inputId} className={formStyles.label}>
          {t('snooze.when')}
        </label>
        <input
          id={inputId}
          type="datetime-local"
          className={formStyles.input}
          value={value}
          min={toLocalInputValue(new Date())}
          required
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-err` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <span id={`${inputId}-err`} className={formStyles.error} role="alert">
            {error}
          </span>
        )}
      </form>
    </Dialog>
  );
}
