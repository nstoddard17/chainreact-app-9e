# Linear — Live Capture Evidence (CS-6)

**Capture:** `npm run mcp:import -- capture linear --evidence` (owner, real
authenticated connection to `https://mcp.linear.app/mcp`).
**Snapshot:** `integrations/linear/mcp-snapshot.json` — `capturedBy: "live"`,
`capturedAt: 2026-07-23T03:05:29Z`, **52 tools**. `protocolVersion` not surfaced
by the server on `tools/list` (null; negotiated at `initialize`).
**Drift:** `check linear` → overall **NONE** across all 52 certified tools.
This supersedes the former `docs-draft` (3-tool) assumptions.

## Differences from the provisional (docs-draft) assumptions

The 3 previously-assumed tools all changed shape (hashes differ). Live-only
additions the catalog now handles:

| Tool | Live-only fields added | Type changes | Catalog handling |
|---|---|---|---|
| `list_issues` (find_issues) | `release` | — | `release` → Advanced |
| `save_issue` (create/update) | `addReleases`, `removeReleases`, `setReleases`, `slaBreachesAt`, `slaType` | `dueDate`, `estimate`, `project` → nullable (`anyOf`) | new fields → Advanced; `removeReleases` omitted on **create** (nothing to remove) |
| `save_comment` (add_comment) | `statusUpdateId`, `statusUpdateType` | — | both omitted (issue-scoped node) |

The nullable type changes compile cleanly (the compiler's `[X, null]` idiom);
no field became newly required, so no shipped action lost a certified argument.
The former resolver assumption "team/state fields are name-or-id text" holds; the
live server confirms the **list tools exist** to upgrade them to pickers (below).

## Evidence coverage (`mcp-evidence.json`)

`capture --evidence` result: **1 captured, 3 skipped, 0 manual review.**

- **`list_issues` — CAPTURED (structured).** Real result shape (type-only,
  scrubbed): `{ issues: [{ id, title, description, priority:{value,name}, url,
  gitBranchName, createdAt, updatedAt, …sla nulls…, slaType, status, statusType,
  labels:[], team, teamId }], hasNextPage, cursor }`. Recommendation:
  `structured_output_curatable`; notes: `pagination_detected`,
  `resolver_candidate`. **Finding:** list_issues does NOT return a human
  `identifier` (e.g. LIN-123) — it has `id` (UUID) + `url`. The identifier
  lives on the write path (`save_issue` result), not here.
- **`save_issue` ×2, `save_comment` — SKIPPED** (writes; write-evidence deferred
  by policy → their result shapes are NOT certified).

## What CS-6 certified from this evidence

- **`find_issues` structured output** (`issues:array`, `hasNextPage:boolean`,
  `cursor:string`) — curated from the real list_issues shape; the executor
  projects these bounded keys (no raw spread). `outputQuality: good`.
- `create_issue` / `update_issue` / `add_comment` remain **text-only** — their
  write-tool result shapes were not captured, and we do not fabricate them.

## Resolver sources — primed, pending a 2nd evidence pass

The live list tools are confirmed and added to the catalog as `defer` resolver
sources with read-only evidence approvals:

| Picker | Tool | Args (required) | Committed sampleArgs |
|---|---|---|---|
| Team | `list_teams` | none | `{ limit: 5 }` |
| Project | `list_projects` | none | `{ limit: 5 }` |
| Assignee | `list_users` | none | `{ limit: 5 }` |
| Labels | `list_issue_labels` | none | `{ limit: 5 }` |
| State | `list_issue_statuses` | **`team`** | none — account-specific `team` can't be committed |

Their result shapes were NOT in this capture (they had no evidence block at
capture time). Building honest resolvers requires those shapes — so the exact
next step is a **second evidence pass**:

```
export MCP_IMPORT_BEARER=<dev-linear-token>
npm run mcp:import -- capture linear --evidence
```

This re-captures the snapshot AND records the 4 committed-arg list tools' shapes
into `mcp-evidence.json`.

---

## CS-6B outcome — 2nd evidence pass + resolvers shipped

The 2nd `capture --evidence` recorded **5 captured** (list_issues + the 4 list
tools). Real shapes:

| Tool | Shape (type-only) | Resolver |
|---|---|---|
| `list_teams` | `{ teams:[{ id, name }], hasNextPage }` | **`linear:teams`** shipped (value=id, label=name) |
| `list_users` | `{ users:[{ id, name, displayName, email, … }], hasNextPage }` | **`linear:assignees`** shipped (value=id, label=displayName; **email never surfaced**) |
| `list_issue_labels` | `{ labels:[{ id, name, color }], hasNextPage }` | **`linear:labels`** shipped (value=id, label=name) |
| `list_projects` | `{ projects:[], hasNextPage }` — **EMPTY** in the cert workspace | `linear:projects` **deferred** — insufficient evidence (no rows to map) |
| `list_issue_statuses` | not captured (**requires a `team` arg**) | `linear:issue-statuses` **deferred** — team-scoped |

**3 resolvers shipped** (`linear:teams` / `linear:assignees` / `linear:labels`),
wired to the `team` / `assignee` / `labels` fields (now comboboxes that keep
manual name/ID entry) on find/create/update issue. `linear:projects` and
`linear:issue-statuses` are NOT shipped — no fabricated shapes.

### Remaining owner commands to finish certification

```
# 1. Write-evidence for the write actions' result shapes (structured outputs).
#    Uses a DISPOSABLE record; no auto-cleanup. Create create.json / update.json /
#    comment.json fixtures with your test-team/issue values, e.g.:
#      { "args": { "title": "ChainReact cert — DELETE ME", "team": "<your-team>" } }
npm run mcp:import -- write-evidence linear --tool save_issue  --fixture create.json  --allow-write-evidence --yes-run-write
npm run mcp:import -- write-evidence linear --tool save_issue  --fixture update.json  --allow-write-evidence --yes-run-write
npm run mcp:import -- write-evidence linear --tool save_comment --fixture comment.json --allow-write-evidence --yes-run-write
# → then curate create_issue/update_issue/add_comment `outputs` from the real
#   shapes (id/identifier/title/url/status), regenerate, and re-run tests.

# 2. Projects + statuses + cycles resolvers: re-capture with a workspace that HAS
#    projects, and add transient evidence blocks for the team-scoped list tools:
#      { tool: "list_issue_statuses", decision: "defer", reason: "...",
#        evidence: { sampleArgs: { team: "<your-team>" } } }
#      { tool: "list_cycles", decision: "defer", reason: "...",
#        evidence: { sampleArgs: { teamId: "<your-team-id>" } } }
npm run mcp:import -- capture linear --evidence
# → then ship linear:projects (dependsOn team) + linear:issue-statuses (dependsOn
#   team) + linear:cycles (dependsOn team).

# 3. Run both live workflows (with ENABLE_EXPERIMENTAL_MCP_APPS=true) and verify
#    OAuth refresh/reconnect, run history, drift, and downstream mappings.
```

---

## CS-6C outcome — 2026-07-22 (final production-readiness batch)

The CS-6C environment had `MCP_IMPORT_BEARER`, `LINEAR_CLIENT_ID`, and
`LINEAR_CLIENT_SECRET` **all unset** — so no live capture, write-evidence, or
OAuth workflow run could be executed. Nothing was fabricated. Work split into
what was code-completable now vs. what stays owner-blocked:

**Shipped in CS-6C (no live credential needed, verified by tests):**

- **Priority is now a labelled closed dropdown** on Find/Create/Update Issue
  (No priority · Urgent · High · Medium · Low). Linear types `priority` as a bare
  `number` with the set only in prose; a new compiler `enumValues` override
  (`core/mcpCompile`) renders a `select` and constrains the generated zod schema
  to `z.coerce.number().int().min(0).max(4)` — the picker's string coerces to the
  wire integer and negative / out-of-range / non-numeric values are rejected at
  parse (runtime enforced; tested in `mcp-generated.test.ts`).
- **Numeric bounds**: `limit` → 1..250, `estimate` → ≥ 0 (new `numericMin`/
  `numericMax` overrides).
- **`dueDate` → date picker** on Create + Update (new compiler `format` override;
  Linear types it as a bare string). Schema enforces `YYYY-MM-DD`; variable input
  preserved. Date/date-time audit: `slaBreachesAt` was already the date-time
  control (`format: date-time` in the tool schema); `createdAt`/`updatedAt`
  (Find, Advanced) intentionally stay text — they accept ISO-8601 **or durations**
  (`-P1D`), which a date picker would block.
- **Config-UX cleanups**: plain-English labels/descriptions (SLA fields, parent
  fields, team/labels descriptions no longer say "required when creating" / "as a
  JSON array"). No MCP terminology anywhere (already true; reconfirmed).
- **State / Cycle / Project resolver sources STAGED** in `mcp-catalog.ts` with
  exact capture instructions; `list_cycles` added as a defer source. Not shipped
  as pickers — see below.
- **Broken Apps-page icons fixed** for Linear (+ Eden) — `public/integrations/
  linear.svg` / `eden.svg` were missing; added + regression test
  (`providerIconUrl.test.ts` now asserts every enabled provider has its asset).

**Still owner-blocked (must NOT be fabricated):**

| Gap | Blocker | Unblock command |
|---|---|---|
| Create/Update/Comment **structured outputs** (Parts 1–2) | write-tool result shapes are `skipped` in `mcp-evidence.json` | `mcp:import write-evidence` for `save_issue`×2 + `save_comment` (disposable records), then curate `outputs`, regenerate |
| **State** picker (`linear:issue-statuses`) | `list_issue_statuses` needs a `team` arg; not captured | add transient `evidence.sampleArgs.team`, `capture --evidence` |
| **Cycle** picker (`linear:cycles`) | `list_cycles` needs a `teamId` arg; not captured | add transient `evidence.sampleArgs.teamId`, `capture --evidence` |
| **Project** picker (`linear:projects`) | `list_projects` captured EMPTY (item shape unconfirmed) | `capture --evidence` from a workspace WITH projects |
| **Live E2E** (Part 7): OAuth, dropdowns live, run history, reconnect, drift | no `LINEAR_CLIENT_ID`/`SECRET`; no connection | run both workflows per the runbook Phase 6 |

Until the write-evidence + resolver captures + live E2E are done, Linear stays
`isExperimental: true` (Phase 7 gate not met). State/Cycle/Project remain
name-or-id text on the Setup path in the interim (documented, not a silent gap).

---

## CS-6C LIVE run — 2026-07-23 (credentials supplied via `.env.local`)

The owner supplied `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET` / `MCP_IMPORT_BEARER`
in `.env.local` (git-ignored). The mcp-import CLI now loads it via `@next/env`'s
`loadEnvConfig` (Next tooling convention). Live path confirmed: `check linear`
→ **no drift across 52 tools**; server reachable; bearer valid.

**Resolvers shipped from REAL live evidence (read path — token has `read`):**

| Picker | Tool | Live shape (type-only) | Resolver |
|---|---|---|---|
| Project | `list_projects` | `{ projects:[{ id, name, url, status:{id,name,type}, … }], hasNextPage }` — **non-empty** (cert project "Delete Me") | **`linear:projects`** (value=id, label=name; optional `team` cascade filter) |
| State | `list_issue_statuses` | top-level array `[{ id, type, name }]` (team-scoped) | **`linear:issue_statuses`** (value=id, label=name; **requiredDeps: team** → "choose a team first") |
| Cycle | `list_cycles` | **empty `[]`** — cert team ("ChainReact") has no cycles configured | **NOT shipped** — item shape unconfirmed; Cycle stays name/number/ID text (no guessed shape) |

State + Project are now cascade comboboxes (`dependsOn: team`) on Find / Create /
Update Issue — dropdown + manual name/ID fallback. Team was discovered via
`list_teams` (single team) and the disposable project via `list_projects`; no ID
was hand-entered.

**Write path — BLOCKED by token SCOPE (not absence):**

`save_issue` / `save_comment` were denied live: **`McpPermissionError: the
connected token lacks write permission`**. The dev `MCP_IMPORT_BEARER` is
**read-only**. Therefore:
- `create_issue` / `update_issue` / `add_comment` structured outputs **stay
  text-only** — the write result shapes could not be observed and are NOT
  fabricated. `mcp-evidence.json` records `save_issue` / `save_comment` as
  `skipped` with the read-only-scope reason.
- Live E2E Workflows A/B (which create/update/comment) could not run.

**Unblock:** re-mint `MCP_IMPORT_BEARER` with **Read & write** scope in Linear
(Settings → API), then run `mcp:import write-evidence` for `save_issue` (create +
update fixtures) and `save_comment`, curate the bounded outputs (id / identifier /
title / url / status / team / project), regenerate. For the two live workflows,
connect Linear (OAuth) + Slack in a running app instance and execute them.

**Cycle:** re-capture from a team that HAS cycles to confirm the item shape, then
ship `linear:cycles` (dependsOn team) the same way.

### Linear release decision (CS-6C): STAYS `isExperimental: true`

Phase-7 gate: structured write outputs (gate 3) and both live E2E workflows +
reconnect/drift-in-flight (gate 4) are **not** met — blocked on a write-scoped
token and a full-app E2E, neither available this session. Everything else is done:
live snapshot + no drift, real dropdowns for Team/Assignee/Labels/Project/State,
Priority dropdown, dueDate picker, no MCP terminology.

### Eden (Part 13) — hide plan, staged for the release point

Eden go-live is tied to "the same release point," which Linear did not reach, and
the owner said not to auto-flip Eden — so Eden is **not** flipped and its 3
unverified social-publish writes are **not** unregistered this batch (they remain
fully tested; `scheduling-metadata.test.ts` asserts them registered + visible).
Ready-to-run hide for the release point: remove `edenSchedulePostMeta` /
`edenPublishPostNowMeta` / `edenUpdateScheduledPostMeta` from `EDEN_ACTION_METAS`
(`services/discovery/providers/eden.ts`) and the matching 3 lines from
`services/execution/handlers/_handlerInventory.ts`, update
`scheduling-metadata.test.ts` to assert those 3 are withheld from the catalog, and
change the manifest note 36→33. Do this together with the write-scoped-token
certification so both providers reach live in one verified batch.
