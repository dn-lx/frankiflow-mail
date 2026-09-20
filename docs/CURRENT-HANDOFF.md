# Current Handoff

**Last updated:** 2026-09-20

## Current baseline

The repository uses a universal multi-agent workflow. `AGENTS.md` is the canonical instruction source, with thin adapters for Claude Code, Gemini CLI and GitHub Copilot plus documented workflows for ChatGPT/Codex, Cursor, Cline, Roo Code, Windsurf/Devin Desktop and OpenCode.

There is no unfinished application feature recorded in this handoff at the time this baseline was created. A new agent must still inspect Git history, open PRs/issues and CI because they may be newer than this file.

## Last completed engineering-system change

- Added durable project memory and handoff documents.
- Added host-neutral MCP/connector policy.
- Added agent-specific startup workflows without duplicating product rules.
- Kept the production rule unchanged: feature/fix/chore -> `develop`; only approved `develop -> main` releases may touch production.

## Next-agent startup

1. Read `AGENTS.md` and `docs/PROJECT-MEMORY.md`.
2. Inspect open PRs/issues and recent commits after 2026-09-20.
3. Confirm the requested task and required external connections.
4. Create a focused branch from current `develop` for implementation work.
5. Update this file only when there is meaningful unfinished state, a changed decision, or an external side effect the next agent must know.
