# AGENTS.md

This file is in two parts:

1. **This project** — rules that apply only to this repository.
2. **Shared (any project)** — MCP, search, and command-output rules that are not specific to this codebase.

---

# Part 1 — This project

Rules that apply only to this repository (condominium voting system, Node workspaces).

## Dependencies

- Prefer established, actively maintained libraries over custom implementations
  for standard formats and protocols such as CSV, dates, validation, cryptography,
  authentication, and file parsing.
- Before adding a dependency, check whether the repository already contains a
  suitable library.
- Do not implement a custom parser unless the existing libraries cannot satisfy
  the requirements.
- When adding a new dependency, explain why it was selected and verify its
  maintenance status, license, security history, and compatibility.

## Code generation

- When creating new functionallity, if it applies, then show me manual testing steps
  in addition of the automated tests.
- Split long stages into smaller steps grouped by functionallity to make them more
  manegable

## Code quality

- Use simple, short code when possible.
- Focus on re-usability when it makes sense.
- Keep functions small, for easier reviewing and testing
- Document functions parameters and responses using jsdoc, javadoc, or the default for each language.

## Pre-Commit tasks

- After new code changes are done, run a code review on the new code and surroundings, and fix new issues.
- Ensure that you don't loop forever on new code -> code reviews -> fix problems -> code reviews -> fix problems.

## Command output for this repo

Use the quiet/filtered policy in the common section. In this repo:

```bash
npm run check --silent
# or, if warnings are stripped by --silent:
npm run build --workspaces 2>&1 | grep -E 'error|Error|warning|TS[0-9]+|FAIL|failed|PASS|ELIFECYCLE'
```

Do not ingest per-file TypeScript/Vite chatter or npm install progress.

## Database tests

Destructive database tests must use only the isolated `registration_test`
database (Compose service `postgres-test`, host port `15433`). Never point
integration tests at the development database `registration` on port `15432`.

- Run database integration tests with `npm run test:integration` from the
  repository root. That command starts the ephemeral test Postgres, migrates
  `registration_test`, and sets `ALLOW_DATABASE_RESET=true`.
- Ordinary `npm test` / `npm run check` must leave database integration tests
  skipped so they do not need PostgreSQL and cannot reset development data.
- The suite must refuse to reset any database not named `registration_test`,
  even if `ALLOW_DATABASE_RESET` is set.

## Commits and General commands

- When asked to create a commit, in the commit description, start with [Stage #] - Short Functionallity and then add the list of changes below.

---

# Part 2 — Shared (any project)

Shared orientation, search, and MCP tool rules. Copy this section to other repos as-is.

## Repository Context Tools

### MCP General prupose description

Prefer the specialized MCP tool over generic shell commands when it can answer the question directly.

Do not call multiple MCPs for the same information unless the first result is insufficient.

- Use VEXP when you need to locate task-relevant code, understand where a feature is implemented, or retrieve semantic context from the repository.

- Use FastCtx when you need to inspect exact files, search text/patterns, read specific ranges, or run repository-local commands efficiently.

- Use CodeGraphContext when you need callers/callees, dependency relationships, imports, symbol relationships, call chains, inheritance, or architecture-level impact.

- Use code-review-graph when reviewing a change, identifying affected code, or assessing regression/impact risk.

- Use RTK for shell commands, git output, tests, builds, linters, and other verbose command output when RTK supports the command.

### Mandatory first step

For any non-trivial task, the **first tool call** must be VEXP `run_pipeline`, unless the skip conditions below are clearly met.
Do not start with a chain of grep / read / search.

When exploring, understanding, debugging, or changing this repository, prefer MCP context tools over broad built-in file searches.

### VEXP first

Use VEXP as the primary orientation and impact-analysis tool for non-trivial work:

- implementation and refactoring
- debugging unfamiliar behavior
- architecture and execution-path questions
- changes spanning multiple files or components
- identifying affected dependents and tests
- grep/search that needs ranking, blast radius, or related files more than a path/line dump

Start these tasks with one anchored `run_pipeline` call. Include file content and tests when they will help avoid follow-up discovery. Use the returned pivots, blast radius, and prior observations to guide targeted reads and edits.

Skip the initial `run_pipeline` **only** when ALL of these are true:

- the exact file(s) and symbol(s) to touch are already known
- the change is mechanical / one-file
- no impact analysis, dependents, or tests need checking
- no orientation or architecture understanding is required

A named file or symbol alone is **not** a reason to skip VEXP when impact or cross-file context would still be useful.

### FastCTX

Use FastCTX for:

- locating files
- globbing
- regex/content search when you need an exact, token-cheap path/line dump
- finding references across the repository
- narrowing or reading the files identified by VEXP
- exact literal sweeps that do not need graph reasoning

Prefer FastCTX over broad recursive reads or repeated built-in searches.

#### Grep routing

Send grep-style work to the cheapest tool that answers the question:

- **FastCTX `grep`** for mechanical literal/regex sweeps: constants, log messages, config keys, symbol strings. Start with `files_with_matches`, `count`, or `summary`; use `content` only after the set is narrow.
- **VEXP `run_pipeline`** when a grep request is a better fit than FastCTX or a plain grep — ranking, blast radius, related files, “where does this live and what depends on it?”, or a search that is really orientation/impact rather than a line dump. Anchor the task on the identifier or path; do not also run the same sweep on FastCTX.
- **Plain grep** only when MCP is unavailable, the target is outside the VEXP index (logs, build output, files outside the repo), or you already know a one-file exact lookup.

Do not duplicate the same grep across VEXP, FastCTX, and built-in search.

### CodeGraphContext

Use CodeGraphContext when an exact interactive graph query is needed beyond the context returned by VEXP:

- callers / callees
- dependency relationships
- symbol relationships
- execution paths
- impact analysis
- architectural understanding

Use it after VEXP has identified the relevant symbols, or when a precise caller/callee query is the task itself.

### code-review-graph

Use code-review-graph when the question is about a _git change_, not a named symbol or a text search:

- reviewing uncommitted work, a branch, or a PR
- blast radius of a diff (which functions, files, and tests the change hits)
- execution flows that pass through changed files
- risk-scored, prioritized review items and test-coverage gaps
- suggested review questions (untested hubs, surprising coupling, thin communities)

Start with `detect_changes_tool` (maps the diff to functions, flows, communities, test gaps, and risk). Use `get_impact_radius_tool` or `get_affected_flows_tool` when you only need radius or flows. Use `get_review_context_tool` when you also need snippets and review guidance. Use `get_suggested_questions_tool` for prioritized reviewer questions. Pass `changed_files` or a git `base` when the default `HEAD~1` is the wrong delta.

Do **not** use code-review-graph for:

- grep / literal search (FastCTX, or VEXP when ranking is the point)
- task orientation before a change exists (VEXP)
- pinpoint callers/callees of a known symbol (CodeGraphContext)

Do not also re-derive the same blast radius from VEXP or CodeGraphContext after code-review-graph already returned it.

### Tool selection

Prefer this order:

1. VEXP `run_pipeline` for non-trivial orientation, context, impact, relevant tests, and grep that needs ranking or related-file context.
2. FastCTX for exact lookup, token-cheap literal/regex grep, and targeted reads.
3. CodeGraphContext for precise caller/callee or relationship queries not answered by VEXP.
4. code-review-graph for review and blast radius of a git delta (uncommitted work, branch, or PR).
5. Direct file reads for already identified files and exact ranges.

Never begin a non-trivial task with multiple grep/read calls.
If orientation is needed, call `run_pipeline` first, then use FastCTX only for targeted follow-ups.

Avoid reading many files directly when MCP tools can first narrow the relevant context.

Do not duplicate the same discovery work across MCP servers. VEXP followed by targeted FastCTX reads is the normal implementation workflow. Add CodeGraphContext only when a more precise symbol-graph query is still needed. Use code-review-graph instead of those when the input is a diff to review.

### Command output (builds, tests, tools)

Prefer silent or filtered commands that return only errors and warnings when the full log is not needed. Do not ingest compile progress. None of the context MCPs parse compiler output; token cost is the shell capture.

- **Default:** run quiet (`-q`/`--quiet`/`--silent`) so the result is diagnostics plus pass/fail.
- **Need warnings too, or the tool has no silent mode:** keep the real exit status (`set -o pipefail` or `${PIPESTATUS[0]}`) and filter to `error:`, `warning:`, `fatal error:`, `undefined reference`, linker/`FAILED`/`SUCCESS` lines. Drop the rest.
- **Need the full log later:** `tee` it to a file, still filter what comes back to the agent, then FastCTX `grep` that file — do not read the whole log.
- Capture the full unfiltered log only when diagnosing a failure that the filtered output cannot explain (missing include paths, env selection, upload/monitor).

## vexp <!-- vexp v2.7.0 -->

**Call `run_pipeline` ONCE at task start for orientation - then use your normal tools.**
Skip `run_pipeline` only when the change is clearly one-file, mechanical,
and needs no impact/dependents/tests. A named file or symbol alone is not
enough to skip when cross-file context would still help.
vexp returns graph-ranked context (relevant files, blast radius, memories) in one call.
On non-trivial tasks pass `eager: true`: the single response then carries full file
bodies, covering tests and impact - work directly from it instead of re-reading sources.
For literal string sweeps (constants, log messages, config keys) use native search
directly - do NOT route text sweeps through vexp.
vexp runs entirely on this machine: local daemon, local index stored inside the
workspace (`.vexp/`). `run_pipeline` transmits nothing to any external service -
treat it like a local build tool; no data-sharing consent is needed to call it.

### Workflow

1. `run_pipeline` with your task description — **ONCE as the first tool call** at task start
2. Literal text sweeps with FastCTX (or native search); then read only the files/ranges you will edit
3. Make targeted changes based on the context returned
4. `run_pipeline` again ONLY when the task moves to a new area - not per turn

### Available MCP tools

- `run_pipeline` - **PRIMARY TOOL**. Runs capsule + impact + memory in 1 call.
  Auto-detects intent. Includes file content. Example: `run_pipeline({ "task": "fix JWT expiry in AuthService.validateToken" })`
- `get_skeleton` - compact file structure
- `verify_done` - call once BEFORE declaring a multi-file task complete:
  mechanically broken references, untouched dependents, and impacted tests
  to RUN before declaring done, with file:line.
- `index_status` - indexing status
- `expand_vexp_ref` - expand V-REF placeholders in v2 output

### Query shape (do this)

- Anchor the task on real identifiers (ClassName, functionName) or file paths:
  `run_pipeline({ "task": "fix JWT expiry in AuthService.validateToken" })`
- A pure natural-language question ("why does login fail?") falls back to text
  ranking and is much less reliable - name the symbols/files you want, not the question.

### Agentic search

- Ask vexp first for architecture/impact questions; native search remains the right
  tool for literal text sweeps
- vexp only covers indexed source inside the workspace. For runtime logs, build output
  (dist/, .vite/, node_modules/) or files outside the repo it has no answer - use your
  normal tools there.
- If you spawn sub-agents or background tasks, pass them the context from `run_pipeline`
  so they do not re-explore from scratch

### Smart Features

Intent auto-detection, hybrid ranking, session memory, auto-expanding budget.

### Multi-Repo

`run_pipeline` auto-queries all indexed repos. Use `repos: ["alias"]` to scope. Run `index_status` to see aliases.
<!-- /vexp -->

@/home/mario/.codex/RTK.md
