# FrankiFlow Mail

Modern internal webmail for FrankiFlow team and shared company mailboxes.

## Branches
- `main` — production-ready releases only.
- `develop` — active development.
- Feature branches should merge into `develop` for testing before production.

## Environments
- Development: https://mail-frankiflow.shipstatic.com
- Production target: https://mail.frankiflow.de

## Stack
- Static HTML/CSS/JavaScript frontend
- Supabase Auth + Postgres
- Supabase Edge Functions
- Resend transport
- ShipStatic development hosting
- Progressive Web App support

## Account model
- Each person can have an individual `@frankiflow.de` login and mailbox, for example `first.last@frankiflow.de`.
- Each login uses its own Supabase Auth password.
- Users can change their own password from FrankiFlow Mail settings.
- Administrators can create new FrankiFlow Mail users and set a temporary password from Settings.
- New personal users receive their own personal mailbox and access to the shared `info@frankiflow.de` mailbox.
- Mailbox visibility and send permissions are enforced server-side with per-user account mappings and Row Level Security.
- `mail@frankiflow.de` is no longer a configured mailbox account.

## Mail features
- Threaded inbox and conversation reader
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

## Security
Frontend uses only the Supabase publishable key. Mail data is protected with Row Level Security and the send Edge Function requires an authenticated authorized FrankiFlow mail user with access to the chosen sender mailbox. Resend secrets remain server-side in Supabase function secrets.

The development deployment is marked `noindex`. Production email DNS and the IONOS mailbox remain separate from the development frontend until the production mail migration is explicitly completed.
