# Agent Orchestration

This project uses capability roles, not hard-coded model names. Model names change; the role contract should remain stable.

## Planner / Architect

Use a high-reasoning model/agent for ambiguous, cross-module, architectural, migration, security/privacy or product-contract work.

Handoff before execution:
- problem and assumptions,
- affected files/services/contracts,
- risk class,
- implementation sequence,
- tests/verification,
- rollback/compatibility note for risky changes.

## Executor / Implementer

Use a coding-capable agent optimized for repository edits and test execution. It reads the plan, current source and Agent Skills, then makes the smallest complete change on a feature/develop branch.

Required handoff:
- exact files changed,
- checks run,
- known limitations,
- deviations from plan and why.

## Reviewer / Test & Security

Use a fresh independent high-reasoning reviewer whenever possible. Review requirement correctness, authorization/security/privacy, regressions, test adequacy, maintainability and UI/accessibility where relevant.

Sensitive changes should not use the exact same agent/session as both sole author and sole approver.

## Fast Utility Worker

Use a faster/lower-cost model for deterministic mechanical tasks: inventories, repetitive documentation, formatting or summarizing green CI. Escalate when decisions or ambiguous code changes are required.

## Tool routing

- Graphify: dependency/call-path discovery.
- Context7: current third-party documentation.
- Frontend Design: substantial UI/design work.
- Tests/security checks: authoritative evidence.
- **Codex Security**: targeted independent security review for auth, RLS, tenant isolation, payments, email, storage and other sensitive boundaries.
- **PostHog**: production diagnostics, analytics and controlled feature rollout; never a source of truth for auth, pricing, payments or bookings.
- ADRs: durable architecture decisions.

Each stage passes artifacts through GitHub, not only chat context.
