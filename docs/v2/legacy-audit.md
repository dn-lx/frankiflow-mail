# Legacy FrankiFlow Mail audit (input for the Next.js v2)

Audited code: `C:\Users\donal\Documents\frankiflow-mail-worktrees\integration` at `602972a` (= `origin/develop`). File references below (`app.js:296`) are to `assets/` in that checkout. Nothing in that repository was modified.

Screenshots: `C:\Users\donal\AppData\Local\Temp\claude\1a1c4426168ab61f\14060f4f-0e5c-416b-86cb-9d8278e9fd26\scratchpad\legacy-audit\` (34 PNGs). The names follow `<viewport>-<step>.png`. The viewports are `desktop-light` and `desktop-dark` (1440x900, Chromium), `tablet-768` (768x1024, Chromium) and `iphone13-webkit`. The steps are `01-login`, `02-inbox`, `03-message-thread`, `04-message-html`, `05-composer`, `06-settings` and `07-settings-scrolled`. Desktop also has `08-dblclick-dialog` and `09-meeting-scheduler`, and mobile has `06a-more-menu`.

How the stubbed run worked: a copy of the static files was served from `127.0.0.1`. A fake Supabase session was seeded in `localStorage` (`sb-<ref>-auth-token`). Playwright answered every `*.supabase.co` request (`/auth/v1/user`, `/rest/v1/frankiflow_mail_*`, `/functions/v1/mail-push`) with fake JSON. It also replaced `WebSocket` so Realtime never connected, and aborted non-GET requests to any other origin. Nothing reached Supabase. **The stubbed login worked:** inbox, reader, composer, settings, double-click dialog and meeting scheduler all rendered with fake data. Limits: no Realtime events, push is "not configured", and the headless locale was en-US.

The request log showed two things on page load: a `PATCH frankiflow_mail_settings` with no user action (see H4), and the full set of 10 table reads (see H2).

Counts: **11 high, 17 medium, 11 low.**

---

## High

**H1. Every small action re-renders the whole app and throws away what the user typed.**
- `patchMessage` ends in `renderApp()`, which replaces `#app.innerHTML` (`app.js:296`, `app.js:178`). Star, read and pin toggles all go through it.
- Every Realtime INSERT, UPDATE or DELETE also calls `renderApp()` (`app.js:698`), and so does every `loadAll` (`app.js:608`).
- Effects: text typed in the quick-reply box is wiped (`app.js:280`, `#quickReplyEditor`) as soon as any mail event arrives. The search field loses focus, the list scroll position resets, and every email iframe in the reader reloads.
- `moveMessage` renders twice: `patchMessage` → `renderApp`, then `loadAll` (`app.js:297`).
- v2 needs keyed, incremental list updates, and the reply draft must live outside the list render.

**H2. No pagination: up to 1000 full messages are fetched on every refresh.**
- `select('*')` pulls `html_body` and `text_body` for up to 1000 rows, plus 9 more tables, in one `Promise.all` (`app.js:593-604`). `message_labels` has no limit at all (`app.js:597`).
- This runs after every bulk action, move, send, label change and settings save (`app.js:242,297,305,489,501,503`).
- Search is client-side only (`app.js:118-147`). Mail older than the newest 1000 cannot be listed, searched or counted, and the app does not say so.
- Folder counts are computed from that window (`app.js:103-108`), so they are wrong for large mailboxes.
- The attachment flags need a second pass in chunks of 100 IDs (`app.js:576-587`).

**H3. Mail filters run in the browser, again and again.**
- `applyFilters` runs on every `loadAll` and on every Realtime insert (`app.js:538-540,608,698`).
- It loops over every Inbox message × every filter and sends **sequential** UPDATE and UPSERT requests (N+1). Errors are ignored.
- Because it runs again on every refresh, a message the user moved back to Inbox or marked unread gets moved or marked read again.
- Filters only run while somebody has the app open. Mail that arrives overnight stays unfiltered until a tab loads.
- v2: run filters once on the server at ingest.

**H4. Settings are overwritten in the background and partly hidden.**
- `settings-cleanup.js:69-74` sets `notifications_enabled=true` on **every page load**. This is the PATCH seen in the stub log.
- `settings-cleanup.js:2-12` hides the "Compose & reply", "Notifications" and "Mail accounts" sections by matching their English heading text. Users therefore cannot change:
  - default sender
  - automatic signature
  - confirm permanent delete
  - keyboard shortcuts
  - notification sound
  - device push (enable, test, disable)
- Save still reads the hidden controls and writes them back. It also calls the `mail-account-settings` edge function on every save, even when nothing changed (`app.js:541`, `app.js:548-555`).
- `account-security.js:240-246` deletes another section. Three whole-document MutationObservers implement all of this.

**H5. The app asks for notification permission on the user's first click.**
- `settings-cleanup.js:41-66`: the first `pointerdown` anywhere in the app clicks `#notifyBtn` in code. That triggers the browser permission prompt and push subscription (`app.js:696`, `app.js:658-676`).
- If permission was already granted, it re-subscribes 300 ms after every load.
- If the server has no VAPID keys, the user's first click produces an error toast ("Web Push server keys are not configured yet", `app.js:662`).

**H6. There are two separate meeting systems that do not share data.**
- **Sidebar "Meeting Scheduler"** (`enhancements.js:540-590`, table `frankiflow_mail_meetings`):
  - The organiser is hard-coded as `info@frankiflow.de` (`enhancements.js:511,526`), whoever is signed in.
  - It sends **one separate email per attendee** (`enhancements.js:522-529`).
  - The `.ics` has no SEQUENCE.
  - "Cancel meeting" sends no cancellation, asks for no confirmation, and ignores write errors (`enhancements.js:560-561`).
- **Settings → "Calendar & events"** (`app.js:454-472`, table `frankiflow_mail_events`) does REQUEST and CANCEL properly with SEQUENCE.
- The composer's meeting button is hidden by injected CSS (`enhancements.js:54`, `#meetingBtn{display:none!important}`).
- Screenshot: `desktop-light-09-meeting-scheduler.png`.

**H7. Double-clicking a message opens a second reader with its own reply composer.**
- A capture-phase double-click detector (`enhancements.js:622-638`) opens a modal conversation (`enhancements.js:436-479`).
- That modal has its own reply editor and send path: a direct `fetch` (`enhancements.js:404-434`). It has no draft autosave, no contact update, no size limits, its own address normalisation and its own date format.
- Esc or a click on the backdrop discards an unsent reply with no confirmation (`enhancements.js:473-476`).
- Its sticky reply box covers the conversation. In `desktop-light-08-dblclick-dialog.png` the header says "2 messages" but only one card is visible.
- The first click of the double-click has already marked the message read and re-rendered the app.

**H8. Email HTML handling leaks privacy and breaks on phones.**
- The sanitizer only removes a fixed list of tags and `javascript:` URLs (`app.js:37-53`, copied in `enhancements.js:169-185`).
- Remote images, remote CSS (`<link>`, `@import`, `url()`) and `<base href>` all load **automatically**. Tracking pixels therefore work and the reader's IP address leaks. There is no "load remote images" control.
- `data:` and `vbscript:` links are not blocked.
- The sandbox is `allow-same-origin allow-popups allow-popups-to-escape-sandbox` (`app.js:66`). It is safe today only because scripts are stripped and `allow-scripts` is absent. Adding `allow-scripts` later would turn this into full XSS against the Supabase session.
- Fixed-width newsletters are clipped on phones, with no way to scroll sideways. `iphone13-webkit-04-message-html.png` shows "Your spring cleaning o" cut off; the cause is iframe `overflow:hidden` plus a 640px table.
- The iframe height is capped at 5000px (`app.js:75`), so long mails are cut off.

**H9. On phones, most folders cannot be reached.**
- The mobile bottom nav has Inbox, Starred, Compose, Sent and More (`app.js:195`).
- "More" only offers Calendar, Settings, Refresh and Sign out (`app.js:211`).
- Drafts, Archive, Spam, Trash, Snoozed, Scheduled and labels are therefore unreachable on phones and on a 768px tablet (`tablet-768-06a-more-menu.png`).
- Drafts can only be reopened from the Drafts folder, so drafts are effectively lost on mobile.

**H10. Dark mode is broken on several surfaces.**
- Form inputs and selects are hard-coded white with dark text (`styles.css:19`, `.field input,.field select{background:#fff;color:#102a35}`). Settings in dark mode shows glaring white boxes (`desktop-dark-06-settings.png`).
- Attachment cards use `var(--panel,#fff)`, but `--panel` is never defined. In dark mode the card is white with light text, so the **filename is invisible** (`enhancements.js:34`; `desktop-dark-03-message-thread.png`).
- The primary Send and Save buttons use `--brand` `#0a2c3b` on the `#0d2530` dark surface, so they are almost invisible (`desktop-dark-05-composer.png`).
- The enhancement modals and the standalone view hard-code light colours (`enhancements.js:47-49`).
- The login screen ignores the theme.

**H11. Accessibility basics are missing.**
- Message rows are `<article>` elements with click handlers. They are not focusable and have no role or name (`app.js:248`), so keyboard users can only use J and K.
- Icon glyphs are text ligatures without `aria-hidden` (`app.js:30`). Screen readers read "edit_square Compose" and "more_vert".
- Several icon buttons have neither `aria-label` nor `title`: the reader star and more buttons, the list buttons, and the back button (`app.js:259`).
- Login labels are not tied to their inputs (`app.js:99`).
- `openModal` has no `role="dialog"` or `aria-modal`, no focus trap, no initial focus, no Esc to close and no focus return (`app.js:560`).
- Toasts have no `aria-live` (`app.js:29`).
- Cc and Bcc are `<a>` elements without `href`, so they cannot be reached with the keyboard (`app.js:311`).
- The command palette, popovers and context menu cannot be used with the keyboard: no arrow keys, no Enter, no Esc (`app.js:564,568,570`).

## Medium

**M1. Ctrl/⌘+K has two handlers.** `app.js:572` opens the command palette and `enhancements.js:640-642` focuses search; both fire. Pressing Escape in **any** input, including search, closes and saves an open composer (`app.js:572`).

**M2. Three whole-document MutationObservers run on every DOM change.**
- They are at `enhancements.js:659`, `account-security.js:309` and `settings-cleanup.js:397`.
- `decorate()` calls `standaloneView()`, which calls `auth.getSession` every time (`enhancements.js:481-497`).
- `?message=` deep links race: `app.js:695` removes the parameter while `enhancements.js:481` replaces `#app` with a standalone view. The next Realtime `renderApp` overwrites that standalone view.
- A push notification click calls `client.navigate`, which fully reloads the window (`sw.js:519-521`).

**M3. Compose has weak recipient handling and drops content.**
- To, Cc and Bcc are free text, split on `,;` with no chips and no validation (`app.js:26,311`).
- The link button uses `prompt()` and accepts any scheme (`app.js:317`).
- Forward drops attachments and the HTML body, and does not keep the From account (`app.js:277`).
- Quick reply sends the editor HTML **without** `sanitizeRichHtml` or inline-image extraction (`app.js:294`). The full composer does both (`app.js:433`).
- Closing a reply composer with an empty body silently deletes its draft (`app.js:334-339`).
- There is no undo-send.

**M4. Attachments have tight limits and no feedback.**
- Limits are 8 MB per file and 18 MB in total (`app.js:396`). Files are base64-encoded in memory into one JSON body (`app.js:407-421`), with no progress indicator.
- The double-click dialog path has no size limits at all (`enhancements.js:258-265,467`).

**M5. Labels can be added but not removed, and label clicks do the wrong thing.**
- The "Apply labels" dialog can only add labels (`app.js:503`). It sends sequential upserts per message × label and ignores errors.
- Label delete and template delete are also unchecked (`app.js:504,508`).
- Clicking a sidebar label only sets the search to `label:Name` and switches to **Inbox** (`app.js:213`), so archived labelled mail never shows.

**M6. Snoozed mail does not come back on time.**
- `wakeSnoozed` only runs when the mailbox loads (`app.js:575,608`), and there is no timer.
- "Later today · 18:00" silently becomes tomorrow when chosen after 18:00 (`app.js:474,501`).

**M7. Theme handling is inconsistent.**
- The topbar toggle only switches between light and dark, so "system" is lost. Its icon is always `dark_mode` (`app.js:189,217`).
- The theme only applies after the settings load, so the wrong theme flashes first.
- The "Preview pane: Right side" option still shows on phones, where it does nothing (`iphone13-webkit-06-settings.png`).

**M8. Threads always open in full, oldest first.**
- The reader shows the whole conversation oldest-first, with every message expanded and no collapsing of quoted history (`app.js:113,259`). On a phone the newest message is several screens down (`iphone13-webkit-03-message-thread.png`).
- Opening a thread only marks its representative row as read (`app.js:249`).
- `initials()` keeps punctuation, so "Anna (FrankiFlow)" becomes "A(" (`app.js:23`; `desktop-light-03-message-thread.png`).

**M9. Errors and loading states are inconsistent.**
- Many writes ignore errors (`app.js:503,504,508,575`; `enhancements.js:530,560,561`).
- Some errors use `alert()` (`enhancements.js:309,322,348,570,583`).
- `state.loading` is never rendered, and the `.skeleton` CSS is unused (`styles.css:32`). The first load shows a blank app until all 10 queries finish. A failed load leaves an empty shell with only a toast.

**M10. Archive and delete have no undo.** Archive, delete and move each show a 3-second toast with no undo button and no dismiss control (`app.js:29,297`). The keyboard shortcuts `E` and `#` act immediately.

**M11. Hard delete removes files before database rows.**
- `hardDeleteMessages` deletes the storage objects first and the database rows second (`app.js:303-304`). If the row delete fails, the message stays but its attachments are gone for good.
- "Empty trash" only sees trash inside the loaded 1000-message window (`app.js:307`).

**M12. Desktop layout wastes space and has several rendering bugs (`desktop-light-02-inbox.png`, `04`, `06`, `07`).**
- The list column is fixed at 470px (`styles.css:7,20`), so subjects truncate at about 35 characters while the reader has wide empty margins.
- The subject appears twice: once in the sticky header and again as a 30px H1 (`app.js:259`).
- The quick-reply "Reply all" and "Forward" icons stack vertically at the right edge.
- The search placeholder is cut off ("Search mail — try"), and is cut off on iPhone too.
- The sidebar "Meeting Scheduler" item has a permanent highlighted border, so it looks like the current folder (`enhancements.js:55`).
- In Settings, checkboxes sit in a 220px column far from their labels (`styles.css:29`).
- The Model select is truncated ("Gemini 3.5 Flash-Lite · low co").
- Save and Cancel are only reachable after scrolling the whole modal; the footer is not sticky (`desktop-light-07-settings-scrolled.png`).
- The composer covers the reader, and the shortcut tip line always takes up space, even on touch devices (`tablet-768-02-inbox.png`).

**M13. Text is too small and too faint.**
- Font sizes:
  - 9px: labels, thread count, template subtitles, mobile nav text, status pills
  - 10px: times, Cc/Bcc, draft status
  - 11px: previews, toasts, popovers, account buttons
  - (`styles.css:21-36`, `modern.css:27,194-195`)
- Contrast: `--muted` `#6d7e86` on white is about 4.2:1. `--muted-2` `#92a0a7` is about 2.6:1 and is used for placeholders, the unstarred star icon and empty states. Both fail WCAG AA for small text.

**M14. The mobile and tablet layout is fragile.**
- Layout heights use `100vh` (`styles.css:20,35`; `modern.css:118-120`), which breaks behind the iOS Safari toolbars.
- On phones the composer is a floating card above the still-visible bottom nav, not a full screen (`iphone13-webkit-05-composer.png`). The on-screen keyboard will cover the Send row.
- 768px tablets get the single-column phone layout with large empty areas (`tablet-768-02-inbox.png`, `tablet-768-04-message-html.png`).
- Hover lift effects (`translateY`) are applied on touch devices.

**M15. The installed app does not work offline.**
- `sw.js` only caches same-origin files (`sw.js:476`).
- The app's own Supabase client is loaded from `esm.sh` (`supabase-client.js:1`), and fonts and icons come from Google. On a cold offline start the app fails to boot, and icon ligatures show as words.

**M16. Selection behaves inconsistently.**
- The "select all" checkbox never shows a partial state and is not reset after bulk actions (`app.js:190,210`).
- Quick-filter chips only take effect below 820px (`app.js:151`), so resizing the window changes what the list shows.
- Selecting a folder silently clears the selection.

**M17. The settings page is inconsistent.**
- The sender identity section loads a remote logo from `frankiflow.de` (`app.js:541`), but `account-security.js` removes that section anyway.
- The page lists features that are hidden (H4) and claims "Live mailbox updates are enabled" even when Realtime fails.

## Low

- **L1.** Unread-count title logic exists twice (`app.js:35` and `enhancements.js:107-113`).
- **L2.** Date formats differ by screen:
  - List: "09:10 PM"
  - Reader: "Nov 26, 2026, 7:30 PM"
  - Dialog: "11/26/2026, 9:10:24 PM", with seconds (`enhancements.js:396`)
  - Meetings: `en-GB`, Europe/Berlin
- **L3.** The "Development" badge shows on localhost and develop (`enhancements.js:115-123`). Fine, but v2 needs one environment indicator.
- **L4.** The More menu's "Category: Clients / Bookings / Finance" sets a `category` field that nothing displays or filters (`app.js:273`; `state.category` is unused).
- **L5.** The quick-filter chips "Info" and "Mail" are hard-coded to `info@`/`mail@frankiflow.de` (`app.js:157-160`). `account-security.js:302` then removes the "Mail" chip.
- **L6.** Print calls `window.print()` on the whole app shell, and there is no print stylesheet (`app.js:272-273`).
- **L7.** The manifest only has an SVG icon marked "any maskable", and there is no `apple-touch-icon`. The iOS home-screen icon is poor (`manifest.webmanifest`, `index.html`).
- **L8.** Gemini model names are hard-coded in the client (`app.js:371,541`).
- **L9.** Opening the composer always shows "Saving…" because inserting the signature triggers autosave (`app.js:379,398`). This does not affect the data.
- **L10.** The login form prefills the last-used email from `localStorage` (`account-security.js:294-297`). It also overrides the default mailbox email, and has no "forgot password" link.
- **L11.** Some code is dead or duplicated: two sanitizers, two `icsEscape`/`icsUtc`, two schedule-time helpers and two reply-target functions (`app.js` vs `enhancements.js`). See the existing `CLEAN-CODE-AUDIT.md` F05, F06 and F13.

---

## What v2 must keep (features users rely on)

- **Folders:** Inbox, Starred, Snoozed, Sent, Scheduled, Drafts, Archive, Spam and Trash, with unread and folder counts and an unread count in the tab title. Trash purges after 10 days, with Restore and "Delete forever" behind a confirmation. **All folders must be reachable on mobile.**
- **Several sender accounts:** `info@` and `mail@frankiflow.de`, with display names, a default sender and per-account labelling of inbound mail (Info and Mail).
- **Conversation view:** with a "single messages" toggle, thread count badges, pinned items first, and ordering by received date.
- **Power search:** `from:`, `to:`, `subject:`, `is:unread/read/starred/pinned/important/muted`, `has:attachment`, `in:`, `before:`, `after:` and `label:`. This needs to move server-side.
- **Message actions:** star, pin, high priority, mark read or unread, snooze (presets and a custom time), archive, spam and not-spam, move to trash, and labels with colours. All are available per message, from a right-click menu and as bulk actions.
- **Compose:**
  - From selector, Cc and Bcc, contact autocomplete
  - Rich text (bold, italic, underline, lists, links), templates
  - Signatures per sender, including an embedded logo image, inserted automatically
  - Draft autosave, file attachments, pasted inline images (sent as `cid:`)
  - Scheduled send: later today, tomorrow morning, or a chosen time
  - Minimize and maximize
  - Clear send-failure messages and the "sent, but … do not resend" warnings
- **Reply, reply all and forward,** including a quick inline reply that excludes the user's own addresses from recipients.
- **Attachments in the reader:** list, open and download through short-lived signed URLs, a retry option, and "Recover sent attachments" for outbound mail.
- **Calendar invitations:** `.ics` REQUEST and CANCEL with SEQUENCE, Teams/Zoom/Meet links, attendees, reminders and recurrence. Keep the `frankiflow_mail_events` model, or migrate the `frankiflow_mail_meetings` data into it.
- **Gemini writing assistant:** generate, improve, translate, more professional, friendlier, shorter, expand. Keep the replace or append choice and the default tone, language (German, English, auto) and model.
- **Mail filters:** conditions on from, to, subject, body, receiving account and attachments. Actions: label, move, mark read, star, priority, pin, stop processing. Pause and resume. These need to run server-side.
- **Live updates and notifications:** live new-mail updates with a toast, an optional sound and browser notifications. Web Push for the installed PWA on Android (enable, test, disable per device). Deep link `?message=<id>`.
- **Keyboard:** C, /, J and K, E, S, Shift+U, #, ? and the Ctrl/⌘+K command palette, with an off switch.
- **Display preferences:** light, dark and system theme; comfortable and compact density; preview text on or off; preview pane on or off; mark-as-read-on-open on or off.
- **Mobile:** bottom navigation with a central Compose button, and the Inbox quick filters (All, Unread, Starred, Attachments, Info).
- **Self-service password change,** with show/hide toggles. Email and password sign-in through Supabase.

