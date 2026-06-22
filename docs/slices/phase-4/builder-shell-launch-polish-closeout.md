# BUILDER-SHELL-LAUNCH-POLISH-CLOSEOUT — Builder Shell Launch-Polish Closeout

**Type:** Docs-only closeout / handoff. No source, migrations, tests, or UI changes.
**Date:** 2026-06-22
**Branch:** `v2-main` (local only — **nothing pushed**)
**Arc:** validation-drawer cleanup → Check-workflow (pill → deterministic review →
instant-local + AI-opt-in) → existing-node setup controls (+ keyboard/reveal) → config-panel
sync → Agent-rail refactor → memory closeout → top-bar undo/redo cleanup → undo/redo keyboard
shortcuts → Runs tab → runs-route test repair → Data Map polish (DATA-MAP-2 → DATA-MAP-3) →
Settings initial pass (SETTINGS-2) → Settings completion pass (SETTINGS-COMPLETE) → **this
closeout**.

> **Hold-for-review:** this arc is complete **locally** and intentionally unpushed pending
> review of the full builder upgrade batch. A **final pre-push full verification** is still
> required before push (see §5).

---

## 1. Summary

The workflow builder **shell** is now meaningfully closer to launch-ready: the top bar, the
canvas/tabs frame, the React Agent rail (with a deterministic "Check workflow" review), the
workflow-scoped Runs tab, the Data Map reference surface, and the Settings tab have each had a
focused polish/correctness pass. Real controls exist where backend/model support exists;
fake/future controls were removed; honest read-only facts are shown where no workflow-level
configuration exists yet.

**Boundary:** the **shell / tabs / rail / top-bar are closed out for the current supported
workflow model.** This closeout deliberately draws the line *before* the next major arc —
**config menu / field UX modernization** (searchable resource selectors, date/time pickers,
variable-insertion UX, etc., see §7). Nothing in this arc touches per-field config UX.

---

## 2. Commits included

Real local hashes from `git log` (chronological, oldest → newest). All on `v2-main`, unpushed.

| Area | Commit | Date | Summary |
|---|---|---|---|
| Validation drawer cleanup | `0f78c3576` | 2026-06-21 | Remove obstructive validation callout; header pill is the single issue entry (BUILDER-VALIDATION-DRAWER-CLOSE-AND-CALLOUT-CLEANUP). |
| Check workflow pill | `410fc977b` | 2026-06-21 | "Check workflow" review pill in the Agent rail above the chat input (BUILDER-AGENT-RAIL-CHECK-WORKFLOW). |
| Check workflow review | `8216014d3` | 2026-06-21 | Deterministic, validation-aware "Check workflow" review (BUILDER-AGENT-RAIL-CHECK-WORKFLOW-REVIEW). |
| Check workflow deterministic | `7f59dd362` | 2026-06-21 | Make "Check workflow" an instant local deterministic review; AI as opt-in follow-up (BUILDER-AGENT-RAIL-CHECK-WORKFLOW-DETERMINISTIC). |
| Canvas-preview guard | `5f1ad520a` | 2026-06-21 | Suppress "Show on canvas" for same-shape AI suggestions (BUILDER-AGENT-RAIL-CANVAS-PREVIEW-GUARD). |
| Existing-node setup controls | `0545d3e54` | 2026-06-21 | Inline "Fix setup issues" controls in the Check workflow review (BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP). |
| Setup controls keyboard/reveal | `0b579429d` | 2026-06-21 | Enter-to-update + open/highlight node config from rail setup controls (BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP-KEYBOARD/-REVEAL). |
| Config panel sync | `da9891fa4` | 2026-06-21 | Sync the open config panel when the Agent rail updates a node (BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP-SYNC). |
| Agent rail refactor cleanup | `adfa63c9c` | 2026-06-21 | Extract Agent-rail pieces to clear max-lines warnings (no behavior change). |
| Agent-rail memory closeout | `c30258e5c` | 2026-06-21 | docs(memory): close out the BUILDER-AGENT-RAIL Check-workflow arc. |
| Top-bar undo/redo/history cleanup | `1f752991c` | 2026-06-21 | Remove redundant top-bar run-history button + wire draft undo/redo (BUILDER-TOPBAR-UNDO-REDO). |
| Undo/redo keyboard shortcuts | `9e9c0ed39` | 2026-06-21 | Keyboard undo/redo shortcuts in the workflow builder (BUILDER-TOPBAR-UNDO-REDO keyboard). |
| Runs tab | `ef2ff8214` | 2026-06-21 | Workflow-scoped Runs tab with run detail + debugging (BUILDER-RUNS-TAB-1). |
| Runs route test repair | `837509506` | 2026-06-21 | Repair stale runs route test harness for the V2-READY-51 gate (BUILDER-RUNS-TAB-1). |
| Data Map polish | `d64e08551` | 2026-06-21 | Make Data Map a useful variable/reference surface (BUILDER-DATA-MAP-2). |
| Data Map readability | `0a6395e01` | 2026-06-21 | Make Data Map variables readable + more useful (BUILDER-DATA-MAP-3). |
| Settings initial pass | `437bdbb9f` | 2026-06-22 | Flesh out the workflow Settings tab (BUILDER-SETTINGS-2). |
| Settings completion pass | `6ca2b5ce6` | 2026-06-22 | Complete the workflow Settings tab — honest, launch-ready (BUILDER-SETTINGS-COMPLETE). |

> Smoke-action / provider commits interleaved in the same `git log` window (SMOKE-*, ONEDRIVE-*,
> FB-*, EXCEL-*) are **not part of this arc** and are excluded.

---

## 3. Product behavior now

### Top bar
- The redundant run-history button was removed; run history lives in the Runs tab.
- Draft **undo/redo** is wired into the top bar against the graph history.
- The validation **header pill** is the single entry point for opening the issue list.

### Builder tab / canvas
- The canvas frame, add-node flow, and per-node tail "+" affordances are unchanged in behavior;
  this arc did not modify graph-edit semantics beyond wiring undo/redo to the history nav.

### React Agent rail / Check workflow
- **"Check workflow"** runs an **instant, local, deterministic** validation-aware review (no
  model call). It surfaces structural/required-field issues from builder validation.
- Deeper **AI review is an explicit opt-in follow-up**, never the default action of the pill.
- The review can offer **inline "Fix setup issues" controls** for existing nodes; updating a
  field from the rail **syncs the open config panel** and can open/highlight the target node.
  Enter-to-update is supported.
- Same-shape AI suggestions no longer show a misleading "Show on canvas" preview.
- Rail internals were extracted into smaller pieces to clear max-lines warnings (no behavior
  change).

### Runs tab
- A **workflow-scoped Runs tab** lists this workflow's runs with status + timestamps + a
  per-run source badge, and a run-detail view for debugging (per-step status; test-run output
  preview is author-gated).
- Backed by the **pre-existing** run endpoints (`/api/workflows/[id]/runs` and
  `…/runs/[runId]`) — no new endpoint was added (see §4).

### Data Map tab
- A schema-driven **variable/reference surface**: each node's available output variables are
  listed and made readable, with **sanitized scalar sample previews** drawn from the latest
  **test** run when available, and truncation notes for large outputs.

### Settings tab
- **Name** — fully editable; saves via the real `updateWorkflow(id, { name })` PATCH; the
  builder header updates immediately on save; save/saved/error state is shown.
- **Status & publishing** — accurate lifecycle label (Draft/Active/Paused/Disabled/Ready to
  resume), publish state (Published / Not published yet from `activeRevisionId`), an
  "Unpublished changes" row for active workflows whose draft diverges from the live revision,
  real dirty/saving state, and created/updated in readable local time (UTC on hover).
- **Run behavior** — explains manual vs automated vs scheduled; schedule is shown **read-only
  only when** a schedule trigger config exists; no schedule controls for manual workflows.
- **Error handling & notifications** — honest read-only facts: a run stops on the first failed
  step (the real engine default); a failed run notifies the workflow's creator in-app (the real
  V2 behavior); access is managed by account membership.
- **Folder** — honest read-only pointer to the workflows list (where account-correct folder
  management lives).
- **Workflow ID** — copyable for support/debug.
- **Danger zone** — two-step-confirmed delete via the existing **soft-delete → Trash** flow,
  with an error state and clean navigation away on success.
- **Removed:** the fake/disabled Description textarea (no `description` field exists in the
  model — see §6).

### Validation drawer / header
- The obstructive in-canvas validation callout was removed. The **header pill** is the single,
  non-blocking entry to the validation drawer; the drawer's close behavior is consistent with
  the inspector/results drawer modes.

### Undo/redo
- Available from both the **top bar** and **keyboard** (Ctrl/Cmd+Z, Ctrl+Y / Shift+Z), scoped
  to the builder and skipping editable text fields so native text undo keeps working.

---

## 4. Safety boundaries

These invariants hold after the arc (claims tied to commits/files; git-verified where noted):

- **Check workflow is deterministic, free, and uses no LLM / no AI credits.** The pill runs a
  local validation-aware review (`7f59dd362`, `8216014d3`); model use is a separate, explicit
  opt-in.
- **Optional deeper AI remains explicit** — never triggered implicitly by opening the rail or
  clicking "Check workflow".
- **Runs tab renders sanitized DTOs only.** The run contracts strip raw `triggerEvent`,
  engine-internal `fatalError`, and `userId`; per-step `output` is author-gated to **test**
  runs; the humanized `errorClassification` is the only error surface
  (`contracts/workflow.ts`).
- **Data Map hides/masks sensitive data and does not expose raw payloads** — it shows
  schema-driven variables plus **sanitized scalar sample previews** from the latest test run;
  sensitive fields are masked per the panel's documented contract
  (`features/workflow-builder/canvas/DataMapPanel.tsx`).
- **Settings name edit does not mutate the graph or activate/run/publish.** It PATCHes the name
  only (no `draftDefinition`), proven by the panel tests.
- **Delete uses the existing soft-delete / Trash flow** (`deleteWorkflow` → `DELETE
  /api/workflows/[id]` → recoverable Trash), behind a two-step confirmation.
- **No new DB migration in this arc** — git-verified: no `supabase/migrations/` file is touched
  by any of the 18 arc commits.
- **No new backend endpoint in this arc** — git-verified: no `app/api/**/route.ts` file is
  touched by any of the 18 arc commits (the Runs tab consumes pre-existing routes; the
  runs-route "repair" touched only the **test** harness).
- **No secrets/tokens/credential IDs/raw provider payloads are rendered** anywhere in the shell
  surfaces (Settings, Runs, Data Map) — the Settings panel test asserts this explicitly, and the
  Runs/Data Map DTOs are sanitized by contract.

---

## 5. Verification run during the arc

**Run *this session* (during the Settings completion pass, `6ca2b5ce6`), with actual results:**
- `npm run typecheck` (`tsc --noEmit`) → **clean**.
- `npm run lint:structure` → **OK** (every leaf folder ≤ 50 files).
- `eslint` on the three touched Settings files → **clean**.
- `npx jest …/canvas/SettingsPanel.test.tsx` → **21/21 pass**.
- `npx jest …/canvas/WorkflowCanvas.test.tsx` → **20/20 pass**.
- `npx jest tests/unit/features/workflow-builder` → **1366/1366 pass, 93 suites** (covers the
  rail / Check-workflow, validation drawer, undo/redo, Runs-tab, Data-Map, and Settings panel
  units that exist under that tree).

**Inherited from the per-slice commit reports (NOT re-run this session):**
- Per-slice typecheck / eslint / targeted Jest for the earlier slices (validation drawer,
  Check-workflow series, setup controls, config sync, undo/redo, Runs tab, Data Map) were green
  at their own commits.
- **Workflow runs route tests** were repaired and green at `837509506` (per its commit report);
  they were **not** re-run in this session (the runs-route test lives outside
  `tests/unit/features/workflow-builder`).

**Honesty note:** a **final pre-push full closeout verification** (whole-repo `typecheck` +
`lint` + the full `jest` run + the runs-route route tests) is **still required before pushing**
and has **not** been run this session.

---

## 6. Known caveats / future product additions

- **graphSlice max-lines override** is accepted as **temporary**; a future graphSlice
  split/refactor can reduce it. Not blocking launch.
- **`app/api/workflows/_shared.ts` max-lines warning is pre-existing** — not introduced by this
  arc; left as-is.
- **Settings plain-anchor eslint inline-disable** (the Folder "workflows list" link uses a
  hard-nav `<a>` with `@next/next/no-html-link-for-pages` disabled) is **intentional** (the
  builder canvas can render in isolation without app-router context). Revisit only if a better
  low-risk link/navigation pattern exists.
- **Retry-from-failed-step is intentionally not built.** The engine stops on the first failed
  step; resume-from-failed-node support is a later engine arc, so Settings states the default
  honestly rather than implying a configurable retry policy.
- **Account-wide run history is separate** from the builder Runs tab (the Runs tab is
  workflow-scoped; the account `/runs` surface is its own page with its own narrower DTO).
- **Description support is not part of the current supported workflow model** — there is no
  `description` column / contract field; adding it would require workflow model + API + DB
  (migration) support. The fake control was removed rather than faked.
- **Builder-side folder editing is deferred** — the move-to-folder API exists, but a builder
  picker needs **account-correct folder context** first (the builder can run under an
  active-account mismatch, where a picker would offer wrong-account targets). Folder management
  stays on the workflows dashboard for now.
- **Config menu / field UX modernization is the next arc** (§7) — explicitly **not** part of
  this closeout.

---

## 7. Next arc: config menu / field UX modernization

The next major arc modernizes **per-field config UX** inside the node config menu. Framing
(audit before code):

- **Searchable dropdowns for provider resources** (channels, repos, bases, boards, etc.).
- Users **choose by name/label**, but the **stable ID is what gets stored** (label is display
  only; the resolved value is the provider ID).
- **Allow manual ID entry** for power users / automation, alongside the searchable selector.
- **Date / time / calendar pickers** for date-shaped fields.
- **Timezone-aware datetime UX** (resolve + display in the right zone; store unambiguous values).
- **Location / address fields** backed by **Google Places / Maps** — only **if feasible and if
  API-key, cost, and privacy constraints are resolved** first.
- **Contacts / users / channels / projects as searchable selectors** where the provider's API
  supports listing them.
- **Variable-insertion UX** for text fields (insert `{{node.field}}` references ergonomically).
- **Field-type audit before coding** — enumerate every field type in the registry and decide
  the target control per type.
- **No broad backend / provider changes without an audit matrix** (field type → control →
  option source → storage shape → provider support).

This is a UX + metadata-driven arc; it should start from an audit, not from code.

---

## 8. Closeout status

- **Local only, not pushed.**
- **Ready for final pre-push verification after Marcus approves.**
- **Next recommended step: config field UX audit** (the §7 field-type audit matrix), before any
  config-menu implementation.
