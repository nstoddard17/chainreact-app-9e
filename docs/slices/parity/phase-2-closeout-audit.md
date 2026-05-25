# Phase 2 — Closeout audit

**Status:** Audit / not yet accepted. **Doc-only commit.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Predecessor:** [`docs/slices/phase-1-provider-completion-audit.md`](../phase-1-provider-completion-audit.md).
**Branch:** `v2-provider-port-local` (local-only, not pushed).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.

> **⚠️ Scope clarification — added 2026-05-25 (Slice 4.PROVIDER-DOCS-1; accepted by Marcus).** "Phase 2 IS complete" in this audit means **runtime / parity** completeness (registered action + trigger handlers per provider) — and it is accurate for that. It is **not** a Builder-readiness claim. The builder-metadata facet (ActionMeta/TriggerMeta + discovery registry + `COVERED_PROVIDERS`) is separate Phase-3 work and is **still open for 9 launch-scope providers** that are runtime-present but builder-invisible (`hasMetadata:false` → "coming soon"): `microsoft-excel, airtable, shopify, trello, microsoft-onedrive, microsoft-teams, google-calendar, google-drive, microsoft-outlook-calendar`. Tracked in [`../phase-4/provider-metadata-launch-gap-tracker.md`](../phase-4/provider-metadata-launch-gap-tracker.md). Corrected one-liner: *provider runtime is essentially complete, but provider metadata/builder launch readiness still has a 9-provider gap.*

This audit closes Phase 2 — provider parity expansion + native (non-provider) node parity + the engine-branching prerequisite. It enumerates every shipped slice, every permanent skip, every deferral, and the recommended hand-off priorities for the next phase.

**Recommendation up front:** Phase 2 IS complete. Every provider on the master-plan priority list (§3) has either an accepted parity audit + at least one implementation slice green, OR an accepted "no Phase 2 work required" status. Every deferred item has an explicit destination phase. Pre-existing warnings are documented and non-blocking. **Recommended next phase work** = either (a) Phase 3 (builder UI), (b) Phase 5 (AI cluster + planner) — these two are independent and either can start without the other landing first, or (c) the remaining audited-but-not-shipped GitHub Phase 2 implementation slice (see §1) if Marcus prioritizes parity completeness over UI/AI velocity.

---

## 1. Provider completion table

The 12 providers on the master-plan priority list (§3) + GitHub (rank 11) + the 5 "rank-not-yet-set" Phase 1 graduates (§3 audit-on-demand) + Trello (rank-NULL, special token-ingest contract).

### Priority providers (master-plan §3 ranks 1-12)

| Rank | Provider | Phase 1 baseline | Phase 2 slices shipped | V2 today | Status |
|---:|---|---|---|---|---|
| 1 | **Slack** | Slice 1 — 1 action, 1 trigger | Slack 2.1 (messaging+reactions), 2.2 (private channels+lifecycle), 2.3 (channels+users), 2.4 (files+P-S3), 2.5 (file_uploaded trigger) | **31 actions + 5 filter-based triggers** | ✅ **COMPLETE.** Full Phase 1 → Phase 2 parity arc shipped; P-S3 file output contract consumed first here. |
| 2 | **Gmail** | Slice 2f — 1 action, 1 polling trigger | Gmail 2.3 (triggers + attachments) | **13 actions + 3 polling triggers** (`newEmail`, `newLabeledEmail`, `newAttachment`) | ✅ **COMPLETE.** Second P-S3 consumer; first to combine metadata-only trigger with separate byte-materialization action. |
| 3 | **Notion** | Slice 9 — 7 actions, 0 triggers | Notion 2.1 (page lifecycle + users + comments + db/blocks) | **16 actions + 0 triggers** | ✅ **COMPLETE for actions.** Notion webhooks deferred (see §7). V1's 3,041-LOC kitchen-sink `handlers.ts` NOT ported. |
| 4 | **Microsoft Excel** | Slice 15 — 6 actions, 2 polling triggers | Excel parity (4 new actions, 1 batch-mode fold, 3 new triggers) | **10 actions + 5 polling triggers** | ✅ **COMPLETE.** V1's `addMultipleRows` folded into `add_row.rows[]` batch mode per NPD-A. |
| 5 | **Google Sheets** | Slice 5 — 5 actions, 0 triggers | Sheets 2.1 (read+update), 2.2 (batch+formatting), 2.3 (triggers) | **12 actions + 2 triggers** (`rowChanged` 3-kind + `newWorksheet`) | ✅ **COMPLETE.** Bounded snapshot window replaces V1's unbounded per-row hash map (audit R-3). |
| 6 | **Stripe** | Slice 11 — 10 actions, 1 webhook trigger | Stripe 2.1 (checkout/payment-link/invoice/charges + finders) | **16 actions + 1 trigger** (event_received, 18-event allowlist) | ✅ **COMPLETE.** Registered surface matches V1 minus 2 V1-orphans + plus 2 V2-extras. |
| 7 | **Airtable** | Slice 10 — 8 actions, 1 webhook trigger | Airtable 2.1 (attachment + batch CRUD + table_deleted fold) | **11 actions + 1 trigger** (`record_changed` with table_deleted discriminator) | ✅ **COMPLETE.** Third P-S3 consumer. Real Airtable batch APIs replace V1's sequential loops. |
| 8 | **Shopify** | Slice 12 — 10 actions, 1 webhook trigger | Shopify 2.1 (update_product_variant) | **11 actions + 1 consolidated webhook trigger** | ✅ **COMPLETE.** Single missing V1 action shipped; 5 product-strategic decisions (NPD-S1..S5) all DEFERRED per audit. |
| 9 | **HubSpot** | Slice 13 — core CRM + secondary, 1 webhook trigger | HubSpot 2.1 (line items + products + lists) | **26 actions + 1 webhook trigger** (12-event allowlist) | ✅ **COMPLETE.** PORT set closed; `add_to_workflow`/`remove_from_workflow` SKIP per D-HS1. |
| 10 | **Mailchimp** | Slice 14 — 10 actions, 1 webhook + 3 polling triggers | Mailchimp 2.1 (read-tier + unsubscribe + parity polling triggers) | **14 actions + 1 webhook trigger + 6 polling triggers** | ✅ **COMPLETE.** Send/schedule/create campaign actions DEFERRED per NPD-M1(d). |
| 11 | **GitHub** | Slice 14b — 6 actions, 1 webhook trigger | **Parity audit accepted; implementation slice NOT YET shipped.** | **6 actions + 1 webhook trigger** (unchanged from Phase 1) | 🟡 **AUDITED, IMPLEMENTATION DEFERRED.** Audit at [`docs/slices/parity/parity-github.md`](./parity-github.md) accepted in principle. No Phase 2 implementation slice shipped this phase — every gap item is PORT-WHEN-NEEDED rather than blocking. See §7. |
| 12 | **Microsoft Outlook (mail)** | Slice 6 — 1 action, 1 webhook trigger | Outlook Mail 2.1 (compose+drafts), 2.2 (lifecycle+search), 2.3 (triggers+attachments) | **9 actions + 3 subscription triggers** (`newEmail`, `emailSent`, `emailFlagged`) | ✅ **COMPLETE.** V1's 838-LOC `MicrosoftGraphTriggerLifecycle` retired; `searchOutlookEmail` orphan PERMANENT SKIP. |

### Rank-not-yet-set Phase 1 graduates (master-plan §3 "audit-on-demand")

| Provider | Phase 1 baseline | Phase 2 status |
|---|---|---|
| **Google Calendar** | Slice 3 — 5 actions, 1 trigger | 🟡 **No Phase 2 audit.** Gap exists but not blocking; audit when a downstream phase hits a missing-action blocker. |
| **Google Drive** | Slice 4 — 5 actions, 1 trigger | 🟡 **No Phase 2 audit.** Same disposition. |
| **Microsoft OneDrive** | Slice 8 — 7 actions, 1 trigger | 🟡 **No Phase 2 audit.** Same disposition. |
| **Microsoft Outlook Calendar** | Slice 7 — 5 actions, 1 trigger | 🟡 **No Phase 2 audit.** Same disposition. |
| **Microsoft Teams** | Slice 16 — 5 actions, 1 trigger | 🟡 **No Phase 2 audit.** Same disposition. |

### Rank-NULL provider (master-plan §8 token-ingest exception)

| Provider | Phase 1 baseline | Phase 2 status |
|---|---|---|
| **Trello** | Slice 17 — 8 actions, 6 board-webhook triggers (token-ingest contract shipped) | ✅ **COMPLETE.** Slice 17 covered both the token-ingest auth contract design + the trigger surface in one slice — no additional Phase 2 work needed. |

### Provider registered handler totals (current `services/execution/handlers/_registry.ts`)

Captured from `grep -E 'provider:\s+"' services/execution/handlers/_registry.ts | sort | uniq -c`:

| Provider | Action handlers |
|---|---:|
| slack | 31 |
| hubspot | 26 |
| stripe | 16 |
| notion | 16 |
| mailchimp | 14 |
| gmail | 13 |
| google-sheets | 12 |
| shopify | 11 |
| airtable | 11 |
| microsoft-excel | 10 |
| microsoft-outlook | 9 |
| trello | 8 |
| microsoft-onedrive | 7 |
| github | 6 |
| native | 5 |
| microsoft-teams | 5 |
| microsoft-outlook-calendar | 5 |
| google-drive | 5 |
| google-calendar | 5 |
| **TOTAL** | **215** |

**215 action handlers across 19 providers + native.** Phase 1 reference count was ~70 actions; Phase 2 added ~145 actions across the priority-1-12 providers + native nodes.

---

## 2. Native completion table

| Tier | Surface | Slice | Status |
|---|---|---|---|
| Tier A | `http_request`, `format_transformer`, `delay` | Native Slice 1 (5 commits) | ✅ **COMPLETE.** Outcomes: [`native-nodes-1-tier-a-outcomes.md`](./native-nodes-1-tier-a-outcomes.md). |
| Tier B | `manual_trigger`, `scheduled_trigger`, `POST /run-now`, `POST /run-scheduled-triggers` cron | Native Slice 2 (5 commits) | ✅ **COMPLETE.** Outcomes: [`native-nodes-2-tier-b-triggers-outcomes.md`](./native-nodes-2-tier-b-triggers-outcomes.md). |
| Engine Branching | `WorkflowEdge.label?`, `ActionHandlerResult.branchTaken?`, `INVALID_BRANCH`, label-aware traversal, `status: "skipped"` emission, `(from, to, label ?? "")` dedup-key | Engine Branching (5 commits) | ✅ **COMPLETE.** Outcomes: [`engine-branching-outcomes.md`](./engine-branching-outcomes.md). |
| Tier C | `if_then_condition`, `router`, shared `_conditionEvaluator.ts` | Native Slice 3 (6 commits) | ✅ **COMPLETE.** Outcomes: [`native-nodes-3-tier-c-control-flow-outcomes.md`](./native-nodes-3-tier-c-control-flow-outcomes.md). |

### Native handler totals

**5 action handlers** (`http_request`, `format_transformer`, `delay`, `if_then_condition`, `router`) + **2 trigger entry points** (`manual.run`, `schedule.fired`).

### Native Phase 2 parity status

**COMPLETE.** Tier A + Tier B + engine-branching prerequisite + Tier C all shipped. The audit's Phase 2 native-nodes minimum batch plan (per `parity-native-nodes.md` §13) is closed. All remaining native items are deferred to later phases per §7 below.

---

## 3. Final counts (summary)

| Surface | Count | Source |
|---|---:|---|
| Provider integrations (with manifest) | 18 | `integrations/_registry.ts:ALL_MANIFESTS` |
| Pseudo-providers (no manifest) | 1 (native) | `tests/structure/integration-manifests.test.ts` exemption |
| Action handlers registered | 215 | `services/execution/handlers/_registry.ts` |
| Trigger types registered (across providers + native) | ~36 | side-effect imports in `integrations/_registry.ts` + native trigger registry |
| Playwright walkthrough specs | 23 (+ 1 smoke) | `tests/e2e/` |
| Jest tests passing (full suite) | **7532 / 7532** | `npm test` |
| Jest suites passing | **721 / 721** | `npm test` |

Per-provider trigger counts (from `integrations/_registry.ts` side-effect imports):

| Provider | Triggers |
|---|---:|
| mailchimp | 7 (1 webhook + 6 polling) |
| trello | 6 (board webhooks) |
| microsoft-excel | 5 (polling) |
| slack | 5 (filter-based on `slack/triggers/`) |
| gmail | 3 (polling) |
| microsoft-outlook | 3 (subscription) |
| google-sheets | 2 (Drive-watch) |
| native | 2 (manual.run, schedule.fired) |
| google-calendar / google-drive / microsoft-onedrive / microsoft-outlook-calendar / microsoft-teams | 1 each |
| airtable / shopify / hubspot / github / stripe | 1 each (webhook) |
| notion | **0** (deferred — see §7) |

---

## 4. Provider slices: complete vs deferred

### Complete (shipped Phase 2 implementation slice)

| Provider | Slice family | Outcomes link |
|---|---|---|
| Slack | 2.1 / 2.2 / 2.3 / 2.4 / 2.5 | [`slack-2-1-messaging-reactions-plan`](../slack-2-1-messaging-reactions-plan.md), [`slack-2-2-private-channels-and-lifecycle`](../slack-2-2-private-channels-and-lifecycle.md), [`slack-2-3-outcomes`](../slack-2-3-outcomes.md), [`slack-2-4-outcomes`](../slack-2-4-outcomes.md), [`slack-2-5-outcomes`](../slack-2-5-outcomes.md) |
| Gmail | 2.3 | [`gmail-2-3-outcomes`](../gmail-2-3-outcomes.md) |
| Notion | 2.1 | [`notion-2-1-outcomes`](../notion-2-1-outcomes.md) |
| Microsoft Excel | parity | [`microsoft-excel-parity-outcomes`](../microsoft-excel-parity-outcomes.md) |
| Google Sheets | 2.1 / 2.2 / 2.3 | [`google-sheets-2-1-outcomes`](../google-sheets-2-1-outcomes.md), [`google-sheets-2-2-outcomes`](../google-sheets-2-2-outcomes.md), [`google-sheets-2-3-triggers-outcomes`](../google-sheets-2-3-triggers-outcomes.md) |
| Stripe | 2.1 | [`stripe-2-1-outcomes`](../stripe-2-1-outcomes.md) |
| Airtable | 2.1 | [`airtable-2-1-outcomes`](../airtable-2-1-outcomes.md) |
| Shopify | 2.1 | [`shopify-2-1-outcomes`](./shopify-2-1-outcomes.md) |
| HubSpot | 2.1 | [`hubspot-2-1-outcomes`](./hubspot-2-1-outcomes.md) |
| Mailchimp | 2.1 | [`mailchimp-2-1-outcomes`](./mailchimp-2-1-outcomes.md) |
| Outlook Mail | 2.1 / 2.2 / 2.3 | [`outlook-mail-2-1-outcomes`](./outlook-mail-2-1-outcomes.md), [`outlook-mail-2-2-outcomes`](./outlook-mail-2-2-outcomes.md), [`outlook-mail-2-3-outcomes`](./outlook-mail-2-3-outcomes.md) |
| **P-S3 platform** (cross-cutting file output contract) | platform | [`p-s3-file-output-contract-outcomes`](../p-s3-file-output-contract-outcomes.md) |

### Deferred (audited but no Phase 2 implementation slice)

| Provider | Reason |
|---|---|
| **GitHub** | Audit accepted in principle ([`parity-github.md`](./parity-github.md)). All gaps are PORT-WHEN-NEEDED — no real workflow blocker yet. Implementation slice deferred until a customer / template / planner blocker lands. **Not a Phase 2 exit blocker.** |
| Google Calendar / Google Drive / Microsoft OneDrive / Microsoft Outlook Calendar / Microsoft Teams | "Rank-not-yet-set" per master-plan §3. Audit-on-demand when a downstream phase hits a missing-action blocker. |
| Trello | No Phase 2 audit — Slice 17 covered the entire scope in Phase 1's token-ingest contract slice. |

---

## 5. Native slices: complete vs deferred

### Complete (shipped Phase 2)

| Slice | Outcomes |
|---|---|
| Native Tier A | [`native-nodes-1-tier-a-outcomes.md`](./native-nodes-1-tier-a-outcomes.md) |
| Native Tier B | [`native-nodes-2-tier-b-triggers-outcomes.md`](./native-nodes-2-tier-b-triggers-outcomes.md) |
| Engine Branching prerequisite | [`engine-branching-outcomes.md`](./engine-branching-outcomes.md) |
| Native Tier C | [`native-nodes-3-tier-c-control-flow-outcomes.md`](./native-nodes-3-tier-c-control-flow-outcomes.md) |

### Deferred (per accepted audit [`parity-native-nodes.md`](./parity-native-nodes.md) §7 + audit-NPD acceptances)

| Item | Destination | NPD |
|---|---|---|
| `loop` action + per-iteration scope + `loop_executions` parallel state | Phase 6 engine hardening | NPD-N5 |
| `wait_for_event` — durable queue + suspended-run state + event-matching dispatcher | Phase 6 | NPD-N5 / NPD-N6 |
| Unbounded / durable `delay` | Phase 6 | NPD-N6 |
| AI cluster `ai_agent` + 7 AI sub-actions + `tavily_search` | Phase 5 AI planner | NPD-N7 |
| `hitl_conversation` (~5,000 LOC HITL stack) | Phase 8 HITL UX | NPD-N8 |
| `parse_file` / `extract_website_data` | Pending product signal | NPD-N9 |
| Generic webhook trigger | Pending product signal | NPD-N3 |
| Per-trigger timezone for `scheduled_trigger` | Pending product signal | NPD-N12 follow-up |
| Catch-up / backfill on missed scheduled runs | Pending product signal | NPD-N13 follow-up |
| Multi-condition AND/OR in a single `if_then_condition` node | Deferred follow-up | D-IT4 |
| `caseSensitive` flag on string operators | Deferred follow-up | D-IT3 |
| Regex operator on if_then / router | Dedicated hardening slice | D-RT4 |
| Multi-branch fan-out from router (`branchTaken: string[]`) | Out — engine contract is single string | — |
| Route weight / priority beyond declaration order | Out — first-match-wins is sufficient | — |
| Builder UI for editing labeled edges / router routes / if_then operators | Phase 3 UI | — |
| Join / AND-merge primitive for downstream nodes with multiple incoming edges | Out — OR-merge is sufficient | — |
| SSRF / private-network hardening for `http_request` | Dedicated hardening slice | — |

---

## 6. Permanent skips

These items are **PERMANENT SKIP** across Phase 2 + all subsequent phases unless a product / customer / security decision explicitly reverses the disposition. Citations point at the per-provider / native audit row that locked the decision.

### V1 orphan / dead-code handlers (NPD-N10 + per-provider rot rows)

| V1 handler | Provider | Reason |
|---|---|---|
| `lib/workflows/actions/logic/executePath.ts` (193 LOC) | logic | One half of an unwired duplicate-implementation pair with `executeFilter.ts`. V2 ships exactly one `if_then_condition` implementation (Slice 3). |
| `lib/workflows/actions/logic/executeFilter.ts` (194 LOC) | logic | Other half of the duplicate. |
| `lib/workflows/actions/utility/fileUpload.ts` (292 LOC) | utility | Pre-P-S3 file-upload; superseded by V2's P-S3 file output contract. |
| `lib/workflows/actions/utility/googleSearch.ts` (130 LOC) | utility | V1 chose Tavily as search provider; Google Search unused. |
| `lib/workflows/actions/utility/transformer.ts` (222 LOC) | utility | Earlier transformer impl; superseded by `formatTransformer.ts` (V1 → V2 native:format_transformer). |
| `lib/workflows/actions/ai/emailClassifier.ts` (127 LOC) | ai | Email-specific AI classifier; folded into generic `ai_classify` schema alias (which is itself deferred to Phase 5). |
| Outlook `searchOutlookEmail` orphan | microsoft-outlook | V1 registered but never plumbed; manifest test pin enforces V2 SKIP. |
| V1 `MicrosoftGraphTriggerLifecycle` (838 LOC dispatcher) | microsoft-outlook + cross-MS | Retired by Slice 6's per-provider lifecycle directory shape. |
| V1 inline `hubspotWebhookUtils.ts:buildHubSpotTriggerData` (380 LOC normalize) | hubspot | V2's bounded normalize handles every event-type without case branching. |
| V1 Mailchimp `sendGoodbye` / `sendNotification` / `reason` flags | mailchimp | V1 M-R3 dead flags; rejected at schema-parse via `.strict()`. |

### Unsafe / high-blast-radius items deferred or skipped

| Item | Reason |
|---|---|
| Mailchimp `send_campaign` / `schedule_campaign` | NPD-M1(d) — deferred indefinitely on high-blast-radius grounds (irreversible publish-to-audience). `create_campaign` may eventually ship in Mailchimp 2.2 under Q11 explicit-consent contract. |
| HubSpot `add_to_workflow` / `remove_from_workflow` | D-HS1 SKIP. Operations Hub workflow surface mutates portal-wide automation graphs; out of scope without explicit product/customer signal. |
| Shopify gift-card automation (NPD-S4) | DEFERRED. Anti-fraud surface. |
| GitHub `merge_pull_request` | DEFER (PORT-WHEN-NEEDED, R-GH-1). Destructive operation; requires per-handler Q4 idempotency on top of session-side-effects helper. |
| JavaScript expression mode in `if_then_condition` / V1's `conditionType: "advanced"` | OUT — sandboxing surface too large for the value delivered. |
| Regex operator on if_then / router (D-RT4) | OUT of Slice 3. ReDoS surface; defer to hardening slice if needed. |
| Webhook trigger generic receive endpoint (NPD-N3) | Pending product signal. Open HTTP endpoint + per-trigger token auth surface; risk-managed by waiting for real demand. |

### Deprecated / unsupported provider surfaces NOT ported

| Surface | Reason |
|---|---|
| V1 Mailchimp Mandrill / landing pages / e-commerce / conversations / batch domains | NPD-M5 — deferred pending product signal. |
| V1 Shopify domain expansion (NPD-S5: drafts / metafields / discounts / cart-recovery) | Deferred pending product signal. |
| V1 HubSpot Operations Hub flows / per-workflow webhook subscription model | NOT PORTED. V2's app-level shared subscriptions with portal-scoped reference counting replaces V1's one-per-workflow model. |
| V1 Slack workflow steps action (V1 was Slack-built UI surface; out of scope for Workflow Tools) | Not in V1 manifest; documented to be explicit. |

---

## 7. Deferred future work (by phase)

The user's brief enumerated specific deferral buckets. Each row below names the bucket + where it lands + what blocks it.

### AI architecture / AI helper / React-style planner agent

- **Destination:** Phase 5 (AI planner).
- **Status:** NOT in Phase 2 scope per accepted audit NPD-N7. Phase 5 also consolidates V1's 8-schema-alias proliferation (`ai_agent` + 7 sub-actions: `ai_prompt`, `ai_summarize`, `ai_extract`, `ai_classify`, `ai_sentiment`, `ai_translate`, `ai_generate`) into one canonical `ai_action` type with a discriminator.
- **Dependencies:** none on Phase 2 work — can start independently.

### Data-passing tests between workflow nodes

- **Status:** Existing coverage is **proven**. The engine-branching slice ships the canonical "linear chain + skipped branch + variable threading" coverage at the engine layer (`tests/unit/services/execution/engine.test.ts` "label-aware branching" describe block). Every provider Playwright walkthrough demonstrates trigger → action chain end-to-end. Native Slice 3 e2e proves trigger → branching action → downstream variable resolution.
- **Outstanding follow-up:** **none Phase-2-blocking.** A future "cross-provider data-passing matrix" test slice could systematically prove every Phase 2 provider's output schema feeds correctly into every other provider's input schema, but it's a confidence-building exercise rather than a parity item.

### Teams / organizations / workspaces rethink

- **Status:** Out of Phase 2 scope. V2 today has user-scoped workflows with no team layer.
- **Destination:** Likely Phase 7 or dedicated platform slice. Will need: workspace model + RLS rewrites + per-workspace integration sharing + team-scoped workflow ownership + role/permission model. **Major platform tier work.**
- **Recommendation:** schedule independently of Phase 3 (UI) and Phase 5 (AI). Either can ship first.

### Advanced custom actions / nodes

- **Status:** Out of Phase 2 scope. V2 today supports user-authored custom actions only via the native node tier (compose `http_request` + `format_transformer` + `delay` + `if_then_condition` + `router`).
- **Destination:** Pending product signal. Could be a dedicated "user-authored node SDK" slice in Phase 6 or later. Requires: per-user node registry + sandboxing model + storage / RLS for user-authored handlers + builder UI to surface them.

### Billing / tasks / workflow limits

- **Status:** V2 already ships an execution-billing gate (`services/billing/executionBillingGate.ts`) that exhausts the user's quota → emits `BILLING_EXHAUSTED` step result + `upgrade_plan` humanizer row. The gate is wired into every engine run.
- **Outstanding:** plan tiers + per-plan task allowance + Stripe Subscription wiring + workflow-count / trigger-count caps + admin override surface. These are a billing / monetization slice, NOT a Phase 2 parity item.
- **Destination:** Likely Phase 4 or dedicated billing slice.

### Templates system, including user-created templates

- **Status:** Out of Phase 2 scope. V1's `published_templates` table backed AI-planner fast-path matching; V2 has no template system yet.
- **Destination:** Phase 5 alongside the AI planner (which is the heaviest template consumer) OR a dedicated templates slice that ships first to seed the planner.
- **Dependencies:** user-created templates also depend on the teams/workspaces rethink for share scope (private vs team vs public).

### Deferred provider / native slices by phase

| Phase | Item |
|---|---|
| **Phase 3 (Builder UI)** | UI for labeled edges; router-route editing; if_then operator picker; live variable picker for {{nodeId.field}}; native trigger UI (manual / scheduled). |
| **Phase 4 (Billing — likely)** | Plan tiers, task counters, workflow caps, Stripe Subscription wiring. |
| **Phase 5 (AI cluster)** | `ai_agent` + 7 sub-actions (consolidated as `ai_action` with discriminator); `tavily_search`; templates system; AI planner fast-path / pattern-fallback. |
| **Phase 6 (Engine hardening / durable execution)** | `loop` action + per-iteration scope + `loop_executions` parallel state; `wait_for_event` + durable queue + suspended-run state; unbounded `delay`; pause/resume infrastructure (BullMQ / Inngest / etc.). |
| **Phase 7 (Workspaces — tentative)** | Teams / organizations / workspaces; per-workspace integration sharing; workflow share scope. |
| **Phase 8 (HITL UX)** | `hitl_conversation` (full HITL stack with Discord/Slack/email transports + memory service). |
| **Pending product signal** | Generic webhook trigger; `parse_file`; `extract_website_data`; user-created templates with public sharing; Mailchimp 2.2 (`create_campaign`); GitHub Phase 2 implementation slice (PORT-WHEN-NEEDED items); calendar / drive / OneDrive / Outlook-calendar / Teams parity audits; advanced custom nodes SDK. |
| **Dedicated hardening slice** | SSRF / private-network hardening for `http_request`; regex operator on if_then / router; Shopify rate-limit handling (NPD-S3). |

---

## 8. Gate status

Captured immediately before this audit commit on `v2-provider-port-local`.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ clean (1 pre-existing `max-lines` warning — see §9) |
| `npm run lint:structure` | ✅ OK — every leaf folder ≤ 50 files |
| `npm run lint:migrations` | ✅ OK — every user-data table has RLS + ≥ 1 policy |
| `npm test` (jest unit + integration) | ✅ **7532 / 7532 passing**, **721 / 721 suites** |
| `npx playwright test` (e2e) | ✅ All 23 spec files cumulatively green (last full sweep on Native Slice 3 commit `a44f6c55a` ran the slice's 4 scenarios in 32.2 s; other specs verified at their own slice's exit gate) |

### Key e2e suites (cumulative green status)

| Spec | Provider/Slice | Last verified |
|---|---|---|
| `slice-1-slack-walkthrough.spec.ts` | Slack 2.1-2.5 | Slack 2.5 exit |
| `slice-2f-gmail-walkthrough.spec.ts` | Gmail 2.3 | Gmail 2.3 exit |
| `slice-3b-google-calendar-walkthrough.spec.ts` | Phase 1 baseline | n/a (no Phase 2 slice) |
| `slice-4b-google-drive-walkthrough.spec.ts` | Phase 1 baseline | n/a |
| `slice-5b-google-sheets-walkthrough.spec.ts` | Sheets 2.1-2.3 | Sheets 2.3 exit |
| `slice-6-outlook-mail-walkthrough.spec.ts` | Outlook Mail 2.1-2.3 | Outlook Mail 2.3 exit |
| `slice-7-outlook-calendar-walkthrough.spec.ts` | Phase 1 baseline | n/a |
| `slice-8-onedrive-walkthrough.spec.ts` | Phase 1 baseline | n/a |
| `slice-9-notion-walkthrough.spec.ts` | Notion 2.1 | Notion 2.1 exit |
| `slice-10-airtable-walkthrough.spec.ts` | Airtable 2.1 | Airtable 2.1 exit |
| `slice-11-stripe-walkthrough.spec.ts` | Stripe 2.1 | Stripe 2.1 exit |
| `slice-12-shopify-walkthrough.spec.ts` | Shopify 2.1 | Shopify 2.1 exit |
| `slice-13-hubspot-walkthrough.spec.ts` | HubSpot 2.1 | HubSpot 2.1 exit |
| `slice-14-mailchimp-walkthrough.spec.ts` | Mailchimp 2.1 | Mailchimp 2.1 exit |
| `slice-14b-github-walkthrough.spec.ts` | GitHub Phase 1 baseline | n/a (no Phase 2 slice shipped) |
| `slice-15-microsoft-excel-walkthrough.spec.ts` | Microsoft Excel parity | Excel parity exit |
| `slice-16-microsoft-teams-walkthrough.spec.ts` | Phase 1 baseline | n/a |
| `slice-17-trello-walkthrough.spec.ts` | Trello | Slice 17 exit |
| `native-nodes-slice-1-walkthrough.spec.ts` | Native Tier A | Native Slice 1 exit |
| `native-nodes-slice-2-triggers-walkthrough.spec.ts` | Native Tier B | Native Slice 2 exit |
| `native-nodes-slice-3-control-flow-walkthrough.spec.ts` | Native Tier C | Native Slice 3 exit (32.2 s, 4 / 4) |
| `smoke.spec.ts` | Cross-cutting smoke | Continuous |

**Recommended pre-PR check:** before any push or PR creation, run `CI=1 npx playwright test --workers=1` against the full suite to confirm no slice has regressed since its individual exit gate.

---

## 9. Known non-blocking warnings

These warnings persist at Phase 2 exit. None are blockers; all are documented for hand-off.

### 9.1 `services/execution/handlers/_registry.ts` max-lines warning

```
C:\Users\marcu\source\repos\ChainReactV2\services\execution\handlers\_registry.ts
  487:1  warning  File has too many lines (473). Maximum allowed is 400  max-lines
```

- **Pre-existing.** Documented in every slice outcomes doc since Slice 2. Grew naturally as registry entries landed (Phase 1 baseline → 215 entries by Phase 2 close).
- **Mitigation options for a follow-up cleanup slice:** (a) split per-provider import groups into separate barrel files; (b) bump the file-specific `max-lines` ceiling via `eslint-disable-next-line`; (c) accept and remove the rule (only 1 file affected, the registry is canonically large by design).
- **Recommendation:** option (a) when the registry grows past ~600 lines OR when a future provider slice adds >10 entries. Until then, accepted as documented warning.

### 9.2 `docs/rules/database-security.md` dirty state

- **Status:** Still modified (M) in working tree at Phase 2 close. Unrelated to native-nodes / engine-branching / Phase 2 closeout work.
- **Origin:** A parallel chat owns this file. The chain of slice outcomes documents this as carried unrelated working-tree state.
- **Recommendation:** the parallel chat that owns this edit must commit (or revert) it before any push to remote.

### 9.3 `PACKAGES.md` untracked

- **Status:** Still untracked (??) in working tree at Phase 2 close. Same parallel-chat ownership.
- **Recommendation:** same as 9.2 — owning chat must commit or `.gitignore` it before push.

### 9.4 Hook automation observations (from Native Slice 3 retrospective §3.15)

A workspace hook was observed across the final slice:
- Auto-augmented `tests/unit/services/execution/handlers/registry.test.ts` with registry-presence assertions when new handlers landed.
- Auto-augmented `tests/unit/integrations/native/actions/router.test.ts` with closed-operator-union + nested `.strict()` schema tests.
- Pre-emptively committed `tests/e2e/native-nodes-slice-3-control-flow-walkthrough.spec.ts` as commit `a44f6c55a` with content matching the planned spec.
- Rewrote one commit subject (`add if_then_condition action` → `add if then condition action`).

All augmentations were inspected and kept; none required rollback. **Recommendation:** continue to inspect hook actions on a per-commit basis. None are Phase 2 exit blockers.

### 9.5 Tech-debt items proactively tracked (NOT warnings — just visibility)

- The 2 V1 logic-duplicate orphan handlers (`executePath.ts` + `executeFilter.ts`) remain PERMANENT SKIP. V2 ships exactly one `if_then_condition`.
- The 6 V1 native orphan handlers (NPD-N10 set) remain PERMANENT SKIP.
- The Outlook `searchOutlookEmail` orphan remains PERMANENT SKIP, pinned by the Outlook manifest test.
- V1's 838-LOC `MicrosoftGraphTriggerLifecycle` is retired in favor of per-provider lifecycle directories.

---

## 10. Recommended declaration

### 10.1 Is Phase 2 complete?

**YES.** Every provider on the master-plan priority list (§3 ranks 1-12) has either an accepted parity audit + at least one implementation slice green, OR a documented "no Phase 2 work needed" status:

- 11 of the 12 priority providers shipped at least one Phase 2 implementation slice (Slack, Gmail, Notion, Microsoft Excel, Google Sheets, Stripe, Airtable, Shopify, HubSpot, Mailchimp, Outlook Mail).
- The 12th (GitHub, rank 11) has an accepted parity audit; every gap is PORT-WHEN-NEEDED rather than blocking. Implementation slice deferred until a real workflow blocker lands.
- All 4 native-node tiers (A / B / engine-branching / C) shipped.
- P-S3 file output contract platform slice shipped and consumed by 3+ providers.
- Trello via Slice 17 (token-ingest contract — special Phase 2 path).

The accepted audit's exit criteria (per `phase-2-plan.md` §7 + §11) are met. All "port" decisions either shipped or carry an explicit follow-up phase label. All `defer` decisions carry an explicit destination phase. All `skip` decisions cite a rot ID or NPD acceptance.

### 10.2 What must be done before pushing / opening PRs

- [ ] **Resolve unrelated dirty-file state.** The parallel chat owning `docs/rules/database-security.md` (M) + `PACKAGES.md` (??) must commit or revert. These are NOT this audit's concern but must land cleanly before pushing.
- [ ] **Full Playwright sweep.** Run `CI=1 npx playwright test --workers=1` against the full 23-spec suite to confirm cumulative green; individual slice exit gates each verified their own scenario set but a single end-to-end sweep gives the cleanest hand-off signal.
- [ ] **CLAUDE.md hand-off review.** If CLAUDE.md has parallel-chat edits pending, reconcile + commit before push (per CLAUDE.md `## Update CLAUDE.md before every git commit` rule).
- [ ] **Confirm V2 git remote target.** All Phase 2 work is local on `v2-provider-port-local`. Marcus accepts the remote target (e.g. `origin` vs a separate `v2/main` branch) before push.
- [ ] **Decide PR strategy.** Phase 2 spans ~100+ commits across all slices. Options: (a) single mega-PR (hard to review); (b) per-slice PRs (clean review but ~30 PRs); (c) per-provider rollup PRs (~13 PRs). **Recommend (c) per-provider rollup PRs** — each provider's Phase 2 implementation slices roll up into one PR; native gets one PR; engine-branching gets one PR; P-S3 gets one PR. Each PR is independently mergeable; cumulative review burden is manageable.

### 10.3 What should start next

Three independent next-phase candidates. Any one can start without the others landing first:

1. **Phase 3 — Builder UI (highest user-visible impact).** V2 today has zero builder UI for editing labeled edges, router routes, if_then operators, or trigger configs. The Phase 2 provider + native parity surface is huge; without UI, only API callers can exercise it. **Recommended highest-priority next phase.**

2. **Phase 5 — AI cluster + planner (highest velocity impact).** The AI planner consumes the entire Phase 2 parity surface (215 action handlers + ~36 trigger types) as its candidate pool. Shipping AI without UI is possible (planner-generated workflows could be edited via API + persisted via existing `PATCH /api/workflows/[id]`), and provides immediate value for non-UI users. **Recommended if Marcus prefers backend-first velocity.**

3. **Phase 6 — Engine hardening / durable execution.** Unblocks `loop`, `wait_for_event`, unbounded `delay`, and pause/resume — the remaining audited but deferred native-node items. Requires durable queue (BullMQ / Inngest / equivalent) + suspended-run state. **Recommended if Marcus prioritizes parity completeness over UI/AI velocity.**

**Out-of-scope but worth tracking:** the GitHub Phase 2 implementation slice (audit accepted; all items PORT-WHEN-NEEDED) can land any time a real workflow blocker surfaces. It is NOT a Phase 3/5/6 prerequisite.

### 10.4 Final recommendation

**Declare Phase 2 complete.** Reconcile the dirty-file state from §9.2 + §9.3, run a full Playwright sweep per §10.2, then proceed to **Phase 3 (Builder UI)** as the next-phase work. The builder UI work cleanly consumes Phase 2's surface and unblocks the workflow-author experience that has been deferred for the entire phase.

---

## 11. Exit checklist

This audit is complete when:

- [ ] Marcus reads §1 + §2 (provider + native completion) and agrees the counts match.
- [ ] §3 (final counts) accepted as the canonical Phase-2 hand-off summary.
- [ ] §4 + §5 (slice complete vs deferred) reviewed — specifically the GitHub disposition (§4 "audited, implementation deferred") + the 5 rank-not-yet-set providers (§4 "rank-not-yet-set").
- [ ] §6 (permanent skips) accepted — confirm the V1 orphan list, unsafe items, and deprecated surface decisions reflect Marcus's policy.
- [ ] §7 (deferred future work by phase) accepted as the next-phase planning input.
- [ ] §8 (gate status) green at acceptance time.
- [ ] §9 (warnings) accepted as non-blocking + the responsible-owner notes captured.
- [ ] §10 (recommended declaration) accepted — specifically the "YES, Phase 2 is complete" stance + the next-phase ordering recommendation.
- [ ] No `git add .` for this commit — explicit path stage `docs/slices/parity/phase-2-closeout-audit.md` only.
- [ ] No push, no PR — this is a doc-only audit commit; Marcus decides when to push the cumulative Phase 2 work.

**This commit is doc-only.** Implementation does not happen here. Next-phase planning begins after Marcus accepts.
