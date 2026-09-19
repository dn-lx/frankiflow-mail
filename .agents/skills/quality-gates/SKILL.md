---
name: quality-gates
description: Apply the FrankiFlow Projects testing and security matrix efficiently. Use when changing CI, adding tests, reviewing release readiness, or deciding which checks a change needs.
---

# Efficient quality gates

Use the smallest test tier that gives strong evidence for the risk of the change. Do not run expensive release tests on every commit.

## Tier 1 — feature/fix PR into develop

Run fast deterministic checks and cancel superseded runs.

For web projects:

- syntax/type/unit checks that exist in the repository;
- Playwright desktop Chromium;
- Playwright desktop WebKit;
- Semgrep high-severity scan;
- obvious-secret scan;
- production dependency audit.

For the FrankiFlow Admin mobile app:

- TypeScript validation;
- Semgrep high-severity scan;
- obvious-secret scan;
- production dependency audit.

CI workflows should use GitHub Actions concurrency with `cancel-in-progress: true` for PR/develop validation so a new commit cancels the older run.

## Tier 2 — develop to main release

Follow the mandatory [Release Workflow](../release-workflow/SKILL.md).

For web projects, run the normal desktop browser matrix plus:

- iPhone-sized WebKit project;
- iPad-sized WebKit project;
- repository checks/tests;
- critical login/calculator/booking/mail flows that are covered by the repository smoke suite.

The iPhone/iPad Playwright projects are WebKit/mobile emulation, not physical iOS devices. For platform-specific Safari behavior such as printing/PDF pagination, perform real-device verification when a device-cloud integration or physical device is available.

For the FrankiFlow Admin mobile app:

- TypeScript validation;
- Expo dependency compatibility check;
- Android release-candidate build before merge to main;
- upload the candidate APK as a short-retention artifact for review.

The production APK/release workflow remains a post-merge production action and must not be used as the first build validation.

## Tier 3 — targeted deep security review

Use Codex Security when available for changes involving:

- Supabase RLS or authorization;
- authentication/session handling;
- tenant isolation;
- payments or payment state;
- email sending/rendering;
- file/storage permissions;
- secrets or privileged server functions;
- user-controlled HTML/configuration;
- new external APIs.

Keep Semgrep, dependency audit and secret scanning in CI even when Codex Security is used. One does not replace the others.

Do not make Codex Security a blocking step for documentation-only or cosmetic UI work unless the change touches a security boundary.

## Production observability

Use PostHog when connected for product analytics, release verification, feature flags and production-error investigation.

Rules:

- do not send passwords, payment data, message bodies, booking notes, addresses or other unnecessary personal data;
- identify only what the product genuinely needs;
- prefer explicit event names tied to business flows;
- keep analytics optional/non-authoritative — pricing, auth, payments and booking decisions must never depend on PostHog;
- use feature flags for gradual rollout where a change has meaningful production risk.

PostHog is an observability/product tool, not a replacement for automated tests.

## Efficiency rules

- PR checks protect `develop`; release checks protect `main`.
- Do not duplicate the heavy mobile/browser release matrix on ordinary feature pushes.
- Cancel outdated PR runs instead of paying for stale test executions.
- Keep release reports/artifacts longer than ordinary PR artifacts.
- Add a new test only when it protects a real behavior, regression, or security boundary.
- Do not weaken a test because a change made it inconvenient.
