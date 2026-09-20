# Agent Platform Workflows

This repository is designed to survive changes of coding agent. `AGENTS.md` is the canonical shared instruction file; platform-specific files only bootstrap the agent into the same workflow.

## Authority order

1. Current source code and tests.
2. `AGENTS.md` and applicable repository Agent Skills.
3. Accepted ADRs and current architecture/product documentation.
4. `docs/PROJECT-MEMORY.md` for durable project context.
5. `docs/CURRENT-HANDOFF.md` for recent/unfinished work.
6. Tool output, code graphs and agent/session memory as supporting evidence only.

If an adapter conflicts with `AGENTS.md`, follow `AGENTS.md`.

## Common workflow for every coding agent

1. Read `AGENTS.md`, `docs/PROJECT-MEMORY.md`, and `docs/CURRENT-HANDOFF.md`.
2. Inspect the current branch, working tree, open PRs/issues relevant to the task, and recent commits.
3. Start ordinary implementation work from `develop` on a focused feature/fix/chore branch.
4. Read the relevant `.agents/skills/` instructions before sensitive or specialized work.
5. Make the smallest complete change; do not mix unrelated cleanup.
6. Run the repository's documented checks. Never weaken a check merely to get green CI.
7. Use an independent reviewer for security, auth, payments, data-model, privacy, or release-sensitive work.
8. Merge feature/fix/chore branches only into `develop`.
9. Never merge directly into `main`. A production release is a separate `develop -> main` operation governed by the Release Workflow and approval rules.
10. Update `docs/CURRENT-HANDOFF.md` when work is unfinished, a material decision changed, or the next agent would otherwise have to rediscover state.

## ChatGPT / OpenAI Codex

- Codex reads `AGENTS.md` automatically. Treat it as the primary persistent project instruction source.
- In ChatGPT Work or a connected coding environment, verify GitHub and any required app/plugin access before assuming a connector is available.
- Use repository Agent Skills for repeatable specialist workflows.
- For complex tasks, follow the repository Planner -> Executor -> Reviewer routing.
- Before finishing, report files changed, checks run, limitations, PR/branch state, and update the handoff if needed.

## Claude Code

- `CLAUDE.md` is the Claude bootstrap. It deliberately points back to `AGENTS.md` rather than duplicating project rules.
- At session start, verify the active repository and branch, then read the shared memory/handoff docs.
- Configure MCP servers in the Claude environment when external systems are required; never commit tokens or private credentials.
- Use a fresh review pass/session for sensitive changes where practical.

## Gemini CLI

- `GEMINI.md` is the Gemini bootstrap and imports the canonical shared context.
- Use `/memory show` when you need to confirm what persistent context Gemini loaded.
- Use `/mcp list` before relying on external MCP capabilities.
- Keep durable decisions in repository docs rather than Gemini's session history.

## GitHub Copilot

- Repository-wide bootstrap lives in `.github/copilot-instructions.md`.
- Copilot agents may also read `AGENTS.md`; `AGENTS.md` remains canonical.
- Use GitHub-native PR checks and reviews as evidence. Do not treat generated code as reviewed merely because Copilot authored it.

## Cursor

- Cursor reads root `AGENTS.md` automatically; no duplicate Cursor rule is needed for the common workflow.
- Add `.cursor/rules/` only for genuinely conditional/path-specific rules. Do not copy the whole `AGENTS.md` into Cursor rules.

## Cline

- Cline supports `AGENTS.md` as a cross-tool workspace rule, so use the shared file directly.
- Add `.clinerules/` only when a rule must be conditional or Cline-specific.

## Roo Code

- Roo Code loads root `AGENTS.md` by default.
- Use `.roo/rules/` or mode-specific rules only for behavior that is truly Roo/mode specific; do not duplicate universal rules.

## Windsurf / Devin Desktop Cascade

- Root and directory-level `AGENTS.md` are supported as durable rules.
- Prefer repository rules/skills over auto-generated local memories for knowledge that must survive machines or agent changes.
- Add product-specific workflows/rules only when they automate a repeatable task not already covered by Agent Skills.

## OpenCode

- OpenCode reads `AGENTS.md` as persistent project instructions.
- Keep the universal rules there; use OpenCode agents/subagents only as an execution/review layer, not as a second source of product truth.

## Other agents

An agent is safe to onboard when it can:
- read the repository and Git history,
- honor repository instruction files or be explicitly pointed to them,
- create isolated branches,
- run the documented checks,
- create/review PRs,
- and connect to required external systems without storing secrets in Git.

If a tool does not auto-read `AGENTS.md`, its bootstrap prompt must explicitly require reading `AGENTS.md`, `docs/PROJECT-MEMORY.md`, and `docs/CURRENT-HANDOFF.md`.

## Handoff template

When leaving unfinished work, record:
- task and intended outcome,
- active branch and PR,
- files/components already changed,
- checks already run and their results,
- blockers/failed checks,
- decisions made and why,
- exact next safe step,
- external side effects already performed,
- anything that must not be repeated.
