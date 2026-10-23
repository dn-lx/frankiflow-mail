# Existing mail app: Sent attachment fix

This change applies to the original static app hosted at `mail.frankiflow.de`. It does not migrate the site to Next.js.

## Fixes

The main reader now loads each message's attachments directly when rendering that message. It no longer depends on a separate DOM observer's remembered message/card count, or on positional matching between two independently ordered message arrays. Rebuilding the reader after starring, refreshing, or opening the same conversation reloads its files. The conversation dialog and standalone reader use the same attachment renderer.

Stored attachment metadata also drives paperclip icons and `has:attachment` search. A stale `has_attachments: false` flag on a sent message no longer hides its stored files. Summary requests are batched and optional; a permissions or network failure does not prevent the mailbox from loading.

Cards render before requesting signed links. A new short-lived signed URL is requested when the user opens or downloads a file, and a signing failure leaves the filename visible with an error and a working retry. Metadata failures offer Retry. A message indicating attachments but having no stored file rows displays an explicit diagnostic. Detached/stale async renders cannot insert cards into a replacement reader. Filenames are inserted with textContent.

Sending waits for an in-progress draft autosave before capturing the draft ID. Pending autosave timers are canceled while sending, compose controls lock during preparation/delivery, and file-read failures unlock the composer with its contents intact. A successful send stays successful when draft cleanup, contact updates, calendar bookkeeping, or mailbox refresh fails; warnings explain the failed follow-up without prompting duplicate delivery. Auth callbacks defer database work until the Supabase auth lock is released. The PWA cache version includes the new shared renderer.

## Validation

Run from the existing checkout, without creating a worktree:

```sh
node --check assets/app.js
node --check assets/enhancements.js
node --check assets/mail-attachments.js
node --check sw.js
python3 -m http.server 8128 --bind 127.0.0.1
# In a second terminal:
node tests/classic-attachments.mjs
```

The browser runner needs Playwright 1.64.1 and Chromium. It can use an isolated installation without changing the static application's dependencies:

```sh
npm install --prefix /tmp/frankiflow-mail-tests --no-package-lock --no-audit --no-fund playwright@1.64.1
/tmp/frankiflow-mail-tests/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/frankiflow-mail-tests/node_modules/playwright CHROMIUM_PATH="$(node -p 'require("/tmp/frankiflow-mail-tests/node_modules/playwright").chromium.executablePath()')" node tests/classic-attachments.mjs
```

Tests run the actual classic frontend with a synthetic, authenticated Supabase client. They exercise correct Sent/thread attachment placement, rerenders, stale metadata flags and search, signing and metadata failures, missing archived files, file-read failure/retry with exact binary bytes, the autosave/send race, post-delivery warnings, and synchronous auth callbacks. They do not send real mail or prove live Supabase permissions or backend archival. The GitHub workflow installs Chromium and runs the same checks.

## Deployment and remaining live check

The repository documents `develop` as the testing branch, with production releases on `main`. Test this fix through `develop` before releasing it to `main`. Keep the Next.js `v2` branch separate. Production JavaScript inspected during diagnosis still contained the older FileReader-based attachment encoder; GitHub main already contained the newer binary encoder. A Git push alone does not establish that Netlify deployed it.

After deployment, use an authorized test mailbox to send a small known file, open Sent, download it, star the message, refresh, and check the attachment again after a fresh sign-in. Compare the downloaded bytes with the original.

If the stored files are still absent, inspect the deployed Supabase `send-mail` function. It must store outgoing bytes in `frankiflow-mail-attachments` and create `frankiflow_mail_attachments` rows whose message_id is the internal sent message ID, not the provider ID or discarded draft ID. The frontend cannot recover historical files that were never archived. That function's source and live administrative access are not present in this checkout; do not claim the backend is repaired without verifying it.
