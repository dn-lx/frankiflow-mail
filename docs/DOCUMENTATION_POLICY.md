# Documentation Policy — FrankiFlow Mail

GitHub is the canonical development documentation store. Current source code, tests, accepted ADRs and maintained repo docs override historical Google Drive notes.

Shared historical FrankiFlow ecosystem Drive documents were imported to `dn-lx/frankiflow/docs/family/legacy-drive/` on 2026-09-18. They are reference snapshots, not live truth.

Update documentation when a change affects architecture, routes, APIs/contracts, environment variables, integrations, pricing/business rules, authentication/authorization, database schema, deployment, user-visible workflow, operational runbooks, agent tooling, or brand usage.

A deterministic GitHub workflow runs once daily and reports the previous 24 hours. A separate AI documentation maintainer may update relevant docs on `develop` after inspecting actual commits/diffs/tests. It must never invent behavior, copy secrets, change application code, or touch `main`.

Agents must reuse files under `brand/` and project static assets rather than generating replacement logos/icons.
