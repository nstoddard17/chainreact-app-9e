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
into `mcp-evidence.json`. `list_issue_statuses` needs a real `team` (add
`evidence: { sampleArgs: { team: "<your-team>" } }` transiently, or derive
State from the `status`/`statusType` strings list_issues already returns). With
those shapes, ship `linear:teams` / `linear:projects` / `linear:assignees` /
`linear:labels` / `linear:states` resolvers and wire `optionsSource` (+ regenerate;
`--print-registration` then prints the `services/options/_registry.ts` entries).
