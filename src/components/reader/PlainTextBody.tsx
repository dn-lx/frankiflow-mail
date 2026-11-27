'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import styles from './PlainTextBody.module.css';

export interface PlainTextBodyProps {
  text: string;
}

interface TextSegment {
  quoted: boolean;
  lines: string[];
}

const ATTRIBUTION_LINE_RE = /^(Am\s.+schrieb.*:|On\s.+wrote:|---+ ?Original Message ?---+)$/i;
const URL_RE = /\b((?:https?:\/\/|mailto:)[^\s<>()]+|www\.[^\s<>()]+)/gi;

function splitQuotedSegments(text: string): TextSegment[] {
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const segments: TextSegment[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    const nextLine = rawLines[i + 1];
    const isAttrBeforeQuote =
      ATTRIBUTION_LINE_RE.test(line.trim()) && nextLine !== undefined && nextLine.trimStart().startsWith('>');
    const isQuoted = line.trimStart().startsWith('>') || isAttrBeforeQuote;

    const last = segments[segments.length - 1];
    if (last && last.quoted === isQuoted) {
      last.lines.push(line);
    } else {
      segments.push({ quoted: isQuoted, lines: [line] });
    }
  }

  return segments;
}

function renderLineWithLinks(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    let rawUrl = match[1]!;
    // Trim trailing sentence punctuation that is unlikely part of the URL.
    const trailing = /[.,;:!?)]+$/.exec(rawUrl);
    let suffix = '';
    if (trailing) {
      suffix = trailing[0];
      rawUrl = rawUrl.slice(0, -suffix.length);
    }
    const href = rawUrl.toLowerCase().startsWith('www.') ? `https://${rawUrl}` : rawUrl;
    nodes.push(
      <a
        key={`${keyPrefix}-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        {rawUrl}
      </a>,
    );
    if (suffix) nodes.push(suffix);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }
  return nodes.length > 0 ? nodes : [line];
}

function QuotedSegment({ lines }: { lines: string[] }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.quotedGroup}>
      <button
        type="button"
        className={styles.quoteToggle}
        aria-expanded={open}
        aria-label={t('reader.toggleQuoted')}
        title={t('reader.toggleQuoted')}
        onClick={() => setOpen((v) => !v)}
      >
        …
      </button>
      {open && (
        <blockquote className={styles.blockquote}>
          {lines.map((line, idx) => (
            <Fragment key={idx}>
              {renderLineWithLinks(line, `q-${idx}`)}
              {idx < lines.length - 1 && <br />}
            </Fragment>
          ))}
        </blockquote>
      )}
    </div>
  );
}

export function PlainTextBody({ text }: PlainTextBodyProps) {
  const segments = useMemo(() => splitQuotedSegments(text), [text]);

  return (
    <div className={styles.root}>
      {segments.map((seg, sIdx) =>
        seg.quoted ? (
          <QuotedSegment key={sIdx} lines={seg.lines} />
        ) : (
          <div key={sIdx} className={styles.plainBlock}>
            {seg.lines.map((line, lIdx) => (
              <Fragment key={lIdx}>
                {renderLineWithLinks(line, `p-${sIdx}-${lIdx}`)}
                {lIdx < seg.lines.length - 1 && <br />}
              </Fragment>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
