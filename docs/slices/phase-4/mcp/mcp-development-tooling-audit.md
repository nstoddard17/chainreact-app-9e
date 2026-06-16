# 4.MCP-DEV-TOOLING — Internal MCP Development-Phase Tooling Audit

**Type:** Audit / recommendation. Docs-only. No source/tests/migrations/UI changed.
Nothing pushed.
**Date:** 2026-06-15
**Branch:** `v2-main` (local)

> Scope: recommend MCP **developer-tooling** additions that help build, test, debug, and
> verify ChainReactV2 during this pre-rollout phase. MCP stays **internal developer
> tooling** — read-only, import-fenced, no product/runtime scope. This is an audit; it
> implements nothing.
>
> **Folder note:** this doc seeds a new `docs/slices/phase-4/mcp/` subfolder because
> `docs/slices/phase-4/` had reached the 50-file leaf-folder cap (`lint:structure`). Existing
> `phase-4/mcp-*.md` docs stay in place (many files link to them); future MCP-suite docs should
> land here.
>
> **Implementation status:** **Phase A-1 SHIPPED** (`78d32e8cd`) — `repo_file_search`,
> `find_route_handlers`, `find_tests_for_file`, `get_file_outline`,
> `suggest_verification_for_changed_files`, `list_available_npm_checks`. **Phase A-2 SHIPPED** —
> `provider_capability_matrix`, `provider_action_trigger_counts`,
> `provider_metadata_consistency_check`, `option_source_coverage_check` (repo-static; manifests
> text-parsed, `*.meta.ts` counts, committed option-source JSON, `_registry.ts` text; no code
> execution). **Phase B SHIPPED** — `run_jest_for_path` (validated, `tests/`-only),
> `run_route_structure_tests` + `run_provider_metadata_tests` (fixed targets), `run_migration_lint`
> (static RLS lint — never applies migrations), `summarize_last_test_failure` (sanitized artifact).
> Registry now **36 tools**. **Phase C-1 SHIPPED** — `diagnose_workflow_graph` (live, gated route
> `/api/internal/diagnostics/workflow-graph` + `services/diagnostics/workflowGraph.ts` brain;
> structural findings only, no config values) and `no_leak_scanner` (pure local dev aid; reuses the
> egress redactor; never echoes raw values). **Phase C-2 SHIPPED** — composite doctors
> `doctor_workflow` / `doctor_provider` / `doctor_account_integration` (compose existing gated
> routes + the static `providerStatics` brain; no new route/brain/DB; account-wide enumeration
> deferred). Registry now **41 tools**. Remaining Phase C reports
> (`generate_diagnostic_report` / `generate_deploy_readiness_report`) stay queued; smoke runners +
> any mutating/deploy tools remain Phase D / do-not-build.

**Source of truth (every file below was read for this audit):**
[scripts/mcp/tools/index.ts](../../../../scripts/mcp/tools/index.ts) (the explicit registry) ·
[scripts/mcp/tools/](../../../../scripts/mcp/tools/) (`docs.ts`, `providers.ts`, `builderGaps.ts`,
`commands.ts`, `smoke.ts`, `diagnose.ts`, `diagnoseLive.ts`, `diagnoseWorkflow.ts`) ·
[app/api/internal/diagnostics/_shared.ts](../../../../app/api/internal/diagnostics/_shared.ts)
(`applyDiagnosticsGate`) ·
[docs/runbooks/internal-mcp-server.md](../../../runbooks/internal-mcp-server.md) ·
[mcp-diagnostic-suite-closeout.md](../mcp-diagnostic-suite-closeout.md) ·
[mcp-internal-diagnostic-suite-roadmap.md](../mcp-internal-diagnostic-suite-roadmap.md) ·
[package.json](../../../../package.json) scripts ·
[.claude/skills/README.md](../../../../.claude/skills/README.md) ·
[CLAUDE.md](../../../../CLAUDE.md) · [docs/PROJECT_MEMORY.md](../../../PROJECT_MEMORY.md).

---

## 1. Current MCP inventory (verified — 21 tools, 8 modules, two planes, one gate)

Enumerated from [tools/index.ts](../../../../scripts/mcp/tools/index.ts) and the `name:` fields
of each module. All live data flows through `applyDiagnosticsGate` (default-OFF, prod-locked,
bearer). The MCP process is import-fenced to `node:*` + local modules
([security-hardening.test.ts](../../../../tests/unit/mcp/security-hardening.test.ts)).

| # | Tool | Module | Category | Helps Claude… |
|---|---|---|---|---|
| 1 | `get_project_memory` | docs | context/doc | read curated rolling state |
| 2 | `list_rule_docs` | docs | context/doc | discover `docs/rules/` |
| 3 | `read_rule_doc` | docs | context/doc | read one rule doc by name |
| 4 | `search_project_docs` | docs | context/doc | substring-search `docs/**` + CLAUDE.md → `file:line` |
| 5 | `get_claude_instructions_summary` | docs | context/doc | get the CLAUDE.md heading outline |
| 6 | `list_provider_manifests` | providers | provider metadata | list providers shipping a `manifest.ts` |
| 7 | `get_provider_manifest_summary` | providers | provider metadata | capability summary (text-parsed, never executed) |
| 8 | `explain_provider_connection_requirements` | diagnose (static) | provider metadata | what a provider needs to be connected/usable |
| 9 | `list_builder_metadata_gaps` | builderGaps | provider/builder metadata | read the builder-metadata launch-gap tracker |
| 10 | `run_typecheck` | commands | verification/check | run `tsc --noEmit` (bounded, redacted) |
| 11 | `run_lint` | commands | verification/check | run `eslint .` |
| 12 | `run_structure_lint` | commands | verification/check | run leaf-folder cap check |
| 13 | `list_recent_smoke_failures` | smoke | verification/check | read sanitized smoke-artifact failures |
| 14 | `read_smoke_failure_context` | smoke | verification/check | one sanitized smoke record by title |
| 15 | `diagnose_option_source` | diagnose (static) | diagnostics | map an observed option-source error code → cause/next-checks |
| 16 | `diagnose_option_source_live` | diagnoseLive | diagnostics (live) | run the real resolver for an option-source key |
| 17 | `diagnose_integration_connection` | diagnoseLive | diagnostics (live) | single-provider connection state for `(provider, account, user)` |
| 18 | `diagnose_run_failure` | diagnoseLive | diagnostics (live) | humanized failure of one run (no raw output) |
| 19 | `explain_run_visibility` | diagnoseLive | diagnostics (live) | why a run is absent from `/runs` (running/test/wrong-account) |
| 20 | `diagnose_workflow_readiness` | diagnoseWorkflow | diagnostics (live) | per-node supported-id + missing-field + per-provider connection verdict |
| 21 | `diagnose_workflow_connections` | diagnoseWorkflow | diagnostics (live) | workflow-wide connection readiness |

**Category totals:** context/doc 5 · provider/builder metadata 4 · verification/checks 5 ·
diagnostics 7 (1 static + 6 live).

### 1.1 Gaps, overlaps, stale items

- **Overlaps:** none harmful. `diagnose_option_source` (static taxonomy) and
  `diagnose_option_source_live` (runs the resolver) are intentionally paired — keep both.
  `diagnose_workflow_readiness` and `diagnose_workflow_connections` overlap on the
  per-provider connection check but answer different questions (node readiness vs.
  connection-only); acceptable, and they share `services/diagnostics/integrationConnection`.
- **Stale doc (low):** the runbook's "Tools exposed" table predates Stage-2B-3 and lists
  fewer live tools than the registry now has (21). **Recommend a one-line doc refresh** of
  [internal-mcp-server.md](../../../runbooks/internal-mcp-server.md) — not done here to keep
  this commit audit-only (see §9).
- **Functional gaps (the audit's subject):** no self-inventory tool; no targeted test runner
  (only whole-suite via the absent-by-design path); no repo-navigation/orientation tools; no
  provider readiness matrix; no migration-awareness check; no graph/doctor/report diagnostics
  (the roadmap's 2B-5/2C/2D, still unbuilt). These are the recommendation targets below.

---

## 2. Development-workflow gaps → where MCP can help

| Dev task | Today | Gap → proposed helper |
|---|---|---|
| Plan a slice | `get_project_memory`, `get_claude_instructions_summary`, `search_project_docs` | **`summarize_slice_status`**, **`list_recent_slice_docs`** (orient on phase-4 state fast) |
| Find relevant files/docs | `search_project_docs` (docs only) | **`repo_file_search`** (allow-listed, bounded), **`find_route_handlers`**, **`find_provider_files`** |
| Understand provider patterns | `get_provider_manifest_summary` | **`provider_capability_matrix`**, **`provider_action_trigger_counts`** |
| Add actions/triggers/options/metadata | manifest summary + `list_builder_metadata_gaps` | **`provider_metadata_consistency_check`**, **`option_source_coverage_check`** |
| Builder UI / data-flow work | rule docs | (covered by repo-nav + readiness/graph diagnostics; no new builder-specific tool recommended) |
| Diagnostics / readiness | 6 live diagnostics | **`diagnose_workflow_graph`**, **doctors**, **reports** (roadmap 2B-5/2C/2D) |
| Route/API security review | rule docs + manual | **`find_route_handlers`** + existing structural-auth test; **`run_route_structure_tests`** |
| Test selection | none | **`find_tests_for_file`**, **`suggest_verification_for_changed_files`**, **`run_jest_for_path`** |
| Smoke testing | smoke-artifact readers (post-hoc) | **`run_smoke_local`** (deferred — see §3) |
| Migration awareness | none in MCP (`lint:migrations` exists as a script) | **`run_migration_lint`** / **`list_pending_migrations`** |
| Prod-deploy readiness report | none | **`generate_deploy_readiness_report`** (compose checks — Phase C) |
| Closeout/report writing | `get_project_memory`, slice docs | **`summarize_slice_status`** + **`generate_diagnostic_report`** |

---

## 3. Testing & verification tools — evaluation

Principle: **read-only or local-only; never push/deploy/mutate/migrate/touch prod.** Command
wrappers must run **exact allow-listed npm scripts** (the existing `commands.ts` pattern — no
tool argument reaches the shell) OR, where a path/pattern arg is needed, pass it as a
**typed, validated, non-shell** argument to a fixed runner.

| Proposed | Verdict | Notes |
|---|---|---|
| `run_jest_for_path` | **Safe with limits — Phase B** | Run `jest <path>` for an allow-listed test path (`tests/**`). Path validated (no traversal, must resolve under `tests/`), passed as argv not shell string. Bounded/redacted output + wall-clock timeout. |
| `run_tests_matching` | **Safe with limits — Phase B** | `jest -t "<name>"` / name-pattern. Same validation; cap runtime. Slight overlap with `run_jest_for_path`; ship one (path) first. |
| `run_route_structure_tests` | **Safe now — Phase B** | Thin wrapper over the existing structural-auth + route tests (`jest tests/structure/api-route-authorization.test.ts`). High value for security review; exact path, no arg. |
| `run_provider_metadata_tests` | **Safe now — Phase B** | Wrapper over `tests/structure/discovery-meta-coverage.test.ts` (the `COVERED_PROVIDERS` gate). Exact path. |
| `run_smoke_local` | **Needs explicit approval — defer to Phase B/C** | Local Playwright (`smoke:prod` config against a local server) spins a browser + dev server; heavy, slow, env-dependent. Allow only against localhost, never a deployed origin; gate behind explicit opt-in env. |
| `run_smoke_prod_dry_or_report_only` | **Report-only = Safe (Phase C); running prod smoke = Do not build in MCP** | MCP may **read** the sanitized smoke artifact (already does) and format a report. MCP must **not** trigger a prod smoke run (touches the deployed origin). Keep prod-smoke execution in the human/CI flow. |
| `suggest_verification_for_changed_files` | **Safe now — Phase A** | Pure mapping `git diff --name-only` (read-only) → recommended checks (which lint/tests apply). No execution; just guidance. Highest leverage, lowest risk. |
| `summarize_last_test_failure` | **Safe now — Phase A** | Reads the sanitized smoke artifact (and/or a local jest-json output if present) → terse failure summary. Pure read of an already-sanitized/local artifact. |
| `list_available_npm_checks` | **Safe now — Phase A** | Returns the curated allow-list of non-mutating checks (`typecheck`, `lint`, `lint:structure`, `lint:migrations`, named test wrappers) with one-line descriptions. Inventory-only. |

**Explicitly excluded from MCP:** `npm run build`, `db:push`, `smoke:prod` against the
deployed origin, `dev`/`start` lifecycle control, anything writing git/remote.

---

## 4. Repo-navigation tools — evaluation

Constraints: **allow-listed folders only, bounded output, no secrets/env, no whole-repo
dump.** These orient Claude faster; they **do not replace** reading the actual code.

Allow-list (reuse the server whitelist philosophy): `app/**`, `services/**`, `repositories/**`,
`integrations/**`, `contracts/**`, `core/**`, `components/**`, `stores/**`, `scripts/mcp/**`,
`docs/**`, `tests/**`, `CLAUDE.md`. **Blocked:** `.env*`, `*.key`, `*.pem`, `secret`/`token`/
`credential`/`service-role`-named files, `node_modules`, `.next`, `dist`, build artifacts.

| Proposed | Verdict | Notes |
|---|---|---|
| `repo_file_search` (allow-listed) | **Safe with limits — Phase A** | Filename/glob search within the allow-list; return **paths only** (no content), capped count. Reuses the path-whitelist + traversal guards already tested. |
| `get_file_outline` (allow-listed) | **Safe with limits — Phase A** | For one allow-listed file, return a **structural outline** (exported symbols / headings / route method) — not the full body, byte-capped, redacted. |
| `find_route_handlers` | **Safe now — Phase A** | List `app/api/**/route.ts` with method + whether `applyDiagnosticsGate`/auth is present. Pure path+lightweight-parse; great for security review. |
| `find_provider_files` | **Safe now — Phase A** | For `<provider>`, list its `integrations/<provider>/**` + `services/discovery` registration paths. Paths only. |
| `find_tests_for_file` | **Safe now — Phase A** | Map a source path → likely test paths (naming + folder convention). Paths only; pairs with `run_jest_for_path`. |
| `list_recent_slice_docs` | **Safe now — Phase A** | List recent `docs/slices/<phase>/*.md` with title + Type/Date header. Doc-only. |
| `summarize_slice_status` | **Safe now — Phase A** | Parse one slice doc's header + status banner → terse status. Doc-only. |

All return **bounded** results; none reads arbitrary content beyond an outline. `get_file_outline`
is the only content-touching one and is byte-capped + redacted — acceptable, but ship
`repo_file_search`/`find_*` (paths-only) first.

---

## 5. Provider/app development tools — evaluation

All **repo-static** (compose `services/discovery/_registry` + `integrations/_registry` +
manifests — the authoritative oracle per the roadmap §2.4) except where a live connection
check is involved. Static ones need **no route, no gate** (no live data).

| Proposed | Verdict | Notes |
|---|---|---|
| `provider_capability_matrix` | **Safe now — Phase A** | All providers × {enabled, actions?, triggers?, webhook?, polling?, oauth scheme} from manifests + registry. Pure static; high orientation value. |
| `provider_action_trigger_counts` | **Safe now — Phase A** | Per-provider action/trigger counts (and totals). Static. |
| `provider_metadata_consistency_check` | **Safe now — Phase A** | Cross-check manifest capability flags vs. actually-registered actions/triggers/meta (catches "manifest says `actions:true` but none registered" — the CLAUDE.md "manifest honesty" rule). Static; high value for provider work. |
| `option_source_coverage_check` | **Safe now — Phase A** | Which option-source keys are registered vs. referenced by provider fields; uses the committed `option-source-manifest.json` drift artifact already in the repo. Static. |
| OAuth/scope summary by provider | **Safe now — Phase A** (fold into `provider_capability_matrix` or `explain_provider_connection_requirements`) | Required/optional scopes + refreshable from the manifest. Don't add a separate tool; extend an existing one. |
| `app_visibility_readiness_summary` | **Safe with limits — Phase A/C** | "Is provider X enabled + builder-metadata-covered + Apps-page visible?" Compose static sources + `list_builder_metadata_gaps`. Static. |
| `what_remains_for_provider_production_ready` | **Safe (compose) — Phase C** | Composite: consistency + coverage + scopes + metadata-gap + (optional, gated) connection. A "provider doctor" — belongs in the doctor tier (§6), composing the static primitives. |

---

## 6. Diagnostics — what comes next (preserve the architecture)

Architecture invariant (do not regress): **route = gate/auth/validate/serialize · service
(`services/diagnostics/*`) = brain · MCP = adapter/reporting/composition.** No secrets, tokens,
raw provider payloads, run outputs, trigger payloads, or `config` **values** ever leave the
route — only enums/counts/booleans/node-ids/field-**names**/scope-**gap** names + the stored
humanized `errorClassification`. Doctors **compose, never duplicate**.

| Next | Stage | Verdict | Shape |
|---|---|---|---|
| `diagnose_workflow_graph` | 2B-5 | **Phase C** | New gated `/workflow-graph` route; structural findings (unsupported id / broken edge / missing-field names / unresolved `{{...}}` **locations**). Reuses `getByIdServiceRole` + discovery registry. **No config values.** |
| `doctor_workflow` | 2C | **Phase C** | Compose readiness + graph + latest run-failure + per-provider connection → "what's wrong + next steps." No new route. |
| `doctor_provider` | 2C | **Phase C** | Compose provider-app + connection + option-sources. No new route. |
| `doctor_account_integration` | 2C | **Phase C (new, scoped)** | Account-level "which integrations are connected/healthy" — compose `diagnose_integration_connection` across the account's providers. Must stay membership-gated; **counts/enums only**, never per-credential identity. |
| `generate_diagnostic_report` | 2D | **Phase C** | Format merged sanitized DTOs → copyable Markdown runbook. Pure local formatting; redaction backstop. |
| `no_leak_scanner` for diagnostic outputs | — | **Safe now — Phase B (test/dev aid)** | A **local** checker that scans a diagnostic DTO/sample for forbidden shapes (token-like strings, `output`/`error.message`/`triggerEvent` keys, raw `config` values). Useful as a dev/test guard; **not** a runtime gate (the route's allow-list construction remains the real defense). |

Sequencing matches the roadmap: **2B-3 already shipped**; next is **2B-5 graph → 2C doctors →
2D reports**. Provider-static doctors (§5) can land earlier since they need no live route.

---

## 7. Security / safety classification (every proposed tool)

**Disallowed by default in MCP (do not build):** git push / PR / deploy · `db:push` /
migration application · production-data access · secrets/env/token/credential access · workflow
mutation · arbitrary shell · arbitrary file reading · any new service-role DB access **inside**
`scripts/mcp` (live data only via the existing gated `/api/internal/diagnostics/*` routes).

| Tool | Risk class |
|---|---|
| `suggest_verification_for_changed_files`, `summarize_last_test_failure`, `list_available_npm_checks` | **Safe now** |
| `repo_file_search`, `find_route_handlers`, `find_provider_files`, `find_tests_for_file`, `list_recent_slice_docs`, `summarize_slice_status` | **Safe now** (paths/headers only, allow-listed) |
| `provider_capability_matrix`, `provider_action_trigger_counts`, `provider_metadata_consistency_check`, `option_source_coverage_check`, `app_visibility_readiness_summary` | **Safe now** (repo-static) |
| `get_file_outline` | **Safe with limits** (byte-cap + redact + allow-list) |
| `run_jest_for_path`, `run_tests_matching`, `run_route_structure_tests`, `run_provider_metadata_tests`, `run_migration_lint` | **Safe with limits** (validated argv / exact script, timeout, bounded output) |
| `no_leak_scanner` | **Safe with limits** (local dev aid, not a runtime gate) |
| `diagnose_workflow_graph`, `doctor_*`, `generate_diagnostic_report`, `generate_deploy_readiness_report`, `what_remains_for_provider_production_ready` | **Safe with limits** (existing gate + no-leak DTO; compose-not-duplicate; report tools never push/deploy) |
| `run_smoke_local` | **Needs explicit Marcus approval** (heavy, env-dependent; localhost-only) |
| `run_smoke_prod_dry_or_report_only` — **report-only** | **Safe** (read sanitized artifact) · **running prod smoke from MCP** | **Do not build** |
| Anything writing git/remote, `db:push`, prod data, secrets, workflow mutation, arbitrary shell/file | **Do not build** |

---

## 8. Prioritized roadmap

Each tool: name · purpose · inputs · output · location · safety · tests · why.

### Phase A — highest-impact, safest dev helpers (static / paths-only / inventory)

1. **`suggest_verification_for_changed_files`** — *purpose:* map changed files → the checks that
   apply. *inputs:* none (reads `git diff --name-only HEAD`) or optional `paths[]`. *output:*
   `{ changed: string[], recommended: { check, reason }[] }`. *location:*
   `scripts/mcp/tools/verify.ts` (read-only `git` via fixed argv; or read a caller-supplied list).
   *safety:* read-only; no execution. *tests:* mapping table + no-shell-injection.
   *why:* removes "what should I run?" guesswork; pairs with the command wrappers.
2. **`list_available_npm_checks`** — *purpose:* the curated non-mutating check allow-list.
   *inputs:* none. *output:* `{ name, script, description, mutating:false }[]`. *location:*
   `scripts/mcp/tools/commands.ts` (extend). *safety:* inventory-only. *tests:* list matches the
   allow-list constant. *why:* discoverability; reinforces "these are the only safe checks."
3. **`repo_file_search`** — *purpose:* filename/glob search in allow-listed folders.
   *inputs:* `{ query, globs?: string[] }`. *output:* `{ paths: string[] (capped) }`.
   *location:* `scripts/mcp/tools/repoNav.ts`. *safety:* allow-list + traversal guard + cap;
   **paths only**. *tests:* allow-list enforcement, blocked-dir rejection, cap.
   *why:* faster orientation than doc-only search.
4. **`find_route_handlers`** — *purpose:* enumerate `app/api/**/route.ts` with method + auth/gate
   presence. *inputs:* `{ pathPrefix? }`. *output:* `{ route, methods[], hasAuthGuard, gate }[]`.
   *location:* `scripts/mcp/tools/repoNav.ts`. *safety:* paths + lightweight static parse.
   *tests:* known routes detected; gate detection. *why:* security-review orientation.
5. **`find_provider_files`** / **`find_tests_for_file`** — *purpose:* provider file map / source→test
   map. *inputs:* `{ provider }` / `{ filePath }`. *output:* path lists. *location:* `repoNav.ts`.
   *safety:* paths only. *tests:* convention mapping. *why:* speeds provider + test work.
6. **`provider_capability_matrix`** + **`provider_metadata_consistency_check`** +
   **`option_source_coverage_check`** — *purpose:* provider readiness/consistency from static
   registries + committed manifests. *inputs:* none / `{ provider? }`. *output:* matrices /
   `{ provider, inconsistencies[] }`. *location:* `scripts/mcp/tools/providers.ts` (extend) —
   **text-parse manifests, never import/execute them** (existing rule). *safety:* repo-static.
   *tests:* fixture providers; manifest-honesty detection; drift vs `option-source-manifest.json`.
   *why:* directly supports provider authoring + the "manifest honesty" CLAUDE.md rule.
7. **`list_recent_slice_docs`** + **`summarize_slice_status`** — *purpose:* orient on phase state /
   one slice's status. *inputs:* `{ phase? }` / `{ slicePath }`. *output:* doc list / parsed
   header+banner. *location:* `scripts/mcp/tools/docs.ts` (extend; reuse the doc whitelist).
   *safety:* doc-only. *tests:* header parsing. *why:* planning + closeout writing.

### Phase B — testing/verification helpers (local, validated, bounded)

8. **`run_jest_for_path`** — *purpose:* run jest for one allow-listed test path. *inputs:*
   `{ testPath }` (must resolve under `tests/`). *output:* `{ passed, failed, summary, failures[] }`
   (bounded, redacted). *location:* `scripts/mcp/tools/commands.ts`. *safety:* validated argv (no
   shell), timeout, output cap, redact. *tests:* path validation/traversal rejection, redaction.
   *why:* fast targeted feedback without the whole suite.
9. **`run_route_structure_tests`** / **`run_provider_metadata_tests`** / **`run_migration_lint`** —
   *purpose:* one-shot the structural-auth, discovery-meta-coverage, and migration-RLS
   (`lint:migrations`) gates. *inputs:* none. *output:* pass/fail summary. *location:* `commands.ts`
   (exact scripts/paths, no arg). *safety:* fixed allow-listed targets; `lint:migrations` is
   read-only (it does not apply migrations). *tests:* wrapper invokes the right target.
   *why:* security-review + provider + migration-awareness gates on demand.
10. **`summarize_last_test_failure`** — *purpose:* terse last-failure summary. *inputs:* none.
    *output:* `{ title, errorClass, stepLabel }`. *location:* `smoke.ts`/`commands.ts` (read the
    sanitized smoke artifact / local jest-json if present). *safety:* reads sanitized/local
    artifact only. *tests:* artifact parsing + no-leak. *why:* quick triage.
11. **`no_leak_scanner`** (dev aid) — *purpose:* scan a diagnostic DTO sample for forbidden shapes.
    *inputs:* `{ json }`. *output:* `{ violations[] }`. *location:* `scripts/mcp/tools/`. *safety:*
    pure local; not a runtime gate. *tests:* catches token/output/config-value shapes.
    *why:* guards the no-leak contract while building new diagnostics.

### Phase C — diagnostics doctors & reports (compose; preserve the architecture)

12. **`diagnose_workflow_graph`** (2B-5) — new gated `/workflow-graph` route; structural findings
    only. 13. **`doctor_workflow`** / **`doctor_provider`** / **`doctor_account_integration`** (2C) —
    compose existing tools/routes, no new routes (except graph). 14. **`generate_diagnostic_report`**
    (2D) — format merged sanitized DTOs → Markdown runbook. 15. **`generate_deploy_readiness_report`**
    — compose `typecheck`+`lint`+`lint:structure`+`lint:migrations`+route/provider structure tests +
    smoke-artifact summary into a pre-push checklist (read/run-checks only; **never** pushes or
    deploys). *Safety:* all reuse `applyDiagnosticsGate` for live data; doctors compose-not-duplicate;
    DTO no-leak. *Tests:* per-stage matrix from the roadmap §7 (gate, authz-no-fetch, mapping,
    no-leak, compose, MCP render). *Why:* turns the primitives into owner-friendly answers + a
    deploy-readiness gate, which is exactly the pre-rollout need.

### Phase D — deferred / requires explicit approval / do-not-build

- **`run_smoke_local`** — *Needs explicit Marcus approval.* Heavy local browser+server;
  localhost-only, opt-in env, never a deployed origin.
- **Running prod smoke from MCP**, **build**, **db:push / migration apply**, **any git
  push/PR/deploy**, **prod-data / secrets / workflow-mutation / arbitrary shell / arbitrary file
  read**, **new service-role DB access inside `scripts/mcp`** — **Do not build.** (Live data stays
  behind the existing gated routes; migrations/deploys stay in the human/CI flow.)

---

## 9. Owner recommendation & decisions needed

**Recommendation:** proceed with **Phase A** as the next small MCP slice — it is all
read-only/static/paths-only, highest leverage for daily build/debug, and adds **zero** live or
mutating surface. Bundle 2–4 tools per slice with their tests; each reuses the existing
whitelist + redaction + import-boundary guards. Treat Phase A as the "developer orientation"
layer that complements the diagnostics layer already shipped.

**Sequencing:** Phase A (orientation + verification-guidance) → Phase B (targeted local test
runners) → Phase C (graph/doctors/reports + deploy-readiness, following the roadmap's
2B-5→2C→2D order) → Phase D stays deferred/disallowed.

**Decisions needed from Marcus:**
1. **Approve Phase A scope** (which of the 7 Phase-A items to ship first — recommend
   `suggest_verification_for_changed_files`, `provider_metadata_consistency_check`,
   `find_route_handlers`, `repo_file_search`).
2. **`get_file_outline`** — OK to allow a byte-capped/redacted **outline** of allow-listed source
   files, or keep MCP strictly paths-only + docs-content-only? (Recommend: allow, with the cap.)
3. **`run_jest_for_path` (Phase B)** — confirm targeted local test execution is acceptable (it is
   local-only, validated argv, no shell).
4. **`run_smoke_local`** — defer (recommended) or explicitly approve a localhost-only variant?
5. **Runbook refresh** — approve a tiny follow-up doc edit to bring
   [internal-mcp-server.md](../../../runbooks/internal-mcp-server.md)'s tool table to the current
   21 (not done in this audit commit to keep it scoped).
6. **Folder structure** — `docs/slices/phase-4/` is at the 50-file cap; this audit seeded
   `phase-4/mcp/`. Decide whether to later migrate the existing `phase-4/mcp-*.md` cluster into
   `phase-4/mcp/` (a separate, link-updating cleanup) or leave them in place.

**Non-goals reaffirmed:** MCP stays internal developer tooling — read-only, import-fenced, gated
for live data, default-OFF/prod-locked. No product/runtime scope. No mutation, deploy, migration,
prod-data, or secret access is recommended at any phase.
