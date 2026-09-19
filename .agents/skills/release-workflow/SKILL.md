---
name: release-workflow
description: Enforce the FrankiFlow Projects release path from feature/fix branches into develop and from develop into production main. Use whenever creating branches, opening or merging PRs, preparing a release, applying a hotfix, changing CI/CD, or touching production.
---

# FrankiFlow Projects release workflow

This skill is mandatory for every repository in the FrankiFlow Projects family.

## Non-negotiable production rule

`main` is production.

The **only** branch allowed to merge into `main` is the **same repository's `develop` branch**.

The normal flow is:

```text
feature/* or fix/*
        ↓
      develop
        ↓
tests + review
        ↓
develop → main PR
        ↓
production-approved
        ↓
       main
```

Do not bypass this flow for convenience, urgency, tooling changes, documentation, or small fixes.

## Development changes

1. Start from the current `develop` branch.
2. Create a focused `feature/*`, `fix/*`, or `chore/*` branch.
3. Implement the smallest complete change.
4. Run the repository's relevant verification.
5. Open a PR into `develop`.
6. Review the final diff and required checks.
7. Merge the feature/fix PR into `develop` only after checks pass.

Feature/fix PRs may use squash merge when that repository normally uses it.

## Production release

A production release must satisfy all of these conditions:

- PR base is `main`.
- PR head is exactly `develop` from the same repository.
- The PR has the `production-approved` label.
- Required CI/security/test checks have passed.
- The release diff has been reviewed for unrelated or unfinished development work.
- Production-impacting migrations, secrets, external-service changes, and deployment settings have been explicitly reviewed.

For `develop → main`, prefer a **normal merge commit**, not squash merge. Preserving the branch ancestry makes it clear that production came from the tested develop branch.

After release, synchronize the resulting production merge history back into `develop` if needed so `develop` is not behind `main`.

## Forbidden operations

Never:

- open or merge `feature/* → main`, `fix/* → main`, or `chore/* → main`;
- commit or push directly to `main`;
- cherry-pick an implementation commit directly onto `main`;
- force-push `main`;
- use the `production-approved` label to authorize the wrong source branch;
- deploy a feature branch as production to bypass the Git workflow;
- weaken or remove the production guard merely to get a release through.

If a PR targeting `main` does not come from `develop`, stop and correct the branch flow instead of merging it.

## Emergency hotfixes

An emergency does **not** bypass the develop-only rule.

1. Fix the production problem on a branch based from the appropriate `develop` state.
2. Merge the hotfix into `develop`.
3. If `develop` contains unrelated unfinished work, stabilize it first using feature flags, reverts, or by deferring those changes.
4. Run the critical tests.
5. Release through a `develop → main` PR with `production-approved`.

Do not cherry-pick the hotfix directly to `main`.

## Verification before merge to develop

Use the repository's own AGENTS/project skill and current CI. At minimum:

- inspect the final diff;
- run syntax/type/unit tests relevant to the change;
- run browser/mobile smoke tests when UI behavior changes;
- run security/dependency checks when auth, tenant isolation, payments, email, storage, database, or external APIs change;
- report checks that could not be run.

Never weaken tests to make a PR pass.

## Verification before develop → main

Treat this as a release gate, not a routine merge.

Confirm:

- production guard accepts only `develop`;
- no unresolved failing checks;
- no unintended commits in the release diff;
- migrations are forward-safe and reviewed;
- public assets/cache versions are correct when needed;
- critical user flows have release-level smoke coverage;
- mobile/Safari-sensitive behavior is tested with WebKit and, for known platform-specific areas such as printing, on a real iPhone/iPad when available.

## Tooling policy

Use tools for evidence, not as permission to bypass this workflow.

Preferred stack:

- GitHub for branches, PRs, checks and release history;
- Playwright for browser regression tests;
- Semgrep and dependency/secret scanning for CI security;
- Context7 for current third-party API/SDK documentation;
- Supabase tooling for schema/RLS/security-advisor work when the repository uses Supabase;
- Netlify tooling for deploy verification when the repository is hosted there;
- PostHog for product analytics, feature flags and production error visibility once connected;
- Codex Security for deeper repository security investigation once connected.

Real-device iPhone/iPad Safari testing is recommended for release-critical print/PDF flows because desktop WebKit is not a perfect substitute for iOS/iPadOS printing.

## If repository rules conflict

This skill's production rule is the project-family release contract. Older documentation that permits direct feature/fix merges into `main` is stale and should be corrected.

If a GitHub branch-protection or ruleset setting conflicts with this skill, do not work around it. Fix the repository policy or ask for repository-admin action.
