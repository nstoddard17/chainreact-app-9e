# Runbook — Stripe Accidental Action Response

**Slice:** 3.POSTSEC-4.
**Status:** Documentation only. Required reading before production Stripe high-risk write exposure.
**Date:** 2026-05-23.
**Pairs with:** [`docs/slices/security/workflow-builder-security-closeout.md`](../slices/security/workflow-builder-security-closeout.md) (gate #7 of the SEC-1 no-go criteria), [`docs/slices/security/completed-metadata-security-compliance-audit.md`](../slices/security/completed-metadata-security-compliance-audit.md) (POSTSEC-1 §13 POSTSEC-4 line item).

---

## 1. Purpose & Scope

This runbook tells the on-call responder what to do when a ChainReact workflow accidentally fires a Stripe action against a live (or test) Stripe account, and the action's effect is unintended.

**In scope** (all 16 registered Stripe action handlers, prioritized by blast radius):

| Action | Money-moving? | Reversible? |
| --- | --- | --- |
| `stripe:create_payment_intent` | Authorizes a charge | Cancel before capture |
| `stripe:confirm_payment_intent` | Triggers the actual charge attempt | Cancel before capture, OR refund after |
| `stripe:capture_payment_intent` | Settles funds into merchant account | Only via refund |
| `stripe:create_refund` | Returns funds to customer | Generally NOT reversible |
| `stripe:create_subscription` | Starts recurring billing | Cancel + (possibly) refund |
| `stripe:update_subscription` | Modifies billing / proration | Reverse the update; proration may stick |
| `stripe:cancel_subscription` | Stops recurring billing | Re-create subscription if needed |
| `stripe:create_checkout_session` | Generates a hosted payment URL | Expire / deactivate; refund if paid |
| `stripe:create_payment_link` | Generates a reusable hosted payment URL | Deactivate; refund any payments |
| `stripe:create_invoice` | May queue collection (autoAdvance) | Void invoice if still draft/open; refund if paid |
| `stripe:create_customer` | Creates billing identity | Delete or anonymize metadata |
| `stripe:update_customer` | Mutates billing identity | Restore prior values from Stripe Dashboard history |
| `stripe:find_customer` | Read-only | n/a |
| `stripe:find_payment_intent` | Read-only | n/a |
| `stripe:find_subscription` | Read-only | n/a |
| `stripe:get_payments` | Read-only | n/a |

**Out of scope:** non-Stripe accidental actions (email/Slack/Notion/etc.) — covered separately. Read-only Stripe actions (`find_*` / `get_payments`) are not actionable here; they cannot cause customer impact.

---

## 2. Severity Classification

Pick the severity that matches the WORST observed outcome (not the one that matches your hopes).

### SEV-1 — Customer money impact in live mode
- A charge captured against a real customer card.
- A refund issued in error.
- A subscription cancelled or proration applied across multiple customers.
- Any other live-mode action with observable customer financial impact.

**Response:** page on-call + security lead immediately. Halt the workflow. Move to §3 then the specific action section in §4.

### SEV-2 — Live-mode action without immediate customer money movement
- A PaymentIntent created but not confirmed/captured.
- A Checkout Session / Payment Link / Invoice created but unused.
- A subscription updated with limited impact (one customer, no immediate proration charge).
- A customer record mutated with limited PII impact.

**Response:** notify owner + admin within 1 business hour. Halt the workflow. Move to §3 + §4.

### SEV-3 — Test-mode or zero-customer-impact event
- All actions where `account_metadata.livemode === false` (Stripe test account).
- Live-mode action whose effect was fully reversed before any customer touched it (e.g. PaymentIntent created and canceled in the same workflow run; no notification fired).

**Response:** log the incident, perform §3 capture, schedule §8 post-incident review. No customer-comms needed.

Default upward when uncertain — a SEV-2 mis-classified as SEV-3 wastes time later; the reverse causes customer harm.

---

## 3. Immediate Response Checklist (first 15 minutes)

Do these in order. Don't skip; don't re-order.

1. **Stop the workflow.** Hit `POST /api/workflows/{id}/deactivate` (admin) OR toggle from the builder. Confirms no new runs enqueue.
2. **Confirm Stripe mode.** Check `integrations.account_metadata.livemode` for the workflow's Stripe integration row.
   - `true` → live customer impact possible. Treat as SEV-1 / SEV-2 by default.
   - `false` → test mode. Likely SEV-3.
   - `null` → unknown. Treat as live until proven otherwise; the SEC-14 livemode policy should have refused high-risk writes in this state, but verify the run's `error_classification`.
3. **Identify the run.** Pull from `workflow_runs`:
   - `id` (run id)
   - `workflow_id`
   - `triggerNodeId`
   - `triggerEvent` (envelope only — do NOT copy `payload.inputs` content into chat)
   - `steps[].nodeId` for the offending step
   - `steps[].output` (run-detail API redacts sensitive outputs; raw DB read MAY include unredacted; treat as confidential)
   - `is_test`
   - `triggered_by` (`manual` / `test` / `scheduled` / `webhook` / `retry`)
   - `started_at`, `finished_at`
   - `error_classification` (if non-null)
4. **Identify the workflow + actor.**
   - `workflows.id` and `name`
   - `workflows.user_id` (owner)
   - The user who triggered the run — for `triggered_by: 'manual'` / `'test'` cross-reference `workflow_runs.id` with whoever invoked the run-now / activate endpoint.
5. **Identify Stripe object IDs.** Read the step's `output` for the canonical id field:
   - `paymentIntentId` (`pi_xxx`), `chargeId` (`ch_xxx`), `refundId` (`re_xxx`), `subscriptionId` (`sub_xxx`), `invoiceId` (`in_xxx`), `sessionId` (`cs_xxx`), `paymentLinkId` (`plink_xxx`), `customerId` (`cus_xxx`).
   - Stripe also exposes `created` (Unix epoch) and `livemode` on most projections — capture both.
6. **Capture evidence.**
   - Run id, workflow id, node id, action key (`stripe:<type>`), Stripe object ids, timestamps, `triggered_by`.
   - Screenshots from the builder run-detail surface (these go through the SEC-7 redactor and are safe).
   - Stripe Dashboard event id (`evt_xxx`) for the relevant `payment_intent.*` / `charge.*` / `invoice.*` / `subscription.*` / `customer.*` event.
   - **Do NOT** copy raw config fields, raw provider responses, OAuth tokens, or card data into chat/tickets. Stripe object ids + run id + timestamps are sufficient.
7. **Do NOT delete evidence.** Don't remove the workflow row, don't truncate `workflow_runs`, don't `git rebase` to hide a config change. The post-incident review (§8) depends on this state.
8. **Escalate.**
   - SEV-1 → on-call engineer + security lead + product owner. Page everyone simultaneously.
   - SEV-2 → workflow owner + admin + security lead. Email/Slack within the hour.
   - SEV-3 → log only; queue for next-day review.
9. **If money moved (SEV-1):** open the Stripe Dashboard immediately on the affected `pi_xxx` / `re_xxx` / `in_xxx`. The dashboard's event timeline is authoritative; the workflow run record is corroborating.

---

## 4. Stripe Object-Specific Response

For each Stripe object touched, follow the matching subsection. Multiple objects may need parallel response.

### 4.1 PaymentIntent Created (`stripe:create_payment_intent`)
**What happened:** `POST /v1/payment_intents` returned a `pi_xxx` in an `requires_payment_method` / `requires_confirmation` state. **No money has moved yet.**

Steps:
1. Pull current state — `stripe payment_intents retrieve pi_xxx` OR check the Stripe Dashboard.
2. If status is `requires_payment_method` / `requires_confirmation` / `requires_action` → **safe to cancel.** `stripe payment_intents cancel pi_xxx` (or Dashboard "Cancel").
3. If status is already `succeeded` / `processing` → see §4.3 (captured) — money moved.
4. If status is `canceled` already → confirm the cancel was YOU, not the customer (avoid double-action). Document the timing.

**Customer impact threshold:** none unless status progressed to `succeeded`. Severity stays SEV-2.

### 4.2 PaymentIntent Confirmed (`stripe:confirm_payment_intent`)
**What happened:** `POST /v1/payment_intents/{id}/confirm` triggered the real charge attempt. State depends on the intent's capture method.

Steps:
1. Retrieve the PaymentIntent.
2. If status is `requires_capture` (intent created with `capture_method: manual`, now authorized but uncaptured) → **safe to cancel.** Funds are released back to the customer.
3. If status is `succeeded` (auto-capture flow) → see §4.3 (captured) — money moved.
4. If status is `requires_action` (3D Secure / redirect pending) → cancel before the customer completes the action. Once they confirm, the charge proceeds.
5. If status is `requires_payment_method` (customer's first attempt failed) → cancel; the customer was not charged.

**Customer impact threshold:** SEV-1 only if status reached `succeeded`. Otherwise SEV-2.

### 4.3 PaymentIntent Captured (`stripe:capture_payment_intent`)
**What happened:** `POST /v1/payment_intents/{id}/capture` settled funds from authorization into the merchant account. **Money has moved.** SEV-1.

Steps:
1. Determine whether the customer was supposed to be charged. If yes (right customer, right amount, wrong workflow), document the discrepancy and decide whether to leave or refund.
2. If no (wrong customer, wrong amount, or no charge should have happened) → issue a refund. See §4.4.
3. Notify the customer per §7 before they see a statement-line item or chargeback.
4. Determine if a chargeback risk exists — the customer may dispute. Pre-empt with proactive comms.
5. Log: amount captured (CENTS in Stripe; convert to dollars for human comms), `pi_xxx`, `ch_xxx` (latest_charge id), customer id, timestamp.

### 4.4 Refund Created (`stripe:create_refund`)
**What happened:** `POST /v1/refunds` returned funds to the customer's card. **A refund is generally NOT reversible** — Stripe does not provide an "un-refund" API. SEV-1 unless the original charge was also incorrect.

Steps:
1. Retrieve the refund — `stripe refunds retrieve re_xxx`.
2. Note status: `succeeded`, `pending`, `failed`, `canceled`. Only `pending` is potentially recoverable (rare — most pending refunds settle within seconds).
3. Verify the refund amount against the original charge — partial vs full.
4. **Customer impact:**
   - If the refund went to a paying customer who is owed it → no action; document.
   - If the refund went to the WRONG customer or the WRONG amount → finance + customer support need to drive recovery (re-charge customer with their consent, or write off).
5. Notify finance immediately. Refunds affect bank reconciliation.
6. Notify the affected customer per §7.

### 4.5 Subscription Created (`stripe:create_subscription`)
**What happened:** `POST /v1/subscriptions` enrolled the customer in recurring billing. The first invoice may have been created (and possibly paid, depending on `payment_behavior`).

Steps:
1. Retrieve — `stripe subscriptions retrieve sub_xxx`.
2. Cancel the subscription if incorrect — `stripe subscriptions cancel sub_xxx`. Choose:
   - Immediate (`cancel_at_period_end: false`) → customer loses access NOW.
   - End-of-period (`cancel_at_period_end: true`) → customer keeps paid time.
3. Check the latest invoice (`subscription.latest_invoice`). If paid (`status: 'paid'`), see §4.4 — refund the invoice.
4. Check whether the customer received the Stripe "subscription confirmation" email — they did if `payment_behavior` was anything except `default_incomplete`. Notify per §7.

### 4.6 Subscription Updated (`stripe:update_subscription`)
**What happened:** `POST /v1/subscriptions/{id}` mutated the subscription's price / quantity / proration / collection method / trial end / payment method. The next invoice may include a proration line item.

Steps:
1. Diff the change. Pull the subscription's current state and compare to what the workflow set:
   - `priceId` change → next invoice bills the new price.
   - `quantity` change → next invoice bills the new quantity.
   - `proration_behavior: 'always_invoice'` → an invoice fired IMMEDIATELY for the proration delta. Check `stripe invoices list --subscription sub_xxx --limit 5` for a fresh one.
   - `proration_behavior: 'create_prorations'` → proration is queued for the next regular invoice. Reversible by another update.
   - `cancel_at_period_end: true` → subscription is scheduled for cancellation. Reverse by setting `cancel_at_period_end: false`.
   - `trial_end` change → may have extended or ended a trial.
2. Decide whether the change should be reversed:
   - Reversible (next-period proration not yet billed): update the subscription back to prior state.
   - Hard to reverse (`always_invoice` already fired): refund the proration invoice per §4.4.
3. Document the final state.

### 4.7 Subscription Cancelled (`stripe:cancel_subscription`)
**What happened:** `DELETE /v1/subscriptions/{id}` cancelled the subscription. The customer loses access — immediately or at period end depending on `at_period_end`.

Steps:
1. Retrieve — `stripe subscriptions retrieve sub_xxx`. Confirm:
   - `status: 'canceled'` (immediate) OR `status: 'active'` + `cancel_at_period_end: true` (scheduled).
   - `canceled_at` timestamp.
   - `current_period_end` (when access ends if scheduled).
2. If scheduled (`cancel_at_period_end: true`) and incorrect → reverse by updating `cancel_at_period_end: false`. The customer keeps service uninterrupted.
3. If immediately canceled → **the subscription cannot be uncanceled.** Re-create via `stripe subscriptions create` with the same `customer`, `price`, `metadata` to restore service. The customer will NOT see a billing gap if the next billing cycle hasn't started, but the subscription id changes.
4. Check whether `invoice_now: true` was passed — if so, a final invoice was emitted for unbilled time. Review per §4.9.
5. Notify the customer per §7 if access was affected.

### 4.8 Checkout Session / Payment Link Created (`stripe:create_checkout_session`, `stripe:create_payment_link`)
**What happened:** Stripe generated a customer-facing hosted-payment URL. The URL is live and reachable by anyone who has it.

Steps:
1. **Determine if any payment occurred.**
   - Checkout Session: `stripe checkout sessions retrieve cs_xxx` → check `payment_status` (`paid` / `unpaid` / `no_payment_required`) and `status` (`open` / `complete` / `expired`).
   - Payment Link: `stripe payment_links retrieve plink_xxx` → check `active`. Use `stripe payment_intents list --customer cus_xxx` if you need to find PaymentIntents created via the link.
2. **If unused:**
   - Checkout Session: nothing to "delete" — sessions auto-expire after 24h. Optional: ignore or surface a "this link is no longer valid" page if the URL was published.
   - Payment Link: deactivate via `stripe payment_links update plink_xxx active=false`. Customers visiting the URL will see a Stripe error page.
3. **If paid → §4.4** — refund the underlying PaymentIntent.
4. If the URL was published externally (email blast, public page) — the published surface needs takedown too. Coordinate with whoever owns the publishing channel.

### 4.9 Invoice Created (`stripe:create_invoice`)
**What happened:** `POST /v1/invoices` created an invoice. With `auto_advance: true` (Stripe's default when omitted), Stripe automatically finalized it and queued collection.

Steps:
1. Retrieve — `stripe invoices retrieve in_xxx`. Read `status`:
   - `draft` → no customer-facing surface yet. Delete via `stripe invoices delete in_xxx` if appropriate (Stripe allows delete only on drafts).
   - `open` → finalized; customer-facing URL active (`hosted_invoice_url`, `invoice_pdf`). Void via `stripe invoices void in_xxx`. Customer sees a "voided" badge.
   - `paid` → money moved. Refund via §4.4 (refund the linked `charge`).
   - `uncollectible` → Stripe gave up collecting. Document; no further action.
   - `void` → already voided. Confirm timestamp.
2. If `collection_method: 'charge_automatically'` and customer has a default payment method, Stripe may have already attempted the charge → check `latest_charge` and treat as §4.3.
3. The hosted invoice URL + PDF URL stay valid until Stripe expires them (~30 days for voided). The redactor in run-history hides them from the run-detail API (per POSTSEC-2), but the URLs are LIVE on Stripe's edge — anyone with them can view the (now-voided) invoice.

### 4.10 Customer Created / Updated (`stripe:create_customer`, `stripe:update_customer`)
**What happened:** A Stripe customer record was created or mutated.

Steps:
1. Retrieve — `stripe customers retrieve cus_xxx`.
2. **Created in error:**
   - If no payment / subscription / invoice was linked: `stripe customers delete cus_xxx`. Stripe permits delete on customers without active subscriptions.
   - If linked objects exist: do NOT delete (Stripe will refuse anyway). Anonymize the metadata via `stripe customers update cus_xxx description="" email="" name=""` and document.
3. **Updated in error:**
   - Stripe doesn't store edit history beyond the most recent values. Check the Dashboard's event log for the `customer.updated` event to find the prior values.
   - Restore by calling `stripe customers update cus_xxx <fields>=<prior values>`.
4. Be careful with audit trail — Stripe events log every change. The audit trail is the source of truth, not the live customer object.

---

## 5. ChainReact System Response

In parallel with §4, drive the ChainReact side:

1. **Disable the workflow.** Deactivate via the admin route (`POST /api/workflows/{id}/deactivate`). This prevents further triggers from firing the same node.
2. **Preserve run history.** Do NOT delete `workflow_runs` rows. Run history is the forensic record.
3. **Export.** If the incident is SEV-1 / SEV-2, capture a JSON snapshot of:
   - The workflow row (`workflows.id`, `name`, `state`, `draftDefinition`, `activeRevisionId`)
   - The run row (`workflow_runs.*` for the offending run)
   - Adjacent runs (the previous 10 + next 10 runs by `started_at` for the same `workflow_id` — helps spot pattern vs one-off)
   - The integration row (`integrations.id`, `provider`, `account_metadata.livemode`, `account_metadata.stripe_user_id`) — token data is encrypted; **do NOT decrypt**.
4. **Review workflow config + node graph.**
   - Which node fired? What was its config (`workflow.draftDefinition.nodes[?].config`)?
   - What were the upstream triggers / data sources? Was a `{{...}}` reference resolved unexpectedly?
   - Was the action wired to a loop / branch / router that could have fanned out?
5. **Identify the trigger.**
   - `triggered_by`: `manual` (a human ran it) / `test` (test-mode Run-now) / `scheduled` (cron) / `webhook` (external event) / `retry` (engine-side retry).
   - For `manual`: who? Cross-reference the API gateway log.
   - For `scheduled` / `webhook` / `retry`: the originating signal needs review too — a malformed webhook payload or a cron mis-fire is a SEC-1 audit follow-up.
6. **Check `is_test`.**
   - `is_test: true` → run was test-mode. SEC-2 should have blocked the handler. If the Stripe object exists, that's a SEC-2 regression — escalate.
   - `is_test: false` → real-mode run. Expected for a SEV-1 / SEV-2 incident.
7. **Check confirmation records.**
   - Activation / Run-now requires typed `CONFIRM` for `isDestructive: true` OR `requiresConfirmation: true` actions (SEC-4B + POSTSEC-3). The API gateway log records the inbound `confirmationText` field. Verify the human confirmation actually happened — if a script/automation bypassed it, that's an auth concern.
8. **Check livemode policy result.**
   - SEC-14 `stripeLivemodePreflight` runs inside `refreshAndRetry` for every Stripe handler. A deny surfaces as `StripeLivemodePolicyError` with `reason: 'STRIPE_LIVEMODE_TEST_MODE_BLOCKED' | 'STRIPE_LIVEMODE_UNKNOWN' | 'STRIPE_LIVEMODE_MISMATCH'`.
   - Pull the run's `error_classification` and `steps[].error` — if the preflight denied and the action still fired, that's a SEC-14 regression. Page.
9. **Check sensitive-output redaction.**
   - The run-detail API redacts `OutputMeta.sensitive: true` fields per POSTSEC-2. Verify the offending run's API response (not the raw DB row) redacts customer email / payment URLs / find_* projections as expected. If the redactor did NOT fire on something it should, that's a POSTSEC-2 follow-up.

---

## 6. Data Handling

**Never paste into Slack / email / tickets / public docs:**
- OAuth tokens, refresh tokens, Stripe API keys (`sk_live_*`, `sk_test_*`, `rk_*`, `whsec_*`).
- Card details (PAN, CVV, expiry). Stripe never returns these; if you see them, something is very wrong.
- The contents of `integrations.account_metadata.access_token` (encrypted at rest; never decrypt outside the OAuth path).
- Raw step `output` blobs that contain customer email / payment URLs — use the run-detail API (which redacts) instead of the raw DB row.

**Acceptable to share:**
- Stripe object ids (`pi_xxx`, `cus_xxx`, `re_xxx`, etc.) — opaque on their own.
- ChainReact run id, workflow id, node id.
- Timestamps.
- Action key (`stripe:<type>`).
- Amounts in dollars (rounded; not exact cents unless finance asks).
- The customer's relationship to the merchant (e.g. "ENT customer #4 of Q4 cohort") rather than their email.

**PII scope:** treat customer email, name, billing address, phone as need-to-know. Limit distribution to finance, customer success, security, and on-call. Do not CC engineering-wide channels for SEV-1 / SEV-2 incidents.

**Stripe dashboard access:** restrict to the smallest practical set during incident response. Stripe logs every Dashboard view; the audit trail follows you.

---

## 7. Customer Communication

If customer impact exists (SEV-1, sometimes SEV-2), the customer needs to know. Stripe will surface the action on their card statement, payment receipt email, or hosted invoice page — beating them to it is much better than them noticing first.

**Always include:**
- Acknowledgement that something happened.
- A high-level description ("a billing change was made in error", "a charge was processed incorrectly").
- The corrective action you've already taken (refund issued, subscription restored, invoice voided).
- Apology / expected next step (refund ETA, contact for questions).

**Never include:**
- Internal workflow ids, node ids, action keys.
- Internal team names ("our automation team", "our billing AI").
- Stripe object ids unless the customer asks for support context.
- Technical root cause ("the workflow had a bug in the if-branch condition") — confuses customers and adds liability.
- Other affected customers' info.

**Short template — accidental charge + refunded:**

> Hi {first name},
>
> We made an error on our end that resulted in an incorrect charge of {$amount} to your card on {date}. We've already issued a full refund — you should see it in your account within 5–10 business days, depending on your bank.
>
> We're sorry for the inconvenience. If you have any questions or don't see the refund within 10 business days, please reply to this email or contact us at {support address}.
>
> Thanks for your patience,
> {Team / merchant name}

**Short template — accidental subscription change + restored:**

> Hi {first name},
>
> A change was made to your subscription in error. We've already restored it to its previous state — your billing cycle, plan, and payment date are unchanged.
>
> No action is needed on your part. If you'd like to confirm your current subscription details, you can view them at {customer portal URL}. Please reach out at {support address} if anything looks off.
>
> Thanks for your patience,
> {Team / merchant name}

For SEV-1 with broad impact (>1 customer), draft a single batched comms with the affected customer list — do NOT loop individual customer info between them.

---

## 8. Post-Incident Follow-Up

Within 1 business day for SEV-3, 1 business day for SEV-2, same-day for SEV-1.

### 8.1 Root-cause analysis

Answer in writing:

- **What action fired?** (action key, node id, run id)
- **Was confirmation present?** Did `findConfirmationRequiredActions` flag the workflow? Did the caller provide `confirmationText: "CONFIRM"`?
- **Was the workflow manually activated or automated?** (`triggered_by` field on the run)
- **Was `testMode` used correctly?** (`is_test` on the run)
- **Did livemode enforcement behave correctly?** Look at `stripeLivemodePreflight` outcome in the run's error trail.
- **Did sensitive-output redaction work?** Compare the run-detail API response with the raw DB `steps[].output`. The API should redact `sensitive: true` fields.
- **Was `native:http_request` involved?** If yes, did the SEC-3 egress denylist trigger on any host? (Probably not, but worth confirming for SEC-3 regressions.)
- **Was the action's risk metadata correct?** Did the meta declare the action as `requiresConfirmation: true` / `isDestructive: true` / `riskLevel: 'high'`? If not, that's a metadata follow-up.

### 8.2 Mandatory follow-ups

For every SEV-1 / SEV-2 incident, ship the following in the same week:

- **Regression test.** If the workflow or engine had a bug, add a unit/integration test that fails without the fix and passes with it. Land it BEFORE the fix on the same branch (Red → Green → Refactor).
- **Metadata correction.** If the action's risk classification was wrong, update the meta (e.g. flip `requiresConfirmation` to `true`) AND update the corresponding test pin in `tests/unit/services/discovery/_registry.test.ts`.
- **Workflow template change.** If a published template encouraged the dangerous pattern, update the template (or remove it) AND notify users who've cloned it.
- **Docs update.** If anything in this runbook was missing or wrong, update it. Date the change.

### 8.3 Post-mortem doc

Write a brief post-mortem (no longer than 1 page) covering:
- Timeline (5-minute resolution).
- Customer impact (count + dollar amount).
- Root cause (1-2 paragraphs).
- What the safety controls (SEC-2, SEC-4B, POSTSEC-3, SEC-14) did + didn't catch.
- Action items + owners + due dates.
- Lessons.

Store at `docs/postmortems/YYYY-MM-DD-stripe-{action}-{short-slug}.md`. Link from `docs/slices/security/workflow-builder-security-closeout.md` if it changes the closeout posture.

---

## 9. Preventive Controls Checklist

### 9.1 Controls currently in place
Verify each is functioning during post-incident review:

| Control | What it does | Slice |
| --- | --- | --- |
| Action risk metadata | Declares `isDestructive` / `requiresConfirmation` / `riskLevel` / `riskDescription` per action | SEC-2A |
| testMode gate | Engine short-circuits external handlers in test mode (fail-closed on missing meta) | SEC-2 |
| Stripe livemode enforcement | Per-handler preflight; denies in test mode + denies high-risk writes with unknown livemode | SEC-14 |
| `clientSecret` removal | Stripe PaymentIntent `client_secret` removed from workflow outputs | SEC-8 |
| Sensitive output redaction | Run-detail API + variable picker mask `OutputMeta.sensitive: true` values | SEC-7, POSTSEC-2 |
| Destructive + money-moving confirmation | Activate + Run-now require typed `CONFIRM` for `isDestructive: true` OR `requiresConfirmation: true` actions | SEC-4B, POSTSEC-3 |
| `native:http_request` egress denylist | First-tier SSRF guard; blocks private IPv4/IPv6 + cloud metadata endpoints | SEC-3 |
| Discovery-coverage CI guard | Every covered-provider handler MUST have an ActionMeta; reject drift | structural test |
| Sensitive-output structural guard | Suspicious output names fail the build without `sensitive: true` or allowlist | POSTSEC-2 |
| High-risk lifecycle audit events | Workflow owner receives an in-app notification of type `workflow_high_risk_activated` / `workflow_high_risk_run` when a destructive / requires-confirmation workflow is activated or really-run after typed confirmation. Visible at `/notifications`. Metadata is route-safe (workflow id + name, actor user, run id when applicable, the action descriptors, `triggeredBy`, `isTest`, timestamp — never config / IDs / resolved values). Use these as the FIRST early-warning signal when triaging an accidental-action report — they timestamp the moment of activation / live execution. | POSTSEC-8 |

### 9.2 Controls deferred to follow-up slices
These were NOT shipped as of POSTSEC-3. Production Stripe high-risk write exposure waits on POSTSEC-5 + product-owner sign-off on the rest:

| Control | Status | Slice |
| --- | --- | --- |
| Builder confirmation modal | API gate ships; UI consumer not yet | POSTSEC-5 |
| Run output retention policy + cron | No retention; PII accumulates indefinitely | deferred (product) |
| Config secret vault / reference design | Plaintext jsonb `draft_definition` continues to accept arbitrary keys | SEC-5 deferred |
| Fail-open redaction hardening | Redactor fail-OPEN on missing meta lookup | SEC-7 followup |
| SEC-3.x socket-level DNS rebinding pinning | First-tier denylist ships; socket-level closure deferred | SEC-3.x |
| Richer risk UI | Risk metadata served via API; chip / warning rendering not shipped | deferred |

---

## 10. Owner / Approval Note

**This runbook MUST be reviewed by product + security before production exposure of Stripe high-risk write actions.**

Production rollout further requires:
- Builder confirmation modal shipped (POSTSEC-5) OR product-owner explicit acceptance of "API-only confirmation as the V1 contract."
- Product-owner explicit acceptance of the §9.2 deferred risks (run output retention, config secret vault, fail-open redaction, SEC-3.x socket-level pinning, richer risk UI).
- On-call rotation includes someone capable of executing §3 + §4 within 15 minutes.
- Stripe Dashboard access is provisioned for the on-call rotation.
- Internal comms channels (Slack escalation, paging integration) are wired and tested.

The technical controls in §9.1 are necessary but not sufficient. This runbook is the procedural piece that makes the technical controls usable in an actual incident.

---

## 11. Out of Scope

- Non-Stripe accidental actions (Gmail send-to-wrong-recipient, Slack post-to-wrong-channel, Notion archive-wrong-page, GitHub create-issue-on-wrong-repo). Each warrants its own runbook; this document is Stripe-specific because Stripe is the only provider with money-moving + customer-facing financial impact.
- Stripe webhook handling failures (`/api/webhooks/stripe-billing`). That's the billing-pipeline runbook, separate.
- Stripe Connect onboarding / disconnect failures. That's the integrations runbook, separate.
- Mass-data Stripe operations (bulk customer import, bulk refund). Those go through finance tooling, not the workflow builder.
