# HubSpot 2.1 — Parity slice plan

**Status:** Plan / not yet implementing runtime code. **Doc-only commit.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md). Priority rank §3: **9**.
**Accepted audit:** [`docs/slices/parity/parity-hubspot.md`](parity-hubspot.md) — commit `9f3cf555a` (Marcus accepted).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/hubspot/`](../../../integrations/hubspot/) (Slice 13).
**Branch:** `v2-provider-port-local` (local-only, do not push).

HubSpot 2.1 closes the accepted PORT set from the audit: **4 actions** + **2 trigger event-types**. The slice is mechanical — every PORT item composes existing V2 patterns (Slice 13 wrappers, registries, signature verification, app-level shared subscriptions). **Zero new platform-tier work, zero new migrations, zero new repositories, zero scope changes.**

The accepted D-HS1 decision is **SKIP** for `add_to_workflow` + `remove_from_workflow`. This plan does NOT touch HubSpot's `automation/v2/workflows` endpoint or the newer Operations Hub flows endpoint; it does NOT add any wrapper file referencing them. Revisit only if a real customer/workflow asks.

---

## 1. Accepted audit summary

Per `parity-hubspot.md` accepted on commit `9f3cf555a`:

### V1 vs V2 baseline

| | V1 | V2 (Slice 13 baseline) |
|---|---|---|
| Action node types | 30 | 22 |
| Trigger node types | 17 (one per object/event pair) | 1 consolidated `webhook_received` with 10-entry allowlist |
| Trigger lifecycle | Per-workflow webhook subscription (creates one HubSpot subscription per workflow per event-type) | App-level shared subscriptions with portal-scoped reference counting via `hubspot_app_subscriptions` + `hubspot_subscription_refs` |
| Webhook signature | None (R7 master rot) | Real X-HubSpot-Signature-V3 HMAC-SHA256 + 5-min replay tolerance |
| Webhook normalize | `lib/webhooks/hubspotWebhookUtils.ts` (380 LOC of imperative "humanize" mapping) | Bounded `normalize.ts` — flattens load-bearing discriminator fields + carries raw event verbatim |
| Tests | 1 utility-shape test | ~16 suites covering every action + trigger pipeline + manifest + OAuth + shared-subscription repos |

### Accepted decisions on missing items

- **PORT — 6 items:** 4 actions + 2 trigger event-types (this slice).
- **DEFER — 6 items:** `get_forms`, `get_deal_pipelines`, 4 engagement triggers (port-when-needed).
- **SKIP under current transport — 1 item:** `form.submission` (distinct `/forms/v2/...` model).
- **SKIP per D-HS1 — 2 items:** `add_to_workflow`, `remove_from_workflow` (legacy `automation/v2` endpoint; revisit only if real customer demand).

### Provider-specific rot inventory

HS-R1 (17 trigger nodes → 1 consolidated), HS-R2 (inline humanize normalize), HS-R3 (per-workflow URLs), HS-R5 (legacy automation/v2 endpoint), HS-R6 (1 test file → ~16 suites) are CLOSED in V2 by Slice 13. HS-R4 (`createContactDynamic.ts` dead-code scaffold) NOT PORTED. HS-R7 (OAuth `refreshTokenExpirationSupported: false` field naming confusion) DOCUMENTED in V2 manifest.

---

## 2. The exact 4 actions to port

| # | V1 action key | V2 action type | HubSpot endpoint | Wrapper module |
|---|---|---|---|---|
| 1 | `hubspot_action_remove_line_item` | `remove_line_item` | `DELETE /crm/v3/objects/line_items/{id}` | [`integrations/_shared/hubspot/api/lineItems.ts`](../../../integrations/_shared/hubspot/api/lineItems.ts) — extend with `lineItemsDelete` |
| 2 | `hubspot_action_get_line_items` | `get_line_items` | `POST /crm/v3/objects/line_items/search` | Same — extend with `lineItemsSearch` |
| 3 | `hubspot_action_remove_from_list` | `remove_from_list` | `POST /crm/v3/lists/{listId}/memberships/remove` (v3 endpoint — symmetric with the v3 add path V2 already uses, NOT the V1 legacy `/contacts/v1/lists/{listId}/remove`) | [`integrations/_shared/hubspot/api/lists.ts`](../../../integrations/_shared/hubspot/api/lists.ts) — extend with `removeListMembershipByEmail` |
| 4 | `hubspot_action_get_products` | `get_products` | `POST /crm/v3/objects/products/search` | [`integrations/_shared/hubspot/api/products.ts`](../../../integrations/_shared/hubspot/api/products.ts) — extend with `productsSearch` |

### Notes on endpoint choices

- **`remove_from_list` uses the v3 endpoint, not V1's legacy v1.** V2's existing `add_contact_to_list` action already uses `POST /crm/v3/lists/{listId}/memberships/add` ([`lists.ts:53`](../../../integrations/_shared/hubspot/api/lists.ts#L53)). For symmetry + consistency + scope economy (no new `crm.contacts.lists` scope needed beyond what's already granted), `remove_from_list` mirrors the v3 add path. V1's legacy v1 endpoint stays NOT PORTED.
- **`get_*` actions use the `search` endpoint, not the bare list endpoint.** V2's existing `get_contacts` / `get_companies` / `get_deals` actions all use `POST /crm/v3/objects/<type>/search` because the search endpoint supports `filterGroups`, `properties` projection, `limit`, and `after` cursor in one call — superior to the bare list endpoint which only paginates. `get_line_items` + `get_products` mirror the existing pattern.

---

## 3. The exact 2 trigger event-types to port

| # | HubSpot subscription type | V1 trigger key (NOT ported as separate node) | Allowlist addition |
|---|---|---|---|
| 1 | `ticket.propertyChange` | `hubspot_trigger_ticket_updated` | Append to [`HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES`](../../../integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts) |
| 2 | `ticket.deletion` | `hubspot_trigger_ticket_deleted` | Append to same allowlist |

Both event-types reuse the existing `webhook_received` consolidated trigger node — workflow authors pick the new event-type at trigger config time alongside the 10 existing entries. **No new trigger node, no new normalize entry, no new dispatch path.** The activate hook already enforces `propertyName` validation for `*.propertyChange` events (`isPropertyChangeSubscriptionType` predicate in `allowedSubscriptionTypes.ts:65`); the same enforcement extends to `ticket.propertyChange` automatically.

`ticket.creation` was already in the allowlist (Slice 13). After this slice, the ticket object joins contact / company / deal as a fully-covered CRM object (creation + propertyChange + deletion).

---

## 4. Explicit skip / defer table

| Item | Decision | Reason | Revisit trigger |
|---|---|---|---|
| `get_forms` | DEFER | V1 surface is a builder-UI dropdown loader for the deferred `form.submission` trigger. Low runtime leverage. | Lands alongside `form.submission` if/when transport-tier slice ships. |
| `get_deal_pipelines` | DEFER | V1 surface is a builder-UI dropdown loader for `deal_stage` / `pipeline_id` enum resolution at config time. Low runtime leverage. | Lands when a builder UI pass needs server-side option loading. |
| `note.creation` (engagement trigger) | DEFER (PORT-WHEN-NEEDED) | Allowlist addition is mechanical, but engagement events carry meaningfully-different payload shape (no `propertyName` / `propertyValue`; `objectId` requires follow-up `/crm/v3/objects/notes/{id}` lookup). Generic V2 normalize would emit a thin payload. | Ship 4 engagement event-types together with a shared engagement-payload normalize extension when first real workflow asks. |
| `task.creation` | DEFER (PORT-WHEN-NEEDED) | Same as `note.creation`. | Same. |
| `call.creation` | DEFER (PORT-WHEN-NEEDED) | Same. | Same. |
| `meeting.creation` | DEFER (PORT-WHEN-NEEDED) | Same. | Same. |
| `form.submission` | SKIP under current transport | Distinct subscription model — `/forms/v2/...`, NOT `/webhooks/v3/{appId}/subscriptions`. Would require a separate activate / receive / normalize path. | File as its own platform-tier slice if a workflow needs it. |
| `add_to_workflow` | **SKIP (D-HS1 accepted)** | Depends on legacy HubSpot `automation/v2/workflows` endpoint; HubSpot's product direction is evolving toward Operations Hub flows; high-risk and not needed for the parity slice. | Revisit only if a real customer/workflow template requires HubSpot workflow enrollment. |
| `remove_from_workflow` | **SKIP (D-HS1 accepted)** | Same as `add_to_workflow`. | Same. |

**This slice does NOT touch:**
- `automation/v2/workflows` endpoint family.
- HubSpot's Operations Hub flows API.
- `/forms/v2/...` HubSpot Forms API.
- Engagement-specific normalize extensions.
- The current allowlist's deferred entries (engagements + forms).
- Any of the existing 22 actions or 10 allowlist entries (no regression).

---

## 5. API wrapper plan

All four wrapper extensions land in **existing** module files. No new wrapper files. Every wrapper uses the existing `hubspotRequest` helper at [`integrations/_shared/hubspot/api/_request.ts`](../../../integrations/_shared/hubspot/api/_request.ts) (which already routes through `refreshAndRetry` + canonical error mapping at master Rot R9 / Q3 contract).

### 5.1 `lineItemsDelete` — new export in `lineItems.ts`

```ts
export interface LineItemsDeleteInput {
  accessToken: string;
  lineItemId: string;
}

export async function lineItemsDelete(
  input: LineItemsDeleteInput,
): Promise<void> {
  await hubspotRequest<void>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: crmPath(`objects/line_items/${encodeURIComponent(input.lineItemId)}`),
    resourceForNotFound: `line item ${input.lineItemId}`,
  });
}
```

HubSpot's DELETE returns 204 No Content on success. `hubspotRequest` already handles void-typed responses. NotFound (404) surfaces as the canonical `NotFoundError` via `resourceForNotFound`. Auth (401) surfaces as `Unauthorized401Error` and triggers `refreshAndRetry`.

### 5.2 `lineItemsSearch` — new export in `lineItems.ts`

Mirrors `contactsSearch` shape ([`contacts.ts:144`](../../../integrations/_shared/hubspot/api/contacts.ts#L144)):

```ts
export interface LineItemsSearchFilter {
  propertyName: string;
  operator: "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE"
          | "BETWEEN" | "IN" | "NOT_IN"
          | "HAS_PROPERTY" | "NOT_HAS_PROPERTY" | "CONTAINS_TOKEN";
  value?: string;
  values?: readonly string[];
}

export interface LineItemsSearchInput {
  accessToken: string;
  limit?: number;          // wrapper clamps to ≤100
  after?: string;          // pagination cursor
  properties?: readonly string[];
  filters?: readonly LineItemsSearchFilter[];
}

export interface LineItemsSearchResponse {
  total: number;
  results: HubSpotLineItem[];
  paging?: { next?: { after?: string; link?: string } };
}

export async function lineItemsSearch(
  input: LineItemsSearchInput,
): Promise<LineItemsSearchResponse>
```

Endpoint: `POST /crm/v3/objects/line_items/search`. Body shape: `{ limit, after?, properties?, filterGroups? }` per HubSpot's CRM v3 search API (single filter group → AND; multiple groups → OR; Slice 13 wrappers only need single-group AND).

### 5.3 `removeListMembershipByEmail` — new export in `lists.ts`

Mirrors `addListMembershipByEmail` shape ([`lists.ts:47`](../../../integrations/_shared/hubspot/api/lists.ts#L47)):

```ts
export interface RemoveListMembershipByEmailInput {
  accessToken: string;
  listId: string;
  email: string;
}

export interface ListMembershipRemoveResponse {
  recordIdsRemoved?: string[];
  recordIdsDiscarded?: string[];  // HubSpot returns this if email not on the list
}

export async function removeListMembershipByEmail(
  input: RemoveListMembershipByEmailInput,
): Promise<ListMembershipRemoveResponse>
```

Endpoint: `POST /crm/v3/lists/{listId}/memberships/remove`. Body: `{ recordIdOrEmails: [email] }` — same encoding as add. Returns `recordIdsRemoved` on success; DYNAMIC list validation errors surface verbatim via `hubspotRequest` (same V2 stance as `add_contact_to_list`).

### 5.4 `productsSearch` — new export in `products.ts`

Mirrors `contactsSearch` and `lineItemsSearch` exactly. Endpoint: `POST /crm/v3/objects/products/search`.

```ts
export interface ProductsSearchInput { /* same shape as LineItemsSearchInput */ }
export interface ProductsSearchResponse {
  total: number;
  results: HubSpotProduct[];
  paging?: { next?: { after?: string; link?: string } };
}
export async function productsSearch(
  input: ProductsSearchInput,
): Promise<ProductsSearchResponse>
```

### Filter-shape standardization

`LineItemsSearchFilter` / `ProductsSearchFilter` are structurally identical to `ContactsSearchFilter`. The plan accepts this duplication rather than extract a shared filter type — three wrappers naming the same shape is below the V2 abstraction threshold ("3 similar lines is better than a premature abstraction" per CLAUDE.md §1 Core Principles). If a 4th call site appears the plan re-evaluates extraction.

---

## 6. Schema + handler plan

Every action ships as the standard `<name>.ts` + `<name>.schema.ts` pair under [`integrations/hubspot/actions/`](../../../integrations/hubspot/actions/) plus a registry entry in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts). Same shape as the 22 actions Slice 13 already shipped.

### 6.1 `remove_line_item`

**Schema (`removeLineItem.schema.ts`):**

```ts
export const RemoveLineItemInputConfigSchema = z
  .object({
    lineItemId: z.string().min(1, "lineItemId is required."),
  })
  .strict();
```

`.strict()` rejects V1 field-name chrome at parse time.

**Handler (`removeLineItem.ts`):**

```ts
{
  spec: { provider: "hubspot", type: "remove_line_item" },
  schemas: { inputConfig: RemoveLineItemInputConfigSchema, ... },
  async execute(ctx) {
    // Wrap principal write in refreshAndRetry (Q3 contract).
    await refreshAndRetry({
      userId: ctx.userId,
      provider: "hubspot",
      accountId: ctx.integration.providerAccountId,
      apiCall: (accessToken) => lineItemsDelete({ accessToken, lineItemId }),
    });
    return {
      success: true,
      output: {
        lineItemId: ctx.config.lineItemId,
        deleted: true,
      },
    };
  },
}
```

**Output shape:** bounded `{lineItemId, deleted: true}`. No raw response spread (DELETE returns 204 anyway — nothing to spread).

**Q4 idempotency:** Not threaded in Slice 13 baseline (matches existing 22-action pattern). Deferred at engine layer per CLAUDE.md handler-contracts Q4 stance. DELETE is naturally idempotent on the provider side — replaying a `DELETE` against an already-deleted line item returns 404, which the wrapper translates to `NotFoundError`.

### 6.2 `get_line_items`

**Schema (`getLineItems.schema.ts`):** mirrors `getContacts.schema.ts` — pagination (`limit` z.number().int().min(1).max(100).default(100), `after` z.string().optional()), `properties` array, single-group `filters` array with typed operator enum.

**Handler (`getLineItems.ts`):** mirrors `getContacts.ts`. Bounded output:

```ts
{
  success: true,
  output: {
    total: response.total,
    results: response.results.map((r) => ({
      id: r.id,
      properties: r.properties,
      createdAt: r.createdAt ?? null,
      updatedAt: r.updatedAt ?? null,
      archived: r.archived ?? false,
    })),
    after: response.paging?.next?.after ?? null,
  },
}
```

No raw `paging.next.link` (HubSpot's `link` field embeds the API base URL — leaking it through to workflow variables exposes the provider host needlessly).

### 6.3 `remove_from_list`

**Schema (`removeFromList.schema.ts`):**

```ts
export const RemoveFromListInputConfigSchema = z
  .object({
    listId: z.string().min(1, "listId is required."),
    email: z.string().email("email must be a valid email address."),
  })
  .strict();
```

V1 supported `contactId` OR `email` discrimination; V2 accepts `email` only — symmetric with `add_contact_to_list` shipped in Slice 13. Workflow authors who have a contact id resolve to email via `get_contacts` first. Keeps the action surface single-shape.

**Handler (`removeFromList.ts`):** mirrors `addContactToList.ts`. Bounded output:

```ts
{
  success: true,
  output: {
    listId,
    email,
    removedContactIds: response.recordIdsRemoved ?? [],
    discardedContactIds: response.recordIdsDiscarded ?? [],
  },
}
```

### 6.4 `get_products`

**Schema (`getProducts.schema.ts`):** mirrors `getLineItems.schema.ts` exactly (same pagination + filter shape).

**Handler (`getProducts.ts`):** mirrors `getLineItems.ts` exactly. Bounded output with the same `total` / `results[id, properties, createdAt, updatedAt, archived]` / `after` projection.

### 6.5 Registry entries

Append four entries to [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) in alphabetical order within the hubspot block (existing convention):

```ts
{ provider: "hubspot", type: "get_line_items", handler: hubspotGetLineItems },
{ provider: "hubspot", type: "get_products", handler: hubspotGetProducts },
{ provider: "hubspot", type: "remove_from_list", handler: hubspotRemoveFromList },
{ provider: "hubspot", type: "remove_line_item", handler: hubspotRemoveLineItem },
```

Plus four corresponding `import` lines at the file head. After this slice, V2 HubSpot action total: **22 + 4 = 26 actions** (V1 surface 30 minus the 4 deferred/skipped per the audit).

### 6.6 Manifest

No change. The `actions: true` capability flag already covers the new entries (honest-state rule per Slice 13 — flag tracks "any actions registered," not the exact count). No new scopes required: `crm.objects.line_items.read/write` + `crm.objects.products.read/write` + `crm.lists.read/write` are already declared in the manifest's required-scopes list.

---

## 7. Trigger allowlist + normalization plan

### 7.1 Allowlist addition

[`integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts`](../../../integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts) — append two entries to `HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES`:

```ts
export const HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES = [
  "contact.creation",
  "contact.propertyChange",
  "contact.deletion",
  "company.creation",
  "company.propertyChange",
  "company.deletion",
  "deal.creation",
  "deal.propertyChange",
  "deal.deletion",
  "ticket.creation",
  "ticket.propertyChange",      // NEW
  "ticket.deletion",            // NEW
] as const;
```

Update the file's doc-comment header — was "10 events selected from V1's 17," now "12 events selected from V1's 17."

### 7.2 `propertyName` enforcement

The existing `isPropertyChangeSubscriptionType` predicate ([`allowedSubscriptionTypes.ts:65`](../../../integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts#L65)) is suffix-based (`endsWith(".propertyChange")`), so `ticket.propertyChange` is matched automatically. Activate's existing validation:
- `propertyName` REQUIRED when `isPropertyChangeSubscriptionType(eventType)` is true.
- `propertyName` MUST be null/absent otherwise.

No activate code change needed — the new event-type is picked up by the existing predicate.

### 7.3 Normalize

[`integrations/hubspot/triggers/webhookReceived/normalize.ts`](../../../integrations/hubspot/triggers/webhookReceived/normalize.ts) is generic — it flattens load-bearing discriminator fields (`subscriptionType`, `portalId`, `hubId`, `objectId`, `propertyName`, `propertyValue`, `occurredAt`, `subscriptionId`, `appId`, `attemptNumber`, `changeSource`) and stores the raw event verbatim under `payload.event`. **No normalize change for the two new event-types.**

Workflow authors who want ticket-specific shape branch on `payload.subscriptionType === "ticket.propertyChange"` and read `payload.objectId` (the ticket id) + `payload.propertyName` / `payload.propertyValue`. Workflows that want enriched ticket data call `get_tickets` as a follow-up action — same pattern as contact / company / deal `propertyChange` events handle today.

### 7.4 Receive route

[`integrations/hubspot/triggers/webhookReceived/receive.ts`](../../../integrations/hubspot/triggers/webhookReceived/receive.ts) — no change. Routes by `(appId, eventType, propertyName?)` lookup against the `hubspot_app_subscriptions` table; the lookup naturally picks up the two new event-types once an active subscription exists for them.

### 7.5 No new HubSpot-side subscription registration code

Activate handles the new event-types via the existing `appSubsRepo.findOrCreate(appId, eventType, propertyName)` path. First workflow to subscribe to `ticket.propertyChange` for a given (appId, propertyName) triggers `POST /webhooks/v3/{appId}/subscriptions` against HubSpot; subsequent workflows share via `hubspotSubscriptionRefs.upsert`. Deactivate decrements refs and only DELETEs the HubSpot subscription when the last ref disappears. **All existing plumbing.**

---

## 8. Unit test plan

Each action ships with handler + schema + wrapper-companion test coverage. Trigger event-type additions ship with allowlist + activate + receive parity tests.

### 8.1 Wrapper-companion tests (new)

| Wrapper test file | Suites |
|---|---|
| [`tests/unit/integrations/hubspot/_shared/lineItemsDelete.test.ts`](../../../tests/unit/integrations/hubspot/) (NEW) | `lineItemsDelete` shape — `DELETE` URL + path encoding, 204 success, 404 NotFoundError, 401 Unauthorized401Error |
| [`tests/unit/integrations/hubspot/_shared/lineItemsSearch.test.ts`](../../../tests/unit/integrations/hubspot/) (NEW) | `lineItemsSearch` shape — body assembly (limit clamp, single-group filter wrapping, pagination cursor), 200 success, 401 / 400 / 404 |
| [`tests/unit/integrations/hubspot/_shared/listsRemove.test.ts`](../../../tests/unit/integrations/hubspot/) (NEW) | `removeListMembershipByEmail` — body shape, success, DYNAMIC-list 400 surfaced verbatim |
| [`tests/unit/integrations/hubspot/_shared/productsSearch.test.ts`](../../../tests/unit/integrations/hubspot/) (NEW) | `productsSearch` shape — same as `lineItemsSearch` |

Each suite ~6-10 tests. Total: ~30 wrapper-companion tests.

If existing wrapper test files (`tests/unit/integrations/hubspot/_shared/lineItems.test.ts`, `lists.test.ts`, `products.test.ts`) already exist, the new tests append into them rather than creating per-export files. The plan confirms file layout at implementation time.

### 8.2 Handler tests (new)

| Handler test file | Suites |
|---|---|
| `tests/unit/integrations/hubspot/actions/removeLineItem.test.ts` (NEW) | `remove_line_item` handler — happy path, missing lineItemId schema reject, 404 surfaces as failure with category `not_found`, 401 propagates through refreshAndRetry |
| `tests/unit/integrations/hubspot/actions/getLineItems.test.ts` (NEW) | `get_line_items` handler — happy path (results + paging), default limit, custom limit clamp, filter passthrough, bounded output shape (no `paging.next.link` leak) |
| `tests/unit/integrations/hubspot/actions/removeFromList.test.ts` (NEW) | `remove_from_list` handler — happy path, schema reject for missing listId / invalid email, DYNAMIC-list error surfaced |
| `tests/unit/integrations/hubspot/actions/getProducts.test.ts` (NEW) | `get_products` handler — happy path, pagination, bounded output |

Each suite ~10-15 tests. Total: ~50 handler tests.

### 8.3 Allowlist + activate + receive tests (extending existing)

| Test file | Additions |
|---|---|
| `tests/unit/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.test.ts` (existing) | Append: `ticket.propertyChange` + `ticket.deletion` are accepted by `isAllowedHubSpotSubscriptionType`; `isPropertyChangeSubscriptionType` returns true for `ticket.propertyChange` and false for `ticket.deletion`. |
| `tests/unit/integrations/hubspot/triggers/webhookReceived/activate.test.ts` (existing) | Append: activation accepts `{eventType: "ticket.propertyChange", propertyName: "subject"}`; rejects `{eventType: "ticket.propertyChange"}` with no propertyName; rejects `{eventType: "ticket.deletion", propertyName: "subject"}` (propertyName forbidden on non-propertyChange). |
| `tests/unit/integrations/hubspot/triggers/webhookReceived/receive.test.ts` (existing) | Append: signed payload with `subscriptionType: "ticket.propertyChange"` matches an active ref and dispatches; `ticket.deletion` same path; unsupported event-type still 200-acks. |
| `tests/unit/integrations/hubspot/triggers/webhookReceived/normalize.test.ts` (existing) | Append: normalize produces the canonical TriggerEvent shape for both new event-types (no normalize behavior change — just confirmation that the existing flattener handles them). |

Total trigger-side test additions: ~12 tests across 4 existing suites.

### 8.4 Manifest + registry tests

| Test file | Additions |
|---|---|
| `tests/unit/integrations/hubspot/manifest.test.ts` (existing) | No additions — manifest unchanged. Existing scope test already covers `crm.objects.line_items.read/write` + `crm.objects.products.read/write` + `crm.lists.read/write`. |
| `tests/unit/services/execution/handlers/registry.test.ts` (existing, if HubSpot has a registry test entry) | Append: 4 new (`provider: "hubspot"`, `type: "<each new action>"`) entries are registered. |

### 8.5 Total new unit tests

- 30 wrapper tests
- 50 handler tests
- 12 trigger event-type tests
- ~4 registry tests

**~96 net new unit tests.** Existing 16 HubSpot unit suites grow by ~4 new files plus ~12 tests appended to existing suites.

---

## 9. E2E plan

The existing [`tests/e2e/slice-13-hubspot-walkthrough.spec.ts`](../../../tests/e2e/slice-13-hubspot-walkthrough.spec.ts) (720 LOC) covers: signed `contact.creation` event → workflow run → `create_contact` action handler call. The chained action used is `create_contact` — none of the 22 existing actions have e2e coverage beyond `create_contact`. Per the audit §13 batch plan, **e2e extension stays small** — the new actions get unit-level coverage (per §8 above); the new trigger event-types get e2e coverage so the full activate → app-subscription → signed payload → receive → dispatch → workflow_run chain is exercised.

### 9.1 New e2e scenarios (2 tests in 1 new `test.describe` block)

Add `test.describe("HubSpot 2.1 — ticket trigger event-types e2e")` with two tests:

#### Test 1: `ticket.propertyChange` end-to-end

1. Reset mock. Sign in. Connect HubSpot.
2. Create workflow with `webhook_received` trigger configured for `{eventType: "ticket.propertyChange", propertyName: "hs_pipeline_stage"}` + `create_contact` action (existing chained-action pattern).
3. Activate → mock receives `POST /webhooks/v3/{appId}/subscriptions` for `ticket.propertyChange` + `propertyName: hs_pipeline_stage`.
4. Mock control plane (`__sendWebhookEvent`) signs + POSTs a HubSpot event with `subscriptionType: "ticket.propertyChange"`, `objectId: <random ticket id>`, `propertyName: "hs_pipeline_stage"`, `propertyValue: "<new stage>"`.
5. Assert: 1 workflow_run with `succeeded` status; `trigger_event.eventType === "webhook_received"`; `trigger_event.payload.subscriptionType === "ticket.propertyChange"`; `propertyName` + `propertyValue` flattened; 1 `create_contact` action call to the mock.

#### Test 2: `ticket.deletion` end-to-end

1. Reset mock. Sign in. Connect HubSpot.
2. Create workflow with `webhook_received` trigger configured for `{eventType: "ticket.deletion"}` (no propertyName, since deletion is non-propertyChange).
3. Activate → mock receives `POST /webhooks/v3/{appId}/subscriptions` for `ticket.deletion`.
4. Mock signs + POSTs `subscriptionType: "ticket.deletion"`, `objectId: <random ticket id>`.
5. Assert: 1 workflow_run with `succeeded` status; payload.subscriptionType === "ticket.deletion"; propertyName === null; 1 action call.

### 9.2 Mock additions

The mock HubSpot server at [`tests/e2e/helpers/mockHubSpotServer.ts`](../../../tests/e2e/helpers/mockHubSpotServer.ts) (1073 LOC) already covers:
- `POST /webhooks/v3/{appId}/subscriptions` (create subscription) — existing.
- `DELETE /webhooks/v3/{appId}/subscriptions/{id}` (delete subscription) — existing.
- `__sendWebhookEvent` (signs + POSTs to receive route) — existing; accepts `subscriptionType` parameter.

**Likely zero mock changes needed.** The existing `__sendWebhookEvent` is generic — the spec passes `subscriptionType: "ticket.propertyChange"` and the mock signs + POSTs whatever event shape is given. If `__sendWebhookEvent` hard-codes `subscriptionType: "contact.creation"`, the plan extends it to accept an override parameter (minor extension, ~10 LOC).

The new actions (`remove_line_item`, `get_line_items`, `remove_from_list`, `get_products`) are NOT chained from the e2e workflow — they get unit-test coverage only. The mock therefore does NOT need to add `/crm/v3/objects/line_items/{id}` DELETE, `/crm/v3/objects/line_items/search` POST, `/crm/v3/lists/{id}/memberships/remove` POST, or `/crm/v3/objects/products/search` POST endpoints. **Mock surface stays small.**

### 9.3 Per-run randomized values

Both e2e tests follow the Sheets 2.2 §2.16 + Sheets 2.3 §2.16 rule established across providers: every signed event uses a per-run randomized `eventId` (`${randomUUID()}`-derived integer) + `objectId` so `webhook_event_dedup` (system-wide, NOT cascaded by `deleteTestUser`) doesn't collide across consecutive e2e runs. The existing slice-13 walkthrough already uses this pattern.

### 9.4 Existing e2e regression

The existing slice-13 walkthrough test (`sign in → connect HubSpot → activate (creates app subscription + ref) → activate 2nd workflow (shares subscription, refcount=2) → signed event → succeeded run → invalid-sig 401 → unknown-subscription ack → replay deduped`) MUST stay green. Adding allowlist entries should not affect any existing test path — the new event-types are additive to the allowlist set, and no existing test asserts the exact allowlist length.

### 9.5 E2E sizing

Two new tests at ~120 LOC each = ~240 LOC added to the spec. Total spec size after extension: ~960 LOC. Below the file-size guidance threshold (500 LOC max for source files per CLAUDE.md §4; e2e specs are not strictly subject to that rule but the plan stays under 1,000 LOC for one provider).

### 9.6 E2E gate

`CI=1 npx playwright test tests/e2e/slice-13-hubspot-walkthrough.spec.ts --workers=1` — run twice for cross-run stability. Existing 1 test + 2 new tests = 3 tests passing.

---

## 10. Commit sequence

Three commits if D-HS1 stayed SKIP (it has). One outcomes commit at the end.

| # | Commit | What lands |
|---|---|---|
| 1 (this) | `docs(hubspot): plan 2.1 parity` | This plan doc only. Doc-only — runs unit gate suite. |
| 2 | `feat(hubspot): add line item + product + list read/remove actions` | 4 action handlers + 4 schemas + 4 wrapper-companion exports on `lineItems.ts` / `lists.ts` / `products.ts` + 4 registry entries. Per-action unit tests + wrapper-companion unit tests. ~96 new unit tests. **No manifest change, no scope change, no migration.** Action total: 22 → 26. |
| 3 | `feat(hubspot): expand webhook_received allowlist with ticket events` | 2 allowlist entries (`ticket.propertyChange` + `ticket.deletion`) + allowlist doc-comment update. ~12 new unit tests across existing trigger suites. E2e extension: `test.describe("HubSpot 2.1 — ticket trigger event-types e2e")` with 2 new tests. ~240 LOC e2e additions. Possibly ~10 LOC mock extension if `__sendWebhookEvent` needs an override parameter — plan confirms at implementation time. **No manifest change.** Allowlist total: 10 → 12. |
| 4 | `docs(hubspot): document 2.1 outcomes` | Outcomes retro mirroring the Sheets 2.3 / Airtable 2.1 / Stripe 2.1 template. CLAUDE.md "Phase 2 progress (HubSpot)" entry added; "HubSpot Phase 2 patterns" Deep Gotchas subsection added covering durable rules established by this slice (typed-search shape, bounded output projections, additive-allowlist pattern, no automation/v2 dependency). |

### Per-commit gates

Every commit (audit doc included) runs:

```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npx jest tests/unit/integrations/hubspot/ tests/unit/services/triggers/
npm test
```

E2E gate runs on Commit 3 (and the outcomes commit if it changes user-visible behavior, which it shouldn't):

```
CI=1 npx playwright test tests/e2e/slice-13-hubspot-walkthrough.spec.ts --workers=1
```

— twice for cross-run stability with randomized values.

### Path-staging discipline

Explicit path staging only — no `git add .`. Unrelated parallel-work files (`docs/rules/database-security.md`, `PACKAGES.md`, plus any Shopify WIP in `tests/e2e/helpers/mockShopifyServer.ts` + `tests/e2e/slice-12-shopify-walkthrough.spec.ts` if it reappears) stay untouched at every commit.

### Local-only

No push. No PR. Local commits on `v2-provider-port-local` only.

---

## 11. Acceptance gates (per implementation commit)

Per CLAUDE.md §3 + the Sheets 2.3 + Airtable 2.1 + Stripe 2.1 precedents:

- Schemas `.strict()` — V1 field-name chrome (`hasHeaders`, `is_inline === "true"` stringly-typed booleans, etc.) fail at parse time.
- Bounded output projections — no raw HubSpot response spread on any new action. `paging.next.link` (provider host leak) excluded from `get_*` outputs.
- Q3 OAuth retry — every principal HubSpot call wraps in `refreshAndRetry`. Existing `_request.ts` helper handles this for callers; the plan does NOT add per-handler `refreshAndRetry` calls outside the wrapper layer.
- No engagement-trigger payload chrome — generic normalize handles the new ticket event-types without case branching.
- No `automation/v2` references anywhere in source or tests.
- Backwards-compat — existing 22 actions + 10 allowlist entries unchanged in behavior + tests.
- Honest-state manifest — `actions: true` capability already covers the new handlers; no flag change.
- E2E walkthrough: 3 tests / 3 passing (1 existing + 2 new) under `--workers=1`. Per-run randomized values per the Sheets 2.2 §2.16 rule.
- Full jest suite green. tsc clean. lint clean. lint:structure + lint:migrations clean.

---

## 12. Risk estimate

| Risk | Severity | Mitigation |
|---|---|---|
| **R-HS-1** — HubSpot search-API rate-limit interactions for `get_line_items` + `get_products` | Low at default limit (100) | Wrapper clamps `limit` to ≤100 (matches `contactsSearch`). Per-pagination retries handled by existing `refreshAndRetry`. |
| **R-HS-2** — Mock `__sendWebhookEvent` doesn't accept subscriptionType override | Low | Plan extends the helper to accept `subscriptionType` parameter at implementation time (~10 LOC). Backwards-compat by defaulting to `contact.creation`. |
| **R-HS-3** — `webhook_event_dedup` cross-run collisions on e2e re-runs | Low | Per-run `randomUUID()`-derived `eventId` + `objectId` per the established slice-13 + Sheets pattern. |
| **R-HS-4** — Forgotten allowlist test causes `unknown_subscription` warn log on receive | Low | Receive test in §8.3 covers both new event-types explicitly. Mock event also asserts the dispatcher returns `dispatched: 1`, not `0`. |

No risk warrants splitting the slice or adding a feature flag.

---

## 13. Exit checklist (post Commit 4 outcomes)

- [ ] 4 new actions registered in `services/execution/handlers/_registry.ts` (`remove_line_item`, `get_line_items`, `remove_from_list`, `get_products`).
- [ ] 4 new wrapper exports in 3 existing wrapper files (`lineItems.ts` ×2, `lists.ts` ×1, `products.ts` ×1).
- [ ] 2 new allowlist entries (`ticket.propertyChange`, `ticket.deletion`).
- [ ] Every action handler ships with `.strict()` schema + bounded output + `refreshAndRetry`-wrapped principal call (via `hubspotRequest`).
- [ ] No `automation/v2` references anywhere.
- [ ] No new migrations.
- [ ] No new repositories.
- [ ] No manifest scope change.
- [ ] No regression in the existing 22 actions or 10 allowlist entries.
- [ ] Unit-test totals: +~96 new tests across ~8 new + ~5 extended suites.
- [ ] E2E walkthrough: 3 tests / 3 passing (1 existing + 2 new).
- [ ] Outcomes doc + CLAUDE.md update landed.
- [ ] V2 HubSpot action total: **26**. Allowlist size: **12**.

**Implementation does NOT begin before Marcus accepts this plan.**

---

## 14. What's next after HubSpot 2.1

Per parity-hubspot.md §16 and phase-2-plan.md §3:

- **HubSpot 2.2** — on-demand. Targets:
  - Engagement triggers (`note.creation` + `task.creation` + `call.creation` + `meeting.creation`) + shared engagement-payload normalize extension. Ships as one slice when a real workflow asks.
  - `form.submission` trigger via the distinct `/forms/v2/...` transport — separate platform-tier slice if a workflow needs it.
  - `get_forms` + `get_deal_pipelines` builder-UI loaders — likely land alongside Phase 3 builder UI work.
- **Mailchimp parity audit** — rank #10 per phase-2-plan §3. Opens once HubSpot 2.1 closes (and no higher-priority audit slot opens first).

The HubSpot parity arc closes once the HubSpot 2.1 outcomes commit lands (or Marcus accepts the on-demand deferrals as permanent).
