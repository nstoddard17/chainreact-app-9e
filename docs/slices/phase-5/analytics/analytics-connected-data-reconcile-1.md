# ANALYTICS-CONNECTED-DATA-RECONCILE-1

Integrate the completed Custom Insights arc — the connected-analytics platform,
its builder UI, and the public QuickBooks and Shopify datasets — onto the
latest local `v2-main`.

Integration and verification only. No new provider, no new feature, no
migration.

**Result: integrated by clean fast-forward, zero conflicts.**

---

## 1. Starting state

| | |
|---|---|
| Local `v2-main` HEAD | `64f57de39` *docs: concurrent-session branch rule + record v2-main reconciliation* |
| `origin/v2-main` HEAD | `64f57de39` — **identical**; `git rev-list --left-right --count` reported `0 0` (no divergence) |
| Shared main working tree | on branch `custom-nodes-audit-1`, **clean** — not touched by this batch |
| Source branch | `cd4c-shopify-orders` @ `550187791` |
| Backup branch | `backup/v2-main-before-analytics-reconcile-2026-07-25` → `64f57de39` (verified; **not pushed**) |
| Integration worktree | `C:/tmp/recon1-wt` |
| Integration branch | `analytics-reconcile-1` |

`v2-main` had **not** moved since the `64f57de39` base used by the QuickBooks
integration batch, so the earlier assumption held — but it was verified rather
than assumed, as required.

## 2. Ancestry map

```
git merge-base v2-main cd4c-shopify-orders  →  64f57de39   (= v2-main HEAD exactly)
git log --merges v2-main..cd4c-shopify-orders  →  0 merge commits
git log --left-right --cherry-pick v2-main...cd4c-shopify-orders  →  all 10 marked ">"
```

Every listed commit was **MISSING** from `v2-main`: `550187791`, `f7ea1d4b8`,
`fb8242e22`, `33065738a`, `bdb39411e`, `f52acdd89`, `ba791a2fc`, `4ebc29317`,
`13c94f484`, `734f62a84`.

Because the merge-base **equals** `v2-main`'s HEAD, the source branch is a
strict linear descendant. `--cherry-pick` found **no equivalent commits**
already applied — nothing was a duplicate of work already on `v2-main`, and
nothing was partially overlapping.

**Commits deliberately NOT integrated:** `b5897ed8e` (CD-4A Motive
certification). It is not an ancestor of any required commit — the QuickBooks
integration batch had already skipped it, and the Shopify branch descends from
that skip. It is docs plus a Motive-only harness with **no public dataset**, so
it stays on `cd4a-motive-fuel` for a future resumption.

## 3. Integration method and conflicts

```
git worktree add C:/tmp/recon1-wt -b analytics-reconcile-1 v2-main
git merge --ff-only cd4c-shopify-orders
```

A **fast-forward** was the correct method precisely because the ancestry
permitted it: cherry-picking a linear range whose base already equals the
target would have rewritten ten commits for no benefit and lost their exact
identity. The resulting tree is byte-identical to `cd4c-shopify-orders`
(`git diff --quiet cd4c-shopify-orders HEAD` → clean).

**Conflicts: none.** Nothing on `v2-main` had touched any file in the arc since
`c9291aa27` (CD-3A's parent, already on `v2-main`), so no conflict-resolution
rule had to be applied and no parallel-session work was overwritten or
reverted.

Logical order was preserved automatically by the fast-forward: CD-3A → CD-3A
cert spec → CD-3B → QuickBooks Invoices → QuickBooks resolver → Shopify Orders.

**Files changed vs. base:** 102. The shared/legacy-touching subset (everything
outside new `insights/` code, docs, tests and harnesses) is:
`app/analytics/page.tsx`, `app/api/options/[source]/route.ts`,
`app/globals.css`, `contracts/analytics*.ts`, `core/analytics/money.ts`,
`features/analytics/*.tsx`, `integrations/_shared/quickbooks/api/customers.ts`,
`integrations/quickbooks/options/customers.ts`, `lib/api/analytics.ts`,
`lib/api/options.ts`, `services/analytics/dashboards.ts`,
`services/analytics/sources/{quickbooks/api.ts,shopify/insightOrders.ts,stripe/buckets.ts}`,
`services/options/{types.ts,resolveOptionsSource.ts}` — each an expected part
of the arc.

## 4. Resulting product inventory (verified at source AND runtime)

Verified by reading `services/analytics/insights/registry.ts` **and** by
executing the real registry + client projection:

```
registered:            chainreact=public quickbooks=public shopify=public stripe=preview
PRODUCTION visible:    chainreact, quickbooks, shopify
DEVELOPMENT visible:   chainreact, quickbooks, shopify, stripe
chainreact.workflow_runs  charts=[kpi,line,bar,table,donut] partToWhole=[status]                          measures=5
quickbooks.invoices       charts=[kpi,line,bar,table,donut] partToWhole=[paid_status]                     measures=5
shopify.orders            charts=[kpi,line,bar,table,donut] partToWhole=[financial_status,fulfillment_status] measures=4
prod projection leaks scopes/internals: NONE
```

* **Public:** ChainReact → Workflow runs · QuickBooks → Invoices ·
  Shopify → Orders.
* **Preview (development only):** Stripe → Payments — exposure declaration
  untouched.
* **Absent:** Motive Fuel purchases · HubSpot (no dataset exists;
  `grep hubspot|motive services/analytics/insights/` → no match).
* Each dataset stays registered **provider-locally**; no central provider-name
  switch exists anywhere in the routing or the builder.
* **Chart types:** KPI/number, line, bar, selectable table, and donut gated to
  declared part-to-whole dimensions.
* **Dashboard actions present in source:** `createDashboard`,
  `switchDashboard`, `deleteDashboard`, `renameDashboard`, `duplicateWidget`,
  `restoreDefaultLayout` — plus per-widget malformed-config salvage and
  owner/admin vs. member restrictions, all covered by the passing dashboard
  suites.

## 5. QuickBooks verification

Preserved (proven by the 1523-test analytics run and the provider suites):
Invoice count · Total invoiced amount · Average invoice amount · Outstanding
balance · Outstanding invoice count; **no time grouping and no period
comparison for current-state outstanding balances** (rejected in the catalog,
in `validateQuery`, and again in the aggregator); no "revenue" labelling;
integer minor-unit money with deterministic half-up rounding;
`MIXED_CURRENCY` on multi-currency; no implicit USD; public exposure.

Resolver: server-side case-insensitive **contains** search on display name;
customers past the first 100 reachable (150-customer fixtures find #137);
quotes, `%` and `_` escaped so they stay literals; saved selections relabelled
via the optional `selected` passthrough; existing QuickBooks action fields use
the same resolver; **no QuickBooks-specific picker**; aggregate results and
snapshots carry a per-account salted surrogate, never a raw QuickBooks
customer id.

## 6. Shopify verification

Preserved: Order count · Paid order count (exactly `paid`) · Total order
amount · Average order amount; payment status, fulfillment status and
cancellation state (from `cancelled_at`, never inferred from a status);
**test orders excluded by default** with an explicit "Include test orders"
boolean; Shopify's null fulfillment normalized to a first-class
**Unfulfilled**; out-of-domain statuses → **Unknown**; no "revenue"/"net
sales" label; refund amounts never invented (refunded orders keep their
original order totals, exactly as the measure's own description states);
`MIXED_CURRENCY` rejection; missing-currency warning with no assumed USD;
**2,500-order scan cap** with disclosed newest-created bias; Link cursors stay
server-only; public exposure.

**Fixed Shopify Analytics widgets unchanged** —
`git diff 64f57de39 HEAD -- services/analytics/sources/shopify/{api,index,buckets}.ts`
is empty; the insights scanner is a separate new file
(`insightOrders.ts`).

## 7. Exposure enforcement

Enforced in two server-side places, both exercised: the client projection
filters non-exposed sources before the DTO reaches the browser, and
`runConnectedAnalyticsQuery` throws the non-leaking `UNKNOWN_SOURCE` for a
crafted query against a preview/hidden source in production — indistinguishable
from a source that does not exist. Exposure is a declarative field; **no
provider-name check exists** in the route or the UI. Stripe's `preview` was not
changed.

## 8. Options and picker compatibility

`selected` remains **optional** on `OptionsResolverContext`, so every
pre-existing resolver and every hand-built caller (AI tools, resource links,
smoke harnesses) compiles and behaves identically — proven by a dedicated
backward-compatibility test plus the 1040-test builder run. The QuickBooks
resolver uses it to relabel saved values; the service always passes a
normalized, bounded array; debounce and stale-response protection are intact;
selections survive search changes; options expose only `{value, label}`; and
**no generic pagination requirement was introduced** (`hasMore` remains the
pre-existing UI hint).

## 9. Legacy behavior

No regression in: the Analytics Overview, fixed connected-provider widgets
(Stripe and Shopify included), dashboard JSON export, range selector,
dashboard create/switch/delete, legacy widget cache keys, the CD-2
cache/coalescing/limiter, QuickBooks actions/triggers/webhooks, Shopify
actions/webhook trigger, OAuth/refresh/reconnect/scopes, the CS-1 route
(`app/api/analytics/query/route.ts`) and the connected Insights route
(`app/api/analytics/insights/query/route.ts`) — both present. No widget was
migrated.

## 10. Database

**No migration, no `db:push`, no grant/RLS/table/snapshot-storage change.**
`git diff --name-only 64f57de39 HEAD -- supabase/migrations` → **0 files**;
`lint:migrations` → OK. Nothing in the integration required one.

## 11. Focused tests

| Suite group | Result |
|---|---|
| Analytics platform + Custom Insight UI + contracts + routes¹ | **108 suites / 1523 tests passing** |
| QuickBooks + Shopify + options + discovery + webhooks² | **59 suites / 703 tests passing** |
| Builder pickers + options cascades³ | **136 suites / 1040 tests passing** |
| `tests/structure` | 5 failed / 273 passed — **all pre-existing, see §12** |

¹ `tests/unit/services/analytics tests/unit/features/analytics
tests/unit/core/analytics tests/unit/contracts/analyticsCatalog.test.ts
tests/unit/contracts/analyticsInsightWidget.test.ts
tests/unit/contracts/analyticsQuery.test.ts
tests/unit/contracts/analyticsQueryCapabilities.test.ts
tests/unit/app/api/analytics`
² `tests/unit/integrations/quickbooks tests/unit/integrations/shopify
tests/unit/integrations/_shared/shopify tests/unit/services/options
tests/unit/app/api/options tests/unit/lib/api/options.test.ts
tests/unit/services/discovery/{quickbooks,shopify,shopify-triggers}-discovery.test.ts
tests/unit/app/api/webhooks/{quickbooks,shopify}.route.test.ts`
³ `tests/unit/features/workflow-builder/config-modal/fields
tests/unit/features/workflow-builder/hooks/useOptionsSource.test.tsx
tests/integration/features/workflow-builder`

**3,266 focused tests passing. No new or changed focused test fails.**

## 12. Static verification and baseline failures

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | **0 errors** (27 pre-existing warnings) |
| `npm run lint:structure` | 1 violation — the `docs/slices/phase-5` 51-file baseline |
| `npm run lint:migrations` | OK |

**The 51-file claim was re-verified factually on this base, not inherited:**
`docs/slices/phase-5` root holds **51** `.md` files at `64f57de39` **and 51 at
HEAD**, and the arc added **zero** files to that root — every document went
into the `analytics/` subfolder (5 → 11 files, far under the 50 cap). New leaf
folders introduced by the arc: `insights/quickbooks` (3),
`insights/shopify` (3), `sources/quickbooks` (1). So the violation is
unchanged and **not** integration-caused.

**The 5 `tests/structure` failures are a separate, also pre-existing matter.**
Their offender lists were inspected individually; **no arc-touched file appears
in any of them**:

| Failing guard | Offenders |
|---|---|
| Slack-token-shaped literals | 10 strings in `tests/unit/core/workflows/`, `.../workflow-builder/{document,hooks,panels}/`, `.../services/workflows/` |
| client/server import boundary | `features/auth/{AuthForm,ForgotPasswordForm,VerifyEmailForm}.tsx`, `features/marketing/PricingPage.tsx` |
| heuristic-sensitive config fields | `linear:create_issue`, `linear:update_issue` (×2) |
| resource-field discovery | 6 `linear:*` fields |
| sensitive-output coverage | `linear:add_comment::body` |

All belong to other workstreams (Linear provider, auth/marketing, Slack test
fixtures). **The Analytics integration introduced no new structural
violation.**

## 13. Documentation

All required records are present under `docs/slices/phase-5/analytics/` (11
files) with **no duplication at the phase-5 root**: the connected-data audit,
CD-1, CD-2, CD-3A, the CD-3A integration certification, CD-3B, QuickBooks
Invoices (CD-4B), the QuickBooks customer resolver, Shopify Orders (CD-4C),
plus the CS-1 flexibility audit and outcome — and this reconciliation record.

Relative links were checked programmatically; all resolve. (One apparent miss,
`analytics-flexibility-audit-1.md → ../../../../app/api/analytics/sources/%5Bprovider%5D/data/route.ts`,
is a correctly URL-encoded `[provider]` segment whose target exists — a
false positive of the naive checker, not a broken link.)

## 14. Remaining browser-certification debt

Unchanged by this batch, and stated without inflation:

* The CD-3A Playwright specification is **preserved** at
  `tests/e2e/analytics-insight-cd3a-cert.spec.ts` and was **not run** here.
* The **core CD-3A browser flow previously passed** in its own batch.
* **CD-3A scenarios 2–9 remain environment-blocked** and unexecuted.
* **CD-3B has never received browser certification.**
* QuickBooks (CD-4B) and Shopify (CD-4C) live provider reads were certified
  read-only in their implementation batches; this batch changed no provider
  behavior and required no recertification.

No unexecuted browser scenario is classified as passed.

## 15. Recommended next step

**HubSpot Deals may begin.** The platform is integrated on `v2-main`, three
public datasets prove the provider-local pattern across two very different
money models, and the generic builder needed no change for either. The main
outstanding risk is presentational rather than architectural.

Two items worth sequencing first, both small:
1. **Browser-certify CD-3B** (bar/table/donut) — the only launch-visible
   surface with no browser evidence at all.
2. Consider whether Marcus wants this arc **pushed** to `v2-main` (it deploys
   to production) before more provider surface lands on top of it.

---

## 16. Commits and push status

Integration branch `analytics-reconcile-1`, fast-forwarded to include the ten
arc commits, plus this document.

**Confirmed:** no migration · no `db:push` · no database/grant/RLS change · no
push · no PR · no deploy · no production change · no Stripe exposure change
(still preview) · no Motive exposure (still absent) · no new provider · no
HubSpot or CD-5 work started. The backup branch
`backup/v2-main-before-analytics-reconcile-2026-07-25` remains local.
