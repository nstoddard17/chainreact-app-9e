# Provider Metadata / Builder Launch-Gap Tracker

**Slice:** 4.PROVIDER-DOCS-1
**Type:** Doc-only tracker. **No runtime/source/test/metadata files modified.**
**Date:** 2026-05-25
**Branch:** `v2-provider-docs-1`
**Authoritative inputs (verified against live code, not docs):**
- `services/execution/handlers/_registry.ts` (registered runtime handlers)
- `tests/structure/discovery-meta-coverage.test.ts` (`COVERED_PROVIDERS` set)
- `services/discovery/_registry.ts` + `services/discovery/providers/*` (builder-visible metas)
- `services/options/_registry.ts` (options resolvers)
- `integrations/<provider>/**` filesystem counts
- Full Jest run `npx jest`: **1,113 passed / 1 skipped suites; 12,382 passed / 7 skipped tests; 0 failures.**

---

## 1. Accepted correction summary

The corrected provider-foundation status, accepted by Marcus on 2026-05-25:

> **Provider runtime is essentially complete across the 26 current V2 providers — but provider metadata/builder launch readiness still has a 9-provider gap.**

What this means precisely:

- **Runtime is real and complete.** All 26 providers (25 OAuth/token providers + `native`) have their full accepted action surface registered in the handler registry — **286 handlers**. Handler bodies are **real, not stubs** (verified: 0 stub/not-implemented markers across all `integrations/*/actions/`; representative bodies read in full — e.g. `integrations/shopify/actions/createOrder.ts`, `integrations/microsoft-excel/actions/updateRow.ts` — both make real provider API calls with `refreshAndRetry` OAuth + Zod-validated config).
- **Builder/metadata is NOT complete.** Only **17 of 26 providers** carry the ActionMeta/TriggerMeta + discovery-registry wiring that makes them usable in the Workflow Builder. The other **9 providers are runtime-present but builder-invisible** — they appear in `/api/providers` with `hasMetadata: false`, which the UI renders as **"coming soon"** with zero selectable actions/triggers.
- **The revived-7 provider closeout was accurate within its own scope.** `provider-completion-closeout.md` and `phase-2-final-closeout.md` declared completion for **the revived completion queue** (Discord, Google Docs, OneNote, Monday, Dropbox, Facebook, Google Analytics) + native nodes. They are correct for that scope. They did **not** assert that the 9 original Phase-1 providers were builder-metadata-complete — and there is no doc that does. The misread risk is treating "Phase 2 complete" as "all 26 providers are builder-ready."

**Framing rule going forward:** do not call the provider foundation "fully complete" or "launch-ready" until the 9 providers below are either metadata-covered or explicitly deferred out of launch scope by product decision.

---

## 2. The 22 metadata/builder-COVERED providers

> **Update (Slice 4.SHOPIFY-META-2):** `shopify` flipped pending → COVERED (17 → 18).
> **Update (Slice 4.EXCEL-META-3, 2026-05-25):** `microsoft-excel` flipped pending → COVERED — 10 ActionMeta + 5 polling TriggerMeta (resolvers shipped in EXCEL-META-2). Count 18 → 19.
> **Update (Slice 4.AIRTABLE-META-3, 2026-05-25):** `airtable` flipped pending → COVERED — 11 ActionMeta + 1 webhook TriggerMeta (resolvers shipped in AIRTABLE-META-2). Count 19 → 20.
> **Update (Slice 4.TRELLO-META-3, 2026-05-25):** `trello` flipped pending → COVERED — 8 ActionMeta + 6 per-board webhook TriggerMeta + 6 UI-scope `boardId` schema additions (resolvers shipped in TRELLO-META-2). Count 20 → 21.
> **Update (Slice 4.ONEDRIVE-META-3, 2026-05-25):** `microsoft-onedrive` flipped pending → COVERED — 7 ActionMeta + 1 whole-drive webhook TriggerMeta (`file_changed`, empty fields) + 4 UI-scope `parentItemId` schema additions (resolvers shipped in ONEDRIVE-META-2). FileRef deferred; `delete_item` high/destructive/confirm. Count 21 → 22.

Enforced 1:1 (every registered handler has a meta) by `COVERED_PROVIDERS` in `tests/structure/discovery-meta-coverage.test.ts`:

`native, github, gmail, microsoft-outlook, slack, notion, stripe, google-sheets, hubspot, mailchimp, discord, google-docs, microsoft-onenote, monday, dropbox, facebook, google-analytics, shopify, microsoft-excel, airtable, trello, microsoft-onedrive`

These are builder-usable today. Drift (adding a handler without a meta, or vice-versa) fails the structural test.

## 3. The 4 pending-metadata providers (launch-scope gap)

`microsoft-teams, google-calendar, google-drive, microsoft-outlook-calendar`

All 4 are **launch-scope** mainstream providers from the original Phase-1 foundation. **None** are future-expansion, rejected, or stale V1 artifacts. Each is **bucket A: a real provider-foundation gap at the metadata/builder layer.** (`shopify` shipped in SHOPIFY-META-2; `microsoft-excel` in EXCEL-META-3; `airtable` in AIRTABLE-META-3; `trello` in TRELLO-META-3; `microsoft-onedrive` in ONEDRIVE-META-3.)

---

## 4. What "covered" means (definition of done per provider)

A provider is metadata/builder-complete only when ALL of the following hold:

1. **ActionMeta** — every registered runtime action handler has a co-located `<action>.meta.ts` exporting a contract-valid `ActionMeta` (`contracts/actionMeta.ts`). Key invariant: `key === "${provider}:${type}"`.
2. **TriggerMeta** — every trigger that should ship has a `<trigger>.meta.ts` exporting a contract-valid `TriggerMeta` (`contracts/triggerMeta.ts`), and its activation hook is registered so `trigger-meta-activation-invariant.test.ts` passes. (Trigger coverage is not gated by the meta-coverage test — precedent set by Stripe — so actions-only or trigger-deferred providers are an explicit documented choice, never a silenced failure.)
3. **Discovery registry** — metas wired into `services/discovery/_registry.ts` (directly, or via a `services/discovery/providers/<provider>.ts` sub-registry to keep the central registry under the 400-line lint cap). Module-load validation (`ActionMetaSchema.parse` + duplicate-key rejection) runs centrally.
4. **Builder-visible** — `/api/providers` reports `hasMetadata: true`; `/api/providers/[id]/{actions,triggers}` return the provider's surface; the builder library panel renders the actions/triggers, not "coming soon".
5. **Options resolvers** — present for ID-bearing fields that need a picker, OR explicitly deferred with rationale (hand-typed IDs acceptable for a first pass). Resolvers live colocated under `integrations/<provider>/options/` and register in `services/options/_registry.ts`.
6. **COVERED_PROVIDERS / invariants** — provider added to `COVERED_PROVIDERS`; `discovery-meta-coverage`, `trigger-meta-activation-invariant`, and `sensitive-output-coverage` all pass, locking 1:1 handler↔meta drift protection in going forward.

---

## 5. Pending-provider table

Runtime counts from the handler registry + trigger tree. "Runtime triggers" counts trigger implementations present in `integrations/<provider>/triggers/**`; activation wiring is confirmed per-provider during its arc.

| # | Provider | Runtime actions | Runtime triggers | Current builder status | Missing metadata / resolver work | Recommended arc | Priority |
|---|---|---|---|---|---|---|---|
| ~~1~~ | ~~**shopify**~~ | 11 | 1 | ✅ **COVERED (SHOPIFY-META-2)** — `hasMetadata:true` | DONE: 11 ActionMeta + 1 TriggerMeta + `services/discovery/providers/shopify.ts` + COVERED flip. Resolvers deferred to optional SHOPIFY-META-3. | — | done |
| ~~1~~ | ~~**microsoft-excel**~~ | 10 | 5 | ✅ **COVERED (EXCEL-META-3)** — `hasMetadata:true` | DONE: EXCEL-META-2 resolvers (`workbooks`/`worksheets`/`tables` + `tablesList` helper) + EXCEL-META-3 (10 ActionMeta + 5 TriggerMeta + sub-registry + COVERED flip). `delete_row`/`delete_worksheet` = high/destructive/confirm. `columns` resolver deferred. | — | done |
| 3 | **google-calendar** | 5 | 1 | "coming soon" | 5 ActionMeta + 1 TriggerMeta. Optional `calendars` resolver (deferrable). | GCAL-META | 3 |
| 4 | **microsoft-outlook-calendar** | 5 | 1 | "coming soon" | 5 ActionMeta + 1 TriggerMeta. Mirror of GCAL. | OUTLOOK-CAL-META | 4 |
| 5 | **google-drive** | 5 | 1 | "coming soon" | 5 ActionMeta + 1 TriggerMeta. `folders` resolver **already exists** in options registry. | GDRIVE-META | 5 |
| ~~6~~ | ~~**microsoft-onedrive**~~ | 7 | 1 | ✅ **COVERED (ONEDRIVE-META-3)** — `hasMetadata:true` | DONE: ONEDRIVE-META-2 resolvers (`folders`/`items`, reuse `driveItemsList`, no new helper) + ONEDRIVE-META-3 (7 ActionMeta + 1 `file_changed` webhook TriggerMeta (`fields:[]`) + 4 UI-scope `parentItemId` schema fields + `services/discovery/providers/microsoft-onedrive.ts` + COVERED flip). `delete_item`=high/destructive/confirm. **FileRef deferred** (content=textarea, downloadUrl=sensitive string; producesFileRef/consumesFileRef=false) — future ONEDRIVE-FILEREF runtime slice. `:drives` rejected. | — | done |
| 7 | **microsoft-teams** | 5 | 1 | "coming soon" | 5 ActionMeta + 1 TriggerMeta + `teams`→`channels` cascade resolvers (team→channel is a real two-hop picker). | TEAMS-META | 7 |
| ~~8~~ | ~~**airtable**~~ | 11 | 1 (webhook `record_changed`) | ✅ **COVERED (AIRTABLE-META-3)** — `hasMetadata:true` | DONE: AIRTABLE-META-2 resolvers (`bases`/`tables`/`fields`/`views`/`attachment_fields` + `basesList` helper) + AIRTABLE-META-3 (11 ActionMeta + 1 TriggerMeta + `services/discovery/providers/airtable.ts` + COVERED flip). `delete_record` = high/destructive/requiresConfirmation. `recordId` typed; field maps paste-JSON; `airtable:records` rejected. | — | done |
| ~~9~~ | ~~**trello**~~ | 8 | 6 | ✅ **COVERED (TRELLO-META-3)** — `hasMetadata:true` | DONE: TRELLO-META-2 resolvers (`boards`/`lists`/`cards`/`members`/`labels` + 5 read helpers) + TRELLO-META-3 (8 ActionMeta + 6 webhook TriggerMeta + 6 UI-scope `boardId` schema fields + `services/discovery/providers/trello.ts` + COVERED flip). NO destructive action (archive_card reversible; no deletes). `create_board` medium + explicit visibility w/ public warning. `checklists`/`check_items` rejected. | — | done |

Total pending: **20 runtime action handlers across 4 providers** (286 total − 266 covered = 20). _(67/9 → 56/8 after SHOPIFY-META-2 → 46/7 after EXCEL-META-3 → 35/6 after AIRTABLE-META-3 → 27/5 after TRELLO-META-3 → 20/4 after ONEDRIVE-META-3.)_

---

## 6. Standing clarifications

- **Runtime handlers are real and non-stubbed.** This track is purely about the builder-metadata facet; it does not reopen runtime/parity, which the parity closeouts correctly cover.
- **Users cannot use these 9 providers in the Builder until their metadata exists.** A connected Shopify/Excel/Airtable integration is non-actionable in the builder today (no selectable actions/triggers; "coming soon" chip).
- **Cross-effect with billing (no billing change in this track):** per `task-cost-billing-foundation-closeout.md`, a provider action is billable (1 task on success) **only when the discovery registry supplied its meta** (grounding). Today these 9 providers' actions are `unknown_node` (0 + warning) because they have no meta. Adding their metas makes them billable at the default 1-task category cost automatically — via grounding, not via any billing code edit.
- **No manifest dishonesty.** Manifests already declare `actions: true` truthfully (handlers ARE registered). `hasMetadata:false` is computed from the discovery registry, so the "coming soon" state is honest, not a hidden gap.

---

## 7. Closeout criteria for the 9-provider metadata track

The track is complete when, for **all 9 providers**:

- [ ] every registered runtime action has an `ActionMeta` (1:1, enforced by `COVERED_PROVIDERS`);
- [ ] every trigger that should ship has a `TriggerMeta` with a registered activation hook (or is explicitly deferred/rejected with rationale recorded in the provider's plan);
- [ ] required options resolvers exist, or are explicitly deferred with rationale (hand-typed IDs acceptable);
- [ ] `/api/providers` reports `hasMetadata: true` for the provider (no longer "coming soon");
- [ ] the provider is in `COVERED_PROVIDERS`;
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] per-provider targeted tests pass; **no runtime handler behavior changed** unless explicitly required and documented.

When all 9 are covered (or formally deferred out of launch scope by product decision), the provider foundation may be called **launch-ready** — and this tracker is closed.

---

## 8. Status snapshot

```text
RUNTIME:            26/26 providers, 286 handlers, real (non-stubbed), full suite green.
BUILDER METADATA:   22/26 providers covered (266/286 handlers). 4 providers / 20 handlers pending.
                    (Shopify → SHOPIFY-META-2; Microsoft Excel → EXCEL-META-3; Airtable → AIRTABLE-META-3;
                     Trello → TRELLO-META-3; Microsoft OneDrive → ONEDRIVE-META-3, 2026-05-25.)
NEXT ARC:           one of the remaining 4 — microsoft-teams, google-calendar, google-drive, microsoft-outlook-calendar. (google-drive's `folders` resolver already exists; calendars need light or no resolvers; teams needs a team→channel cascade resolver.)
DO NOT CALL:        "provider foundation fully complete / launch-ready" until the 4 are covered or product-deferred.
```
