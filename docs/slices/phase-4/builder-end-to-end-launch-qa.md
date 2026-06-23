# 4.BUILDER-E2E-LAUNCH-QA — Builder End-to-End Launch QA Sweep

**Type:** QA sweep + one safe fix. **Branch:** `v2-main`. **Date:** 2026-06-23.
**Method:** Code-trace audit of the full builder user journey against 15 launch invariants,
backed by the existing automated suites, plus a manual-QA checklist for the parts that can only
be confirmed against the deployed app with live credentials. One real launch gap was found and
fixed (GitHub repository picker). **Nothing pushed.**

> **Scope honesty.** This sweep is a **code-level** audit — it traces each journey through the
> real call chain and verifies the invariant in source, and it leans on the existing unit/
> integration suites. It did **not** drive the live deployed app and click every journey
> field-by-field; the §3 manual checklist is the remaining live pass (needs the deployed build +
> connected providers). The earlier config-field UX closeout already flagged that not every
> scope-dependent picker was live-smoked field-by-field.

---

## 1. Summary

The workflow builder is **launch-ready at the code level**. All 12 primary journeys
(new workflow → add trigger → add action → configure → use new field UX → save → activate →
run/test → Runs tab → open failed step → edit → save again, with Settings / Data Map / undo-redo
staying coherent) trace cleanly, and all 15 launch invariants verify in source with the existing
test suites backing them.

**One real gap found and fixed:** GitHub action/trigger `repository` fields were raw `owner/repo`
text even though the `github:repos` resolver was already registered — they now use the searchable
picker (with manual `owner/repo` entry preserved). No other unwired-picker gaps were found.

No blockers requiring a migration, new OAuth scope, provider-portal change, paid-service decision,
or large refactor were encountered.

---

## 2. Invariant verification (code-traced)

Legend: ✅ verified in source (+ existing test) · ✅✱ verified, one fix applied · 🔎 needs the
live manual pass in §3.

| # | Invariant | Status | Evidence (file:line) |
|---|---|---|---|
| 1 | No field asks for raw IDs where a picker exists | ✅✱ | Spot-checked + scanned all `integrations/**/*.meta.ts`. The new pickers are wired (Slack channel/user/mpim, GCal `calendarId`, Drive `fileId`, Gmail `labelIds`, HubSpot enums). **Gap found + fixed:** GitHub `repository` (4 actions + `new_commit` trigger) now `combobox` + `github:repos` (§5). Remaining raw-text ids are intentional (upstream-fed `eventId`/`messageId`, opaque Stripe ids, Airtable `recordId`, GA client `userId`). |
| 2 | Pickers show reconnect / missing-scope cleanly | ✅ | Resolvers map 403 / `missing_scope` → `PROVIDER_REAUTH_REQUIRED`; `ComboboxField` `needs-reconnect` case renders "Reconnect {provider} in Apps" — verified in the prior SWEEP-4 verification report. |
| 3 | Manual-entry fallback works (and in error states) | ✅ | `ComboboxField` renders the search input + "Use this ID" item ([config-modal/fields/ComboboxField.tsx](../../../features/workflow-builder/config-modal/fields/ComboboxField.tsx)) above `renderList()`, so it stays reachable in `error` / `disconnected` / `needs-reconnect` (only `owner-gated`/`owner-must-connect` early-return). |
| 4 | Variable insertion in combobox/manual + text fields | ✅ | `TextField`/`TextareaField` always mount `VariablePickerButton`; `ComboboxField` mounts it when `allowManualEntry`. |
| 5 | Geoapify location never exposes the API key | ✅ | Key read only in [services/geoapify/autocomplete.ts](../../../services/geoapify/autocomplete.ts) + the route; client ([lib/api/geoapify.ts](../../../lib/api/geoapify.ts)) calls only `/api/geoapify/autocomplete`; structural client/server boundary test enforces it. |
| 6 | Location still allows free text if autocomplete fails | ✅ | [LocationField.tsx](../../../features/workflow-builder/config-modal/fields/LocationField.tsx) `<Input>` always renders; suggestions only show when populated; route returns `{suggestions:[], degraded:true}` on missing-key/error (never 500). |
| 7 | Required-field validation matches the action | ✅ | Validation is metadata-driven (`FieldMeta.required`) via `ConfigModalShell`/`SchemaForm`; no hardcoded parallel list. Spot-checked meta↔schema agreement on `slack:send_channel_message`, `google-calendar:create_event`, `hubspot:create_contact`. |
| 8 | Save does not activate or run | ✅ | Builder Save → `graphSlice.save()` → `PATCH /api/workflows/[id]` → `saveDraftDefinition()` (draft write only; the only side effect is deactivation cleanup when an active workflow's activatable trigger changed). Activate (`POST .../activate`) and Run (`POST .../run-now`) are separate routes. |
| 9 | Test/run creates visible Runs entries | ✅ | Run → `run-now` route → `enqueueRun()` persists a run row → Runs tab (`RunsPanel`) fetches via `listWorkflowRuns` / the runs route. |
| 10 | Runs tab shows failure info without raw payloads | ✅ | `toWorkflowRunDetail()` drops `triggerEvent`/`fatalError`, runs each step through `toSafeStepError()` (humanized) + `redactStepOutput()`; per-step output is author-test-gated. `ClassifiedErrorBlock` renders the humanized classification only. |
| 11 | Data Map shows outputs without leaking sensitive/raw data | ✅ | `DataMapPanel` shows output names/types/`{{token}}`; sensitive outputs get a badge and **no** sample value; samples come from the already-redacted run DTO; `looksSecretLike()` heuristic masks secret-named paths. |
| 12 | Settings has no fake controls / "coming later" spam | ✅ | `SettingsPanel` — every control is real (name edit, copy-id, delete-to-trash) or honest read-only (status, publish state, save status, last-run, timestamps, run-behavior notes). No disabled placeholders. |
| 13 | Undo/redo works after config edits | ✅ | `graphSlice` `set`-wrapper captures a pre-edit snapshot on any dirty edit incl. `updateNodeConfig`; `undo()`/`redo()` restore via `rawSet`; `undoWithConfigSync` keeps the config panel in sync. |
| 14 | Check workflow / React Agent stays deterministic unless deeper AI explicitly clicked | ✅ | Default "Check workflow" composes a review from the deterministic validator with `agentText: null` — **no LLM**. The only LLM path is the explicit "Ask React for deeper suggestions" button (`requestWorkflowGuidance`). No passive model call. |
| 15 | No secrets/tokens/credential-ids/raw payloads render anywhere | ✅ | Run/debug/Data-Map surfaces render only humanized errors + sanitized DTOs; no `JSON.stringify(output)`, no token/credentialId render; server gates output to the test-run author + redaction. |

---

## 3. Manual QA checklist (the remaining live pass)

These steps confirm the same invariants against the **deployed** build with connected providers —
the part a code trace can't do. Run after confirming the deploy includes the latest builder
commits and the SWEEP-4 scopes (and after Marcus's reconnects).

**Core journey (any provider):**
- [ ] New blank workflow opens; add a manual/other trigger; add a provider action.
- [ ] Required fields are marked; Save is blocked only on real blocking validation.
- [ ] **Save** persists a draft and does **not** flip the workflow to active or start a run.
- [ ] **Activate/Publish** (where applicable) is a distinct action from Save.
- [ ] **Run/Test** produces a new entry in the **Runs** tab.
- [ ] Open a **failed** run → it shows a plain-English error (no raw payload/token/stack).
- [ ] "Open failed step" deep-links into the config; editing + Save does **not** re-run.
- [ ] **Undo/redo** after a config edit restores correctly; Data Map + Settings stay coherent.

**Field UX:**
- [ ] date / time / datetime / timezone pickers render natively and store the expected strings.
- [ ] `datetime-utc` stores a `…Z` instant; an offset/`{{var}}`/epoch value falls back to text.
- [ ] **Location**: typing suggests addresses; with no/failed autocomplete it stays free text;
      stored value is the formatted address string. (Confirm the key is never in the network tab.)
- [ ] Combobox: option selection works; **manual ID** entry works; **variable** insertion works.
- [ ] String-array (e.g. Gmail `labelIds`) per-chip picker works.

**Scope-dependent pickers (the ones not yet field-by-field live-smoked):**
- [ ] **Google Calendar** `Calendar` lists calendars (reconnect if it shows "Reconnect").
- [ ] **Slack** channel / user / **group-DM** pickers list real data (group DM needs live mpim data).
- [ ] **HubSpot** contact/company/ticket enum dropdowns list portal options (see §7 ticket note).
- [ ] **Google Drive** file picker lists files.
- [ ] **GitHub** `repository` now lists your repos (new this sweep) — and accepts a typed `owner/repo`.

**Provider smokes where practical:** Slack send-channel/DM, GCal create-event (calendar + datetime
+ timezone + location), Gmail add-label, Drive file picker, HubSpot enum fields, Trello due/start,
Outlook event datetime/location.

---

## 4. Test strategy decision

Existing automated coverage is strong and is the right backbone; this sweep adds a targeted guard
rather than a parallel harness.

- **Field renderers / config modal / save / runs / data-map / settings / undo-redo** — already
  covered by `tests/unit/features/workflow-builder/**` (config-modal/fields, `RunsPanel`,
  `DataMapPanel`, `SettingsPanel`, `historyNav`, `graphSlice`, `configSlice`) and the per-provider
  integration configs under `tests/integration/features/workflow-builder/**`.
- **Field-wiring invariants** ("field X uses picker Y / stores the same key") — centralized in
  [tests/unit/integrations/config-field-ux-sweep.test.ts](../../../tests/unit/integrations/config-field-ux-sweep.test.ts);
  the GitHub fix added a `builder-qa-1` guard there.
- **Action execution** — `tests/integration/smoke-actions/run-all.smoke.test.ts` runs every fixture
  through the real engine, env-gated (SKIP without creds, FAIL is a gate breach). Safe locally.
- **Decision:** automated guard for the fix + this manual checklist for the live pass. No new
  harness was warranted.

**Known automated-coverage gaps (non-blocking, noted for follow-up):** concurrent save + graph-edit
reconciliation has no test; option-source loader error/timeout paths are only partially covered;
config-modal deep-overflow has no height regression test. None block launch (all have a safe
runtime fallback), but they're the strongest places to add coverage next.

---

## 5. Fix applied this sweep

**GitHub `repository` → `github:repos` picker.** The `github:repos` resolver
([integrations/github/options/repos.ts](../../../integrations/github/options/repos.ts)) was
registered (analytics widget origin) and returns `{ value: full_name }` = `owner/repo` — exactly
what these fields store — but the action/trigger metas still used raw `type: "text"`. Wired to
`combobox` + `optionsSource: "github:repos"` + `allowManualEntry: true` on:
`github:add_comment`, `github:create_branch`, `github:create_issue`,
`github:create_pull_request`, and the `github:new_commit` trigger.

**Why it's safe:** stored value is the identical `owner/repo` string (no handler/schema change);
`required` is unchanged; manual entry preserves the type-it-yourself path; GitHub is a personal
credential so the picker lists the editor's own repos via the credential-policy path. Guarded by
the new `builder-qa-1` test.

---

## 6. Boundaries respected

- **No push. No deploy. No migration. No new OAuth scope. No provider-portal assumptions.**
- **No LLM** path was exercised or changed (the deterministic Check-workflow path was only read).
- **No raw payloads / tokens / secrets / file contents** were surfaced; the fix is metadata-only.
- **Parallel-session files untouched.** A parallel session is actively editing `google-drive`
  metas, `tests/smoke-actions/**`, `tests/fixtures/action-smoke/**`, and `scripts/trash/**`. This
  sweep read google-drive as reference only and changed **none** of those files. The GitHub metas
  it edited are clean / not parallel-owned.

---

## 7. Remaining notes / blockers

- **No launch blockers found.**
- **Live picker pass still owed (§3).** Not every scope-dependent picker has been live-smoked
  field-by-field against the deployed build; the fallback/reconnect behavior makes any
  un-reconnected picker degrade gracefully, so this is a confidence pass, not a blocker.
- **HubSpot ticket property picker — runtime assumption (carried).** `ticket_category` /
  `ticket_source_type` read under the existing broad `tickets` scope (no granular
  `crm.schemas.tickets.read` exists). Expected to work; if it 403s the field shows Reconnect +
  manual entry still works (reconnect won't fix it — free text is the real fallback). Settle in §3.
- **GA `sendEvent.userId`** stays free text by design (a client-supplied id; no users resolver).

---

## 8. Launch-readiness verdict

**The builder create → configure → save → activate → run → debug → edit path is launch-ready at
the code level**, with one gap fixed (GitHub repo picker) and the existing test suites green. The
only outstanding item is the §3 live manual pass on the deployed build (especially the
scope-dependent pickers), which is a confidence check rather than a blocker because every picker
degrades safely to manual/free-text + a Reconnect prompt.

---

## 9. Recommended next workstream

1. **Run the §3 live manual pass** on the deployed build (cheap, high-confidence; settles the
   scope-picker + HubSpot-ticket questions in minutes).
2. **Close the noted automated-coverage gaps** — option-source loader error/timeout states; a
   config-modal overflow regression; concurrent save + graph-edit reconciliation.
3. **Optional:** a structural guard that flags any `type: "text"` meta field whose name maps to an
   existing resolver source (would have caught the GitHub gap automatically) — needs a curated
   allow-list of intentional raw-id fields to avoid false positives.

---

## 10. Confirmation

Code sweep + one metadata-only fix + one test + this doc. Verification in the commit report.
**Nothing pushed.**
