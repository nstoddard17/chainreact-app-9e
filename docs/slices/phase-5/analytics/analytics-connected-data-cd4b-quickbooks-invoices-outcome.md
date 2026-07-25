# ANALYTICS-CONNECTED-DATA-CD-4B — QuickBooks → Invoices

**Status:** implemented and exposed **public** after a passing read-only live
certification.
**Base branch/commit:** `cd4a-motive-fuel` @ `b5897ed8e` (CD-3B `fae00dbe8` is in
its history).
**Worktree:** `C:/tmp/cd4b-wt` · **Branch:** `cd4b-quickbooks-invoices`
**Push/deploy/migration status:** local commit only — no push, no PR, no deploy,
no migration, no `db:push`, no scope change.

---

## 1. Certification result (Phase A)

The dataset was **not** written until the provider proved every semantic it
depends on. A re-runnable read-only harness lives at
[`scripts/trash/quickbooks-invoices-analytics-cert.ts`](../../../../scripts/trash/quickbooks-invoices-analytics-cert.ts).

It is strictly read-only — query-endpoint `GET`s only. No invoice or customer was
created, updated, voided, deleted or emailed; no scope changed; no company data
was modified. Credentials resolved only through the canonical seam
(`getActiveForExecution` + `refreshAndRetry`), so ciphertext was never touched,
and the harness refuses to run unless `QUICKBOOKS_API_BASE` is the sandbox base.

**Result: 18/18 PASS — Phase B authorized.**

| Check | Result |
|---|---|
| `sandbox_guard` | PASS — sandbox base confirmed before any read |
| `connection` | PASS — active account-class integration, realm present |
| `company_identity` | PASS — realm-scoped `GET /companyinfo` 200 in 586 ms |
| `foreign_realm_rejected` | PASS — a realm the connection does not own → 401 |
| `currency_preferences` | PASS — `CurrencyPrefs` present, MultiCurrency **off**, `HomeCurrency` a valid ISO code |
| `invoice_wire_types` | PASS — `TotalAmt`/`Balance` are JSON **numbers**; `CurrencyRef.value` a string on 5/5; `TxnDate` `YYYY-MM-DD` on 5/5; `DueDate` absent-or-`YYYY-MM-DD` on 5/5 |
| `invoice_query` | PASS — 200 in 579 ms, 25 rows, `hasMore=true` |
| `invoice_projection_shape` | PASS — 11/11 projected fields present on 25/25 rows |
| `invoice_semantics` | PASS — 6 paid / 19 open(balance>0) / 0 negative; balance ≤ total on 25/25; 12 distinct dates; 1 currency; 15 customers |
| `invoice_amount_precision` | PASS — 8/25 totals carry fractional cents |
| `invoice_date_filter` | PASS — `TxnDate >=` push-down, all rows inside window, window strictly narrower |
| `invoice_customer_filter` | PASS — `CustomerRef =` push-down, all rows match, narrower than full scan |
| `invoice_total_count` | PASS — `select count(*)` reports 37 invoices in the company |
| `balance_predicate_pushdown` | PASS — `where Balance > '0'` works (informational; not relied on) |
| `invoice_pagination` | PASS — 13 pages × 3, 37 distinct ids, **0 duplicates**, **0 skips**, CreateTime non-increasing, short-page termination observed |
| `invoice_ordering_ties` | PASS — no tied `CreateTime` values in the walk |
| `invoice_empty_window` | PASS — empty range returns 0 rows, `hasMore=false`, no error |
| `customer_resolver` | PASS — 33 customers, stable ids 33/33, display labels 33/33 |

**Safe evidence only.** The harness records endpoint category, HTTP outcome,
timing, page size, row counts, field-presence tallies, distinct-value counts,
JS types and pagination shape. It records **no** company name, realm id,
customer name or id, invoice id or number, amount, email, address, memo,
line-item text, token or raw payload — and neither does this document.

One correction was made during certification: the first run compared
`CompanyInfo.Id` to the stored realm and failed. That comparison was wrong —
`CompanyInfo.Id` is the entity id, not the realm. Realm ownership is proven by
the realm-scoped path succeeding, so the check was replaced with that plus a
**negative control** (a realm the connection does not own returns 401). This is
what makes "the realm is never user-selected" enforceable rather than assumed.

**Certification caveat:** the connected company is an Intuit **sandbox** company
with MultiCurrency disabled. Mixed-currency behaviour is therefore proven by
fixtures, not by live records — see §6.

---

## 2. Dataset semantics

Source `quickbooks` · dataset `invoices` · credential mode `account` ·
execution mode `provider_snapshot` · freshness `cached`, TTL 600 s ·
exposure `public`.

| Measure | Meaning |
|---|---|
| **Invoice count** | How many invoices were issued in the window. |
| **Total invoiced amount** | Σ of the **original** invoice totals — what was *billed*. |
| **Average invoice amount** | Total ÷ invoices with a usable total; **null** (not 0) when there are none. |
| **Outstanding balance** | Σ of balances still owed, **as of now**. |
| **Outstanding invoices** | How many invoices still owe something, **as of now**. |

Deliberately absent, because they need accounting semantics or the Reports API
this slice does not implement: revenue, cash collected, profit, AR aging,
overdue balance, payment amounts, tax liability, fees, P&L, cash flow. A test
asserts none of those words appears in the measure set.

**Invoice amounts are never called revenue.** "Total invoiced amount" is
described in the catalog as *"the original total of the invoices you issued —
billed, not collected."*

**Paid status** is derived from the balance alone: `outstanding ⟺ balance > 0`,
`paid` otherwise. This intentionally differs from the action-layer
`ProjectedQuickbooksInvoice.paid` flag, which also requires a positive total and
so leaves a zero-total invoice in *neither* bucket. Two categories that
partition every invoice are what make the part-to-whole donut truthful; a third
residual state would silently break its denominator. A test pins the partition.

---

## 3. Historical versus current state

This is the distinction the slice exists to respect.

QuickBooks stores **one balance per invoice — its balance right now**. There is
no balance history. Bucketing today's balances by their invoices' old
transaction dates would draw a line that reads as *"what I was owed back then"*
and is nothing of the sort: an invoice issued in January and paid in March
contributes **0** to January.

| | Historical-compatible | Current-state only |
|---|---|---|
| Measures | Invoice count · Total invoiced amount · Average invoice amount | Outstanding balance · Outstanding invoices |
| May group by | time (invoice date), customer, paid status, currency¹ | customer |
| Period comparison | yes | **no** — only one snapshot exists |

¹ currency grouping is offered for count measures only (see §6).

Enforced at **four** independent layers, none of them a UI rule:

1. **Catalog** — the current-state measures simply do not declare a `time`
   dimension, and declare `compare: false`.
2. **Server validation** — `validateConnectedQuery` rejects a crafted
   `dimension: "time"` (and a crafted `chart: "line"`, and a crafted compare).
3. **Aggregation** — `aggregateQuickbooksInvoices` throws `INVALID_QUERY` for a
   current-state measure with a time dimension even if validation were bypassed.
4. **Generic builder** — `availableDimensionChoices` / `chartChoices` derive the
   offered controls from the declaration, so the time control and line chart
   never render for those measures.

The donut is kept off Outstanding balance by the same mechanism rather than a
special case: the measure declares no `paid_status` dimension (every invoice
with a balance *is* Outstanding, so the breakdown would be a single bar), and
donut legality requires a declared part-to-whole dimension.

---

## 4. Currency and precision

* QuickBooks reports money as **major-unit decimals** (`362.07`). Every amount
  is converted to **integer minor units at the provider boundary**, accumulated
  as integers, and converted back **exactly once at emit**, rounded to the
  currency's own precision (2 dp USD, 0 dp JPY, 3 dp KWD).
* The canonical table and conversions live in
  [`core/analytics/money.ts`](../../../../core/analytics/money.ts). Stripe's
  money seam now re-exports the same table instead of keeping a second copy, so
  the zero-/three-decimal lists cannot drift apart between providers.
* Half-unit rounding is made deterministic: `1.005 * 100` is `100.49999…` in
  IEEE-754 while `75.005 * 100` is `7500.500…1`, so a bare `Math.round` would
  round two equivalent half-cent amounts in opposite directions. Values are
  snapped to 6 decimals before rounding, so a half unit always rounds up.
* An amount that is non-finite, or so large that integer arithmetic would stop
  being exact (> 2^53 minor units), is treated as **malformed and excluded** —
  never coerced to 0, which would silently understate a total. The count of
  excluded invoices is surfaced as a result warning.
* **Single-currency monetary results.** More than one currency among the
  eligible invoices throws typed `MIXED_CURRENCY`; an explicit currency filter
  resolves it. A comparison window whose currency disagrees with the main window
  throws the same error. Counts stay currency-independent.
* **No implicit USD.** If QuickBooks reports no currency at all, the amount is
  emitted with **no** currency code and a warning; the platform formatter then
  renders a plain number (`formatInsightValue` documents "an unknown currency
  renders a plain number, never USD"). No FX conversion happens anywhere.
* The company **home currency** is available (certified via `Preferences`) as a
  future fallback, but is not fetched: `CurrencyRef` was present on 25/25
  invoices even with MultiCurrency disabled, so an extra provider call per cold
  query would buy nothing today.

---

## 5. Pagination, ordering and completeness

* Filters pushed **server-side**: `TxnDate >= / <=` and a single `CustomerRef =`.
  Paid-status and currency filters are applied locally over the bounded scan.
* Paging uses QuickBooks' `STARTPOSITION` offset with `MAXRESULTS 100`, capped at
  **20 pages = 2,000 invoices** per window (`maxRecordsScanned`).
* QuickBooks' query response carries **no total**, so the scan ends only on a
  **short page** or at the declared cap — both live-certified.
* **Ordering** stays `ORDERBY MetaData.CreateTime DESC`, the shipped wrapper's
  order. Certification showed it tie-free across all 37 invoices, and a tie-free
  sort key is what makes offset paging stable; `TxnDate` ties heavily (12
  distinct dates over 37 invoices) and could shift rows between pages.
* **Documented scan bias:** because the sort key is creation time, a capped
  result reflects the most recently **created** invoices in the window, which is
  not necessarily the most recent invoice **dates**. Said plainly in the
  `scan_capped` detail string.
* Nothing is silently truncated: hitting the cap returns structured
  `completeness: { state: "scan_capped" }` plus a warning, and the existing
  generic UI renders the partial-data treatment (donut percentages are withheld
  when the denominator is incomplete). An overflowing category breakdown reports
  `row_capped`.

---

## 6. Dimensions, filters, series, charts

| | Offered |
|---|---|
| Dimensions | time · customer · paid status · currency |
| Filters | customer (single, pushed server-side) · paid status · currency · date range |
| Series | customer (**explicit only**, max 8) · paid status (max 2) |
| Charts | KPI · line · bar · table · donut (paid-status breakdowns of counts only) |

* **Currency grouping is count-only.** One result carries one `valueMeta.currency`,
  so a per-currency *money* breakdown cannot be represented truthfully in the
  common contract; currency therefore stays a **filter** for monetary measures.
  This is the audit's stated fallback.
* **Top-N customers is deferred.** An exact ranking cannot be promised once a
  scan is capped, so only explicit selection ships. Selected customers with no
  invoices in the window still render as an empty series rather than vanishing.
* Numeric range filters (minimum balance) and due-date range filters are
  deferred — the generic filter model has no numeric-range type, and adding one
  is platform work, not QuickBooks work.

---

## 7. Cache, coalescing and limiter

Reuses CD-2 infrastructure unchanged — **no new migration, no new limiter
table**:

* Snapshots live in the `insights:v1` namespace with `metric_key =
  insights:invoices`; the key is a hash of account + source-user + source +
  dataset + the **full normalized query**.
* Account-class ⇒ `source_user_id` is null, so the snapshot is shared across the
  account's members and **never** across accounts (proved by a key-inequality
  test and an end-to-end two-account test).
* Identical concurrent cold queries **coalesce** onto one leader; only the leader
  consumes limiter budget. Cache hits and followers consume none.
* Stale fallback is limited to transient provider failures (`RATE_LIMITED`,
  `PROVIDER_ERROR`). `MISSING_CREDENTIAL`, `RECONNECT_REQUIRED` and
  `MIXED_CURRENCY` always rethrow — a revoked connection can never keep reading
  old data.
* No QuickBooks-specific budget was added. The existing per-source cap (10 cold
  queries per account-minute) bounds worst-case provider traffic at ~200
  requests/account-minute, comfortably inside Intuit's documented 500/min per
  realm. **No claim of parity with Intuit's global throttling is made.**

---

## 8. Security

* Account scope is session-derived (`requireAccount()` on the existing route);
  the query body carries no account, user, connection or realm id.
* The realm comes from the stored integration row via `getActiveForExecution`
  and is **never** user-selected. Live certification additionally proved the
  token is realm-bound: a realm the connection does not own returns 401.
* A customer id can only be used as a server-side predicate within the resolved
  realm — it cannot widen access to another company or account.
* Cache, coalescing and limiter keys all embed the account id, so no work or
  result is shared across accounts.
* **Raw invoices never leave the server.** Each invoice is reduced to a
  transient fact (`txnDate`, minor-unit total/balance, currency, an opaque
  customer key, a display label). Invoice id, doc number, bill-to email, memo,
  private note and line items are dropped at the scanner and can never reach an
  aggregate, the snapshot cache, or the browser.
* **Customer ids never appear in results or snapshots.** Rows and series carry a
  per-account-salted SHA-256 surrogate, so the same customer yields different
  keys in different accounts and a stored chart holds no provider identifier.
  A test asserts the raw ids are absent and the surrogates differ across
  accounts; another asserts no invoice id, doc number, email, memo, line-item
  text, realm or token appears anywhere in a result.
* The client catalog contains **no** raw scopes, execution mode, adapter,
  endpoint or provider internals (asserted by string scan).
* Account purge is unaffected: snapshots and limiter rows are the existing
  account-scoped tables CD-2 already covers.

---

## 9. Files

**New**
* `core/analytics/money.ts` — canonical decimal-safe money helpers.
* `services/analytics/sources/quickbooks/api.ts` — bounded read-only invoice
  scanner → non-identifying facts.
* `services/analytics/insights/quickbooks/measures.ts` — measure semantics,
  paid-status derivation, currency resolution.
* `services/analytics/insights/quickbooks/aggregate.ts` — pure KPI / time-series
  / categorical shaping.
* `services/analytics/insights/quickbooks/index.ts` — catalog declaration +
  adapter.
* `scripts/trash/quickbooks-invoices-analytics-cert.ts` — the certification harness.
* `tests/unit/core/analytics/money.test.ts`
* `tests/unit/services/analytics/insights/quickbooksInvoices.test.ts`
* `tests/unit/services/analytics/insights/quickbooksPipeline.test.ts`
* `tests/unit/features/analytics/insights/quickbooksBuilderEvidence.test.ts`

**Modified**
* `services/analytics/insights/registry.ts` — registers the source.
* `services/analytics/sources/stripe/buckets.ts` — re-exports the shared
  currency table instead of duplicating it (no behaviour change).
* `tests/unit/services/analytics/insights/exposure.test.ts`,
  `registryAndProjection.test.ts` — source-inventory assertions updated to
  include `quickbooks`, exactly as CD-2 did when Stripe was added.

**Unchanged:** every existing QuickBooks surface — OAuth, token refresh, realm
handling, the 7 actions, the 4 triggers, webhooks, option resolvers, the
invoice/customer wrappers, error classification and scopes. No QuickBooks write
occurred at any point.

---

## 10. Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (pre-existing warnings only) |
| `npm run lint:structure` | 1 violation — **pre-existing baseline**, see below |
| `npm run lint:migrations` | OK |
| Focused analytics suites¹ | **104 suites, 1408 tests, all passing** |
| Focused QuickBooks + Stripe provider suites² | **54 suites, 622 tests, all passing** |
| `tests/structure` | 5 failed / 273 passed — **identical to the base commit** |

¹ `tests/unit/services/analytics tests/unit/features/analytics
tests/unit/contracts/analyticsCatalog.test.ts
tests/unit/contracts/analyticsInsightWidget.test.ts
tests/unit/contracts/analyticsQuery.test.ts tests/unit/app/api/analytics
tests/unit/core/analytics`
² `tests/unit/integrations/quickbooks tests/unit/integrations/stripe
tests/unit/services/discovery/quickbooks-discovery.test.ts
tests/unit/app/api/webhooks/quickbooks.route.test.ts
tests/unit/features/apps/quickbooks-connect-flow.test.tsx
tests/unit/app/api/integrations/oauth-callback-params.test.ts`

New tests contributed: **143** (money 32 · dataset 72 · pipeline 13 · builder
evidence 26).

**Structure-lint baseline:** `docs/slices/phase-5` holds 51 files (limit 50).
This violation is **pre-existing and parallel-owned** — verified identical at the
clean base commit `b5897ed8e`. No unrelated file was touched; this outcome
document was added only under `docs/slices/phase-5/analytics/` (9 → 10 files,
far under the cap). All source directories this batch touched pass the
structural rules.

**Verification boundaries — stated explicitly:**
* **Docker was not used.**
* **Playwright was not run.**
* **The full repository test suite (`npm test`) was not run.**
* Only the focused suites listed above, plus the four static commands, were run.
* Live QuickBooks certification **passed** (read-only, 18/18).
* The dataset **did become public**.

---

## 11. Known limitations

* **Sandbox certification.** Live evidence comes from an Intuit sandbox company
  with MultiCurrency **disabled**. Single-currency behaviour is live-proven;
  mixed-currency rejection, the missing-currency state, zero-/three-decimal
  currencies and large totals are proven by fixtures. A production company with
  MultiCurrency enabled has not been observed.
* **Customer picker page size.** The pre-existing `quickbooks:customers`
  resolver lists a single page of 100 active customers ordered by display name,
  with no server-side search or paging. A company with more than 100 customers
  cannot pick beyond the first 100. This is a pre-existing resolver limitation
  (it predates this slice and also affects the action builder), not something
  CD-4B introduced — but it does bound the customer filter and series here, and
  is the most valuable follow-up for this dataset.
* **Scan cap.** 2,000 invoices per window; beyond that the result is honestly
  marked `scan_capped` and biased toward most-recently-created.
* **Top-N customer series** and numeric-range filters are deferred (§6).
* **No QuickBooks 429 backoff.** The provider transport classifies 429 but does
  not retry; the adapter maps it to `RATE_LIMITED` and the pipeline may serve a
  stale snapshot. Unchanged from the shipped provider behaviour.

---

## 12. Deferred QuickBooks work

Not started, and each needs its own certification pass:

* **Reports API** (the prerequisite for most of the below).
* **Profit & Loss**, cash flow, balance sheet.
* **Accounts-receivable aging** and overdue analytics (due date is already
  declared as a non-historical context field for this).
* **Payments** — cash actually collected, and payment-to-invoice application.
* **Expenses, bills, purchases**; payroll; tax liability; fees.
* **Estimates, credit memos, sales receipts** as datasets.
* **Line-item analytics** (product/service revenue mix) — deliberately excluded.
* A **synchronized balance-history model**, which is the only honest route to a
  historical outstanding-balance time series.

Stripe remains **preview-only**. Motive remains **absent** pending fuel data.
