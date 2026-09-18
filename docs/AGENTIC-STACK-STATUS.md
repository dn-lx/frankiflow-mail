# Agentic Stack Status — FrankiFlow Mail

Legend: **In repo** = repository policy/config exists. **External** = requires a GitHub app, MCP/client connection, account or secret outside the repository. **Gap** = not yet implemented/verified.

| Layer | Status | Notes |
| --- | --- | --- |
| GitHub source of truth | In repo | `develop` is development; production remains on `main`. |
| Agent Skills | In repo | Project skills plus Context7, Frontend Design and Headroom pilot policy. |
| Graphify | In repo | Generated graph is navigation evidence, not authority. |
| ADRs | In repo | Agentic-engineering ADR added. |
| Context7 | In repo + External | Usage policy is in GitHub; MCP/client connection is configured in the coding host. |
| Frontend Design | In repo | Project-specific frontend skill added. |
| Headroom | Pilot / External | Policy is in GitHub; install/configure only for measured trials. |
| Automated tests | Partial | Coverage varies; expand by risk/feature. |
| Security scanning | Gap / verify externally | No repository-wide Semgrep gate confirmed in this audit. |
| Independent PR AI reviewer | External / Gap | Requires CodeRabbit, Bugbot or equivalent GitHub integration. |
| Sentry / runtime observability | External / Gap | No complete Sentry setup confirmed in this audit. |
| Daily Improvement Agent | Gap | Automated daily engineering report still needs implementation. |
| MemPalace | Later | Deliberately not adopted yet. |

Do not mark an external integration active until the actual client/account/GitHub app is connected and tested.
