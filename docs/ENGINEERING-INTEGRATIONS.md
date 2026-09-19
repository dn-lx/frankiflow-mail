# Engineering Integrations

Verified: 2026-09-19

This document explains the active tools used across the FrankiFlow Projects family and what each one is for.

| Tool | Simple purpose | When we use it | Status |
| --- | --- | --- | --- |
| GitHub | Stores code and controls branches/PRs | Every code change and release | Active |
| Agent Skills | Gives coding agents project-specific rules | Before implementation, review, release, branding and testing work | Active |
| Context7 | Looks up current library/API documentation | When code depends on a third-party SDK/API | Active |
| Graphify | Maps code relationships locally | Cross-file impact analysis and dependency tracing | Active, on demand |
| Frontend Design skill | Keeps UI work visually consistent | Substantial UI/design changes | Active, on demand |
| Playwright | Opens the app in real browser engines and checks user flows | Every web PR; larger mobile/WebKit matrix before production | Active |
| GitHub Actions | Automatically runs tests and release checks | PRs, develop updates and production releases | Active |
| Semgrep | Finds risky code patterns | Security CI | Active |
| Secret scan | Catches obvious committed credentials | Security CI | Active |
| npm audit | Checks production dependency vulnerabilities | Security CI | Active where package.json exists |
| CodeRabbit | Independent AI review of pull requests | PRs into develop and production release review | Active; develop auto-review enabled |
| Codex Security | Deeper security review | Auth, RLS, tenant isolation, payments, email, storage, secrets and external APIs | Connected; targeted use |
| PostHog | Product analytics, feature flags and production diagnostics | Product behavior, controlled rollout and debugging | Connected; app event instrumentation is intentionally opt-in |
| Supabase MCP | Safely works with DB, Auth, RLS and Edge Functions | Backend/data/auth changes | Active where Supabase is used |
| Netlify MCP | Checks projects, deployment state and hosting config | Web deployment verification | Active where Netlify is used |
| Stripe MCP | Uses current Stripe docs/account context for payment work | Payment flows | Active only where payments are used |
| Resend MCP | Email delivery, templates and operational email tooling | Mail/notification work | Active where email delivery is used |
| Google Drive | Stores project documentation and approved assets | Documentation and asset handoff | Active |
| Appetize | Browser-based Android APK test environment | FrankiFlow Admin App APK smoke testing | Active for the mobile app |

## Quality model

Normal feature/fix PRs into `develop` use the fast gate:
- syntax/type/unit checks where available;
- Chromium + WebKit for web projects;
- Semgrep;
- secret scan;
- dependency audit;
- CodeRabbit review.

Production `develop → main` releases use the heavier gate:
- all normal checks;
- iPhone-sized WebKit;
- iPad-sized WebKit;
- release-level browser flows;
- Android release-candidate APK for the admin app;
- targeted Codex Security review for sensitive changes.

Superseded GitHub Actions runs are cancelled automatically to reduce wasted CI time.

## Removed / retired

These were removed because they were not providing active value or duplicated another tool:

- **Sentry scaffold** — never activated; PostHog now covers the planned analytics/error-observability direction.
- **Headroom pilot** — not being used; modern agent context handling plus repository skills are sufficient.
- **One-time patch workflows** — historical self-modifying workflows are removed after their patches have landed. Normal PRs are now the only development path.
- **MemPalace** — not adopted; GitHub/source/skills remain the source of truth.

## Deliberately not automatic

PostHog is connected, but the applications should not send customer data merely because the connector exists. Before app instrumentation, define a small event taxonomy and privacy rules. Never send passwords, message bodies, payment details, addresses, booking notes or unnecessary personal data.

Codex Security supplements Semgrep and CI; it does not replace them.

Mobile Playwright WebKit is browser/device emulation. For Safari print/PDF bugs, a physical iPhone/iPad or a real-device cloud remains the strongest final verification.
