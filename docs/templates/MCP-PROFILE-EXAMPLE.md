# Example MCP Profile

This is an example only. Copy the relevant rows into `docs/MCP-SETUP.md` and replace them with real project facts.

| Capability | Status | Provider | Environment | Safe verification |
| --- | --- | --- | --- | --- |
| Source/PRs | Required | GitHub | owner/repo | Read current branch / open PRs |
| Current docs | Recommended | Context7 | Agent host | Resolve/query a public library |
| Database | Required | Supabase | project ref (non-secret) | List/read schema metadata |
| Hosting | Required | Netlify | site name/id (non-secret) | Read current deploy |
| Browser verification | Recommended | Playwright | Local/preview | Open read-only page |
| Code relationships | Recommended | Graphify | Local | Query known symbol |

Never put access tokens, service-role keys or passwords in this table.
