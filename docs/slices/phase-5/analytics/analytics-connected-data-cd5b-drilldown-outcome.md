# ANALYTICS-CONNECTED-DATA-CD-5B — Safe drill-down and guided exploration

**Status:** implemented locally. Chart values with a server-issued refinement can be
clicked (or keyboard-selected) to narrow the question in place, with breadcrumb,
Back, Reset, a bounded depth, and Save-as-new-insight for editors. Aggregate
refinement only — no raw provider records anywhere.
**Base branch/commit:** `analytics-cd5a-export-time-compare` @ `66707ea87`.
**Worktree:** `C:/Users/marcu/source/repos/ChainReactV2-wt-cd5b` · **Branch:** `analytics-cd5b-drilldown`
**Push/deploy/migration status:** local commits only — no push, no PR, no deploy, no
migration, no `db:push`, no scope change, no exposure change, no Docker, no
Playwright, no full repository test suite.

---

## 1. Plain-language result

On a saved Custom Insight, a user can click a bar, slice, point, or a table row's
Explore button and watch the question narrow immediately — "Exploring: Status is
Paid" — with a breadcrumb showing the path from the saved question. Back steps out
one level (instantly, from a per-level memo), Reset returns to the saved widget, and
dashboard editors can save the explored question as a brand-new widget placed right
after the original. The original widget is never modified; exploration is transient
and a page reload returns to the saved root.

## 2. Drill-down scope

CD-5B refines **aggregate questions only**. There is no record list, no provider
record endpoint, no record preview, no provider deep link, and no raw provider ID
anywhere in results, exploration state, saved widgets, or CSV. Every explored query
executes through the existing `/api/analytics/insights/query` route and the full
server-side validator, cache, coalescing, and limiter — refinement metadata is
guidance, not authorization.

## 3. The refinement contract

`ConnectedRefineSchema` (contracts/connectedAnalytics.ts): a strict object of exactly
`filterKey` (declared catalog filter id, ≤60), `filterValue` (canonical value, ≤120)
and `label` (display text, ≤120). By construction it cannot carry an account /
integration / connection id, scope, endpoint, cursor, payload, or free-form provider
query syntax — pinned by tests. It attaches optionally to result `rows[]` and
`series[]`.

**Attachment is one generic server-side pass** (`attachInsightRefinements`), run on
the way out of `runConnectedAnalyticsQuery` — after the adapter on the live path,
**after the snapshot cache** on the provider path, so cached snapshots never store
refinement metadata. No adapter was modified for it; every dataset (and the fictional
test fixture) gets identical behavior with zero provider-name branches.

A row/series earns a refinement only when the catalog proves its id is canonical:

- a bounded `category` dimension whose **declared `values` list contains the id**
  (Shopify payment/fulfillment/cancellation status, Stripe status, ChainReact run
  status and trigger source, QuickBooks paid-status); the label used is the
  catalog's own declared label, never trusted row text;
- an `entity` dimension that explicitly declares the new catalog flag
  `resultIdsAreFilterValues` (ChainReact **workflows** — rows are keyed by the same
  account-owned workflow id the filter accepts, and the query engine already rejects
  any id the account doesn't own).

Fields the current measure declares in `incompatibleFilters` are never offered —
that drill could only build a query the validator rejects.

**Time buckets need no refinement object**: `buckets[].start/end` are already the
server's exact boundaries, and `compareSeries` now carries the **previous window's
own buckets** (emitted by all four aggregators), so a previous-period point drills
into its real dates. The browser never reconstructs calendar boundaries.

## 4. Non-drillable categories (by design)

| Category | Why it stays a plain readable value |
|---|---|
| QuickBooks customers | Row ids are deliberately one-way per-account surrogates (`sha256(accountId:customerId)` truncated); the filter needs the real QuickBooks id and no reverse map exists. Making them clickable would require weakening the surrogate model or a new signed-token capability — no suitable generic signing mechanism exists in the repo (the OAuth state signer is OAuth-specific), so per decision rules the category is non-drillable and no token scheme was invented. |
| Currency dimensions (QuickBooks/Shopify/Stripe) | The catalog declares no bounded `values` list (the domain is account-specific), so no canonical value can be proven. |
| Synthetic/unknown values outside a declared domain | A row id not in the declared list gets no refinement — donuts never invent an `Other` slice in the first place (CD-3B). |
| Comparison change values, totals, summary rows, completeness warnings | Never drill targets; the table's Explore column skips them. |

## 5. Exploration behavior

- **Pure refinement** (`insightRefine.ts`): (config + drill) → next config, through
  ordinary validated query fields, delegating ALL reconciliation to the builder's own
  `reconcileInsightDraft` — grain falls back to Automatic with a note, comparison
  clears where unsafe, chart validity is re-checked. A drill whose range or filter
  had to be discarded by reconciliation is **refused, not substituted** — a drilled
  question is the clicked question or nothing.
- **Stack**: bounded to 5 levels; at the limit drills disable and the bar explains
  why. Entries hold only the validated config, breadcrumb label, description,
  reconciliation notes. Back restores the prior level instantly from a bounded
  per-level result memo; Reset returns to the saved root. A failed child keeps
  Back/Reset available and never displaces the parent's memoized result; nothing is
  persisted, so reload = saved root.
- **Comparison periods**: a Current datum drills its actual range; a Previous datum
  drills the previous window's own bucket (breadcrumb says "Previous period · …");
  comparison defaults OFF in the child.
- **Dates**: bucket boundaries pass verbatim as full ISO instants (the CD-5A
  translator forwards instants unchanged), and every crumb/description reads dates
  back with the CD-5A inclusive-end convention in UTC.

## 6. Chart interactions

| Chart | Drill | Not broken |
|---|---|---|
| Bar (both orientations) | Click a group (bucket or refinable category); click the paired previous bar for ITS dates; Enter / Shift+Enter from the keyboard; pointer+title affordance and `data-drillable` only on refinable groups; announcement states explore availability | tooltips, legend toggles, orientation logic |
| Line | Click = nearest point's bucket; Shift+click / Shift+Enter = previous period's own bucket (only when the result carries `compareSeries.buckets` — older cached snapshots simply aren't drillable) | crosshair, tooltip, legend, null gaps |
| Donut | Refinable slices render their legend label as an explicit `Explore <label>` button; Enter on the active slice; non-refinable slices stay plain rows, never tab stops | share suppression rules, keyboard traversal |
| Table | Explicit `Explore <label>` / `Explore <bucket>` button in a final column, only for rows with a valid refinement; totals and change columns never get one; identical drill to the graphical equivalent | `aria-sort`, scroller, change columns |
| KPI | No default click target. A compared KPI gets an explicit "Explore previous period" action into the server-supplied previous window | value/compare copy |

Legend clicks remain visibility toggles everywhere — never exploration. (The line
chart's Previous-period legend button also gained the accessible name it was
missing.)

## 7. Save as new insight

Editors (owner/admin — the existing `canManage` gate) see "Save as new insight" in
the exploration bar; members explore freely but never see an enabled save action.
Saving opens the existing name dialog (new `saveInsight` mode) prefilled with a
suggested title built from safe display labels only ("Orders — Orders — Paid"),
capped at the 120-char widget title limit and editable before saving. The new widget
gets a fresh id, copies the source's display size, carries ONLY the refined validated
config (no result payload, freshness, errors, exploration stack, legend or CSV
state — pinned by test), and is placed immediately after its source. Outside edit
mode it persists via an immediate `updateDashboard` PATCH (the Restore-default
pattern); in edit mode it joins the draft and the normal atomic Done-editing PATCH.
At the 48-widget cap, saving disables with an explanation and the exploration is
kept. Duplicate-widget is untouched and still copies the SAVED question.

## 8. ChainReact Runs navigation — NOT implemented, and why

The audit-gated decision came out negative. The Runs page today parses **no URL
search params at all** (`/runs?status=failed` is silently ignored), its filters are
client-side `useState` over the most recent 50 fetched rows, and it has **no date
range and no workflow filter**. Since every explored insight carries a date range,
no explored query can be represented exactly, and the spec forbids approximation.
`View matching runs` is therefore absent; adding it honestly requires Runs-page URL
params + server-side filtered queries first (a candidate follow-up, out of CD-5B's
scope). Nothing in the Runs page was modified.

## 9. Security and privacy

- Every explored query re-enters the normal route: session auth, active-account
  resolution, exposure gate, catalog/measure/dimension/filter validation, credential
  ownership, query limits, account-isolated cache/coalescing/limiter — all
  unchanged and all still authoritative. Existing pipeline suites (all re-run green)
  pin account isolation of cache keys and coalescing.
- The refinement schema cannot represent account/integration/connection ids, scopes,
  endpoints, cursors, or payloads (schema strictness pinned by test).
- Refinement metadata is attached AFTER the snapshot cache — snapshots contain no
  refinement data (and results gained no new sensitive fields: the only additions
  are declared filter values, catalog labels, and bucket boundary strings).
- The client never guesses: no drill exists without server-supplied data, labels are
  never authority, and hostile row labels can't reach a refinement label (catalog
  labels win; entity labels are bounded).
- QuickBooks surrogates are untouched; no provider id was added to any result; the
  workflow id used for ChainReact drills is an account-internal identifier already
  legal in validated queries and already ownership-checked server-side.
- Exploration state stores no tokens, ids, cache keys, payloads, or CSV.

## 10. Accessibility and responsive behavior

Keyboard: every drill has a keyboard path (Enter/Space, Shift for previous period;
explicit buttons in donut legend/table); non-drillable values are not tab stops;
announcements state explore availability; the exploration description is an
`aria-live` status; the breadcrumb is semantic `nav` + `ol` with `aria-current`;
Back/Reset/Save are plainly named buttons; the save dialog reuses the existing
focus-managed dialog (initial focus, Escape, focus restore). Layout: the breadcrumb
wraps, crumbs truncate visually with full text in `title`, actions wrap onto their
own row, the table's Explore column lives inside the table's existing local
scroller, and charts keep their existing responsive behavior — no page-level
horizontal overflow introduced (flex-wrap + truncation, verified by the component
markup; no browser automation used, per the boundaries).

## 11. CD-5A and existing compatibility

- CSV export now exports **the currently-explored aggregate** (the widget publishes
  whatever is on screen), returns to exporting the root after Back, still makes no
  request, and contains no refinement metadata columns — pinned by test.
- Inclusive end dates, UTC labels, presets, range validation, grain fallback,
  comparison rendering, donut restriction, and formula-injection protection are
  untouched (their suites re-ran green).
- Dashboards: duplicate, rename, restore, resize, reorder, remove, JSON export,
  member read-only, malformed-widget salvage, per-widget failure isolation — all
  untouched paths, suites green.
- Providers: no adapter HTTP behavior, scope, scan cap, TTL, rate limit, money rule
  or exposure changed. The only aggregator edit is emitting the previous window's
  bucket boundaries (result metadata). Fixed legacy widgets untouched.
- One additive hook change: `useInsightQuery`'s ok state now carries the `queryKey`
  it answered — fixing a genuine display bug the new tests exposed (a lagging result
  could be labeled with the wrong exploration level).

## 12. Tests and verification

New (58 tests across 4 suites): `attachRefinements.test.ts` (13),
`insightRefineCd5b.test.ts` (18), `insightDrillInteractionsCd5b.test.tsx` (17),
`insightExplorationCd5b.test.tsx` (10).

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run lint` | **0 errors, 27 warnings — identical to the `66707ea87` baseline** (a new max-lines warning was fixed by splitting `InsightBarLegend`) |
| `npm run lint:structure` | 1 pre-existing violation (`docs/slices/phase-5` root at 51 files; this doc is under `analytics/`) |
| `npm run lint:migrations` | OK — no migration |
| Targeted: `tests/unit/features/analytics/insights/`, `tests/unit/services/analytics/insights/`, `tests/unit/services/analytics/insightQuery.test.ts` | **30 suites / 550 tests passed** |
| Targeted: `analyticsCatalog` + `analyticsInsightWidget` contract suites | 2 suites / 19 tests passed |
| Full Analytics tree (`features+services+core analytics`, contracts) — run once before the targeted-only instruction | 124 suites / 1,898 tests passed |

**Verification boundaries — stated explicitly:** Docker was not used; Playwright was
not run; the full repository test suite was not run; only the targeted suites above
were run. The structure baseline is unchanged from `66707ea87`.

## 13. Known limitations

- Entity drill-through for surrogate-keyed categories (QuickBooks customers) and
  undeclared-value categories (currency) is deliberately absent (§4).
- Series-value drills are wired at the result contract level (series may carry
  refinements) and in the pure refinement function, but the line chart offers no
  per-series click target (its selection is X-proximity only) — series narrowing is
  reachable by re-grouping instead. No series drill UI shipped.
- Previous-period points on results cached before CD-5B (no `compareSeries.buckets`)
  are not drillable until the snapshot refreshes.
- Browser Back does not control exploration (no URL-history integration — none
  existed, per §22 of the brief).
- The transient one-tick failure view after Back from a failed child names the
  child's error until the parent revalidates (parent data returns immediately after).

## 14. Remaining Analytics work

- Final browser-certification and release closeout for the whole Analytics arc
  (CD-3B browser debt included).
- Stripe Payments live certification — blocked on a connected Stripe test account.
- HubSpot Deals — blocked on populated deal amounts.
- Motive Fuel purchases — blocked on fuel history (unmerged CD-4A branch).
- Deferred by design: external-provider record drill-through, Runs-page URL filters
  (prerequisite for `View matching runs`), calendar-aligned comparison, series drill
  UI.

## 15. Files and commits

Local commits on `analytics-cd5b-drilldown` (base `66707ea87`):

1. `6495a1d09` — refinement contract, generic attacher, `resultIdsAreFilterValues`,
   previous-window buckets in 4 aggregators, pure `insightRefine`.
2. `05c0987cc` — chart drill wiring (bar/line/donut/table/KPI), exploration bar,
   widget-body exploration stack.
3. `a9b9ad2ed` — save-as-new (dialog mode, cap, placement, edit/non-edit paths).
4. `646ca838d` — the four test suites + three fixes they exposed + legend split.
5. This outcome document.

No push, no PR, no deploy, no migration, no `db:push`, no provider scope or
exposure change, no production change. The Analytics arc remains local pending the
owner's release decision.

## 16. Recommended final Analytics closeout sequence

1. Browser-certify CD-3B → CD-5B interactively (drill, Back/Reset, save, CSV).
2. Decide the release cut: the arc now spans `fb39f3834` → CD-4D blocked-cert →
   Stripe blocked-cert → CD-5A → CD-5B on stacked branches; merge to `v2-main` only
   on explicit approval.
3. Re-run Stripe/HubSpot/Motive certifications as test data becomes available and
   flip exposures individually.
4. Then consider Runs-page URL filters to unlock `View matching runs`.
