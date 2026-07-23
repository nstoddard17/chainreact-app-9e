# Linear — Configuration Design (CS-3 LINEAR-1)

Rule-17 requirement: classify **every field of every shipped node** as exactly one of:
core user decision · static provider resource · dynamic upstream value · fixed repeated
value · derived/defaulted value · conditional option · advanced control · internal
implementation detail — and make the UI follow the classification.

Shipped nodes (4): **Find Issues** (`list_issues`), **Create Issue** / **Update Issue**
(`save_issue`, split), **Add Comment** (`save_comment`). Snapshot provenance is
`docs-draft` pending live re-capture; the classification below holds regardless of
capture because it reflects Linear's documented field semantics.

## Field classification

### Create Issue (`linear:create_issue`)
| Field | Classification | UI treatment |
|---|---|---|
| `title` | core user decision | Setup, required, text |
| `team` | **static provider resource** | Setup, required, text (name-or-id) — **resolver deferred**, see below |
| `description` | core user decision | Setup, textarea |
| `priority` | conditional option | Setup, number (0–4; documented mapping in description) |
| `project` | static provider resource | Setup, text (name-or-id) — resolver deferred |
| `state` | static provider resource | Setup, text (name-or-id) — resolver deferred |
| `assignee` | static provider resource | Setup, text (name/email/"me") — resolver deferred |
| `labels` | static provider resource | Setup, string-array (names-or-ids) — resolver deferred |
| `dueDate` | core user decision | Setup, text (ISO date) |
| `cycle`, `milestone`, `estimate`, `delegate`, `parentId`, `links`, `blocks`, `blockedBy`, `relatedTo` | advanced control | Advanced tab |
| `id` | internal implementation detail | **omitted** (create half of the dispatcher) |

### Update Issue (`linear:update_issue`)
`id` = core user decision (required; "Issue ID or identifier, e.g. LIN-123"). All other
fields mirror Create Issue's classifications (static resources deferred to text). Relation
edits + `duplicateOf` + `remove*` = advanced control.

### Add Comment (`linear:add_comment`)
| Field | Classification | UI treatment |
|---|---|---|
| `issueId` | core user decision | Setup, required, text (issue id/identifier) |
| `body` | core user decision | Setup, required, textarea (Markdown) |
| `parentId` | advanced control | Advanced (reply-to-thread) |
| `id`, `projectId`, `initiativeId`, `documentId`, `milestoneId` | internal implementation detail | **omitted** (issue-scoped v1) |

### Find Issues (`linear:find_issues`)
`query`, `team`, `state`, `assignee`, `label`, `project`, `priority`, `cycle` = core
filter decisions (Setup); static-resource filters (team/state/assignee/label/project)
share the resolver-deferral note. `limit`, `cursor`, `orderBy`, `includeArchived`,
`delegate`, `parentId`, `createdAt`, `updatedAt` = advanced controls.

> **CS-6B update (resolvers shipped).** 3 of 5 pickers are now SHIPPED from real
> captured evidence: **`linear:teams`**, **`linear:assignees`** (label=displayName,
> never email), **`linear:labels`** — wired to the `team`/`assignee`/`labels`
> fields (now comboboxes that keep manual name/ID entry) on find/create/update
> issue. `linear:projects` (cert workspace returned zero projects → insufficient
> evidence) and `linear:issue-statuses` (team-scoped, not captured) are deferred —
> no fabricated shapes; see [`live-capture-evidence.md`](./live-capture-evidence.md)
> for the exact commands to finish them.

## Option resolvers — PRIMED, not yet shipped (documented per the task; NOT faked)

**Decision: no option resolvers ship in CS-3. Team / Project / State / Assignee / Label
stay text inputs that accept a NAME or an id.** This is honest and rule-compliant, not a
raw-id box:

1. **Linear's tool schemas explicitly accept names.** `team` = "Team name or ID",
   `state` = "State type, name, or ID", `assignee` = "User ID, name, email, or 'me'",
   `project` = "Project name, ID, or slug", `labels` = "Label names or IDs". The server
   resolves names → ids. So an ordinary user types "Engineering", "In Progress", "me" —
   **no provider-internal identifier is required** on the Setup path (the rule-17 bar).

2. **A clean resolver cannot be built yet, and faking one is forbidden.** Real dropdowns
   need (a) Linear's list tools (`list_teams`/`list_projects`/`list_users`/…) and (b)
   their result shapes to map `{value,label}`. Neither is in the certified snapshot: the
   current `docs-draft` capture holds only `list_issues`/`save_issue`/`save_comment`, and
   no tool declares an `outputSchema`. Building a resolver against unverified tool names
   or guessed result fields would be exactly the "fake dropdown" the brief prohibits.

3. **Root cause = the same live-credential blocker as Phase 1.** Resolvers unblock the
   moment the owner connects Linear: a live `mcp:import capture` refreshes the snapshot
   with the real list tools, and live result evidence fixes the `{value,label}` mapping.

**CS-6 resolver plan (ready to execute once credentials exist).** The path is the
standard `services/options` one, unchanged for MCP:
- Add `list_teams` / `list_projects` / `list_users` / `list_workflow_states` /
  `list_labels` to the catalog (`decision: "ship"`-adjacent, or list-only) after live
  capture confirms names + schemas.
- Ship `OptionsResolver`s (`linear:teams`, `linear:projects` `dependsOn` team,
  `linear:states` `dependsOn` team, `linear:assignees`, `linear:labels`) that call the
  list tool through the SAME shared MCP client + `refreshAndRetry`, mapping results to
  `{value,label}` with `hasMore` — exactly like `eden:boards`.
- Set `optionsSource` (+ `dependsOn`) on the corresponding catalog `fieldOverrides` and
  regenerate; the `option-source-reference-integrity` test enforces the resolver exists.
- Manual name-or-id entry stays available in Advanced for power users (as today).

## Outputs — CS-6 status (partly certified)

- **Find Issues — CERTIFIED structured** from the real captured `list_issues`
  shape: `issues: array`, `hasNextPage: boolean`, `cursor: string`. Downstream
  reads `{{find.issues}}` (each issue carries id/title/url/status/team/priority).
- **Create / Update Issue, Add Comment — still text-only.** Their tools
  (`save_issue`/`save_comment`) are WRITES and were not auto-captured
  (write-evidence deferred) — the result shape is not certified, so we do NOT
  fabricate a structured output. The identifier the brief's "Create issue → Slack"
  example wants lives on `save_issue`'s write result (list_issues does NOT return
  it), so certifying `create_issue` → `{ identifier, id, url, … }` needs a
  write-evidence capture (explicit operator mode) — the remaining gap for that
  flagship workflow. The executor already supports the structured shape; this is
  a curation + evidence step, no code change.
