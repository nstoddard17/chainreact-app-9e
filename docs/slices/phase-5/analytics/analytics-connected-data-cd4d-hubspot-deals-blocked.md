# ANALYTICS-CONNECTED-DATA-CD-4D — HubSpot → Deals — BLOCKED

**Status:** **BLOCKED at the Phase A live-certification gate — insufficient live deal
data on the approved connected HubSpot portal.** No dataset code was written, no
catalog entry was registered, and HubSpot is **not** exposed in Custom Insights.
**Base branch/commit:** `analytics-reconcile-1` @ `fb39f3834` (the reconciled
Custom Insights arc: ChainReact / QuickBooks / Shopify public, Stripe preview).
**Worktree:** `C:/Users/marcu/source/repos/ChainReactV2-wt-cd4d` · **Branch:** `analytics-cd4d-hubspot-deals`
**Push/deploy/migration status:** local commit only — no push, no PR, no deploy, no
migration, no `db:push`, no scope change, no Docker, no Playwright, no full test suite.

---

## 1. What blocked, precisely

CD-4D's certification prerequisites (mirroring CD-4B/CD-4C) require the connected
test portal to demonstrate the semantics the dataset would ship: several deals,
several non-null amounts, stage/pipeline diversity, at least one closed deal, and
multi-page pagination where data allows. The read-only harness found:

- **2 deals total** on the portal.
- **0 deals with a usable `amount`** — both blank. The amount **wire type**
  (decimal-string vs number), blank/negative behavior, and decimal precision —
  the critical unknowns for every money measure — were **unobservable**.
- 1 distinct stage, 1 distinct created date, 0 closed deals, 1 pipeline —
  too little diversity to certify grouping, open/won/lost partitioning, or
  scan-bias behavior against live data.

Per the slice's approved decisions: no deals were created or altered to pass the
gate, and a count-only replacement dataset was **not** registered (the existing
fixed HubSpot metrics already cover counts). Implementation stops here.

## 2. Live certification — full check table (safe evidence only)

Read-only harness: `scripts/trash/hubspot-deals-analytics-cert.ts`
(run `npx tsx scripts/trash/hubspot-deals-analytics-cert.ts`). Endpoints touched:
`POST /crm/v3/objects/deals/search` (read semantics), `GET /crm/v3/pipelines/deals`,
`GET /oauth/v1/access-tokens/{token}`, `GET /account-info/v3/details`. No write of
any kind occurred. Credentials resolved only through the canonical seam
(`getActiveForExecution(accountId, "hubspot", null)` + `refreshAndRetry`);
ciphertext was never touched; no token, portal id, pipeline/stage name, deal id,
deal name, amount, currency value, or raw payload was printed or recorded.

| Check | Result |
|---|---|
| live_guard | PASS — no `HUBSPOT_API_BASE` override; real `https://api.hubapi.com` |
| connection | PASS — active account-class HubSpot integration for the smoke account (stored portal ref present) |
| portal_identity | PASS — token-derived portal resolved server-side in 199 ms, matches the stored connection; no portal parameter exists on the query path (portal identity can never be client-selected) |
| pipelines_metadata | PASS — 1 pipeline · 7 stages · labels 7/7 · `displayOrder` 7/7 · `metadata.probability` 7/7 · `metadata.isClosed` 7/7 · stage-id collisions across pipelines 0 · 156 ms |
| deal_wire_types | PASS (bounded) — total=2, rows=2 · deal `id` is a JS string · `createdate` ISO-8601 string 2/2 (not epoch-shaped) · `sorts:[createdate DESC]` accepted and ordering monotone · **amount unobservable (0 non-null)** · 163 ms |
| amount_semantics | **FAIL — 0/2 usable amounts (both blank)**; wire type, negatives, precision uncertifiable |
| currency_source | PASS — `deal_currency_code` present on 0/2 deals (single-currency portal; HubSpot populates it only with multi-currency enabled) · `GET /account-info/v3/details` 200 in 201 ms with `companyCurrency` present and ISO-shaped (value not recorded) → certified strategy: **portal home currency** via account-info, per-deal `deal_currency_code` when present |
| stage_status_semantics | PASS — pipeline id resolves against metadata 2/2 · stage id resolves 2/2 · stage belongs to its row's pipeline 2/2 · `hs_is_closed` / `hs_is_closed_won` are `"true"/"false"` strings 2/2 · open=2 closed=0 won=0 · flags agree with stage `metadata.isClosed` 2/2 |
| date_filter | PASS — `createdate` GTE/LT epoch-ms push-down narrowed 2 → 1; all rows inside the window |
| pipeline_filter | PASS — `pipeline EQ` push-down; all rows match |
| stage_filter | PASS — `dealstage EQ` push-down; all rows match |
| pagination | PASS (bounded) — pageSize 2, 1 page, 0 duplicates, 0 skips vs reference prefix, total stable, terminated by missing next-cursor, `sorts` + `after` accepted together · **multi-page behavior unobservable (only 2 deals)** |
| empty_window | PASS — 1971 window returns total=0, rows=0, no cursor |
| rate_limit_metadata | SKIP — **no `x-hubspot-ratelimit-*` headers observed** on OAuth-token search responses; no 429 encountered (sequential awaits, ~160–200 ms/request, well under the ~5 req/s search limit) |

**Gate line:** `PHASE B AUTHORIZED: NO — failing: amount_semantics`.

## 3. What this run positively established (reusable on re-run)

These findings are certified and carry forward; a re-run mainly needs richer data:

1. **Scopes are sufficient.** Deal Search, deals pipelines metadata, token
   introspection, and `GET /account-info/v3/details` (home currency) all succeed
   with the currently granted scopes. **No new OAuth scope is needed.**
2. **Honest money strategy exists.** Preferred order confirmed as viable:
   per-deal `deal_currency_code` when present; otherwise the portal home currency
   from `/account-info/v3/details` (`companyCurrency`, ISO-shaped). No USD
   assumption required.
3. **Open/won/lost can be derived without fuzzy stage-name matching** — both from
   `hs_is_closed` / `hs_is_closed_won` boolean-string deal properties and from
   pipeline stage `metadata.isClosed`; the two agreed on every observed deal.
4. **Deterministic ordering is available**: the Search API accepts
   `sorts: [{ propertyName: "createdate", direction: "DESCENDING" }]` together
   with `after` cursor pagination and keeps `total` stable.
5. **Filter push-down works** for `createdate` (epoch-ms GTE/LT), `pipeline` EQ,
   and `dealstage` EQ inside one AND-ed `filterGroups` entry.
6. **`createdate` arrives as an ISO-8601 string** in Search property projection
   (not epoch millis), while Search **filters** take epoch-ms strings.
7. **Rate-limit telemetry caveat for the future scanner:** no
   `x-hubspot-ratelimit-*` headers were returned to this OAuth app, so the
   planned provider-boundary posture must lean on 429 + `Retry-After`
   classification and conservative sequential paging, not header budgets.

## 4. What remains uncertified (why implementation must wait)

- `amount` wire type, blank-vs-zero behavior, negative amounts, decimal precision.
- Money aggregation semantics against real values (sum/average, precision).
- Multi-page cursor pagination (duplicates/skips across real page boundaries),
  the Search API's cursor depth behavior, and scan-cap sizing evidence.
- Closed-won / closed-lost deals in live data; stage/pipeline grouping diversity.
- Live 429 / `Retry-After` shape (never triggered; must not be provoked blindly).

## 5. How to unblock (owner action)

Connect (or populate) an **approved HubSpot development/test portal** for the
smoke account such that it contains, at minimum: ~10+ deals · several non-null
amounts (ideally including one negative and one fractional) · more than one stage
in use · at least one closed-won and one closed-lost deal · more than one created
date · ideally 26+ deals so a 25-per-page walk crosses a page boundary. A second
pipeline is nice-to-have (single-pipeline portals can still certify, recorded as
a limitation). Then re-run:

```bash
npx tsx scripts/trash/hubspot-deals-analytics-cert.ts
```

`PHASE B AUTHORIZED: YES` authorizes the CD-4D implementation exactly as
specified (curated fields, current-state vs historical enforcement, provider
snapshot pipeline reuse, `preview` → `public` on passing focused verification).
No deal should be created or modified by Claude to satisfy this gate — the
harness itself remains strictly read-only.

## 6. Exposure state (unchanged)

Production Custom Insights catalog remains: **ChainReact, QuickBooks, Shopify**
public; **Stripe** preview-only; **Motive** absent; **HubSpot** absent. The
existing fixed HubSpot analytics metrics (`open_deals_count`,
`closed_won_deals_count`, `*_created_over_time`, `deals_by_stage`), actions,
triggers, resolvers, OAuth and reconnect behavior are untouched.

## 7. Verification (blocked-path scope)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) with the harness in tree |
| `npm run lint` | see commit gate note below |
| `npm run lint:structure` | expected baseline: 1 pre-existing violation (`docs/slices/phase-5` root at 51 files — this report was added under `analytics/`, not the root) |
| `npm run lint:migrations` | no migrations added |

**Verification boundaries — stated explicitly:** Docker was not used; Playwright
was not run; the full repository test suite (`npm test`) was not run; no focused
suite was required (no runtime code changed — the only additions are a read-only
`scripts/trash/` harness and this report). Live certification ran and **did not
pass** (blocked on live data sufficiency, not on any API failure).

## 8. Files and commits

- `scripts/trash/hubspot-deals-analytics-cert.ts` — read-only Phase A harness (kept
  for the re-run; committed like the CD-4B/CD-4C cert harnesses).
- `docs/slices/phase-5/analytics/analytics-connected-data-cd4d-hubspot-deals-blocked.md`
  — this report.

No other file was created or modified. Nothing was pushed; no PR, deploy,
migration, `db:push`, scope change, or exposure change occurred. The Analytics
arc remains local-only pending the owner's release decision.
