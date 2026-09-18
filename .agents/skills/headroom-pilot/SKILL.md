---
name: headroom-pilot
description: Define the controlled Headroom context-compression pilot for FrankiFlow Mail. Use only for large repetitive context where exact raw source is not the primary safety boundary.
---

# Headroom Pilot — FrankiFlow Mail

Headroom is an optional agent-host optimization, not an application/runtime dependency. The repository records the policy; installation/configuration lives in Cursor, Codex or another MCP-capable coding environment.

Official references: https://docs.headroomlabs.ai/docs/mcp and https://docs.headroomlabs.ai/docs/proxy

## Good pilot use cases

- large repetitive logs or CI output,
- broad repository discovery,
- long search/Graphify results,
- generated documentation and repetitive tool payloads.

## Do not default to compressed context for

Mailbox authorization/RLS, authentication, account-security code, send/schedule contracts, message sanitization, migrations, or exact email transport behavior.

For those tasks, inspect the original source, provider contracts and tests directly.

## Pilot metrics

Measure context/token volume, time to a correct plan, agent retries, source rereads, CI/review corrections and factual/contract mistakes. Keep the pilot only if it reduces context/cost/time without increasing rework or missed facts.

## Operating rule

Source/tests/ADRs override compressed context. Do not commit Headroom caches, compression stores or local configuration containing secrets.
