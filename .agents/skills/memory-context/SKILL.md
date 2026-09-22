---
name: memory-context
description: Minimize unnecessary model context while preserving durable engineering knowledge and freshness.
---

# Memory and Context Efficiency

Read `docs/MEMORY-CONTEXT-POLICY.md`.

## Retrieval before reasoning

Before asking an agent to inspect a broad repository:

1. read compact Project Memory + Current Handoff,
2. inspect current Git diff/status/history,
3. use exact search,
4. use Graphify for relationships/change impact,
5. open only relevant source/tests,
6. broaden only when evidence requires it.

## Do not resend

Avoid repeatedly sending:
- whole repositories,
- dependency/generated folders,
- full previous agent transcripts,
- duplicated documentation,
- unchanged large files.

## Durable write-back

After a material task, preserve only what future work needs:
- root cause,
- architectural decision,
- important files,
- tests proving the outcome,
- PR/commit reference,
- remaining risk.

Do not make model-generated memory more authoritative than source/tests/ADRs.

## Retry guard

If automating agents:
- cap retries,
- detect repeated identical failures,
- escalate or stop instead of looping,
- use deterministic commands for tests/build/status instead of asking another model to infer them.

## Reviewer packet

Normally give an independent reviewer:
- original requirement,
- final diff,
- relevant source,
- project rules,
- deterministic check results.

Do not send the full implementer transcript unless uniquely necessary.
