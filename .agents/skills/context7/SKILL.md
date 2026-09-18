---
name: context7
description: Use current, version-aware external library documentation before changing code that depends on third-party APIs or SDKs.
---

# Context7 usage

Context7 is an agent-host documentation integration, not an application dependency.

When a task touches an external library, SDK, framework or API:

1. identify the exact package/provider and version,
2. query current documentation,
3. compare the intended API with repository configuration,
4. implement the smallest compatible change,
5. verify with repository checks and actual source.

Repository architecture, security rules and tested contracts override generic external examples.
