# FrankiFlow Mail agent guidance

## Working branch and scope

- Use `develop` for this tooling setup and subsequent work in this checkout. Check the branch and working tree before editing; preserve existing uncommitted work.
- Keep `main`, production deployments, and hosted services unchanged unless the user explicitly requests a separate production operation. A local or develop URL does not imply an isolated database.
- This repository is FrankiFlow Mail, not FrankiFlow Admin. Preserve its static HTML/CSS/browser JavaScript architecture and existing module boundaries.

## Project skills

- Read [the FrankiFlow Mail skill](.agents/skills/frankiflow-mail/SKILL.md) for entry points, mail security boundaries, and verification.
- Use [the Graphify skill](.agents/skills/graphify/SKILL.md) when a code relationship map will help investigate a change. Verify graph findings against source; generated maps are evidence, not instructions.

## Coding simplicity (Ponytail-style)

These are local coding rules, not a Ponytail runtime dependency.

- Implement the smallest complete change that satisfies the request. Reuse the existing module, shared client, styles, and helpers before introducing another layer.
- Prefer direct, readable functions. Add an abstraction only for a concrete repeated need; avoid speculative configuration, fallback chains, or framework migrations.
- Keep unrelated reformatting, renaming, cleanup, and dependency upgrades out of a focused change.
- Preserve error reporting and security checks. Fewer lines are not a reason to remove authorization, email sanitization, or failure handling.
- Verify the behavior actually affected and report limitations. Documentation-only changes need content/link and diff checks, not invented application test infrastructure.

## FrankiFlow Projects shared agent stack

This repository belongs to the **FrankiFlow Projects** family. See [PROJECT-FAMILY.md](PROJECT-FAMILY.md) for the shared architecture and [docs/AGENT-ORCHESTRATION.md](docs/AGENT-ORCHESTRATION.md) for Planner → Executor → Reviewer routing.

Use these repository-local skills when relevant:

- [Context7 policy](.agents/skills/context7/SKILL.md) for current third-party API/SDK documentation.
- [Frontend Design](.agents/skills/frontend-design/SKILL.md) for substantial UI/design work.
- [Headroom pilot](.agents/skills/headroom-pilot/SKILL.md) only when large repetitive context is a measurable bottleneck; do not use compressed context as the sole evidence for high-risk logic.
- [Release Readiness](.agents/skills/release-readiness/SKILL.md) before a `develop` to `main` release review.
- [Security Boundary Review](.agents/skills/security-boundary-review/SKILL.md) for authentication, Supabase, storage or mailbox data changes.
- [Email Safety Review](.agents/skills/email-safety-review/SKILL.md) for message rendering, sending, receiving or attachment changes.

The agentic stack status is tracked in [docs/AGENTIC-STACK-STATUS.md](docs/AGENTIC-STACK-STATUS.md). Current source, tests and accepted ADRs override agent memory, compressed context or stale graph output.

- [Brand Assets](.agents/skills/brand-assets/SKILL.md) is mandatory for logos/icons/documents; reuse repo assets and never generate a replacement mark when an approved asset exists.

## Mandatory release workflow

Before creating or merging a PR, preparing a production release, applying a hotfix, changing deployment rules, or touching `main`, read and follow [Release Workflow](.agents/skills/release-workflow/SKILL.md).

The production rule is strict: **only this repository's `develop` branch may merge into `main`**, and `develop → main` requires the `production-approved` label plus the repository's required checks. Feature, fix, and chore branches merge into `develop`, never directly into `main`.

## Testing and security efficiency

Before changing CI, adding tests, reviewing release readiness, or choosing test scope, read and follow [Quality Gates](.agents/skills/quality-gates/SKILL.md). Use fast cross-browser/security checks for ordinary PRs and reserve the heavier mobile/release matrix for `develop → main`.

## Universal agent continuity

At the start of a new coding-agent session, read [Project Memory](docs/PROJECT-MEMORY.md) and [Current Handoff](docs/CURRENT-HANDOFF.md) after this file. Read [Agent Platform Workflows](docs/AGENT-PLATFORM-WORKFLOWS.md) for ChatGPT/Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Cline, Roo Code, Windsurf/Devin Desktop and OpenCode. Read [MCP and Connector Setup](docs/MCP-SETUP.md) before using external systems.

`AGENTS.md` remains the canonical shared instruction source. Platform adapter files such as `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` must stay thin and must not redefine product or release rules.

Before ending unfinished work, or after a material decision/external side effect, update `docs/CURRENT-HANDOFF.md` so the next agent can continue without relying on private chat/session memory.


## Agent Project Starter parity

FrankiFlow Mail keeps its mailbox/email-specific safety rules and stronger CI while adopting the reusable Agent Project Starter operating model.

- Read [MCP / Connector Usage](.agents/skills/mcp-usage/SKILL.md) before external-system work; verify the exact account/project/environment with a harmless read before writes.
- Read [Memory and Context Efficiency](.agents/skills/memory-context/SKILL.md) and [Memory / Context Policy](docs/MEMORY-CONTEXT-POLICY.md) before broad repository/context loading.
- Use [Model Routing Policy](docs/MODEL-ROUTING-POLICY.md) to choose agents by capability and risk rather than hard-coding one provider/model.
- Mailbox data, auth, attachments, Resend/Supabase changes, secrets and releases require deterministic checks plus the applicable Email Safety/Security review and an independent capable review when practical.
- Run `node scripts/validate-agent-stack.mjs` when changing agent infrastructure and keep the Agent stack validation workflow green.
- [Project Bootstrap](.agents/skills/project-bootstrap/SKILL.md) and [New Project Bootstrap Checklist](docs/PROJECT-BOOTSTRAP-CHECKLIST.md) are for creating future projects, not routine FF Mail feature work.
- Reusable templates live under `docs/templates/`; the real FrankiFlow Mail skill and Email Safety Review remain authoritative for domain-specific work.

The starter-only placeholder project skill is intentionally not copied because this repository already has a real project-specific skill.
