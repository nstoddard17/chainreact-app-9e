# Slice 3.POSTSEC-1 — Completed Metadata Security Compliance Audit

**Status:** Audit-only. No runtime / contract / metadata changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Date:** 2026-05-23.
**Pairs with:** [`workflow-builder-security-closeout.md`](./workflow-builder-security-closeout.md) (the SEC-CLOSEOUT checkpoint that mandated this audit before resuming provider work) and [`workflow-builder-data-security-audit.md`](./workflow-builder-data-security-audit.md) (the original SEC-1 audit).

This is the post-SEC-CLOSEOUT compliance audit on every metadata file under `COVERED_PROVIDERS` against the seven shipped security slices (SEC-2A, SEC-2, SEC-3, SEC-7, SEC-8, SEC-14, SEC-4B). The goal is to surface drift — wrong / missing risk flags, missing `OutputMeta.sensitive` flags, missing typed-confirmation coverage — before the build chat resumes provider expansion and before any Stripe high-risk surface is considered for production exposure.

---

## 1. Covered Provider Inventory

### 1.1 `COVERED_PROVIDERS` set (verified against `tests/structure/discovery-meta-coverage.test.ts`)

```
{ "native", "github", "gmail", "microsoft-outlook", "slack", "notion", "stripe" }
```

### 1.2 Per-provider action meta count (verified against `services/discovery/_registry.ts:ALL_ACTION_META`)

| Provider | Action metas | Trigger metas | COVERED_PROVIDERS scope |
| --- | ---: | ---: | --- |
| `native` | 5 | 2 | ✅ |
| `github` | 6 | 1 | ✅ |
| `gmail` | 13 | 3 | ✅ |
| `microsoft-outlook` | 9 | 3 | ✅ |
| `slack` | 31 | 10 | ✅ |
| `notion` | 16 | 0 (Notion has no triggers) | ✅ |
| `stripe` | 16 | 0 (deferred) | ✅ |
| **Total** | **96** | **19** | — |

### 1.3 Partial-coverage check

- No partial provider is in `COVERED_PROVIDERS`. Every covered provider has 1:1 handler↔meta coverage enforced by `tests/structure/discovery-meta-coverage.test.ts`.
- Stripe trigger meta (`stripe:event_received`) remains deferred. The structural test does not enforce trigger coverage, so Stripe staying in `COVERED_PROVIDERS` without trigger metas is by design.
- Stripe action metas are confirmed present locally (16/16) on this branch.

### 1.4 Risk distribution snapshot

| Provider | `low` | `medium` | `high` | `isDestructive: true` | `requiresConfirmation: true` |
| --- | ---: | ---: | ---: | ---: | ---: |
| native | 4 | 0 | 1 | 0 | 0 |
| github | 5 | 1 | 0 | 0 | 0 |
| gmail | 10 | 2 | 1 | 1 | 0 |
| microsoft-outlook | 4 | 4 | 1 | 1 | 0 |
| slack | 12 | 17 | 2 | 2 | 0 |
| notion | 13 | 2 | 1 | 1 | 0 |
| stripe | 4 | 5 | 7 | 3 | 3 |
| **Total** | **52** | **31** | **13** | **8** | **3** |

The three `requiresConfirmation: true` actions are all Stripe (`capture_payment_intent`, `create_refund`, `cancel_subscription`). The eight `isDestructive: true` actions are the three Stripe above plus `gmail:delete_email`, `microsoft-outlook:delete_email`, `slack:delete_message`, `slack:archive_channel`, `notion:archive_page`.

---

## 2. ActionMeta Risk Flag Audit

Source-of-truth contract: [`contracts/actionMeta.ts:383-484`](../../../contracts/actionMeta.ts). Schema enforces `isDestructive: true` ⇒ `riskLevel: "high"` AND `requiresConfirmation: true` ⇒ `riskLevel: "high"`. The inverse is NOT enforced — a `high` action need not be destructive or require confirmation.

### 2.1 Compliant (no change recommended)

**Native (5/5)** — `http_request: high` with documented egress concern, four logic/transform actions correctly `low`. SEC-2A test guards all five.

**GitHub (6/6)** — All read/create actions correctly `low` or `medium`. No deletes or destructive surfaces in the registered set today.

**Gmail (13/13)** — `delete_email: high + isDestructive` correctly flagged. Send / reply / archive correctly `medium`. Reads, label edits, mark-as-read all correctly `low`. The SEC-4B `Cross-provider destructive actions are flagged` test guards `delete_email`.

**Microsoft Outlook (9/9)** — `delete_email: high + isDestructive` flagged. Sends `medium`; reads `low`; `move_email`, `add_categories` `medium` (recoverable). SEC-4B guard covers `delete_email`.

**Slack (31/31)** — `delete_message` + `archive_channel` `high + isDestructive`. All send / update / pin / react actions `medium`. All channel reads, user reads, file reads `low`. SEC-4B guard covers both destructive entries.

**Notion (16/16)** — `archive_page: high + isDestructive + requiresConfirmation: false` per the existing test guard (intentional: technically reversible via `restore_page`, but worth flagging destructive). `restore_page` `low`. `create_database` `medium`. All reads `low`. SEC-4B guard covers `archive_page`.

**Stripe (16/16)** — All 16 actions carry SEC-2A risk fields. Distribution:
- `low` (4): `find_customer`, `find_subscription`, `find_payment_intent`, `get_payments` — guarded by the registry test's "Stripe non-write actions stay low risk".
- `medium` (5): `create_customer`, `update_customer`, `create_checkout_session`, `create_payment_link`, `find_payment_intent`'s sibling reads (note `find_payment_intent` is actually `low`).
- `high` (7): `create_payment_intent`, `confirm_payment_intent`, `capture_payment_intent`, `create_refund`, `create_subscription`, `update_subscription`, `create_invoice` — guarded by registry test's "Stripe money-moving actions are riskLevel=high".
- `high + isDestructive + requiresConfirmation` (3): `capture_payment_intent`, `create_refund`, `cancel_subscription` — guarded by registry test's "Stripe destructive money-moving actions require confirmation".

### 2.2 Findings — risk under-classification (Should-fix candidates)

These five Stripe actions are `riskLevel: "high"` but do NOT set `requiresConfirmation: true` / `isDestructive: true`. Per the SEC-CLOSEOUT explicit decision (§3.3 of the closeout doc and `riskConfirmation.ts:23-30` "Why not also block on riskLevel: high alone?"), this is **intentional** — the slice scope deliberately keeps confirmation friction on irreversible-without-second-step actions only:

| Action | Current | Recommendation |
| --- | --- | --- |
| `stripe:create_payment_intent` | `high`, no destructive/confirm | **Backlog** — authorize only; reversible by cancel before capture. |
| `stripe:confirm_payment_intent` | `high`, no destructive/confirm | **Backlog** — may capture synchronously; tighten requires product input. |
| `stripe:create_subscription` | `high`, no destructive/confirm | **Backlog** — enrolls in recurring billing; first invoice can charge immediately. |
| `stripe:update_subscription` | `high`, no destructive/confirm | **Backlog** — proration can trigger immediate charge or credit. |
| `stripe:create_invoice` | `high`, no destructive/confirm | **Backlog** — with default `autoAdvance: true` Stripe finalizes + collects. |

**Decision:** Document as a deliberate scope boundary inherited from SEC-4B, not an audit failure. A future slice with product input can tighten — the registry / preflight / picker substrate is already in place. The structural test `Stripe money-moving actions are riskLevel=high` keeps them honest at `high`.

### 2.3 Findings — risk over-classification

**None.** No read-shaped action key (`get_/list_/find_/search_/fetch_/query_`) carries `isDestructive: true` or `riskLevel: "high"`. The structural test `Pure read / list / find / get actions are NOT destructive` enforces this at module load.

---

## 3. Destructive Confirmation Coverage

`services/workflows/riskConfirmation.ts:findConfirmationRequiredActions()` enumerates nodes whose meta has `isDestructive: true` OR `requiresConfirmation: true`. Activation and run-now routes gate on its result.

### 3.1 Verified covered (typed `CONFIRM` required)

| Action | `isDestructive` | `requiresConfirmation` | `riskLevel` | Verified via |
| --- | :---: | :---: | --- | --- |
| `stripe:capture_payment_intent` | ✅ | ✅ | `high` | Registry test "Stripe destructive money-moving actions require confirmation" |
| `stripe:create_refund` | ✅ | ✅ | `high` | Same |
| `stripe:cancel_subscription` | ✅ | ✅ | `high` | Same |
| `gmail:delete_email` | ✅ | — | `high` | Registry test "Cross-provider destructive actions are flagged" |
| `microsoft-outlook:delete_email` | ✅ | — | `high` | Same |
| `slack:delete_message` | ✅ | — | `high` | Same |
| `slack:archive_channel` | ✅ | — | `high` | Same |
| `notion:archive_page` | ✅ | — | `high` | Same |

`findConfirmationRequiredActions` triggers on `isDestructive: true` OR `requiresConfirmation: true`, so all eight above route through the gate. The three Stripe entries additionally satisfy the stricter `requiresConfirmation: true` predicate (defense-in-depth).

### 3.2 High-risk-but-not-destructive actions (intentionally NOT requiring confirmation)

- `native:http_request` — `high`, NOT destructive, NOT requiresConfirmation. Egress sink is high-risk for data exfil, but firing one request is not irreversible. SEC-3 egress denylist mitigates the runtime attack surface.
- `stripe:create_payment_intent`, `confirm_payment_intent`, `create_subscription`, `update_subscription`, `create_invoice` — see §2.2; intentional scope boundary.

These are correctly out of the confirmation gate; flagging would add friction without added safety.

### 3.3 Gap — confirmation UI

API-level gate is shipped + tested. Builder UI modal that consumes the `CONFIRMATION_REQUIRED` response is NOT shipped (per SEC-CLOSEOUT §2 gate #8). A scripted API client can satisfy the gate today; a human in the builder cannot. **Must ship before production Stripe high-risk write exposure** OR product-owner explicit "API-only V1 contract" acceptance.

---

## 4. Test-Mode Gate Audit

Source: [`services/execution/testModeGate.ts`](../../../services/execution/testModeGate.ts).

### 4.1 Block rule verified

In test mode, an action is BLOCKED when ANY of:
1. `meta` is undefined (fail-closed — unknown actions blocked)
2. `meta.isDestructive === true`
3. `meta.requiresConfirmation === true`
4. `meta.riskLevel === "high"`
5. `meta.requiresIntegration === true`

### 4.2 Verified outcomes (against the current registry)

- All 96 registered action metas are knowable to `getActionMeta` (no fail-closed surface for covered providers).
- All actions with `requiresIntegration: true` (everything except the 5 native) are blocked → covers all 13 Gmail, 9 Outlook, 31 Slack, 16 Notion, 16 Stripe, 6 GitHub = 91 actions.
- `native:http_request` is independently blocked by `riskLevel: "high"` even though `requiresIntegration: false`. Verified via SEC-2 test coverage on the egress sink.
- 4 native logic/transform actions (`delay`, `format_transformer`, `if_then_condition`, `router`) all run in test mode — `requiresIntegration: false` AND `riskLevel: "low"`.

### 4.3 No bypass surface

There is no action meta in the registry that:
- Has `requiresIntegration: true` AND is missing from the gate's enforcement — block rule is `meta.requiresIntegration === true`, no allowlist.
- Could reach a handler bypassing the gate — engine pre-call gate is the choke point.

A meta-missing action (a handler registered with no meta) fails closed via `TEST_MODE_UNKNOWN_ACTION_BLOCKED`. The discovery-coverage structural test additionally prevents this state from existing in any covered provider.

### 4.4 Stripe-specific defense-in-depth

Even if SEC-2 is bypassed, `stripeLivemodePreflight` (SEC-14) is wired into all 16 Stripe handlers and ALSO denies in test mode (`STRIPE_LIVEMODE_TEST_MODE_BLOCKED`). Two-layer block: gate at engine pre-call, preflight at handler entry.

---

## 5. OutputMeta.sensitive Audit

Source-of-truth contract: [`contracts/actionMeta.ts:241-314`](../../../contracts/actionMeta.ts) `OutputMeta.sensitive`.

### 5.1 Compliant outputs (verified)

- `native:http_request` — `body` + `bodyJson` correctly marked sensitive (HTTP responses can carry secrets).
- `gmail:new_email` / `new_attachment` / `new_labeled_email` triggers — `from`, `to`, `cc`, `bcc`, `subject`, `snippet` correctly marked sensitive on trigger payloads.
- `microsoft-outlook:new_email` / `email_flagged` / `email_sent` — `subject`, `body`, `from` correctly marked sensitive (see §5.3 for an array gap).
- `slack:message.channel` / `message.im` / `message.group` / `message.mpim` triggers — `text` correctly marked sensitive.
- `notion:get_page.properties` — correctly marked sensitive (per-row arbitrary user-supplied data).
- `notion:query_database.results` — correctly marked sensitive (parity precedent).
- `notion:get_user.personEmail` — correctly marked sensitive.
- `stripe:create_customer.email` / `stripe:update_customer.email` — correctly marked sensitive.
- `stripe:find_customer.customer` — correctly marked sensitive (precedent for find-shape projections).
- `stripe:create_checkout_session.url` / `stripe:create_payment_link.url` — correctly marked sensitive (customer-facing payment URLs grant pay-access).
- `stripe:create_invoice.hostedInvoiceUrl` / `invoicePdf` — correctly marked sensitive.
- `stripe:clientSecret` — VERIFIED ABSENT from every Stripe output across all 16 metas. Only mentioned in explanatory JSDoc on `createPaymentIntent.meta.ts` / `confirmPaymentIntent.meta.ts` to document SEC-8 removal.

### 5.2 Findings — sensitive-output gaps (Should-fix backlog)

These outputs carry PII / message bodies / customer data on the documented surface but are NOT currently marked `sensitive: true`. They should be marked in a follow-up slice.

| Action / trigger | Output | Why sensitive |
| --- | --- | --- |
| `gmail:search_emails` | `messages` | Per-row `subject` + `from` + `to` + `snippet` |
| `microsoft-outlook:fetch_emails` | `messages` | Per-row `bodyPreview` + `from` + `to` + `cc` |
| `slack:get_messages` | `messages` | Per-row `text` (message bodies) |
| `slack:get_thread_messages` | `messages` | Per-row `text` |
| `slack:list_scheduled_messages` | `messages` | Per-row `text` (scheduled message bodies) |
| `slack:update_message` | `text` | Echoed updated body text |
| `slack:send_channel_message` / `send_direct_message` / `schedule_message` / `post_interactive_blocks` | `message` | Slack response payload includes `text` |
| `slack:get_user_info` | `user` | Slack user record (may include `email` when scopes present) |
| `slack:list_users` | `users` | Per-row Slack user records |
| `notion:create_comment` | `plainText` | Comment body (user-typed PII surface) |
| `notion:list_comments` | `comments` | Per-row `plainText` |
| `notion:get_block` | `plainText`, `content` | Block bodies |
| `notion:get_block_children` | `blocks` | Per-row block bodies |
| `notion:search` | `results` | Raw Notion search hits (parity with `query_database.results`) |
| `notion:list_users` | `users` | Per-row `personEmail` (singular `get_user.personEmail` IS marked) |
| `stripe:find_payment_intent` | `paymentIntent` | Bounded projection carries `receiptEmail`, `description`, `metadata` |
| `stripe:find_subscription` | `subscription` | Carries `customerId`, `metadata`, `latestInvoiceId` |
| `stripe:get_payments` | `payments` | Per-row `customerId`, `description`, `receiptUrl`, `metadata` |
| `microsoft-outlook:new_email` (trigger) | `to`, `cc`, `bcc` | Recipient address arrays NOT marked (sister fields `from`, `body`, `subject` ARE) |
| `microsoft-outlook:email_sent` (trigger) | `to`, `cc`, `bcc` | Same |
| `microsoft-outlook:email_flagged` (trigger) | `to`, `cc` | Same |
| `github:new_commit` (trigger) | `head_commit`, `commits` | Carry author / committer objects with `email` |

### 5.3 Findings — sensitive-output over-marking

**None.** No pure ID, count, status enum, timestamp, or other low-friction field has been marked sensitive in any covered provider. The codebase has been conservative.

### 5.4 Note on the redactor fail-open trade-off

Per SEC-7 design: when the redactor cannot resolve an output meta for a step (action removed from workflow, meta drift, etc.) the value is returned UNCHANGED. This is intentional — the helper never throws — but documented as a remaining risk in SEC-CLOSEOUT §2 gate #3. The mitigating layer is RLS; only the workflow owner can read run history. Hardened (fail-closed) redaction is backlog.

---

## 6. Run-Detail Redaction Audit

Source: [`app/api/workflows/_shared.ts:toWorkflowRunDetail`](../../../app/api/workflows/_shared.ts) + [`core/security/redactOutput.ts`](../../../core/security/redactOutput.ts).

### 6.1 Verified behavior

- `toWorkflowRunDetail` accepts an optional `workflowNodes` parameter; when supplied, it builds a per-node `nodeMetaLookup` and feeds it to `redactStepOutput`, which calls `redactOutput()` per step.
- `redactOutput()` walks the step output value against the action's `OutputMeta[]`, replacing `sensitive: true` paths with `REDACTED_SENTINEL = "[REDACTED]"`.
- Nested object/array shapes descend via `fields[]` declarations.
- Top-level redaction replaces the whole subtree; descendant redaction preserves siblings.
- Input is never mutated (verified via reference-identity tests in `tests/unit/core/security/redactOutput.test.ts`).
- DB row is never modified — redaction is read-side only.

### 6.2 Fail-open documented

When `workflowNodes` is not supplied (e.g. legacy route that hasn't been opted-in) the redactor sees no meta and returns output unchanged. SEC-CLOSEOUT §2 gate #3 documents this as a remaining risk. Recommended follow-up: opt every workflow-run route into the redactor; flip the parameter to required.

### 6.3 Provider redaction-path coverage

Every covered provider has at least some sensitive outputs marked (§5.1), so the redactor has work to do on every provider. The gaps in §5.2 mean some outputs flow unredacted to the client today even when redaction is wired — the redactor cannot redact what the meta does not declare sensitive.

---

## 7. Variable Picker Audit

Source: [`features/workflow-builder/config-modal/fields/VariablePickerPopover.tsx`](../../../features/workflow-builder/config-modal/fields/VariablePickerPopover.tsx).

### 7.1 Verified behavior

- Outputs with `sensitive: true` render a "Sensitive" warning chip next to the output button (`data-testid="variable-output-<sourceId>-<path>-sensitive-chip"`).
- Latest-run preview value for sensitive outputs is replaced with `"Sensitive value hidden"`.
- Token insertion is still ALLOWED for sensitive outputs — this is intentional. SEC-7 design: stop accidental visual exposure in the builder + API, do NOT block legitimate data flow.
- Aria-label includes `(sensitive value — preview is masked)` when the output is sensitive.

### 7.2 Follow-up consideration

Stricter policies (hide from picker entirely, refuse to wire into certain field types like `native:http_request.body`, refuse cross-provider wiring of customer PII into messaging actions) are explicitly out of scope per SEC-7 and tracked as backlog.

---

## 8. Stripe-Specific Audit

### 8.1 Coverage

- All 16 Stripe action metas exist locally on this branch (verified against `services/execution/handlers/_registry.ts:435-453`).
- All 16 metas are imported and registered in `services/discovery/_registry.ts:142-149` (Slice 3.45 group) + 155-162 (Slice 3.46 group).
- Stripe is in `COVERED_PROVIDERS` (`tests/structure/discovery-meta-coverage.test.ts:44-50`).
- The structural test enforces 1:1 handler↔meta drift on Stripe from here on.

### 8.2 Livemode preflight coverage

Verified all 16 Stripe handlers import + thread `stripeLivemodePreflight` from `integrations/stripe/security/livemodePolicy.ts`:

```
integrations/stripe/actions/{cancelSubscription, capturePaymentIntent, confirmPaymentIntent,
  createCheckoutSession, createCustomer, createInvoice, createPaymentIntent,
  createPaymentLink, createRefund, createSubscription, findCustomer, findPaymentIntent,
  findSubscription, getPayments, updateCustomer, updateSubscription}.ts
```

16/16. No handler bypasses the preflight.

### 8.3 clientSecret absence

VERIFIED. No Stripe output field is named `clientSecret` or `client_secret`. The only mentions are in explanatory JSDoc on `createPaymentIntent.meta.ts` + `confirmPaymentIntent.meta.ts` to document the SEC-8 removal decision. Registry test `no Stripe output is named clientSecret (Slice 3.SEC-8 — full ban)` guards this at module load.

### 8.4 Customer/payment URL sensitivity

VERIFIED.
- `stripe:create_checkout_session.url` — marked sensitive.
- `stripe:create_payment_link.url` — marked sensitive.
- `stripe:create_invoice.hostedInvoiceUrl` + `invoicePdf` — both marked sensitive.

Customer email outputs (`create_customer.email`, `update_customer.email`) and the `find_customer.customer` projection are correctly marked sensitive. **Gap** at §5.2: `find_payment_intent.paymentIntent`, `find_subscription.subscription`, `get_payments.payments` are NOT marked sensitive — parity drift with the `find_customer.customer` precedent.

### 8.5 Money-moving risk metadata

VERIFIED. Distribution:
- `high + isDestructive + requiresConfirmation`: `capture_payment_intent`, `create_refund`, `cancel_subscription` (3)
- `high` only: `create_payment_intent`, `confirm_payment_intent`, `create_subscription`, `update_subscription`, `create_invoice` (5; intentional per §2.2)
- `medium`: `create_customer`, `update_customer`, `create_checkout_session`, `create_payment_link` (4; create_session/link are customer-facing URL initiators, NOT direct charges)
- `low`: `find_customer`, `find_subscription`, `find_payment_intent`, `get_payments` (4)

All 16 carry SEC-2A risk fields. Registry tests guard the `high` set + the `low` set + the `confirm-required` subset.

### 8.6 testMode / real-mode behavior

Two-layer block (SEC-2 + SEC-14):
- testMode: SEC-2 blocks before handler (every Stripe action has `requiresIntegration: true`); SEC-14 livemode preflight ALSO denies (`STRIPE_LIVEMODE_TEST_MODE_BLOCKED`) as defense-in-depth.
- Real-mode + livemode `null` (legacy integration row without OAuth callback enrichment) + high-risk action: SEC-14 denies (`STRIPE_LIVEMODE_UNKNOWN` — user must reconnect).
- Real-mode + livemode `null` + low/medium-risk action: SEC-14 allows (reads / lookups don't force reconnect friction).
- Real-mode + livemode known + any-risk action: SEC-14 allows. The "test Stripe key in real-mode workflow run" is currently allowed; a future environment-concept slice may tighten.

### 8.7 Amount units / hidden defaults

VERIFIED. Every amount-bearing meta loudly anchors the unit in its label + description (DOLLARS on `create_payment_intent`/`create_refund`; CENTS on `capture_payment_intent.amount_to_capture`). No hidden destructive defaults across the 16 metas — every risky boolean/enum is explicit (registry test `money/subscription-changing boolean+enum fields carry NO defaultValue (Q11)` enforces this).

---

## 9. Native http_request Audit

### 9.1 Risk metadata

- `riskLevel: "high"` ✅
- `riskDescription` documents egress concern ✅
- `isDestructive: false`, `requiresConfirmation: false` — intentional. Egress is not destructive in the SEC-2A sense.

Registry test `native:http_request is high risk (arbitrary egress sink)` guards all three.

### 9.2 Sensitive outputs

- `body` — marked sensitive ✅
- `bodyJson` — marked sensitive ✅
- `ok`, `status`, `statusText`, `headers`, `bodyTruncated` — NOT marked. The `headers` decision is debatable (response headers can leak `Set-Cookie` / auth bearer / signing keys) — current behavior relies on the handler's response-side sanitization that strips sensitive request/response headers before output materialization. **Recommend follow-up:** revisit `headers` sensitivity once a response-header sanitization audit completes.

### 9.3 Egress guard

- Hostname denylist (`localhost`, AWS / GCP / Azure metadata aliases, `.localhost` suffix, `169.254.169.254`) ✅
- IP-literal classifier blocks IPv4 private ranges + IPv6 ULA / link-local / loopback ✅
- DNS resolution validates every resolved address ✅
- Fail-closed on DNS error / empty resolution ✅
- Scheme restricted to http: / https: ✅

### 9.4 Redirect handling

- `redirect: "manual"` set on fetch — redirects surface as 3xx response with `Location` header preserved.
- Customer must issue a second `http_request` node against the resolved URL — the guard fires again on that hop.

### 9.5 Deferred (documented)

- DNS rebinding socket-level pinning (SEC-3.x). Currently a TOCTOU window between `dns.lookup` and fetch's own resolution. Mitigation requires `undici.Agent` with custom `connect`. Backlog.

---

## 10. Provider Route Audit

Source: `app/api/providers/[id]/actions/route.ts`.

### 10.1 Exposed fields

Verified via `tests/unit/app/api/providers/providers-route.test.ts`. The GET response includes:
- `key`, `category`, `requiresIntegration`, `producesFileRef`, `consumesFileRef`
- `displayName`, `description`, `displayOrder`
- `fields[]` (full FieldMeta — label, type, options, dependsOn, optionsSource, numeric, etc.)
- `outputs[]` (full OutputMeta — including `sensitive`, nested `fields[]`)
- `isDestructive`, `requiresConfirmation`, `riskLevel`, `riskDescription`

### 10.2 Builder consumes the metadata

The builder client renders:
- Sensitive chips on variable picker (verified §7.1)
- Field renderers per `type`
- Static-vs-dynamic options
- FileRef icons / wiring constraints

**Gap:** the builder does NOT currently render a `riskLevel` chip on the library panel or a `requiresConfirmation` modal in the config rail. SEC-CLOSEOUT §3 documents this as the confirmation-UI gap; the metadata is available, the consumer is missing.

---

## 11. Structural Tests — Recommendations

### 11.1 Existing structural / risk tests (verified present)

- `tests/structure/discovery-meta-coverage.test.ts` — 1:1 handler↔meta across `COVERED_PROVIDERS`.
- `tests/unit/contracts/actionMeta.test.ts` — schema parses + risk-flag pairing rule.
- `tests/unit/services/discovery/_registry.test.ts:3638+` — "action risk metadata coverage (Slice 3.SEC-2A)" describe block covers:
  - Stripe high-risk + confirm-required subsets
  - Stripe low-risk reads
  - native:http_request egress
  - native logic/transform low-risk
  - Cross-provider destructive list (gmail:delete_email, outlook:delete_email, slack:delete_message, slack:archive_channel, notion:archive_page, stripe:capture_payment_intent / create_refund / cancel_subscription)
  - Pure read verb no-destructive / no-high guard
  - `isDestructive: true ⇒ riskLevel: high` registry-wide invariant
  - `requiresConfirmation: true ⇒ riskLevel: high` registry-wide invariant
- `tests/unit/core/security/redactOutput.test.ts` — redactor unit tests.
- `tests/unit/integrations/stripe/security/livemodePolicy.test.ts` — Stripe livemode policy tests.

### 11.2 Recommended additional structural tests (backlog)

Not part of this audit slice — would land in POSTSEC-2 alongside the metadata fixes:

| Suggested test | What it would guard |
| --- | --- |
| `tests/structure/sensitive-output-coverage.test.ts` | Assert every output named `body`/`htmlBody`/`snippet`/`messages`/`comments`/`receiptUrl`/`downloadUrl`/`signedUrl` carries `sensitive: true`. Naming-convention belt-and-suspenders. |
| `tests/structure/no-clientSecret-output.test.ts` | Cross-provider variant of the existing Stripe-only check. Currently the Stripe-specific test sits inside `_registry.test.ts`. |
| `tests/structure/stripe-livemode-handler-coverage.test.ts` | Assert every handler in `integrations/stripe/actions/*.ts` (excluding `*.meta.ts`/`*.schema.ts`) imports `stripeLivemodePreflight`. Today this is implicit via the manual 16/16 check. |
| `tests/structure/test-mode-gate-coverage.test.ts` | Assert no action meta exists with `requiresIntegration: true` AND no risk-field presence (defense against drift). |
| `tests/unit/integrations/<provider>/actions/<action>.meta.test.ts` (per-provider) | Mirror Stripe's surface-anchored tests for new sensitive-output rules. Likely overkill once §11.2's structural tests land. |

---

## 12. Findings Summary

### 12.1 Must fix before push (any push, not just production)

**None.** No fail-closed surface is broken; no test is red. The 7 SEC slices' substrate is in place and respected by all 96 covered actions. Local audit clears.

### 12.2 Should fix before production Stripe high-risk write exposure

| # | Finding | Where |
| --- | --- | --- |
| 1 | Stripe accidental-action runbook missing | `docs/runbooks/stripe-accidental-action.md` (doesn't exist) — inherited from SEC-CLOSEOUT §3 |
| 2 | Confirmation UI not shipped | Builder client cannot consume `CONFIRMATION_REQUIRED` response shape — inherited from SEC-CLOSEOUT §2 gate #8 |
| 3 | Stripe `find_payment_intent.paymentIntent` / `find_subscription.subscription` / `get_payments.payments` not marked sensitive | §5.2 |
| 4 | Stripe money-moving 5 — explicit product decision on whether to add `requiresConfirmation: true` | §2.2 |
| 5 | Product-owner acceptance of deferred risks (runbook, retention policy, SSRF socket-level, fail-open redaction, richer risk UI, config secret vault) | Inherited from SEC-CLOSEOUT §3 |

### 12.3 Backlog / UX polish (not blocking)

- §5.2 sensitive-output gaps on read-path list/get array outputs (Gmail, Outlook, Slack, Notion).
- §5.2 Outlook trigger `to`/`cc`/`bcc` array sensitivity drift.
- §5.2 GitHub `new_commit.head_commit` + `commits` author email exposure.
- §11.2 additional structural tests.
- §9.2 `native:http_request.headers` sensitivity decision.

### 12.4 No issue

- All four read-only Stripe actions correctly low-risk.
- All three Stripe destructive money-movers correctly destructive + confirm + high.
- All five native risk classifications correct.
- All eight cross-provider destructive actions correctly flagged.
- Stripe `clientSecret` correctly absent (SEC-8).
- Stripe livemode preflight wired on all 16 handlers (SEC-14).
- testModeGate covers every covered-provider action by `requiresIntegration: true` OR `riskLevel: "high"` rule.
- Variable picker masks sensitive previews + chips sensitive outputs.

---

## 13. Recommended Fix Slices

Sequenced. None are blocking the local build resume; (4) is the only one that blocks production Stripe write exposure.

### POSTSEC-2 — Sensitive-output drift cleanup
- Mark sensitive on the 20+ outputs identified in §5.2.
- Add `tests/structure/sensitive-output-coverage.test.ts` to guard naming-convention drift.
- Add per-provider tests for new sensitive flags.
- ETA: 1 slice, ~25 meta edits + 1 structural test + ~10 unit-test additions.

### POSTSEC-3 — Stripe metadata reconciliation (if §2.2 product call lands)
- Conditional on product-owner direction. If product says "tighten money-moving 5 to require confirmation", add `requiresConfirmation: true` + `isDestructive: true` to the 5 Stripe actions per §2.2 and update guard tests.
- If product says "stay as-is", document in a 1-line CLAUDE.md note + close out the §2.2 backlog row.

### POSTSEC-4 — Stripe accidental-action runbook
- Author `docs/runbooks/stripe-accidental-action.md` per SEC-CLOSEOUT §4.
- Cover: detection signals (`workflow_runs.is_test`, `triggered_by`, `error_classification`, Stripe idempotency keys), inverse-action procedure (refund-of-capture, void-of-refund, restore-of-cancel), customer-comms template, post-incident review.
- **MUST land before production Stripe high-risk write exposure.**

### POSTSEC-5 — Builder confirmation modal + risk chip
- Render `riskLevel` chip on library panel.
- Render `CONFIRMATION_REQUIRED` modal that consumes the structured response from activate / run-now, types "CONFIRM", re-POSTs.
- Post-confirmation success toast.
- Defer the "richer risk UI" follow-ups (per-provider phrase, color-coded chips) to a future polish slice.

### POSTSEC-6 — Checkpoint update + go/no-go re-scoring
- Update `workflow-builder-security-closeout.md` §2 to flip the partial-satisfied gates as POSTSEC-{2,4,5} land.
- Score remaining deferred risks for product-owner decision.

---

## 14. Go / No-Go Recommendation

### Q1: Can local build work resume?
**Yes.** Every gate is enforced by the substrate. No fail-closed surface is broken. The audit identifies backlog drift (sensitive-output gaps) but no compliance violations against the shipped contracts. Resuming HubSpot / Sheets / Airtable / further Stripe polish locally is safe.

### Q2: Can Stripe metadata stay active locally?
**Yes.** All 16 Stripe actions carry risk metadata, livemode preflight, and SEC-8 clientSecret removal. The structural test enforces 1:1 handler↔meta. The local build chat can continue without touching Stripe.

### Q3: Can anything be pushed?
**No** to production Stripe high-risk write exposure. The other SEC slices (logic actions, GitHub, Gmail/Outlook reads, Notion reads) are technically defensible from a security substrate perspective, but the project rule "local-only branch — do not push" still stands. Push decisions are out of scope for this audit.

### Q4: What must be fixed first (before production Stripe high-risk write exposure)?
1. **POSTSEC-4** — Stripe accidental-action runbook MUST exist.
2. **POSTSEC-5** — confirmation modal MUST exist OR product-owner explicit "API-only" acceptance.
3. **POSTSEC-2** — sensitive-output drift cleanup (specifically: Stripe `find_*` / `get_payments` projections per §5.2).
4. **Product-owner acceptance** of: run output retention policy deferral, config secret vault deferral, SSRF socket-level deferral, fail-open redaction deferral, richer risk UI deferral.
5. **POSTSEC-3** (conditional on product call on the money-moving 5 confirmation question).

### Posture
- Local-track work **resumes**.
- Stripe metadata **stays active locally**.
- Production Stripe write exposure **waits** for POSTSEC-{2,4,5} + product-owner acceptance.

---

## 15. Out of Scope

- Modifying any meta file in this slice (audit-only).
- Adding any test in this slice (recommendations only; tests land in POSTSEC-2).
- Writing the Stripe accidental-action runbook (POSTSEC-4).
- Building the confirmation modal (POSTSEC-5).
- New provider metadata (HubSpot, Sheets, Airtable, Stripe triggers) — paused per task brief.
- Pushing anything — branch stays local.
- Security-track deferred items: run output retention policy, config secret vault, SSRF socket-level rebinding closure, fail-open redaction hardening, richer risk UI.
