# FrankiFlow Mail

FrankiFlow's internal webmail, rebuilt as a Next.js application.

## Branches
- `main` — production-ready releases only.
- `develop` — active development and Netlify testing.
- Feature branches merge into `develop` first.

## Stack
- Next.js App Router + React + TypeScript
- Supabase Auth + Postgres + RLS
- Supabase Edge Functions
- Resend transport
- Netlify

## Development
```bash
npm install
npm run dev
npm run build
```

Public Supabase URL/publishable key may be supplied with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never expose service-role credentials.

## UI architecture
The UI follows the Agent Project Starter frontend principles: coherent design tokens, accessible hierarchy, responsive desktop/mobile layouts, reduced-motion support, focused interaction design, and verification-friendly states.

Drafts are a first-class mailbox folder. Rows with `folder = 'drafts'` and `direction = 'draft'` appear in the sidebar/list and can be reopened in the composer.

## Safety
Sending still goes through the existing authenticated `send-mail` Edge Function. The frontend never contains a Resend key or Supabase service-role key.
