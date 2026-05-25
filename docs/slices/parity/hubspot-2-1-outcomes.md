# HubSpot 2.1 — Parity outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md). Priority rank §3: **9**.
**Accepted audit:** [`docs/slices/parity/parity-hubspot.md`](parity-hubspot.md) — commit `9f3cf555a`.
**Plan:** [`docs/slices/parity/hubspot-2-1-parity-plan.md`](hubspot-2-1-parity-plan.md) — commit `a6eb6c74b`.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/hubspot/`](../../../integrations/hubspot/) (Slice 13 baseline + HubSpot 2.1).

HubSpot 2.1 closes the accepted PORT set from the audit: **4 net-new
actions** + **2 trigger event-types**. The slice landed in 3
implementation commits + this outcomes commit, exactly as the plan
scoped. **Zero new platform-tier work, zero new wrappers, zero new
migrations, zero new repositories, zero scope changes.**

The qualitative shift continues V2's HubSpot stance established in
Slice 13: V1's per-workflow webhook-subscription model (one HubSpot
subscription per workflow regardless of overlap) stays NOT PORTED;
V2's app-level shared subscriptions with portal-scoped reference
counting absorbs every new event-type via the same `findOrCreate` →
ref-upsert path. V1's inline 380-LOC "humanize" payload normalization
(`hubspotWebhookUtils.ts:buildHubSpotTriggerData`) stays NOT PORTED;
V2's bounded normalize (flattened discriminators + raw event verbatim)
handles every new event-type without case branching. V1's missing
X-HubSpot-Signature verification stays closed by V2's HMAC-SHA256-V3
verifier with 5-min replay tolerance.

The accepted D-HS1 decision is **SKIP** for `add_to_workflow` +
`remove_from_workflow`. This slice did NOT touch HubSpot's
`automation/v2/workflows` endpoint or the newer Operations Hub flows
endpoint. The registry test pins the SKIP explicitly so future
provider work cannot accidentally register either action without a
D-HS1 revisit.

---

## 1. Scope shipped

### Actions (4 net-new)

| Action | HubSpot endpoint | Wrapper module |
|---|---|---|
| `remove_line_item` | `DELETE /crm/v3/objects/line_items/{id}` | [`_shared/hubspot/api/lineItems.ts`](../../../integrations/_shared/hubspot/api/lineItems.ts) — `lineItemsDelete` |
| `get_line_items` | `POST /crm/v3/objects/line_items/search` | Same module — `lineItemsSearch` |
| `remove_from_list` | `POST /crm/v3/lists/{listId}/memberships/remove` (v3 endpoint, symmetric with `add_contact_to_list`) | [`_shared/hubspot/api/lists.ts`](../../../integrations/_shared/hubspot/api/lists.ts) — `removeListMembershipByEmail` |
| `get_products` | `POST /crm/v3/objects/products/search` | [`_shared/hubspot/api/products.ts`](../../../integrations/_shared/hubspot/api/products.ts) — `productsSearch` |

Registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts).
**V2 HubSpot action total after 2.1: 26** (22 Slice 13 + 4 HubSpot 2.1).

### Trigger event-types (2 added to allowlist)

| Event-type | Allowlist addition |
|---|---|
| `ticket.propertyChange` | Append to [`HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES`](../../../integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts) |
| `ticket.deletion` | Same |

After this slice ticket joins contact / company / deal as a
fully-covered CRM object (creation + propertyChange + deletion).
**V2 HubSpot allowlist after 2.1: 12** (10 Slice 13 + 2 HubSpot 2.1).
**V2 HubSpot trigger node total: 1** (consolidated `webhook_received`).

### API wrappers + helpers

**Zero new wrapper files.** 4 new exports landed inside 3 existing
shared-API modules. Every wrapper continues to honor the canonical
error mapping (401 → `Unauthorized401Error`, 404 → `NotFoundError`,
other non-2xx → tagged `Error`) via the shared [`hubspotRequest`](../../../integrations/_shared/hubspot/api/_request.ts).

### Manifest scope changes

**None.** Slice 13's existing 18 required scopes already cover the new
endpoints:
- `crm.objects.line_items.read` + `.write` (existing — covers `get_line_items` + `remove_line_item`).
- `crm.objects.products.read` (existing — covers `get_products`).
- `crm.lists.write` (existing — covers `remove_from_list`).
- `tickets` (existing — covers `ticket.propertyChange` + `ticket.deletion` subscriptions).

No OAuth flow change, no scope widening, no capability flag change.
Manifest `actions: true` already gates the new handlers.

### Structural change (per accepted user direction)

The `integrations/hubspot/actions/` leaf folder hit the 50-file cap
with the new action files (53). Per the accepted user choice, the
**line_items CRM domain moved into a subfolder**:
- `integrations/hubspot/actions/line_items/` — 8 files (createLineItem
  + updateLineItem + removeLineItem + getLineItems, each with sibling
  `.schema.ts`).
- Parent dir now 45 files.
- 4 import paths updated in `_registry.ts`; 4 import paths updated in
  test files. Internal relative imports in moved files adjusted
  (`../../_shared/...` → `../../../_shared/...`).

The subfolder pattern is now established for HubSpot — future
HubSpot 2.2 additions in adjacent domains (e.g. tickets, engagements)
can land flat OR in their own subfolders depending on file-count
pressure.

---

## 2. Durable decisions worth preserving

### 2.1 V3-endpoint preference for `remove_from_list` (NOT V1 legacy v1 endpoint)

V1's `remove_from_list` action targeted `/contacts/v1/lists/{listId}/remove`.
V2 uses the v3 path `/crm/v3/lists/{listId}/memberships/remove` —
symmetric with `add_contact_to_list` already shipped in Slice 13. No
new scope needed; `crm.lists.write` covers both add + remove. Workflow
authors with a contact id resolve to email via `get_contacts` first
(same single-shape constraint Slice 13 pinned).

### 2.2 Search-endpoint preference for `get_*` actions (NOT bare list)

V1's `getLineItems` / `getProducts` actions used bare GET list
endpoints. V2 uses the search endpoint
(`POST /crm/v3/objects/<type>/search`) because the search endpoint
supports `filterGroups`, `properties` projection, `limit`, and `after`
cursor in one call. Mirrors `get_contacts` / `get_companies` /
`get_deals` shipped in Slice 13 — single canonical "fetch a page of
objects" shape across all HubSpot CRM types.

### 2.3 Single-group AND filter only (no OR groups)

`LineItemsSearchInput.filters` and `ProductsSearchInput.filters` accept
ONE array of `{propertyName, operator, value/values}` entries which
the wrapper wraps as `filterGroups: [{ filters }]` — a single
filter-group AND-ing all entries. Multiple filter-groups (which would
OR them) are NOT exposed. Matches the `contactsSearch` shape pinned by
Slice 13. Workflow authors that need OR composition use multiple
`get_*` calls + downstream `filter` step composition. Forward-compat:
adding `filterGroups` as a typed escape hatch later is non-breaking.

### 2.4 `EQ`-only filter operator at the handler layer

Handler schemas expose `filterProperty` + `filterValue` as separate
fields and synthesize an `EQ` filter when both are present (mirrors
`get_contacts.ts:46-51`). The wrapper-layer `LineItemsSearchFilter` /
`ProductsSearchFilter` types support the full operator enum
(`EQ|NEQ|GT|GTE|LT|LTE|BETWEEN|IN|NOT_IN|HAS_PROPERTY|NOT_HAS_PROPERTY|CONTAINS_TOKEN`)
for future expansion — adding a typed `filterOperator` enum to the
handler schema is non-breaking when a workflow needs it. Same
forward-compat stance Slice 13 used for `get_contacts`.

### 2.5 Bounded output projection — `paging.next.link` NEVER leaked

HubSpot's `paging.next.link` field embeds the API host (`https://api.hubapi.com/...`).
Surfacing it in workflow variables leaks the provider host into
downstream nodes. V2's `get_*` output ships only `nextCursor` (the
`after` string) + `hasMore` (boolean) — workflows paginate by calling
`get_*` again with `after: nextCursor`, NOT by following the link.
The e2e test for `get_line_items` and `get_products` asserts
`JSON.stringify(output)` does NOT contain `hubapi.com` or `link`.

### 2.6 Bounded output projection — `remove_*` actions return `deleted: true` shape

`remove_line_item` returns `{lineItemId, deleted: true}`. `remove_from_list`
returns `{listId, email, contactIdsRemoved, contactIdsDiscarded}`. No
raw HubSpot response spread. The DELETE shape is naturally minimal
(HubSpot returns 204 No Content); the v3-lists shape mirrors
`add_contact_to_list`'s output for symmetry.

### 2.7 Idempotency — DELETE is naturally idempotent at the provider side

Replaying `DELETE /crm/v3/objects/line_items/{id}` against an
already-deleted line item returns 404 which the wrapper surfaces as
the canonical `NotFoundError`. Replaying `POST /crm/v3/lists/{id}/memberships/remove`
with an email that's not on the list returns 200 with
`recordIdsRemoved: []` + `recordIdsDiscarded: [...]` — workflow
authors can branch on `contactIdsRemoved.length === 0` to detect
already-removed contacts. Q4 session-side-effect bracketing is NOT
threaded at the handler layer — same V2-engine-level deferred stance
as Slice 13 and Sheets 2.1 + 2.2.

### 2.8 Strict-schema rejection of V1 chrome at parse time

Every new handler ships with `.strict()` Zod schema. Explicit
rejection at parse time:
- `remove_line_item`: rejects `deleteBy`, `confirmDelete`, `deletedData`, `deleteAll`.
- `get_line_items` / `get_products`: rejects `hasHeaders`, `skipEmptyRows`, `requiredColumns`.
- `remove_from_list`: rejects `contactId`, `removeFromAll`, `removeBy`.

Workflow authors that paste V1-shape config get an immediate Zod error
at builder time, not at runtime.

### 2.9 `ticket.propertyChange` + `ticket.deletion` reuse existing plumbing

No new normalize entry, no new dispatch path, no new mock change.
The existing `isPropertyChangeSubscriptionType` predicate (suffix
`.propertyChange`) catches `ticket.propertyChange` automatically.
Activate's `propertyName` validation (required on propertyChange,
forbidden otherwise) extends to the new event-types without
code changes. Receive route's `(appId, eventType, propertyName)`
lookup is generic by event-type — the new entries dispatch the same
way contact / company / deal events do.

### 2.10 Additive allowlist pattern — no schema migration

Adding a new event-type is a 1-line allowlist append + corresponding
allowlist + activate + receive test additions. **Never a schema
migration.** The receive route's defense-in-depth path (200-ack +
`unknown_subscription` log when no matching `hubspot_app_subscriptions`
row exists) protects against stray events even if a future allowlist
addition lands without a corresponding `findOrCreate` path — the
event reaches the receive route, the lookup misses, the receive route
ACKs without dispatching.

### 2.11 Per-run randomized e2e values (continues Sheets 2.2 §2.16 rule)

The new e2e tests use per-run randomized `eventId` (`runMarker`
suffix) + `objectId` (random integer per run) per the established
rule. `webhook_event_dedup` is system-wide and NOT cascaded by
`deleteTestUser` — without randomization the second e2e run would hit
dedup and the dispatcher would drop the event silently.

### 2.12 line_items subfolder convention for HubSpot

The structural split (line_items domain → subfolder) was forced by
the 50-file leaf-folder cap. Future HubSpot 2.x additions in
adjacent domains (tickets, engagements, etc.) may follow the same
convention OR stay flat depending on file-count pressure. The cap
applies to the parent dir + each subfolder independently — no domain
will hit 50 files in practice. The convention is locally additive,
not a project-wide refactor.

### 2.13 D-HS1 SKIP pinned at the registry-test layer

Registry test asserts `add_to_workflow` + `remove_from_workflow`
remain `undefined` in the action registry. Any future PR that
accidentally registers either fails the registry test. The audit's
SKIP decision is now load-bearing in CI, not just documented in the
plan.

---

## 3. V1 rot fixed (consolidated)

All entries from the audit + plan tracked. Status summary:

| ID | Pattern | V2 status after 2.1 |
|---|---|---|
| R7 (master) | Unsafe webhook verification | CLOSED in Slice 13 (X-HubSpot-Signature-V3 HMAC-SHA256 + 5-min replay) — unchanged. |
| R11 (master) | Per-workflow webhook subscription creation (eager-bulk) | CLOSED in Slice 13 (app-level shared subscriptions with portal-scoped reference counting) — unchanged. New ticket event-types use the same shared model. |
| HS-R1 | 17 separate trigger node types for what is one webhook trigger | CLOSED in Slice 13 (consolidated `webhook_received`) — unchanged. Allowlist count moved 10 → 12 in this slice; node count stayed 1. |
| HS-R2 | Inline 380-LOC "humanize" payload normalization | NOT PORTED — V2's bounded normalize handles the new event-types without case branching. |
| HS-R3 | Per-workflow `getWebhookUrl(workflowId)` URL routing | NOT PORTED — HubSpot's documented single-global-target-URL model. |
| HS-R4 | Dead-code `createContactDynamic.ts` at the manifest layer | NOT PORTED. |
| HS-R5 | Workflow-management actions on legacy `automation/v2` endpoint | **SKIPPED per accepted D-HS1.** Registry test pins the SKIP. |
| HS-R6 | Single test file in V1 | NOT PORTED — V2 ships ~20 HubSpot test suites after this slice (16 from Slice 13 + 4 new handler suites + extended wrapper / trigger / registry suites). |
| HS-R7 | OAuth `refreshTokenExpirationSupported: false` field-naming confusion | DOCUMENTED in V2 manifest doc-comment — unchanged. |

No new master-catalog entries surface from this slice. No new
HubSpot-specific rot entries surface.

### V1 rot NOT ported in this slice (audit DEFER set)

- V1's `getForms.ts` — builder-UI dropdown loader shape. Lands when
  `form.submission` trigger lands.
- V1's `getDealPipelines.ts` — builder-UI dropdown loader shape. Lands
  with a Phase 3 builder-UI pass.
- V1's `note.creation` / `task.creation` / `call.creation` /
  `meeting.creation` triggers — engagement payload shape needs a
  shared schema. Lands when a real workflow asks.
- V1's `form.submission` — distinct `/forms/v2/...` transport. Files
  as its own platform-tier slice if needed.
- V1's `add_to_workflow` / `remove_from_workflow` — **permanently
  SKIPPED per D-HS1** absent product-decision revisit.

---

## 4. Files shipped

### Source

**Wrapper extensions (Commit 2):**
- [`integrations/_shared/hubspot/api/lineItems.ts`](../../../integrations/_shared/hubspot/api/lineItems.ts) — added `lineItemsDelete` + `lineItemsSearch` + types.
- [`integrations/_shared/hubspot/api/lists.ts`](../../../integrations/_shared/hubspot/api/lists.ts) — added `removeListMembershipByEmail` + types.
- [`integrations/_shared/hubspot/api/products.ts`](../../../integrations/_shared/hubspot/api/products.ts) — added `productsSearch` + types.

**New action handlers (Commit 2):**
- [`integrations/hubspot/actions/line_items/removeLineItem.ts`](../../../integrations/hubspot/actions/line_items/removeLineItem.ts) + `.schema.ts`.
- [`integrations/hubspot/actions/line_items/getLineItems.ts`](../../../integrations/hubspot/actions/line_items/getLineItems.ts) + `.schema.ts`.
- [`integrations/hubspot/actions/removeFromList.ts`](../../../integrations/hubspot/actions/removeFromList.ts) + `.schema.ts`.
- [`integrations/hubspot/actions/getProducts.ts`](../../../integrations/hubspot/actions/getProducts.ts) + `.schema.ts`.

**Structural move (Commit 2):**
- `integrations/hubspot/actions/createLineItem.{ts,schema.ts}` → `integrations/hubspot/actions/line_items/`.
- `integrations/hubspot/actions/updateLineItem.{ts,schema.ts}` → `integrations/hubspot/actions/line_items/`.

**Trigger allowlist (Commit 3):**
- [`integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts`](../../../integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts) — extended with 2 entries + doc-comment update.

**Registry (Commit 2):**
- [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) — 4 new imports + 4 new entries + import-path updates for the line_items subfolder move.

### Tests

**Wrapper test extensions (Commit 2 — append to existing):**

| Suite | New tests |
|---|---|
| `tests/unit/integrations/_shared/hubspot/api/lineItems.test.ts` | +10 (delete + search) |
| `tests/unit/integrations/_shared/hubspot/api/lists.test.ts` | +5 (remove) |
| `tests/unit/integrations/_shared/hubspot/api/products.test.ts` | +6 (search) |

**Handler tests (Commit 2 — new files):**

| Suite | Tests |
|---|---|
| `tests/unit/integrations/hubspot/actions/removeLineItem.test.ts` | 7 |
| `tests/unit/integrations/hubspot/actions/getLineItems.test.ts` | 12 |
| `tests/unit/integrations/hubspot/actions/removeFromList.test.ts` | 8 |
| `tests/unit/integrations/hubspot/actions/getProducts.test.ts` | 12 |

**Manifest + registry tests (Commit 2):**
- `tests/unit/integrations/hubspot/manifest.test.ts` — action count 22 → 26 + sorted-list update.
- `tests/unit/services/execution/handlers/registry.test.ts` — +1 PORT-set block (4 new handlers registered) + 1 SKIP/DEFER guard block (D-HS1 + audit DEFER set NOT registered).

**Trigger tests (Commit 3 — append to existing):**

| Suite | New tests |
|---|---|
| `allowedSubscriptionTypes.test.ts` | +2 (ticket entries in allowlist + propertyChange suffix) |
| `activate.test.ts` | +4 (accept ticket.propertyChange with propertyName, reject without, accept ticket.deletion bare, reject ticket.deletion with propertyName) |
| `receive.test.ts` | +2 (ticket.propertyChange propertyName-scoped lookup, ticket.deletion null lookup) |

**Total net new unit tests:** ~70 (across ~8 new files + ~7 extended files).

**Test totals after Commit 3:**
- Full jest: **664 suites / 6508 tests passing** (was 660 / 6438 at plan baseline → net +4 suites / +70 tests).
- HubSpot focused: 20 suites / 102 HubSpot-specific tests passing.

### E2E (Commit 3)

- [`tests/e2e/slice-13-hubspot-walkthrough.spec.ts`](../../../tests/e2e/slice-13-hubspot-walkthrough.spec.ts) extended with one new `test.describe("HubSpot 2.1 — ticket trigger event-types e2e")` block — 2 new tests (`ticket.propertyChange` + `ticket.deletion`). Mock surface unchanged; the existing `__sendWebhookEvent` accepts arbitrary `subscriptionType` parameter (the audit's "~10 LOC mock extension if __sendWebhookEvent needs override" was unnecessary).
- E2E total after 2.1: **3 tests / 3 passing** under `--workers=1` in ~46s (1 existing Slice 13 + 2 new HubSpot 2.1).

### Docs

- [`docs/slices/parity/parity-hubspot.md`](parity-hubspot.md) (audit — commit `9f3cf555a`).
- [`docs/slices/parity/hubspot-2-1-parity-plan.md`](hubspot-2-1-parity-plan.md) (plan — commit `a6eb6c74b`).
- This file (Commit 4 — outcomes).
- CLAUDE.md updates (Commit 4).

---

## 5. Commit breakdown (4)

| # | Commit hash | What landed |
|---|---|---|
| 1 (audit) | `9f3cf555a` | `docs(hubspot): add parity audit` (separate gating commit; not numbered in this slice but cited for completeness) |
| 1 | `a6eb6c74b` | `docs(hubspot): plan 2.1 parity` — 589-line plan doc |
| 2 | `81544089e` | `feat(hubspot): add line item + product + list read/remove actions` — 4 actions + 4 schemas + 3 wrapper extensions + registry + line_items subfolder move + ~62 new unit tests |
| 3 | `4f0ae54c1` | `feat(hubspot): expand webhook_received allowlist with ticket events` — 2 allowlist entries + ~8 new unit tests + 2 new e2e tests |
| 4 | (this commit) | `docs(hubspot): document 2.1 outcomes` |

Each implementation commit individually passed gates:
- `npx tsc --noEmit`
- `npm run lint` (only the pre-existing `_registry.ts` line-count warning)
- `npm run lint:structure` (after the line_items move in Commit 2)
- `npm run lint:migrations`
- `npx jest tests/unit/integrations/hubspot/ tests/unit/services/triggers/`
- `npm test`
- (Commit 3) `CI=1 npx playwright test tests/e2e/slice-13-hubspot-walkthrough.spec.ts --workers=1`

---

## 6. Acceptance criteria (post-merge)

- [x] 4 new actions registered in `services/execution/handlers/_registry.ts` (`remove_line_item`, `get_line_items`, `remove_from_list`, `get_products`).
- [x] 4 new wrapper exports in 3 existing wrapper files (`lineItems.ts` ×2, `lists.ts` ×1, `products.ts` ×1).
- [x] 2 new allowlist entries (`ticket.propertyChange`, `ticket.deletion`).
- [x] Every action handler ships with `.strict()` schema + bounded output + `refreshAndRetry`-wrapped principal call.
- [x] `remove_from_list` uses the v3 endpoint (NOT V1 legacy v1).
- [x] `get_*` actions use search endpoint (NOT bare list).
- [x] Bounded output — `paging.next.link` NEVER leaked.
- [x] No `automation/v2` references anywhere in source or tests.
- [x] Registry test pins D-HS1 SKIP (`add_to_workflow` + `remove_from_workflow` unregistered) AND audit DEFER set (`get_forms`, `get_deal_pipelines`) unregistered.
- [x] No new migrations.
- [x] No new repositories.
- [x] No manifest scope change.
- [x] No regression in the existing 22 actions or 10 allowlist entries (664/6508 jest tests; 3/3 e2e).
- [x] `ticket.propertyChange` activation enforces `propertyName` required; `ticket.deletion` enforces `propertyName` forbidden.
- [x] `ticket.propertyChange` event surfaces `subscriptionType` + `propertyName` + `propertyValue` + `objectId` in the dispatched payload (e2e verified).
- [x] `ticket.deletion` event surfaces `subscriptionType` + `objectId` with `propertyName: null` (e2e verified).
- [x] Per-run randomized eventId + objectId in e2e (Sheets 2.2 §2.16 rule).
- [x] Structural split (line_items subfolder) per user-accepted direction; existing imports updated; tests green; lint:structure passes.

---

## 7. What's deferred

### Carried forward from audit (post-HubSpot 2.1)

| Item | Decision | Revisit trigger |
|---|---|---|
| `get_forms` | DEFER | Lands alongside `form.submission` if/when transport-tier slice ships. |
| `get_deal_pipelines` | DEFER | Lands with a Phase 3 builder-UI pass that needs server-side option loading. |
| `note.creation` / `task.creation` / `call.creation` / `meeting.creation` (engagement triggers) | DEFER (PORT-WHEN-NEEDED) | Real workflow demand + shared engagement-payload normalize extension. |
| `form.submission` | SKIP UNDER CURRENT TRANSPORT | File as separate platform-tier slice if a workflow needs it. |
| `add_to_workflow` | **SKIP per accepted D-HS1** | Revisit only on real customer/workflow demand requiring HubSpot workflow enrollment. |
| `remove_from_workflow` | **SKIP per accepted D-HS1** | Same. |

### Permanently skipped (HubSpot 2.1 specific)

| Item | Reason |
|---|---|
| V1 `getLineItems.ts` `deleteBy`/`confirmDelete`/`deletedData` UI chrome | Audit GS-style chrome — V2 typed-and-narrow. |
| V1 legacy `/contacts/v1/lists/{listId}/remove` endpoint for `remove_from_list` | V3 endpoint symmetric with `add_contact_to_list`. |
| V1 GET-list endpoint shape for `get_line_items` / `get_products` | Search endpoint supports filters + properties + cursor in one call. |
| V1 `automation/v2/workflows` references | D-HS1 SKIP. No code references, no test references. |
| Multi-group OR filter composition | Single-group AND only — matches `contactsSearch`. Workflow authors compose OR via multiple `get_*` calls. |
| Typed `filterOperator` enum at the handler layer | `EQ`-only at handler today; wrapper supports full enum for future expansion. Adding handler-side `filterOperator` enum is non-breaking. |
| Q4 session-side-effect idempotency wiring | Deferred at the V2 engine layer pending a broader slice — matches Slice 13 / Sheets 2.1 / Sheets 2.2. |

### Carried forward from prior slices (untouched in 2.1)

| Item | Why |
|---|---|
| Slice 13 baseline (22 actions + consolidated `webhook_received` trigger + 10-entry allowlist + signature verification + shared-subscription model) | Already shipped at the durable-rule baseline; this slice did not regress them. |
| HubSpot OAuth + token model | Reused unchanged. |
| HubSpot webhook signature (X-HubSpot-Signature-V3) | Reused unchanged. |
| `hubspot_app_subscriptions` + `hubspot_subscription_refs` repositories | Reused unchanged. |

---

## 8. CLAUDE.md updates landed

The existing "Phase 2 progress" section is extended with a HubSpot
2.1 entry alongside Stripe / Airtable / Sheets / Slack / Gmail /
Notion / Excel / Shopify entries. The existing Deep Gotchas section
gains a new short "HubSpot 2.1 additions" subsection documenting:

- Bounded snapshot of the V2 HubSpot trigger surface (consolidated
  `webhook_received` node with 12-entry allowlist after this slice).
- V3-endpoint preference for `remove_from_list` (NOT V1 legacy v1).
- Search-endpoint preference for `get_*` actions (NOT bare list).
- `paging.next.link` NEVER leaked in `get_*` outputs.
- `EQ`-only filter operator at the handler layer with forward-compat
  enum at the wrapper layer.
- D-HS1 SKIP pinned at the registry-test layer.
- line_items subfolder convention.

---

## 9. What's next (HubSpot roadmap)

Per parity-hubspot.md §16:

- **HubSpot 2.2** — on-demand. Targets:
  - Engagement triggers (`note.creation` + `task.creation` + `call.creation` + `meeting.creation`) + shared engagement-payload normalize extension. Ships as one slice when a real workflow asks.
  - `form.submission` trigger via the distinct `/forms/v2/...` transport — separate platform-tier slice if a workflow needs it.
  - `get_forms` + `get_deal_pipelines` builder-UI loaders — likely land alongside Phase 3 builder UI work.
  - `filterOperator` enum at the handler layer for `get_*` actions (non-breaking schema extension).
- **D-HS1 revisit** — opens only on real customer/workflow demand for HubSpot workflow enrollment.
- **Mailchimp parity audit** — rank #10 per phase-2-plan §3. Already in progress in a sibling chat (see `docs/slices/parity/parity-mailchimp.md`).

The HubSpot parity arc closes once Marcus accepts this outcomes
commit.

**HubSpot 2.1 is complete pending Marcus's acceptance of this
outcomes commit.**
