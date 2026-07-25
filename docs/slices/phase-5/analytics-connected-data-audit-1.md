# ANALYTICS-CONNECTED-DATA-AUDIT-1 — Custom charts from connected-app data

**Type:** Audit / product redesign / implementation plan only. **No source, tests,
migrations, UI, scopes, caching, or behavior changes in this slice. Nothing
pushed, deployed, or applied to any database.**
**Date:** 2026-07-24 · **Branch:** `v2-main` (local)
**Parents:** [analytics-flexibility-audit-1.md](./analytics-flexibility-audit-1.md) ·
[analytics-flexibility-cs1-outcome.md](./analytics-flexibility-cs1-outcome.md) ·
[analytics-closeout.md](../phase-4/analytics/analytics-closeout.md)

**Labeling convention used throughout:** claims are tagged
**[Verified]** (read in repo code this audit), **[Provider fact]** (from the
provider research docs already in this repo — `integrations/*/research.md`,
`docs/providers/*`), **[Recommendation]**, or **[Assumption — needs
certification]** (must be proven against the live provider before shipping).

**Source of truth (verified current state):**
[sources/types.ts](../../../services/analytics/sources/types.ts) (adapter/metric/result contracts) ·
[sources/registry.ts](../../../services/analytics/sources/registry.ts) (26 approved adapters) ·
[querySource.ts](../../../services/analytics/sources/querySource.ts) + [cache.ts](../../../services/analytics/sources/cache.ts) (validation + TTL snapshot cache) ·
[connectedAppSources.ts](../../../features/analytics/connectedAppSources.ts) (UI catalog, 25 providers) ·
[WidgetConfigPanel.tsx](../../../features/analytics/WidgetConfigPanel.tsx) (config UX) ·
[credentialSharing.ts](../../../core/integrations/credentialSharing.ts) (account/personal policy) ·
[resolveOptionsSource.ts](../../../services/options/resolveOptionsSource.ts) + [_registry.ts](../../../services/options/_registry.ts) (entity pickers) ·
[insightQuery.ts](../../../services/analytics/insightQuery.ts) + [contracts/analyticsQuery.ts](../../../contracts/analyticsQuery.ts) (CS-1 engine) ·
per-provider: [motive/manifest.ts](../../../integrations/motive/manifest.ts), [quickbooks/manifest.ts](../../../integrations/quickbooks/manifest.ts), [stripe/manifest.ts](../../../integrations/stripe/manifest.ts), [shopify/manifest.ts](../../../integrations/shopify/manifest.ts), [hubspot/manifest.ts](../../../integrations/hubspot/manifest.ts), [fleetio/manifest.ts](../../../integrations/fleetio/manifest.ts) + their `api/` wrappers and `research.md` docs (details cited inline).

---

## 1. Executive summary

ChainReact already has more connected-app analytics than the previous audit
emphasized: a registry of **26 approved read-only source adapters** (25
providers + internal), a validated query route, a TTL snapshot cache with
personal-credential isolation, and a widget UI exposing **~110 metrics**. But
every one of those metrics is a **fixed, canned question** — "unread emails",
"revenue over time" — parameterized at most by one entity picker. There is no
measure choice, no grouping choice, no date-field choice; the server's
`supportedGroupBy` capability is literally unreachable from the UI
**[Verified]** (§3.4). The platform is a *metric vending machine*, not a chart
builder.

The corrected product is: **Source → Data → Measure → Breakdown → Filters →
Series → Time → Chart**, over the data ChainReact can honestly reach through
each connection's granted scopes — Motive fuel purchases by month, Stripe
revenue by week, Shopify sales by product, QuickBooks outstanding balance by
customer, HubSpot deal value by stage, and ChainReact workflow runs as *one
source among many* (the CS-1 engine becomes the internal adapter, unchanged).

The recommended architecture is a **provider-agnostic dataset catalog**: each
analytics-capable provider declares datasets with typed fields
(date/numeric/categorical + units/currency), from which the platform derives a
**curated** set of measures and breakdowns (hybrid Option C — §6). One catalog
drives both the UI (generated client projection, killing today's hand-synced
dual catalog) and server validation. Execution stays behind the existing
adapter/cache seam with four declared modes (local SQL · provider live ·
provider snapshot · incremental sync), of which launch uses the first three.
The first implementation slice (CD-1) is the catalog contract + the ChainReact
workflow-runs adapter; the first external dataset (CD-2) is **Stripe
Payments**; the Custom Insight UI (CD-3) follows; Motive Fuel Purchases joins
in CD-4 **after** its Phase-13 live certification proves the manage-only-scope
read paths.

## 2. Product correction

The previous direction (ANALYTICS-FLEXIBILITY-AUDIT-1 → CS-2A) treated
*workflow-run* analytics as the product and connected apps as a sidecar. That
inverted the value: ChainReact's differentiation is that it already holds
OAuth-scoped access to the customer's business systems. Workflow-run charts
answer "how is my automation doing?"; connected-data charts answer "how is my
**business** doing?" — fuel spend, revenue, pipeline, invoices. The Custom
Insight builder must therefore start at **"Where is the data from?"**, with
ChainReact as simply the first entry in that list. Exact-workflow series
selection (CS-1's centerpiece) remains valid — as the series model for *one
dataset*, generalized to "each selected vehicle / product / customer gets its
own line."

Nothing from CS-1 is discarded (§16): its query engine, security posture,
metric definitions, and SQL aggregation become the internal source's
implementation. The previous CS-2A UI slice is **superseded** by CD-3.

## 3. Current connected-app analytics architecture [Verified]

### 3.1 Data path

Widget config `{provider, metricKey, filters}` → `GET
/api/analytics/sources/[provider]/data` (`requireAccount`, session-derived
account+user) → `queryAnalyticsSource`
([querySource.ts:50-108](../../../services/analytics/sources/querySource.ts)) —
registry/metric/filter-key validation before any I/O → `queryWithCache`
([cache.ts:114-230](../../../services/analytics/sources/cache.ts)) → adapter
`query()` → `NormalizedAnalyticsResult` (shape/dimensions/measures/rows/totals/
freshness/warnings/truncated,
[types.ts:98-108](../../../services/analytics/sources/types.ts)).

### 3.2 Cache & credential model

- TTL per adapter: internal 0 (always live), Google Analytics 900 s, **every
  other provider 600 s** (cache.ts `resolveTtlSeconds`, verified across all
  adapter `cacheTtlSeconds`).
- Cache key = SHA-256 over `{account, sourceUser, provider, metric, rangeKey
  (UTC-day-bucketed), groupBy, filtersHash}`; **personal-credential providers
  bake `ctx.userId` into the key** (cache.ts:132), account-class providers use
  `null` → account-shared snapshot. RLS on `analytics_source_snapshots`
  enforces the same split (migration `20260704000000`:86-99).
- Stale-fallback only on `RATE_LIMITED`/`PROVIDER_ERROR` (expired snapshot +
  `stale:true` + warning); credential/validation errors always rethrow.

### 3.3 How adapters actually compute (the honest mechanics)

Only **Google Analytics** uses a provider-side aggregation endpoint (GA4
`runReport`; scalar = no-dimension total, series = `date` dimension, ≤500 rows,
re-bucketed client-side —
[google-analytics/api.ts:41-93](../../../services/analytics/sources/google-analytics/api.ts)).
Everything else reduces client-side over bounded reads, in three patterns:

1. **One-window-list-bucketed** — Stripe (`/v1/charges`, cap 20×100=2,000
   charges), Shopify (`/orders.json`, 10×250=2,500), Slack, Notion, Google
   Calendar (6×250=1,500 events), Trello, file providers.
2. **Per-bucket count fan-out** — HubSpot (`POST /crm/v3/objects/{t}/search`
   reading only `total`, one call per bucket,
   [hubspot/index.ts:315-321](../../../services/analytics/sources/hubspot/index.ts)),
   GitHub (`/search/issues total_count`), Gmail/Outlook (`messages.list`
   counts, Gmail series capped at **300 messages/bucket**,
   [gmail/api.ts:18-22](../../../services/analytics/sources/gmail/api.ts)).
3. **Traversals** — Dropbox (10,000-entry cap), Google Drive (25-call BFS
   budget), OneDrive: the real scan-cost cliffs on large accounts.

Every series everywhere is capped at **`MAX_BUCKETS = 12`** day-aligned buckets
(granularity auto-widens). Truncation is flagged (`truncated` + warning) but
the descriptor gives the UI **no way to warn before running**, and busy
accounts silently under-count within flagged truncation (e.g., a merchant past
2,000 charges in the window).

### 3.4 The two hand-synced catalogs and the parameterization ceiling

- **UI catalog** (`connectedAppSources.ts`, `ConnectedAppSourceUi` :66-96) and
  **server registry** (`registry.ts` + per-adapter `metrics`) are two
  hand-authored lists that must agree; today they do (cross-checked metric ids
  and filter keys, incl. the `widgetFilterKeys.ts:17-24` remapping), but
  nothing generates one from the other; only tests pin sync. The server's
  richer descriptor (`visualizations`, `supportedGroupBy`) is collapsed by the
  UI to `{metricKey, entity filters}` on exactly three widget types
  (stat/line/bar).
- **Parameterization today = which metric id + at most one or two entity
  filters** (21 picker-backed via the options registry — Slack channel,
  Airtable base→table, Discord guild→channel, GA property flat, etc. — plus
  free-text GitHub `owner/repo`, Slack keyword). **No date-field choice, no
  measure choice, no grouping, no user-facing groupBy** — the `save()` payload
  has no groupBy field (WidgetConfigPanel.tsx:200-208).
- **No rate limiting or request coalescing** exists in the source layer —
  confirmed absent; the only 429 handling is error classification + the cache.
  Two identical concurrent widget queries both run the full scan.

### 3.5 Classification of the ~110 current metrics

Per the ten requested categories: (1) **fixed canned** — most metrics (Stripe,
Shopify, Notion, Gmail volume, Docs/Sheets/OneNote…); (2) **parameterized** —
entity-filter metrics (GA property, HubSpot pipeline, Slack channel, boards/
bases/folders/pages/workbooks); (3) **list/search endpoints usable for flexible
aggregation** — Stripe charges, Shopify orders, HubSpot Search, QuickBooks
`/query` (wrapped but unused by analytics), Gmail/GCal lists; (4) **historical
time-series** — created/modified/purchased-dated facts (Stripe, Shopify,
HubSpot created-over-time, GA, calendar past windows, file modified); (5/6)
**snapshot/current-state only** — unread counts, open issues/PRs/deals,
deals-by-stage, fan/follower counts, file/folder counts, Fleetio vehicle
status, upcoming meetings; (7) **resolver endpoints returning selectable
entities, not facts** — the entire options registry (vehicles, customers,
pipelines, calendars…); (8) **provider data already stored locally** — only
`workflow_runs` (+ `task_usage_events`) and the normalized snapshot cache; (9)
**fetched live, not persisted** — every adapter result beyond its ≤600 s
snapshot; (10) **cannot honestly chart** — message/email bodies and senders,
calendar attendees (privacy boundary the adapters deliberately keep), anything
beyond the scan caps presented as exact.

**Why the current system cannot deliver the intended product:** it answers
*pre-decided questions* with pre-decided aggregation; the descriptor carries no
units/currency/date-field/cardinality metadata a chart builder needs; series
are 12 buckets; the dual catalog makes each new question a 5-file hand-edit;
and there's no concept of a *dataset* the user explores — only metric ids.

## 4. Current provider metric inventory [Verified]

25 exposed providers, ~110 metric options, stat/line/bar only. Compact form
(full table with ids/labels/filters lives in
`connectedAppSources.ts` and was cross-checked this audit):

| Provider (class) | # | Mechanics | Params |
|---|---|---|---|
| stripe (acct) | 5 | one-list-bucketed | — |
| shopify (acct) | 5 | one-list-bucketed | — |
| hubspot (acct) | 7 | per-bucket search-count | pipeline |
| slack (acct) | 4 | one-list-bucketed | channel, keyword |
| notion (acct) | 4 | one-list-bucketed | — |
| mailchimp (acct) | 3 | aggregate-ish reads | audience |
| gmail (pers) | 4 | per-bucket count | label |
| google-calendar (pers) | 4 | one-window-bucketed | calendar |
| github (pers) | 5 | per-bucket search | repo |
| google-analytics (pers) | 9 | **provider aggregate (runReport)** | property |
| microsoft-outlook / -calendar (pers) | 4+4 | per-bucket count / window | folder / calendar |
| trello, airtable, monday, discord, teams, facebook, dropbox, onedrive, gdrive, docs, sheets, onenote, excel (pers) | 3–6 each | list scans / traversals / counts | boards/bases/guilds/teams/pages/folders/workbooks |

## 5. Provider-by-provider data capability matrix

Credential classes verified at
[credentialSharing.ts:47-127](../../../core/integrations/credentialSharing.ts):
**account** — stripe :52, shopify :53, hubspot :54, quickbooks :59, motive :64,
fleetio :76; **personal** — gmail :79, google-calendar :83.

### 5.1 Motive (fleet telematics) — account-class, **no analytics adapter yet**

- **[Verified]** OAuth2 + rotating refresh; scopes requested
  ([manifest.ts:77-92](../../../integrations/motive/manifest.ts)):
  `companies.read`, `fuel_purchases.manage`, `vehicles.manage`,
  `users.manage`, `messages.manage`, `company_webhooks.manage`,
  `inspection_reports.read`, `hos_logs.hos_violation`,
  `driver_performance_events.read`, `speeding_events.read`,
  `fault_codes.read`.
- **[Verified quirk]** Manage-only rows replace `.read` — requesting both 403s
  the authorize; connect-time company identity deliberately uses
  `GET /v1/companies` because `/v1/users/me` live-403'd under `users.manage`
  (manifest.ts:26-35,64-70; `docs/providers/motive/research.md:77,100-103`).
  **[Assumption — needs certification]** every GET under a manage-only scope
  (fuel list, vehicle list, driver list) is unproven until Phase-13 live cert.
- **Datasets** (wrappers in `integrations/_shared/motive/api/`, projections in
  `projections.ts:121-164` **[Verified]**): **Fuel purchase** — `purchasedAt`,
  `totalCost` + `currency`, `fuel` + `fuelUnit`, `odometer` + `odometerUnit`,
  `fuelType`, `jurisdiction`, `vendor`, vehicle/driver refs — *the single
  richest new analytics dataset in the repo*. **Vehicle / Driver** — labels +
  status only, no timestamps → entity pickers / current-state KPIs.
- **Query capability [Provider fact]**: fuel list supports server-side
  `start_date/end_date`, `fuel_type`, `vehicle_ids`; offset pagination
  `per_page` ≤ 100 with `pagination.total`; rate limits undocumented
  (429+Retry-After); **no fuel webhook** — polling only (research.md:112-121,
  207-215). Resolvers exist: `motive:vehicles`, `motive:drivers`.
- **Verdicts**: Fuel purchases → **strong candidate, gated on live cert;
  snapshot-mode first, incremental sync when history matters**. Vehicles/
  drivers → pickers + current-state KPI. Trips/mileage/HOS → **not suitable
  yet** (scopes requested but no read wrappers).

### 5.2 QuickBooks Online — account-class, **no analytics adapter yet**

- **[Verified]** OAuth2, rolling 100-day refresh, realm-scoped; single scope
  `com.intuit.quickbooks.accounting`
  ([manifest.ts:75](../../../integrations/quickbooks/manifest.ts)) —
  read-sufficient for the wrapped datasets.
- **Datasets** (`integrations/_shared/quickbooks/`, projections :102-163
  **[Verified]**): **Invoice** — `txnDate`, `dueDate`, `totalAmount`,
  `balance`, derived `paid` (balance==0 && total>0, :240), `emailStatus`,
  customerName, `currency`; **Payment** — `txnDate`, `totalAmount`,
  `unappliedAmount`, linked invoice ids (get-only; **no list wrapper**);
  **Customer** — `balance`, `active`, displayName.
- **Query capability [Provider fact]**: invoice `/query` with `CustomerRef` +
  `TxnDate >=/<=` predicates (AND-only), offset pagination
  (`STARTPOSITION/MAXRESULTS`, V2 caps 100), no total count; **Reports API
  (P&L, AR aging) and CDC exist but are UNWRAPPED** (research.md:232-238);
  throttling `ThrottleExceeded`, ~10 concurrent/realm (research.md:223-229).
  Resolvers: `quickbooks:customers/invoices/items/terms`.
- **Verdicts**: **Invoices → strong candidate with caching** (amounts +
  balance + dates + customer picker; "outstanding balance by customer" is a
  categorical over a bounded scan). Payments list → needs a small new wrapper.
  AR-aging/revenue reports → **needs Reports API wrapper** [Assumption —
  needs certification]. At scale → incremental sync via CDC (later).

### 5.3 Stripe — account-class, **adapter shipped**

- **[Verified]** OAuth Connect, `read_write` scope
  ([manifest.ts:90](../../../integrations/stripe/manifest.ts)). Charge facts:
  `created` (unix), `amount` (**minor units**), `status`, `paid`, `refunded`,
  `customer`, `currency` (`api/charges.ts:43-58`); server-side `customer` +
  `created[gte/lte]` filters; cursor pagination. **No balance_transactions /
  payouts wrappers; Stripe has no aggregate endpoint** — current adapter scans
  ≤2,000 charges/window. Resolvers: `stripe:customers/charges/prices/
  subscriptions`.
- **Verdicts**: **Payments → the strongest first external dataset** — mature
  connection, account-class, historical facts, existing adapter to evolve.
  Refunds/net revenue → needs `balance_transactions` wrapper (later). MRR →
  not honest from charges alone; defer.

### 5.4 Shopify — account-class, **adapter shipped**

- **[Verified]** Per-shop OAuth, non-refreshable offline token; scopes incl.
  `read_orders/products/customers/inventory`
  ([manifest.ts:91-126](../../../integrations/shopify/manifest.ts)). Order
  facts: `created_at`, `total_price`, `financial_status`,
  `fulfillment_status`, `currency`; analytics scan ≤2,500 orders/window.
  Products (price, inventory, type, vendor) and customers (`total_spent`,
  `orders_count`) wrapped but unused by analytics. **"Sales by product"
  requires line items** — order line_items are not in the current projection →
  new wrapper field [Assumption — needs certification of payload size].
- **Verdicts**: **Orders → strong candidate** (count/revenue by time/status).
  By-product → needs line-item projection (CD-4 work, honest only with
  quantity×price semantics decided). Inventory → current-state KPI.

### 5.5 HubSpot — account-class, **adapter shipped**

- **[Verified]** 18 scopes incl. deals/contacts/companies/tickets read
  ([manifest.ts:96-124](../../../integrations/hubspot/manifest.ts)); Search
  API with `filterGroups`, exact `total`, `after` cursor, ≤100/page, **~5
  req/s search rate limit** (`objectSearch.ts:28-30`). Current metrics are
  **deliberately count-only** (`properties:[]`) — no deal amounts read.
- **Verdicts**: Counts/created-over-time/by-stage → shipped, strong. **Deal
  value by stage / pipeline value → capability exists (amount property via
  Search), gated on a product decision to read amounts** (D11). Owners/
  pipelines resolvers ready as pickers.

### 5.6 Fleetio — account-class (credential-paste), **no adapter**

- **[Verified]** API-key + Account-Token, no scope negotiation (inherits the
  pasted user's role, [manifest.ts:24-27](../../../integrations/fleetio/manifest.ts));
  wrapped: vehicles (status, `current_meter_value`, `meter_unit`), vehicle
  statuses, meter entries, accounts; keyset pagination ≤100/page; work
  orders/service/fuel entries **researched but unwrapped**
  (`docs/providers/fleetio/research.md:28-34`). Zero connected Fleetio
  integrations in dev (VIN unverified — PROJECT_MEMORY).
- **Verdicts**: Vehicles by status → **current-state KPI/donut candidate
  only**. Maintenance-cost analytics → **not suitable yet** (unwrapped +
  uncertified). Not a launch dataset.

### 5.7 Gmail / Google Calendar — personal-class, **adapters shipped**

- Gmail: `gmail.readonly` in scopes; count-only metrics; per-sender analytics
  → **too sensitive, rejected** (content/PII boundary the adapters already
  honor). Calendar: `calendar.readonly`; the **only provider with a wrapped
  delta-sync primitive** (`syncToken` on events.list **[Verified]**) — best
  positioned for future incremental sync; attendee analytics rejected.
- **Verdicts**: keep as personal-scoped datasets (message volume, meeting
  hours) — viewers see their own data; fine as non-launch-critical entries.

## 6. Measures/dimensions/filters — Option A vs B vs C

- **Option A (only predefined measures)** — safest, matches today; but every
  new question is a code change, and it's why the current system feels canned.
- **Option B (user picks any field)** — maximum flexibility; fails safety:
  summing ids, averaging enum codes, grouping by free text, mixing
  currencies; also demands per-provider field introspection we don't have.
- **Option C (hybrid — RECOMMENDED):** each dataset declares a **typed,
  curated field list** (kind: date/numeric/categorical/entity; unit; currency
  behavior; cardinality class; sensitivity). The **platform derives the
  measure/dimension menu mechanically**: `count` always; `sum/avg/min/max`
  only over fields declared `numeric` + `measurable`; `distinct count` only
  where declared reliable; breakdowns only over fields declared
  `dimensionable` (bounded cardinality); date grouping only over declared
  `dateFields`. Providers may add named derived measures (e.g. QuickBooks
  `outstanding_balance` = sum(balance) where !paid). The UI never shows raw
  field names — it shows the curated labels.

Option C prevents each listed failure by construction: ids aren't
`measurable`; free text isn't `dimensionable`; currency-bearing fields carry
`currency: "per-record"` forcing single-currency series or a currency
breakdown; unit mismatches are blocked because measures carry units;
current-state datasets declare `historicalDateFields: []` so time charts are
simply not offered; scan caps are declared so the UI warns before running.

## 7. Proposed customer experience (CD-3)

Plain-language labels **[Recommendation]**: **App** (source) → **Data** ("What
do you want to look at?") → **Show** (measure) → **Group by** (breakdown) →
**Only include** (filters) → **Separate lines for** (series) → **Time period**
→ **Chart type**.

Walkthrough: Sarah runs a small fleet. Add widget → Custom insight → **App:
Motive** (already connected; apps she hasn't connected show a connect CTA, not
an error) → **Data: Fuel purchases** → **Show: Total cost** (menu: Purchases ·
Total cost · Average cost · Total gallons — derived from the declared fields)
→ **Group by: Month** → **Separate lines for: Vehicles → choose 4 trucks**
(the `motive:vehicles` resolver powers the picker) → live preview renders from
the real query route with freshness ("as of 5 minutes ago") → she names it
"Fuel spend by truck" and saves; it persists as widget JSONB like every other
widget. A teammate opening the shared dashboard sees the same data (Motive is
account-class). Nothing exposes API fields, JSON, scope strings, or provider
endpoint names; unavailable data says "Connect Motive" / "Reconnect Motive to
refresh access" / "This data isn't included in your Motive plan" in plain
words.

## 8. Provider-agnostic catalog contract [Recommendation]

Evolves `AnalyticsSourceMetric` (types.ts:60-70) instead of replacing the
adapter seam. Conceptual shape (final field names to be settled in CD-1
against `contracts/` conventions):

```ts
// contracts/analyticsCatalog.ts (client-safe; no SQL, no secrets, no authz)
type AnalyticsSourceCatalog = {
  source: { id: string; providerId: string; label: string;
            credentialMode: "account" | "personal" };
  datasets: AnalyticsDatasetDefinition[];
};

type AnalyticsDatasetDefinition = {
  id: string;                    // "fuel_purchases"
  label: string;                 // "Fuel purchases"
  description?: string;
  fields: AnalyticsFieldDefinition[];      // curated, typed (§6)
  measures: AnalyticsMeasureDefinition[];  // derived + named-derived
  dimensions: AnalyticsDimensionDefinition[];
  filters: AnalyticsFilterDefinition[];    // optionsSource-bound pickers
  dateFields: { id: string; label: string; historical: boolean }[];
  supportedCharts: ("kpi"|"line"|"bar"|"table"|"donut")[];
  seriesBy?: { dimensionId: string; max: number; topN: boolean;
               explicit: boolean }[];
  freshness: { mode: "live"|"cached"; ttlSeconds: number };
  queryLimits: { maxRecordsScanned?: number; maxBuckets: number;
                 maxRangeDays: number; previewSafe: boolean };
  scopeRequirements: { scopes: string[]; friendlyReason: string }[];
  executionMode: "local_sql"|"provider_live"|"provider_snapshot"
               | "incremental_sync";
  compare: boolean; drilldown: boolean;
};
```

Key bindings to existing infra: `filters[].optionsSource` names an id in the
**existing options registry** (§ cross-cutting audit — analytics pickers
already work this way, e.g. `gmail:labels`, `google-analytics:properties_flat`,
registered per-widget in `services/options/_registry.ts` **[Verified]**);
`scopeRequirements` checks against the **existing `integrations.scopes`
column** (migration `20260505000002`:25 **[Verified]**); `credentialMode`
mirrors `credentialSharing.ts`. **One catalog, two projections**: the server
holds the full definition; a generated client-safe projection replaces the
hand-maintained `connectedAppSources.ts` descriptor (killing the dual-catalog
sync burden — §3.4). No executable SQL or code ships in the catalog.

## 9. Query contract [Recommendation]

Generalize CS-1's proven `AnalyticsQuery` shape from implicit-dataset to
explicit-dataset:

```ts
type ConnectedAnalyticsQuery = {
  source: string; dataset: string;           // catalog ids, validated
  measure: string;                            // catalog measure id
  dimension: string | null;                   // catalog dimension id | "time"
  dateField?: string; timeGrain?: "auto"|"day"|"week"|"month";
  filters: { [filterId: string]: string[] | boolean };  // catalog-declared only
  series?: { by: string; mode: "top"|"explicit"; ids?: string[]; topN?: number };
  range: preset | { from; to };               // CS-1 semantics, [from,to)
  compare?: "previous_period" | null;
  sort?; limit?;
};
```

Server obligations carry over from CS-1 verbatim (account from session only;
capability validation against the catalog with typed `INVALID_QUERY`; entity
ids validated where locally validatable — workflows via membership, provider
entity ids by format + the connection's own token scope; bounded results;
stable ids + labels; UTC). The CS-1 endpoint remains; CD-1 decides whether
`/api/analytics/query` grows a `source/dataset` envelope or a sibling route
`/api/analytics/insights/query` fronts both — recommendation: **one new
route speaking the connected contract, with the ChainReact adapter delegating
to `runAnalyticsQuery` internally** (no breaking change to CS-1).

## 10. Normalized result contract [Recommendation]

**Extend, don't replace.** Today's `NormalizedAnalyticsResult`
(types.ts:98-108) loses units, currency, series identity, and null-vs-zero.
CS-1's `AnalyticsQueryResult` has kind/series/buckets/null-semantics but no
units either. Converge on a v2 chartable result (CD-1):
kind (kpi/time_series/categorical/table) · resolved grain + normalized range ·
series `{id, label, entityState?}` with `number|null` cells ·
`valueMeta { unit: "count"|"currency"|"hours"|"ms"|"percent"|"gallons"|…;
currency?: string }` · totals · `freshness` (reuse existing schema:
cached/age/ttl/stale) · `sourceAttribution` (provider label + personal/"Your
X" prefix, as widgets render today) · warnings · `truncated` +
`truncationKind` ("scan_cap"|"row_cap"|"provider_sampled") · optional
`drilldown` metadata (opaque token for a later slice, no raw ids required) ·
provider-specific extras only under a namespaced `providerMeta`. Zod-validated
at the cache boundary exactly as today.

## 11. Execution modes [Recommendation]

| Mode | Use when | Launch users |
|---|---|---|
| **local_sql** | facts already in our DB | ChainReact workflow runs (CS-1 RPC) |
| **provider_live** | provider has honest aggregate endpoints | Google Analytics today; QuickBooks Reports later |
| **provider_snapshot** | bounded window scan is honest + affordable | Stripe, Shopify, HubSpot, QBO invoices, Motive fuel (existing cache model) |
| **incremental_sync** | history exceeds scan caps / retention, or no date-filtered read | **none at launch — deferred** (design: account-scoped `analytics_facts` table, CASCADE like snapshots, cursors per connection, cron refresh; NOT trigger_resources, which the infra audit confirmed is subscription-state, not a data store) |

Per-mode obligations (cache/freshness/limits/errors) inherit the existing
snapshot-cache contract; new obligations for all modes: declared
`queryLimits` surfaced pre-run; freshness always rendered; personal isolation
via the existing cache-key + RLS pattern; retention/deletion via `ON DELETE
CASCADE` (the purge orchestrator pattern the infra audit verified); scope
revocation → typed `MISSING_CREDENTIAL`/reconnect states (existing
`needs_reconnect_at` flow). **Explicitly rejected:** copying all provider data
by default; live-scanning thousands of records per dashboard load (scan caps
stay, and become *declared*).

## 12. Cache, performance, and rate limits

Load model: 20 custom widgets × cold cache = up to 20 provider queries, some
fanning out ≤12 sub-calls (HubSpot/GitHub/Gmail patterns) — ~100+ provider
calls worst-case today, with **no limiter and no coalescing [Verified]**.
Recommendations (CD-2/CD-3 scope):

- **In-flight coalescing** keyed by cache key (first request runs, others
  await) — closes the duplicate-widget/multi-member stampede.
- **Per-account+provider fixed-window throttle** reusing the proven
  Postgres-RPC limiter pattern (`services/apiKeys/rateLimit.ts` /
  `services/mcp/rateLimit.ts` — pattern verified reusable; needs a provider
  bucket dimension + table/RPC).
- Keep TTL defaults (600 s / 900 s GA / 0 internal); add per-dataset TTL in
  the catalog; keep stale-while-error; add **stale-while-revalidate** for
  dashboard loads (serve snapshot, refresh in background) as a CD-3 option.
- Bounded concurrency per dashboard load (≤4 provider queries in flight),
  request cancellation on filter change (CS-2A design carries over).
- Declared `maxRecordsScanned`/`maxRangeDays` per dataset; preview uses the
  same limits (`previewSafe` gates live preview for expensive datasets).

## 13. Scope & credential behavior

- **Connection missing** → connect CTA (exists today per provider descriptor).
- **Reconnect needed** → existing `needs_reconnect_at` + notification flow
  (verified) → "Reconnect X to refresh access."
- **Optional scope absent / scope added after connect**: catalog
  `scopeRequirements` vs the connection's recorded `integrations.scopes`
  **[Verified column]** enables a *proactive* check (today detection is only
  error-driven via `INTEGRATION_SCOPE_REQUIRED`/`PROVIDER_REAUTH_REQUIRED`).
  UI copy: "This chart needs additional Motive permissions — reconnect to
  grant them." Never raw scope strings.
- **Provider plan lacks endpoint** (Fleetio Professional+, Motive plan gates)
  → typed `PROVIDER_ERROR` subtype with plain copy.
- **Personal credentials on shared dashboards**: keep the shipped model —
  config is shared, **data is per-viewer** (cache key + RLS enforce it;
  proven by the snapshots suite). A viewer without their own connection sees
  the connect CTA, never the creator's data. **Do not weaken this** (D6).
- Account-class providers (Stripe/Shopify/HubSpot/QBO/Motive/Fleetio) are
  account-shared by classification — every member sees the same chart.

## 14. Data honesty rules (contract-enforced)

1. **Current-state datasets cannot render time-series** (no
   `historical: true` date field → line charts not offered). No invented
   history.
2. **Currency**: currency-bearing measures are single-currency per series;
   mixed → currency becomes a forced breakdown or the dominant-currency value
   carries a structured `currency` + warning (today's warning-string approach
   is upgraded to structured metadata).
3. **Units** in `valueMeta` always; no unit-mixing on one axis (CS-1's
   one-measure-per-chart rule carries over).
4. **Truncation**: declared caps warn pre-run; hit caps render a visible
   badge (CS-2A design) with `truncationKind`; never silent.
5. **Freshness** always rendered for non-live modes ("as of N min ago";
   stale banners on fallback).
6. **Pending vs completed / refunds / negatives**: dataset defines status
   semantics (Stripe `succeeded` vs `refunded` are distinct filters; refunds
   excluded from gross until balance_transactions lands — labeled "gross").
7. **Deleted/archived records**: dataset declares inclusion (QBO paid derived
   rule verified; Shopify cancelled orders filterable via
   `financial_status`).
8. **High-cardinality**: only `dimensionable` fields group; Top-N + "Other"
   for entity dimensions above the row cap.
9. **Renamed entities**: current-name labels with stable ids (CS-1 semantics
   generalized); snapshot labels refresh with cache.
10. **Rates/averages**: null (not 0) on empty denominators — the CS-1
    canonical rule applies platform-wide via shared derivation.
11. Distinct-count only where the provider makes it reliable (declared).

## 15. Multi-provider charts

Launch: **one source + one dataset per chart** (D2, recommended firmly —
different currencies/timezones/freshness/latency and cross-source failure
modes make combined charts a correctness minefield; the audit found no
existing infra for cross-source joins). Stage 2 (post-launch evidence): two
datasets from the *same provider* sharing one time axis. Stage 3 (deferred
indefinitely): cross-provider overlay as *visual overlay of two saved
insights* (each remains its own query — no data joining), only if demand
proves out. Duplicate-fact risk (Shopify order paid via Stripe) is a
documentation/labeling problem at stage 3 — another reason to defer.

## 16. CS-1 disposition (reframe, not rewrite)

- **Remains as-is**: `analytics_runs_aggregate` RPC, `insightQuery.ts`
  security posture (session-account, membership-validated workflow ids,
  non-leaking errors), `metricDefinitions.ts` (canonical math),
  `POST /api/analytics/query` (kept as the internal engine's direct
  interface; nothing else consumes it yet **[Verified]** — shipped this arc,
  no UI callers).
- **Becomes an adapter (CD-1)**: a `chainreact` source with dataset
  `workflow_runs` whose catalog is *generated from* CS-1's capability matrix
  (measures runs/succeeded/failed/success_rate/avg_duration; dimensions
  time/workflow/status/trigger_source; series by workflow/status; the 8-series
  cap; compare). The adapter maps the connected query contract onto
  `runAnalyticsQuery` calls — a thin translation, no engine change.
- **Generalize later, only when proven**: the capability-matrix *concept*
  (per-measure dimension rules) generalizes into dataset definitions; the RPC
  does **not** generalize (each source keeps its own execution).
- **Not discarded**: parity tests, metric definitions, and the perf evidence
  all stand.

## 17. Recommended launch providers & datasets

| # | Source · Dataset | Measures | Dimensions / Series | Filters | Date field | Charts | Mode | Scopes | Freshness | Known limits |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ChainReact · Workflow runs | runs, succeeded, failed, success rate, avg duration | time, workflow, status, trigger source / workflow, status (≤8) | workflows, statuses, sources, tests | started | KPI, line, bar, table | local_sql | — | live | CS-1 caps |
| 2 | Stripe · Payments | count, gross amount, avg amount | time, status, currency / status (≤2–3) | status, currency, customer (picker) | created | KPI, line, bar, table | provider_snapshot | read_write (granted) | 600 s | 2,000-charge scan cap → declared |
| 3 | Shopify · Orders | count, revenue, avg order value | time, financial status / status | financial status | created_at | KPI, line, bar, table | provider_snapshot | read_orders (granted) | 600 s | 2,500-order cap; by-product deferred to line-item work |
| 4 | HubSpot · Deals | count; **deal value gated on D11** | time, stage, pipeline / stage | pipeline (picker) | createdate | KPI, line, bar, table | provider_snapshot | granted | 600 s | search ~5 req/s; per-bucket fan-out |
| 5 | QuickBooks · Invoices | count, total amount, **outstanding balance** | time, customer, paid status / customer (≤8) | customer (picker), paid | txnDate | KPI, line, bar, table | provider_snapshot | accounting (granted) | 600 s | AND-only predicates; 100/page; no total |
| 6 | Motive · Fuel purchases | purchases, total cost, avg cost, total fuel | time, vehicle, fuel type, jurisdiction / vehicle (≤8) | vehicles (picker), fuel type | purchasedAt | KPI, line, bar, table | provider_snapshot | fuel_purchases.manage **[gated on Phase-13 cert]** | 600 s | offset pages ≤100; read-under-manage unverified |

Order of shipping: 1 (CD-1) → 2 (CD-2) → UI (CD-3) → 3/4/5 individually, and 6
**only after** Motive live certification (CD-4). Gmail/GCal/GA and the other
19 existing providers keep their current metrics, migrating onto the catalog
opportunistically (each is a small per-provider slice, not a big-bang).

## 18. Implementation slices (replaces CS-2A sequence)

**CD-1 — Catalog + connected query contract + ChainReact adapter (backend).**
User-visible: none. Backend: `contracts/analyticsCatalog.ts` + connected query
contract + converged result contract; catalog registry (evolves
`sources/registry.ts`); generated client projection replacing the hand catalog
*shape* (UI keeps rendering old widgets untouched); `chainreact.workflow_runs`
adapter delegating to CS-1. Security: same gates; catalog ids validated.
Tests: catalog schema, adapter parity vs direct CS-1 calls, projection
generation. Migration: none. Risk: low-med. Scope: medium.

**CD-2 — Stripe Payments dataset end-to-end (backend).** Evolve the Stripe
adapter to the dataset contract: measures/dimensions above, structured
currency handling, customer-filter via existing resolver, declared limits +
pre-run warnings; **in-flight coalescing + per-account/provider throttle**
(the limiter table/RPC = this slice's only migration, applied via db:push).
Tests incl. golden normalized output, two-account isolation, cache-key
isolation, rate-limit behavior, stale fallback. Risk: medium. Scope: medium.

**CD-3 — Custom Insight UI.** App → Data → Show → Group by → Only include →
Series → Time → Chart; live preview (respecting `previewSafe`); save as widget
JSONB (additive `insight` config); freshness/truncation/connect/reconnect
states; the CS-2A chart work (8-color palette, legend toggles, a11y table
fallback) lands here. Backend: none beyond CD-1/2. Risk: medium-high (largest
UI). Scope: large — split CD-3a (builder + line/KPI) / CD-3b (bar/table +
polish).

**CD-4 — Additional launch datasets, one slice each:** Shopify Orders; HubSpot
Deals (D11 decides value measures); QuickBooks Invoices; **Motive Fuel
Purchases (prereq: Phase-13 live cert)**; then opportunistic migration of
existing providers onto the catalog.

**CD-5 — Drill-down, custom range picker UI, compare UI, donut-where-honest,
export.** Uses CD-1's drilldown metadata; Runs-page param verification from
the CS-3 plan folds in here for the ChainReact source.

**CD-6 (deferred until a dataset demands it) — Incremental sync
infrastructure** (`analytics_facts`, cursors, cron, retention policy D17) —
gated on real evidence that snapshot mode's caps hurt a launch dataset.

Each slice: local-only commits, no push without approval; migrations only
where listed; CD-2's limiter and CD-3's UI ship dark until their slice
completes verification.

## 19. Product-owner decisions (recommendations)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Measures model | **Option C hybrid** — curated typed fields, platform-derived standard measures, provider-named derived measures (§6) |
| D2 | Sources per chart | **One source + one dataset at launch**; same-provider pairs stage 2; cross-provider deferred |
| D3 | Live provider queries during dashboard load | **Yes, but only through the snapshot cache** (TTL + coalescing + throttle); no uncached fan-out on load; `refresh` stays explicit |
| D4 | Background sync required at launch? | **No** — snapshot mode covers launch datasets; CD-6 only on evidence |
| D5 | Freshness indicators | **Yes, always** for non-live modes ("as of…", stale banners) |
| D6 | Personal-credential widgets on shared dashboards | **Keep per-viewer data** (shipped model); never show another member's data |
| D7 | Max provider-backed widgets per dashboard | **12** (within the 48-widget cap), with ≤4 concurrent provider queries per load |
| D8 | Max series / max range | **8 series** (CS-1 D5 carries over) / **366 days** |
| D9 | Chart types at launch | **KPI, line, bar, table**; donut only for declared part-to-whole (e.g. vehicles by status, deals by stage) |
| D10 | Exact record/entity selection | **Yes** — exact entity series (vehicles, customers, workflows) via existing resolvers; it's the CS-1 series model generalized |
| D11 | Read HubSpot deal **amounts** (and similar value fields)? | **Yes, as declared measurable fields** — value analytics is the product; keep amounts out of logs/errors; revisit only if a customer objection pattern emerges |
| D12 | Arbitrary numeric-field selection by users | **No** — curated fields only (Option C) |
| D13 | Plan gating | **All plans at launch** (adoption first); revisit with billing tiers |
| D14 | Launch provider set | **ChainReact + Stripe first; Shopify/HubSpot/QuickBooks next; Motive on cert** (§17) |
| D15 | Cross-provider charts | **Defer** (stage 3, overlay-only if ever) |
| D16 | Export | **Keep existing dashboard JSON export; add per-chart CSV in CD-5** (client-side from fetched result — no new data exposure) |
| D17 | Retention of synced provider facts (CD-6) | **Decide at CD-6**; default recommendation: rolling 13 months, account-purge CASCADE, delete-on-disconnect |
| D18 | Reopen previous CS-2A UI slice? | **Superseded by CD-3** — same chart/UX work, connected-data-first framing |

## 20. Security model

Carries the verified patterns forward; new rules in bold:

- No account id from clients anywhere (CS-1/`requireAccount` pattern).
- Membership at the route; dataset/measure/filter ids validated against the
  catalog server-side; **saved widget configs re-validated at query time —
  a stale/hand-edited config can never widen access** (registry re-validation
  is already the pattern).
- Credential resolution only through `getActiveForExecution` + the
  credential-sharing seam; personal isolation in cache key AND RLS (proven
  suites). **Provider entity ids in filters execute only under the
  connection's own token** — a foreign id yields provider-side empty/404, and
  ids are format-validated; never interpolated into local SQL.
- Sensitive fields never enter catalogs (senders, attendees, bodies, PII
  free text); catalog review = provider-slice review gate. Logs/errors carry
  codes, not values (existing no-leak posture).
- New tables (limiter buckets, future `analytics_facts`) follow the verified
  purge pattern: `account_id … ON DELETE CASCADE` (+ `source_user_id`
  CASCADE for personal rows) so account deletion needs no orchestrator edits;
  disconnect deletes provider-derived facts for that connection (CD-6 rule).
- Scope handling never prints raw scope strings; proactive scope checks read
  the recorded `integrations.scopes` server-side only.
- Webhook-fed analytics data (CD-6, if ever): signature-verified, per the
  existing trigger webhook posture; never trusted for authz.

## 21. Performance model

Budgets **[Recommendation]**: cached widget p95 ≤ 150 ms (snapshot read);
uncached provider query p95 ≤ 3 s (bounded scan) with per-dataset declared
caps; dashboard cold load ≤ 4 concurrent provider queries, remainder queued;
per-account+provider throttle sized to the worst per-bucket fan-out (12
calls) × 3 widgets/min; coalescing makes duplicate widgets O(1). Existing
scan caps stay and become catalog-declared so the UI can warn pre-run. The
365-day + large-account cases route to `provider_live` (GA/QBO reports) or
CD-6 sync rather than bigger scans.

## 22. Testing strategy (implementation slices must prove)

Catalog: schema validation; every dataset's measures/dimensions reference
declared fields; projection generation (client catalog ≡ server catalog).
Capability: valid/invalid combination sweep per dataset (CS-1 pattern).
Adapters: golden normalized-output tests per dataset; contract tests every
adapter must pass (bounds, truncation flagging, freshness, unit/currency
metadata, null-vs-zero); pagination and partial-page behavior; provider-error
classification incl. 429→stale-fallback. Security: two-account isolation per
dataset (gated DB suites, existing pattern); personal-credential cache/RLS
isolation (extend the snapshots suite); scope-missing → typed state (no raw
scopes); revoked/disconnected → MISSING_CREDENTIAL; saved-widget re-validation
(tampered config rejected). Limits: rate-limiter buckets; coalescing (N
concurrent identical queries → 1 provider call); query cancellation;
multi-widget load bounded concurrency; one failing provider widget doesn't
break the dashboard (existing pattern, keep pinned). UI (CD-3): builder
grey-out from catalog; preview states; freshness/truncation badges; save
round-trip. Live certification: per-provider Phase-13-style pass before
`exposed: true` for each new dataset (Motive explicitly gated). Mocks only at
the true provider HTTP boundary, per `docs/rules/testing-strategy.md`.

## 23. Risks & unresolved questions

1. **Motive read-under-manage 403 risk** — the flagship fleet dataset is
   unverified until live cert; sequencing puts it after Stripe deliberately.
2. **Scan-cap honesty at scale** — big merchants exceed 2,000/2,500-record
   windows; mitigated by declared caps + warnings; real fix is CD-6 or
   provider_live; don't launch "revenue" to enterprise-size accounts without
   one of those.
3. **HubSpot search rate (~5 req/s) × per-bucket fan-out** — throttle +
   coalescing in CD-2/CD-4 are prerequisites for exposing more HubSpot
   series.
4. **Dual catalog during migration** — old metrics and new datasets coexist
   until per-provider migration completes; the generated projection must
   support both shapes to avoid a big-bang.
5. **Currency/unit correctness** — Stripe minor units vs QBO/Shopify decimal
   strings; per-dataset normalizers + golden tests are the guard.
6. **Line-item work for Shopify by-product** — payload size and pagination
   unmeasured [Assumption — needs certification].
7. **QuickBooks Reports API** unwrapped — outstanding-balance-by-customer is
   honest from invoice scans, but P&L-grade reporting needs the Reports
   wrapper (own slice, own cert).
8. **No limiter exists today** — pre-existing exposure for current widgets;
   CD-2 closes it.

## 24. Explicit non-goals

No Power BI/Tableau/warehouse ambitions; no arbitrary SQL/JSON/formulas; no
cross-account or platform-wide analytics; no automatic full-provider
ingestion; no unlimited dimensions/ranges/series; no unbounded live scans; no
sensitive-field or free-text charting; no cross-provider joins at launch; no
uncurated field exposure; no dashboard-shell replacement; no CS-1 discard; no
new OAuth scopes in this arc (datasets ride granted scopes; scope additions
are their own provider slices).

## 25. Files inspected & commands run

**Read directly by the author:** the two parent analytics docs + CS-1 outcome;
`docs/PROJECT_MEMORY.md` (Motive/Fleetio status); CLAUDE.md; integrations
directory listing.

**Via four delegated audit passes (findings cited inline):**
`services/analytics/sources/**` (types, registry, querySource, cache; deep:
stripe, shopify, hubspot, gmail, github, google-calendar, google-analytics,
internal; classification skim of the rest); `repositories/
analyticsSourceSnapshots.ts`; `features/analytics/connectedAppSources*.ts`,
`widgetFilterKeys.ts`, `WidgetConfigPanel.tsx`, `WidgetConnectedApp*`;
`core/integrations/credentialSharing.ts`; `app/api/options/[source]/route.ts`,
`services/options/{resolveOptionsSource,_registry,credentialPolicy}.ts`;
`services/apiKeys/rateLimit.ts`, `services/mcp/rateLimit.ts`;
`services/triggers/*` (subscriptionRegistry), `repositories/webhookEventDedup.ts`;
`services/accounts/accountPurge.ts`, `repositories/accountPurge.ts`;
migrations `20260505000002`, `20260507000000`, `20260622000000`,
`20260624000000`, `20260625000000`, `20260702000000`, `20260704000000`;
`services/execution/classifyHandlerError.ts`; provider surfaces for motive,
quickbooks, stripe, shopify, hubspot, fleetio, gmail, google-calendar
(manifest.ts, oauth/connect paths, `api/` wrappers, `projections.ts`,
`options/`, `research.md` / `docs/providers/*`); `integrations/
microsoft-powerbi/manifest.ts` (context only).

**Commands actually run:** ChainReactV2 MCP context pulls (project memory —
earlier this session), directory listings (`ls integrations`), `git add` /
`git commit` for this doc. No build, lint, test, or db commands — docs-only,
nothing implemented, nothing applied.

## 26. Acceptance criteria & hard boundaries

**This slice:** this document exists, every current-state claim carries a
citation and label, no source/test/migration/UI/scope/cache change, docs-only
local commit, nothing pushed/deployed/applied. **Implementation must later
meet:** catalog-driven UI with zero raw field/scope/JSON exposure; honest
freshness/truncation on every chart; per-viewer personal-credential isolation
preserved; bounded queries with declared limits; one-source-per-chart; CS-1
untouched as the internal engine. **Recommended next step: CD-1.**
