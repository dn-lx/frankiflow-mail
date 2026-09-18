# ADR 0001 — GitHub-centered agentic engineering stack

- Status: Accepted
- Date: 2026-09-18

## Context

The FrankiFlow project family is increasingly developed with AI coding agents across different clients. The engineering system must remain portable, reviewable and independent of any single chat, model vendor or developer laptop.

## Decision

GitHub is the canonical source of truth. Repository-local Agent Skills, ADRs and current source/tests carry durable knowledge. Graphify is a navigation/impact-analysis aid. Context7 supplies current external documentation from the agent host. Frontend Design is a repository-local skill for substantial UI work. Headroom is a measured, opt-in context-compression pilot and must not replace original-source review for high-risk logic.

Work is separated into Planner/Architect, Executor/Implementer and independent Reviewer/Test-Security roles. Repository policy uses capability classes rather than hard-coded model names.

## Consequences

Coding clients may change without rewriting governance. Agent/session memory is supplementary. Sensitive changes receive independent review. Headroom adoption depends on measured benefit without quality regression.
