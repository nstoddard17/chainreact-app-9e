# QUICKBOOKS-INVOICES-INTEGRATION-RESOLVER-1

Integrate the QuickBooks Invoices analytics dataset onto local `v2-main`, and
remove the 100-customer ceiling from the `quickbooks:customers` resolver.

**Status:** both done. **Push/deploy/migration status:** local commits only — no
push, no PR, no deploy, no migration, no `db:push`, no OAuth scope change.

---

## 1. Integration result

**Base:** local `v2-main` @ `64f57de39`
**Worktree:** `C:/tmp/qbres1-wt` · **Branch:** `qb-customer-resolver-1`

Ancestry was checked before cherry-picking. CD-1 (`44294aac8`) and CD-2
(`84521c091`) were **already reachable** from `v2-main`; everything from CD-3A
onward was **missing**, and `features/analytics/insights/` did not exist there
at all. `33eb6605d` and its analytics ancestors were **not** reachable.

Four commits were cherry-picked — the minimum chain required for `33eb6605d` to
function (CD-4B's tests and catalog depend on the CD-3A builder and the CD-3B
`partToWholeDimensions` / `chartChoices` machinery):

| Source | Cherry-pick | Subject |
|---|---|---|
| `d753d32bd` | `734f62a84` | CD-3A — catalog-driven Custom Insight builder (KPI + line) |
| `ec428c652` | `13c94f484` | CD-3A browser certification spec + integration-cert outcome |
| `fae00dbe8` | `4ebc29317` | CD-3B — bar, selectable table, catalog-gated donut |
| `33eb6605d` | `ba791a2fc` | CD-4B — QuickBooks Invoices dataset |

**Conflicts: none.** All four applied cleanly, because `v2-main` has made no
change to `features/analytics/**`, `contracts/analytics*.ts`,
`services/analytics/**` or `app/analytics/**` since `c9291aa27` (which is itself
already on `v2-main` and was CD-3A's parent). No parallel-session work was
reverted or modified.

**Deliberately NOT cherry-picked:** `b5897ed8e` (CD-4A Motive certification).
It is docs plus a Motive-only trash script — unrelated to QuickBooks and not
required for `33eb6605d` to function, so integrating it would have violated
"do not cherry-pick unrelated work". CD-4B touches none of its files, so the
skip is conflict-free. The Motive certification record remains on
`cd4a-motive-fuel` for a future batch.

**Post-integration invariants verified:**

* QuickBooks is `exposure: "public"` in the Custom Insight catalog.
* Stripe remains `exposure: "preview"`.
* Motive is absent from the insights registry entirely.
* `git diff 64f57de39..HEAD -- supabase/migrations` → **0 files**.
* No raw scopes reach the client catalog (asserted by string scan in tests).
* Existing fixed provider widgets and dashboards unchanged.
* No provider-specific React branch introduced.

---

## 2. The original limitation

The audit found **four compounding causes**, not one:

1. **Wrapper.** `customerList` issued
   `select * from Customer where Active = true ORDERBY DisplayName MAXRESULTS 100`
   with **no `STARTPOSITION`** — rows 101+ were unreachable through it at all.
2. **Resolver.** It filtered `ctx.q` **locally**, via `filterAndSortByLabel`,
   *after* that 100-row truncation. Searching for customer #457 by name
   returned nothing, because the filter only ever saw rows 1–100.
3. **Generic contract.** `OptionsResolverResult` had **no** continuation field;
   `hasMore` is documented as a UI hint, not a cursor. Nothing in the options
   stack carried a cursor, offset or page.
4. **Picker.** `InsightEntityPicker` ignored `hasMore`, had no "load more", and
   labelled selected chips from a per-mount ref — so a saved selection not on
   the current page rendered as a **raw QuickBooks customer id**.

Cause 2 was the decisive one: it made the ceiling a *search* failure, not just
a paging failure. The resolver's own header acknowledged the tradeoff
("the V2 posture for ≤100-row catalogs is local `ctx.q` filtering"), which was
reasonable for small catalogs and wrong for a real company's customer list.

---

## 3. Actual QuickBooks search semantics (live-certified)

The repo *asserted* "QBO's query language supports LIKE" in a comment, but no
code had ever emitted a `LIKE` predicate, paged `Customer` with
`STARTPOSITION`, or fetched customers with `Id IN (…)`. Rather than build on
three unproven assumptions, each was certified read-only against the real API
first (`scripts/trash/quickbooks-customer-search-cert.ts`, **10/10 PASS**):

| Capability | Verdict |
|---|---|
| `DisplayName LIKE 'term%'` (prefix) | accepted; all rows matched |
| `DisplayName LIKE '%term%'` (**contains**) | accepted; **interior, non-prefix match observed** |
| Case sensitivity | **case-insensitive** (upper/lower terms returned identical counts) |
| No-match search | returns **empty**, not an error |
| `STARTPOSITION` on `Customer` | accepted; page 1 and page 2 had **zero overlap** |
| `Id IN ('a','b')` | accepted; all requested ids resolved |
| Quote-bearing / injection term | executed as a **literal**; no query break-out |

**Search semantics shipped: CONTAINS**, case-insensitive, on `DisplayName`
only. This is stated honestly because it was observed — not because the
provider docs imply it.

---

## 4. What changed

### Wrapper — `integrations/_shared/quickbooks/api/customers.ts`

* `customerList` gained optional `search` and `startPosition`, and now returns a
  page envelope `{ items, hasMore, nextStartPosition }` mirroring the existing
  `invoiceList` shape.
* The search term is trimmed, capped at 100 chars, escaped via the existing
  `escapeQueryValue`, **and** has `%`/`_` neutralised so a customer literally
  named "50% Co" is searched for as text rather than as a wildcard pattern.
* `ORDERBY DisplayName` is the deterministic paging key.
* New `customersByIds` resolves specific customers by stable id for label
  backfill.

### Resolver — `integrations/quickbooks/options/customers.ts`

* `ctx.q` is now pushed **server-side**; the local filter is gone. Any customer
  in the company is findable by name regardless of position.
* Saved selections (`ctx.selected`) absent from the current page are resolved
  through `customersByIds` **in the same request** and returned first, so a
  picker can label them immediately.
* `hasMore` comes straight from the provider page.
* Option projection is unchanged: `{ value: customerId, label: displayName }`
  and nothing else.

### Generic options contract — additive and backward-compatible

| File | Change |
|---|---|
| `services/options/types.ts` | `OptionsResolverContext.selected?: ReadonlyArray<string>` |
| `services/options/resolveOptionsSource.ts` | `selected` input + `normalizeSelected` + `MAX_SELECTED_VALUES` (20) / `MAX_SELECTED_VALUE_LENGTH` (120) |
| `app/api/options/[source]/route.ts` | parses repeated `?selected=` params |
| `lib/api/options.ts` | `selected?` arg, serialized as repeated params **after** existing ones |
| `features/analytics/insights/InsightEntityPicker.tsx` | sends the selection it opened with |

`selected` is declared **optional** deliberately. Making it required would have
forced edits to every pre-existing hand-built resolver context (AI tools,
resource links, smoke harnesses) — churn in files outside this batch's scope
and a hazard with concurrent sessions. Optional keeps every existing resolver
and caller compiling and behaving identically; `resolveOptionsSource` always
passes a normalized array, so resolvers that opt in can rely on it.

**No pagination was added to the generic contract.** The task's own preference
order puts "server-side search capable of finding any customer, even when the
unfiltered initial view remains limited" first, and that is what shipped. A
cursor would have had to be threaded through five shared files and two pickers
used by ~100 resolvers, for marginal benefit over a search that already reaches
every record. The wrapper *does* now support `startPosition`, so adding
generic pagination later is a contract change only — no provider work.

### Picker

`InsightEntityPicker` captures the selection it **opened with** (a ref, fixed
for the component's life) and sends it as `selected`. That choice matters: it
adds nothing to the fetch effect's dependencies, so selecting or clearing an
item never triggers a refetch — proven by a test that asserts the provider call
count is unchanged after a selection. Debounce, abort-on-supersede, chips,
clear, single-select replacement and the accessible listbox are all unchanged.

---

## 5. Access beyond 100 customers

* **Search** reaches any customer in the company, at any position, in one
  bounded page (`MAXRESULTS 100`).
* **The unfiltered first page stays bounded at 100** and reports `hasMore`, so
  the browser is never sent the whole catalog.
* **An empty search never triggers an account-wide scan** — exactly one
  provider request per resolve (asserted).
* **No hidden loop.** The resolver makes at most two provider calls: the page,
  plus one `Id IN (…)` lookup only when a saved selection is missing from it.
* Provider 429 classification and the existing `Retry-After` handling are
  untouched.

Proven end-to-end against a **150-customer** provider-boundary fixture through
the real resolution path (`resolveOptionsSource` → registry → real resolver →
real wrapper): customer **#137 is now found**, an interior substring matches,
no duplicates are emitted, and paging a 150-customer company yields all 150
with zero duplicates and zero skips in stable order.

---

## 6. Analytics integration

The Invoices dataset benefits **automatically** — no schema change, no builder
branch. Its `customer` field already declares
`optionsSource: "quickbooks:customers"`, so the filter and the explicit
customer series both inherit server-side search and label backfill.

The CD-4B security model is untouched: the picker commits the **stable
QuickBooks customer id** into widget config (as it always did), while chart
**results** still carry the per-account salted surrogate — raw QuickBooks
customer ids never appear in an aggregate result or a cached snapshot. Saved
Insight configuration retains only the stable selected value; the label is
re-resolved from the resolver and is never treated as authority.

---

## 7. Existing QuickBooks compatibility

All three action fields using `quickbooks:customers` — `get_customer.customerId`,
`create_invoice.customerId`, `list_invoices.customerId` — gain server-side
search automatically, because `ComboboxField` already sends the typed query to
the server. No action input contract changed; `allowManualEntry` remains as the
power-user escape hatch. OAuth, token refresh, realm handling, webhooks,
triggers, the other resolvers (`items` / `terms` / `tax_codes` / `invoices`,
which still use the shared local filter), error classification and scopes are
unchanged. Saved configurations keep working: the stored value is still the
customer id.

Two in-repo callers of `customerList` (the QuickBooks live-cert scripts) were
updated for the new page envelope.

---

## 8. Security and privacy

* The realm comes from the stored account-class connection via
  `getActiveForExecution`; a client can never supply a realm or account.
* Search text and selected values are opaque strings: both are escaped into
  quoted literals, both bounded in length and count. Certified live that an
  injection-shaped term executes as a literal with no query break-out.
* `selected` widens nothing — the resolver still runs under the same
  session-derived credential decision as any other request.
* Options carry **only** `{ value, label }`. No email, phone, address, balance,
  tax data or raw payload is projected (asserted by no-leak string scans in
  unit tests and live).
* Nothing logs search results or selected customer details; provider errors are
  still mapped to static `INTEGRATION_DISCONNECTED` / `PROVIDER_REAUTH_REQUIRED`
  / `PROVIDER_ERROR` copy with no provider text.

---

## 9. Live read-only verification

`scripts/trash/quickbooks-resolver-live-verify.ts` drives the **finished
resolver** against the sandbox. **10/10 PASS.** No customer name, id, or the
searched term itself is printed or recorded.

| Check | Evidence |
|---|---|
| credential seam | context built from the stored connection; realm from the row |
| empty search | 33 rows, bounded ≤100, `hasMore=false`, every option exactly `{value,label}`, 994 ms |
| search narrows | 1 row from 33 unfiltered; the expected customer returned; 328 ms |
| contains semantics | an **interior** substring of a real label matched |
| no-match search | 0 rows, `hasMore=false`, no error, 324 ms |
| saved-selection backfill | a selection absent from the search result was resolved and labelled |
| overlong term | capped term accepted |
| injection term | executed as a literal, no break-out |
| no-leak projection | no email/balance/phone/address/realm/token markers |

**No writes of any kind occurred** — query endpoints only. No customer was
created to enlarge the sandbox.

**Honest scope limit:** the sandbox holds ~33 customers, so it **cannot**
live-prove the >100 case. That is proven by the 150-customer fixtures in §5.

---

## 10. Tests and verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | **0 errors** (27 pre-existing warnings) |
| `npm run lint:structure` | 1 violation — pre-existing baseline, below |
| `npm run lint:migrations` | OK |
| Analytics suites¹ | **105 suites / 1418 tests passing** |
| QuickBooks + options suites² | **20 suites / 350 tests passing** |
| Builder picker + options cascades³ | **136 suites / 1040 tests passing** |
| `tests/structure` | 5 failed / 273 passed — **identical to `v2-main`** |

¹ `tests/unit/services/analytics tests/unit/features/analytics
tests/unit/contracts/analyticsCatalog.test.ts
tests/unit/contracts/analyticsInsightWidget.test.ts
tests/unit/contracts/analyticsQuery.test.ts tests/unit/app/api/analytics
tests/unit/core/analytics`
² `tests/unit/integrations/quickbooks tests/unit/services/options
tests/unit/app/api/options tests/unit/lib/api/options.test.ts
tests/unit/services/discovery/quickbooks-discovery.test.ts
tests/unit/app/api/webhooks/quickbooks.route.test.ts
tests/unit/features/apps/quickbooks-connect-flow.test.tsx`
³ `tests/unit/features/workflow-builder/config-modal/fields
tests/unit/features/workflow-builder/hooks/useOptionsSource.test.tsx
tests/integration/features/workflow-builder`

**New test files:** wrapper search/paging/injection (18),
generic contract + >100 reachability (19), picker selected-labelling (10).
**Extended:** QuickBooks resolver suite (20 total, was 5), options route
(+4 `selected` cases), client seam (+3 URL cases).

**Updated existing assertions** (behaviour changes, not regressions): the
resolver's "filters locally on q" test became "pushes the search term to
QuickBooks"; three options-route context-shape assertions now include
`selected: []`.

**Structure baseline:** `docs/slices/phase-5` holds **51** files (limit 50) —
verified byte-identical at `v2-main` `64f57de39` (51 before, 51 now). No
unrelated documentation was modified; this document was added only under
`docs/slices/phase-5/analytics/` (9 → 10 files). The 5 `tests/structure`
failures are pre-existing on `v2-main` and live in `features/auth/*`,
`features/marketing/*` and unrelated provider metadata — none implicate a file
this batch touched.

**Verification boundaries — stated explicitly:**
* **Docker was not used**, and no Docker-based Supabase environment was started.
* **Playwright was not run.**
* **`npm test` / the full repository suite was not run.**
* Only the focused suites above plus the four static commands were run.

---

## 11. Known limitations

* **>100 is fixture-proven, not live-proven** — the sandbox has ~33 customers.
* **Search is `DisplayName` only.** Searching by email or company name is not
  offered; QuickBooks' query language has no `OR`, so each field would be a
  separate call, and email search was explicitly out of scope.
* **No "load more" in the pickers.** The unfiltered view is still one page of
  100; reaching the rest is done by *searching*, not scrolling. The wrapper
  supports `startPosition`, so adding generic pagination later is a contract
  change only.
* **The generic contract still has no cursor** — `hasMore` remains a UI hint.
* **Inactive customers** are excluded from the browse/search page
  (`Active = true`), though `customersByIds` will still label a saved selection
  that has since been deactivated.
* **`ComboboxField` shows a static "Showing first results" hint** rather than a
  count; unchanged by this batch.
* The other QuickBooks resolvers (`items`, `terms`, `tax_codes`, `invoices`)
  still use the bounded-page + local-filter posture. They were out of scope and
  their catalogs are genuinely small, but the same upgrade applies if a company
  outgrows them.

---

## 12. Files and commits

**Commits (local only, in order):**

| Commit | Scope |
|---|---|
| `734f62a84`, `13c94f484`, `4ebc29317`, `ba791a2fc` | cherry-picked analytics chain (CD-3A → CD-4B) |
| `f52acdd89` | resolver + wrapper + generic `selected` contract + picker |
| `bdb39411e` | focused tests |
| *(this commit)* | this outcome document — its own hash can't be cited from inside itself |

**Changed (implementation):** `integrations/_shared/quickbooks/api/customers.ts`,
`integrations/quickbooks/options/customers.ts`, `services/options/types.ts`,
`services/options/resolveOptionsSource.ts`,
`app/api/options/[source]/route.ts`, `lib/api/options.ts`,
`features/analytics/insights/InsightEntityPicker.tsx`,
`scripts/trash/quickbooks-live-cert.ts`,
`scripts/trash/quickbooks-invoices-analytics-cert.ts`.

**Added (harnesses):** `scripts/trash/quickbooks-customer-search-cert.ts`,
`scripts/trash/quickbooks-resolver-live-verify.ts`.

**Added (tests):** `tests/unit/integrations/quickbooks/api/customerSearch.test.ts`,
`tests/unit/services/options/selectedAndSearch.test.ts`,
`tests/unit/features/analytics/insights/InsightEntityPicker.selected.test.tsx`.

**Modified (tests):** `tests/unit/integrations/quickbooks/options/resolvers.test.ts`,
`tests/unit/app/api/options/options-route.test.ts`,
`tests/unit/lib/api/options.test.ts`.

**Confirmed:** no migration, no `db:push`, no push, no PR, no deploy, no OAuth
scope change, no Stripe exposure change, no Motive exposure, no new Analytics
dataset, no production change. CD-5 was not started.
