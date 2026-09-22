# New Project Bootstrap Checklist

Use this immediately after creating a repository from Agent Project Starter.

## Identity and source

- [ ] Rename/update README for the real project.
- [ ] Fill `docs/PROJECT-MEMORY.md`.
- [ ] Add a project-specific skill under `.agents/skills/<project-name>/SKILL.md`.
- [ ] Remove starter-only examples that do not apply.

## Branching

- [ ] Ensure `main` exists as production/release branch.
- [ ] Create `develop`.
- [ ] Configure ordinary work as feature/fix/chore → develop.
- [ ] Configure production flow as develop → main only.
- [ ] Create/require `production-approved` label if using the provided release guard.
- [ ] Configure branch/ruleset protections appropriate to the repository.

## Build and tests

- [ ] Record install/dev/test/build/lint/typecheck commands in Project Memory.
- [ ] Add project-specific CI.
- [ ] Add unit/integration tests for critical logic.
- [ ] Add Playwright/browser checks if the project has important UI workflows.
- [ ] Verify generic security workflow is compatible with the stack.

## MCP/connectors

- [ ] Complete the Project MCP profile in `docs/MCP-SETUP.md`.
- [ ] Mark each capability Required / Optional / Not used.
- [ ] Connect only needed providers in each agent host.
- [ ] Verify each connection with a harmless read.
- [ ] Document non-secret account/project/environment identifiers.
- [ ] Confirm secrets are stored outside Git.
- [ ] Record destructive/sensitive operations that require review.

## Memory/context

- [ ] Keep Project Memory compact.
- [ ] Keep Current Handoff current during unfinished work.
- [ ] Configure Graphify for larger/cross-file repositories if useful.
- [ ] Add generated/dependency/secret paths to `.graphifyignore`.
- [ ] Do not use chat history as the only project memory.

## Security

- [ ] Document authorization boundary.
- [ ] Document tenant/user isolation if applicable.
- [ ] Document secret storage.
- [ ] Document sensitive logging/data rules.
- [ ] Add project-specific security checks for auth/payments/storage/data.

## Deployment/operations

- [ ] Document development/preview/production environments.
- [ ] Connect hosting MCP only if needed.
- [ ] Add observability/analytics only if useful and privacy-safe.
- [ ] Document rollback/recovery expectations.

## Agent portability

- [ ] Verify Codex/ChatGPT workflow.
- [ ] Verify Claude bootstrap.
- [ ] Verify Gemini bootstrap.
- [ ] Verify any Cursor/Cline/Roo/Windsurf/OpenCode workflow used by the team.
- [ ] Ensure every host resolves back to `AGENTS.md`.

## Final bootstrap verification

A fresh agent should be able to answer, without asking the project owner:
- What is this project?
- Which branch should I work from?
- How do I test/build it?
- Which files are important?
- Which MCP capabilities exist?
- Which external writes are sensitive?
- How do I release safely?
- Where do I record unfinished work?

If not, the bootstrap is incomplete.
