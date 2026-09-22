# Model Routing Policy

## Objective

Optimize for correctness, reliability and task fit first. Cost/usage may break ties between comparably capable options but must not silently downgrade required capability.

## Stable capabilities

Routing should classify work into capabilities such as:
- architecture,
- security,
- debugging,
- backend,
- integration,
- implementation,
- refactor,
- frontend,
- multimodal,
- large-context,
- translation/localization,
- documentation,
- investigation,
- general.

Provider/model names are replaceable runtime mappings, not permanent project truth.

## Selection

1. Determine required capability and risk.
2. Check which agents/providers are actually available.
3. Select the strongest appropriate available specialist.
4. If preferred specialist is unavailable, use the next capable option.
5. Fail visibly rather than silently assigning an unsuitable agent.
6. Preserve explicit manual override when safe.
7. For high-risk work, prefer a different capable reviewer/provider/session.

## Evidence-driven adaptation

Over time, record project-specific outcomes:
- first-pass success,
- test/build success,
- review findings,
- repair rounds,
- PR acceptance,
- latency,
- context/usage estimates.

Use actual project outcomes to tune routing rather than generic benchmark claims alone.

## Usage protection

Do not protect usage by sacrificing correctness. Instead:
- retrieve only relevant files,
- use Graphify/search before broad reads,
- use fresh sessions per task where appropriate,
- compact durable memory,
- cap automatic retries,
- detect repeated identical failures,
- use deterministic tools for checks instead of asking models,
- give reviewers only the evidence they need.

See `docs/MEMORY-CONTEXT-POLICY.md`.
