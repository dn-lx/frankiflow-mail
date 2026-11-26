# Live contract: what a Supabase-backed client must do to behave like the current app

Source: `frankiflow-mail` at commit `602972a` (origin/develop, also checked out in
`frankiflow-mail-worktrees/integration`). Line refs: `app.js:N` = `assets/app.js`,
`enh.js` = `assets/enhancements.js`, `att.js` = `assets/mail-attachments.js`,
`sec.js` = `assets/account-security.js`, `clean.js` = `assets/settings-cleanup.js`,
`handler:N` = `supabase/functions/send-mail/handler.mjs`. Table schema: `schema-mail.md`.
The publishable key and project URL live in `assets/config.js` (`CONFIG.supabaseUrl`,
`CONFIG.supabasePublishableKey`, `CONFIG.sendFunctionUrl`); never copy them anywhere else but
`src/lib/backend/supabase/config.ts`.

**Big picture:** the current app does almost nothing on the server. It loads up to 1000
messages plus every small table in one go (`loadAll`, app.js:590-611). Then it filters,
counts, threads and searches in the browser, and writes with plain PostgREST `update`, `insert`
or `delete` under RLS. Only sending goes through an Edge Function. No RPC is called from the
browser. The client never reads `frankiflow_mail_threads`.

---

## 1. Auth

- Client: `createClient(url, publishableKey, { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } })`,
  kept as a single global instance under `globalThis.__FRANKIFLOW_MAIL_SUPABASE__` (supabase-client.js:4-8).
  Uses supabase-js `2.116.0` (same version in the Edge Function, index.ts:2).
- Sign-in: `supabase.auth.signInWithPassword({ email: email.trim(), password })` (app.js:100). If it fails,
  the app shows `error.message`. No other method (no magic link, OAuth or MFA).
- Session: at startup it calls `supabase.auth.getSession()` (app.js:703). `onAuthStateChange` runs `loadAll` → push
  status → deep link → `setupRealtime` when there is a session. With no session it clears state, removes the channel and shows the login (app.js:702).
  Sign-out: `supabase.auth.signOut()` (app.js:206).
- **Role / permissions:** the only browser read of `frankiflow_mail_users` is in sec.js:14-19:
  ```js
  supabase.from('frankiflow_mail_users').select('user_id,email,role,active').eq('user_id',user.id).maybeSingle()
  ```
  It is used only to decide whether the "Password & sign-in" settings section appears. `role` is never
  used in the browser, and `active` is not checked there. Signing in does **not** check this table, so a Supabase Auth user
  without a row can sign in and simply sees whatever RLS allows. The Edge Function does
  enforce it: `select('user_id').eq('user_id',uid).eq('active',true)`, and with no row it returns 403 `Mailbox access denied`
  (handler:174-175). For `UserSession.role` (SPEC), map the `role` text (`'admin'` default, anything else → `'member'`).
- **Mailboxes:** the browser never queries `frankiflow_mail_user_accounts`. Mailboxes are simply
  `from('frankiflow_mail_accounts').select('*').order('is_primary',{ascending:false})` (app.js:595). RLS decides
  which rows come back (personal plus shared `info@frankiflow.de`, which is also `CONFIG.mailbox`). The reply dialog uses a narrower
  `select('id,address,is_primary').order('is_primary',{ascending:false}).limit(25)` (enh.js:248).
  The server resolves the sender with `frankiflow_mail_user_accounts`
  (`select('account_id,is_default,can_send').eq('user_id',uid).eq('can_send',true).order('is_default',{ascending:false}).limit(1)`, handler:208)
  and checks it with `rpc('frankiflow_mail_can_send_from_account', { p_account_id })` (handler:212).
  For `Mailbox.canSend`, a new client can read `frankiflow_mail_user_accounts` filtered by `user_id`. This is **not exercised by the current
  app**, so whether RLS allows the select is unverified; fall back to `true` and let send return 403.
- Default sender: `settings.default_sender_address`, then the `is_primary` account, then the first account, then `CONFIG.mailbox` (app.js:34).
  Message → mailbox: `accounts.find(a.id===m.account_id)`, otherwise by `from_address`, otherwise primary (app.js:32-33).
- **Password change:** `supabase.auth.updateUser({ password })`. The client requires ≥ 12 chars and that both fields match (sec.js:64-77).
  No current-password re-check.
- Login prefill: `localStorage['ffmail-last-login']` (lower-cased email, written on submit) (sec.js:86-89).

## 2. Reads (all in `loadAll`, app.js:593-604, run in parallel; any error aborts the refresh)

| What | Query |
|---|---|
| messages | `frankiflow_mail_messages.select('*').order('created_at',{ascending:false}).limit(1000)` (no folder filter, no paging) |
| accounts | `frankiflow_mail_accounts.select('*').order('is_primary',{ascending:false})` |
| labels | `frankiflow_mail_labels.select('*').order('name')` |
| message↔label | `frankiflow_mail_message_labels.select('*')` (the whole table) |
| contacts | `frankiflow_mail_contacts.select('*').order('last_used_at',{ascending:false}).limit(200)` (Postgres DESC puts NULLs first) |
| templates | `frankiflow_mail_templates.select('*').order('name')` |
| signatures | `frankiflow_mail_signatures.select('*').order('is_default',{ascending:false}).order('name')` |
| settings | `frankiflow_mail_settings.select('*').eq('user_id',uid).maybeSingle()` (may be null) |
| filters | `frankiflow_mail_filters.select('*').order('created_at')` |
| events | `frankiflow_mail_events.select('*').order('start_at',{ascending:true})` (calendar; out of SPEC scope) |

Other reads:
- Attachment indicator: `frankiflow_mail_attachments.select('message_id').in('message_id', chunk)`, in chunks of 100 ids
  (app.js:576-587). The code comments that `has_attachments` can be stale on sent mail (att.js:81), so treat
  `has_attachments || exists(attachment row)` as true.
- Per message attachments: `select('id,filename,content_type,size_bytes,storage_path').eq('message_id',id).order('created_at')` (att.js:82-86).
- Thread (dialog): `messages.select('*').eq('thread_id',tid).order('created_at',{ascending:true}).limit(100)`, then drop
  rows with `folder==='drafts' || direction==='draft'` (enh.js:251-257). The main reader does the same filter in memory (app.js:110-115).
- Single message (deep link `?message=<id>`): `messages.select('*').eq('id',id).maybeSingle()` (enh.js:441, 486).
- Labels after a realtime INSERT: `message_labels.select('*').eq('message_id',id)` (app.js:567).
- Legacy label to hide: `labels.select('id').eq('system_key','account_mail').maybeSingle()` (sec.js:25).

**Folder listing (in the browser, app.js:148-174):**
- `starred` = `is_starred && folder!=='trash'`. Every other folder = `effectiveFolder(m)===folder`.
  `effectiveFolder` makes a `snoozed` message whose `snoozed_until <= now` count as `inbox` (app.js:117).
- Sort: `is_pinned` desc, then `received_at || sent_at || created_at` desc.
- Conversation view (unless `settings.conversation_view===false`): keep the first (newest) row per `thread_id`.
  Rows without a thread count as their own thread.
- **Counts** (app.js:103-108): the Inbox badge = inbox messages with `!is_read`. Other badges = **total** messages in that
  folder (not unread). Drafts/Sent/Trash show totals.
- **Search** (app.js:118-147) is done in the browser over the loaded rows. Operators: `from: to: subject: is:unread|read|starred|pinned|important|muted
  has:attachment in:<folder> before: after: label:`. Free words are matched (AND) against from_address, from_name, subject,
  preview, text_body, to, cc. Dates use `received_at||sent_at||created_at`. `is:important` means `priority==='high'`.
- Mobile quick filters `unread|starred|attachments|info` (app.js:151-162). `info` = label named "info" or account
  `info@frankiflow.de`. The `mail` chip is removed by sec.js:94.

## 3. Writes

Every message update also sets `updated_at: new Date().toISOString()` (app.js:235, 296).

| Action | Call |
|---|---|
| mark read / unread | `messages.update({is_read, updated_at}).eq('id',id)` or bulk `.in('id',ids)` (app.js:241, 296) |
| auto mark read on open | only when `direction==='inbound'` and `settings.mark_read_on_open!==false` (app.js:249) |
| star | `update({is_starred})` (app.js:251) |
| pin | `update({is_pinned})` (app.js:273) |
| priority | `update({priority: 'high' \| 'normal'})` (app.js:273) |
| category | `update({category: 'clients'\|'bookings'\|'finance'})` (app.js:273; never read back in the UI) |
| move | `update({folder, trashed_at: folder==='trash' ? now : null})` (app.js:297). Bulk: archive `{folder:'archive',trashed_at:null}`, trash `{folder:'trash',trashed_at:now}`, restore `{folder:'inbox',trashed_at:null}` (app.js:238-240) |
| spam / not spam | move to `'spam'` / `'inbox'` (app.js:273) |
| snooze | `update({folder:'snoozed', snoozed_until: iso, updated_at}).in('id',ids)` (app.js:501) |
| wake snoozed | on every `loadAll`: `update({folder:'inbox', snoozed_until:null, updated_at}).in('id',dueIds)` (app.js:575) |
| apply label | `message_labels.upsert({message_id,label_id},{onConflict:'message_id,label_id'})`, one call per pair (app.js:503) |
| remove label | **not implemented** in the current app. Would be `message_labels.delete().eq('message_id',m).eq('label_id',l)`; RLS untested |
| create label | `labels.insert({name, color, created_by: uid})` (app.js:504) |
| delete label | `labels.delete().eq('id',id)` (app.js:504; the error is ignored) |
| delete forever | 1) `attachments.select('storage_path').in('message_id',ids)`; 2) `storage.from('frankiflow-mail-attachments').remove(paths)`; 3) `messages.delete().in('id',ids)` (app.js:298-306). Message labels, attachment rows and thread rows are not deleted by the client (FK cascade not visible in the schema dump). Empty trash = the same for all trash ids (app.js:307) |
| draft save (new) | `messages.insert(row).select('id').single()` (app.js:406) |
| draft save (existing) | `messages.update(row).eq('id',draftId)` |
| draft delete | `messages.delete().eq('id',draftId)` (discard: app.js:344; empty reply closed: app.js:336) |
| contacts after send | for each `to` address (not cc/bcc): existing → `update({use_count:+1, last_used_at, updated_at}).eq('id')`, else `insert({email, use_count:1, last_used_at})` (app.js:491-497) |
| templates | `insert({name, subject, text_body, created_by})`; `delete().eq('id')`; no update, `html_body`/`is_shared` never written (app.js:508) |
| signatures | if it is the new default: `update({is_default:false,updated_at}).eq('user_id',uid)` plus `.eq('account_id',acc)` or `.is('account_id',null)`; then `insert` or `update(row).eq('id')`. Row = `{user_id, account_id\|null, name, html_body, is_default, updated_at}`; `delete().eq('id')` (app.js:388-393) |
| filters | `insert({name, conditions, actions, created_by, active:true})`; `update({active, updated_at})`; `delete()` (app.js:513) |
| settings | see §7 |

Draft row (app.js:406):
```js
{ account_id, thread_id /*null for new*/, direction:'draft', folder:'drafts', from_address,
  to_addresses:[], cc_addresses:[], bcc_addresses:[], subject, text_body, html_body,
  preview: text.replace(/\s+/g,' ').slice(0,180), is_read:true, updated_at }
```
`account_id` comes from the chosen From address. If that fails, the client looks up `accounts.select('*').eq('is_primary',true).single()` (app.js:499).
Draft **attachments are never saved**: files stay in browser memory and are lost if the composer closes.
Autosave runs 900 ms after the last keystroke (app.js:398). `in_reply_to` is not stored on drafts, so a reopened draft loses it
(app.js:321 passes only `thread_id`).

**Client-side filters** (app.js:538-540): after every `loadAll` and on each realtime inbound INSERT, the app runs the active
`frankiflow_mail_filters` over `direction==='inbound' && folder==='inbox'` rows. It writes
`update({folder,is_read,is_starred,priority,is_pinned,[trashed_at],updated_at})` and label upserts. Shapes:
`conditions = {from_contains,to_contains,subject_contains,body_contains,account_address,has_attachment:'yes'|'no'|''}`,
`actions = {label_id?,folder?:'archive'|'spam'|'trash',is_read?,is_starred?,priority?:'high',is_pinned?,stop_processing?}`.
A new client must keep doing this (or drop it on purpose); no server filter runner is visible.

## 4. Sending (`send-mail` Edge Function)

**Request.** `POST {CONFIG.supabaseUrl}/functions/v1/send-mail` (= `CONFIG.sendFunctionUrl`). Two code paths:
- `supabase.functions.invoke('send-mail', { body })` (app.js:479), which adds the auth headers automatically;
- raw `fetch` with headers `Content-Type: application/json`, `apikey: <publishable key>`,
  `Authorization: Bearer <session.access_token>` (enh.js:424, 523-527).

JSON body (app.js:436, 479; handler:189-224):
```jsonc
{
  "fromAddress": "info@frankiflow.de",   // lower-cased server-side; must be an account visible via RLS, else 403
  "to": ["a@x.de"], "cc": [], "bcc": [],  // arrays of plain addresses (client splits on , and ;)
  "subject": "Re: …",                     // ≤998 chars, default "(no subject)"
  "text": "plain text", "html": "<p>…</p>",  // text ≤100000, html ≤900000 chars
  "thread_id": "<uuid>|null",             // omit/null → server creates a new thread row
  "in_reply_to": "<provider_message_id of the replied message>|null",
  "scheduledAt": "ISO|null",              // must be ≥ 60 s in the future
  "attachments": [{ "filename": "a.pdf", "content": "<base64, no data: prefix>",
                    "contentType": "application/pdf", "contentId": "ff-inline-…@frankiflow" /* inline images only */ }],
  "draft_id": "<uuid>"                    // sent by app.js but IGNORED by the server
}
```
- Attachments: at most **14** files, **8 MB** each, **18 MB** in total after decoding (handler:2-3, 21-39). The client skips files over 8 MB and
  refuses if the total exceeds 18 MB (app.js:396). Inline `data:image/*` imgs in the HTML are turned into attachments with `contentId`, and
  the `src` becomes `cid:<id>` (app.js:359-363). A meeting `.ics` is added as an attachment too (app.js:458-461).
  Base64 is built in 32 KB chunks (app.js:407-421).
- Reply threading: the client sends `thread_id: m.thread_id` and `in_reply_to: m.provider_message_id` (app.js:275-276, 294;
  enh.js:419-420). The server turns `in_reply_to` into the RFC id: if it is not already `<…>`, it looks up
  `messages.internet_message_id` by `provider_message_id`, then by `resend_email_id`. It sets `In-Reply-To` and
  `References` headers to that one id only (no full References chain) (handler:216-222, 236).
  Forward sends no `thread_id` (app.js:277), so it starts a new thread.
- Other action: `{ "action": "repair-attachments", "message_id": "<uuid>" }` recovers outbound attachments
  from Resend and never re-sends mail (att.js:60-62, handler:177-187). Any other `action` → 400.
- CORS allowlist (handler:4-10): `develop--frankiflow-mail.netlify.app`, `mail.frankiflow.de`,
  `v2--frankiflow-mail.netlify.app`, `localhost:3000`, `127.0.0.1:3000`. Any other origin (Netlify deploy previews,
  other ports) gets the develop origin echoed back, so the browser blocks the request.

**Responses.**
| HTTP | Body | Meaning |
|---|---|---|
| 200 | `{ok:true,id,thread_id,from,message_id,mail_message_id,scheduled_at,attachments_archived}` | delivered or scheduled. `id` = Resend id, `mail_message_id` = DB row id, `message_id` = RFC id (null when scheduled) |
| 200 | `{ok:true,id,mail_message_id,thread_id,warning,scheduled_at}` | delivered, but the DB status update failed; the row stays in **drafts**. Show the warning and do NOT retry |
| 502 | `{error,mail_message_id,delivery_unconfirmed:true}` | delivery unknown; staged draft and files kept. Do NOT auto-retry |
| 400 | `{error}` | bad JSON/body, `Recipient required`, invalid or too-early schedule, attachment invalid or too big, `Unknown mail action` |
| 401 | `{error:'Unauthorized'}` | missing or invalid JWT |
| 403 | `{error}` | `Mailbox access denied` (no active `frankiflow_mail_users` row), sender not visible, no sender assigned, RPC says no |
| 503 / 500 / 405 | `{error}` | provider not configured / unexpected / non-POST |

With `functions.invoke`, a non-2xx status arrives as `error` with the body in `error.context` (a Response).
app.js:479 shows only `error.message` and so loses `delivery_unconfirmed`. `edgeFunctionErrorMessage`
(app.js:542-547) shows how to read the body. The new client must parse it.

**What the server writes (the client must NOT repeat any of it)** (handler:223-271):
1. With no `thread_id`: `threads.insert({id, subject, last_message_at:now, message_count:1})` (no `normalized_subject`).
2. `messages.insert` of a staged row: `direction:'outbound', folder:'drafts'`, `from_address`/`reply_to` = account address,
   `from_name` = account display_name or "FrankiFlow", to/cc/bcc, subject, text, html, `in_reply_to` and `references_header` = the resolved RFC id,
   `preview` (180 chars), `is_read:true`, `has_attachments`.
3. For each file: `attachments.insert({id,message_id,filename,content_type,size_bytes,storage_path})`, then a storage upload.
4. After Resend accepts: `update({provider_message_id:id, resend_email_id:id, folder: scheduled?'scheduled':'sent',
   sent_at: scheduled?null:now, scheduled_at, updated_at})`, then `internet_message_id` (immediate sends only).
5. With an existing `thread_id`: `threads.update({last_message_at, message_count:+1})`.
On a definite provider rejection it deletes the staged row and files.

**What the client does after a successful send** (app.js:477-489): toast; if there was a draft,
`messages.delete().eq('id',draft_id).eq('folder','drafts')`; `rememberContacts(to)`; `loadAll()`. If those follow-up steps fail
it warns "do not resend". The dialog reply path (enh.js:404-434) skips the draft delete and the contacts step.
Meeting invite path: `fromAddress:'info@frankiflow.de'` is hard-coded, one request per attendee (enh.js:522-529).

**Recipient restrictions:** none on the server. It requires at least one `to` and accepts any external address. Only the **sender** is restricted
(account visible under RLS + `frankiflow_mail_can_send_from_account`). A reply excludes the user's own account addresses and `CONFIG.mailbox`
from its recipients (app.js:282-293).

**Scheduled send:** goes to Resend's `scheduledAt`; the row lands in `folder:'scheduled'` with `scheduled_at`. The app has no
cancel or reschedule, and nothing in this code moves the row to `sent` when it goes out.

## 5. Attachments

- Bucket: `frankiflow-mail-attachments` (private) (att.js:3, handler:1).
- Path: `${account_id}/${message_id}/${attachment_id}`, with no filename or extension in the path (handler:45). Only the server uploads.
  The browser never uploads to storage.
- Open/download: `storage.from(BUCKET).createSignedUrl(storage_path, 60, download ? { download: filename } : undefined)`.
  The URL is valid for 60 s. Open: call `window.open('about:blank')` first, synchronously, then `popup.location.replace(signedUrl)`.
  Download: a temporary `<a download>` (att.js:129-183).
- Delete: `storage.remove(paths)` before deleting the message rows (app.js:303).
- Missing files on an outbound message with `resend_email_id || provider_message_id` → offer "Recover" (`repair-attachments`).
- Limits: 8 MB per file, 18 MB in total, 14 files (server). Signature logo images are capped at 1.5 MB, inline as data URIs (app.js:391).

## 6. Realtime

- One channel `frankiflow-mail-live-${userId}`:
  `.on('postgres_changes', { event:'*', schema:'public', table:'frankiflow_mail_messages' }, handler)`, **with no filter**;
  RLS limits which rows arrive (app.js:698).
  - INSERT: add the row if it is new, reload its labels. If `direction==='inbound' && folder==='inbox'`, notify (toast,
    sound, browser Notification when no push subscription), then run the filters.
  - UPDATE: shallow-merge `payload.new` into the row (or prepend it if missing).
  - DELETE: remove by `payload.old.id` (needs the default replica identity; only the id is used).
- No subscriptions to labels, message_labels, attachments or settings.
- Fallback when it fails: `subscribe(status => status==='CHANNEL_ERROR' && toast('Live mailbox connection interrupted'))`.
  No retry or resubscribe. The data stays fresh anyway because every action calls `loadAll()`, there is a manual Refresh, and
  on `visibilitychange` to visible it refreshes if more than 120 s have passed and the browser is online (enh.js:644-649). Channel removed on sign-out (app.js:699).
- Web Push (out of SPEC scope): `POST /functions/v1/mail-push` with `{action:'config'|'subscribe'|'unsubscribe'|'test', …}` and Bearer + apikey
  (app.js:627-637). The SW shows `{title,body,tag,url}` and opens `data.url` (sw.js:56-86). The SW caches the app shell under `frankiflow-mail-dev-v21`.
- Other Edge Functions in use: `mail-ai` (app.js:371) and `mail-account-settings` `{accounts:[{address,display_name}]}` →
  `{accounts}` (app.js:548-555). This is the only way to change an account display name (the browser cannot write
  `frankiflow_mail_accounts`).

## 7. Settings and local storage

`frankiflow_mail_settings` is a single row per `user_id` with real columns, not a JSON blob. Save (app.js:556):
```js
const row = { user_id: uid, ...state.settings, ...patch, updated_at: now }; delete row.created_at;
supabase.from('frankiflow_mail_settings').upsert(row, { onConflict:'user_id' }).select().single();
```
That is, the full row merged with the changes. Values the UI writes: `theme 'system'|'light'|'dark'`, `density 'comfortable'|'compact'`,
`preview_pane 'right'|'off'`, `conversation_view`, `show_message_preview`, `mark_read_on_open`,
`default_sender_address`, `keyboard_shortcuts`, `signature_enabled`, `confirm_permanent_delete`, `notifications_enabled`,
`notification_sound`, `ai_enabled`, `ai_model` (`gemini-3.5-flash-lite|gemini-3.5-flash|gemini-3.8-flash`; the DB default
`gpt-5.6-luna` is replaced in the UI), `ai_tone`, `ai_language` (app.js:541). `signature_html` is only read, as the legacy fallback
signature when no signature rows exist (app.js:379). Absent or null settings mean the defaults (`!==false` checks everywhere).
clean.js:68-74 runs `update({notifications_enabled:true, updated_at}).eq('user_id',uid)` on **every page load**, overriding the user's choice.

SPEC `Settings` fields with **no column**: `readingPane:'bottom'`, `loadRemoteImages`, `undoSendSeconds`, `language`.
Keep them in localStorage (or fold `bottom` into `preview_pane`, which only the v2 client would understand). Map `readingPane`↔`preview_pane`,
`conversationView`↔`conversation_view`.

localStorage keys: `ffmail-last-login` (sec.js), `ffmail-theme` (read-only fallback, app.js:90; never written),
plus supabase-js's own session key (`sb-<project-ref>-auth-token`). v2 and legacy share an origin only if they are deployed on the
same host; they do not today.

## 8. Values in use and gotchas

**Distinct values written or read by the code**
- `folder`: `inbox, sent, scheduled, drafts, archive, spam, trash, snoozed` (`starred` is virtual, not stored). Inbound
  rows are created outside this repo; the default is `inbox`.
- `direction`: `inbound` (received), `outbound` (server send, **including staged/failed copies sitting in `drafts`**),
  `draft` (browser drafts). The SPEC `Message.direction` has no `'draft'`, so map it explicitly. Drafts are detected by
  `folder==='drafts' || direction==='draft'` (app.js:249).
- `priority`: only `normal` (default) and `high`. SPEC's `low` never occurs; writing it is new behaviour.
- `category`: `primary` (default), `clients`, `bookings`, `finance`. Written but never filtered on (the `state.category` UI is dead).
- Events `status`: `draft|sent|cancelled`; meetings `status`: `scheduled|cancelled`.

**Gotchas**
1. **No paging, 1000-row cap**: `limit(1000)` over every folder combined. Older mail silently disappears from every view, count and
   search. `nextBefore` paging in SPEC is new; use `created_at` (the only order the current app uses).
2. **Send errors lose the 502 body**: `functions.invoke` hides `delivery_unconfirmed`, so users see a generic error and resend,
   which duplicates the mail. Always parse the body, and never auto-retry on 502 or on a 200 that carries a `warning`.
3. **Staged sends live in Drafts**: until the status update finishes (or forever, if it fails), a sent mail is an
   `outbound` row in `drafts` and shows up in the Drafts list via realtime. Opening it opens the composer.
4. `draft_id` is ignored by the server; the client must delete the old draft itself (`.eq('folder','drafts')` guard).
5. `in_reply_to` must be the replied message's **`provider_message_id`**, not `internet_message_id` (although `<…>` values
   pass through). Drafts do not keep it.
6. Snooze wake-up happens only in the browser, inside `loadAll`. Nothing on the server un-snoozes, so a snoozed message stays
   `folder='snoozed'` in the DB until some client loads. Use the `effectiveFolder` rule.
7. Folder counts are totals except Inbox (unread). SPEC `counts()` asks for unread per folder, which is a deliberate change.
8. `has_attachments` can be stale; check `frankiflow_mail_attachments` rows.
9. Labels can be added but never removed in the current UI. Deleting a label does not touch `message_labels` from the browser.
   The label with `system_key='account_mail'` ("Mail") is hidden; an "Info" label is applied to inbound mail outside this repo.
10. Filters run in the browser, so they only fire while someone has the app open, and every open client runs them (duplicate upserts
    are harmless, folder moves are idempotent).
11. Moving to any folder except trash clears `trashed_at`. "Trash purged after 10 days" is UI text only; no purge code is in this repo.
12. `sec.js` and `clean.js` change the DOM via MutationObservers and hide the "Compose & reply", "Notifications" and "Mail
    accounts" settings sections, so the default sender and the notification toggles are effectively not user-editable today.
13. CORS: the v2 preview must run on `v2--frankiflow-mail.netlify.app` or `localhost:3000` to send.
14. No browser access to `frankiflow_mail_threads`; thread subject and counts come from the messages themselves. Server-created threads
    lack `normalized_subject`.
15. A user with no `frankiflow_mail_users` row can still sign in; only sending (403) and the password section reveal it.
