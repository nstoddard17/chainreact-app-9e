# Google Analytics (GA4) — V1 Audit + V2-Native Port Plan — GOOGLE-ANALYTICS-1

**Status:** Doc-only audit. No source / runtime / resolver / metadata changes. No `COVERED_PROVIDERS` flip.

**V1 reference:** `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e`

---

## 1. Headline finding

**Current V2 Google Analytics status: GREEN-FIELD.** There is no `integrations/google-analytics/` directory, no GA manifest in `integrations/_registry.ts` `ALL_MANIFESTS`, no handlers, schemas, resolvers, metas, tests, migrations, or webhook route. A repo-wide grep for `google-analytics` / `googleAnalytics` / `analyticsdata` across `integrations/`, `services/`, `app/`, `contracts/` returns **zero** matches. **Runtime must come before metadata** — GOOGLE-ANALYTICS-2 (runtime) precedes GOOGLE-ANALYTICS-4 (metas), same as every prior arc.

**V1 status: REAL but NEVER-LAUNCHED (gated), GA4-native, with 2 orphan handlers.** V1 built a genuine GA4 surface — 6 registered+surfaced actions, 4 dynamic data resolvers, full OAuth, GA4 Data API + Admin API + Measurement Protocol wiring — but it was **never shipped to users**: `availableIntegrations["google-analytics"].isAvailable = false` AND it sits on the **waitlist** (`lib/waitlist/integrations.ts`). It is not rotten (the code is GA4-clean, no Universal Analytics), just **gated and incomplete at the edges** (2 unregistered orphan handlers, 1 unused resolver, an aspirational-but-absent trigger).

**Key recommendation: SHIP — re-evaluate the old "lower-value" deferral and reject it.** GA4 is a real provider with genuine automation value (the **report → branch → notify** pattern and **server-side event/conversion ingestion**), and the V2 cost is low because GA reuses V2's existing refreshable Google OAuth + shared Google request layer (Docs / Sheets / Drive / Gmail / Calendar). Ship a focused GA4 **actions-only** surface (6 actions); **defer triggers** (GA4 has no push/webhook; a polling threshold trigger is fragile — do not invent a weak trigger to match a count); **defer 2 V1 handlers** with named rationale (one mints a credential into outputs; one is a redundant PII-heavy duplicate of `run_report`).

---

## 2. V1 surface

### 2.1 Counts

| Surface | Count | Notes |
| --- | --- | --- |
| **Surfaced + registered actions** | **6** | `googleAnalyticsNodes` (876-line node provider) + `lib/workflows/actions/registry.ts`. |
| **Orphan action handlers** | **2** | `getRealtimeData`, `getUserActivity` — handler files exist but are NOT in the node provider AND NOT in the action registry. Dead in V1. |
| **Triggers** | **0** | The node provider's header comment claims a "Goal Completion (Conversion Events)" trigger, but the `googleAnalyticsNodes` array contains **zero** `isTrigger: true` entries. Aspirational comment only. |
| **Dynamic data resolvers** | **4** | `accounts`, `properties`, `measurement_ids`, `conversion_events` (last one unused by any field). |
| **Tests** | **0** | `find` for GA test files → empty. The actions + resolvers are untested in V1. |

### 2.2 Manifest keys (the 6 registered actions)

Source: `lib/workflows/nodes/providers/google-analytics/index.ts` + `lib/workflows/actions/registry.ts`.

| V1 node type | Title | Scope | API | Notes |
| --- | --- | --- | --- | --- |
| `google_analytics_action_send_event` | Send Event | `analytics.edit` | **Measurement Protocol** (`google-analytics.com/mp/collect`) | Ingest a custom GA4 event. Needs `measurementId` + `apiSecret` (user-pasted) + `clientId`. |
| `google_analytics_action_run_report` | Run Report | `analytics.readonly` | **Data API v1beta** `properties.runReport` | Metrics × dimensions × date-range report. |
| `google_analytics_action_run_pivot_report` | Run Pivot Report | `analytics.readonly` | **Data API v1beta** `properties.runPivotReport` | Pivot table (row dims + column/pivot dims). |
| `google_analytics_action_find_conversion` | Find Conversion | `analytics.readonly` | **Admin API v1beta** `properties.conversionEvents` (find by name) | Read a conversion event by name. |
| `google_analytics_action_create_conversion_event` | Create Conversion Event | `analytics.edit` | **Admin API v1beta** `POST properties/{id}/conversionEvents` | Mark an event as a conversion (admin config mutation). |
| `google_analytics_action_create_measurement_secret` | Create Measurement Secret | `analytics.edit` | **Admin API v1beta** `measurementProtocolSecrets` | **Mints a credential** — outputs `secret_value`. |

### 2.3 Orphan handler inventory (built, not wired)

| Handler file | What it does | API |
| --- | --- | --- |
| `getRealtimeData.ts` (`getGoogleAnalyticsRealtimeData`) | Active users / page views / event count "right now". | Data API v1beta `properties.runRealtimeReport`. |
| `getUserActivity.ts` (`getGoogleAnalyticsUserActivity`) | Per-user event/session activity, filtered by `userId`. | Data API v1beta `runReport` with a `userId` `dimensionFilter` (NOT UA's `userActivity.search`). |

### 2.4 OAuth / scopes

- **Provider config:** `lib/integrations/oauthConfig.ts` → `"google-analytics"` uses the **shared** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `accounts.google.com/o/oauth2/v2/auth` + `oauth2.googleapis.com/token`, **refreshable** (Google returns refresh tokens; `refreshRequiresClientAuth: true`). Named "Google Analytics 4".
- **Scopes:** `https://www.googleapis.com/auth/analytics.readonly` (reports / reads) + `https://www.googleapis.com/auth/analytics.edit` (send_event, create conversion, create secret). Declared per-action via `requiredScopes` and on the integration card.
- **Account identity:** standard Google user identity (shared Google OAuth, same as Docs/Sheets/Drive).
- **Launch gate:** `availableIntegrations["google-analytics"].isAvailable = false` + waitlisted → never user-facing in V1.

### 2.5 Dynamic resolver inventory (4)

Source: `app/api/integrations/google-analytics/data/handlers/index.ts`. All use the **Admin API** (`analyticsadmin`).

| V1 key | Fetches | Deps | Admin API call | Used by a field? |
| --- | --- | --- | --- | --- |
| `google-analytics_accounts` | Managed GA accounts | none | `accountSummaries.list` | ✅ `accountId` |
| `google-analytics_properties` | GA4 properties under an account | accountId | `accountSummaries.list` → filter | ✅ `propertyId` |
| `google-analytics_measurement_ids` | Measurement IDs (G-XXXX) from data streams | propertyId | `properties.dataStreams.list` | ✅ `measurementId` (send_event) |
| `google-analytics_conversion_events` | Conversion events for a property | propertyId | `properties.conversionEvents.list` | ❌ **unused** — `find_conversion` uses a free-text `conversionEventName` |

### 2.6 Specialized UX / field types

- `select` + `dynamic` (cascading pickers: account → property → measurement ID), all gated with `hidden: { $deps:["accountId"], $condition:{ accountId:{ $exists:false } } }`.
- `multi-select` with **static curated GA4 option lists** for `metrics` (sessions, totalUsers, newUsers, screenPageViews, conversions, engagementRate, bounceRate, averageSessionDuration, eventCount, totalRevenue) and `dimensions` (date, country, city, deviceCategory, pagePath, source, medium, campaign).
- `select` date-range presets (today / yesterday / last_7/30/90_days / this_month / last_month / **custom**) + conditional `startDate`/`endDate` `date` fields (`showIf dateRange=custom`).
- `textarea` JSON for `eventParams` (Measurement Protocol payload).
- `number` (`limit`), `boolean` (`customEvent`).

### 2.7 API style

**GA4 only — no Universal Analytics anywhere.** Three Google API surfaces:
- **Data API** `analyticsdata v1beta` — `runReport`, `runPivotReport`, `runRealtimeReport` (via `googleapis`).
- **Admin API** `analyticsadmin v1beta` — `accountSummaries`, `properties`, `dataStreams`, `conversionEvents`, `measurementProtocolSecrets` (mixed `googleapis` client + raw `fetch`).
- **Measurement Protocol** — `POST https://www.google-analytics.com/mp/collect` (raw `fetch`, returns 204).

No polling. No webhooks. GA4 has no event push/subscription API.

### 2.8 Verdict

**Real, GA4-clean, but gated + frayed at the edges.** The hard parts (3 Google API surfaces + OAuth + cascading resolvers) are done and GA4-native. The frays: never launched (waitlist + `isAvailable:false`), 2 orphan handlers, 1 unused resolver, an aspirational-but-absent trigger, no tests, and one action (`create_measurement_secret`) that emits a credential into workflow output. The V2 port is a **clean-up + complete-the-surface** job that fits V2's Google OAuth pattern with low marginal cost — worth shipping, contrary to the old "lower-value" deferral.

---

## 3. V1 → V2 Decision Matrix

| Area | V1 behavior | V2 recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- | --- |
| **Ship at all?** | Built, gated (`isAvailable:false`, waitlisted) | **SHIP (GA4 actions-only)** | Real automation value (report→notify; server-side event/conversion ingestion) + low V2 cost (reuses Google OAuth). The old "lower-value" call predates Marcus's completion standard. | Full GA-2..4 arc; triggers deferred (GA-5 only if justified). |
| **Auth model** | Shared Google OAuth, refreshable, `analytics.readonly` + `analytics.edit` | **COPY (V2 Google pattern)** | Identical to Docs/Sheets/Drive/Gmail/Calendar — `tokenScope:"user"`, `oauthFlows:["v2"]`, `refreshable:true`. | `integrations/google-analytics/{manifest,oauth}.ts` mirroring `integrations/google-docs/`. Reuse the shared Google request/refresh layer (`integrations/_shared/google/`). |
| **API surfaces** | Data API + Admin API + Measurement Protocol | **COPY (all three, GA4-native)** | This IS the GA4 surface; no UA to drop. | Per-operation wrappers under `integrations/_shared/google-analytics/api/` (Data API runReport/runPivotReport/runRealtimeReport; Admin accountSummaries/dataStreams/conversionEvents; MP collect). One transport seam per API style; do not duplicate the Google request layer. |
| **Universal Analytics** | None present | **N/A (nothing to reject)** | V1 is GA4-only (`analyticsdata v1beta`, `mp/collect`, `analyticsadmin v1beta`). | No legacy code path to port or strip. |
| **Action — run_report** | Data API runReport, presets + custom range, static metric/dimension lists | **COPY/ADAPT** | Core read; the strongest automation primitive (report→branch→notify). | `google-analytics:run_report`. Per-handler file + Zod schema. Keep curated static metric/dimension lists (port V1's sets). |
| **Action — run_pivot_report** | Data API runPivotReport | **COPY/ADAPT** | Pivot variant of the core read. | `google-analytics:run_pivot_report`. |
| **Action — get_realtime_data** | Orphan handler (runRealtimeReport), unregistered | **ADAPT → PROMOTE to first-class** | Genuinely useful ("active users now" alerting) + clean Data API call; promoting it completes the read surface. | `google-analytics:get_realtime_data`. New schema + handler ported from the orphan. |
| **Action — send_event** | Measurement Protocol; user-pastes `apiSecret` | **ADAPT** | Server-side event / offline-conversion ingestion is real write-side value. | `google-analytics:send_event`. FileRef N/A. `apiSecret` stays a user-supplied field (no secret minting). Q4 idempotency relevant (it ingests an event). |
| **Action — find_conversion** | Admin API read; free-text event name | **ADAPT (+ wire the unused resolver)** | Cheap read; pairs with create_conversion_event. | `google-analytics:find_conversion`. Back `conversionEventName` with the `:conversion_events` resolver (a UX upgrade over V1's free text). |
| **Action — create_conversion_event** | Admin API config mutation | **ADAPT** | Recoverable admin config (mark event as key event); completes the conversion surface. | `google-analytics:create_conversion_event`. Medium risk, recoverable (un-mark in console). |
| **Action — create_measurement_secret** | Admin API; outputs `secret_value` | **DEFER (named blocker)** | (1) **Security** — emits a live credential into `workflow_runs` output, violating the no-secret-in-output posture. (2) **Low automation value** — one-time setup users do in the GA console; the created secret only feeds `send_event.apiSecret`, which is already a paste field. | NOT shipped in GA-2..4. Revisit only if a concrete automation need appears; if ever shipped, `secret_value` MUST be sensitive AND riskLevel high. |
| **Action — get_user_activity** | Orphan handler; per-user activity via runReport+userId filter | **DEFER/REJECT (named rationale)** | (1) **Redundant** — it's `run_report` with a `userId` dimensionFilter; no new capability. (2) **Privacy** — surfaces individual-user behavior (PII) and requires GA4 User-ID reporting enabled. | NOT shipped. Revisit only with a concrete per-user automation use case; would need PII-sensitive output handling. |
| **Triggers** | 0 (aspirational comment only) | **DEFER (GA-5, conditional) — possibly REJECT** | GA4 has **no push/webhook** for events. Only option is **polling a report/metric threshold**, which is fragile: GA4 processing latency + backfill cause re-fires/misses, and "new" has no stable event id (dedup must snapshot date+metric). Do NOT invent a weak trigger to match a count. | GA ships **actions-only** (precedent: Stripe / Discord / Google Docs / OneNote action-only flips). A polling threshold trigger is GA-5 only with a carefully-designed snapshot-dedup design + real demand. |
| **Resolvers** | 4 (accounts, properties, measurement_ids, conversion_events) | **ADAPT → 4 keys; promote the unused one** | All Admin-API reads, scopes already granted. The conversion_events resolver becomes USED (wired into find_conversion). | `google-analytics:accounts` / `:properties` (dep accountId) / `:data_streams` (dep propertyId; backs measurementId) / `:conversion_events` (dep propertyId). See §4. |
| **Metrics / dimensions options** | Static curated multi-select lists | **COPY (static) now; DEFER dynamic catalog** | Curated lists are simpler + cover the common cases; the full catalog is large + property-specific. | Static option arrays in the meta. A future `google-analytics:metadata` resolver (Data API `properties.getMetadata`) can expose the full per-property dimension/metric catalog — DEFER. |
| **Field names / defaults** | `accountId`, `propertyId`, `measurementId`, `apiSecret`, `clientId`, `eventName`, `eventParams`, `userId`, `dateRange`, `startDate`, `endDate`, `metrics`, `dimensions`, `pivotDimensions`, `limit`, `conversionEventName`, `countingMethod`, `customEvent` | **REPLACE freely (green-field) — keep GA4-aligned names** | **No load-bearing V2 field names exist** (green-field). V1's names map cleanly to GA4 concepts; keep them, but `accountId` becomes a **UI-scope cascade field** (GA4 reporting needs only `propertyId`), like Dropbox's `folderPath`. | Pick V2 names = V1 names where they match the API; document that `accountId` is UI-scope-only (not sent to the Data API). |
| **Output shapes** | `report_data`, `total_rows`, `pivot_data`, `secret_value`, etc. (snake_case) | **REPLACE → normalized, no secrets** | Consistent camelCase outputs; never emit a credential (drop create_measurement_secret). | `{ rows, rowCount, dateRange, metrics[], dimensions[] }` etc. Report-data collections marked sensitive (§6). |
| **Quotas / rate limits** | Unhandled | **DEFER (typed error + log; no auto-backoff)** | GA4 Data API has per-property token/concurrency quotas; matches V2's Monday/Dropbox pattern (typed error, no backoff). | Wrapper throws a typed `QuotaExceededError`/`RateLimitError`; backoff deferred. |
| **External constraints** | OAuth scopes need Google verification for sensitive scopes | **NOTE (operator follow-up)** | `analytics.edit` is a sensitive scope → Google OAuth app verification for external users (internal launch-readiness, like Meta App Review for Facebook — NOT user-facing copy). | Documented operator follow-up; gates public GA only, not Dev/test usage. |

---

## 4. Proposed V2 surface

### Actions to SHIP (GOOGLE-ANALYTICS-2) — 6

| V2 key | Category | API | Risk | Notes |
| --- | --- | --- | --- | --- |
| `google-analytics:run_report` | data | Data API `runReport` | low | Core read. Presets + custom range; curated metrics/dimensions. |
| `google-analytics:run_pivot_report` | data | Data API `runPivotReport` | low | Pivot read. |
| `google-analytics:get_realtime_data` | data | Data API `runRealtimeReport` | low | Promoted orphan. "Active users now" + realtime metrics. |
| `google-analytics:find_conversion` | data | Admin API `conversionEvents` (find) | low | Read; `conversionEventName` backed by `:conversion_events`. |
| `google-analytics:send_event` | data | Measurement Protocol `mp/collect` | medium | Ingest a GA4 event/offline conversion. `apiSecret` user-supplied. |
| `google-analytics:create_conversion_event` | data | Admin API `POST conversionEvents` | medium | Mark an event as a conversion (recoverable admin config). |

\* `ActionCategory`: GA actions are read/ingest analytics — `data` is the cleanest fit (confirm against `contracts/actionMeta.ts` enum in GA-4: `data` exists).

### Actions to DEFER / REJECT

- **`create_measurement_secret` — DEFER (security + low value).** Emits a live credential into workflow output. Revisit only with a real need; if shipped, `secret_value` sensitive + high risk. Users create the secret in the GA console and paste it into `send_event.apiSecret` (already supported).
- **`get_user_activity` — DEFER/REJECT (redundant + PII).** A `userId`-filtered `run_report`; no new capability and surfaces per-user behavior. Revisit only with a concrete per-user automation case.

### Triggers to SHIP / DEFER / REJECT

- **DEFER all triggers (GA-5, conditional).** GA4 has no push/webhook. The only option (polling a metric threshold) is fragile (processing latency, backfills, no stable event id → snapshot-dedup ambiguity). GA ships **actions-only**. If GA-5 ever ships, it is a single carefully-designed polling threshold trigger (e.g. `metric_threshold_crossed`) with explicit snapshot dedup — not a count-filler.

### Exact field-name preservation warning

**No V1-field-preservation requirement — GA is green-field in V2.** Field names are the V2 author's choice; keep V1's GA4-aligned names where they map to the API (`propertyId`, `eventName`, `eventParams`, `metrics`, `dimensions`, `dateRange`, `startDate`, `endDate`, `limit`, `conversionEventName`, `countingMethod`, `measurementId`, `apiSecret`, `clientId`). **`accountId` is UI-scope-only** (scopes the property picker; never sent to the Data API) — analogous to Dropbox's `folderPath`.

### Resolver needs (GOOGLE-ANALYTICS-3)

- `google-analytics:accounts` — account picker (no deps). Admin `accountSummaries`. value = accountId, label = displayName.
- `google-analytics:properties` — `dependsOn: ["accountId"]`. GA4 properties under the account. value = propertyId, label = property displayName.
- `google-analytics:data_streams` — `dependsOn: ["propertyId"]`. Backs `measurementId` on `send_event` (value = measurement ID `G-XXXX`, label = stream name). (V1 `measurement_ids`.)
- `google-analytics:conversion_events` — `dependsOn: ["propertyId"]`. Backs `conversionEventName` on `find_conversion` (UX upgrade over V1's free text).
- **Deferred:** `google-analytics:metadata` (Data API `properties.getMetadata`) for the full per-property dimension/metric catalog — start with static curated lists.

### Output shape proposal

Normalized, camelCase, no credentials:
- `run_report` → `{ rows, rowCount, dateRange, metrics[], dimensions[] }`.
- `run_pivot_report` → `{ rows, rowCount, columnHeaders[], dateRange, metrics[], dimensions[] }`.
- `get_realtime_data` → `{ activeUsers, pageViews, eventCount, rows }`.
- `send_event` → `{ success, eventName, clientId, userId, sentAt }`.
- `find_conversion` → `{ found, eventName, countingMethod, conversionEventId, resourceName }`.
- `create_conversion_event` → `{ eventName, countingMethod, propertyId, createdAt }` (no secret).

### Should the provider ship at all?

**Yes.** GA4 is a real, GA4-native provider with genuine automation value and low V2 marginal cost (existing Google OAuth). Ship the 6-action read/ingest surface; defer the credential-minting + redundant actions and all triggers with named rationale.

---

## 5. Risk classification

| Action(s) | riskLevel | isDestructive | requiresConfirmation | Rationale |
| --- | --- | --- | --- | --- |
| `run_report`, `run_pivot_report`, `get_realtime_data`, `find_conversion` | low | no | no | Read-only analytics of the user's own property. |
| `send_event` | medium | no | no | Ingests an event into the user's GA4 data stream — not destructive, not cleanly recallable (analytics data), low blast radius. |
| `create_conversion_event` | medium | no | no | Mutates GA property admin config (marks a key event) — recoverable by removing the conversion in the console. |
| `create_measurement_secret` (DEFERRED) | high | no | (yes if ever shipped) | Mints a credential. Deferred — would require sensitive output + high risk. |
| Triggers (DEFERRED) | low | — | — | Observational if ever built (polling threshold). |

**No destructive actions in the shipped surface** (V1 had no GA delete; do not invent one). No high/destructive/confirmation needed for GA-2..4.

---

## 6. Sensitive output proposal

Mark `sensitive: true`:
- **Account / property display names** — business identity.
- **Report data collections** (`run_report.rows`, `run_pivot_report.rows`, `get_realtime_data.rows`) — traffic / conversion / revenue / source / campaign data is business-sensitive and can carry PII-ish dimensions (city, pagePath, search terms, source/campaign).
- **Realtime aggregates** (`activeUsers`, `pageViews`, `eventCount`) — current business performance; mark the realtime data collection sensitive.
- **`send_event` identifiers** (`clientId`, `userId` echoes) — user/device identifiers (PII).
- **`get_user_activity` output** (if ever shipped) — per-user behavior (highly sensitive PII) — a reason it's deferred.
- **`create_measurement_secret.secret_value`** (if ever shipped) — a credential; would be the strongest sensitive marking AND a reason it's deferred (banned-shaped output name).

Non-sensitive: opaque ids (`propertyId`, `accountId`, conversion event id, `resourceName`, `measurementId`), `rowCount`, `dateRange`, `success`, `countingMethod`, timestamps, metric/dimension NAME lists.

**Banned from outputs entirely** (structural `sensitive-output-coverage` guard): no `token` / `accessToken` / `refreshToken` / `clientSecret` / `apiKey` / `secret` field names. (Dropping `create_measurement_secret` keeps `secret_value` out of the surface.)

---

## 7. Slice sequence

| Slice | Scope |
| --- | --- |
| **GOOGLE-ANALYTICS-1** | This doc-only audit + V2-native port plan. |
| **GOOGLE-ANALYTICS-2** | Runtime port — manifest + OAuth + `_shared/google-analytics/api/` wrappers (Data/Admin/MP) + 6 per-handler actions (run_report, run_pivot_report, get_realtime_data, send_event, find_conversion, create_conversion_event) + Zod schemas + handler registration + unit tests. NOT user-surfaced yet. |
| **GOOGLE-ANALYTICS-3** | OptionsSource resolvers — `accounts`, `properties` (dep accountId), `data_streams` (dep propertyId), `conversion_events` (dep propertyId) + tests. |
| **GOOGLE-ANALYTICS-4** | ActionMeta (6) + discovery sub-registry + `COVERED_PROVIDERS` flip + provider-route/discovery/builder tests. Action-only; trigger staging documented. |
| **GOOGLE-ANALYTICS-5** | Triggers — **conditional**. Only if a carefully-designed polling threshold trigger with snapshot dedup is justified by real demand; otherwise GA stays action-only (explicit REJECT). |

If a future re-evaluation concludes GA should not ship, the decision is REJECT with the §3 rationale; this audit recommends SHIP.

---

## 8. What to copy vs not copy

- **COPY:** the GA4 API choices (Data/Admin/MP), the cascading resolver shape (account → property → stream / conversion events), the curated metric/dimension static lists, the date-range preset model, GA4-aligned field names.
- **ADAPT:** monolithic-ish handlers → V2 per-handler files; promote `get_realtime_data` from orphan to first-class; wire `conversion_events` resolver into `find_conversion`; make `accountId` UI-scope-only.
- **REPLACE:** snake_case bespoke outputs → normalized camelCase; the legacy `getIntegration` + manual `google.auth.OAuth2` token plumbing → V2's shared Google OAuth + refresh-and-retry; `apiSecret` stays a paste field (no secret-minting action).
- **REJECT / DEFER (named):** `create_measurement_secret` (credential-in-output + niche), `get_user_activity` (redundant + PII), all triggers (no GA push API; polling threshold fragile). Revisit conditions are stated per item in §3/§4.

---

## 9. Open decisions before implementation

1. **Ship now?** Recommendation: **yes** (GA4 actions-only). Confirm.
2. **GA4-only?** Yes — V1 is already GA4-only; no UA support to add. Confirm no UA demand.
3. **Required scopes:** `analytics.readonly` (reads) + `analytics.edit` (send_event, create_conversion_event). Confirm `analytics.edit` is acceptable given Google OAuth app-verification (sensitive scope) for public launch, or ship read-only first (`run_report`/`run_pivot_report`/`get_realtime_data`/`find_conversion`) and add the edit actions behind verification.
4. **First-class actions:** the 6 in §4 — confirm `send_event` + `create_conversion_event` are wanted (the edit-scope pair), or read-only-first.
5. **Triggers:** confirm DEFER (actions-only) vs a GA-5 polling threshold trigger.
6. **Quota handling:** typed error + log, no auto-backoff (matches Monday/Dropbox) — confirm.
7. **Resolvers:** confirm the 4 keys + static metric/dimension lists now (dynamic `metadata` resolver deferred).
8. **`accountId` as UI-scope-only field** (not sent to Data API) — confirm the Dropbox-`folderPath`-style pattern.

---

## 10. Acceptance criteria (this slice)

- [x] Doc-only — no source / runtime / resolver / metadata changes.
- [x] No `integrations/google-analytics/` runtime files added.
- [x] No metadata, resolvers, or triggers added.
- [x] No `COVERED_PROVIDERS` flip.
- [x] No unrelated dirty files touched/staged.
