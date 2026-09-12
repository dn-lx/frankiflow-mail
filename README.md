# FrankiFlow Mail

Modern internal webmail for `info@frankiflow.de`.

## Branches
- `main` — production-ready releases only.
- `develop` — active development.
- Feature branches should merge into `develop` for testing before production.

## Environments
- Development: https://mail-frankiflow.shipstatic.com
- Production target: https://mail.frankiflow.de

Every push or merge into `develop` is deployed automatically to the permanent ShipStatic development URL through GitHub Actions.

## Stack
- Static HTML/CSS/JavaScript frontend
- Supabase Auth + Postgres
- Supabase Edge Functions
- Resend transport
- ShipStatic development hosting
- Progressive Web App support

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
Frontend uses only the Supabase publishable key. Mail data is protected with Row Level Security and the send Edge Function requires an authenticated authorized FrankiFlow mail user. Resend secrets must remain server-side in Supabase function secrets.

The development deployment is marked `noindex` and ships with defensive browser headers. Production email DNS and the IONOS mailbox remain separate from this development frontend until the production mail migration is explicitly completed.
