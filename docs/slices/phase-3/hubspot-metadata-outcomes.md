# HubSpot Metadata Outcomes — Slice 3.HUBSPOT-7

**Status:** Doc-only checkpoint. Closes the HubSpot builder-metadata arc.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Companion docs:**
[`./hubspot-metadata-plan.md`](./hubspot-metadata-plan.md),
[`./google-sheets-metadata-outcomes.md`](./google-sheets-metadata-outcomes.md),
[`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md),
[`./options-source-plan.md`](./options-source-plan.md).

Every count and field-shape claim in this doc was verified by reading live files (`services/discovery/_registry.ts`, `services/execution/handlers/_registry.ts`, `services/options/_registry.ts`, `tests/structure/discovery-meta-coverage.test.ts`, `integrations/hubspot/**`) — not from memory.

---

## 1. Commit chain

| Slice | Commit | Scope |
| --- | --- | --- |
| HUBSPOT-1 | `525178901` | Doc-only plan ([`./hubspot-metadata-plan.md`](./hubspot-metadata-plan.md)). Mapped 26 actions + 1 trigger, locked the resolver-first sequence (HubSpot uses many opaque IDs), confirmed the existing 18 manifest scopes cover every recommended resolver — **no scope change, no reconnect needed**. |
| HUBSPOT-2 | `0c7e17065` | OptionsSource resolvers. `hubspot:owners`, `hubspot:deal_pipelines` → `hubspot:deal_stages` (dependsOn `pipeline`), `hubspot:ticket_pipelines` → `hubspot:ticket_stages` (dependsOn `hs_pipeline`), `hubspot:lists`. 6 resolvers under [`integrations/hubspot/options/`](../../../integrations/hubspot/options/); registry entries; per-resolver unit tests + a pipeline → stage cascade integration test. |
| HUBSPOT-3 | `9ded3910c` | First 6 action metas — contacts + companies (`create_contact`, `update_contact`, `get_contacts`, `create_company`, `update_company`, `get_companies`). Metas relocated to [`integrations/hubspot/actions/meta/`](../../../integrations/hubspot/actions/meta/) subdir to stay under the 50-file leaf-folder cap. Registry + provider-route surface tests; `hubspot-create-contact-config` integration test. `duplicateHandling` select pattern pinned. |
| HUBSPOT-4 | `fc8dc6ed0` | Next 7 action metas — deals + tickets + owners-read (`create_deal`, `update_deal`, `get_deals`, `create_ticket`, `update_ticket`, `get_tickets`, `get_owners`). First HUBSPOT-2 resolver consumers: `hubspot:owners` (4 fields), `deal_pipelines` → `deal_stages` cascade, `ticket_pipelines` → `ticket_stages` cascade. 2 integration tests (`create_deal_config`, `create_ticket_config`). |
| HUBSPOT-5 | `c76db64e3` | Final 13 action metas — engagements + lists + commerce (`create_note`, `create_task`, `create_call`, `create_meeting`, `add_contact_to_list`, `remove_from_list`, `create_product`, `update_product`, `get_products`, `create_line_item`, `update_line_item`, `get_line_items`, `remove_line_item`). First `hubspot:lists` resolver consumers. `remove_line_item` is the sole high+destructive+confirm action. 2 integration tests (`create_task_config`, `remove_line_item_config`). |
| HUBSPOT-6 | `1269d9762` | Trigger meta (`hubspot:webhook_received` — single consolidated webhook covering all 12 subscription types) + `hubspot` added to `COVERED_PROVIDERS`. Trigger registered via `registerActivation(...)` — no `SHARED_INFRA_EXEMPT_KEYS` entry. 1 integration test (`hubspot-webhook-received-trigger-config`). |
| HUBSPOT-7 | (this commit) | Doc-only outcomes + coverage refresh. |

---

## 2. Scope shipped

### Infrastructure

- **6 optionsSource resolvers** under [`integrations/hubspot/options/`](../../../integrations/hubspot/options/):
  - `hubspot:owners` — `/crm/v3/owners`. Backs 8 `hubspot_owner_id` combobox consumers (create/update deal, create/update ticket, 4 engagement creates).
  - `hubspot:deal_pipelines` — `/crm/v3/pipelines/deals`. Backs `pipeline` on create/update deal.
  - `hubspot:deal_stages` — same endpoint, client-side filter by `dependsOn: pipeline`. Backs `dealstage` on create/update deal.
  - `hubspot:ticket_pipelines` — `/crm/v3/pipelines/tickets`. Backs `hs_pipeline` on create/update ticket.
  - `hubspot:ticket_stages` — same endpoint, client-side filter by `dependsOn: hs_pipeline`. Backs `hs_pipeline_stage` on create/update ticket.
  - `hubspot:lists` — `POST /crm/v3/lists/search`. Backs `listId` on add/remove list-membership. Surfaces each list's `processingType` (MANUAL / DYNAMIC) in the option description so authors don't accidentally target a DYNAMIC list (HubSpot's membership API rejects those with 400).
- **No manifest scope change.** All six resolvers + every action read/write rides on the 18 OAuth scopes the HubSpot manifest already grants. **Existing HubSpot users do NOT need to reconnect** — a meaningful UX difference vs the Google Sheets arc.
- **Provider route exposure** — `GET /api/providers/hubspot/{actions,triggers}` returns the full surface in `displayOrder`.

### Metadata

- **26 action metas** under [`integrations/hubspot/actions/meta/`](../../../integrations/hubspot/actions/meta/) (one per registered handler) — see §5 table.
- **1 trigger meta** at [`integrations/hubspot/triggers/webhookReceived/webhookReceived.meta.ts`](../../../integrations/hubspot/triggers/webhookReceived/webhookReceived.meta.ts).
- **`hubspot` added to `COVERED_PROVIDERS`** in [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts). 1:1 handler↔meta drift is now structurally enforced for HubSpot.

---

## 3. Important product / UX decisions

### Resolver-first sequencing was correct

HubSpot uses opaque numeric IDs for nearly every relationship (`hubspot_owner_id`, `pipeline`, `dealstage`, `hs_pipeline`, `hs_pipeline_stage`, `listId`). Landing the 6 resolvers in HUBSPOT-2 ahead of any action meta gave us:

- Zero meta↔resolver drift — every meta could declare `optionsSource` from day one.
- The pipeline → stage cascade was proven against synthetic fields (HUBSPOT-2's `hubspot-options-cascade.test.tsx`) before any real meta consumed it; when HUBSPOT-4 added the deal + ticket cascades, the cascade Just Worked.
- A resolver-side `requiredDeps` invariant (`hubspot:deal_stages` declares `requiredDeps: ["pipeline"]`, `hubspot:ticket_stages` declares `requiredDeps: ["hs_pipeline"]`) means a future meta that wires the wrong parent name fails loudly with `MISSING_DEPENDENCY` at design time rather than silently fetching the wrong scope.

### Pipeline → stage cascade is proven production-ready (deals + tickets)

Two distinct cascade pairs ship in this arc, both inheriting the proven Slice 3.33 cascade behavior:

- `pipeline` → `dealstage` (consumed by `create_deal` + `update_deal`).
- `hs_pipeline` → `hs_pipeline_stage` (consumed by `create_ticket` + `update_ticket`).

The `hubspot-create-ticket-config` integration test specifically pins that the ticket stage fetch carries `deps.hs_pipeline` (NOT `deps.pipeline`) — catches a future meta drift where someone mirrors the deal-shape parent name onto the ticket meta. Both cascades exhibit the standard three behaviors: happy path, gated-when-empty (passive "Select Pipeline first" trigger), and change-clears-dependent.

### Owners picker reaches 8 consumers

`hubspot:owners` is the most-consumed resolver in the HubSpot arc. Wired on every action where the schema accepts `hubspot_owner_id`: create/update deal, create/update ticket, create note/task/call/meeting. The picker returns the owner `id` (NOT `userId`) — that's the value HubSpot's `hubspot_owner_id` property accepts. This is called out on every consuming meta's description.

The contact + company schemas intentionally do NOT carry `hubspot_owner_id` — pinned by a registry test so a future schema change that adds it surfaces as a deliberate decision (and a meta update).

### Lists picker — first DYNAMIC-vs-MANUAL UX

`hubspot:lists` (consumed by `add_contact_to_list` + `remove_from_list`) surfaces each list's `processingType` (`MANUAL` or `DYNAMIC`) in the option description. HubSpot's membership-write API rejects DYNAMIC lists with a 400 `VALIDATION_ERROR`; the picker's description is the design-time hint that prevents the runtime surprise. The resolver-side decision to surface processingType belongs in HUBSPOT-2; the meta-side decision to call it out in the field description belongs in HUBSPOT-5.

### Numeric-string fields stay text, not number

HubSpot's CRM property API expects stringified numerics on every write — `price`, `amount`, `quantity`, `discount`, `annualrevenue`, `numberofemployees`, `hs_cost_of_goods_sold`, `hs_call_duration`. The schemas use `z.string()`; the metas use `type: "text"`; every meta description carries the "**Numeric STRING** — HubSpot expects stringified numbers" footgun callout. A future change to `type: "number"` would cause the renderer to emit a JS number that HubSpot rejects — pinned by registry tests that assert these fields are TEXT on the wire.

### Broad `properties` maps surface as `object` outputs, not new FieldType

Every HubSpot CRM object's property map (`properties`) is a variable-shape object — different per portal, different per workflow. No new FieldType was needed to render it; every consumer marks the parent `properties` output `sensitive: true` and the run-detail API redacts the whole subtree. A property-picker / property-editor FieldType is tracked as a follow-up (§8).

### Webhook subscriptions ship as paste-JSON textarea

The `hubspot:webhook_received` trigger's `subscriptions` field is a single required `textarea` (paste-JSON). Mirrors the Notion / Stripe paste-JSON pattern established earlier in Phase 3. The textarea stores the literal string verbatim; the runtime engine's `activate.ts:parseSubscriptions` shreds it (validates `eventType` against the 12-type allowlist, enforces `propertyName` required on `*.propertyChange` + forbidden on `*.creation`/`*.deletion`, de-dups). The meta description carries the full event-type allowlist and an example so workflow authors don't have to read `activate.ts`. A dedicated subscription builder UI (chip-input + dropdowns) is tracked as a follow-up (§8).

### Webhook trigger validation still relies on activation + real source events

`registerActivation("hubspot", "webhook_received", activate)` is wired in [`integrations/hubspot/triggers/webhookReceived/index.ts`](../../../integrations/hubspot/triggers/webhookReceived/index.ts); the `trigger-meta-activation-invariant` structural test passes. End-to-end validation against a real HubSpot webhook delivery is currently manual (create a contact / change a deal stage in the connected portal). A trigger-replay harness with fixture payloads through the normalize → dispatch pipeline is tracked as a follow-up (§8).

### Search-by-property pickers deferred (every id field stays plain text)

`contactId`, `companyId`, `dealId`, `ticketId`, `productId`, `lineItemId`, the 4 `associated*Id` fields on every engagement, `hs_product_id` on line items — all are plain `text` fields in v1. HubSpot's `/crm/v3/objects/{type}/search` could back a "search and pick existing record" combobox per object type, but each picker would be 1+ search round-trip per keystroke and the schema doesn't constrain the value beyond "non-empty string". Tracked as a follow-up (§8); meta descriptions consistently call out the typical wiring pattern (`{{hubspot:create_contact.contactId}}`, etc.) so workflow authors aren't blocked.

---

## 4. Security decisions

### Destructive actions — the sole high-risk HubSpot action

| Action | `isDestructive` | `requiresConfirmation` | `riskLevel` |
| --- | --- | --- | --- |
| `remove_line_item` | true | true | **high** |

`remove_line_item` is the only HubSpot action that issues a DELETE against the CRM. The destructive trio drives the existing destructive-confirmation modal at activation / Run-now time (covered by [`tests/integration/features/workflow-builder/destructive-action-confirmation-modal.test.tsx`](../../../tests/integration/features/workflow-builder/destructive-action-confirmation-modal.test.tsx) — HubSpot did not need a duplicate). The `hubspot-remove-line-item-config` integration test pins the meta flags; the modal flow inherits. The high-risk audit event in the executions log also fires automatically.

### Medium-risk actions

Every create / update / list-membership / engagement / product write is `riskLevel: "medium"` with a `riskDescription` that explicitly calls out the downstream blast radius (CRM record visibility to all portal users, sales pipeline reporting, marketing automations, support workflows, etc.). The 14 medium-risk actions don't carry `requiresConfirmation` — they're recoverable by writing the prior values back.

### Read actions are low-risk but their outputs are sensitive

`get_contacts`, `get_companies`, `get_deals`, `get_tickets`, `get_owners`, `get_products`, `get_line_items` are all `riskLevel: "low"` — pure reads. Their collection outputs (`contacts`, `companies`, `deals`, etc.) are marked sensitive because each entry carries a HubSpot property map full of PII / business / financial data. Pagination scalars (`count`, `total`, `nextCursor`, `hasMore`) stay non-sensitive.

### testMode interception

Every HubSpot action is an external-action shape. The v2 engine-level pre-call gate in [`services/execution/nodeExecutionService.ts`](../../../services/execution/nodeExecutionService.ts) refuses to dispatch any external-action handler when `context.testMode === true && actionMode !== EXECUTE_ALL`. No per-handler `testMode` guard needed — covered by the cross-provider gate.

### Sensitive output flags — what's marked + why

| Category | Sensitive outputs | Rationale |
| --- | --- | --- |
| CRM contact data | `email`, `firstName`, `lastName`, `properties` | Direct PII; `email` is a SUSPICIOUS_NAMES match (load-bearing flag). |
| CRM company data | `name`, `domain`, `properties` | Customer-identifying business data. |
| CRM deal data | `dealname`, `amount`, `properties` | Customer-identifying + financial. |
| CRM ticket data | `subject`, `properties` | Support context, customer-identifying. |
| Engagement bodies | `body` (note — SUSPICIOUS_NAMES), `subject` (task), `title` (call + meeting), `location` (meeting), `properties` | Customer-identifying engagement detail; `body` is a SUSPICIOUS_NAMES match. |
| List membership | `email` (SUSPICIOUS_NAMES), `contactIdsAdded`, `contactIdsRemoved`, `contactIdsDiscarded` | Direct PII + IDs map to real CRM contacts. |
| Products | `name`, `price`, `properties` | Catalog + financial. (`sku` stays non-sensitive — typically public catalog identifier.) |
| Line items | `name`, `quantity`, `price`, `discount`, `amount`, `properties` | Commerce + financial detail. |
| Read collections | `contacts`, `companies`, `deals`, `tickets`, `owners`, `products`, `lineItems` | Each entry carries the property map. |
| Owners array | `owners` | Per-entry employee PII (work email + names). |
| Webhook payload | `propertyValue`, `event` (raw payload) | Actual changed customer data + full raw HubSpot wire item. |

### Non-sensitive surfaces

Opaque numeric IDs alone (`contactId`, `companyId`, `dealId`, `ticketId`, `productId`, `lineItemId`, `listId`, `noteId`, `taskId`, `callId`, `meetingId`, `portalId`, `hubId`, `objectId`, `subscriptionId`, `appId`, `subscriptionType`), structural scalars (`createdAt`, `updatedAt`, `count`, `total`, `nextCursor`, `hasMore`, `dealstage`, `pipeline`, `pipelineStage`, `status`, `priority`, `type`, `outcome`, `attemptNumber`, `changeSource`, `propertyName`), and association reports (`associationsAttached`, `associationWarnings`).

### No secret-shaped outputs

No `token` / `accessToken` / `refreshToken` / `clientSecret` / `secret` / `apiKey` / `webhookSecret` output anywhere on the HubSpot surface. Pinned by the cross-action structural test in [`tests/structure/sensitive-output-coverage.test.ts`](../../../tests/structure/sensitive-output-coverage.test.ts). Also pinned per-meta in the HubSpot registry test.

### No FileRef surface

No HubSpot action / trigger declares `producesFileRef` or `consumesFileRef`. HubSpot does have an attachments API; if a future slice ports it, FileRef wiring lands then.

### Provider route serializes all risk + sensitive fields

`GET /api/providers/hubspot/actions` serializes `riskLevel`, `isDestructive`, `requiresConfirmation`, `riskDescription`, and per-output `sensitive` flags. `GET /api/providers/hubspot/triggers` serializes the trigger payload `sensitive` flags. Both are pinned in [`tests/unit/app/api/providers/providers-route.test.ts`](../../../tests/unit/app/api/providers/providers-route.test.ts).

---

## 5. Final HubSpot action / trigger surface

### Actions (26 / 26 — all in COVERED_PROVIDERS)

| Key | `riskLevel` | `isDestructive` | `requiresConfirmation` | Sensitive outputs | `displayOrder` |
| --- | --- | --- | --- | --- | --- |
| `hubspot:create_contact` | medium | false | false | `email`, `firstName`, `lastName`, `properties` | 10 |
| `hubspot:update_contact` | medium | false | false | `email`, `firstName`, `lastName`, `properties` | 20 |
| `hubspot:get_contacts` | low | false | false | `contacts` | 30 |
| `hubspot:create_company` | medium | false | false | `name`, `domain`, `properties` | 40 |
| `hubspot:update_company` | medium | false | false | `name`, `domain`, `properties` | 50 |
| `hubspot:get_companies` | low | false | false | `companies` | 60 |
| `hubspot:create_deal` | medium | false | false | `dealname`, `amount`, `properties` | 70 |
| `hubspot:update_deal` | medium | false | false | `dealname`, `amount`, `properties` | 80 |
| `hubspot:get_deals` | low | false | false | `deals` | 90 |
| `hubspot:create_ticket` | medium | false | false | `subject`, `properties` | 100 |
| `hubspot:update_ticket` | medium | false | false | `subject`, `properties` | 110 |
| `hubspot:get_tickets` | low | false | false | `tickets` | 120 |
| `hubspot:get_owners` | low | false | false | `owners` | 130 |
| `hubspot:create_note` | medium | false | false | `body`, `properties` | 140 |
| `hubspot:create_task` | medium | false | false | `subject`, `properties` | 150 |
| `hubspot:create_call` | medium | false | false | `title`, `properties` | 160 |
| `hubspot:create_meeting` | medium | false | false | `title`, `location`, `properties` | 170 |
| `hubspot:add_contact_to_list` | medium | false | false | `email`, `contactIdsAdded`, `contactIdsDiscarded` | 180 |
| `hubspot:remove_from_list` | medium | false | false | `email`, `contactIdsRemoved`, `contactIdsDiscarded` | 190 |
| `hubspot:create_product` | medium | false | false | `name`, `price`, `properties` | 200 |
| `hubspot:update_product` | medium | false | false | `name`, `price`, `properties` | 210 |
| `hubspot:get_products` | low | false | false | `products` | 220 |
| `hubspot:create_line_item` | medium | false | false | `name`, `quantity`, `price`, `discount`, `amount`, `properties` | 230 |
| `hubspot:update_line_item` | medium | false | false | `name`, `quantity`, `price`, `discount`, `amount`, `properties` | 240 |
| `hubspot:get_line_items` | low | false | false | `lineItems` | 250 |
| `hubspot:remove_line_item` | **high** | **true** | **true** | — | 260 |

### Triggers (1 / 1)

| Key | Activation | Sensitive payload fields | `displayOrder` |
| --- | --- | --- | --- |
| `hubspot:webhook_received` | webhook (Public-App subscription via `/webhooks/v3/{appId}/subscriptions`) | `propertyValue`, `event` | 10 |

Trigger registered via [`registerActivation("hubspot", "webhook_received", activate)`](../../../integrations/hubspot/triggers/webhookReceived/index.ts) — no `SHARED_INFRA_EXEMPT_KEYS` entry needed.

---

## 6. Test coverage

| Surface | Path | What it pins |
| --- | --- | --- |
| Resolver — owners | [`tests/unit/integrations/hubspot/options/owners.test.ts`](../../../tests/unit/integrations/hubspot/options/owners.test.ts) | `/crm/v3/owners` mapping; `q` filter; error sanitization. |
| Resolver — dealPipelines | [`tests/unit/integrations/hubspot/options/dealPipelines.test.ts`](../../../tests/unit/integrations/hubspot/options/dealPipelines.test.ts) | Pipelines endpoint mapping; `hasMore: false` (unpaginated). |
| Resolver — dealStages | [`tests/unit/integrations/hubspot/options/dealStages.test.ts`](../../../tests/unit/integrations/hubspot/options/dealStages.test.ts) | `dependsOn: pipeline` enforcement; client-side filter to chosen pipeline; missing-pipeline → empty items (not throw). |
| Resolver — ticketPipelines | [`tests/unit/integrations/hubspot/options/ticketPipelines.test.ts`](../../../tests/unit/integrations/hubspot/options/ticketPipelines.test.ts) | Mirrors dealPipelines for the tickets surface. |
| Resolver — ticketStages | [`tests/unit/integrations/hubspot/options/ticketStages.test.ts`](../../../tests/unit/integrations/hubspot/options/ticketStages.test.ts) | `dependsOn: hs_pipeline` (the ticket-shape parent name, NOT `pipeline`). |
| Options registry | [`tests/unit/services/options/_registry.test.ts`](../../../tests/unit/services/options/_registry.test.ts) | All 6 HubSpot resolvers registered; dep declarations. |
| Pipeline → stage cascade | [`tests/integration/features/workflow-builder/hubspot-options-cascade.test.tsx`](../../../tests/integration/features/workflow-builder/hubspot-options-cascade.test.tsx) | Happy-path; gated-when-empty; change-clears-dependent. (Exercises the deal-shape cascade as a representative; the ticket-shape cascade inherits.) |
| Registry — HubSpot surface | [`tests/unit/services/discovery/_registry.test.ts`](../../../tests/unit/services/discovery/_registry.test.ts) | 26-action displayOrder; risk matrix; resolver wiring per field; sensitive flag pins; destructive trio on `remove_line_item`; trigger payload surface. |
| Provider routes | [`tests/unit/app/api/providers/providers-route.test.ts`](../../../tests/unit/app/api/providers/providers-route.test.ts) | `hasMetadata: true`; `GET /api/providers/hubspot/actions` (26 in displayOrder); `GET /api/providers/hubspot/triggers` (1); risk + sensitive fields round-trip JSON; `subscriptions` textarea field; `hs_ticket_priority` static select; resolver wiring serialization. |
| Integration — create_contact | [`tests/integration/features/workflow-builder/hubspot-create-contact-config.test.tsx`](../../../tests/integration/features/workflow-builder/hubspot-create-contact-config.test.tsx) | Exact 15-field surface; `duplicateHandling` select default `fail`; sensitive output set; persists exact runtime field names (`firstname` / `lastname` / `hs_lead_status`); confirms no resolver calls (HUBSPOT-3 metas have none). |
| Integration — create_deal | [`tests/integration/features/workflow-builder/hubspot-create-deal-config.test.tsx`](../../../tests/integration/features/workflow-builder/hubspot-create-deal-config.test.tsx) | Pipeline → stage cascade end-to-end through a real meta; owners resolver consumption; amount as text (numeric string); gated stage combobox before pipeline pick. |
| Integration — create_ticket | [`tests/integration/features/workflow-builder/hubspot-create-ticket-config.test.tsx`](../../../tests/integration/features/workflow-builder/hubspot-create-ticket-config.test.tsx) | Ticket-shape cascade with `deps.hs_pipeline` (NOT `deps.pipeline`); `hs_ticket_priority` enum with no defaultValue; defensive guard that deal-shape `pipeline`/`dealstage` keys do NOT leak onto persisted ticket config. |
| Integration — create_task | [`tests/integration/features/workflow-builder/hubspot-create-task-config.test.tsx`](../../../tests/integration/features/workflow-builder/hubspot-create-task-config.test.tsx) | Representative engagement; 12-field schema order; meta-default seeding (`NOT_STARTED` / `MEDIUM` / `TODO`) before user interaction; owners resolver consumption; exact runtime field names. |
| Integration — remove_line_item | [`tests/integration/features/workflow-builder/hubspot-remove-line-item-config.test.tsx`](../../../tests/integration/features/workflow-builder/hubspot-remove-line-item-config.test.tsx) | Sole destructive HubSpot action — meta destructive trio pin; single required `lineItemId` text; narrow {`lineItemId`, `deleted`} outputs neither sensitive; persists exact runtime field name; reuses cross-provider confirmation modal coverage. |
| Integration — webhook trigger | [`tests/integration/features/workflow-builder/hubspot-webhook-received-trigger-config.test.tsx`](../../../tests/integration/features/workflow-builder/hubspot-webhook-received-trigger-config.test.tsx) | Single required `subscriptions` textarea; 12-field payloadShape sensitivity pins; paste-JSON literal preserved as string; server-managed activation state (`webhookEnabled`, `appId`, `hubId`) does NOT leak onto persisted config. |
| Structural — meta coverage | [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) | `hubspot` in COVERED_PROVIDERS; no missing metas; no orphan metas. |
| Structural — sensitive | [`tests/structure/sensitive-output-coverage.test.ts`](../../../tests/structure/sensitive-output-coverage.test.ts) | Cross-provider drift guard. Green with no allowlist changes for HubSpot. The 3 SUSPICIOUS_NAMES matches in the HubSpot surface (`createNote.body`, `addContactToList.email`, `removeFromList.email`) all carry `sensitive: true`. |
| Structural — activation invariant | [`tests/structure/trigger-meta-activation-invariant.test.ts`](../../../tests/structure/trigger-meta-activation-invariant.test.ts) | `hubspot:webhook_received` has a registered activation function — satisfied without `SHARED_INFRA_EXEMPT_KEYS` entry. |
| HubSpot allowlist (resolver) | [`tests/unit/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.test.ts`](../../../tests/unit/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.test.ts) | 12-type allowlist + propertyChange detector (predates HUBSPOT-6). |

**Aggregate suite at HUBSPOT-6:** 837 suites, 9683 / 9683 tests passing.

---

## 7. Provider coverage after HubSpot

All counts below were read live (`grep -oE 'provider: "[a-z-]+",'` on `services/execution/handlers/_registry.ts` and `find integrations -name '*.meta.ts'` on commit `1269d9762`).

### Covered providers (9) — 1:1 handler↔meta enforced

| Provider | Action metas | Trigger metas | Action handlers | Coverage |
| --- | --- | --- | --- | --- |
| `native` | 5 | 2 | 5 | full |
| `github` | 6 | 1 | 6 | full |
| `gmail` | 13 | 3 | 13 | full |
| `microsoft-outlook` | 9 | 3 | 9 | full |
| `slack` | 31 | 10 | 31 | full |
| `notion` | 16 | 0 | 16 | full |
| `stripe` | 16 | 0 | 16 | full |
| `google-sheets` | 12 | 2 | 12 | full |
| `hubspot` | **26** | **1** | 26 | **full (new)** |
| **Total covered** | **134** | **22** | **134** | |

### Uncovered providers (10) — handlers shipped but no metas yet

| Provider | Action handlers | Trigger metas | Notes |
| --- | --- | --- | --- |
| `mailchimp` | 14 | 0 | Largest uncovered surface. Marketing automation (audiences / campaigns / subscribers / tags / segments / custom events / notes). Likely needs `mailchimp:audiences` + `mailchimp:campaigns` + `mailchimp:segments` resolvers — same parent/child resolver shape Google Sheets + HubSpot have proven. |
| `shopify` | 11 | 0 | Commerce — orders + customers + products + variants + inventory + fulfillment. Likely wants destructive-confirmation modeling similar to Stripe's `cancel_subscription` and HubSpot's `remove_line_item`. |
| `airtable` | 11 | 0 | Records + schema + multi-record batch. Needs a base/table resolver pair structurally identical to Google Sheets' spreadsheet/sheet. |
| `microsoft-excel` | 10 | 0 | Workbooks + worksheets + rows. Needs a workbook/worksheet resolver pair structurally identical to Google Sheets' — decisions are largely portable. |
| `trello` | 8 | 0 | Boards + lists + cards. Needs a board/list resolver pair. |
| `microsoft-onedrive` | 7 | 0 | File ops; FileRef-producing surface (first FileRef provider since Slack `download_file` / `get_file_info`). |
| `google-calendar` | 5 | 0 | Calendar events. |
| `google-drive` | 5 | 0 | File ops; FileRef-producing. |
| `microsoft-outlook-calendar` | 5 | 0 | Calendar events; structurally parallel to `google-calendar`. |
| `microsoft-teams` | 5 | 0 | Channel + chat messages. |
| **Total uncovered** | **81** | **0** | |

**Across-board view:** 215 action handlers total. 134 covered (62.3 %); 81 uncovered (37.7 %). 22 trigger metas total (all on covered providers).

---

## 8. Remaining HubSpot follow-ups

- **Contact / company / deal / ticket / product search pickers** — `hubspot:contacts` (search by email), `hubspot:companies` (search by domain), `hubspot:deals` / `hubspot:tickets` / `hubspot:products` (search by name). Each would replace one of the plain-text id fields on the relevant `update_*` and engagement-association inputs. Adds 1+ search round-trip per keystroke per picker; not blocking but a meaningful UX polish. Tracked.
- **Property picker / editor FieldType** — a dedicated FieldType that hits HubSpot's `/crm/v3/properties/{objectType}` endpoint to list available properties for the chosen object type, then renders a typed input for each picked property. Would replace the current plain-text approach for `filterProperty` / `properties` fields across all `get_*` reads + the property-aware updates. New FieldType is a meaningful infrastructure investment; deferred until at least one other provider hits the same pattern.
- **Association type picker** — every engagement create currently takes free-form `associatedContactId` / `associatedCompanyId` / `associatedDealId` / `associatedTicketId` text. A picker would surface the 4 association choices with descriptions of what HubSpot does with each. Low-impact polish.
- **Better webhook-subscription builder** — replace the paste-JSON textarea with a chip-input that surfaces the 12-event-type allowlist as a dropdown and prompts for `propertyName` when a `*.propertyChange` is picked. The validation logic already exists server-side in `activate.ts:parseSubscriptions`; this is a UI-only follow-up.
- **Trigger testing harness / latest-event replay** — capture a real HubSpot webhook payload in fixtures and replay through the activate → normalize → dispatch pipeline in an integration test. Would close the "activation registered, but real-source-event tested only manually" gap noted in §3.
- **Possible escalation of `update_deal` / `update_ticket` / `update_product` / list-membership actions to `requiresConfirmation: true`** — they're currently `medium / non-destructive` because overwrites and membership flips are technically recoverable. If user-reported incidents show accidental impact (e.g. a workflow rewriting a deal's amount, or removing the wrong contact from a marketing list), escalate the affected actions to `high + requiresConfirmation` in a follow-up. Schema flip is backwards-compatible.
- **Optional admin audit feed for high-risk HubSpot actions** — the high-risk audit event already fires for `remove_line_item`; a dedicated admin feed (filtered to the HubSpot provider) would make it discoverable without log-grepping. Cross-provider feature; HubSpot would be the first surface.

---

## 9. Recommended next build direction

Three viable next slices, ranked by leverage:

1. **Mailchimp planning (highest leverage).** 14 registered action handlers — the single largest uncovered surface — and a major marketing-automation provider that complements the HubSpot CRM arc. HubSpot proved both the resolver-first pattern AND the dependsOn cascade in real production-grade use; Mailchimp will need similar resolvers (`mailchimp:audiences` → `mailchimp:tags` / `:segments` / `:campaigns`), and the cascade machinery is fully proven against two distinct providers (Google Sheets, HubSpot). Closing Mailchimp moves Phase-3 coverage from 62.3 % to 68.8 % (134 + 14 = 148 of 215).
2. **Microsoft Excel planning (lower-risk reuse).** 10 registered action handlers, structurally near-identical to Google Sheets (workbooks → worksheets vs spreadsheets → sheets). Most decisions are directly portable from the GSHEETS arc — minimal novel modeling. Good if Marcus wants a lower-context-cost win before another large CRM-shaped arc. Closing Excel moves coverage to 67.0 % (134 + 10 = 144 of 215).
3. **Notion `notion:databases` resolver (smallest polish).** Notion shipped at 16 / 16 metas with ZERO resolvers — every Notion id field today renders as plain text. Adding `notion:databases` (and follow-ups `notion:pages` / `notion:users`) polishes the existing surface without expanding it. Smallest scope; good "breather slice" between two large provider arcs.

**Default recommendation:** **Mailchimp planning next.** HubSpot proved the resolver/cascade machinery handles a complex multi-resolver provider cleanly; Mailchimp is the highest-leverage place to spend that proven infrastructure and pairs naturally with HubSpot (CRM + marketing automation is a common workflow shape). If Marcus prefers a smaller-context-cost slice, Microsoft Excel is the right next pick (structurally identical to Google Sheets — the GSHEETS arc decisions are directly portable). If Marcus prefers ideal-UX polish before another provider, `notion:databases` resolver is the right breather.

The HubSpot search-picker + property-picker follow-ups (§8) can land in parallel with any of the above — they do not block the next provider arc.

---

## 10. Push / PR readiness reminder

**Do not push yet.** Pre-push triage checklist for the HubSpot arc (HUBSPOT-1 → HUBSPOT-7):

- **Dirty parallel-work files** in the working tree must be triaged before a clean push:
  - `app/page.tsx` (modified, unrelated)
  - `docs/rules/database-security.md` (modified, unrelated)
  - `features/workflows/WorkflowsList.tsx` (modified, unrelated)
  - `PACKAGES.md` (untracked)
  - `scripts/list-users.mjs` (untracked)
  - `scripts/reset-user-password.mjs` (untracked, pre-existing lint warning)
- **Branch strategy** must be confirmed. The HubSpot arc shipped on `v2-provider-port-local` (6 local commits ahead of upstream as of HUBSPOT-6; 7 after this doc commit); the actual push target (feature branch vs PR-per-slice vs squash-and-PR) is open. The Google Sheets arc commits also still live on the same branch.
- **Final gates** must run on the push commit: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test`. Last green snapshot: HUBSPOT-6 (`1269d9762`) — 837 suites, 9683 / 9683.
- **PR body must include:**
  - **HubSpot provider coverage** — 26 actions + 1 trigger meta + `hubspot` added to `COVERED_PROVIDERS`. 1:1 handler↔meta drift enforced from here on. Resolver-first with 6 new resolvers (`hubspot:owners`, deal/ticket pipelines + stages, lists). Pipeline → stage cascade proven on deals AND tickets.
  - **Google Sheets provider coverage** (still in flight on the same branch) — 12 actions + 2 triggers + Drive metadata scope add; existing Google Sheets users must reconnect. See [`./google-sheets-metadata-outcomes.md`](./google-sheets-metadata-outcomes.md).
  - **Security controls** — `hubspot:remove_line_item` is `isDestructive: true` + `requiresConfirmation: true` + `riskLevel: high`; surface inherits the existing destructive-confirmation modal at activation / Run-now. 14 other HubSpot writes are medium-risk with `riskDescription`. testMode interception is enforced at the engine layer for all external HubSpot actions. Sensitive flags on PII / financial / commerce outputs.
  - **Migrations** — none for HubSpot. (No new tables; no schema changes for HubSpot. The HubSpot arc is purely metadata + resolver additions; the resolver layer reads through existing API wrappers.) The pre-existing `hubspot_app_subscriptions` + `hubspot_subscription_refs` tables ship with the underlying webhook trigger which predates this arc.
  - **New OAuth scopes** — NONE for HubSpot. All 6 resolvers + every action ride on the 18 OAuth scopes the HubSpot manifest already grants. **Existing HubSpot users do NOT need to reconnect** — a meaningful UX difference vs the Google Sheets arc.
  - **Deferred risks** — contact / company / deal / ticket / product search pickers are plain text in v1 (§8). Property picker is plain text (§8). Webhook subscription builder is paste-JSON, not a chip-input (§8). Trigger validated by activation registry + lifecycle but lacks a real-source-event replay harness (§8). `update_deal` / `update_ticket` / `update_product` / list-membership actions are medium-risk; an escalation path to `requiresConfirmation` exists if user reports show accidental impact (§8).
  - **Stripe rollout posture** — unchanged from the pre-arc state. HubSpot does not touch Stripe; the HubSpot arc is independent of any in-flight Stripe rollout.
  - **Rollback notes** — single-revert safe at HUBSPOT-7 (this commit) or HUBSPOT-6. Reverting HUBSPOT-6 alone removes `hubspot` from `COVERED_PROVIDERS` + drops the trigger meta, leaving 26 action metas + 6 resolvers in place (the structural test reverts to "partial coverage, intentionally not enforced"). Reverting HUBSPOT-5 additionally drops the 13 engagement / list / commerce metas. Reverting HUBSPOT-2 additionally removes the 6 resolvers. Reverting the whole arc back to HUBSPOT-1's `525178901` leaves the plan doc + zero shipped code. No DB or scope state needs reverting at any layer — the entire arc is purely additive metadata + resolver code; existing HubSpot users remain unaffected through any rollback.
