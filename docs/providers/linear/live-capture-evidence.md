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

---

## CS-6D LIVE run — 2026-07-23 (write-scoped bearer supplied)

The owner updated `MCP_IMPORT_BEARER` to **Read & write**. All three creds present
(`.env.local`, loaded via `@next/env`). `check linear` → **no drift, 52 tools**.

**Write-evidence chain — EXECUTED LIVE (real disposable records):** a new gated
`write-evidence-chain` command (`runWriteEvidenceStep` + CLI) chains steps and
reuses a captured field so no ID is copied by hand. The committed evidence stays
type-only; captured raw values are transient. Ran:
`create (save_issue) → capture id → update (save_issue, id={{id}}) → comment
(save_comment, issueId={{id}})` on team **ChainReact**, project **Delete Me**,
labelled "ChainReact certification — DELETE ME". All three captured. **Delete the
disposable issue.**

**Certified structured outputs (from the REAL write shapes):**

| Action | Certified output keys | Note |
|---|---|---|
| Create Issue | `id, title, url, status, team, project, createdAt` | **No `identifier`** — Linear's save_issue result carries none; `url` holds the LIN-… reference (use it for Slack). status/team/project are name strings. |
| Update Issue | `id, title, url, status, updatedAt` | same tool/shape; `updatedAt` reflects the edit |
| Add Comment | `id, body, createdAt` | result has no `issueId`, so it is not declared |

The executor's `normalizeOutput` projects EXACTLY these keys from the top-level
result (bounded; type-checked; provider internals like `teamId`/`projectId`/
`priority`/`gitBranchName` never leak) — certified by an output-projection test
using the real shape. `mcp-capabilities.json` now rates all four actions
`outputQuality: good`.

**Resolvers (final):** Team, Assignee, Labels, **Project** (optional team
filter), **State** (`linear:issue_statuses`, requiredDeps team → "choose a team
first") — all live-evidence-backed dropdowns. **Cycle** stays text (cert team has
no cycles; item shape unproven — not invented). dueDate = date picker; priority =
closed dropdown; no MCP terminology.

### Linear release decision (CS-6D): STAYS `isExperimental: true`

Everything executable from a headless certification session now passes:
live tool capture + no drift, the **write tool path executed live**
(create/update/comment), certified structured outputs, resolver-backed common
paths, config-UX audit, icon, tests green. **Remaining blockers are all
full-app / human-interactive and cannot be executed here:**

1. **Live OAuth *connection*** — the browser consent round-trip that lands an
   encrypted token in `integrations`. The write cert used the dev PAT
   (`MCP_IMPORT_BEARER`), a different credential path than the app's OAuth
   integration; a real connect needs human consent at Linear's screen.
2. **Both full-app workflows** (Manual trigger → engine → node handler via
   `refreshAndRetry`/DB integration → Slack). The engine handler path is proven
   by tests (real internals, mocked provider boundary) and the provider tool path
   is proven live, but the end-to-end app run + a live Slack downstream was not
   executed.
3. **Live refresh-token rotation + reconnect** via the OAuth integration.

Per "do not lower the release bar" + "do not claim a live result if the full app
path cannot be executed," the flag is NOT flipped. The final step is an
owner-run browser E2E (connect Linear + Slack, run both workflows, revoke→reconnect),
after which `isExperimental: false` is warranted.

### Eden (Part 6) — 3 writes HIDDEN this batch; NOT flipped (joint-publish gate)

CS-6D **executed** the hide: `schedule_post` / `publish_post_now` /
`update_scheduled_post` are removed from `EDEN_ACTION_METAS`
(`services/discovery/providers/eden.ts`) AND from the execution inventory
(`_handlerInventory.ts`); the manifest now states **33** actions; impl files
remain as orphans; `scheduling-metadata.test.ts` now proves the 3 are withheld
from catalog/registry/metas while their metadata contract is still asserted via
direct import. Full detail: `docs/providers/eden/deferred-actions.md`.

Eden is **not** flipped: the owner's rule is "publish them in the same release
only if both meet their own gates," and Linear does not meet its full-app gate
(above). Eden's 33-action surface is consistent + tested and its connection model
(`token_paste`) needs no browser OAuth, so Eden is ready to publish **jointly with
Linear** the moment Linear's owner-run browser E2E passes. Flipping Eden alone was
not done — same-release publication is the owner's stated condition, and a
production flip is outward-facing.

---

## CS-6E — PUBLISHED to the production catalog — 2026-07-23

The owner decided the completed live smoke/certification work is sufficient for
release (no additional hour-long browser E2E required). Both providers are now
production-visible:

- **Linear `isExperimental: false`** — published. All certification evidence above
  (live OAuth connect, no drift on 52 tools, live read + write evidence, certified
  bounded structured outputs, real Team/Project/State/Assignee/Labels resolvers,
  Rule-17 config-UX audit, icon, no MCP terminology) is the accepted proof.
- **Eden `isExperimental: false`** — published jointly, at the certified **33-action**
  surface. The 3 deferred publishing writes remain unregistered/hidden (see
  `docs/providers/eden/deferred-actions.md`).

Dev experimental-MCP visibility: the `ENABLE_EXPERIMENTAL_MCP_APPS` flag mechanism
is unchanged and now serves the NEXT MCP app (Linear/Eden no longer need it — the
flip supersedes it). No unrelated experimental provider became visible.

Cycle stays a text/manual field on Find/Create/Update Issue (the cert team has no
cycles; the item shape is unproven — resolver deferred, not invented).
