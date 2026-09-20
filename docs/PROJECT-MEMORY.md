# Project Memory — FrankiFlow Mail

## Identity

FrankiFlow Mail (FF Mail) is the company mail/PWA product in the FrankiFlow Projects family. It is distinct from FrankiFlow Admin.

## Durable rules

- GitHub is the engineering source of truth.
- `develop` is the development integration branch; `main` is production.
- Feature/fix/chore branches merge into `develop`, never directly into `main`.
- Preserve the current static HTML/CSS/browser JavaScript architecture and existing module boundaries unless a migration is explicitly approved.
- Preserve authorization, email sanitization, message rendering safety, attachment handling and failure reporting.
- Mailbox/customer data is sensitive; avoid logging message bodies, credentials or private content.
- A local/develop frontend does not prove backend or mailbox isolation. Verify the target before writes.
- Runtime secrets and credentials never belong in source control.

## Read before specialized work

- Project skill: `.agents/skills/frankiflow-mail/SKILL.md`
- Email Safety Review for rendering/sending/receiving/attachments
- Security Boundary Review for auth/Supabase/storage/mailbox data
- Release Workflow and Quality Gates before merges/releases
- `PROJECT-FAMILY.md` and `docs/AGENT-ORCHESTRATION.md`

## Continuity rule

Durable mail/security/architecture decisions belong here, in ADRs, or in Agent Skills. Temporary task state and external side effects belong in `docs/CURRENT-HANDOFF.md`. Agent chat memory is supplementary only.
