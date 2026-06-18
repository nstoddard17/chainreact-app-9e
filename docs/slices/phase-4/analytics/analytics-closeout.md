# Analytics page — closeout (Slice ANALYTICS-1)

Account-scoped, customizable Analytics dashboard at `/analytics`. Live, no feature
flag. Built from the imported Claude Design `Analytics.html`, re-themed onto the V2
dark-dashboard tokens and wired to real account data.

Commits: `c76f5499e` (backend data engine), `9505eb2ee` (UI), plus the closeout
fixes commit (this pass). Local only — not pushed.

## What is real

All rendered values are real, account-scoped aggregates computed at read time from
the account's own runs / workflows / integrations:

- Stat tiles: runs, success rate, active automations, average run time.
- Runs over time (daily/weekly buckets), outcome donut, top automations, 16-week
  activity heatmap, recent runs feed.
- "Connected apps" is **connection-level** (count of connected accounts per
  provider) — NOT per-run app attribution (the run record carries no provider).
  The widget is titled/labeled accordingly.

Test runs are excluded from every aggregate; bucketing is UTC. The run window is
capped (5000) with a `truncated` flag.

## Persistence + security

- One account-scoped table, `analytics_dashboards`, widgets stored as a validated
  JSONB array (atomic "Done editing" save).
- Reads: session-client, RLS member-gated (any member may view). Writes:
  service-role only (no authenticated write grant), authorized at the route by the
  **authoring permission** below; cross-account ids collapse to 404 (no leak).

### Dashboard authoring permission (shared-object model)

Analytics dashboards are account-WIDE shared objects, so mutation is gated by role
(distinct from simply viewing account-scoped data, which any member may do):

| Account type | Create / rename / delete / edit layout / add-remove-resize-reorder / save | View / range / refresh / export |
|---|---|---|
| Personal | the owner (role `owner`) | owner |
| Team / Business / Org | **owner or admin** | any member |

- **Server is the enforcement.** Create gate: `requireDashboardAuthor` on the
  active account (`POST /api/analytics/dashboards`). Update/delete gate:
  `authorizeDashboardWrite` resolves the dashboard's owning account and requires
  owner/admin (`PATCH`/`DELETE /api/analytics/dashboards/[id]`). Both reuse
  `requireAccountRole(userId, accountId, ["owner","admin"])` — a personal owner is
  `owner`, so personal users keep full self-serve with no special-casing.
  Non-member → 404 (no leak); member-without-role → 403 `FORBIDDEN_DASHBOARD_AUTHOR`.
- **UI follows.** The page computes `canManage` (owner/admin) server-side and
  passes it to the client; members in shared accounts simply don't see Edit / New
  dashboard / Delete (clean read-only view, no fake disabled controls). Client
  gating is cosmetic — the routes enforce regardless.
- **Not yet:** personal (per-user) dashboards and dashboard-level ACLs. Until
  then, members cannot mutate shared account dashboards. Reads are unchanged.
- One default ("Overview") per account enforced by a partial unique index; the
  seed is race-safe (loses the race → re-lists).
- Range + widget config validated server-side (Zod, `.strict()`).
- Proven by `tests/integration/security/analytics-dashboards-account.test.ts`
  (gated DB test, passing): member-read, non-member-no-leak, no-write-grant,
  one-default index.

## Accepted deferrals (intentional, not blockers)

- **Public Share links** — omitted. Unauthenticated dashboard sharing is a
  separate security-reviewed slice (tokenized links, revoke, RLS, no-leak tests).
  No Share UI is rendered (no fake control).
- **Custom date range** — the design's "Custom…" preset is omitted (needs a date
  picker + explicit `from/to` on the data API). The 5 presets cover launch.
- **Refresh scheduler** — per-widget cadence (live/hourly/daily/…) is deferred to
  its own infra-reviewed slice. Instead a real manual **Refresh** action ships;
  widgets are live-on-load. No scheduling UI is rendered, and the speculative
  reserved DB columns were removed (`20260702000001`).
- **Per-widget run filters** (mine/errors/active) — deferred; would need
  per-widget recompute. No filter UI is rendered.
- **Export** is JSON (dashboard + current data). CSV/visual export can follow.

(Dashboard authoring role-gating is now IMPLEMENTED — see the permission model
above — not a deferral.)

---

# Future direction — connected-app analytics data sources (architecture note)

> Status: **design intent only. Not implemented in ANALYTICS-1.** This note exists
> so the current implementation does not block it and so the extension lands
> additively. Do NOT build the full surface speculatively.

Intended model: custom widgets can pull **read-only** data from a user's connected
apps (Stripe, Slack, Notion, …), reusing the same OAuth/connection infrastructure
as trigger/action nodes, but through **analytics-safe data-source adapters** — never
by executing workflow nodes.

## 1. Where provider analytics adapters live

A registry **separate** from the workflow node/integration registry:

```
services/analytics/sources/
  _registry.ts            // providerKey → AnalyticsSourceAdapter
  <provider>/index.ts     // e.g. stripe/index.ts, slack/index.ts
```

Adapters MAY reuse the existing provider OAuth client + token-refresh seam
(`services/oauth/refreshAndRetry.ts`, `integrations/_registry`) to make HTTP calls,
but they expose ONLY a read/aggregate surface. They are NOT
`integrations/<provider>` action/trigger handlers and never call the workflow
engine.

## 2. Typed contract the adapter returns

Two pieces: a static **capability descriptor** and a **normalized result**.

```ts
interface AnalyticsSourceAdapter {
  providerKey: string;                       // "stripe"
  metrics: AnalyticsSourceMetric[];          // typed, allow-listed metric descriptors
  // Read-only. Resolves credentials + calls allow-listed provider read endpoints.
  query(input: AnalyticsSourceQuery, ctx: AnalyticsSourceContext):
    Promise<NormalizedAnalyticsResult>;
}

interface AnalyticsSourceMetric {
  key: string;                               // "gross_volume"
  label: string;
  supportedGroupBy: string[];                // ["day","week","product"]
  supportedFilters: string[];                // allow-list only
  resultKind: "series" | "breakdown" | "scalar" | "table";
}

interface AnalyticsSourceQuery {
  metricKey: string;
  range: { since: string; until: string };   // server-derived, validated
  groupBy?: string;                          // must be in supportedGroupBy
  filters?: Record<string, string | number | boolean>; // keys ∈ supportedFilters
}

// Common normalized shape ALL providers map into, so widgets render uniformly.
interface NormalizedAnalyticsResult {
  kind: "series" | "breakdown" | "scalar" | "table";
  generatedAt: string;
  range: { since: string; until: string };
  dimensions: string[];                      // e.g. ["date"] or ["product"]
  measures: string[];                        // e.g. ["amount"]
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, number>;
}
```

The existing internal `AnalyticsOverview` is the "internal/workflow analytics"
source; connected-app sources are siblings producing `NormalizedAnalyticsResult`.
Widget bodies should render from this common shape (internal can be adapted to it
later, or kept as a distinct internal path).

## 3. Account / credential authorization

- Account-scoped + membership-authorized at the route, exactly like
  `/api/analytics/data` (`requireAccount`). A future
  `/api/analytics/sources/[provider]/data` reuses the same gate.
- Credential resolution MUST go through the central credential-sharing decision
  (`core/integrations/credentialSharing.ts`): account/service providers are
  account-shared; **personal-credential providers must NOT expose a co-member's
  connection** — resolve to the workflow/connection owner via the existing seam,
  never a co-member fallback. If the slice touches this, use the security-review
  skill.
- Per-account + per-provider **rate limiting** (reuse the API-key rate-limit
  pattern) so a dashboard can't hammer provider APIs.

## 4. Caching / snapshotting

- Cache-first reads keyed by `(account_id, provider, metricKey, rangeBucket,
  filtersHash)` with a TTL, in a dedicated `analytics_source_snapshots` table
  (NOT the removed widget columns). Widgets read the cached normalized result;
  **Refresh** / the future scheduler recomputes.
- The deferred per-widget refresh cadence drives snapshot recompute frequency;
  "live" widgets bypass cache (bounded by rate limits).
- Store only the **normalized** result — never raw provider payloads.

## 5. What must explicitly NOT happen

- **No arbitrary connector execution from widget config.** Widget config selects a
  provider + an allow-listed metric/groupBy/filter — never an endpoint, URL, query,
  or node to run.
- **No trigger/action node execution** for analytics. Nodes are for workflow
  execution; analytics sources are read/aggregate only.
- **No writes** to providers; read scopes only.
- **No cross-account or co-member personal-credential exposure**; no membership
  bypass; no raw provider payloads returned to the client.

## Schema flexibility assessment (does ANALYTICS-1 block this?) — NO

- **DB:** `analytics_dashboards.widgets` is opaque JSONB on an account-scoped,
  RLS-gated table. Widget config can evolve entirely in the Zod contract with **no
  DB migration**. Connected-app widget config is just more JSON in the same column.
- **Contract evolution is additive + backfill-free.** Today
  `AnalyticsWidgetConfig = { source: "any"|workflowId, metric, note }`. The future
  connected-app shape adds a discriminated data source:

  ```ts
  // FUTURE (not now):
  type AnalyticsDataSource =
    | { kind: "internal"; metric: AnalyticsMetric; workflowId?: string }      // today's binding
    | { kind: "connected_app"; provider: string; metricKey: string;
        groupBy?: string; filters?: Record<string, …> };
  // config: { dataSource?: AnalyticsDataSource; note?: string; cache?: {...} }
  ```

  Because the discriminator will treat **absence as `kind: "internal"`**, existing
  persisted widget JSON (which has no `kind`) reads as internal — **no backfill**.
  Visualization type already lives on `widget.type` (extend the enum additively).
  Filters / group-by / cache metadata are optional additive fields.

- **Why no speculative fields were added now:** consistent with this closeout's
  removal of reserved-but-unused columns, we did NOT add an unused discriminator or
  empty filter/groupBy fields. They are free to add later (optional, default-internal)
  and carry zero migration cost. The forward path above is the contract; the only
  work when it lands is real adapters + a sources registry + a snapshot table +
  routes — all additive.
