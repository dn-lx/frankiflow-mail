# FrankiFlow Projects

**Family label:** FrankiFlow Projects

This repository is part of the FrankiFlow project family. GitHub is the canonical source of truth for source code, agent instructions, architecture decisions, tests and engineering documentation.

## Repository role

**FrankiFlow Mail (FF Mail)** — Internal webmail/PWA for FrankiFlow team members and shared company mailboxes.

The family currently consists of:

- **FrankiFlow** — cleaning/service website, calculator and admin.
- **FrankiHolz** — accommodation and booking product.
- **CalcPura** — reusable pricing/quotation SaaS product.
- **FF Mail (FrankiFlow Mail)** — company mail/PWA product.

## Shared agentic engineering architecture

```text
                  GitHub
             Source of Truth
                   │
   ┌───────────────┼────────────────┐
   │               │                │
Agent Skills     Graphify           ADRs
   │               │                │
   └───────────────┼────────────────┘
                   │
                AI Agent
                   │
      ┌────────────┼─────────────┐
      │            │             │
   Context7   Frontend Design  Headroom
                             (pilot only)
      │            │             │
      └────────────┼─────────────┘
                   │
                 Coding
                   │
           Tests + Security
                   │
          Review + GitHub PR
                   │
                 Sentry
                   │
          Improvement Agent
                   │
          later: MemPalace
```

## Authority order

1. Current source code and tests.
2. Current `AGENTS.md` and repository Agent Skills.
3. Accepted ADRs and current architecture documentation.
4. Graphify/current code graph as navigation evidence.
5. Agent/session memory and compressed context only as supplementary context.

Never let remembered or compressed context override current source, tests, authorization rules or accepted ADRs.
