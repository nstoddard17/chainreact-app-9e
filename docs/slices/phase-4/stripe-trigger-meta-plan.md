# Stripe `event_received` TriggerMeta — Audit + Plan (STRIPE-TRIGGER-META-1)

**Slice:** 4.STRIPE-TRIGGER-META-1 (this plan) → STRIPE-TRIGGER-META-2 (TriggerMeta + Stripe discovery sub-registry refactor + tests).
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch (verified at authoring):** `ai-12c-planner-json-only-hardening` (shared worktree — provider + AI commits interleaved; verify topology before push).
**Parent audit:** [`provider-runtime-metadata-completeness-audit.md`](./provider-runtime-metadata-completeness-audit.md) §2/§7/§8 — the *only* launch blocker identified post-26/26.
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md).
**Sibling precedents:** [`teams-metadata-coverage-plan.md`](./teams-metadata-coverage-plan.md) (sub-registry + trigger pattern), [`outlook-calendar-metadata-coverage-plan.md`](./outlook-calendar-metadata-coverage-plan.md) (consolidated trigger with config field, `body` FORCED sensitive precedent).
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT.

This is the **single launch blocker** PROVIDER-AUDIT-1 identified post-26/26. After STRIPE-TRIGGER-META-2 ships, the provider foundation is launch-ready by every criterion in the audit's §7 checklist.

**Five facts drive the slice plan:**

1. **The runtime is fully shipped — only the meta is missing.** `registerActivation("stripe", "event_received", activate)` is wired at [`integrations/stripe/triggers/eventReceived/index.ts:32`](../../../integrations/stripe/triggers/eventReceived/index.ts). The full trigger surface exists: `activate.ts` creates a Connect-mode platform webhook endpoint, `deactivate.ts` deletes it, `normalize.ts` converts Stripe event JSON to the canonical `TriggerEvent` shape. **Zero runtime changes are needed**; this is a pure additive metadata slice.
2. **The runtime config field is `enabledEvents` (plural).** Verbatim from `activate.ts:78` — `node.config?.enabledEvents`. **REQUIRED, non-empty array of strings**, each validated against `STRIPE_ALLOWED_EVENT_TYPES` via `isAllowedStripeEventType` — activation throws fast on any value outside the allowlist. The meta MUST use exactly this field name (drift would silently break the trigger; nothing would activate).
3. **18 static event types from the allowlist.** [`allowedEventTypes.ts`](../../../integrations/stripe/triggers/eventReceived/allowedEventTypes.ts) is the authoritative source: 3 `payment_intent.*` + 4 `charge.*` + 3 `customer.*` + 4 `customer.subscription.*` (incl. `trial_will_end`) + 3 `invoice.*` + 1 `checkout.session.completed`. 18 < the 256-option `FieldOptionSchema` cap → ship as static `options` on a multi-select combobox. **No resolver needed.**
4. **Failed-payment events are supported.** Three (arguably four) allowlist entries map to failed-payment workflows: `payment_intent.payment_failed`, `charge.failed`, `invoice.payment_failed` (+ `charge.dispute.created` for chargebacks). The Stripe → Slack DM canonical use case is unblocked the moment this trigger meta lands.
5. **Stripe is currently the LAST direct-import discovery provider.** Every other Phase-4 provider migrated to a per-provider sub-registry under `services/discovery/providers/*.ts`. Stripe still imports its 16 action metas directly into `services/discovery/_registry.ts:246-264`. STRIPE-TRIGGER-META-2 is the right time to refactor Stripe into the sibling pattern (clean diff, consistent across all 26 providers, and lets the new TriggerMeta land in the same sub-registry).

---

## 1. Current Stripe trigger runtime inventory

**Trigger key:** `event_received` (verified at [`normalize.ts:75`](../../../integrations/stripe/triggers/eventReceived/normalize.ts) — `STRIPE_TRIGGER_EVENT_TYPE = "event_received"`).
**Provider:** `stripe`.
**Activation registration:** `registerActivation("stripe", "event_received", activate)` + `registerDeactivation("stripe", "event_received", deactivate)` at `index.ts:32-33`. **NO subscription handler registration** — Stripe webhook endpoints don't expire, so the renewal cron deliberately skips them (the `runRenewals` filter checks `config.type === "subscription-watch"` and Stripe's activate hook intentionally omits that marker).

### 1.1 Activation behavior

- **Per-workflow** webhook endpoint (NOT global / provider-level). One Stripe webhook endpoint per (workflow, node) pair on the platform Stripe account, with `connect: true` so it routes Connect events from all connected merchant accounts.
- **Config it reads:** `node.config.enabledEvents` (REQUIRED non-empty `string[]`). Each element validated against `STRIPE_ALLOWED_EVENT_TYPES`; activation throws a clear allowlist error on any unknown event type.
- **Auth principal:** the platform's `STRIPE_CLIENT_SECRET` env var (NOT the merchant's OAuth-issued access token — see `_shared/stripe/api/webhookEndpoints.ts` for the platform-vs-merchant boundary).
- **Notification URL:** `${BASE_URL}/api/webhooks/stripe?workflowId=X&nodeId=Y`. The query params drive the receive route's strict-direct-lookup (Stripe events don't carry an endpoint identifier in the body, so the URL is the only stable signal).
- **No validation handshake.** Stripe endpoints become active immediately at create time.
- **No baseline cursor walk.** Stripe events stream live; no historical replay at activation.
- **Activation returns config patch:**
  ```ts
  {
    webhookEnabled: true,
    endpointId: string,           // Stripe's "we_xxx" id
    endpointSecret: string,       // signing secret (only returned at create)
    enabledEvents: string[],      // echo of the validated allowlist subset
    notificationUrl: string,      // computed URL including ?workflowId=&nodeId=
  }
  ```

### 1.2 Deactivation behavior

`deactivate.ts` deletes the Stripe webhook endpoint by `endpointId`. Best-effort: 404 → swallow (idempotent — the endpoint was already gone).

### 1.3 Normalize payload behavior

[`normalize.ts:77-104`](../../../integrations/stripe/triggers/eventReceived/normalize.ts) converts the raw Stripe event JSON to:
- `provider:"stripe"`, `eventType:"event_received"`, `eventId: event.id` (Stripe's globally unique `evt_xxx`).
- `occurredAt: ISO-8601` from `event.created` (unix seconds → ISO).
- `accountId: event.account` if Connect event, else literal `"<platform>"`.
- `payload` = 8 fields (see §4).

### 1.4 Dedup / idempotency

`eventId = event.id` — Stripe's `evt_xxx` is globally unique and stable across Stripe's own retry attempts. Load-bearing for `webhook_event_dedup` at the dispatcher layer. **No additional dedup needed in the meta** — this is a runtime invariant.

### 1.5 Allowed event types

[`allowedEventTypes.ts`](../../../integrations/stripe/triggers/eventReceived/allowedEventTypes.ts) — `STRIPE_ALLOWED_EVENT_TYPES`, frozen `const` array of **18 strings**:

```
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.created
charge.succeeded
charge.failed
charge.refunded
charge.dispute.created
customer.created
customer.updated
customer.deleted
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.trial_will_end
invoice.created
invoice.paid
invoice.payment_failed
checkout.session.completed
```

Exported alongside an `isAllowedStripeEventType(value): value is StripeAllowedEventType` type guard. The meta imports this constant verbatim and maps each value to a `FieldOption` (see §2).

---

## 2. TriggerMeta requirements

**File:** new `integrations/stripe/triggers/eventReceived/eventReceived.meta.ts`.
**Export:** `stripeEventReceivedTriggerMeta: TriggerMeta`.
**Key:** `"stripe:event_received"` (verbatim — matches runtime).

| Field | Value | Rationale |
|---|---|---|
| `key` | `stripe:event_received` | Verbatim runtime key. |
| `provider` | `stripe` | |
| `type` | `event_received` | Verbatim runtime type. |
| `displayName` | `Stripe Event Received` | Mirrors HubSpot `Webhook Received` / Shopify `Webhook Received` consolidated-trigger naming. _(Alternative: `Stripe Event` — shorter but less precise. Pick at META-2.)_ |
| `description` | `Fires when one of the selected Stripe events occurs (e.g. payment_intent.payment_failed, customer.subscription.created). Select one or more event types to subscribe to.` | Explicit about the multi-select shape; names a concrete event to anchor the canonical failed-payment use case. |
| `category` | `commerce` | Stripe is in the `commerce` ActionCategory (verified by Stripe ActionMeta files — `category:"commerce"` across all 16 metas). Trigger gets the same. |
| `activation` | `"webhook"` | Stripe's `activate` creates a webhook endpoint via Stripe's REST API; mirrors HubSpot/Shopify `webhook`. |
| `requiresIntegration` | `true` | Activation reads `STRIPE_CLIENT_SECRET` (platform-level), but the **workflow row** still depends on a connected Stripe integration for accountId resolution and OAuth-level access checks. _(Note: Stripe's "integration" in V2 is a merchant Connect account — `requiresIntegration:true` is correct.)_ |
| `displayOrder` | `10` | Only trigger for the provider. |
| `fields` | 1 field (`enabledEvents`) — see §2.1. | |
| `payloadShape` | 8 fields — see §4. | |

### 2.1 The single config field — `enabledEvents`

The crux of the meta. Must use **the runtime field name verbatim** (`enabledEvents`, plural) or the trigger silently fails to activate.

```ts
{
  name: "enabledEvents",
  label: "Event Types",
  description:
    "Pick one or more Stripe event types to fire on. The trigger fires once per matching event delivered by Stripe. At least one event type is required.",
  type: "combobox",
  required: true,
  multiple: true,
  options: [
    // Map each STRIPE_ALLOWED_EVENT_TYPES entry to {value, label, description}
    // — see §3 for the proposed labels.
  ],
  placeholder: "Pick one or more Stripe event types…",
}
```

**Why `combobox + multiple: true` (not `string-array`):** the runtime expects values from a fixed allowlist of 18 entries (validated by `isAllowedStripeEventType`). `string-array` accepts arbitrary free text; the builder author could type a non-allowlisted event and the trigger would fail at activation time with a runtime error. `combobox + multiple + static options` constrains the picker to allowlisted values at builder time — fail at design time, not at deploy time.

**Why static `options` (not a resolver):** the allowlist is hardcoded in source (`allowedEventTypes.ts`). No Stripe API call is needed to enumerate; values change only via a 1-line source edit + Stripe dashboard review. Zero benefit from a resolver. 18 entries well under the 256-option cap.

**Field-level invariants the meta cannot enforce:**
- "Non-empty array" — the `required: true` flag tells the builder to mark the field as required, but Zod-level cross-field rules ("must be non-empty after multiselect") live in the runtime's activate function (which already throws fast). The meta documents the invariant via help text.

### 2.2 Marcus decision needed in META-2 (call out, don't decide here)

**Decision: option label format.** Two reasonable choices:
- **(A) Raw event type as both `value` and `label`** — e.g. `{value: "payment_intent.payment_failed", label: "payment_intent.payment_failed"}`. Stripe-fluent developers recognize these immediately. Zero translation surface.
- **(B) Humanized labels** — e.g. `{value: "payment_intent.payment_failed", label: "Payment Failed (PaymentIntent)"}`. Friendlier for non-Stripe-fluent authors but introduces a translation table that needs maintenance when the allowlist changes.

**Recommendation:** ship **option (A) — raw event type values as labels — with an `options[].description` carrying a one-line humanized blurb** (`{value: "payment_intent.payment_failed", label: "payment_intent.payment_failed", description: "A PaymentIntent failed (e.g. card declined)."}`). Best of both: machine-readable name visible, human-readable hint in the tooltip / picker description. `FieldOptionSchema` already supports `description` per [`contracts/actionMeta.ts:88`](../../../contracts/actionMeta.ts). Marcus to confirm in META-2 review.

---

## 3. Stripe failed-payment support (the canonical use case)

**Three (or four) allowlist entries cover failed payments.** Once shipped, the "when a stripe payment fails, send me a slack DM" prompt is no longer blocked by missing trigger metadata.

| Stripe event type | Maps to | Failed-payment? | Recommended description |
|---|---|---|---|
| `payment_intent.payment_failed` | PaymentIntent | ✅ **YES — most common** | A PaymentIntent failed (e.g. card declined, insufficient funds). |
| `charge.failed` | Charge | ✅ YES (legacy / direct-charge flows) | A Charge failed (legacy flow — most accounts use PaymentIntents). |
| `invoice.payment_failed` | Invoice (subscription-driven) | ✅ YES (subscription billing) | An invoice's automatic payment failed (typically subscription renewal). |
| `charge.dispute.created` | Dispute | 🟡 Arguably (chargebacks ≠ direct failed payments, but financially adjacent) | A dispute was opened on a previously-succeeded charge (chargeback). |

**META-2 implementation note:** the AI catalog will see all 18 options via the static `options` array; the AI planner can pattern-match user prompts like "failed payment" to the three exact failed-payment events. No special metadata grouping is needed for v1 (the `options[].description` carries the natural-language hint the planner can match).

**Potential future enhancement (out of scope for v1):** add a meta-level `optionGroups` concept to cluster events by domain (payments / customers / subscriptions / invoices / checkout) — but `FieldOptionSchema` has no `group` key today, and adding one is a contract change. v1 ships flat; group hierarchy is a follow-up.

---

## 4. Payload / output shape

**Source:** [`normalize.ts:77-104`](../../../integrations/stripe/triggers/eventReceived/normalize.ts) `normalizeStripeEvent.payload`. **Eight fields**, all top-level on `payload`. Each one's sensitivity decision is documented + rationale per the slice's "do not mark everything blindly, lean safe for payment/customer objects" guidance.

| # | Name | Type | Description | Sensitive? | Rationale |
|---|---|---|---|---|---|
| 1 | `stripeEventType` | `string` | The actual Stripe event type that fired (e.g. `payment_intent.payment_failed`). Workflows branch on this. | **NO** | Literal enum value from the allowlist (`STRIPE_ALLOWED_EVENT_TYPES`). Not PII, not access-bearing. Mirror Outlook Cal trigger `changeType` and GCal trigger `changeKind` — both unmarked. |
| 2 | `data` | `object` | The `event.data.object` resource snapshot — the primary resource (PaymentIntent / Subscription / Customer / Invoice / Charge / CheckoutSession). | **YES — plan-marked** | The Stripe resource carries financial state (amounts, currency, status), customer references (`customer` id + sometimes inline email/address), payment instrument fragments (card last4, brand). Even though the OUTPUT name `data` is NOT in `SUSPICIOUS_NAMES`, the contents almost always include PII or financial state. Per slice guidance: "Stripe event object/resource payloads should be sensitive." Mirror GCal `events` / GDrive `files` / OneDrive `downloadUrl` precedent (plan-marked, not forced). |
| 3 | `previousAttributes` | `object` | Stripe's `event.data.previous_attributes` — the diff of fields that changed on `*.updated` events. | **YES — plan-marked** | Same content shape as `data` (subset of fields that changed). If `data` is sensitive, `previousAttributes` is too. |
| 4 | `created` | `number` | Unix seconds when Stripe fired the event. | **NO** | Timestamp. Mirror `created`/`createdDateTime` precedent across every provider — unmarked. |
| 5 | `livemode` | `boolean` | True if production, false if test mode. | **NO** | Boolean flag. Not PII, not access-bearing. Useful for workflow branching ("only fire on production events"). |
| 6 | `account` | `string` | Connect account id (`acct_xxx`) when present, else null. | **NO** | Opaque Stripe id (not a financial value, not PII). Mirror `accountId` / Teams `teamId` / Drive `fileId` precedent — opaque ids are not marked. |
| 7 | `apiVersion` | `string` | The Stripe API version that signed this event. | **NO** | Version string (e.g. `"2025-05-28.basil"`). Diagnostic, not sensitive. |
| 8 | `request` | `object` | `{id, idempotency_key}` — request metadata for the API call that triggered the event. | **NO** | Diagnostic id values — not PII, not financial. Idempotency keys are caller-supplied and can be anything, but they're not access-bearing in the same way an access token is. _(If a workflow author ever puts PII in their own idempotency key, that's their choice — and the planner can't infer it.)_ |

**Sensitive secondary outputs (deliberate plan-marks): `data` + `previousAttributes`.** Both are objects kept FLAT (no nested `fields[]`) — same approach as GCal `events`, GDrive `files`, OneDrive `downloadUrl`. The flat-array/object precedent avoids the question of "do I need to expose nested `customer.email`?" while still redacting the whole subtree in run-detail surfaces.

**Suspicious-name guard check:** none of the 8 output names are in `SUSPICIOUS_NAMES` (`body`, `email`, `token`, `messages`, etc.). However, **three of the contents** Stripe puts inside `data` — `customer`, `paymentIntent`, `subscription` — ARE suspicious names. We never expose nested `data.customer` / `data.paymentIntent` etc. as separately-named OutputMeta entries (we keep `data` as a flat opaque object), so the SUSPICIOUS_NAMES recursion never trips. **If a future iteration adds nested OutputMeta for `data.customer` etc., those nested children MUST be marked `sensitive:true` — flagged for STRIPE-TRIGGER-META-2 reviewers.**

---

## 5. Discovery wiring plan

### 5.1 Current state

Stripe is the **last** direct-import provider in `services/discovery/_registry.ts`. Sixteen import lines (`stripeCreateCustomerMeta`, etc.) at lines 246-264 + sixteen spread entries in `ALL_ACTION_META` at lines 539-554. **No Stripe TriggerMeta wiring exists today** (commented out by Stripe's plan as "deferred to a follow-up slice — see stripe-action-metadata-plan §3").

Every other Phase-4 provider uses the per-provider sub-registry pattern at `services/discovery/providers/<provider>.ts`. The pattern is identical across Teams / OneDrive / Trello / Airtable / Excel / Shopify / OneNote / GCal / GDrive / Outlook Cal — each exports `<PROVIDER>_ACTION_METAS` + `<PROVIDER>_TRIGGER_METAS` consts, and `_registry.ts` spreads them.

### 5.2 Recommended approach for META-2

**Refactor Stripe to a sub-registry IN THE SAME SLICE as adding the trigger meta.**

- **New file:** `services/discovery/providers/stripe.ts` (similar to `services/discovery/providers/microsoft-outlook-calendar.ts`):
  - Imports the 16 existing `stripe*Meta` action metas.
  - Imports the new `stripeEventReceivedTriggerMeta`.
  - Exports `STRIPE_ACTION_METAS: ReadonlyArray<ActionMeta>` (the 16 in displayOrder) + `STRIPE_TRIGGER_METAS: ReadonlyArray<TriggerMeta>` (the 1 trigger).

- **Edit `services/discovery/_registry.ts`:**
  - REMOVE the 16 direct `stripe*Meta` imports (lines 246-264) + the 16 entries in `ALL_ACTION_META` spread (lines 539-554).
  - ADD a single `import { STRIPE_ACTION_METAS, STRIPE_TRIGGER_METAS } from "./providers/stripe";` (mirrors the Outlook Cal / GDrive / GCal pattern).
  - ADD `...STRIPE_ACTION_METAS,` to `ALL_ACTION_META` (replacing the 16 individual entries — net-negative line count in `_registry.ts`).
  - ADD `...STRIPE_TRIGGER_METAS,` to `ALL_TRIGGER_META` with the same `// activation registered in integrations/stripe/triggers/eventReceived/index.ts …` comment shape as the sibling triggers.

- **Net effect on `_registry.ts` line count:** roughly **−30 lines** (drops 16 imports + 16 spread entries; adds 1 import + 2 spread entries with comments). The sub-registry file is ~80 lines. **This actually pulls `_registry.ts` BACK UNDER the 400-line cap** that's been creeping with every provider addition (currently at 462; would drop to ~430-ish after the refactor — slight improvement, doesn't yet eliminate the warning but reverses the trend).

### 5.3 Why refactor + add in one slice (not two)

- The refactor is **mechanical** — move imports between files, swap individual spreads for spread-of-array. Low risk.
- Tests for both pieces are co-located naturally (one new `stripe-trigger-discovery.test.ts` plus one new `stripe-provider-route.test.ts` that exercises both actions-route AND triggers-route in one file — sibling pattern).
- Two slices would commit-noise the same diff without buying review clarity. The audit already separated planning from implementation.
- After META-2, **all 26 providers use the sub-registry pattern** — no exceptions. Future provider arcs follow one template.

### 5.4 Out-of-scope for META-2

- **No change to the Stripe `category`** — every existing Stripe ActionMeta uses `category:"commerce"`; the new TriggerMeta uses the same. No need to revisit.
- **No move of the existing 16 Stripe ActionMeta files** — they stay at `integrations/stripe/actions/*.meta.ts`. Only the discovery wiring file moves.

---

## 6. Tests required

| Test file | Status | Coverage |
|---|---|---|
| `tests/unit/services/discovery/stripe-trigger-discovery.test.ts` | **NEW** | TriggerMeta surface: 1 trigger registered; `key === "stripe:event_received"`; `provider === "stripe"`; `activation === "webhook"`; `requiresIntegration === true`; `category === "commerce"`; `displayOrder === 10`; `fields.length === 1`; single field is `enabledEvents` combobox + `multiple:true` + `required:true` + `options.length === 18`; option values exactly match `STRIPE_ALLOWED_EVENT_TYPES` (assertion uses `import { STRIPE_ALLOWED_EVENT_TYPES }` directly — single source of truth); payload shape includes the 8 documented fields; `data` + `previousAttributes` sensitive; other 6 not. |
| `tests/unit/app/api/providers/stripe-provider-route.test.ts` | **NEW** | Sibling pattern (mirrors microsoft-teams-provider-route.test.ts shape). `/api/providers/stripe/actions` returns 16 actions in displayOrder (regression guard for the sub-registry refactor); `/api/providers/stripe/triggers` returns the 1 `stripe:event_received` trigger with the full wire shape (config field, sensitive payload fields, static options including the 3 failed-payment events). `/api/providers` confirms `stripe.hasMetadata === true`. |
| `tests/structure/trigger-meta-activation-invariant.test.ts` | EXISTING | Picks up the new trigger meta automatically. No exemption needed (`registerActivation` is already wired; the activation function exists). |
| `tests/structure/discovery-meta-coverage.test.ts` | EXISTING | Continues to pass — Stripe stays in `COVERED_PROVIDERS`; the 16 action handlers still have 16 metas (the sub-registry refactor doesn't change the meta surface, only WHERE the imports live). |
| `tests/structure/sensitive-output-coverage.test.ts` | EXISTING | Continues to pass — no new output names in `SUSPICIOUS_NAMES`; `data`/`previousAttributes` are plan-marked. |
| `tests/unit/app/api/providers/providers-route.test.ts` | EDIT | Add a positive Stripe trigger assertion (mirrors the OUTLOOK-CAL META-2 / GDRIVE META-2 / GCAL META-2 / Teams META-3 patterns — a one-test block like *"marks Stripe `event_received` trigger discoverable"*). Stripe's existing `hasMetadata=true` assertion at line ~130 stays unchanged (it asserts ACTIONS already; trigger gets its own positive assertion). |
| Stripe action discovery / handler tests | EXISTING | Continue to pass — no Stripe action behavior changes. The sub-registry refactor is import-grouping only. |

### 6.1 Guards (assert NOT present)

- No secret-shaped output names anywhere on the new TriggerMeta (`token` / `secret` / `clientSecret` / etc. — `endpointSecret` is in the runtime `trigger_resources.config`, NOT in the meta's `payloadShape`, so it's not exposed).
- No provider API calls in metadata tests (pure registry reads — same pattern as every sibling discovery test).
- The static `options` array must EXACTLY equal `STRIPE_ALLOWED_EVENT_TYPES` — drift detection via direct import in the test.

### 6.2 What the new tests DON'T need to cover

- The runtime's webhook endpoint creation (already covered by Slice 11 / Stripe 2.1 trigger tests under `tests/unit/integrations/stripe/triggers/**`).
- The activation function's `enabledEvents` validation (already covered — `activate.test.ts` if present).
- The receive route's signature verification (already covered by `app/api/webhooks/stripe/...` route tests).

---

## 7. Acceptance criteria

Stripe trigger metadata is ready for STRIPE-TRIGGER-META-2 implementation when:

- [x] **Exact config field name verified:** `enabledEvents` (plural, verbatim from `activate.ts:78`).
- [x] **Allowed event options verified:** 18 entries from `STRIPE_ALLOWED_EVENT_TYPES` (`allowedEventTypes.ts:32-51`). Single source of truth — meta imports the constant directly, doesn't redeclare.
- [x] **Failed-payment events identified:** `payment_intent.payment_failed`, `charge.failed`, `invoice.payment_failed` (+ `charge.dispute.created` for chargebacks).
- [x] **Output shape mapped:** 8 payload fields per `normalize.ts:93-103` — see §4 table.
- [x] **Sensitive fields decided:** `data` + `previousAttributes` plan-marked (lean-safe per slice guidance); other 6 (stripeEventType / created / livemode / account / apiVersion / request) NOT marked. Outputs stay flat — no nested `fields[]` exposed — so SUSPICIOUS_NAMES recursion never trips.
- [x] **Discovery wiring approach decided:** refactor Stripe to a sub-registry (`services/discovery/providers/stripe.ts`) AT THE SAME TIME as adding the trigger meta. Net `_registry.ts` line count drops ~30.
- [x] **Tests planned:** 2 new test files + 1 edited test file + 3 existing structural invariants auto-extend.
- [x] **No runtime behavior change is required:** the runtime is fully shipped (activate + deactivate + normalize + allowedEventTypes); meta is the only missing piece.

**One open Marcus decision** (to confirm at META-2 review):

- **Option label format** (§2.2) — recommend raw event type values as labels + humanized one-line `option.description`. Either way works; this is a UX call, not a correctness call.

---

## 8. Post-implementation expected behavior (STRIPE-TRIGGER-META-2 success criteria)

After STRIPE-TRIGGER-META-2 ships:

1. **`/api/providers/stripe/triggers` returns the `event_received` trigger** with the full wire shape — config field, static options (18 entries), 8-field payload shape with `data` + `previousAttributes` marked sensitive.
2. **AI provider catalog includes `stripe:event_received`** — the planner can ground Stripe-trigger workflows, see the required `enabledEvents` config field, and see all 18 event-type options (including the 3 failed-payment events).
3. **The canonical failed-payment prompt unblocks:** _"when a stripe payment fails, i want it to send me a slack dm"_ — the planner can:
   - Pattern-match "payment fails" → `payment_intent.payment_failed` (the most common failed-payment event) on the `enabledEvents` field.
   - Wire `stripe:event_received` as the trigger.
   - Wire `slack:send_direct_message` as the action.
   - May still need to ask the user for the Slack userId (no automatic inference of the workflow author's Slack identity) and the DM text — but the workflow shape is valid and previewable.
4. **No regression in Stripe actions** — the 16 ActionMeta entries continue to be discoverable; the sub-registry refactor is import-grouping only.
5. **`_registry.ts` line count drops** by ~30 lines (net) — slight relief on the pre-existing max-lines warning across every provider sub-registry addition.

After this, the **provider foundation is launch-ready** by every criterion in PROVIDER-AUDIT-1 §7. Subsequent work moves to the post-launch backlog (§6 of the audit doc).

---

## Appendix — risks / blockers summary

1. **Field name `enabledEvents` MUST be verbatim.** Drift to `eventTypes` / `event_type` / etc. would silently break trigger activation (builder writes config the runtime can't read). The test in §6 imports `STRIPE_ALLOWED_EVENT_TYPES` directly to guard the OPTIONS, but the FIELD NAME guard is via the activate test (existing) + an explicit assertion in the new discovery test (`fields[0].name === "enabledEvents"`).
2. **Sub-registry refactor + new trigger in one slice** — slightly bigger commit footprint than the typical TriggerMeta-only add, but mechanical and reviewable. The sibling-pattern consistency benefit outweighs the diff size.
3. **`data` + `previousAttributes` sensitivity is plan-marked, not forced** — same pattern as GCal `events` / GDrive `files`. If a future iteration exposes nested `data.customer` / `data.paymentIntent` / `data.subscription` (all in SUSPICIOUS_NAMES), those nested children MUST be marked `sensitive:true` or `sensitive-output-coverage` fails. Captured as a STRIPE-TRIGGER-META-2 reviewer note.
4. **18 static options well under cap, no resolver needed** — but the allowlist source is single-file authoritative; META-2's discovery test imports it directly to guard against drift.
5. **Label format is a UX call, not a correctness call** — recommendation captured (raw event type + humanized description). Marcus decides at META-2 review.
6. **No multi-event grouping in v1** — workflow authors picking from a flat 18-entry list. Group hierarchy would require a `FieldOptionSchema.group?` contract addition; out of scope.
7. **No nested OutputMeta on `data`** — kept flat to avoid `SUSPICIOUS_NAMES` recursion on `customer` / `paymentIntent` / `subscription`. Mirror GCal / GDrive precedent.
8. **`endpointSecret` lives in `trigger_resources.config`, NOT in the meta's `payloadShape`** — explicit guard in the test that no secret-shaped output name appears on the meta surface.
9. **Branch/worktree caution.** Authored on the shared `ai-12c-planner-json-only-hardening` branch with interleaved AI + provider commits; explicit-path staging only; verify branch topology before any push/PR.
10. **This is the LAST audit/plan slice in the launch-gap arc.** After STRIPE-TRIGGER-META-2 ships, the provider foundation is launch-ready and subsequent work pulls from the post-launch backlog (PROVIDER-AUDIT-1 §6).

---

## 9. STRIPE-TRIGGER-META-2 outcomes (shipped 2026-05-25) — 🎯 launch blocker CLOSED

**Scope delivered:** 1 TriggerMeta + Stripe sub-registry refactor + `services/discovery/_registry.ts` wire + tests + docs. **PROVIDER-AUDIT-1's single launch blocker is CLOSED** — `/api/providers/stripe/triggers` now returns `event_received`; the canonical Stripe-failed-payment → Slack DM use case is catalog-grounded. **Provider foundation is launch-ready by every criterion in PROVIDER-AUDIT-1 §7.**

### 9.1 TriggerMeta — `integrations/stripe/triggers/eventReceived/eventReceived.meta.ts`

`stripe:event_received`: `activation:"webhook"`, `category:"commerce"`, `requiresIntegration:true`, `displayOrder:10`. Single config field `enabledEvents` (verbatim runtime name) — `combobox + multiple:true + required:true` with **18 static options derived directly from `STRIPE_ALLOWED_EVENT_TYPES`** (drift-proof — the meta imports the runtime constant, doesn't redeclare; the test asserts `optionValues === [...STRIPE_ALLOWED_EVENT_TYPES]`). Each option carries a one-line humanized `description` (the AI planner uses these for prompt → event-type matching). 8-field payload mirrors `normalize.ts` exactly. `data` + `previousAttributes` plan-marked sensitive (Stripe resource snapshot + diff); kept FLAT to avoid SUSPICIOUS_NAMES recursion on `customer` / `paymentIntent` / `subscription`.

### 9.2 Sub-registry refactor — `services/discovery/providers/stripe.ts`

**Refactor closes the last direct-import provider — all 26 providers now use the same per-provider sub-registry pattern.** New `services/discovery/providers/stripe.ts` exports `STRIPE_ACTION_METAS` (16 in displayOrder 10..160) + `STRIPE_TRIGGER_METAS` (1). `services/discovery/_registry.ts`: removed the 26-line Stripe import block (lines 239-264) + the 34-line spread block (lines 518-551); added a single 4-line import + spread. **`_registry.ts` line count dropped from 462 to under 400 — the max-lines warning that crept up with every provider addition is now gone.**

### 9.3 Provider route behavior

| Endpoint | Before STRIPE-TRIGGER-META-2 | After |
|---|---|---|
| `/api/providers` → stripe.hasMetadata | `true` (already, from action coverage) | `true` (preserved — regression-guarded by the new test) |
| `/api/providers/stripe/actions` | 16 actions in displayOrder 10..160 | 16 actions in displayOrder 10..160 (preserved — regression-guarded) |
| `/api/providers/stripe/triggers` | **`[]`** ❌ | **`[event_received]`** with full wire shape ✅ |

### 9.4 Failed-payment options catalog-visible

The three failed-payment events shipped in the meta's static options with humanized descriptions:
- `payment_intent.payment_failed` — "A PaymentIntent failed (e.g. card declined, insufficient funds)."
- `charge.failed` — "A Charge failed (legacy direct-charge flow)."
- `invoice.payment_failed` — "An Invoice's automatic payment failed (typically a subscription renewal)."
- (+ `charge.dispute.created` — "A dispute (chargeback) was opened on a previously-succeeded Charge.")

After this, the prompt **"when a stripe payment fails, i want it to send me a slack dm"** is catalog-grounded — the AI planner sees `stripe:event_received` in the provider catalog, sees the 18 `enabledEvents` options with descriptions, can pattern-match "payment fails" → `payment_intent.payment_failed`, and wire `stripe:event_received` + `slack:send_direct_message`. (The planner may still need to ask for Slack userId + DM text — those are inputs the workflow author must supply.)

### 9.5 Tests added/updated

| File | Status | Coverage |
|---|---|---|
| `tests/unit/services/discovery/stripe-trigger-discovery.test.ts` | **NEW** (14 assertions) | TriggerMeta surface: key/provider/type/activation/category/displayOrder; `enabledEvents` field hygiene (combobox+multiple+required, NO resolver); options EXACTLY match `STRIPE_ALLOWED_EVENT_TYPES` (drift guard); option labels = raw event types (Marcus UX choice); failed-payment options present with descriptions; 8-field payload; data + previousAttributes sensitive; other 6 NOT marked; flat-object guard (no nested fields[]); no secret-shaped names. |
| `tests/unit/app/api/providers/stripe-provider-route.test.ts` | **NEW** (8 assertions) | Sub-registry refactor regression guard: 16 actions still returned in displayOrder; all 16 expected keys present; category commerce + requiresIntegration; trigger returned with full wire shape (combobox+multiple+required + 18 options + 3 failed-payment options); data + previousAttributes serialize sensitive; stripe.hasMetadata preserved. |
| `tests/unit/app/api/providers/providers-route.test.ts` | EDIT | Added positive Stripe trigger assertion mirroring the OUTLOOK-CAL / GDRIVE / GCAL pattern. |
| `tests/structure/discovery-meta-coverage.test.ts` | EXISTING (no change) | Continues passing — Stripe action 1:1 invariant unchanged. |
| `tests/structure/trigger-meta-activation-invariant.test.ts` | EXISTING (no change) | Continues passing — the new TriggerMeta has a registered activation (already wired), no exemption needed. |
| `tests/structure/sensitive-output-coverage.test.ts` | EXISTING (no change) | Continues passing — no new SUSPICIOUS_NAMES names exposed; `data` + `previousAttributes` plan-marked. |

**Targeted-slice: 101/101 across 6 suites. Broad regression: 1935/1935 across 95 suites** (full Stripe + discovery + providers + contracts + structure).

### 9.6 Acceptance criteria (§7) — met

- [x] Exact config field name verified + used (`enabledEvents` verbatim).
- [x] Allowed event options match `STRIPE_ALLOWED_EVENT_TYPES` (direct-import drift guard in test).
- [x] Failed-payment events identified + catalog-visible.
- [x] Output shape mapped (8 fields, matches `normalize.ts`).
- [x] Sensitive fields decided (`data` + `previousAttributes`; others not).
- [x] Discovery wiring decided + executed (sub-registry refactor; all 26 providers now consistent).
- [x] Tests added (3 files modified/created).
- [x] No runtime behavior changed (meta-only addition + import refactor).
- [x] Marcus UX choice for option labels: raw event type strings + humanized `option.description` (per §2.2 recommendation).

### 9.7 Gate results

- `npx tsc --noEmit` → **clean (0)**.
- `npm run lint` → **0 errors, 5 pre-existing warnings** (none mine; `_registry.ts` warning is GONE — Stripe refactor dropped it back under 400 lines).
- `npm run lint:structure` → **OK**.
- `npm run lint:migrations` → **OK**.

### 9.8 Provider foundation status: 🎯 LAUNCH-READY

By every criterion in PROVIDER-AUDIT-1 §7:

- ✅ All 286 launch-scope runtime action handlers have matching ActionMeta (1:1 enforced).
- ✅ **All 60 launch-scope runtime triggers have matching TriggerMeta** (was 59/60; Stripe closes the gap → 60/60).
- ✅ All required `optionsSource` keys exist; no orphan resolvers.
- ✅ Static enum options exposed where field types need them.
- ✅ Sensitive outputs marked.
- ✅ Provider route metadata matches reality for actions AND triggers across all 26 providers.
- ✅ AI catalog can see all launch-intended nodes including the Stripe trigger + 18 event-type options.
- ✅ Known deferred items have owners (PROVIDER-AUDIT-1 §6 backlog table).

**Subsequent provider work pulls from the post-launch backlog** (PROVIDER-AUDIT-1 §6 — GCal `:calendars` resolver, GDrive `:files`/FileRef/share/export, OneDrive FileRef, Teams `:chats`/`:messages`, Excel `:columns`, Outlook Cal online-meeting write toggle, Shopify optional resolvers). All product-prioritized; none launch-blocking.
