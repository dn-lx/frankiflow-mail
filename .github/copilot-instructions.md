# GitHub Copilot repository instructions

Read and follow the repository-root `AGENTS.md` as the canonical working agreement.

At the start of a task, also read:
- `docs/PROJECT-MEMORY.md`
- `docs/CURRENT-HANDOFF.md`
- `docs/AGENT-PLATFORM-WORKFLOWS.md`

For external systems, read `docs/MCP-SETUP.md` and verify the connection before using it.

Ordinary feature/fix/chore work must branch from `develop` and merge into `develop`. Never merge a feature branch directly into `main`. Preserve the repository's documented tests, security checks, review gates and release workflow.
