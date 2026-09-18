# Agentic Stack Status — FrankiFlow Mail

Verified against the `develop` branch on 2026-09-18.

| Layer | Status | Verification / remaining action |
| --- | --- | --- |
| GitHub source of truth | ✅ In place | `develop` is the development branch; `main` remains production. Repository rules, skills, ADRs, tests and CI live in GitHub. |
| Agent Skills | ✅ In place | Project skill plus Graphify, Context7 policy, Frontend Design and Headroom pilot skills are committed. |
| Graphify | ✅ In place | Local developer-only code graph workflow is documented; generated graphs are ignored and not authoritative. |
| ADRs | ✅ In place | GitHub-centered agentic engineering ADR is committed. |
| Context7 | ⚠️ Repo-ready / external connection | Usage policy is committed. Connect Context7 in Cursor/Codex/other agent host when available. |
| Frontend Design | ✅ In place | Project-specific frontend design skill is committed. |
| Headroom | 🧪 Pilot-ready / external connection | Opt-in policy and safety boundaries are committed. Install/connect Headroom only for measured context-compression trials. |
| Playwright browser smoke tests | ✅ In place | Read-only local browser tests and GitHub Actions workflow are committed. External production writes are blocked/avoided. |
| Security CI | ✅ In place | Semgrep high-severity scan, obvious-secret pattern check and production dependency audit run in GitHub Actions. Latest corrected workflow completed successfully before this status update, except where a newer commit is still running. |
| Independent PR AI reviewer | ⚠️ Config-ready / external connection | `.coderabbit.yaml` is committed. CodeRabbit GitHub App (or one equivalent reviewer) still needs to be connected to make reviews active. Do not add a second overlapping reviewer until this one is measured. |
| Sentry / runtime observability | ⚠️ Scaffold-ready / external activation | Privacy-safe browser scaffold and activation guide are committed. A real Sentry project/DSN + official SDK/loader must still be connected and a synthetic event verified. |
| Daily Improvement Agent | ✅ In place | Scheduled GitHub Action runs daily, produces an artifact/step summary, and updates one aggregate GitHub issue: https://github.com/dn-lx/frankiflow-mail/issues/4 |
| Planner → Executor → Reviewer routing | ✅ In place | Capability-based orchestration is documented in `docs/AGENT-ORCHESTRATION.md`. Sensitive changes require independent review. |
| MemPalace | ⏸️ Later | Intentionally not adopted; GitHub, Agent Skills, ADRs and current source remain authoritative. |

## External activation checklist

1. Connect **CodeRabbit** (or one equivalent independent PR reviewer) to this repository and verify one PR review.
2. Create/select the **Sentry** project, connect the Browser SDK/Loader + DSN, keep PII disabled, and verify one synthetic non-sensitive event.
3. Connect **Context7** in the coding-agent host.
4. Run the **Headroom** pilot only on large repetitive context and compare quality/rework metrics before wider adoption.

Do not mark an external integration as active merely because configuration exists in GitHub.
