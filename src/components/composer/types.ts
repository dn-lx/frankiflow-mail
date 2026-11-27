import type { AttachmentMeta, Draft, Message } from '@/lib/backend/types';

/** How to open a composer window (contract shared with reader and shell). */
export type ComposeInit = {
  mode: 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';
  message?: Message;
  draftId?: string;
  mailboxId?: string;
  to?: string[];
};

export type ComposeMode = ComposeInit['mode'];

export interface Recipient {
  id: string;
  address: string;
  name: string;
}

export interface ComposeAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  /** New file picked by the user. */
  data?: Blob;
  /** Existing stored attachment (forward, reopened draft). */
  meta?: AttachmentMeta;
}

/** Everything needed to (re)create a composer window with the same content. */
export interface ComposerSnapshot {
  draftId?: string;
  mailboxId: string;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  showCc: boolean;
  showBcc: boolean;
  subject: string;
  /** Sanitized body HTML. */
  html: string;
  attachments: ComposeAttachment[];
  inReplyToMessageId?: string;
  /** True when the content has not been saved as a draft yet. */
  dirty: boolean;
}

export type WindowView = 'docked' | 'minimized' | 'expanded';

export interface WindowEntry {
  key: string;
  init: ComposeInit;
  /** Present when restoring after undo or a failed send. */
  snapshot?: ComposerSnapshot;
  view: WindowView;
  /** Error message to show at the top (failed send). */
  error?: string;
  /** Bumped to ask the window to take focus. */
  focusToken: number;
}

export interface SendRequest {
  snapshot: ComposerSnapshot;
  draft: Draft;
}
