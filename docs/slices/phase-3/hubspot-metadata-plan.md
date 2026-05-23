# HubSpot Metadata + Resolver Plan — Slice 3.HUBSPOT-1

**Status:** Planning slice. Doc-only. **No metadata, no resolvers, no runtime changes ship in this commit.**
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Predecessor:** [`./google-sheets-metadata-outcomes.md`](./google-sheets-metadata-outcomes.md). The Google Sheets arc proved the resolver-first + dependsOn-cascade pattern this plan reuses.
**Companion plans:** [`./options-source-plan.md`](./options-source-plan.md), [`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md).

Every count, schema shape, and field claim below was verified by reading live files (`services/execution/handlers/_registry.ts`, `services/discovery/_registry.ts`, `services/options/_registry.ts`, `integrations/hubspot/**`, `integrations/_shared/hubspot/**`) — not from memory.

---

## 1. Current HubSpot inventory

- **Action handlers registered:** **26** in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) lines 469–495. Matches the post-GSHEETS coverage checkpoint.
- **Trigger handlers registered:** **1** — `hubspot:webhook_received` (consolidated webhook trigger covering 12 CRM subscription types — see §3).
- **Action metas registered:** **0**. No `*.meta.ts` files exist under `integrations/hubspot/actions/`.
- **Trigger metas registered:** **0**.
- **OptionsSource resolvers registered for HubSpot:** **0**. `integrations/hubspot/options/` directory does NOT exist.
- **Provider state in [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts):** UNCOVERED. Adding to `COVERED_PROVIDERS` is the final step of this arc.
- **Provider in [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts):** does NOT appear (no imports, no array entries).

This is the largest fully-uncovered provider in the codebase. HubSpot has more action handlers than any covered provider except Slack (31). Coverage gain on completion: 26 actions + 1 trigger meta → 108 → 134 actions covered, 21 → 22 trigger metas covered (50.2 % → 62.3 % of registered handlers).

### OAuth scopes already granted (relevant to resolver feasibility)

From [`integrations/hubspot/manifest.ts`](../../../integrations/hubspot/manifest.ts) — 18 scopes already granted at the manifest level, so resolvers can use them without forcing reconnects:

```
crm.objects.contacts.read / .write
crm.objects.companies.read / .write
crm.objects.deals.read / .write
crm.objects.line_items.read / .write
crm.objects.products.read / .write
crm.objects.owners.read
crm.lists.read / .write
crm.schemas.deals.read       ← pipelines / stages live here
tickets
automation
forms
oauth
```

**Critical:** every resolver this plan recommends is read-only and uses scopes already granted. **No manifest scope change is needed for HUBSPOT-2/3/4/5/6.** This is a significant difference from Google Sheets (which had to add `drive.metadata.readonly`); HubSpot users will NOT need to reconnect.

### Existing shared API surface

[`integrations/_shared/hubspot/api/`](../../../integrations/_shared/hubspot/api/) already provides typed wrappers for every CRUD path the resolvers will need:

```
contacts.ts companies.ts deals.ts tickets.ts lineItems.ts products.ts
owners.ts lists.ts engagements.ts associations.ts
me.ts webhookSubscriptions.ts
_base.ts _request.ts (shared 401 + error sanitization)
```

A `pipelines.ts` wrapper for the CRM Pipelines API (`/crm/v3/pipelines/{objectType}`) does NOT yet exist; the deal-stage resolver will need it (see §4).

---

## 2. Full action inventory

26 actions grouped by surface. Every action has a `*.schema.ts` + `*.ts` handler — no missing files. All schemas use `.strict()` (no V1 chrome leaks in).

### 2.1 Contacts (3)

| Key | Handler | Required fields | Optional fields | Output shape |
| --- | --- | --- | --- | --- |
| `hubspot:create_contact` | `createContact.ts` | `email` (z.email) | `firstname`, `lastname`, `phone`, `company`, `jobtitle`, `website`, `lifecyclestage`, `hs_lead_status`, `address`, `city`, `state`, `zip`, `country`, `duplicateHandling` (`enum["fail","update","skip"]`, default `"fail"`) | `{contactId, email, firstName, lastName, createdAt, updatedAt, wasUpdate, wasSkip, properties}` |
| `hubspot:update_contact` | `updateContact.ts` | `contactId` | Same 14 properties as create (all optional) | `{contactId, email, firstName, lastName, updatedAt, properties}` |
| `hubspot:get_contacts` | `getContacts.ts` | (none) | `limit` (≤100), `after` (pagination cursor), `properties` (`string \| string[]`), `filterProperty`, `filterValue` | `{contacts, count, total, nextCursor, hasMore}` |

- **Risk recommendation:** create/update = medium with riskDescription; get_contacts = low.
- **Sensitive outputs:** `email`, `firstName`, `lastName`, `properties` (whole map can include PII), `contacts` array.
- **Resolver needs:** `update_contact.contactId` benefits from `hubspot:contacts` search-by-email picker BUT this is deferred per resolver bias (§4). `lifecyclestage` and `hs_lead_status` are HubSpot-portal-configured enums; picker would need `hubspot:contact-lifecycle-stages`. **Acceptable for V1: plain text** — both fields are V1 user-friendly already.

### 2.2 Companies (3)

| Key | Handler | Required fields | Optional fields | Output |
| --- | --- | --- | --- | --- |
| `hubspot:create_company` | `createCompany.ts` | `name` | `domain`, `phone`, `website`, `address`, `city`, `state`, `zip`, `country`, `industry`, `description`, `annualrevenue`, `numberofemployees`, `lifecyclestage`, `duplicateHandling` (enum, default `"fail"`) | `{companyId, name, domain, createdAt, updatedAt, wasUpdate, wasSkip, properties}` |
| `hubspot:update_company` | `updateCompany.ts` | `companyId` | Same 14 properties (all optional) | `{companyId, name, domain, updatedAt, properties}` |
| `hubspot:get_companies` | `getCompanies.ts` | (none) | Same shape as get_contacts | `{companies, count, total, nextCursor, hasMore}` |

- **Risk:** create/update = medium; get_companies = low.
- **Sensitive outputs:** `properties`, `companies` array, `domain` (could be customer-identifying).
- **Resolver needs:** `update_company.companyId` benefits from a future `hubspot:companies` search picker — deferred.

### 2.3 Deals (3)

| Key | Handler | Required fields | Optional fields | Output |
| --- | --- | --- | --- | --- |
| `hubspot:create_deal` | `createDeal.ts` | `dealname`, `dealstage` | `pipeline`, `amount`, `closedate`, `dealtype`, `description`, `hubspot_owner_id` | `{dealId, dealname, dealstage, pipeline, amount, closedate, createdAt, updatedAt, properties}` |
| `hubspot:update_deal` | `updateDeal.ts` | `dealId` | Same fields (all optional) | `{dealId, dealname, dealstage, pipeline, amount, closedate, updatedAt, properties}` |
| `hubspot:get_deals` | `getDeals.ts` | (none) | Same shape as get_contacts | `{deals, count, total, nextCursor, hasMore}` |

- **Risk:** create/update = medium with riskDescription (money-shape fields visible — `amount`, `closedate`, `dealstage`); get_deals = low.
- **Sensitive outputs:** `properties`, `deals` array, `amount` (deal value is sensitive business data).
- **Resolver needs (high-value):**
  - `pipeline` → `hubspot:deal-pipelines` resolver. **Required for usable UX** — pipelines are portal-configured (typically 1-3 entries); text input forces UUID lookups.
  - `dealstage` → `hubspot:deal-stages` resolver with `dependsOn: pipeline`. **Required.** Stages are scoped to a pipeline; cascade is mandatory or the picker shows stages from every pipeline.
  - `hubspot_owner_id` → `hubspot:owners` resolver. **Required.** Owner ids are opaque numerics; pickers should show owner email/name.

### 2.4 Tickets (3)

| Key | Handler | Required fields | Optional fields | Output |
| --- | --- | --- | --- | --- |
| `hubspot:create_ticket` | `createTicket.ts` | `subject`, `hs_pipeline`, `hs_pipeline_stage` | `content`, `hs_ticket_priority` (`enum["LOW","MEDIUM","HIGH"]`), `hs_ticket_category`, `source_type`, `hubspot_owner_id`, `associatedContactId`, `associatedCompanyId`, `associatedDealId` | `{ticketId, subject, pipeline, pipelineStage, createdAt, updatedAt, properties, associationsAttached, associationWarnings}` |
| `hubspot:update_ticket` | `updateTicket.ts` | `ticketId` | Same fields (all optional) | `{ticketId, subject, pipeline, pipelineStage, updatedAt, properties}` |
| `hubspot:get_tickets` | `getTickets.ts` | (none) | Same shape as get_contacts | `{tickets, count, total, nextCursor, hasMore}` |

- **Risk:** create/update = medium; get_tickets = low.
- **Sensitive outputs:** `properties`, `tickets`, `content` (support content can be PII-heavy).
- **Resolver needs (high-value):**
  - `hs_pipeline` → `hubspot:ticket-pipelines`. **Required.**
  - `hs_pipeline_stage` → `hubspot:ticket-stages` with `dependsOn: hs_pipeline`. **Required.**
  - `hs_ticket_priority` → 3 static enum values; render via inline `options[]`, no resolver.
  - `hubspot_owner_id` → reuse `hubspot:owners`.

### 2.5 Lists (2)

| Key | Handler | Required fields | Optional fields | Output |
| --- | --- | --- | --- | --- |
| `hubspot:add_contact_to_list` | `addContactToList.ts` | `listId`, `email` (z.email) | — | `{listId, email, contactIdsAdded, contactIdsDiscarded}` |
| `hubspot:remove_from_list` | `removeFromList.ts` | `listId`, `email` (z.email) | — | `{listId, email, contactIdsRemoved, contactIdsDiscarded}` |

- **Risk:** Both are medium (list membership changes are reversible but visible). riskDescription required.
- **Sensitive outputs:** `email`, `contactIdsAdded/Removed/Discarded`.
- **Resolver needs:** `listId` → `hubspot:lists` resolver. **High-value.** Lists are portal-configured and named ("VIP Customers", "Lapsed Trials"); text input forces id lookups.

### 2.6 Engagements (4)

| Key | Handler | Required fields | Optional fields | Output |
| --- | --- | --- | --- | --- |
| `hubspot:create_note` | `createNote.ts` | `hs_note_body` | `hs_timestamp`, `hubspot_owner_id`, `associatedContactId`, `associatedCompanyId`, `associatedDealId`, `associatedTicketId` | `{noteId, body, timestamp, createdAt, properties, associationsAttached, associationWarnings}` |
| `hubspot:create_task` | `createTask.ts` | `hs_task_subject` | `hs_task_body`, `hs_task_status` (enum default `"NOT_STARTED"`), `hs_task_priority` (enum default `"MEDIUM"`), `hs_task_type` (enum default `"TODO"`), `hs_timestamp`, `hs_task_reminders`, `hubspot_owner_id`, 4× association ids | `{taskId, subject, status, priority, type, createdAt, properties, associationsAttached, associationWarnings}` |
| `hubspot:create_call` | `createCall.ts` | (none required) | `hs_call_title`, `hs_call_body`, `hs_call_duration`, `hs_call_direction` (`enum["INBOUND","OUTBOUND"]`), `hs_call_disposition`, `hs_call_status` (enum default `"COMPLETED"`), `hs_timestamp`, `hubspot_owner_id`, 4× association ids | `{callId, title, status, duration, direction, createdAt, properties, associationsAttached, associationWarnings}` |
| `hubspot:create_meeting` | `createMeeting.ts` | `hs_meeting_title` | `hs_meeting_body`, `hs_meeting_start_time`, `hs_meeting_end_time`, `hs_meeting_location`, `hs_meeting_outcome` (enum default `"SCHEDULED"`), `hs_timestamp`, `hubspot_owner_id`, 4× association ids | `{meetingId, title, outcome, startTime, endTime, location, createdAt, properties, associationsAttached, associationWarnings}` |

- **Risk:** All medium. Engagements are visible to CRM users immediately; recall requires deletion in HubSpot UI.
- **Sensitive outputs:** `body` (note + task body can contain customer PII), `properties`, `title` for meetings (may name attendees).
- **Resolver needs:** `hubspot_owner_id` → reuse `hubspot:owners`. Association id fields (`associatedContactId/CompanyId/DealId/TicketId`) — deferred to plain text (each would need its own search picker; high effort for moderate UX gain).
- **Q11 caveat:** `hs_call_status`, `hs_meeting_outcome`, `hs_task_status / hs_task_priority / hs_task_type` carry runtime `.default()` values. These are V2's documented exception to the strict Q11 "no defaults" rule (handler-schema-level safe defaults, not UI-meta-level), and they match V1 user expectations. The meta should mirror via `defaultValue` so the form pre-fills explicitly — same pattern as Google Sheets `read_rows.majorDimension`.

### 2.7 Line items (4)

| Key | Handler | Required fields | Optional fields | Output |
| --- | --- | --- | --- | --- |
| `hubspot:create_line_item` | `line_items/createLineItem.ts` | `dealId`, `quantity` | `hs_product_id`, `name`, `price`, `discount` | `{lineItemId, dealId, productId, name, quantity, price, discount, amount, createdAt, properties, associationsAttached, associationWarnings}` |
| `hubspot:update_line_item` | `line_items/updateLineItem.ts` | `lineItemId` | `name`, `quantity`, `price`, `discount` | `{lineItemId, name, quantity, price, discount, amount, updatedAt, properties}` |
| `hubspot:remove_line_item` | `line_items/removeLineItem.ts` | `lineItemId` | — | `{lineItemId, deleted}` |
| `hubspot:get_line_items` | `line_items/getLineItems.ts` | (none) | Same shape as get_contacts | `{lineItems, count, total, nextCursor, hasMore}` |

- **Risk:** create/update = medium; **`remove_line_item` = high + isDestructive + requiresConfirmation** (line item deletion modifies a deal's billable structure). get_line_items = low.
- **Sensitive outputs:** `properties`, `lineItems` (billable detail is sensitive business data).
- **Resolver needs:** `dealId` deferred to text (would require a deal search picker — high effort). `hs_product_id` → `hubspot:products` resolver is feasible and useful, but **defer to a follow-up** because the v1 UX has been text-input for years; a polish slice can add it without churning user-saved configs.

### 2.8 Products (3)

| Key | Handler | Required fields | Optional fields | Output |
| --- | --- | --- | --- | --- |
| `hubspot:create_product` | `createProduct.ts` | `name` | `description`, `price`, `hs_sku`, `hs_cost_of_goods_sold`, `hs_recurring_billing_period` | `{productId, name, price, sku, createdAt, updatedAt, properties}` |
| `hubspot:update_product` | `updateProduct.ts` | `productId` | Same fields (all optional) | `{productId, name, price, sku, updatedAt, properties}` |
| `hubspot:get_products` | `getProducts.ts` | (none) | Same shape as get_contacts | `{products, count, total, nextCursor, hasMore}` |

- **Risk:** create/update = medium; get_products = low.
- **Sensitive outputs:** `properties`, `products`, `price`, `hs_cost_of_goods_sold` (business margin data — distinctly sensitive).

### 2.9 Owners (1, read-only)

| Key | Handler | Required fields | Optional fields | Output |
| --- | --- | --- | --- | --- |
| `hubspot:get_owners` | `getOwners.ts` | (none) | `limit` (≤100), `email` (z.email), `after` | `{owners, count, nextCursor, hasMore}` |

- **Risk:** low.
- **Sensitive outputs:** `owners` — each owner carries email + name + id.
- **Resolver needs:** This action's underlying CRM owners API is also the data source for the `hubspot:owners` resolver. No field needs picker support here; the read is the resolver's source.

### 2.10 Summary table

| Group | Actions | High-value resolvers consumed |
| --- | --- | --- |
| Contacts | 3 | (none required for V1) |
| Companies | 3 | (none required for V1) |
| Deals | 3 | `hubspot:deal-pipelines`, `hubspot:deal-stages` (dependsOn pipeline), `hubspot:owners` |
| Tickets | 3 | `hubspot:ticket-pipelines`, `hubspot:ticket-stages` (dependsOn hs_pipeline), `hubspot:owners` |
| Lists | 2 | `hubspot:lists` |
| Engagements | 4 | `hubspot:owners` |
| Line items | 4 | (none required for V1; `hubspot:products` is a follow-up) |
| Products | 3 | (none required for V1) |
| Owners | 1 | (no field needs picker; this read is the source for `hubspot:owners`) |
| **Total** | **26** | **5 distinct resolvers required for V1** |

---

## 3. Trigger inventory

**One registered trigger handler:** `hubspot:webhook_received` ([`integrations/hubspot/triggers/webhookReceived/`](../../../integrations/hubspot/triggers/webhookReceived/)).

### 3.1 Trigger shape

- **Lifecycle file:** `index.ts` registers activation + deactivation hooks; NO subscription renewal handler (HubSpot subscriptions don't expire — see `activate.ts` JSDoc).
- **Config schema:** **No `*.schema.ts` file exists.** Config is validated inline in `activate.ts:parseSubscriptions()` — `subscriptions: Array<{eventType: string, propertyName?: string | null}>` (REQUIRED, non-empty). `eventType` MUST be in the 12-entry allowlist; `propertyName` is required for `*.propertyChange` types and forbidden otherwise.
- **Allowed event types** (from [`allowedSubscriptionTypes.ts`](../../../integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts)):
  - `contact.creation`, `contact.propertyChange`, `contact.deletion`
  - `company.creation`, `company.propertyChange`, `company.deletion`
  - `deal.creation`, `deal.propertyChange`, `deal.deletion`
  - `ticket.creation`, `ticket.propertyChange`, `ticket.deletion`
- **Activation model:** `webhook`. Registers via `registerActivation("hubspot", "webhook_received", activate)` + `registerDeactivation(...)`. **No subscription handler** (HubSpot subscriptions are permanent endpoints — same pattern as Stripe, Shopify per the activate.ts comment block).
- **Trigger-meta-activation-invariant test:** WILL be satisfied by the existing activation hook. No `SHARED_INFRA_EXEMPT_KEYS` entry needed.
- **Payload shape:** From `normalize.ts` — `{subscriptionType, portalId, hubId, objectId, propertyName, propertyValue, occurredAt, subscriptionId, appId, attemptNumber, changeSource, event}`. The raw HubSpot event is mirrored at `payload.event`.

### 3.2 Config strategy decision

The trigger config is a **complex JSON list with two interrelated fields per item** (`eventType` allowlisted enum + conditional `propertyName`). This is structurally similar to the `native:router.routes` field — but the existing FieldType set covers it without inventing anything new:

**Recommended approach: `subscriptions` textarea paste-JSON.** Same precedent as Notion `properties`/`filter`/`sorts`, Stripe `lineItems`, Google Sheets `batch_update.updates`. The runtime validation in `activate.ts:parseSubscriptions()` is authoritative; the meta surface stays narrow.

**Why not split into per-subscription fields?** The config is an array of variable length; the existing FieldType set has no array-of-objects renderer beyond `string-array` (flat strings only) and `router-routes` (special-cased). Building one for HubSpot would expand the FieldType set — explicitly out of scope per the slice rule "do not add new FieldTypes."

**Description must show the 12 allowed `eventType` values + the `propertyName` rule** so authors don't have to read the schema source.

### 3.3 Should triggers ship in the same arc?

**Yes — include in HUBSPOT-6.** Single trigger; the meta is small; the cost of skipping is keeping HubSpot out of `COVERED_PROVIDERS` indefinitely (the structural test gates on action coverage today, but trigger orphan-checking is good hygiene). Notion shipped 0 triggers; Stripe shipped 0 triggers (`stripe:event_received` deferred). HubSpot has exactly one, and it's a single-meta lift.

---

## 4. Resolver / optionsSource strategy

### 4.1 Recommended resolvers — required for V1 (5)

All five are read-only against APIs the existing manifest scopes already permit. No reconnect required.

| Resolver source | Backed by | API path | `requiresIntegration` | `dependsOn` | Used by |
| --- | --- | --- | --- | --- | --- |
| `hubspot:owners` | new `integrations/hubspot/options/owners.ts` + existing [`integrations/_shared/hubspot/api/owners.ts`](../../../integrations/_shared/hubspot/api/owners.ts) | `GET /crm/v3/owners` | true | — | `create_deal`, `update_deal`, `create_ticket`, `update_ticket`, `create_task`, `create_call`, `create_meeting`, `create_note` (all `hubspot_owner_id` fields — 8 actions) |
| `hubspot:deal-pipelines` | new `integrations/hubspot/options/dealPipelines.ts` + new `_shared/hubspot/api/pipelines.ts` wrapper | `GET /crm/v3/pipelines/deals` | true | — | `create_deal`, `update_deal` |
| `hubspot:deal-stages` | new `integrations/hubspot/options/dealStages.ts` (reuses pipelines wrapper, flattens `pipeline.stages[]`) | `GET /crm/v3/pipelines/deals` (filter by id) | true | `pipeline` | `create_deal.dealstage`, `update_deal.dealstage` |
| `hubspot:ticket-pipelines` | new `integrations/hubspot/options/ticketPipelines.ts` | `GET /crm/v3/pipelines/tickets` | true | — | `create_ticket`, `update_ticket` |
| `hubspot:ticket-stages` | new `integrations/hubspot/options/ticketStages.ts` | `GET /crm/v3/pipelines/tickets` (filter by id) | true | `hs_pipeline` | `create_ticket.hs_pipeline_stage`, `update_ticket.hs_pipeline_stage` |

A sixth resolver — `hubspot:lists` — is also high-value but tagged **stretch** for HUBSPOT-2:

| Resolver source | Backed by | API path | Used by |
| --- | --- | --- | --- |
| `hubspot:lists` | new `integrations/hubspot/options/lists.ts` + existing `_shared/hubspot/api/lists.ts` | `GET /crm/v3/lists` | `add_contact_to_list.listId`, `remove_from_list.listId` |

The lists API is straightforward; the only reason to defer is scope-control on the first resolver slice. **Recommendation: include `hubspot:lists` in HUBSPOT-2** unless HUBSPOT-2 starts running long.

### 4.2 Resolvers deferred to follow-up slices

Each of these is feasible but adds substantial complexity (HubSpot search APIs, paginated multi-property responses, plus per-portal property-name resolution). Plain-text input is acceptable V1 UX — V1 used text for years.

| Source | Field(s) | Why deferred |
| --- | --- | --- |
| `hubspot:contacts` (search by email) | `update_contact.contactId`, association ids | Needs `/crm/v3/objects/contacts/search` with email filter; result shape includes property maps. |
| `hubspot:companies` | `update_company.companyId`, association ids | Same as contacts. |
| `hubspot:deals` | `update_deal.dealId`, association ids | Same. |
| `hubspot:tickets` | `update_ticket.ticketId`, association ids | Same. |
| `hubspot:products` | `create_line_item.hs_product_id`, `update_product.productId` | Straightforward but low-priority — products are usually a small catalog the author knows by id already. |
| `hubspot:contact-properties` etc. | `lifecyclestage`, `hs_lead_status`, `hs_ticket_category` | Per-portal property values; needs `/crm/v3/properties/{objectType}/{propertyName}`. Bigger surface; defer to a dedicated polish slice. |
| `hubspot:object-types` / `hubspot:association-types` | (Not currently surfaced) | HubSpot universal object surface is out of scope for any current handler. |

### 4.3 Slice 3.33 cascade is sufficient

The `dependsOn` cascade landed in Slice 3.33 + proven by Google Sheets in GSHEETS-2. HubSpot needs the SAME 2-hop pattern:

- `hubspot:deal-pipelines` → `hubspot:deal-stages` (deps: `pipeline`).
- `hubspot:ticket-pipelines` → `hubspot:ticket-stages` (deps: `hs_pipeline`).

**No new cascade primitives needed.** Each is structurally identical to `google-sheets:spreadsheets` → `google-sheets:sheets`. The existing [`tests/integration/features/workflow-builder/google-sheets-options-cascade.test.tsx`](../../../tests/integration/features/workflow-builder/google-sheets-options-cascade.test.tsx) pattern can be reused.

---

## 5. Field metadata strategy

### 5.1 Field-type map (use existing FieldTypes only)

| Schema shape | FieldType | Notes |
| --- | --- | --- |
| `z.string().min(1)` plain id (`contactId`, `companyId`, `dealId`, `ticketId`, `lineItemId`, `productId`, `listId`, association ids) | `text` | Unless a resolver lands for that id (only `listId` does in V1). |
| `pipeline` / `dealstage` / `hs_pipeline` / `hs_pipeline_stage` | `combobox` + resolver | Cascade via `dependsOn`. |
| `hubspot_owner_id` | `combobox` + `hubspot:owners` | 8 actions. |
| `z.string().email()` (`email`) | `text` | V1 wisdom: don't over-engineer. The email-field renderer is a future polish. |
| `name`, `firstname`, `lastname`, `subject`, `dealname`, `title`, `domain`, `phone`, `website`, `city`, `state`, `zip`, `country`, etc. | `text` | Simple strings. |
| `description`, `content`, `hs_note_body`, `hs_call_body`, `hs_meeting_body`, `hs_task_body` | `textarea` | Free-form text bodies. |
| `amount`, `price`, `discount`, `quantity`, `annualrevenue`, `numberofemployees`, `hs_cost_of_goods_sold` | `text` | **Schema-anchored decision: these are `z.string()` at the schema level** (HubSpot's CRM API stores numbers as strings). The meta MUST mirror — type `text` with a helper text noting "numeric string". Switching to `number` here would diverge from the schema and break runtime validation. Same lesson as Google Sheets' append_row uses `range`, not `sheetName`. |
| `closedate`, `hs_timestamp`, `hs_meeting_start_time`, `hs_meeting_end_time`, `hs_task_reminders` | `text` | All `z.string()`. ISO 8601 timestamps in helper text. No native datepicker FieldType in V2; introducing one is out of scope per "no new FieldTypes." |
| `hs_call_status`, `hs_meeting_outcome`, `hs_task_status`, `hs_task_priority`, `hs_task_type`, `hs_call_direction`, `hs_ticket_priority`, `duplicateHandling` | `select` with inline `options[]` | Schema `z.enum([...])` — static list. Mirror schema `.default()` via `defaultValue` (Q11 exception per CLAUDE.md — defaults are explicit + safe). |
| `properties: string \| string[]` on `get_*` actions | `string-array` | Schema is `z.union([z.array(z.string()), z.string()])` — UI surfaces as `string-array` chips; runtime accepts both forms. |
| `filterProperty` + `filterValue` (paired) | `text` + `text` | Plain HubSpot property-name and value pair. |
| Trigger `subscriptions` array | `textarea` paste-JSON | See §3.2. |
| Boolean-shaped fields | `boolean` | (None in the current HubSpot surface.) |

### 5.2 No new FieldType needed

Audit confirms: **every HubSpot field maps cleanly to one of the existing 12 `FieldType` variants.** The trigger `subscriptions` array goes via the paste-JSON textarea precedent (Notion `properties` / Stripe `lineItems`). No FieldType expansion is justified.

### 5.3 Numeric-string footgun guard

`amount`, `price`, `quantity` etc. are `z.string()` because HubSpot's API expects stringified numbers. The meta description MUST call this out explicitly to prevent authors from wiring an upstream `number` output without `String(...)` coercion. Reference example: see [`integrations/stripe/actions/createPaymentIntent.meta.ts`](../../../integrations/stripe/actions/createPaymentIntent.meta.ts) DOLLARS-vs-CENTS unit anchoring — same principle, different footgun.

---

## 6. Output metadata strategy

### 6.1 Sensitive-by-default for CRM data

Every output that carries customer-identifying or business-confidential data is marked `sensitive: true`. The structural [`tests/structure/sensitive-output-coverage.test.ts`](../../../tests/structure/sensitive-output-coverage.test.ts) catches some of these by name; **the rest will need to be marked proactively in the metas (the structural test only flags suspicious names that aren't sensitive — it doesn't enforce that domain-data fields like `contacts` / `deals` / `tickets` be marked).**

| Output name pattern | Action types | Recommendation |
| --- | --- | --- |
| `contacts[]`, `companies[]`, `deals[]`, `tickets[]`, `products[]`, `lineItems[]`, `owners[]` (read-tier arrays) | `get_*` actions | **sensitive: true** (whole array — each entry carries property maps with PII). |
| `properties` (full HubSpot property map echo) | create / update / get → all 19 mutation/read actions return this | **sensitive: true** (variable shape; can carry every property the workflow author wrote OR every property HubSpot returned). |
| `email`, `firstName`, `lastName`, `domain` | create / update contact/company outputs | **sensitive: true** (direct PII). |
| `body` (note + task body), `content` (ticket content), `title` (meeting title) | engagement actions | **sensitive: true** (user-typed support / meeting content). |
| `contactIdsAdded`, `contactIdsRemoved`, `contactIdsDiscarded` | list actions | **sensitive: true** (caller-supplied email maps to specific contact ids — the list membership association is sensitive). |
| `amount`, `price` | deal + line item + product outputs | **sensitive: true** (deal value, line-item revenue, product price are sensitive business data). |
| `createdAt`, `updatedAt`, `timestamp`, `startTime`, `endTime` | scalar timestamps | non-sensitive (event timing without content). |
| `count`, `total`, `nextCursor`, `hasMore`, `wasUpdate`, `wasSkip`, `deleted` | structural booleans / counters / cursors | non-sensitive. |
| `contactId`, `companyId`, `dealId`, `ticketId`, `noteId`, `taskId`, `callId`, `meetingId`, `productId`, `lineItemId`, `listId` | scalar id echoes | non-sensitive (opaque ids; no PII without combined property lookup). |
| `associationsAttached`, `associationWarnings` | engagement / ticket outputs | non-sensitive (structural diagnostic; lists which association ids did/did not bind). |

**`get_owners.owners`:** marked sensitive — each owner carries email + name. Pinned by a registry test.

### 6.2 Trigger payload

The webhook trigger payload includes `propertyValue` (the changed value — could be a contact's new email address, a deal's new amount, etc.) and the raw `event` object. **Mark both `propertyValue` and `event` sensitive**, plus add `objectId` only if HubSpot's docs describe scenarios where the id alone reveals customer identity (defensive call: leave `objectId` non-sensitive — it's an opaque numeric).

Structural fields (`subscriptionType`, `portalId`, `hubId`, `subscriptionId`, `appId`, `attemptNumber`, `occurredAt`, `changeSource`, `propertyName`) stay non-sensitive.

### 6.3 No secret-shaped outputs

Verified by reading every `return { output: ... }` block in `integrations/hubspot/actions/**`. No `token`, `accessToken`, `refreshToken`, `clientSecret`, `secret`, `apiKey`, or `webhookSecret` appears. The defense-in-depth structural test stays green automatically.

### 6.4 No FileRef surface

No HubSpot action produces or consumes a FileRef in any of the 26 handlers. `producesFileRef: false` + `consumesFileRef: false` on every meta.

---

## 7. Risk metadata strategy

### 7.1 Risk matrix

| Category | Actions | `riskLevel` | `isDestructive` | `requiresConfirmation` | Notes |
| --- | --- | --- | --- | --- | --- |
| Reads | `get_contacts`, `get_companies`, `get_deals`, `get_tickets`, `get_products`, `get_line_items`, `get_owners` | **low** | false | false | Sensitive outputs MUST be flagged (§6) — that's the redaction story. |
| Create / update CRM record | `create_contact`, `update_contact`, `create_company`, `update_company`, `create_deal`, `update_deal`, `create_ticket`, `update_ticket`, `create_product`, `update_product`, `create_line_item`, `update_line_item` | **medium** | false | false | All require `riskDescription`. |
| Engagement (note / task / call / meeting) | `create_note`, `create_task`, `create_call`, `create_meeting` | **medium** | false | false | All require `riskDescription`. Engagements are immediately visible to CRM users. |
| List membership change | `add_contact_to_list`, `remove_from_list` | **medium** | false | false | Reversible; `riskDescription` required. |
| **Destructive line-item delete** | `remove_line_item` | **high** | **true** | **true** | Modifies a deal's billable structure. Required confirmation modal. |

**Conservative read of the spec.** No HubSpot action is money-moving in the Stripe sense (no charges, no refunds). `update_deal` can change a deal's `dealstage` from "Closed Won" to "Closed Lost" — destructive in the business-process sense but technically reversible. Holding at `medium` for V1; a follow-up slice can escalate `update_deal.dealstage` writes to `requiresConfirmation: true` if user reports surface accidental stage changes.

### 7.2 Cross-cutting riskDescription pattern

For the 17 medium-risk actions, the `riskDescription` should follow a per-surface template — concrete examples to use as starting points:

- Contact/company writes: "Creates or updates a HubSpot CRM record visible to all portal users. Existing values are overwritten by the supplied properties."
- Deal writes: "Creates or updates a HubSpot deal. Changes to `dealstage` / `pipeline` / `amount` / `closedate` propagate to revenue reporting and trigger HubSpot automation workflows; reversible only by writing the prior values back."
- Ticket writes: "Creates or updates a HubSpot ticket visible in service workflows. Stage / priority changes may trigger HubSpot routing rules."
- Engagement writes: "Records a `<note|task|call|meeting>` against the associated CRM objects. Visible immediately to all portal users; recall requires deletion in the HubSpot UI."
- List writes: "Modifies static list membership. Affects subsequent HubSpot workflow enrollment + segmentation. Reversible by the inverse action."
- `remove_line_item`: "Destructive — removes a line item from a HubSpot deal. The deal's total + revenue reporting recompute immediately. Line-item content cannot be recovered from this action."

### 7.3 No accidental escalation

`get_*` actions MUST NOT carry `requiresConfirmation: true`. Pinned by a registry test (mirrors the Stripe / Google Sheets pattern).

---

## 8. Security constraints inherited from post-security work

Every meta MUST comply with the following gates already in force from prior slices:

- **`riskLevel` required on every meta** — defaults to `"low"` per `ActionMetaSchema`. Explicit assignment per §7.
- **Sensitive outputs required wherever CRM data leaves the handler** — see §6. Defense in depth: any future output named `token` / `accessToken` / `clientSecret` / `secret` / `apiKey` / `refreshToken` / `webhookSecret` is hard-banned by the structural test, sensitive flag or not.
- **`requiresConfirmation: true` triggers the destructive-confirmation modal** automatically via [`destructive-action-confirmation-modal.test.tsx`](../../../tests/integration/features/workflow-builder/destructive-action-confirmation-modal.test.tsx). HubSpot's `remove_line_item` will inherit this surface — no per-action confirmation test needed beyond the meta pin.
- **testMode interception blocks HubSpot actions in test runs** — every HubSpot action is `requiresIntegration: true`, so the v2 engine-level pre-call gate at [`services/execution/nodeExecutionService.ts`](../../../services/execution/nodeExecutionService.ts) refuses to dispatch external HubSpot writes when `context.testMode === true && actionMode !== EXECUTE_ALL`. No per-handler testMode guard needed.
- **Provider routes serialize risk + sensitive fields** — `GET /api/providers/hubspot/{actions,triggers}` will surface them by virtue of the standard response shape; pinned by a route-level test (mirrors the Google Sheets test pattern).
- **sensitive-output structural test must stay green** — likely will need a small allowlist addition (see §10).
- **High-risk lifecycle audit events** emit automatically for `requiresConfirmation: true` actions via the existing workflow audit pipeline. `remove_line_item` will produce audit rows on confirmation. No extra wiring required.

---

## 9. Implementation grouping

### Recommended 5-slice arc

Each slice ships one local commit on `v2-provider-port-local`. The `COVERED_PROVIDERS` flip is gated on full action + trigger coverage in HUBSPOT-6.

| Slice | Scope | Files added/changed | Coverage delta |
| --- | --- | --- | --- |
| **HUBSPOT-2 — Core resolvers** | 5 (or 6) resolvers: `hubspot:owners`, `hubspot:deal-pipelines`, `hubspot:deal-stages`, `hubspot:ticket-pipelines`, `hubspot:ticket-stages` (and stretch: `hubspot:lists`). New `_shared/hubspot/api/pipelines.ts` wrapper. Options registry updates. Unit + cascade tests. | ~12 new files + 1 registry edit. No metas yet. | 0 / 26 (resolvers only) |
| **HUBSPOT-3 — Contacts + companies + read tier** | 6 metas: `create_contact`, `update_contact`, `get_contacts`, `create_company`, `update_company`, `get_companies`. Registry + provider-route tests. 1 integration test (`create_contact` config). | 6 metas + 3 test edits. | 6 / 26 |
| **HUBSPOT-4 — Deals + tickets (resolver consumers)** | 8 metas: `create_deal`, `update_deal`, `get_deals`, `get_owners`, `create_ticket`, `update_ticket`, `get_tickets`. Plus `get_owners` (which doesn't need a resolver but logically pairs). Registry + provider-route + 1 cascade integration test (`create_deal` pipeline → stage). | 7 metas (deals 3 + tickets 3 + get_owners 1) + tests. | 13 / 26 |
| **HUBSPOT-5 — Engagements + lists + products + line items** | 11 metas: `create_note`, `create_task`, `create_call`, `create_meeting`, `add_contact_to_list`, `remove_from_list`, `create_product`, `update_product`, `get_products`, `create_line_item`, `update_line_item`, `get_line_items`. **Plus `remove_line_item`** (the only high-risk HubSpot action). 1 integration test for destructive flow. | 13 metas + tests. | 26 / 26 actions; trigger still missing. |
| **HUBSPOT-6 — Trigger meta + COVERED_PROVIDERS flip** | 1 trigger meta (`webhook_received` with paste-JSON subscriptions config). Trigger-meta-activation-invariant test inherits — no exemption needed. **Flip `hubspot` into `COVERED_PROVIDERS`.** Registry + provider-route trigger tests. 1 trigger config integration test. | 1 trigger meta + structural test edit + tests. | 26 / 26 + 1 / 1 trigger; `hubspot` in COVERED_PROVIDERS. |

### Sizing notes

- **HUBSPOT-3 is the smallest** of the metadata slices; intentional — the first metadata commit on a new provider always carries the most "is the pattern right?" rework. Keep it scoped to contact + company so any pattern adjustments propagate forward.
- **HUBSPOT-5 is the largest** at 13 metas. If it runs long, split into HUBSPOT-5a (engagements + lists, 6 metas) and HUBSPOT-5b (products + line items including destructive, 7 metas). The trigger then becomes HUBSPOT-6 (later).
- **Numbering convention.** Reusing `HUBSPOT-N` (like `GSHEETS-N`) keeps the doc trail linkable.

### COVERED_PROVIDERS flip discipline

Same protocol as GSHEETS-4: the structural test in [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) MUST be green BEFORE flipping. Order of operations in HUBSPOT-6:
1. Add the 1 trigger meta + register it.
2. Run `tests/structure/discovery-meta-coverage.test.ts` + `tests/structure/trigger-meta-activation-invariant.test.ts` + `tests/structure/sensitive-output-coverage.test.ts` — confirm green WITHOUT flipping (defense-in-depth — same flow as GSHEETS-4).
3. Add `"hubspot"` to `COVERED_PROVIDERS`. Re-run the structural test — confirm it still passes (now enforcing 1:1 handler↔meta from here on).
4. Add the per-action surface test block + the trigger surface block to [`tests/unit/services/discovery/_registry.test.ts`](../../../tests/unit/services/discovery/_registry.test.ts).

---

## 10. Integration tests plan

Match the per-provider integration-test density established by Google Sheets — one per UX shape, not one per action:

| Test file | Slice | Pins |
| --- | --- | --- |
| `hubspot-create-contact-config.test.tsx` | HUBSPOT-3 | First HubSpot config rail. Pin `email` required text + several optional text fields + `duplicateHandling` select default `"fail"`. Modal Save → Toolbar Save → `updateWorkflow` once. |
| `hubspot-create-deal-config.test.tsx` | HUBSPOT-4 | Pipeline → stage cascade end-to-end. Pin `hubspot:deal-pipelines` resolver fires; selecting a pipeline triggers `hubspot:deal-stages` re-fetch with `deps.pipeline`; switching pipeline clears stale `dealstage`. Owner combobox renders from `hubspot:owners`. |
| `hubspot-create-ticket-config.test.tsx` | HUBSPOT-4 (or HUBSPOT-5 if grouping shifts) | Mirrors deal cascade against `hubspot:ticket-pipelines` → `hubspot:ticket-stages`. Plus `hs_ticket_priority` static select. |
| `hubspot-remove-line-item-config.test.tsx` | HUBSPOT-5 | Pin `isDestructive + requiresConfirmation + riskLevel:high + riskDescription`. End-to-end config save. Inherits the destructive-confirmation modal from the existing test (no re-test of the modal flow). |
| `hubspot-webhook-received-trigger-config.test.tsx` | HUBSPOT-6 | Trigger picker → paste `subscriptions` JSON → assert payload sensitive flags + structural-field non-sensitive. Activation-managed config fields (`appId`, `hubId`, provisioned subscription rows) stay untouched on save. |

### Allowlist additions for the sensitive-output structural test

The `propertyName` field on the trigger payload is structural (column-like), so it stays non-sensitive — but the structural test's `SUSPICIOUS_NAMES` set includes nothing that the HubSpot surface would trip. The audit found ONE potential issue:

- `webhook_received.payloadShape` may include a `name` field if the trigger normalizer is later extended to surface contact / company names from related-objects fetches. **Not in scope today** — the current `normalize.ts` output has no name-shaped field. No allowlist entry needed.
- `email` is in `SUSPICIOUS_NAMES`. The `create_contact`, `update_contact`, and `add_contact_to_list` / `remove_from_list` outputs all include `email` AND will be marked `sensitive: true` per §6. The `add_contact_to_list` / `remove_from_list` echoes match the existing Gmail / Outlook pattern of caller-supplied recipient echoes — could go either way:
  - **Marking sensitive** is the conservative + simpler choice. **Recommended.**
  - The allowlist alternative (`"hubspot:add_contact_to_list::email": "Echo of caller-supplied email."`) keeps the workflow author's reference value visible on the run-detail. Skip in V1 — author already has the value as input.

---

## 11. Open decisions for Marcus

| Decision | Recommendation | Alternative |
| --- | --- | --- |
| **Resolver-first or metadata-first?** | Resolver-first (HUBSPOT-2 ships 5 resolvers before any meta). Google Sheets validated this pattern; 17 of the 19 mutation/read metas benefit from at least one resolver. | Metadata-first risks 12 actions shipping with text-input UX, then a follow-up slice having to retrofit `optionsSource` onto existing metas — same churn the resolver-first pattern was designed to avoid. |
| **Which resolvers must ship before metas?** | The 5 in §4.1. Including `hubspot:lists` makes it 6 (~12 % more files; recommended unless HUBSPOT-2 starts running long). | Defer `hubspot:lists` to a polish slice — `add_contact_to_list` / `remove_from_list` ship with text input first. |
| **Include the trigger in the same arc?** | Yes — HUBSPOT-6. Single meta; no exemption required; pairs naturally with the `COVERED_PROVIDERS` flip. | Skip the trigger meta and keep HubSpot in coverage-incomplete state (Stripe / Notion both shipped without their triggers; the precedent exists). **Reject** — HubSpot has only one trigger so the cost of skipping is high relative to the lift. |
| **How conservative on destructive / bulk?** | `remove_line_item` only. Hold `update_deal.dealstage` and other recoverable mutations at `medium`. | Escalate `update_deal` + `update_ticket` to `requiresConfirmation: true` immediately. **Reject for V1** — over-confirmation creates UX fatigue. Escalate later if user reports surface accidental writes. |
| **Tackle HubSpot now vs do notion:databases first as a breather?** | HubSpot now. The Google Sheets arc just finished; the resolver-first muscle memory is fresh; HubSpot is the biggest single coverage gain available. | If context-loading is excessive (especially the resolver wrappers + the cascade tests), `notion:databases` is a 1-slice polish breather. Coverage stays at 50.2 % during the breather. |
| **Property editor now or keyvalue / textarea for V1?** | Defer the property editor. None of the 26 actions takes a `properties` MAP as input — they take individual property fields (`firstname`, `lastname`, etc.) directly. The trigger's `subscriptions` field uses paste-JSON textarea per §3.2. No `keyvalue` consumers in the V1 HubSpot surface. | A general property editor would be useful for a future `hubspot:update_object` generic action; not needed for this arc. |
| **Numeric-string fields (`amount`, `price`, etc.) — `text` or `number`?** | `text` (matches schema). Mirror schema strictly — same lesson as GSHEETS `append_row.range`. Description calls out "numeric string". | `number` would create a runtime validation mismatch (schema expects string; UI sends number). **Reject.** |
| **`get_*` action `properties` field — `string-array` or `text`?** | `string-array`. Schema accepts `string \| string[]` union, and the UX win of chip-mode input is clear. Runtime validation accepts either form. | `text` (CSV / JSON pasted) is acceptable but worse UX. |

---

## 12. Proposed next slice

**Recommended next: HUBSPOT-2 — Core HubSpot OptionsSource Resolvers.**

Scope (per §4.1 + §9):
- New `integrations/hubspot/options/` directory.
- 5 resolvers (or 6 with `hubspot:lists` stretch): owners, deal-pipelines, deal-stages, ticket-pipelines, ticket-stages.
- New `integrations/_shared/hubspot/api/pipelines.ts` wrapper.
- Options registry updates: 5–6 new entries in `services/options/_registry.ts`.
- Unit tests for each resolver (mock the `_shared/hubspot/api/*` wrappers; pin error sanitization + 401 → `Unauthorized401Error`).
- 1 cascade integration test reusing the Google Sheets test scaffold (synthetic fields wired to `hubspot:deal-pipelines` → `hubspot:deal-stages`).
- **No metas yet.** HubSpot stays out of `COVERED_PROVIDERS`.

Rationale: same resolver-first sequencing that worked for Google Sheets. By landing the picker infrastructure ahead of any meta, every subsequent metadata slice (HUBSPOT-3..5) can declare `optionsSource` from day one — no rework, no churn.

**Pause point if scope feels heavy:** drop `hubspot:lists` from HUBSPOT-2 (defer to HUBSPOT-5 alongside the list actions); ship the 5 core resolvers + 1 cascade test only. Then HUBSPOT-3 can start immediately on the next pairing session.

**Alternative breather (per §11):** `notion:databases` resolver — a 1-slice polish on the Notion surface that ships 0 resolvers today. Lower coverage gain (Notion's already 16/16); higher polish gain (every Notion id field would gain picker UX). Take this if HUBSPOT-2 context-loading feels too large.

---
