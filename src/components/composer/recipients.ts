// Recipient list helpers without React, so they can be tested in Node.

import type { ParsedAddress } from '../../lib/mail/addresses.ts';
import type { Recipient } from './types.ts';

let recipientCounter = 0;

export function newRecipientId(): string {
  recipientCounter += 1;
  return `rcpt-${recipientCounter}`;
}

/** Parsed addresses to chips; empty and duplicate addresses (case-insensitive) are dropped. */
export function toRecipients(list: ParsedAddress[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const p of list) {
    const key = p.address.toLowerCase();
    if (!p.address || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: newRecipientId(), address: p.address, name: p.name });
  }
  return out;
}
