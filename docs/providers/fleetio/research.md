# Fleetio — Provider Research (FLEETIO-1, Slice 0)

**Status:** Slice 0/1 complete (auth + connection shell). Actions/triggers not yet implemented.
**Plan:** [`docs/slices/phase-5/fleetio-integration-plan.md`](../../slices/phase-5/fleetio-integration-plan.md)
**Primary evidence:** the official versioned OpenAPI schema (`https://developer.fleetio.com/schemas/2025-05-05.yaml`,
OpenAPI 3.0.0, `info.version: 2025-05-05`) inspected directly, plus developer.fleetio.com overview docs and
help.fleetio.com. Facts below labeled by confidence; anything not establishable from authoritative
sources is marked **VERIFY** with the exact live-certification step to resolve it.

## 1. What Fleetio is / why it matters to ChainReact

Fleetio (fleetio.com) is a fleet **maintenance** management system (FMMS) for SMB fleets (~5–several
hundred vehicles): preventive-maintenance scheduling, work orders, service entries/history,
FMCSA-compliant DVIRs/inspections, issues/defects, fuel + meter entries (IFTA inputs), parts,
purchase orders, compliance reminders. It deliberately is NOT telematics — it sits alongside Motive
(which we already ship), making Fleetio the maintenance-side counterpart in the trucking wedge:
Motive (telematics) + Fleetio (maintenance) + QuickBooks (books) + Slack/Teams/Outlook (people).

## 2. API platform facts (API version 2025-05-05)

| Dimension | Finding | Confidence |
|---|---|---|
| Base URL | `https://secure.fleetio.com/api` — paths carry NO version segment as of 2025-05-05 | HIGH (schema) |
| Versioning | Date-based; key pinned at creation; per-request override via `X-Api-Version`. Versions supported ≥ 2 years. V2 pins `X-Api-Version: 2025-05-05` on every call | HIGH |
| Auth | TWO headers: `Authorization: Token <apiKey>` + `Account-Token: <token>`. **No OAuth** (no public authorize/token endpoints, no partner app registration). Key is bound to a Fleetio USER and inherits that user's role (RBAC); no granular token scopes | HIGH |
| Identity/verify endpoint | `GET /accounts` — authenticates with the API key ALONE (no Account-Token header needed); returns `records[]` each with numeric `id`, `name`, **`token`** (the Account-Token), `plan`, and a permission map. This proves the key AND lets us match the user-entered Account-Token | HIGH (schema, `/accounts` description) |
| Legacy `/users/me` | Exists only in legacy v1 docs; **absent from the 2025-05-05 schema**. Not used | HIGH |
| Webhooks | **Full API CRUD**: `GET/POST /webhooks`, `GET/PATCH/DELETE /webhooks/{id}`, plus `GET /webhook_events` delivery log. Webhook object exposes `shared_key` (HMAC-SHA256 signing key; signature header `X-Fleetio-Webhook-Signature`), per-event booleans, `disabled_reason`, `failed_attempts` (>3 → disabled). 200-within-30s; retries ~5×/1h then hourly ≤24h. UI path: Settings → Webhooks | HIGH (schema paths verified) |
| Rate limits | 429 + `Retry-After` (seconds), throttled **per account token**; numeric limits are plan-dependent and unpublished. Official guidance: >20 req/min → use the Bulk API. V2 honors `Retry-After` with a bounded single inline retry (≤10s) | HIGH on behavior; MEDIUM on 20/min |
| Pagination | Keyset: `start_cursor`/`next_cursor`, `per_page` **2–100** (default 50; `per_page=1` is invalid), `estimated_remaining_count` capped ~500. Opaque cursors (no host leakage) | HIGH |
| Filtering/sorting | `filter[field][op]=` (AND-combined, `lt/lte/gt/gte/eq/like` per field) + `sort[field]=asc\|desc`; echoed in `filtered_by`/`sorted_by`. `created_at`/`updated_at` filters + sorts exist on **/issues, /work_orders, /fuel_entries, /submitted_inspection_forms, /service_reminders** → deterministic incremental polling is possible (`filter[updated_at][gt]=<cursor>&sort[updated_at]=asc`, `sort[id]` tiebreak) | HIGH (schema, field-by-field) |
| Transition detection | `filter[service_reminder_status][eq]=ok\|overdue\|due_soon\|snoozed`; `/work_orders` filter by `work_order_status_name` (names, not ids; catalog at `GET /work_order_statuses`); `GET /vehicle_status_changes` is a true transition log (vehicles only). No general audit endpoint — webhooks are the intended transition mechanism | HIGH |
| SDKs / MCP | No official SDK; **no official MCP server** | HIGH |
| Plans | API **and** webhooks require Professional or Premium | HIGH (help docs verbatim) |
| Sandbox | Real sandbox environments (Pro: 1, Premium: 2). Trial accounts can't read seeded sample data via API | HIGH |

### Account-Token lifecycle
Durable per-account identifier (it is the URL slug of every Fleetio page and a required field on the
`Account` API object). Found at the bottom of **Account menu → Settings → Manage API Keys** (API keys
are created on the same page). No authoritative doc states whether it can ever rotate — **VERIFY
(live cert):** confirm regenerating an API key leaves the Account-Token unchanged. Mitigation already
built in: `providerAccountId` is the numeric `Account.id`, NOT the token, so a token change surfaces
as a failed health call → reconnect, never a duplicated integration row.

## 3. VERIFY items from the plan — resolution

| # | Plan VERIFY item | Resolution |
|---|---|---|
| 1 | Webhook management via API? | **RESOLVED — YES, full CRUD incl. `shared_key` retrieval** (schema-verified). Slice 6 (webhook triggers) can be fully API-driven; no owner-manual webhook setup needed |
| 2 | Best credential-verify endpoint | **RESOLVED — `GET /accounts`** (key-only auth; match entered Account-Token against `records[].token`; yields durable numeric id + name + plan). Implemented in `integrations/fleetio/auth.ts` |
| 3 | Exact per-plan rate limits | **PARTIALLY RESOLVED** — behavior (429/`Retry-After`, per-account-token) confirmed; numbers unpublished (only "20 req/min → use Bulk API" guidance). Remaining step: observe live sandbox limits during Phase-13 certification |
| 4 | OpenAPI schema URL | **RESOLVED —** `https://developer.fleetio.com/schemas/2025-05-05.yaml` (downloaded + inspected) |
| 5 | Account-Token stability | **PARTIALLY RESOLVED** — structurally durable; rotation behavior undocumented. Live-cert step above; design already keys rows by numeric account id |
| 6 | `updated_at` filtering/ordering for polling | **RESOLVED — YES** on all five planned polling resources (schema-verified) |
| 7 | Reminder/work-order transition detection without broad scans | **RESOLVED** — status filters exist (`service_reminder_status`, `work_order_status_name`); webhooks are the better transition mechanism and are API-manageable |

## 4. Action/trigger catalog (decided in the plan; unchanged by Slice 0/1)

**Ship (Slice 2–3 actions):** Create Meter Entry · Create Issue · Create Fuel Entry · Create Service
Entry · Get Vehicle · Update Vehicle Status.
**Ship (Slice 4 triggers, polling-first):** Inspection Submitted · Issue Created · Work Order Status
Changed · Fuel Entry Created · Service Reminder Due.
**Should-have (Slice 5):** Create Work Order · Update/Resolve Issue · Create Contact · Update Meter
Entry · list actions · Vehicle Status Changed / Work Order Created / Issue Resolved triggers.
**Webhook upgrade (Slice 6):** now confirmed fully API-manageable — create webhook + store
`shared_key` (encrypted) + verify `X-Fleetio-Webhook-Signature` per-provider helper.
**Skip/defer:** purchase orders + parts (Premium-gated, back-office), Create Vehicle (rare,
high-stakes), bulk/CSV imports (compose loops), org/partner endpoints (`POST /accounts` is
partner-only).

Rationale + per-item value ranking: plan §4–§5. Full Rule-17 field classification:
[`configuration-design.md`](./configuration-design.md).

## 5. Polling design notes for Slice 4 (from schema evidence)

- Incremental scan: `filter[updated_at][gt]=<high-water>` + `sort[updated_at]=asc` + `sort[id]` tiebreak,
  keyset pagination `per_page ≤ 100`. Baseline-first (rule 11): seed the high-water mark at activation.
- Dedup (rule 13): stable numeric ids per resource (`issue.id`, `work_order.id`, …) prefixed per-trigger.
- Service reminders: poll `filter[service_reminder_status][eq]=overdue` (+`due_soon`) and diff against
  the stored per-resource state in `trigger_resources.config` to fire only on transition edges.
- Rate budget: polling shares the per-account-token throttle — keep per-tick page counts bounded.

## 6. Sources

- OpenAPI schema: https://developer.fleetio.com/schemas/2025-05-05.yaml (primary)
- https://developer.fleetio.com/docs/overview/{quick-start,security,versioning,pagination,rate-limiting,webhooks,filtering-and-sorting}
- https://developer.fleetio.com/docs/api/webhooks · /docs/guides/resolving-errors/avoiding-too-many-requests-errors
- https://help.fleetio.com/en_US/manage-account-settings-permissions/api-keys
- https://fleetio.helpjuice.com/fleetio-webhooks-overview-5 · https://fleetio.helpjuice.com/sandbox-environments
- Business research + workflow analysis: plan §2–§3 (Fleetio↔Motive Aug-2025 advanced integration, G2/Capterra, Fleetio feature pages)
