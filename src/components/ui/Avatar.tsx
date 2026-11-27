import type { CSSProperties } from 'react';
import styles from './Avatar.module.css';

export interface AvatarProps {
  name?: string;
  address?: string;
  size?: 'sm' | 'md' | 'lg';
  /** If set the avatar is announced; otherwise it is decorative. */
  label?: string;
  className?: string;
}

/** Up to two initials from the display name, else from the address local part. */
export function initialsFor(name?: string, address?: string): string {
  const source = (name ?? '').replace(/[<>"]/g, '').trim();
  const words = source && !source.includes('@') ? source.split(/\s+/) : (address ?? source).split('@')[0]!.split(/[._\-+]+/);
  const letters = words
    .filter(Boolean)
    .map((w) => Array.from(w)[0] ?? '')
    .filter((ch) => /\p{L}|\p{N}/u.test(ch));
  const picked = letters.length > 1 ? [letters[0], letters[letters.length - 1]] : letters;
  return picked.join('').toUpperCase() || '?';
}

/** Deterministic hue (0–359) for a string. */
export function hueFor(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function Avatar({ name, address, size = 'md', label, className }: AvatarProps) {
  const key = (address || name || '?').toLowerCase();
  const style = { '--avatar-hue': hueFor(key) } as CSSProperties;
  return (
    <span
      className={[styles.avatar, styles[size], className].filter(Boolean).join(' ')}
      style={style}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {initialsFor(name, address)}
    </span>
  );
}
