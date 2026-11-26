# FrankiFlow Mail v2 — contract for all workers (fixed; do not change it)

## Goal
A new mailbox frontend in Next.js on branch `v2` of `dn-lx/frankiflow-mail`: clearly better to use than the current static app, calm and easy on the eyes, fully keyboard and screen-reader usable, fast on phones. It talks to the **same live Supabase project** and keeps its security model (Supabase Auth + Row Level Security; the frontend only ever has the publishable key). It also has a **demo mode** with realistic sample data and self-service test users, so it can be tested thoroughly without touching live data or sending email.

## Stack (fixed)
- Next.js (App Router) with **static export** (`output: 'export'`, `images: { unoptimized: true }`, `trailingSlash: true`). No server code, no API routes, no middleware, no server actions. Everything runs in the browser, like today's app.
- TypeScript (strict). React. Plain CSS with CSS custom properties (design tokens) and CSS Modules. No Tailwind, no UI kit.
- Runtime dependencies: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `dompurify`. Nothing else without the orchestrator's approval.
- Tests: unit tests run with `node --experimental-strip-types --test tests/` directly on `.ts` files, so tested logic in `src/lib/**` must use relative imports with explicit `.ts` extensions (`allowImportingTsExtensions` in tsconfig), no path aliases, no JSX, no enums. Playwright (`e2e/`) runs against the static `out/` folder served locally.
- Netlify: `netlify.toml` on `v2` builds with `npm run build` and publishes `out`.

## Directory layout (each worker owns only its listed files)
```
package.json, next.config.mjs, tsconfig.json, netlify.toml, .gitignore     (scaffold)
src/app/layout.tsx, src/app/globals.css, src/app/page.tsx                  (scaffold)
src/app/login/page.tsx                                                      (auth-settings)
src/app/mail/page.tsx                                                       (shell-list)
src/app/settings/page.tsx                                                   (auth-settings)
src/app/demo-admin/page.tsx                                                 (auth-settings)
src/lib/backend/types.ts        THE interface below                         (scaffold)
src/lib/backend/index.ts        getBackend(): picks demo or supabase        (scaffold)
src/lib/backend/demo/**         demo implementation + seed data             (demo-backend)
src/lib/backend/supabase/**     live implementation                         (supabase-backend)
src/lib/mail/**                 pure helpers: search parser, threading,     (shell-list owns search.ts, threads.ts;
                                 sanitize, address parsing, formatting        reader owns sanitize.ts; composer owns addresses.ts)
src/components/shell/**, src/components/list/**                             (shell-list)
src/components/reader/**                                                    (reader)
src/components/composer/**                                                  (composer)
src/components/settings/**, src/components/auth/**                          (auth-settings)
src/components/ui/**            shared primitives: Button, IconButton,     (scaffold)
                                 Dialog, Menu, Toast, Avatar, Badge, Spinner
src/styles/tokens.css                                                       (scaffold)
legacy/**                       the current static app, moved unchanged     (scaffold)
tests/** (node:test), e2e/** (Playwright)                                   (tests)
supabase/**                     unchanged, never edited
```

## Backend interface (`src/lib/backend/types.ts`)
```ts
export type Folder = 'inbox' | 'sent' | 'drafts' | 'scheduled' | 'snoozed' | 'archive' | 'spam' | 'trash' | 'starred' | 'all';
export type Priority = 'low' | 'normal' | 'high';
export interface Mailbox { id: string; address: string; displayName: string; isPrimary: boolean; canSend: boolean }
export interface Label { id: string; name: string; color: string }
export interface AttachmentMeta { id: string; messageId: string; filename: string; contentType: string; size: number }
export interface Message {
  id: string; threadId: string; mailboxId: string; direction: 'inbound' | 'outbound' | 'draft';
  folder: Exclude<Folder, 'starred' | 'all'>;
  from: { address: string; name: string }; to: string[]; cc: string[]; bcc: string[]; replyTo?: string;
  subject: string; textBody: string; htmlBody: string; preview: string;
  isRead: boolean; isStarred: boolean; isPinned: boolean; priority: Priority;
  hasAttachments: boolean; attachments: AttachmentMeta[]; labelIds: string[];
  sentAt?: string; receivedAt?: string; snoozedUntil?: string; scheduledAt?: string;
  inReplyTo?: string; references?: string; createdAt: string; updatedAt: string;
}
export interface ThreadSummary {
  id: string; subject: string; lastMessageAt: string; messageCount: number; unreadCount: number;
  participants: string[]; preview: string; isStarred: boolean; isPinned: boolean; priority: Priority;
  hasAttachments: boolean; labelIds: string[]; mailboxIds: string[]; latestMessageId: string;
}
export interface ThreadQuery { mailboxId?: string; folder: Folder; labelId?: string; search?: string; limit?: number; before?: string }
export interface MessagePatch { isRead?: boolean; isStarred?: boolean; isPinned?: boolean; priority?: Priority; folder?: Message['folder']; snoozedUntil?: string | null; labelIdsAdd?: string[]; labelIdsRemove?: string[] }
export interface OutgoingAttachment { filename: string; contentType: string; size: number; data: Blob }
export interface Draft { id?: string; mailboxId: string; to: string[]; cc: string[]; bcc: string[]; subject: string; html: string; text: string; inReplyToMessageId?: string; attachments: (OutgoingAttachment | AttachmentMeta)[]; scheduledAt?: string }
export interface SendResult { ok: boolean; messageId?: string; error?: string; queued?: boolean }
export interface UserSession { userId: string; email: string; role: 'admin' | 'member'; mode: 'demo' | 'live' }
export interface Settings { theme: 'system' | 'light' | 'dark'; density: 'comfortable' | 'compact'; readingPane: 'right' | 'bottom' | 'off'; conversationView: boolean; loadRemoteImages: 'ask' | 'always'; undoSendSeconds: 0 | 5 | 10; language: 'de' | 'en' }
export interface Signature { id: string; mailboxId: string; html: string; isDefault: boolean }
export interface Template { id: string; name: string; subject: string; html: string }
export interface Contact { address: string; name: string; lastUsedAt?: string }
export interface DemoUser { email: string; name: string; role: 'admin' | 'member'; mailboxAddresses: string[] }

export interface MailBackend {
  readonly mode: 'demo' | 'live';
  // auth
  getSession(): Promise<UserSession | null>;
  signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  changePassword(newPassword: string): Promise<{ ok: boolean; error?: string }>;
  onChange(listener: () => void): () => void; // realtime or demo updates; returns unsubscribe
  // mail
  listMailboxes(): Promise<Mailbox[]>;
  listThreads(q: ThreadQuery): Promise<{ threads: ThreadSummary[]; nextBefore?: string }>;
  getThread(threadId: string): Promise<Message[]>; // oldest first
  updateMessages(messageIds: string[], patch: MessagePatch): Promise<void>;
  deleteForever(messageIds: string[]): Promise<void>; // only from trash/spam
  counts(mailboxId?: string): Promise<Partial<Record<Folder, number>>>; // unread per folder
  // labels
  listLabels(): Promise<Label[]>; createLabel(name: string, color: string): Promise<Label>; deleteLabel(id: string): Promise<void>;
  // compose
  saveDraft(d: Draft): Promise<{ id: string }>; deleteDraft(id: string): Promise<void>;
  send(d: Draft): Promise<SendResult>;
  attachmentUrl(a: AttachmentMeta): Promise<string>;
  suggestContacts(prefix: string): Promise<Contact[]>;
  // settings
  getSettings(): Promise<Settings>; saveSettings(s: Settings): Promise<void>;
  listSignatures(): Promise<Signature[]>; saveSignature(s: Signature): Promise<void>;
  listTemplates(): Promise<Template[]>; saveTemplate(t: Template): Promise<Template>; deleteTemplate(id: string): Promise<void>;
  // demo only (live implementation throws 'not available in live mode')
  listDemoUsers(): Promise<DemoUser[]>; createDemoUser(u: DemoUser & { password: string }): Promise<void>; resetDemo(): Promise<void>;
}
```
Errors: methods reject with `Error` whose message is user-presentable (German/English handled by the UI from an error code prefix like `auth:`, `network:`, `permission:`).

## Modes
- `getBackend()` returns the demo backend when the URL has `?demo=1`, or `localStorage['ffmail.mode'] === 'demo'`, or `process.env.NEXT_PUBLIC_MAIL_MODE === 'demo'`; otherwise the live one. The login page has a clear "Try the demo" button that switches to demo mode; a visible "DEMO" badge shows in demo mode everywhere.
- **Demo backend**: everything in memory, persisted to `localStorage` key `ffmail.demo.v1`. Seed: 2 mailboxes (`info@frankiflow.de` shared, `team@frankiflow.de` personal), ~45 realistic threads in German and English for a Frankfurt cleaning business (enquiries, quotes, appointments, invoices, a long 8-message thread, HTML newsletters with images and a tracking pixel, a phishing-like spam mail, messages with PDF/JPG attachments generated in-browser), 4 labels, 2 templates, signatures. Demo users: preset `demo@frankiflow.de` / `demo1234` (admin); `/demo-admin` lets anyone in demo mode create more users with chosen mailboxes and log in as them. `send` in demo: puts the message into Sent of that mailbox; if a recipient is a demo mailbox address it also delivers to that mailbox's inbox; never makes a network request. Scheduled sends move to Scheduled and "deliver" when due while the app is open.
- **Live backend**: Supabase JS client with `supabaseUrl` and the publishable key from `legacy/assets/config.js` (same values; put them in `src/lib/backend/supabase/config.ts`). It reads and writes exactly the existing tables (see `schema-mail.md`) under the signed-in user's RLS, sends through the existing `send-mail` Edge Function with the same request format the current app uses (`legacy/assets/app.js`, `legacy/assets/mail-attachments.js`, `supabase/functions/send-mail/handler.mjs`), and uses the same storage bucket/paths for attachments. It must not need any schema change, new function or service-role key.
- **Send safety**: the live backend refuses to send unless the user is signed in (RLS enforces the rest). Automated tests only ever use demo mode.

## Security rules (all workers)
- Email HTML is untrusted. Render it only inside a sandboxed `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc=...>` (no `allow-scripts`, no `allow-same-origin`), after DOMPurify sanitization; links open in a new tab with `rel="noopener noreferrer"`. Remote images are blocked until the user allows them per message or sets `loadRemoteImages: 'always'` (replace remote `src` with a placeholder and keep the original in `data-src`).
- Never use `dangerouslySetInnerHTML` outside that iframe path. Never log message bodies or tokens. Never put credentials in code (the publishable key is public by design).
- Composer HTML is sanitized with DOMPurify before saving or sending.

## UX and design (all UI workers)
- **Calm and eye-friendly**: off-white surfaces (`#F7F8FA`) and soft dark mode (`#14181F`, never pure black), one accent (FrankiFlow teal `#1F8A8A`), text contrast at least 4.5:1, base font 15px, line-height 1.55, generous whitespace, subtle 1px borders, no heavy shadows, rounded 10px corners. System font stack. Respect `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast`.
- Layout: three panes on desktop (sidebar 240px / list 380px / reader), two on tablet, single stacked view on phones with a bottom action bar and back navigation; no horizontal scrolling at 320px.
- List rows: sender, subject, preview, time, unread dot, star, attachment and label chips; hover actions (archive, delete, mark read, snooze); multi-select with checkbox and Shift-click; infinite scroll.
- Keyboard: `j/k` next/previous, `Enter` open, `e` archive, `#` delete, `s` star, `r` reply, `a` reply all, `f` forward, `c` compose, `/` search, `u` back to list, `?` shortcut help, `Cmd/Ctrl+Enter` send. Visible focus rings everywhere.
- Search: one field with operators `from: to: subject: is:unread|read|starred|pinned has:attachment label: before:YYYY-MM-DD after:YYYY-MM-DD`, chips for active filters.
- Composer: modal on desktop (resizable, minimise to a bar), full screen on phones; To/Cc/Bcc with contact suggestions and chip editing; rich text (bold, italic, underline, lists, link, quote, clear formatting) using `contenteditable` with a small toolbar; attachments by button or drag and drop with size limit and progress; signature per mailbox; templates; draft autosave every 3 s and on close; schedule send; undo send (delay window from settings).
- Toasts for every action with Undo where possible (archive, delete, move, label).
- Language: German UI by default with an English switch (`src/lib/i18n.ts`, owned by scaffold, with all strings keyed; workers add keys to their own `src/components/<area>/strings.ts` and register them).
- Empty, loading (skeletons), offline and error states for every view.

## Definition of done per worker
Type-checks (`npx tsc --noEmit`), `npm run build` produces `out/`, no ESLint errors if configured, and the worker's own unit tests pass. The orchestrator runs all of this; workers cannot run commands.

## Module contracts between workers (fixed)
- `src/lib/backend/demo/index.ts` exports `createDemoBackend(storage?: Storage): MailBackend` (no React, no JSX, no `@/` alias, relative imports with `.ts`; works in Node with an in-memory storage for tests).
- `src/lib/backend/supabase/index.ts` exports `createSupabaseBackend(): MailBackend` (browser only).
- `src/lib/backend/index.ts` exports `getBackend(): Promise<MailBackend>` (singleton; loads the chosen implementation with dynamic `import()` so the demo bundle does not load Supabase and vice versa), `setMode(mode: 'demo' | 'live')` (stores `ffmail.mode`, reloads) and `currentMode()`.
- `src/components/providers/AppProvider.tsx` (scaffold) provides `useApp()` → `{ backend, session, settings, setSettings, mode, t, lang, refreshSession }`, applies theme and density to `<html data-theme data-density>`, and redirects: no session → `/login/`, session on `/login/` → `/mail/`. `src/components/ui/Toast.tsx` provides `useToast()` → `toast({ message, actionLabel?, onAction?, tone?: 'info'|'success'|'error' })`.
- Folder vs direction values in the live data are documented in `live-contract.md` section 8; `direction: 'draft'` exists for browser-saved drafts.
- Live sending: read `live-contract.md` section 4. Never auto-retry a send; a `delivery_unconfirmed` or `warning` response is shown to the user as "may not have been delivered, check Sent before resending". After a successful send of a draft, delete the draft.
