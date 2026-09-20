# MCP and Connector Setup

External tool access is host-specific. The repository documents required capabilities, but credentials and private tokens must never be committed.

## Core capability model

| Capability | Typical provider | Use |
| --- | --- | --- |
| Source control / PRs / Actions | GitHub | Branches, diffs, PRs, checks, workflow logs, reviews |
| Current library/API docs | Context7 or official docs | Verify changing SDK/API behavior before implementation |
| Database/auth/storage | Supabase when the task uses it | Schema, auth, storage, functions, logs |
| Hosting/deployments | Netlify / ShipStatic when applicable | Preview/deploy state and configuration |
| Payments | Stripe when applicable | Test/sandbox payment flows and configuration |
| Transactional email | Resend when applicable | Email delivery, templates, logs and webhooks |
| Product analytics | PostHog when applicable | Events, flags, experiments and diagnostics |
| Business/project documents | Google Drive when applicable | Existing documentation and business artifacts |

Only connect the providers needed by the task.

## Security rules

- Never commit API keys, access tokens, OAuth refresh tokens, DSNs containing secrets, passwords, private certificates, or production service-role keys.
- Keep runtime secrets in the hosting platform, repository/environment secret store, or the agent host's secure connector configuration.
- Prefer least-privilege/read-only access for investigation.
- Confirm the target account/project/environment before any write.
- Development branches do not guarantee isolated external data. Treat shared Supabase, Stripe, email, analytics and hosting projects as live/shared unless documentation proves otherwise.
- Record material external writes in `docs/CURRENT-HANDOFF.md`.

## Startup verification by agent host

### ChatGPT / Codex
Confirm the required connected apps/tools are actually available in the current environment. Do not infer access from repository documentation.

### Claude Code
List/inspect configured MCP servers in the Claude environment before use. Store reusable server definitions in the agent host configuration only when safe; keep credentials outside Git.

### Gemini CLI
Use `/mcp list` (and authentication/reload commands as needed) before relying on an MCP server.

### Cursor / Cline / Roo Code / Windsurf / OpenCode
Use each host's MCP configuration/status UI or configuration file to confirm the server is connected. Repository docs define *what capability is needed*, not the user's private connection details.

## Minimum verification

Before claiming an MCP/connector works:
1. discover/list the connection,
2. perform a harmless read operation against the intended account/project,
3. verify the returned identity/environment,
4. only then perform an authorized write.

Configuration present in the repository is not evidence that an external integration is active.
