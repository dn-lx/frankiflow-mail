# Agentic / Engineering Stack Status

Verified against `develop`: 2026-09-19.

## Active stack

| Layer | Status | Notes |
| --- | --- | --- |
| GitHub source of truth | ✅ Active | `develop` is integration; `main` is production. Only `develop` may merge to `main`. |
| Agent Skills | ✅ Active | Project skill, release workflow, quality gates, branding, Context7, Frontend Design and Graphify policies are repository-local. |
| Context7 | ✅ Active | Used for current third-party SDK/API documentation. |
| Graphify | ✅ Active on demand | Local code-relationship map for cross-file impact analysis. Generated graphs remain non-authoritative. |
| Frontend Design | ✅ Active on demand | Used for substantial UI/design changes. |
| Playwright | ✅ Active | Chromium + WebKit on ordinary web PRs; iPhone/iPad-sized WebKit on production release gates. |
| GitHub Actions | ✅ Active | CI, security, browser tests, documentation drift, daily engineering improvement and release gates. |
| Security CI | ✅ Active | Semgrep, obvious-secret scan and production dependency audit. |
| CodeRabbit | ✅ Active | Auto-review configured for PRs targeting `develop`, with incremental review enabled. |
| Codex Security | ✅ Connected | Targeted deep review for auth, RLS, tenant isolation, payments, email, storage and other sensitive changes. |
| PostHog | ✅ Connected | Available for analytics, feature flags and production diagnostics. App instrumentation remains opt-in and privacy-scoped. |
| Supabase tooling | ✅ Active where used | Database, Auth, RLS, migrations, Edge Functions and security advisors. |
| Netlify tooling | ✅ Active where used | Deployment state and hosting configuration. |
| Stripe tooling | ✅ Active where used | Payment implementation/account-aware work. |
| Resend tooling | ✅ Active where used | Transactional email and mail operations. |
| Google Drive | ✅ Active | Documentation and approved asset handoff. |
| Daily Engineering Improvement | ✅ Active | Scheduled engineering report workflow remains in place. |

## Removed / retired

- **Sentry browser scaffold** — removed because it was never activated and duplicated the observability direction now covered by PostHog.
- **Headroom pilot** — removed because it was not being used and added extra process without measurable value.
- **One-time patch/apply workflows** — remove after their patch has landed; use normal PRs instead of self-modifying develop workflows.
- **MemPalace** — not adopted. GitHub, current source, tests and repository skills remain authoritative.

## Operating rule

Use [Engineering Integrations](ENGINEERING-INTEGRATIONS.md) for the complete simple-language inventory, and [Quality Gates](../.agents/skills/quality-gates/SKILL.md) for test/security routing.

Do not mark a connector or integration as part of the production architecture merely because it is installed. It must have a defined purpose and, where relevant, verified project/account context.
