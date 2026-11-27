'use client';

import { Fragment } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Dialog } from '@/components/ui';
import styles from './AppShell.module.css';
import './strings';

type Keys = string[][]; // alternatives, each a sequence

interface Row {
  keys: Keys;
  labelKey: string;
}

const SECTIONS: { titleKey: string; rows: Row[] }[] = [
  {
    titleKey: 'help.navigation',
    rows: [
      { keys: [['j']], labelKey: 'help.next' },
      { keys: [['k']], labelKey: 'help.prev' },
      { keys: [['Enter'], ['o']], labelKey: 'help.openThread' },
      { keys: [['u']], labelKey: 'help.back' },
      { keys: [['x']], labelKey: 'help.select' },
      { keys: [['/']], labelKey: 'help.search' },
      { keys: [['g', 'i']], labelKey: 'help.gi' },
      { keys: [['g', 's']], labelKey: 'help.gs' },
      { keys: [['g', 'd']], labelKey: 'help.gd' },
      { keys: [['g', 't']], labelKey: 'help.gt' },
      { keys: [['?']], labelKey: 'help.help' },
    ],
  },
  {
    titleKey: 'help.actions',
    rows: [
      { keys: [['e']], labelKey: 'help.archive' },
      { keys: [['#']], labelKey: 'help.delete' },
      { keys: [['s']], labelKey: 'help.star' },
      { keys: [['r']], labelKey: 'help.reply' },
      { keys: [['a']], labelKey: 'help.replyAll' },
      { keys: [['f']], labelKey: 'help.forward' },
    ],
  },
  {
    titleKey: 'help.compose',
    rows: [
      { keys: [['c']], labelKey: 'help.composeNew' },
      { keys: [['Ctrl', 'Enter'], ['⌘', 'Enter']], labelKey: 'help.send' },
    ],
  },
];

const OPERATORS: { example: string; labelKey: string }[] = [
  { example: 'from:anna', labelKey: 'help.op.from' },
  { example: 'to:info@frankiflow.de', labelKey: 'help.op.to' },
  { example: 'subject:Angebot', labelKey: 'help.op.subject' },
  { example: 'is:unread · is:read · is:starred · is:pinned', labelKey: 'help.op.is' },
  { example: 'has:attachment', labelKey: 'help.op.has' },
  { example: 'label:Kunden', labelKey: 'help.op.label' },
  { example: 'before:2026-01-31 · after:2026-01-01', labelKey: 'help.op.date' },
];

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp();
  return (
    <Dialog open={open} onClose={onClose} title={t('help.title')} size="lg" closeLabel={t('common.close')}>
      <div className={styles.helpGrid}>
        {SECTIONS.map((section) => (
          <section key={section.titleKey} className={styles.helpSection}>
            <h3 className={styles.helpTitle}>{t(section.titleKey)}</h3>
            <dl className={styles.helpList}>
              {section.rows.map((row) => (
                <div key={row.labelKey} className={styles.helpRow}>
                  <dt className={styles.helpKeys}>
                    {row.keys.map((seq, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span className={styles.helpSep}>{t('help.or')}</span>}
                        {seq.map((k, j) => (
                          <Fragment key={j}>
                            {j > 0 && (
                              <span className={styles.helpSep}>{seq[0] === 'g' ? t('help.then') : '+'}</span>
                            )}
                            <kbd>{k}</kbd>
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </dt>
                  <dd className={styles.helpLabel}>{t(row.labelKey)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section className={styles.helpSection}>
          <h3 className={styles.helpTitle}>{t('help.searchOps')}</h3>
          <dl className={styles.helpList}>
            {OPERATORS.map((op) => (
              <div key={op.labelKey} className={styles.helpRow}>
                <dt className={styles.helpKeys}>
                  {op.example.split(' · ').map((token) => (
                    <code key={token} className={styles.helpCode}>
                      {token}
                    </code>
                  ))}
                </dt>
                <dd className={styles.helpLabel}>{t(op.labelKey)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </Dialog>
  );
}
