# ANALYTICS-CONNECTED-DATA-CD-4C — Shopify → Orders

**Status:** implemented and exposed **public** after a passing read-only live
certification.
**Base branch/commit:** `qb-customer-resolver-1` @ `33065738a` (contains CD-3A,
CD-3B, CD-4B QuickBooks Invoices, and the searchable customer resolver).
**Worktree:** `C:/tmp/cd4c-wt` · **Branch:** `cd4c-shopify-orders`
**Push/deploy/migration status:** local commits only — no push, no PR, no
deploy, no migration, no `db:push`, no scope change.

---

## 1. Live certification (Phase A)

Re-runnable read-only harness:
[`scripts/trash/shopify-orders-analytics-cert.ts`](../../../../scripts/trash/shopify-orders-analytics-cert.ts).
`GET /shop.json` and `GET /orders.json` only, through the canonical seam
(`getActiveForExecution` + `refreshAndRetry`); refuses to run if
`SHOPIFY_API_BASE_OVERRIDE` points at a mock. No write of any kind occurred.

**Result: 9/9 PASS — Phase B authorized.**

| Check | Result |
|---|---|
| `live_guard` | PASS — no API-base override; real Admin API |
| `connection` | PASS — active account-class integration, shop domain present |
| `shop_identity` | PASS — `/shop.json` 200 in 421 ms; returned shop **matches the stored connection**; shop currency is a valid ISO code |
| `order_wire_types` | PASS — 4 rows: `id` number · `test` **boolean** · `created_at` ISO 4/4 · `total_price` **decimal string** 4/4 · `currency` ISO 4/4 · `cancelled_at` null-or-ISO 4/4 · `fulfillment_status` null-or-string 4/4 |
| `status_domains` | PASS — 1 distinct financial status (all `paid`, 0 outside the documented domain) · 2 distinct fulfillment states · 3/4 cancelled · 0/4 test orders · 1 currency · 1 created date |
| `date_filter` | PASS — `created_at_min` narrowed 4 → 2; all rows inside the window |
| `pagination` | PASS — pageSize 2, 2 pages, 4 distinct ids, **0 duplicates, 0 skips**, `created_at` non-increasing, terminated by missing next-cursor, **`order=created_at desc` accepted with `page_info` follow-ups** |
| `empty_window` | PASS — 1971 window returns 0 rows, no cursor, no error |
| `rate_limit_metadata` | PASS — `X-Shopify-Shop-Api-Call-Limit` observed |

**Evidence safety:** counts, types, presence tallies, timings, narrowing
booleans only. No shop name/domain, order id/number, customer, product,
amount, email, note, token or payload was recorded. Order ids were read
transiently only to check page-boundary uniqueness.

**Honest thinness of the store:** the connected dev store holds **4 orders, all
financially `paid`, one created date, one currency, zero test orders**. So:

* Wire types, identity, filtering, cursor paging, sort acceptance, empty
  windows and cancellation (3 live cancelled orders) are **live-proven**.
* The **wider financial-status domain** (pending/authorized/partially_paid/
  partially_refunded/refunded/voided), multi-date grouping, mixed currency and
  the `test: true` marker are **fixture-proven** against the certified wire
  shapes. No commerce records were created to enlarge the store.

Under §4's "ideally" bar this is thinner than CD-4B's store but categorically
unlike CD-4A's zero-record block: every semantic the launch measures depend on
was genuinely observed.

---

## 2. Dataset identity and semantics

Source `shopify` · dataset `orders` · credential mode `account` · execution
mode `provider_snapshot` · freshness `cached`, TTL 600 s · exposure `public`.

| Measure | Meaning |
|---|---|
| **Order count** | How many orders were placed. Cancelled orders count (they were placed); filters narrow. |
| **Paid order count** | Orders whose payment status is **exactly `paid`** — not partially_paid, not authorized, no string-contains guessing. |
| **Total order amount** | Σ of matching Shopify **order totals** — what was charged at checkout. |
| **Average order amount** | The same eligible totals ÷ their count; null when none. |

**Exact monetary label** (in the catalog, shown to users): *"The sum of
matching Shopify order totals — what was charged at checkout. Not net sales,
refunds are not subtracted, and not payouts."* The words revenue / net sales /
profit / cash collected / payouts appear in no measure label (a test scans for
them).

**Included/excluded order states, explicit defaults:**

* **Test orders are EXCLUDED by default from every measure.** Shopify marks
  test-mode/Bogus-gateway orders `test: true` (wire-certified boolean); a
  merchant's business totals must never silently include fake transactions.
  The catalog exposes a boolean **"Include test orders"** toggle; only a
  literal `true` includes them, `false` and absent are identical. (The FIXED
  Shopify widgets do include test orders — pre-existing behaviour, untouched.)
* Normal matching orders are included **regardless of fulfillment state**.
* **Cancelled orders are included by default** (Option A literal semantics) and
  are filterable/groupable via a `Cancellation` field derived from the
  certified `cancelled_at` timestamp — never inferred from a financial status.
* No financial status is silently excluded; the paid-only view is a filter or
  the named Paid order count.

**Refunds / net sales — deferred, with the reason on record:** the projection
carries no refund amounts (a `refunded` status is a boolean-ish state, not a
number), and partial refunds require the `refunds[]` sub-objects plus their own
semantic design. A refund-adjusted number cannot be computed honestly from
what is projected, so it is not offered. Tests pin that refunded/partially
refunded orders still sum their original totals (which is what the measure's
label promises) and no fake refund amount exists anywhere.

---

## 3. Status normalization

Both status fields are normalized into bounded, documented domains
(`measures.ts`), and every order maps to **exactly one** value of each — the
partition that makes a count donut honest:

* **Payment status:** `paid`, `pending`, `authorized`, `partially_paid`,
  `partially_refunded`, `refunded`, `voided`; anything missing or outside the
  domain → **`unknown`** (never a raw provider string in a label).
* **Fulfillment status:** Shopify's `null` (not yet fulfilled) is normalized to
  an explicit, first-class **`Unfulfilled`** — not null noise; then `partial`,
  `fulfilled`, `restocked`, with out-of-domain → `unknown`.

Only these two domains are declared **part-to-whole**, so a donut is offered
solely for order-count breakdowns by payment or fulfillment status, and the
CD-3B completeness guardrail (no percentages on a capped scan) applies
unchanged. Currency and cancellation are deliberately not part-to-whole.

---

## 4. Currency and precision

* Shopify money arrives as **major-unit decimal strings** (live-certified).
  Each amount is validated against a strict decimal shape, converted **once**
  to integer minor units at the provider boundary (`core/analytics/money`, the
  same canonical helper QuickBooks and Stripe use), accumulated as integers,
  and converted back once at emit, rounded to the currency's own precision.
* An unreadable total is **null — excluded from money measures with a warning**
  ("N orders had an unreadable total…"), never coerced to 0; the order still
  counts in count measures. The warning appears on money measures only.
* **Single-currency monetary results**; >1 currency throws typed
  `MIXED_CURRENCY`; an explicit currency filter resolves it; comparison
  windows must agree; counts stay currency-independent and may group by
  currency. **No conversion, no dominant-currency fallback** (the fixed
  widgets' dominant-currency behaviour is not reused here).
* **No implicit USD:** a missing currency emits no ISO code plus a warning; the
  platform formatter renders a plain number. The shop's home currency is NOT
  assumed (it was observed on `/shop.json` but a per-order fallback to it was
  not certified, so it is not used).

---

## 5. Dimensions, filters, series, charts

| | Offered |
|---|---|
| Dimensions | time · payment status · fulfillment status · currency · cancellation |
| — for money | **time only** — one result carries one currency code, so money-by-status can't be represented truthfully; statuses and currency stay **filters** for money |
| Filters | payment status · fulfillment status · currency · cancellation · Include test orders (boolean) · date range |
| Series | payment-status lines (max 8) · fulfillment-status lines (max 5) — order count only, automatic keys |
| Charts | KPI · line · bar · table · donut (count × declared part-to-whole only) |

Series keys are the statuses **observed** in the window, in canonical display
order — bounded by the domain size (≤8/≤5 by construction), zero-filled per
bucket, and narrowed by a status filter. An empty window yields no series
rather than eight flat zero lines.

All eight launch questions from the product goal are proven expressible from
the client projection by the builder-evidence suite, including the donut
gating and "Total order amount, only paid orders" via the paid filter.

---

## 6. Pagination, ordering, scan bias

* Created-time bounds are pushed to Shopify (`created_at_min`/`max`, inclusive;
  the adapter passes `to − 1 ms` and the aggregation re-applies the exact
  `[from, to)` bound).
* **Link-header cursor pagination**, 250/page, hard cap **10 pages = 2,500
  orders** (`maxRecordsScanned` declares it; the audit's ~2,500 figure was
  re-verified against the current code, not assumed). The first request
  carries the filters plus an **explicit `order=created_at desc`** (certified
  compatible with `page_info` follow-ups, which carry only
  `limit`/`page_info`/`fields`).
* End of results = missing next-cursor (live-certified); past the cap the scan
  stops and reports `truncated`.
* **Scan bias, disclosed:** a capped result reflects the **newest-created**
  orders in the window; the `scan_capped` detail says so.
* Cursors never leave the server — they exist only inside the scanner loop and
  never reach the client or a saved widget config.
* Nothing truncates silently: structured `scan_capped` + warning; category
  overflow reports `row_capped`.

---

## 7. Adapter and pipeline

* **New insights scanner**
  (`services/analytics/sources/shopify/insightOrders.ts`), deliberately
  separate from the fixed-widget scanner whose 4-field float projection is
  pinned by shipped production widgets. It requests exactly the certified
  fact fields (`created_at,total_price,currency,financial_status,fulfillment_status,cancelled_at,test`)
  — no order id, customer, line items, note or discount code is ever read into
  a fact, so none can reach an aggregate, the snapshot cache, or the browser.
* Pure aggregation (`insights/shopify/aggregate.ts` + `measures.ts`) mirrors
  the QuickBooks split: shaping vs. semantics, no HTTP, injected clock.
* Thin adapter (`insights/shopify/index.ts`): account-class credential
  resolution (`getActiveForExecution(accountId, "shopify", null)` — the shop
  domain comes from the stored row, never the client), `refreshAndRetry`,
  bounded scan (+ a second scan for `previous_period`), typed error mapping:
  401/refresh-not-supported → `RECONNECT_REQUIRED`, `ShopifyRateLimitError` →
  `RATE_LIMITED`, anything else → a static `PROVIDER_ERROR` message.
* CD-2 cache/coalescing/limiter reused unchanged — `insights:v1` namespace,
  `metric_key insights:orders`, account-shared snapshots
  (`source_user_id null`), full normalized query in the key (the test-order
  toggle provably changes it), leader-only budget, stale fallback only for
  RATE_LIMITED/PROVIDER_ERROR, never for missing/reconnect credentials or
  MIXED_CURRENCY. **No new migration, no new limiter table.** No claim of
  equivalence to Shopify's leaky-bucket algorithm is made — the per-source cap
  (10 cold queries/account-min × ≤10 pages) simply bounds worst-case calls at
  ~100/min, far inside Shopify's REST bucket.

No Shopify-specific React exists anywhere; the builder-evidence suite drives
the real client projection through the same pure selectors every provider uses.

---

## 8. Security

* Account scope is session-derived; the query body carries no account, shop or
  connection identifier. Live certification proved the stored connection owns
  the shop it queries (`/shop.json` identity match).
* Cache, coalescing and limiter keys embed the account id (tested: no
  cross-account sharing of keys, results, in-flight work, or budget).
* Raw orders never leave the server. Results and snapshots contain no order
  id/number, customer, name, email, address, product, line-item text, note,
  discount code, token, or raw payload — a no-leak test feeds the scanner
  orders **containing** all of those and string-scans the result.
* The client catalog contains no raw scopes, shop domains, API params or
  execution internals (string-scanned).
* Status values in results are normalized bounded ids with fixed labels.
* Account purge is unaffected: snapshots/limiter rows are the existing
  account-scoped tables CD-2 covers.

## 9. Existing Shopify compatibility

Untouched and passing: OAuth (offline token, no-refresh semantics), scopes (no
additions), 11 actions, the consolidated webhook trigger, 5 option resolvers,
the shared wrappers, **the fixed Shopify Analytics source and its widgets**
(`services/analytics/sources/shopify/api.ts` was not modified; the insights
scanner is a new file), error classification, and reconnect behaviour. No
Shopify write occurred at any point.

---

## 10. Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (27 pre-existing warnings) |
| `npm run lint:structure` | 1 violation — pre-existing `docs/slices/phase-5` 51-file baseline |
| `npm run lint:migrations` | OK |
| Focused analytics suites¹ | **108 suites / 1523 tests, all passing** |
| Focused Shopify + QuickBooks + options suites² | **57 suites / 684 tests, all passing** |
| `tests/structure` | 5 failed / 273 passed — **identical to the base commit** |

¹ `tests/unit/services/analytics tests/unit/features/analytics
tests/unit/contracts/analyticsCatalog.test.ts
tests/unit/contracts/analyticsInsightWidget.test.ts
tests/unit/contracts/analyticsQuery.test.ts tests/unit/app/api/analytics
tests/unit/core/analytics`
² `tests/unit/integrations/shopify tests/unit/integrations/_shared/shopify
tests/unit/app/api/webhooks/shopify.route.test.ts
tests/unit/services/discovery/shopify-discovery.test.ts
tests/unit/services/discovery/shopify-triggers-discovery.test.ts
tests/unit/integrations/quickbooks tests/unit/services/options
tests/unit/app/api/options tests/unit/lib/api/options.test.ts`

New tests contributed: **105** (dataset/catalog/money/status/adapter 70 ·
pipeline 13 · builder evidence 22). Two pre-existing inventory assertions
(exposure, registry listing) were extended to include `shopify`, exactly as
CD-2 and CD-4B did for their sources.

**Verification boundaries — stated explicitly:**
* **Docker was not used**; no Docker-based Supabase environment was started or recovered.
* **Playwright was not run.**
* **The full repository test suite (`npm test`) was not run.**
* Only the focused suites above plus the four static commands were run.
* Live Shopify certification **passed** (read-only, 9/9).
* The dataset **did become public**.

**Structure baseline:** `docs/slices/phase-5` holds 51 root files (limit 50) —
pre-existing and parallel-owned; this document was added only under
`docs/slices/phase-5/analytics/`. All touched source directories pass.

---

## 11. Known limitations

* **Thin live store** (§1): the wider financial-status domain, multi-date
  grouping, mixed currency and `test: true` behaviour are fixture-proven, not
  live-proven. The harness is re-runnable as the store accrues data.
* **Refund amounts, net sales** — deferred (no refund amounts in the
  projection; see §2).
* **2,500-order scan cap** with newest-created bias, honestly disclosed.
* **Money groups by time only**; statuses/currency are filters for money.
* No customer, product or line-item analytics (deferred; the audit's finding
  that trustworthy per-product sales needs line-item projection stands).
* The fixed Shopify widgets keep their pre-existing behaviour (test orders
  included, dominant-currency revenue) — migrating them was out of scope.
* No `Retry-After` parsing on Shopify 429s (pre-existing transport behaviour);
  the pipeline's stale fallback covers the user experience.

## 12. Deferred work

Products and line items · net sales · refund amounts (incl. partial refunds) ·
discounts · taxes · shipping · customer analytics · inventory analytics ·
payouts. Each needs its own certified semantic design.

Exposure elsewhere is unchanged: ChainReact public · QuickBooks Invoices
public · Stripe Payments preview-only · Motive absent. HubSpot and CD-5 were
not started.

---

## 13. Files and commits

**New (implementation):**
`services/analytics/sources/shopify/insightOrders.ts` ·
`services/analytics/insights/shopify/{index,measures,aggregate}.ts`
**New (harness):** `scripts/trash/shopify-orders-analytics-cert.ts`
**New (tests):** `tests/unit/services/analytics/insights/shopifyOrders.test.ts`
· `shopifyPipeline.test.ts` ·
`tests/unit/features/analytics/insights/shopifyBuilderEvidence.test.ts`
**Modified:** `services/analytics/insights/registry.ts` (registration) ·
`tests/unit/services/analytics/insights/{exposure,registryAndProjection}.test.ts`
(source inventory).

Commits (local only): implementation+certification, tests, docs — listed in
the Owner Report; no migration, no `db:push`, no push, no PR, no deploy, no
scope change, no Stripe/Motive exposure change, no production change.
