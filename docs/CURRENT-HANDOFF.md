# Current Handoff

**Last updated:** 2026-09-22

## Current baseline

The repository uses a universal multi-agent workflow. `AGENTS.md` is the canonical instruction source, with thin adapters for Claude Code, Gemini CLI and GitHub Copilot plus documented workflows for ChatGPT/Codex, Cursor, Cline, Roo Code, Windsurf/Devin Desktop and OpenCode.

The production rule remains unchanged: feature/fix/chore -> `develop`; only approved `develop -> main` releases may touch production.

## External backend change completed on 2026-09-22

The shared Supabase Edge Function `receive-mail` in project `bdeajozhylypiidrldka` was updated from version 19 to version 21 to fix inbound mailbox routing.

This repository intentionally does not contain local Edge Function source, so the deployed backend change is recorded here for continuity.

### Problem

Resend receives mail through the shared transport address `mail@inbound.frankiflow.de`. Some replies were successfully delivered to the `receive-mail` webhook but were ignored by the database importer because the transport address canonicalized to the unconfigured alias `mail@frankiflow.de`.

### Fix

The deployed `receive-mail` function now resolves the mailbox in this order:

1. Exact mailbox aliases from Resend webhook `data.received_for`.
2. Explicit recipient/header candidates.
3. The mailbox/account inherited from the parent message referenced by `In-Reply-To` / `References`.
4. For the shared transport address only, the configured primary mailbox as a final fallback.

When the visible recipient is only the shared transport address, the stored `to_addresses` value is normalized to the resolved mailbox address.

The existing duplicate check on `resend_email_id`, webhook signature verification, server-side secrets, attachment limits and attachment storage behavior remain unchanged.

## Verification completed

Two previously missed inbound messages were replayed through the corrected Resend webhook:

- A threaded reply was stored as `info@frankiflow.de` in the Inbox with the correct sender, recipient and thread.
- A direct inbound message was stored as `info@frankiflow.de`; its PDF attachment was also persisted successfully in `frankiflow_mail_attachments`.

Both replay deliveries returned HTTP 200 from the webhook endpoint.

Future inbound events now have an authoritative `received_for` alias available for routing, so mail sent for `info@frankiflow.de` no longer depends on the shared transport address alone.

## Important note

Older inbound messages that were previously ignored are not all automatically backfilled. Only the two messages used for verification were replayed. If historical mailbox completeness is required, backfill the remaining missing `email.received` events deliberately to avoid generating a burst of historical push notifications.

## Next-agent startup

1. Read `AGENTS.md` and `docs/PROJECT-MEMORY.md`.
2. Inspect open PRs/issues and recent commits after 2026-09-22.
3. Treat the deployed `receive-mail` version 21 behavior above as the current backend routing baseline.
4. If changing inbound routing again, preserve Resend signature verification, idempotency, mailbox authorization boundaries, attachment safety limits and exact-alias routing.
5. Keep production changes on the required `develop -> main` release path.


## Agent Project Starter alignment — 2026-09-22

Agent infrastructure was aligned with `dn-lx/agent-project-starter` without changing FrankiFlow Mail runtime behavior. Added model-routing and memory/context policy, MCP and memory-context skills, bootstrap guidance, agent-stack validation, stronger PR evidence, reusable templates and an agent-independent engineering ADR. Existing mailbox/email-safety rules and stronger CI/security/release checks were preserved. `main` is not part of this change.
