# FrankiFlow Mail

Modern internal webmail for `info@frankiflow.de`.

## Branches
- `main` — production-ready releases only.
- `develop` — active development and ShipStatic preview.

## Stack
- Static HTML/CSS/JavaScript frontend
- Supabase Auth + Postgres
- Supabase Edge Functions
- Resend transport
- ShipStatic development hosting

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

## Security
Frontend uses only the Supabase publishable key. Mail data is protected with Row Level Security and the send Edge Function requires an authenticated authorized FrankiFlow mail user. Resend secrets must remain server-side in Supabase function secrets.
