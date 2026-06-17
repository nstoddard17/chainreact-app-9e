# V2-READY-49 — Sensitive-Table Data API Grant Audit

**Type:** Security audit. **No schema/grant/code change — docs only.**
**Date:** 2026-06-16
**Branch:** `v2-main` (local/unpushed)
**Governing skill:** `chainreactv2-security-review`
**Follows the integrations arc:** 47/47B/47C/47D/47E (integrations → service-role-only) + 48 (callback role re-check).

---

## Executive summary (go / no-go)

Audited every `public.*` table (31 total) for the class of exposure we fixed on `integrations`:
**direct `authenticated` Data API grants that bypass service-layer authorization or expose
secret/credential/payload data.**

**The most sensitive tables are already SERVICE-ROLE-ONLY** (no `authenticated`/`anon` grant):
`integrations` (revoked 47B/47D), `oauth_states`, `account_api_keys`, `api_key_rate_limits`,
`builder_agent_messages`, `builder_agent_threads`, `stripe_billing_events`, `webhook_event_dedup`,
`hubspot_app_subscriptions`, `hubspot_subscription_refs`, `user_billing`. **No `anon` data grants
exist anywhere.** Good baseline.

**Three tables mirror the pre-fix `integrations` class and are REAL gaps — each needs a migration
(two also need an authenticated read/write path moved to service-role):**
1. **`trigger_resources`** (HIGH) — `authenticated` FULL CRUD; app **writes via the authenticated
   client**; direct writes bypass the trigger lifecycle; exposes provider account ids + external
   resource ids. (No webhook signing secrets stored.)
2. **`workflow_runs`** (HIGH) — `authenticated` SELECT exposes `trigger_event` (raw trigger
   payloads), `steps` (per-step outputs), `fatal_error` — which can carry resolved secrets/PII;
   app **reads via the authenticated client** and a route returns step data. Product visibility of
   raw payloads is ambiguous.
3. **`workflow_files`** (MEDIUM) — `authenticated` SELECT exposes `storage_path` (file reference /
   bucket hierarchy) + `file_name` (possible PII); app reads are already service-role (grant unused).

**This is a STOP-AND-REPORT.** Every recommended fix requires a `REVOKE` migration (and, for
`trigger_resources`/`workflow_runs`, moving an authenticated path to service-role + a product
decision on `workflow_runs` payload visibility). **No migration, code, or test was changed in this
slice** — awaiting Marcus's approval (would ship as 50/51/52).

---

## 1. Grant inventory (authoritative — from the migration corpus)

`authenticated` Data API grants per table (net; `service_role` has full DML on all; **no `anon`
data grants**):

| Table | authenticated | Sensitive? | Classification |
|---|---|---|---|
| **integrations** | **none** (revoked 47B/47D) | tokens/scopes/meta | ✅ service-role-only (LOCKED) |
| oauth_states, account_api_keys, api_key_rate_limits, builder_agent_messages, builder_agent_threads, stripe_billing_events, webhook_event_dedup, hubspot_*, user_billing | **none** | nonces/PKCE, key hashes, AI chat, Stripe payloads, dedup | ✅ service-role-only (LOCKED) |
| **trigger_resources** | **SELECT, INSERT, UPDATE, DELETE** | provider acct id + resource ids | ⚠️ **GAP — should be service-role-only** |
| **workflow_runs** | **SELECT** | `trigger_event`/`steps`/`fatal_error` payloads | ⚠️ **GAP — payload columns** |
| **workflow_files** | **SELECT** | `storage_path`, `file_name` | ⚠️ **GAP — file references** |
| workflow_node_credentials | SELECT | owner user-ids only (no tokens) | ✅ safe (account-scoped metadata) |
| workflow_node_connector_bindings | SELECT | connector user-ids only (no tokens) | ✅ safe (account-scoped metadata) |
| account_billing, task_usage_events, ai_cost_events, billing_shadow_comparisons | SELECT | counts/tokens/costs (no prompt content, no secrets) | ✅ safe (account-scoped; billing-frozen) |
| account_invitations | SELECT | email + `token_hash` (HASHED, not raw) | ✅ safe-ish (hash ≠ usable token; verify owner/admin SELECT scope) |
| account_deletions | SELECT | status/timestamps | ✅ safe (account-scoped) |
| accounts, account_memberships, user_profiles, workflows, workflow_revisions, workflow_folders, workflow_templates, workflow_template_usage_events, workflow_node_* | SELECT/CRUD | account/user metadata | ✅ intended-visible (don't overcorrect) |

Tables that don't exist in V2 (audit-target list): `workflow_run_steps`, `workflow_run_logs`,
`execution_steps`, `webhook_configs`, `task_billing_events`, `pack_purchases`,
`task_overage_events`. Execution step data lives in `workflow_runs.steps` (jsonb).

---

## 2. The three gaps (detail)

### 2.1 `trigger_resources` — authenticated FULL CRUD bypasses the lifecycle (HIGH)
- **Columns** ([`20260507000000`](../../../supabase/migrations/20260507000000_trigger_resources_and_dedup.sql)):
  `provider`, `event_type`, `node_id`, `config jsonb` (channel ids, `resourceId`, `syncToken`,
  `hookId`, poll snapshots), `account_id` (provider-side scope, e.g. Slack `team_id`). **No webhook
  signing secrets** (those are env-only).
- **Grants:** `authenticated` SELECT/INSERT/UPDATE/DELETE ([`20260619000000:41-44`](../../../supabase/migrations/20260619000000_backfill_data_api_grants.sql)).
- **RLS:** account-membership for all four ops; **INSERT/UPDATE/DELETE lack the
  `accounts.deletion_status='active'` gate** that SELECT has (`20260531000006`).
- **App access:** `repositories/triggerResources.ts` — `upsert`, `deleteByWorkflow`,
  `listByWorkflow` use the **authenticated SSR client** (`createClient`); dispatch/polling/updateConfig
  use service-role. So app writes go through `authenticated`.
- **Exposure:** a member can directly `supabase.from('trigger_resources').insert/update/delete`,
  **bypassing `TriggerLifecycleManager`** (snapshot init, webhook registration, integration-health
  checks) and the deletion-status gate — the SAME class as the pre-fix `integrations` writes. Direct
  SELECT also reveals provider account ids + external resource ids across the account.
- **Recommend:** `REVOKE INSERT, UPDATE, DELETE` (and almost certainly `SELECT`) from `authenticated`,
  and move `upsert`/`deleteByWorkflow`/`listByWorkflow` to `getServiceRoleClient` with the existing
  activation-route authz as the gate (mirror integrations 47B/47D). **Migration + code change.**

### 2.2 `workflow_runs` — raw execution payload columns to authenticated (HIGH)
- **Columns** ([`20260507000001`](../../../supabase/migrations/20260507000001_workflow_runs.sql)):
  sensitive `trigger_event jsonb` (raw trigger/webhook body, manual inputs), `steps jsonb`
  (per-step handler outputs), `fatal_error jsonb`; the rest are safe (status/timestamps/costs/ids).
- **Grants:** `authenticated` SELECT.
- **RLS:** account-membership (co-members can read — intended team behavior).
- **App access:** `repositories/workflowRuns.ts` — `getById` + `listByWorkflow` use the
  **authenticated client** with `.select("*")` (full payloads); `listByAccountForDisplay` uses a safe
  `DISPLAY_RUN_COLUMNS` projection. The route `app/api/workflows/[id]/runs/route.ts` reads via
  `listByWorkflow` and returns step data (`app/api/workflows/_shared.ts:594`).
- **Exposure:** a member can directly `select('trigger_event, steps, fatal_error')` and read raw
  execution inputs/outputs that **can contain resolved secrets/PII**, bypassing the display DTO. The
  app itself already surfaces `steps` via the runs route — so **product visibility of raw payloads is
  ambiguous** (is showing raw step output / trigger bodies to all account members intended, and with
  what redaction?).
- **Recommend:** decide the product rule first (what run detail members may see, with secret
  redaction), then `REVOKE SELECT` from `authenticated` and route reads through service-role + a safe
  DTO (extend `DISPLAY_RUN_COLUMNS`; redact/omit `trigger_event`/`steps` or pass them through a
  redactor). **Migration + read-path move + product decision.**

### 2.3 `workflow_files` — file references to authenticated (MEDIUM)
- **Columns** ([`20260512000000`](../../../supabase/migrations/20260512000000_workflow_files.sql)):
  `storage_path` (`<userId>/<workflowId>/<runId>/<nodeId>/<filename>`), `file_name`, `mime_type`,
  `size_bytes`, `metadata jsonb` ("producers MUST NOT include secrets", unenforced). **No file
  content** (content lives in the storage bucket; the path alone isn't a signed/downloadable URL).
- **Grants:** `authenticated` SELECT. **RLS:** account-membership.
- **App access:** `repositories/workflowFiles.ts` — **all reads service-role**; no authenticated read
  path exists yet ("added in a follow-up"). So the `authenticated` SELECT grant is **unused by the app.**
- **Exposure:** direct SELECT exposes `storage_path` + `file_name` to co-members (execution-structure
  inference + possible PII in filenames). No content, no signed URL → lower severity.
- **Recommend:** `REVOKE SELECT` from `authenticated` (clean — the grant is unused). When the
  user-facing file read lands, build it service-role + DTO. **Migration only (no code change).**

---

## 3. Threat note

- **Already closed (service-role-only):** the highest-value secrets — OAuth tokens (`integrations`),
  OAuth nonces/PKCE verifiers (`oauth_states`), API key hashes (`account_api_keys`), AI chat
  (`builder_agent_*`), Stripe payloads (`stripe_billing_events`) — have no `authenticated` grant.
- **Open (this audit):** `trigger_resources` write-bypass + resource-id exposure; `workflow_runs`
  raw-payload exposure (`trigger_event`/`steps`/`fatal_error`); `workflow_files` file-reference
  exposure. All are **account-scoped** (co-members only, not cross-account, not `anon`), so they are
  defense-in-depth / payload-redaction gaps within the team trust boundary — not public leaks.
- **Not exploitable for token theft today:** no encrypted tokens or raw webhook signing secrets sit
  in any authenticated-readable table; the run/trigger payloads *could* contain resolved values, which
  is exactly why the app DTOs redact them and direct PostgREST should not bypass that.

---

## 4. Stop-and-report triggers hit

- **"Any table exposes raw webhook payloads / execution inputs-outputs / file references directly to
  authenticated users."** ✅ `workflow_runs` (`trigger_event`/`steps`), `workflow_files` (`storage_path`).
- **"A fix requires a REVOKE/GRANT migration."** ✅ all three.
- **"Tightening access would require moving an authenticated read/write path to service-role."** ✅
  `trigger_resources` (writes), `workflow_runs` (reads).
- **"A table's intended product visibility is ambiguous."** ✅ `workflow_runs` raw-payload visibility.

Per the slice rules ("audit first; do not change schema/grants without reporting if a migration is
needed; do not touch billing/AI behavior"), nothing was implemented.

---

## 5. Recommended next slices (each gated on Marcus's approval)

- **V2-READY-50 — `trigger_resources` service-role-only:** `REVOKE INSERT/UPDATE/DELETE` (+ `SELECT`)
  from `authenticated`; move `upsert`/`deleteByWorkflow`/`listByWorkflow` to service-role behind the
  activation-route authz; add the deletion-status gate parity; gated RLS test (member direct write
  → 42501) + extend the V2-READY-47E net-grant guard to cover `trigger_resources`.
- **V2-READY-51 — `workflow_runs` payload lockdown:** product decision on member-visible run detail
  + redaction; `REVOKE SELECT` from `authenticated`; move `getById`/`listByWorkflow` reads to
  service-role + safe DTO; gated test.
- **V2-READY-52 — `workflow_files` SELECT revoke:** `REVOKE SELECT` from `authenticated` (grant unused);
  gated test. Lowest effort.
- **Generalize the 47E guard:** after 50–52, extend
  `tests/structure/no-authenticated-integration-grants.test.ts` (or a sibling) to assert the
  service-role-only set stays locked.

---

## 6. What did NOT change

Docs-only. No migration, no `db:push`, no RLS/GRANT change, no repository/route/DTO change, no test
change. No AI/MCP/billing behavior change (billing/cost ledgers were audited read-only and left
untouched). No new providers. CONN-SHARE untouched. Nothing pushed.
