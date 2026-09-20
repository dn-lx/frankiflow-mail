---
name: release-readiness
description: Review a FrankiFlow release candidate for tests, security, migrations, observability, deployment configuration and rollback readiness.
---

# Release readiness

Use this skill before opening or reviewing a `develop` to `main` release PR. Follow the repository release workflow; this skill does not authorize production deployment.

1. Confirm the PR head is `develop`, the base is `main`, and the `production-approved` label is present.
2. Review the complete release diff for unrelated or unfinished work.
3. Confirm required syntax, unit, browser, accessibility, security and dependency checks passed.
4. Review migrations, environment variables, redirects, headers and external-service changes.
5. Confirm Sentry release tagging and the relevant PostHog verification events are ready when those services are connected.
6. Record the rollback path and any irreversible data operation.
7. Report exact evidence and unresolved risks; do not mark the release ready on assumptions.
