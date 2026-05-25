# Parity audit — HubSpot

**Status:** Audit / not yet accepted. **Doc-only commit.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md). Priority rank §3: **9** (after Shopify, before Mailchimp).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/hubspot/`](../../../integrations/hubspot/) (Slice 13).
**Phase 1 surface shipped:** 22 actions + 1 consolidated `webhook_received` trigger node with a 10-entry subscription-type allowlist.
**Recommendation up front:** Small parity slice — **4 actions PORT** (`remove_line_item`, `get_line_items`, `remove_from_list`, `get_products`) + **2 trigger event-types PORT** (`ticket.propertyChange`, `ticket.deletion`). **4 actions DEFER** (`get_forms`, `get_deal_pipelines`, plus engagement-triggers `note.creation` / `task.creation` / `call.creation` / `meeting.creation`). **3 items SKIP / NEED-DECISION** (`add_to_workflow`, `remove_from_workflow`, `form.submission`). Single most important decision: whether V1's `add_to_workflow` / `remove_from_workflow` workflow-enrollment actions are still product-meaningful given HubSpot's evolving Workflows API direction (D-HS1 §15).

The V2 baseline already absorbed the two highest-leverage HubSpot upgrades over V1: **(a)** consolidated single `webhook_received` trigger node with a subscription-type allowlist (vs V1's 17 separate trigger node types) and **(b)** app-level shared subscriptions with portal-scoped reference counting (`hubspot_app_subscriptions` + `hubspot_subscription_refs`, mirroring Shopify's per-topic shared-shop model) versus V1's per-workflow subscription-creation that leaked HubSpot subscription rows. **(c)** real `X-HubSpot-Signature-V3` HMAC-SHA256 verification with a 5-minute replay tolerance versus V1 having **NO** webhook signature verification (R7 closed). This audit's parity expansion is consequently small — Phase 1 / Slice 13 already absorbed the structural work.

---

## 1. V1 source paths audited

### Actions

| File | Lines | Notes |
|---|---|---|
| `lib/workflows/actions/hubspot/addToWorkflow.ts` | 65 | `automation/v2/workflows/{id}/enrollments` POST |
| `lib/workflows/actions/hubspot/createCall.ts` | – | call engagement |
| `lib/workflows/actions/hubspot/createLineItem.ts` | – | line item create |
| `lib/workflows/actions/hubspot/createMeeting.ts` | – | meeting engagement |
| `lib/workflows/actions/hubspot/createNote.ts` | – | note engagement |
| `lib/workflows/actions/hubspot/createProduct.ts` | – | product create |
| `lib/workflows/actions/hubspot/createTask.ts` | – | task engagement |
| `lib/workflows/actions/hubspot/createTicket.ts` | 407 | ticket create + association |
| `lib/workflows/actions/hubspot/getCompanies.ts` | 84 | companies list |
| `lib/workflows/actions/hubspot/getContacts.ts` | 84 | contacts list |
| `lib/workflows/actions/hubspot/getDealPipelines.ts` | 63 | pipelines GET — builder-UI dropdown loader shape |
| `lib/workflows/actions/hubspot/getDeals.ts` | 178 | deals list |
| `lib/workflows/actions/hubspot/getForms.ts` | 63 | forms GET — builder-UI dropdown loader shape |
| `lib/workflows/actions/hubspot/getLineItems.ts` | 96 | line items list |
| `lib/workflows/actions/hubspot/getOwners.ts` | 67 | owners list |
| `lib/workflows/actions/hubspot/getProducts.ts` | 80 | products list |
| `lib/workflows/actions/hubspot/getTickets.ts` | 157 | tickets list |
| `lib/workflows/actions/hubspot/removeFromList.ts` | 65 | list membership remove |
| `lib/workflows/actions/hubspot/removeFromWorkflow.ts` | 64 | workflow unenroll |
| `lib/workflows/actions/hubspot/removeLineItem.ts` | 59 | line item delete |
| `lib/workflows/actions/hubspot/updateCompany.ts` | – | company patch |
| `lib/workflows/actions/hubspot/updateContact.ts` | 174 | contact patch |
| `lib/workflows/actions/hubspot/updateLineItem.ts` | 90 | line item patch |
| `lib/workflows/actions/hubspot/updateProduct.ts` | 79 | product patch |
| `lib/workflows/actions/hubspot/updateTicket.ts` | – | ticket patch |
| `lib/workflows/actions/hubspot/index.ts` | 44 | re-exports |

### Manifest

| File | Lines | Notes |
|---|---|---|
| `lib/workflows/nodes/providers/hubspot/index.ts` | 1633 | main manifest — 9 trigger entries + 8 action entries; imports spread arrays from `triggers/*.ts` + `actions/*.ts` |
| `lib/workflows/nodes/providers/hubspot/types.ts` | 192 | shared types for trigger/action configs |
| `lib/workflows/nodes/providers/hubspot/createContactDynamic.ts` | 281 | dynamic-property variant of create_contact — NOT in the action manifest, NOT registered as a node type; dead-code candidate |
| `lib/workflows/nodes/providers/hubspot/triggers/tickets.ts` | 343 | 3 ticket trigger nodes |
| `lib/workflows/nodes/providers/hubspot/triggers/engagements.ts` | 590 | 4 engagement trigger nodes (note/task/call/meeting) |
| `lib/workflows/nodes/providers/hubspot/triggers/forms.ts` | 112 | 1 form.submission trigger node |
| `lib/workflows/nodes/providers/hubspot/actions/tickets.ts` | 513 | 3 ticket action nodes |
| `lib/workflows/nodes/providers/hubspot/actions/engagements.ts` | 630 | 4 engagement action nodes |
| `lib/workflows/nodes/providers/hubspot/actions/lineItems.ts` | 317 | 4 line-item action nodes |
| `lib/workflows/nodes/providers/hubspot/actions/listManagement.ts` | 52 | 1 remove_from_list action node (note: add_contact_to_list lives in main `index.ts`) |
| `lib/workflows/nodes/providers/hubspot/actions/productManagement.ts` | 239 | 3 product action nodes |
| `lib/workflows/nodes/providers/hubspot/actions/utilities.ts` | 141 | 3 utility action nodes (owners / forms / deal_pipelines) |
| `lib/workflows/nodes/providers/hubspot/actions/workflowManagement.ts` | 97 | 2 workflow-enrollment action nodes |
| `lib/workflows/nodes/providers/hubspot/actions/updateCompany.ts` | 351 | 1 update_company action node |
| `lib/workflows/nodes/providers/hubspot/actions/updateContact.ts` | 281 | 1 update_contact action node |

### Trigger lifecycle + OAuth + webhook utils

| File | Lines | Notes |
|---|---|---|
| `lib/triggers/providers/HubSpotTriggerLifecycle.ts` | 380 | per-workflow `onActivate` POSTs `/webhooks/v3/{appId}/subscriptions` ONCE per workflow trigger (no de-dup); `onDeactivate` DELETEs each by `external_id`; `onDelete = onDeactivate`. **Per-workflow lifecycle (R11) — creates a separate HubSpot subscription per workflow even when 10 workflows want `contact.creation`.** |
| `lib/integrations/oauthConfig.ts` (entries 386–404) | 18 | hubspot OAuth entry — `refreshRequiresClientAuth: true`, `authMethod: 'body'`, `refreshTokenExpirationSupported: false` (i.e. refresh tokens do NOT carry expiration; reusable indefinitely) |
| `lib/integrations/hubspotScopes.ts` | 30 | the 18 default scopes |
| `lib/webhooks/hubspotWebhookUtils.ts` | 380 | `buildHubSpotTriggerData()` — imperative payload normalization: maps `props.firstname` → `firstName`, walks associations[], owner-lookup chain (`hubspot_owner_id__label` → `hubspot_owner_name` → `hs_owner_name` → `ownername`), routes custom properties to `customProperties` |
| `lib/webhooks/verification.ts` | – | **NO `hubspot` entry** — V1 does not verify the X-HubSpot-Signature on inbound webhooks. R7 in master rot catalog. |
| `lib/webhooks/normalizer.ts` | – | NO hubspot case — V1 normalizes via `hubspotWebhookUtils.ts` directly |
| `__tests__/workflows/v2/hubspotWebhookUtils.test.ts` | – | only HubSpot test in V1 — covers `buildHubSpotTriggerData`, `shouldSkipByConfig`, `normalizeIdList` utility shapes |
| `app/api/integration-webhooks/[provider]/route.ts` | – | shared per-provider webhook receive route (no dedicated HubSpot route) |

---

## 2. V1 actions inventory

V1 ships **30 action node types** in the manifest. `comingSoon: false` count: 30. Dead-code count: 1 (`createContactDynamic.ts` exists but is NOT registered).

| # | Action key | One-line behavior |
|---|---|---|
| 1 | `hubspot_action_create_contact` | POST `/crm/v3/objects/contacts` |
| 2 | `hubspot_action_update_contact` | PATCH `/crm/v3/objects/contacts/{id}` |
| 3 | `hubspot_action_create_company` | POST `/crm/v3/objects/companies` |
| 4 | `hubspot_action_update_company` | PATCH `/crm/v3/objects/companies/{id}` |
| 5 | `hubspot_action_create_deal` | POST `/crm/v3/objects/deals` |
| 6 | `hubspot_action_update_deal` | PATCH `/crm/v3/objects/deals/{id}` |
| 7 | `hubspot_action_add_contact_to_list` | POST `/contacts/v1/lists/{listId}/add` |
| 8 | `hubspot_action_get_contacts` | GET `/crm/v3/objects/contacts` |
| 9 | `hubspot_action_get_companies` | GET `/crm/v3/objects/companies` |
| 10 | `hubspot_action_get_deals` | GET `/crm/v3/objects/deals` |
| 11 | `hubspot_action_create_note` | POST `/crm/v3/objects/notes` + association |
| 12 | `hubspot_action_create_task` | POST `/crm/v3/objects/tasks` |
| 13 | `hubspot_action_create_call` | POST `/crm/v3/objects/calls` |
| 14 | `hubspot_action_create_meeting` | POST `/crm/v3/objects/meetings` |
| 15 | `hubspot_action_create_line_item` | POST `/crm/v3/objects/line_items` |
| 16 | `hubspot_action_update_line_item` | PATCH `/crm/v3/objects/line_items/{id}` |
| 17 | `hubspot_action_remove_line_item` | DELETE `/crm/v3/objects/line_items/{id}` |
| 18 | `hubspot_action_get_line_items` | GET `/crm/v3/objects/line_items` |
| 19 | `hubspot_action_remove_from_list` | POST `/contacts/v1/lists/{listId}/remove` |
| 20 | `hubspot_action_create_product` | POST `/crm/v3/objects/products` |
| 21 | `hubspot_action_update_product` | PATCH `/crm/v3/objects/products/{id}` |
| 22 | `hubspot_action_get_products` | GET `/crm/v3/objects/products` |
| 23 | `hubspot_action_create_ticket` | POST `/crm/v3/objects/tickets` |
| 24 | `hubspot_action_update_ticket` | PATCH `/crm/v3/objects/tickets/{id}` |
| 25 | `hubspot_action_get_tickets` | GET `/crm/v3/objects/tickets` |
| 26 | `hubspot_action_get_owners` | GET `/crm/v3/objects/owners` |
| 27 | `hubspot_action_get_forms` | GET `/forms/v2/forms` (Forms API — distinct from CRM v3) |
| 28 | `hubspot_action_get_deal_pipelines` | GET `/crm/v3/pipelines/deals` |
| 29 | `hubspot_action_add_to_workflow` | POST `/automation/v2/workflows/{id}/enrollments` |
| 30 | `hubspot_action_remove_from_workflow` | DELETE `/automation/v2/workflows/{id}/enrollments` |

---

## 3. V1 triggers inventory

V1 ships **17 trigger node types**, each surfacing a distinct HubSpot subscription event-type. **All webhook-based** via HubSpot's Public App Webhooks API (`POST /webhooks/v3/{appId}/subscriptions`). **Lifecycle: per-workflow** — each workflow activation creates a separate HubSpot subscription, even when 10 workflows watch the same event type for the same portal.

| # | Trigger key | HubSpot subscription type | Notes |
|---|---|---|---|
| 1 | `hubspot_trigger_contact_created` | `contact.creation` | |
| 2 | `hubspot_trigger_contact_updated` | `contact.propertyChange` | optional propertyName filter |
| 3 | `hubspot_trigger_contact_deleted` | `contact.deletion` | |
| 4 | `hubspot_trigger_company_created` | `company.creation` | |
| 5 | `hubspot_trigger_company_updated` | `company.propertyChange` | optional propertyName filter |
| 6 | `hubspot_trigger_company_deleted` | `company.deletion` | |
| 7 | `hubspot_trigger_deal_created` | `deal.creation` | |
| 8 | `hubspot_trigger_deal_updated` | `deal.propertyChange` | optional propertyName filter |
| 9 | `hubspot_trigger_deal_deleted` | `deal.deletion` | |
| 10 | `hubspot_trigger_ticket_created` | `ticket.creation` | |
| 11 | `hubspot_trigger_ticket_updated` | `ticket.propertyChange` | optional propertyName filter |
| 12 | `hubspot_trigger_ticket_deleted` | `ticket.deletion` | |
| 13 | `hubspot_trigger_note_created` | `note.creation` | engagement subtype |
| 14 | `hubspot_trigger_task_created` | `task.creation` | engagement subtype |
| 15 | `hubspot_trigger_call_created` | `call.creation` | engagement subtype |
| 16 | `hubspot_trigger_meeting_created` | `meeting.creation` | engagement subtype |
| 17 | `hubspot_trigger_form_submission` | `form.submission` | **distinct subscription model** — `/forms/v2/...`, NOT `/webhooks/v3/{appId}/subscriptions` |

**Trigger lifecycle file:** [`lib/triggers/providers/HubSpotTriggerLifecycle.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/HubSpotTriggerLifecycle.ts) — 380 LOC. Single `TRIGGER_TYPE_MAPPING` dict maps each `hubspot_trigger_*` node-type to its subscription event-type + optional propertyName. **Per-workflow** lifecycle — `onActivate` POSTs to `/webhooks/v3/{appId}/subscriptions` once per workflow, `onDeactivate` DELETEs each by stored `external_id`. **No reference counting** — if 10 workflows want `contact.creation`, V1 creates 10 separate HubSpot-side subscriptions.

---

## 4. V2 current surface

V2 ships **22 actions** + **1 consolidated trigger node** with a **10-entry subscription-type allowlist**.

### Actions (22)

Registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts):

`create_contact`, `update_contact`, `get_contacts`,
`create_company`, `update_company`, `get_companies`,
`create_deal`, `update_deal`, `get_deals`,
`add_contact_to_list`,
`create_ticket`, `update_ticket`, `get_tickets`,
`create_note`, `create_task`, `create_call`, `create_meeting`,
`create_line_item`, `update_line_item`,
`create_product`, `update_product`,
`get_owners`.

Each action is a per-file `ActionHandler` with sibling `.schema.ts`. All use [`integrations/_shared/hubspot/api/*.ts`](../../../integrations/_shared/hubspot/api/) wrappers (`contacts.ts`, `companies.ts`, `deals.ts`, `tickets.ts`, `engagements.ts`, `lineItems.ts`, `lists.ts`, `products.ts`, `owners.ts`, `associations.ts`, `webhookSubscriptions.ts`, `me.ts`). 22 V2 actions vs 30 V1 actions; gap = 8 (see §5).

### Trigger (1 consolidated node)

`webhook_received` — [`integrations/hubspot/triggers/webhookReceived/`](../../../integrations/hubspot/triggers/webhookReceived/). Workflow author selects one or more event-types from a 10-entry curated allowlist at trigger config time:

`contact.creation`, `contact.propertyChange`, `contact.deletion`,
`company.creation`, `company.propertyChange`, `company.deletion`,
`deal.creation`, `deal.propertyChange`, `deal.deletion`,
`ticket.creation`.

The allowlist lives at [`integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts`](../../../integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts); activation rejects unrecognized values with a typed error. **App-level shared subscriptions with portal-scoped reference counting** via `hubspot_app_subscriptions` + `hubspot_subscription_refs` tables ([`repositories/hubspotAppSubscriptions.ts`](../../../repositories/hubspotAppSubscriptions.ts) + [`repositories/hubspotSubscriptionRefs.ts`](../../../repositories/hubspotSubscriptionRefs.ts), migrations [`20260510000000_hubspot_app_subscriptions.sql`](../../../supabase/migrations/20260510000000_hubspot_app_subscriptions.sql) + [`20260510000001_hubspot_subscription_refs.sql`](../../../supabase/migrations/20260510000001_hubspot_subscription_refs.sql)).

### Webhook receive + signature verification

[`integrations/hubspot/triggers/webhookReceived/receive.ts`](../../../integrations/hubspot/triggers/webhookReceived/receive.ts) + [`integrations/_shared/hubspot/webhooks/signature.ts`](../../../integrations/_shared/hubspot/webhooks/signature.ts). **Real X-HubSpot-Signature-V3 HMAC-SHA256 verification** keyed on `HUBSPOT_CLIENT_SECRET` with the canonical request string (`requestMethod + requestUri + rawBody + requestTimestamp`) and a 5-minute replay tolerance. Closes master rot R7 (V1 had no signature verification at all).

### Manifest

[`integrations/hubspot/manifest.ts`](../../../integrations/hubspot/manifest.ts) — `oauth: true`, `webhookTrigger: true`, `pollingTrigger: false`, `actions: true`. 18 required scopes (V1 parity), 4-hour health-check interval. `refreshable: true` with non-rotated refresh tokens (HubSpot's documented "refresh token has no expiration field" model). `accountIdField: "hubId"` — one HubSpot integration per (user, portal).

### Tests

V2 ships ~16 HubSpot test suites at `tests/unit/integrations/hubspot/` covering each action + the trigger pipeline + the manifest + OAuth + the shared subscription repos. V1 ships **1** test file (`hubspotWebhookUtils.test.ts` for utility shape coverage only). V2 has **3 orders of magnitude more test density** than V1 for HubSpot.

---

## 5. Missing actions

Set difference: V1 actions (30) minus V2 actions (22) = **8 missing actions**.

| # | V1 action key | V1 endpoint | Why not in V2 today |
|---|---|---|---|
| 1 | `hubspot_action_remove_line_item` | DELETE `/crm/v3/objects/line_items/{id}` | Symmetric pair `create_line_item` + `update_line_item` shipped; the delete companion not yet. |
| 2 | `hubspot_action_get_line_items` | GET `/crm/v3/objects/line_items` | Read-side companion to the create/update pair not yet shipped. |
| 3 | `hubspot_action_remove_from_list` | POST `/contacts/v1/lists/{listId}/remove` | Symmetric to `add_contact_to_list` shipped; remove companion not yet. |
| 4 | `hubspot_action_get_products` | GET `/crm/v3/objects/products` | Read-side companion to the create/update pair not yet shipped. |
| 5 | `hubspot_action_get_forms` | GET `/forms/v2/forms` | V1 surface is builder-UI dropdown loader shape (Forms API, not CRM v3). Low workflow-runtime leverage. |
| 6 | `hubspot_action_get_deal_pipelines` | GET `/crm/v3/pipelines/deals` | V1 surface is builder-UI dropdown loader shape (`deal_stage` enum resolution at config time). Low workflow-runtime leverage. |
| 7 | `hubspot_action_add_to_workflow` | POST `/automation/v2/workflows/{id}/enrollments` | HubSpot Workflows enrollment API — HubSpot's product surface is evolving (legacy v2 endpoint vs newer Operations Hub flows). Need product decision. |
| 8 | `hubspot_action_remove_from_workflow` | DELETE `/automation/v2/workflows/{id}/enrollments` | Same shape as `add_to_workflow`; same decision. |

---

## 6. Missing triggers

Set difference: V1 trigger event-types (17) minus V2 allowlist (10) = **7 missing trigger event-types**.

V2 ships **1 consolidated trigger node** (`webhook_received`) versus V1's 17 separate node types — that surface consolidation is itself a closed audit win (workflow author picks event-types from an allowlist at config time rather than choosing one of 17 distinct trigger nodes). The remaining gap is event-type coverage on the allowlist.

| # | V1 trigger key | HubSpot subscription type | Why not in V2 allowlist today |
|---|---|---|---|
| 1 | `hubspot_trigger_ticket_updated` | `ticket.propertyChange` | Slice 13 plan deferred to follow-up. Allowlist addition only; receive + normalize + lifecycle plumbing already cover it. |
| 2 | `hubspot_trigger_ticket_deleted` | `ticket.deletion` | Same — allowlist addition. |
| 3 | `hubspot_trigger_note_created` | `note.creation` | Slice 13 plan deferred until shared engagement schema is needed. Generic `webhook_received` normalize would still emit but workflow authors get a thinly-typed payload. |
| 4 | `hubspot_trigger_task_created` | `task.creation` | Same as note.creation. |
| 5 | `hubspot_trigger_call_created` | `call.creation` | Same as note.creation. |
| 6 | `hubspot_trigger_meeting_created` | `meeting.creation` | Same as note.creation. |
| 7 | `hubspot_trigger_form_submission` | `form.submission` | **Distinct subscription model** — `/forms/v2/...`, NOT `/webhooks/v3/{appId}/subscriptions`. Would require a separate activate / receive / normalize path. Out of scope for an additive parity slice. |

---

## 7. Port / skip / defer table

Every row from §§5 + 6 gets a decision.

### Actions

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `remove_line_item` | Action | **PORT** | Symmetric with `create_line_item` + `update_line_item` already shipped. Wrapper [`lineItems.ts`](../../../integrations/_shared/hubspot/api/lineItems.ts) already exists — adding a `deleteLineItem` thin wrapper + handler + schema is ~60 LOC. Bounded output (`{success:true, lineItemId, deleted:true}`). Q4 idempotency: `DELETE` is naturally idempotent on the provider side; V2's session-side-effect bracketing still records the call for replay-safety. |
| `get_line_items` | Action | **PORT** | Read-side companion. Wrapper exists. Audit recommends paginating identically to `get_contacts` / `get_companies` / `get_deals` already shipped (cursor + bounded limit). Use case: deal-line-item enumeration for invoice / quote workflows. |
| `remove_from_list` | Action | **PORT** | Symmetric with `add_contact_to_list` already shipped. Wrapper [`lists.ts`](../../../integrations/_shared/hubspot/api/lists.ts) already exists — adding a `removeFromList` companion is ~60 LOC. Same Q4 idempotency note as `remove_line_item`. |
| `get_products` | Action | **PORT** | Read-side companion to `create_product` + `update_product` already shipped. Wrapper [`products.ts`](../../../integrations/_shared/hubspot/api/products.ts) already exists. Catalog-read use case. |
| `get_forms` | Action | **DEFER** | V1 surface is builder-UI dropdown loader for the deferred `form.submission` trigger. As a runtime workflow action ("fetch all forms in the portal at execute time") the leverage is low — workflows rarely need this at runtime. If `form.submission` ever lands as a trigger event-type, `get_forms` lands alongside it for builder-time form-id resolution. Phase-tag: depends on form.submission decision. |
| `get_deal_pipelines` | Action | **DEFER** | Same shape — builder-UI dropdown loader for `deal_stage` / `pipeline_id` enum resolution at config time. Low runtime leverage. Phase-tag: depends on a builder UI pass that needs server-side option-loading. |
| `add_to_workflow` | Action | **NEEDS PRODUCT DECISION** | HubSpot Workflows API (`automation/v2/`) has been in flux as HubSpot rolls out Operations Hub's newer flow surface. V1 uses the legacy v2 endpoint. Audit cannot recommend port/skip without Marcus confirming **(a)** whether HubSpot Workflows enrollment is still product-meaningful for ChainReact users and **(b)** which API surface to target (v2 endpoint vs newer flows endpoint). See D-HS1 §15. |
| `remove_from_workflow` | Action | **NEEDS PRODUCT DECISION** | Same shape — paired with `add_to_workflow`. Both decisions hang on D-HS1. |

### Trigger event-types

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `ticket.propertyChange` | Trigger event | **PORT** | Mechanical allowlist addition to [`HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES`](../../../integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts) — the activate / receive / normalize / dispatch / dedup plumbing already supports `*.propertyChange` events for contact / company / deal. Adding `ticket.propertyChange` is ~3 LOC + tests. |
| `ticket.deletion` | Trigger event | **PORT** | Same shape — allowlist addition + tests. |
| `note.creation` | Trigger event | **DEFER (PORT-WHEN-NEEDED)** | Allowlist addition is mechanical, but engagement events carry a meaningfully-different payload shape (no `propertyName` / `propertyValue`, no associations[] in the webhook body itself — the `objectId` points to an engagement record that requires a follow-up `/crm/v3/objects/notes/{id}` lookup to resolve associations). V2's `normalize` currently passes the raw event verbatim — workflows would receive a thin payload. Defer until a real workflow requests engagement triggers, then ship the four engagement event-types together with a shared `engagement-specific` normalize extension. Phase-tag: on-demand follow-up. |
| `task.creation` | Trigger event | **DEFER (PORT-WHEN-NEEDED)** | Same as note.creation. |
| `call.creation` | Trigger event | **DEFER (PORT-WHEN-NEEDED)** | Same as note.creation. |
| `meeting.creation` | Trigger event | **DEFER (PORT-WHEN-NEEDED)** | Same as note.creation. |
| `form.submission` | Trigger event | **SKIP UNDER CURRENT TRANSPORT** | Distinct subscription model — `/forms/v2/...` HubSpot Forms API, NOT `/webhooks/v3/{appId}/subscriptions`. Would require a separate activate route (per-form subscription registration), a separate receive route, and a separate normalize shape. Audit recommends SKIP at this slice. If a downstream workflow truly needs form.submission, file it as its own platform-tier slice ("HubSpot Forms transport") so the design gets a fair review. |

### Decision counts

- **PORT:** 6 items (4 actions + 2 trigger event-types).
- **DEFER (PORT-WHEN-NEEDED):** 6 items (`get_forms`, `get_deal_pipelines`, 4 engagement triggers).
- **SKIP under current transport:** 1 item (`form.submission`).
- **NEEDS PRODUCT DECISION:** 2 items (`add_to_workflow`, `remove_from_workflow`).

---

## 8. V1 rot / bugs / dead code inventory

V1 rot beyond the master-plan §5 categories. Citations include file paths + LOC.

| ID | Pattern | Status |
|---|---|---|
| **R7** (master) | **Unsafe webhook verification** — `lib/webhooks/verification.ts` has NO `hubspot` entry; webhook signature is NOT checked. | **CLOSED in V2** — [`integrations/_shared/hubspot/webhooks/signature.ts`](../../../integrations/_shared/hubspot/webhooks/signature.ts) ships real X-HubSpot-Signature-V3 HMAC-SHA256 verification with 5-minute replay tolerance, keyed on `HUBSPOT_CLIENT_SECRET`. |
| **R11** (master) | **Per-workflow webhook subscription creation (eager-bulk)** — V1's `HubSpotTriggerLifecycle.onActivate` POSTs to `/webhooks/v3/{appId}/subscriptions` once per workflow with no de-dup. 10 workflows watching `contact.creation` create 10 HubSpot-side subscriptions. | **CLOSED in V2** — app-level shared subscriptions with portal-scoped reference counting via `hubspot_app_subscriptions` (one row per (appId, eventType, propertyName)) + `hubspot_subscription_refs` (one row per (app_subscription_id, workflow_id, node_id)). Deactivate walks refs and decrements; the HubSpot-side subscription stays alive while any ref points at it. Mirrors Shopify's per-topic shared-shop model. |
| **HS-R1** | **17 separate trigger node types for what is fundamentally one webhook trigger** — V1 ships `hubspot_trigger_contact_created`, `hubspot_trigger_contact_updated`, ..., one per (object, event) pair. Workflow authors who want "fire on contact changes" pick one of three nodes; cross-object workflows duplicate logic. | **CLOSED in V2** — single `webhook_received` trigger node with a curated subscription-type allowlist. Workflow authors pick one or more event-types at trigger config time; one node configures multiple event types. The V1 17-node split was UI chrome, not transport — V2's consolidation matches Shopify's `webhook_received` shape. |
| **HS-R2** | **Inline payload normalization with "humanize" mapping** — `lib/webhooks/hubspotWebhookUtils.ts:buildHubSpotTriggerData()` (380 LOC) maps `props.firstname` → `firstName`, walks associations[], owner-lookup chain (`hubspot_owner_id__label` → `hubspot_owner_name` → `hs_owner_name` → `ownername`), routes custom properties to `customProperties` bag. Lossy + magic. | **NOT PORTED in V2** — V2's [`normalize.ts`](../../../integrations/hubspot/triggers/webhookReceived/normalize.ts) is bounded: flattens load-bearing discriminator fields (`subscriptionType`, `portalId`, `hubId`, `objectId`, `propertyName`, `propertyValue`, `occurredAt`, `subscriptionId`, `appId`, `attemptNumber`, `changeSource`) and stores the raw HubSpot event verbatim under `payload.event`. Workflows that want enriched contact-property data make a follow-up `get_contacts` call; V2 doesn't try to hide that the webhook is a notification, not a record. |
| **HS-R3** | **Per-workflow `getWebhookUrl(workflowId)`** — V1 builds workflow-specific webhook URLs and registers each with HubSpot. HubSpot's Public App model uses a SINGLE global target URL configured in the developer-portal app settings; per-workflow URLs only work if each is a real, addressable route — meaning V1's `app/api/integration-webhooks/[provider]/route.ts` had to dispatch by URL-encoded workflow id rather than by signed payload data. | **NOT PORTED in V2** — V2 uses HubSpot's documented single-global-target-URL model. Receive route routes inbound events by `portalId` (in payload) → `hubId` (denormalized on the ref row), NOT by URL query params. Cleaner alignment with HubSpot's actual webhook architecture. |
| **HS-R4** | **Dead-code `createContactDynamic.ts` at the manifest layer** — `lib/workflows/nodes/providers/hubspot/createContactDynamic.ts` (281 LOC) defines a "dynamic property" variant of create_contact. NOT registered in the manifest's node-types array; NOT consumed by any action handler. Leftover scaffold. | **NOT PORTED in V2** — V2 has a single `createContact` handler. Dynamic property selection is a builder-UI concern (Phase 3), not a separate action node. |
| **HS-R5** | **Workflow-management actions on legacy automation/v2 endpoint** — `addToWorkflow.ts` + `removeFromWorkflow.ts` target `automation/v2/workflows/{id}/enrollments`. HubSpot's Operations Hub flows are the newer surface; the v2 endpoint's longevity is unclear. | **DEFERRED in V2** pending the D-HS1 product decision (see §15). |
| **HS-R6** | **Single test file** — `__tests__/workflows/v2/hubspotWebhookUtils.test.ts` is V1's ONLY HubSpot test, and it covers utility shape only (not the trigger lifecycle, not the action handlers, not webhook signature verification because there is none). Bug-discovery-by-test density is minimal. | **NOT PORTED** — V2 ships ~16 HubSpot test suites at `tests/unit/integrations/hubspot/`. Test density is now in line with other V2 providers. |
| **HS-R7** | **OAuth `refreshTokenExpirationSupported: false`** — V1's `oauthConfig.ts:395` notes the field as `false`, which historically caused confusion: it does NOT mean "refresh is not supported," it means "the refresh token itself does not carry an explicit expiration field" (i.e. is reusable indefinitely). V2's manifest comment ([`manifest.ts:28-31`](../../../integrations/hubspot/manifest.ts#L28)) clarifies this for future readers. | **DOCUMENTED in V2** — `refreshable: true` with a doc-comment that disambiguates V1's `false` value. |

No new master-catalog entries surface from this audit — every rot finding fits an existing master row or stays HubSpot-specific (HS-R1..HS-R7).

---

## 9. V2 dependency map

Each parity item's V2 dependencies:

| Item | API wrapper | Handler shape | Schema shape | Other deps |
|---|---|---|---|---|
| `remove_line_item` | [`integrations/_shared/hubspot/api/lineItems.ts`](../../../integrations/_shared/hubspot/api/lineItems.ts) — needs a `deleteLineItem` companion export (~15 LOC, plain `DELETE` against `/crm/v3/objects/line_items/{id}`) | New `actions/removeLineItem.ts` (~50 LOC; mirrors `updateLineItem` shape) | New `actions/removeLineItem.schema.ts` — `lineItemId: z.string().min(1)` only | None new |
| `get_line_items` | Same wrapper file — needs a `listLineItems` companion (~30 LOC; cursor + `limit` query params) | New `actions/getLineItems.ts` (~70 LOC; mirrors `getContacts` pagination shape) | New `actions/getLineItems.schema.ts` — pagination + property-select | None new |
| `remove_from_list` | [`integrations/_shared/hubspot/api/lists.ts`](../../../integrations/_shared/hubspot/api/lists.ts) — needs a `removeFromList` companion (~15 LOC) | New `actions/removeFromList.ts` (~50 LOC; mirrors `addContactToList`) | New `actions/removeFromList.schema.ts` — `listId` + `contactId` | None new |
| `get_products` | [`integrations/_shared/hubspot/api/products.ts`](../../../integrations/_shared/hubspot/api/products.ts) — needs a `listProducts` companion (~30 LOC) | New `actions/getProducts.ts` (~70 LOC; mirrors `getContacts` shape) | New `actions/getProducts.schema.ts` — pagination + property-select | None new |
| `ticket.propertyChange` | None — receive + normalize + dispatch plumbing already supports it | None — only the allowlist constant changes | Schema test: assert allowlist + propertyName validation still hold for the ticket case | None new |
| `ticket.deletion` | Same | Same | Same | None new |

**No new contract surface required.** No new repository tables, no new shared infrastructure, no new manifest-level capabilities. Every PORT item is additive to an existing pattern.

---

## 10. Required platform gaps

**None.** V2 already shipped the only platform-tier work HubSpot would have needed:

- **App-level shared subscriptions with portal-scoped reference counting** — Slice 13 Commits 5 + adjacent: `hubspot_app_subscriptions` + `hubspot_subscription_refs` tables + their repositories.
- **X-HubSpot-Signature-V3 HMAC-SHA256 verification** — Slice 13 Commit 5: [`integrations/_shared/hubspot/webhooks/signature.ts`](../../../integrations/_shared/hubspot/webhooks/signature.ts).
- **HubSpot API request layer** — Slice 13 Commits 2-4: [`integrations/_shared/hubspot/api/_request.ts`](../../../integrations/_shared/hubspot/api/_request.ts) with refreshAndRetry + canonical error mapping.

If D-HS1 is resolved to **port `add_to_workflow` / `remove_from_workflow` on the legacy automation/v2 endpoint**, that lands inside this parity slice with no new platform tier. If D-HS1 is resolved to **port on the newer Operations Hub flows endpoint**, that may require a new wrapper file (`integrations/_shared/hubspot/api/flows.ts`) — still a provider-local addition, NOT a new platform tier.

If the deferred engagement triggers (`note.creation` / `task.creation` / `call.creation` / `meeting.creation`) are ever ported, they likely warrant a small typed `engagement`-payload schema extension on the normalize side — provider-local, not platform-tier.

---

## 11. Effort estimate

Comparable to Sheets 2.3 (small additive parity batch) and considerably smaller than Sheets 2.1 (5 net-new actions + 2 new wrappers).

| Reference | Approx commit count |
|---|---|
| **HubSpot parity** (4 actions + 2 trigger event-types — accepted PORT set) | **3 commits** (1 plan + 1 actions feat + 1 trigger-allowlist feat) — **or 4** if e2e parity coverage warrants its own commit. |

The 4 action ports group naturally into one feat commit (~250 LOC source + ~400 LOC tests). The 2 trigger event-type allowlist additions group into one feat commit (~30 LOC + ~60 LOC tests + receive-route allowlist coverage). The e2e walkthrough at `tests/e2e/slice-13-hubspot-walkthrough.spec.ts` already exercises the trigger pipeline + a representative action chain; extending it to cover the new actions + trigger event-types is light (one new describe block or two).

If D-HS1 lands as PORT, add one more feat commit for `add_to_workflow` + `remove_from_workflow` (~150 LOC source + ~300 LOC tests). Total at the high end: **5 commits + 1 outcomes doc**.

**Outcomes commit** is the standard parity-arc closer.

---

## 12. Risk estimate

Top 3 risks for the PORT set.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R-HS-1** — HubSpot API rate-limit interactions for the new GET-list actions (`get_line_items`, `get_products`) | Medium | Low | HubSpot's CRM v3 list endpoints share the standard rate-limit budget already in play for `get_contacts` / `get_companies` / `get_deals`. V2's API request layer surfaces 429 retries via `refreshAndRetry`. Bound the default `limit` to 100 (HubSpot's max per page) and require explicit pagination opt-in for full traversal — same shape as `get_contacts`. |
| **R-HS-2** — Ticket event-type allowlist additions reach `webhook_event_dedup` collisions with existing rows from past e2e runs | Low | Low | V2's eventId derivation prefers HubSpot's `eventId` (globally unique per HubSpot's docs) with a deterministic fallback. New e2e coverage MUST use per-run randomized portal-ids / object-ids (Sheets 2.2 §2.16 + Sheets 2.3 §2.16 rule — same dedup table is system-wide and NOT cascaded by `deleteTestUser`). |
| **R-HS-3** — D-HS1 unresolved blocks `add_to_workflow` / `remove_from_workflow` port | Medium | Low | The PORT set is independently shippable. D-HS1 resolution is decoupled — if Marcus chooses SKIP, both actions disappear; if PORT-on-legacy, one additional commit; if PORT-on-flows, a new wrapper file lands in the same commit. None of the three blocks the 4-action + 2-trigger PORT set. |

No risk warrants splitting the parity slice. No risk warrants a feature flag.

---

## 13. Recommended parity batch plan

A 3-commit slice (4 commits including this audit doc) — extended to 5 if D-HS1 lands as PORT.

| # | Commit | What lands |
|---|---|---|
| 1 | (this) | `docs(hubspot): add parity audit` — doc-only |
| 2 | impl | `feat(hubspot): add line item + product + list read/remove actions` — 4 new action handlers (`remove_line_item`, `get_line_items`, `remove_from_list`, `get_products`) + 4 schema files + 4 thin wrapper-companion exports on `lineItems.ts` / `lists.ts` / `products.ts` + handler registry entries. Tests: per-action handler suite + schema validation + wrapper-companion unit tests. Manifest stays unchanged (no new capability flag). |
| 3 | impl | `feat(hubspot): expand webhook_received allowlist with ticket events` — adds `ticket.propertyChange` + `ticket.deletion` to `HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES`. Tests: allowlist-coverage + activate / receive / normalize / dispatch parity for the two new event types (propertyChange has `propertyName` required at activate; deletion has neither). E2e: extend `slice-13-hubspot-walkthrough.spec.ts` with two new describe blocks (one per event-type). |
| (4) | impl | **CONDITIONAL on D-HS1 = PORT** — `feat(hubspot): add workflow enrollment actions` (`add_to_workflow` + `remove_from_workflow`). New wrapper file if target is the newer flows endpoint; otherwise extends `engagements.ts` patterns. Includes Q4 idempotency bracketing + bounded output projection. |
| (4 or 5) | docs | `docs(hubspot): document parity outcomes` — outcomes retro per the Sheets 2.3 / Stripe 2.1 / Airtable 2.1 template. |

Each implementation commit individually passes gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npx jest tests/unit/integrations/hubspot/`
- `npm test`
- (Commit 3 + final e2e commit) `CI=1 npx playwright test tests/e2e/slice-13-hubspot-walkthrough.spec.ts --workers=1` — twice for cross-run stability if randomized values are used.

Explicit path staging only — no `git add .`. Unrelated parallel-work files untouched.

---

## 14. Exit checklist

This audit is complete when Marcus has confirmed:

- [ ] The 6-item PORT set (4 actions + 2 trigger event-types) is correct.
- [ ] The 6-item DEFER set (`get_forms`, `get_deal_pipelines`, 4 engagement triggers) is correct as PORT-WHEN-NEEDED.
- [ ] The 1-item SKIP set (`form.submission`) is correct — distinct transport, file a separate slice if/when a workflow actually needs it.
- [ ] D-HS1 (workflow-enrollment actions) has a direction: SKIP / PORT-on-legacy-v2 / PORT-on-flows.
- [ ] HS-R1..HS-R7 rot findings either land here as additional "NOT PORTED" rows in the parity slice's outcomes doc OR get individual sign-off.
- [ ] The 3-commit batch plan (extended to 5 if D-HS1 = PORT) matches Marcus's sizing preference.
- [ ] No required platform gaps are missed.

**Implementation does NOT begin before Marcus accepts this audit and resolves D-HS1.**

---

## 15. Open decisions for Marcus

### D-HS1 — Workflow-enrollment actions direction

V1 ships `add_to_workflow` + `remove_from_workflow` targeting `POST/DELETE /automation/v2/workflows/{id}/enrollments`. HubSpot's Operations Hub product surface is migrating to newer "flow" abstractions; the v2 endpoint's longevity is unclear without product confirmation.

Three options:

- **(a) SKIP.** Drop both actions from the V2 surface entirely. Lowest risk; closes the audit faster. Workflow authors who need contact enrollment build an external alternative (e.g. webhook → ChainReact → custom HubSpot API call action — if/when such an escape hatch ships).
- **(b) PORT on the legacy v2 endpoint.** Mirrors V1 exactly. ~1 extra commit. Risk: HubSpot deprecates the endpoint mid-2026 and we re-do the work.
- **(c) PORT on the newer Operations Hub flows endpoint.** Adds a new `integrations/_shared/hubspot/api/flows.ts` wrapper. ~1 extra commit + research cost for the newer surface's exact contract. Lowest re-do risk but highest upfront cost.

**Recommendation: (a) SKIP** until a real workflow asks. ChainReact's user base today is small enough that the cost of porting a deprecation candidate exceeds the value. Re-open if Marcus has concrete user demand.

---

## 16. What happens after this audit is accepted

This audit is doc-only. After Marcus accepts:

1. The 6-item PORT batch lands as 2 feat commits + 1 outcomes commit (or 3 + 1 if D-HS1 = PORT).
2. The 6-item DEFER set + 1-item SKIP set are tracked in the outcomes doc's "Deferred" section.
3. CLAUDE.md gains a "HubSpot parity" entry alongside Stripe / Airtable / Sheets / Slack / Gmail / Notion / Excel parity entries.

The next provider audit in priority order is **Mailchimp** (rank #10 per phase-2-plan §3) once HubSpot parity closes — unless a higher-priority audit slot opens (e.g. Microsoft Outlook mail, rank #12; Google Calendar / Drive / OneDrive / Outlook Calendar — on-demand per phase-2-plan §3.2).
