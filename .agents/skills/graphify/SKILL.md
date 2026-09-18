---
name: graphify
description: Build and query a local Graphify code graph to inspect imports, callers and change impact in this repository. Use for cross-file navigation; verify results against source and do not infer hosted backend behavior from this graph.
---

# Local Graphify

Use [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), distributed on PyPI as `graphifyy`. This is a project adaptation for local code analysis, not the upstream all-purpose skill. The tested tool version is pinned in `requirements.txt` beside this file. Python 3.10+ and Git are required; the application does not depend on Python or Graphify.

## Setup

Run from the repository root on `develop`; confirm with `git branch --show-current` and inspect `git status --short` first. Preserve unrelated edits. If the branch is different, stop before writing graph output and follow the root AGENTS.md development workflow.

Create a separate tool environment once (not part of the web build). In PowerShell:

```powershell
python -m venv .venv-graphify
.\.venv-graphify\Scripts\python.exe -m pip install -r .agents/skills/graphify/requirements.txt
.\.venv-graphify\Scripts\graphify.exe --version
```

On macOS/Linux, use `python3 -m venv .venv-graphify`, then `.venv-graphify/bin/python -m pip install -r .agents/skills/graphify/requirements.txt`; the CLI is `.venv-graphify/bin/graphify`. An existing isolated installation of the pinned version can also be used.

## Build and query

PowerShell commands from the repository root:

```powershell
.\.venv-graphify\Scripts\graphify.exe extract . --code-only --output .graphify
.\.venv-graphify\Scripts\graphify.exe query "supabase" --graph .graphify/graphify-out/graph.json
```

Use the equivalent CLI path on macOS/Linux. Replace `supabase` with a relevant function, module or symbol. `extract` appends `graphify-out` to the output directory; the explicit query path is intentional. Extraction and queries run locally without an LLM/API key. The first package installation needs internet access.

Rebuild after source changes or switching revisions before using the graph. Follow graph references to current source, and inspect actual HTML script tags, dynamic imports and browser event wiring; static analysis can miss these. Code-only extraction skips HTML and CSS, so read those files directly. Code-only graphs do not establish behavior of remote Supabase functions, database/RLS rules, runtime content, or external services. Use ordinary source search when extraction misses a relationship. Report extraction errors or empty graphs instead of claiming full coverage.

## Keep this developer-only

- `.graphifyignore` excludes secrets, dependencies and generated artifacts; Git ignores `.graphify/` and `.venv-graphify/`. Review exclusions before broadening a scan. Never commit or publish generated graphs, credentials or local tool environments. Keep them out of deployment artifacts; Git ignore rules alone do not exclude files from a manual directory upload.
- Keep `--code-only` for this workflow. Do not enable semantic/API extraction, media processing, cloud indexing or hosted graph sharing as part of routine navigation.
- Do not install Git hooks, run `graphify codex install`, or overwrite this skill with the broad upstream installer. These commands can add automatic rebuilds or agent configuration outside this workflow.
- The CLI writes its cache and a query stamp alongside the graph. Query logs are off by default; set `GRAPHIFY_QUERY_LOG_DISABLE=1` in the process environment if the local installation has opted in to logging.
- Source parsing is a navigation aid, not a replacement for the project skill's tests or browser verification. No app dependency, deployment command or CI hook is needed to use this integration.

Agent Skills discovery: [official documentation](https://learn.chatgpt.com/docs/build-skills).
