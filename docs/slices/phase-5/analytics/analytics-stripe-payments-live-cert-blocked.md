# ANALYTICS-STRIPE-PAYMENTS-LIVE-CERT-1 — Stripe → Payments — BLOCKED

**Status:** **BLOCKED at the Phase A certification prerequisite — no connected Stripe
account exists.** Stripe Payments remains `exposure: "preview"` (development-only).
No exposure change, no dataset change, no test change.
**Base branch/commit:** `analytics-cd4d-hubspot-deals` @ `f2bb2b054` (parent Analytics
reconciliation `fb39f3834`).
**Worktree:** `C:/Users/marcu/source/repos/ChainReactV2-wt-stripe-cert` · **Branch:** `analytics-stripe-payments-live-cert`
**Push/deploy/migration status:** local commit only — no push, no PR, no deploy, no
migration, no `db:push`, no scope change, no Docker, no Playwright, no full test suite.

---

## 1. What blocked, precisely

The slice requires an **approved connected Stripe test-mode account** resolved through
the canonical active-account credential seam before any certification read. A
service-role existence probe found:

- **0 Stripe integration rows on the development/smoke account.**
- **0 Stripe integration rows across every account in the database.**

For contrast, the same account carries 31 other active provider connections
(airtable, asana, calendly, dropbox, facebook, fleetio, github, gmail,
google-analytics, google-calendar, google-docs, google-drive, google-sheets,
hubspot, linear, mailchimp, microsoft-excel, microsoft-onedrive, microsoft-onenote,
microsoft-outlook, microsoft-outlook-calendar, microsoft-powerbi, microsoft-teams,
monday, motive, notion, quickbooks, shopify, slack, trello, typeform) — Stripe is
simply absent, exactly as CD-2 recorded.

The certification harness confirms the same result through the production code path:

```
[PASS] live_guard — no API-base override — calls hit the real Stripe API
[FAIL] connection — no active Stripe integration for the development account —
       an approved Stripe TEST-mode account must be connected before certification can run

PHASE B AUTHORIZED: NO — failing: connection
```

Fixture evidence was **not** substituted for a live pass, and no Stripe record of any
kind was created to manufacture test data.

## 2. This confirms — and does not change — the CD-2 finding

CD-2 (`analytics-connected-data-cd2-outcome.md` §"Live Stripe certification: BLOCKED")
recorded the same state and set the bar for flipping exposure:

> **Live Stripe certification: BLOCKED** — the dev database has **0 active Stripe
> connections** (verified via service-role count). A connected Stripe test account is
> required; all provider-boundary behavior is fixture-proven and the limiter is
> live-DB-proven. Do not expose the dataset in CD-3 UI defaults before a live pass.

That requirement is unchanged and unmet. The catalog's own comment at
`services/analytics/insights/stripe/index.ts` still holds: *"flipping this to `public`
is the certification switch."*

## 3. What was built: a reusable certification harness

`scripts/trash/stripe-payments-analytics-cert.ts` (run
`npx tsx scripts/trash/stripe-payments-analytics-cert.ts`) is complete and ready — it
stops cleanly at the connection check today and will certify end-to-end the moment a
Stripe test account is connected. It **reuses the dataset's own boundaries** rather
than re-implementing them: `getActiveForExecution` + `refreshAndRetry` for credentials,
`chargesList` for charge reads, and the real `stripe:customers` resolver for the
customer picker.

Checks implemented, in order:

| Check | What it proves |
|---|---|
| `live_guard` | `STRIPE_API_BASE` unset — refuses a mocked/overridden run |
| `connection` | canonical credential seam resolves; ciphertext never touched |
| `test_mode` | `GET /v1/balance` → `livemode === false`; **halts** rather than certify against a live customer payment account (no balance figure read) |
| `account_ownership` | `GET /v1/account` id matches the stored connection (compared transiently, never printed); no request parameter selects the Stripe account |
| `charge_read` | bounded `GET /v1/charges` over 366 days; wire types for `created`, `amount`, `currency`, `status`, `customer` (and a note that `paid`/`refunded` are wire-only, never read by the scanner) |
| `amount_shape` | integer minor units, no string-coercion path |
| `currency_shape` | ISO-lowercase currency on every record; no implicit-USD path reachable |
| `status_domain` | observed statuses ⊆ the aggregator's `{succeeded, pending, failed}`; anything outside would silently fall out of every measure except payment count |
| `date_filter` | `created[gte]`/`created[lte]` push-down narrows correctly |
| `pagination` | `starting_after` cursor walk: no duplicates, no skips, newest-first bias, terminal `has_more=false` |
| `customer_filter` | resolves options through `stripe:customers`, asserts labels carry no email, then proves server-side narrowing to one customer |
| `empty_window` | a known-empty window returns safely |
| `rate_limit_metadata` | header presence only; no 429 provoked (429 classification stays fixture-tested) |
| `data_sufficiency` | ≥2 charges, ≥1 succeeded, ≥1 customer-linked, >1 created date, currency on all |

**Evidence safety by construction:** the harness prints only status classes, counts,
presence tallies, JS types, distinct-value counts and timings. It never prints the
Stripe account id, charge id, customer id, customer name or email, an amount, a
description, receipt/card/payment-method detail, metadata, a failure message, a token,
or a raw payload. Charge ids and one customer id are held transiently in memory only to
drive the pagination cursor and the customer filter.

**Read-only by construction:** the only verbs are `GET /v1/balance`, `GET /v1/account`,
`GET /v1/charges` and `GET /v1/customers`. No POST/DELETE path exists in the harness.

## 4. How to unblock (owner action)

1. Connect an **approved Stripe test-mode account** to the ChainReact development
   account (the account carrying `SMOKE_ACCOUNT_ID`) through the normal Stripe Connect
   flow at `/apps`. No scope change is needed — the dataset requires only the existing
   `read_write` Connect scope.
2. Ensure that test account contains, at minimum: **≥2 charges**, **≥1 succeeded
   charge**, **≥1 customer-linked charge**, and **more than one created date**. Helpful
   but optional (fixture-pinned already): failed/pending charges, refunded charges, a
   zero-decimal currency such as JPY, multiple currencies, multiple customers.
3. Re-run `npx tsx scripts/trash/stripe-payments-analytics-cert.ts`.

A `PHASE B AUTHORIZED: YES` line authorizes the exposure flip. That flip is a
**one-line declarative change** (`exposure: "preview"` → `"public"` in
`services/analytics/insights/stripe/index.ts`) plus the exposure-test updates it
invalidates:

- `tests/unit/services/analytics/insights/exposure.test.ts` — the production source-id
  list gains `"stripe"`; the development test's `expect(stripe.exposure).toBe("preview")`
  becomes `"public"`; and the two `runConnectedAnalyticsQuery` production-rejection
  tests invert to accept Stripe.
- Optionally a `describe("exposure")` block in the Stripe pipeline suite mirroring
  `shopifyPipeline.test.ts`'s "queryable in production because live certification passed".

`tests/unit/services/analytics/insights/registryAndProjection.test.ts`'s id-sorted
registry list already contains `stripe` and should stay green.

**If certification later passes but the test account has no customer-linked charges**,
the customer filter cannot be certified. Per the slice rules, do not expose the dataset
publicly in that state without the product owner explicitly approving either the removal
of the customer filter or the supply of suitable Stripe test data.

## 5. Exposure state (unchanged)

| Source | Exposure |
|---|---|
| ChainReact → Workflow runs | **public** |
| QuickBooks → Invoices | **public** |
| Shopify → Orders | **public** |
| Stripe → Payments | **preview** (development only — unchanged by this batch) |
| HubSpot → Deals | absent (CD-4D blocked: portal has 2 deals, 0 usable amounts) |
| Motive → Fuel purchases | absent (CD-4A blocked, unmerged branch) |

Production Custom Insights therefore still shows exactly three sources. A crafted
production query for `stripe` continues to be rejected with `UNKNOWN_SOURCE`, using copy
byte-identical to a genuinely unknown source (no existence leak) — re-verified green.

## 6. Existing Stripe behavior (untouched)

No Stripe implementation file was modified. The fixed Stripe Analytics widgets
(`successful_payment_count`, `gross_payment_volume`, `failed_payment_count`,
`successful_payments_over_time`, `gross_volume_over_time`), the Stripe actions,
triggers, OAuth/Connect flow, scopes, customer/charge option resolvers, API wrappers,
and the `stripe.payments` dataset semantics all remain exactly as at `f2bb2b054`.

## 7. Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run lint` | 0 errors, 27 pre-existing warnings |
| `npm run lint:structure` | 1 pre-existing violation — `docs/slices/phase-5` root at 51 files (this report was added under `analytics/`, not the root) — identical to the `f2bb2b054` baseline |
| `npm run lint:migrations` | OK (no migration added) |
| Focused: `exposure.test.ts`, `stripePayments.test.ts`, `registryAndProjection.test.ts` | **3 suites / 34 tests passed** — confirms Stripe is still `preview`, still absent from the production projection, and the dataset is unchanged |
| `npx tsx scripts/trash/stripe-payments-analytics-cert.ts` | `PHASE B AUTHORIZED: NO — failing: connection` |

**Verification boundaries — stated explicitly:** Docker was not used; Playwright was not
run; the full repository test suite was not run (only the three named focused suites);
no migration, `db:push`, RLS/GRANT change, push, PR, deploy, or scope change occurred.
Live certification **ran and did not pass** — blocked at the prerequisite, not by any
API failure or dataset defect.

## 8. Files and commits

- `scripts/trash/stripe-payments-analytics-cert.ts` — reusable read-only Phase A harness.
- `docs/slices/phase-5/analytics/analytics-stripe-payments-live-cert-blocked.md` — this report.

No other file was created or modified. `services/analytics/insights/stripe/index.ts`
was **not** touched — `exposure` remains `"preview"`.
