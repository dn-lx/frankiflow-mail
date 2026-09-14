# FrankiFlow Mail

Modern internal webmail for FrankiFlow team and shared company mailboxes.

## Branches
- `main` — production-ready releases only.
- `develop` — active development and Netlify testing.
- Feature branches should merge into `develop` for testing before production.

## Environments
- Development: https://develop--frankiflow-mail.netlify.app
- Production: https://mail.frankiflow.de

## Stack
- Static HTML/CSS/JavaScript frontend
- Supabase Auth + Postgres
- Supabase Edge Functions
- Resend transport
- Netlify hosting for development and production
- Progressive Web App support

## Account model
- Each person can have an individual `@frankiflow.de` login and mailbox, for example `first.last@frankiflow.de`.
- Each login uses its own Supabase Auth password.
- Users can change their own password from FrankiFlow Mail settings, including show/hide password controls.
- Mailbox/user administration is intentionally not exposed in the normal Mail settings UI.
- Personal users can receive their own personal mailbox plus access to the shared `info@frankiflow.de` mailbox.
- Mailbox visibility and send permissions are enforced server-side with per-user account mappings and Row Level Security.
- `mail@frankiflow.de` is no longer a configured mailbox account.

## Mail features
- Threaded inbox and conversation reader
- One inbox/list row per conversation thread while the reader shows the full message history
- Rich-text composer with CC/BCC and attachments
- Draft autosave
- Scheduled send via Resend
- Snooze
- Star, pin, priority, archive, spam and trash
- Bulk actions
- Categories: Primary, Clients, Bookings and Finance
- Custom labels
- Power search (`from:`, `to:`, `subject:`, `is:`, `has:attachment`, `label:`)
- Email templates and signatures
- Contacts / recipient suggestions
- Mail filters
- Keyboard shortcuts and command palette
- Dark/light themes and compact density
- Responsive mobile layout
- Installable PWA shell with network-first refresh behavior
- Online/offline connection awareness
- Automatic refresh after returning to a stale browser tab
- Notifications are enabled in the app by default; the browser/OS permission prompt is still controlled by the device.

## Security
Frontend uses only the Supabase publishable key. Mail data is protected with Row Level Security and the send Edge Function requires an authenticated authorized FrankiFlow mail user with access to the chosen sender mailbox. Resend secrets remain server-side in Supabase function secrets.

The `develop` branch is the testing environment and should be checked on Netlify before merging to `main`. Production remains on `main` and `mail.frankiflow.de`.
