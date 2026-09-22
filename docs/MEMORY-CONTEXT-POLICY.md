# Memory and Context Policy

The goal is high-quality agent work without repeatedly paying the context cost of rediscovering the project.

## Three memory layers

### Durable project memory
Store stable architecture, commands, invariants, security boundaries and important paths in `docs/PROJECT-MEMORY.md` or ADRs.

### Working handoff
Store current branch/task state, blockers, checks and next step in `docs/CURRENT-HANDOFF.md`.

### Episodic engineering memory
Past fixes should be recoverable from Git history, PRs/issues, tests and concise source-linked notes. Do not duplicate full chat transcripts into permanent memory.

## Context retrieval order

Before loading broad code context:

1. read canonical instructions and compact memory,
2. inspect Git status/diff/history,
3. use exact source search,
4. use Graphify for code relationships/change impact,
5. open only relevant files,
6. broaden only when evidence requires it.

## Freshness

Memory is supporting context, not authority.

When a memory claim depends on source:
- link it to files/ADRs/commits where practical,
- revalidate it if those areas changed,
- remove or update stale claims.

Current source/tests and accepted ADRs win.

## Context budget

Avoid:
- whole-repository dumps by default,
- generated folders,
- dependency directories,
- binary assets unless required,
- repeated copies of the same docs,
- entire prior agent transcripts.

Prefer:
- repository summary,
- module summary,
- relevant source,
- current diff,
- failing test/error,
- specific project rules.

## Retry guard

For automated agent loops:
- cap repair retries,
- fingerprint repeated failures,
- stop/escalate when the same failure repeats,
- avoid asking multiple models to rediscover identical context.

## Review packets

Independent reviewers normally need:
- requirement,
- diff,
- relevant source,
- project rules,
- deterministic check results.

They normally do not need the implementer's full transcript.

## Semantic/long-term memory tools

External memory services are optional. They must never become more authoritative than Git/source/docs. Prefer local/repository-owned memory for durable engineering facts.

If adopting a memory plugin/service, document:
- data stored,
- retention,
- privacy boundary,
- freshness/invalidation,
- export/portability,
- fallback when unavailable.
