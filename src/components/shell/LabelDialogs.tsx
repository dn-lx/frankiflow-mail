'use client';

import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Button, Dialog, TextField, useToast } from '@/components/ui';
import type { Label } from '@/lib/backend/types';
import { describeError } from '@/lib/i18n';
import styles from './AppShell.module.css';
import './strings';

export const LABEL_COLORS: readonly { id: string; color: string }[] = [
  { id: 'teal', color: '#1F8A8A' },
  { id: 'blue', color: '#2F6FDB' },
  { id: 'green', color: '#2E8B57' },
  { id: 'amber', color: '#C98A00' },
  { id: 'red', color: '#C8443A' },
  { id: 'purple', color: '#7B5CC4' },
  { id: 'grey', color: '#6B7584' },
];

export function CreateLabelDialog({ labels, onClose, onCreated }: { labels: Label[]; onClose: () => void; onCreated: (l: Label) => void }) {
  const { backend, t, lang } = useApp();
  const toast = useToast();
  const formId = useId();
  const groupId = useId();
  const [name, setName] = useState('');
  const [color, setColor] = useState(LABEL_COLORS[0]!.color);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('shell.labelNameRequired'));
      return;
    }
    if (labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(t('shell.labelNameTaken'));
      return;
    }
    setBusy(true);
    try {
      const created = await backend.createLabel(trimmed, color);
      toast({ tone: 'success', message: t('shell.labelCreated', { name: created.name }) });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(describeError(lang, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('shell.labelCreate')}
      size="sm"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className={styles.labelForm}>
        <TextField
          label={t('shell.labelName')}
          value={name}
          maxLength={40}
          autoFocus
          required
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
          }}
        />
        <fieldset className={styles.colorField}>
          <legend className={styles.colorLegend} id={groupId}>
            {t('shell.labelColor')}
          </legend>
          <div className={styles.swatches}>
            {LABEL_COLORS.map((c) => (
              <label key={c.id} className={styles.swatch} style={{ '--swatch': c.color } as CSSProperties} title={t(`shell.color.${c.id}`)}>
                <input
                  type="radio"
                  name={`${formId}-color`}
                  value={c.color}
                  checked={color === c.color}
                  onChange={() => setColor(c.color)}
                  className={styles.swatchInput}
                />
                <span className={styles.swatchDot} aria-hidden="true" />
                <span className="sr-only">{t(`shell.color.${c.id}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

export function DeleteLabelDialog({ label, onClose, onDeleted }: { label: Label; onClose: () => void; onDeleted: (l: Label) => void }) {
  const { backend, t, lang } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await backend.deleteLabel(label.id);
      toast({ tone: 'success', message: t('shell.labelDeleted', { name: label.name }) });
      onDeleted(label);
      onClose();
    } catch (err) {
      toast({ tone: 'error', message: describeError(lang, err) });
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('shell.labelDeleteTitle')}
      description={t('shell.labelDeleteText', { name: label.name })}
      size="sm"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" icon="trash" loading={busy} onClick={confirm}>
            {t('common.delete')}
          </Button>
        </>
      }
    />
  );
}
