# Microsoft Power BI Owner Setup Report

> Everything Marcus needs to take this provider from code-complete to live.
> No secrets or env VALUES appear here — env var NAMES only.

## Status

- **Code status:** code-complete; owner setup required.
- **Commit:** local, not pushed (see the closeout report for the hash).
- **Push status:** nothing pushed.
- **Smoke status:** mocked-boundary unit tests cover all 47 actions and 16 triggers, and
  a smoke fixture is registered for every one of the 47 actions (10 read + 37 write).
  Every fixture is env-gated on `SMOKE_MICROSOFT_POWERBI_*`, so all 47 currently sit at
  **BLOCKED_ENV** in the certification matrix. **No live Power BI call has been made** —
  no tenant is connected yet. The 37 write fixtures do NOT yet carry a `writeHarness`
  phase plan (setup → verify → cleanup); authoring those requires real Power BI
  resources, so it is Phase 13 work alongside live certification.
- **Remaining owner action:** Entra app permissions + redirect URI + a Power BI Pro
  test user (+ capacity for the capacity-gated features). No new Vercel env vars.

## Provider developer portal setup (Microsoft Entra ID)

### App/basic settings

- **App name:** the EXISTING ChainReact Entra app — the same registration behind
  Outlook, OneDrive, Excel, OneNote, Teams (`MICROSOFT_CLIENT_ID`).
  **Do not create a new app registration.**
- **App type:** Web (confidential client; PKCE is sent as defense-in-depth).
- **Supported account types:** unchanged (multi-tenant, `/common`).
- **Website / Privacy / Terms / Support:** unchanged.
- **Logo:** unchanged.
- **Notes:** Power BI is the first non-Graph audience on this app. Adding Power BI
  delegated permissions does NOT affect the existing Graph providers — Entra issues
  a per-resource token at exchange time, keyed by the scopes in the authorize call.

### Redirect URIs

Add ONE new callback (the app already has the sibling providers' callbacks):

- **Local:** `http://localhost:3000/api/integrations/oauth/microsoft-powerbi/callback`
- **Preview/Vercel:** `https://<preview-deployment-host>/api/integrations/oauth/microsoft-powerbi/callback`
- **Production:** `https://chainreact.app/api/integrations/oauth/microsoft-powerbi/callback`
- **Exact callback path:** `/api/integrations/oauth/microsoft-powerbi/callback`

The redirect is derived from `NEXT_PUBLIC_APP_URL`, so the registered URI must match
the environment under test (Phase 13 environment-alignment gate).

### Webhook URLs

**None.** Power BI exposes no author-safe outbound webhook for semantic models,
dataflows, imports, pipelines, gateways, or workspace membership. Every trigger polls
on the existing `/api/cron/run-polling-triggers` schedule (5-minute default interval).
Nothing to register provider-side; no signing secret.

### OAuth scopes

API: **Power BI Service** (`https://analysis.windows.net/powerbi/api`) — add these
**delegated** permissions. All are user-consentable (no admin consent needed).

| Scope | Required? | Used by | Why |
|---|---:|---|---|
| `openid` | Yes | OAuth callback | Issues the id_token used to identify the connected account. |
| `profile` | Yes | OAuth callback | Identity claims on the id_token. |
| `email` | Yes | OAuth callback | `email` claim → `provider_account_id`. |
| `offline_access` | Yes | Token refresh | Without it tokens die in ~1h and the integration goes cold. |
| `Dataset.ReadWrite.All` | Yes | 12 semantic-model actions, DAX, all 5 gateway actions, refresh/DAX triggers | Refresh/cancel/history/details, executeQueries, parameters, schedule, datasources, gateway bind, takeover, scale-out. **Also authorizes every gateway endpoint** — Microsoft documents no `Gateway.*` scope. |
| `Report.ReadWrite.All` | Yes | 7 report actions | Export-to-file, .pbix export, clone, rebind, paginated datasources/gateway bind. |
| `Dashboard.Read.All` | Yes | `workspace_item_added` / `workspace_item_removed` (dashboard item type) | Listing dashboards for the item-type filter. READ scope only — no shipped node writes a dashboard (the API documents "Dashboard.ReadWrite.All or Dashboard.Read.All"; we take the narrower one). |
| `Content.Create` | Yes | `clone_report`, `import_power_bi_file` | Creating new content items. |
| `Workspace.ReadWrite.All` | Yes | 5 workspace actions, capacity assign, paginated gateway bind, workspace triggers | Workspace CRUD + membership. |
| `Dataflow.ReadWrite.All` | Yes | 4 dataflow actions + 3 dataflow triggers | Refresh/cancel/history/schedule. |
| `Pipeline.ReadWrite.All` | Yes | 8 pipeline actions + 2 pipeline triggers | Pipeline CRUD, users, stage assignment, operations. |
| `Pipeline.Deploy` | Yes | `deploy_all_pipeline_content`, `selectively_deploy_pipeline_content` | Microsoft requires this dedicated permission to deploy. |
| `Capacity.ReadWrite.All` | Yes | `assign_workspace_to_capacity`, `capacities` picker | Capacity assignment (with `Workspace.ReadWrite.All`). |
| `Tenant.Read.All` / `Tenant.ReadWrite.All` | **NO — deliberately excluded** | — | Admin-consent-gated. Adding them to the single connect-time consent screen would break connect for every non-admin user. See *Deferred*. |

### Provider-specific settings

- **Token rotation:** Microsoft may rotate the refresh token; the shared helper's
  preserve-old policy handles both cases.
- **PKCE:** S256, always sent.
- **Webhook signing:** n/a (no webhooks).
- **Event subscriptions:** n/a (polling).
- **Bot/user install choice:** n/a — delegated user tokens only. Power BI has no
  app-only equivalent for these delegated scopes (service principals bypass scopes
  entirely and are a different, unsupported auth model here).
- **Marketplace/review steps:** none.
- **Test-user requirements:** the connecting user needs a **Power BI Pro** (or PPU /
  trial) license. Capacity-gated features additionally need the workspace on
  Premium / Embedded / Fabric capacity — see *Licensing gates*.
- **Rate-limit notes:** Power BI returns 429 + `Retry-After`; no universal published
  numeric limit. Known: 8 semantic-model refreshes/day on shared capacity;
  executeQueries ~120 requests/min/user; export jobs capped per capacity.

## Vercel environment variables

**No new required env vars.** Power BI reuses the shared Microsoft credentials.

| Env var | Required? | Local? | Preview? | Production? | Where used | Notes |
|---|---:|---:|---:|---:|---|---|
| `MICROSOFT_CLIENT_ID` | Yes | Yes | Yes | Yes | `_shared/microsoft/oauth.ts` | **Already set** — shared with Outlook/OneDrive/Excel/OneNote/Teams. Unchanged. |
| `MICROSOFT_CLIENT_SECRET` | Yes | Yes | Yes | Yes | `_shared/microsoft/oauth.ts` | **Already set** — shared. Unchanged. |
| `NEXT_PUBLIC_APP_URL` | Yes | Yes | Yes | Yes | `microsoft-powerbi/oauth.ts` redirect | **Already set.** Must match the environment whose redirect URI is registered. |
| `POWERBI_API_BASE` | No | Optional | No | No | `api/_base.ts` | Test/e2e override only. Defaults to `https://api.powerbi.com`. Leave unset in Preview/Production. |
| `SMOKE_MICROSOFT_POWERBI_CONNECTED` | No | Smoke only | No | No | smoke fixtures | Gate for live action smoke. |
| `SMOKE_POWERBI_WORKSPACE_ID` | No | Smoke only | No | No | smoke fixtures | Live smoke target workspace. |
| `SMOKE_POWERBI_SEMANTIC_MODEL_ID` | No | Smoke only | No | No | smoke fixtures | Live smoke target semantic model. |
| `SMOKE_POWERBI_REPORT_ID` / `_PAGINATED_REPORT_ID` / `_DATAFLOW_ID` / `_PIPELINE_ID` / `_PIPELINE_STAGE_ORDER` / `_PIPELINE_OPERATION_ID` / `_GATEWAY_ID` / `_GATEWAY_DATASOURCE_ID` / `_CAPACITY_ID` / `_IMPORT_ID` / `_REFRESH_REQUEST_ID` / `_TEST_USER_EMAIL` / `_PBIX_STORAGE_PATH` / `_DATAFLOW_TRANSACTION_ID` / `_NEW_WORKSPACE_NAME` | No | Smoke only | No | No | smoke fixtures | Per-surface live-smoke targets; each fixture SKIPs when unset. |

## Supabase / database setup

- **Migrations added:** none. The provider reuses `integrations`,
  `trigger_resources`, `webhook_event_dedup`, and the `workflow-files` bucket.
- **`db:push` run:** not needed (no migrations).
- **RLS/policy notes:** unchanged — Power BI rows are ordinary account-scoped
  `integrations` rows.
- **Storage bucket notes:** export/`.pbix` actions stage bytes into the existing
  `workflow-files` bucket via `stageFileToStorage` (path
  `<userId>/<workflowId>/<runId>/<nodeId>/<filename>`).
- **Cron notes:** triggers ride the existing polling-trigger cron. No new cron.

## Actions shipped (47)

All have handler + `.strict()` schema + builder metadata + unit tests + smoke fixture.

| Domain | Actions |
|---|---|
| Semantic models (12) | `refresh_semantic_model`, `cancel_semantic_model_refresh`, `get_semantic_model_refresh_history`, `get_semantic_model_refresh_details`, `execute_dax_query`, `update_semantic_model_parameters`, `update_semantic_model_refresh_schedule`, `update_semantic_model_datasources`, `bind_semantic_model_to_gateway`, `take_over_semantic_model`, `trigger_query_scale_out_sync`, `get_query_scale_out_sync_status` |
| Reports (7) | `export_power_bi_report_to_file`, `export_paginated_report_to_file`, `export_report_definition`, `clone_report`, `rebind_report`, `update_paginated_report_datasources`, `bind_paginated_report_to_gateway` |
| Imports (2) | `import_power_bi_file`, `get_import_status` |
| Dataflows (4) | `refresh_dataflow`, `cancel_dataflow_refresh`, `get_dataflow_refresh_history`, `update_dataflow_refresh_schedule` |
| Pipelines (10) | `deploy_all_pipeline_content`, `selectively_deploy_pipeline_content`, `get_pipeline_deployment_status`, `get_pipeline_deployment_history`, `assign_workspace_to_pipeline_stage`, `unassign_workspace_from_pipeline_stage`, `create_deployment_pipeline`, `update_deployment_pipeline`, `add_or_update_pipeline_user`, `remove_pipeline_user` |
| Workspaces (5) | `create_workspace`, `update_workspace`, `add_workspace_user`, `update_workspace_user`, `remove_workspace_user` |
| Gateways (5) | `create_gateway_datasource`, `update_gateway_datasource_credentials`, `test_gateway_datasource_connection`, `add_or_update_gateway_datasource_user`, `remove_gateway_datasource_user` |
| Capacities (2) | `assign_workspace_to_capacity`, `get_capacity_assignment_status` |

## Triggers shipped (16) — all polling, baseline-first

`semantic_model_refresh_completed` · `_failed` · `_canceled` ·
`dataflow_refresh_completed` · `_failed` · `_canceled` ·
`import_completed` · `import_failed` ·
`pipeline_deployment_completed` · `_failed` ·
`dax_condition_met` · `dax_query_result_changed` ·
`gateway_datasource_status_changed` ·
`workspace_item_added` · `workspace_item_removed` (both with the controlled
report / semantic model / dashboard / dataflow item-type filter) ·
`workspace_access_changed`

Activation seeds a baseline before the first poll (first poll after activation fires
zero events) and throws on seed failure. Dedup keys use durable provider ids — never
timestamps.

## Manual verification checklist for Marcus

- [ ] Open the existing ChainReact app registration in Entra ID.
- [ ] API permissions → Add a permission → **Power BI Service** → Delegated → add the
      13 scopes in the table above.
- [ ] Grant consent (or let the first connecting user consent — none are admin-gated).
- [ ] Authentication → Redirect URIs → add
      `https://chainreact.app/api/integrations/oauth/microsoft-powerbi/callback`
      (and the localhost one for local testing).
- [ ] Confirm the test user has a Power BI Pro/PPU/trial license.
- [ ] No Vercel env changes needed → **no redeploy required for env**. (A deploy IS
      required for the code itself before production testing.)
- [ ] Connect Power BI from the Apps page; confirm the card shows Connected.
- [ ] Run the Phase 13 live certification (below).

## Licensing gates (expect these to fail without the right capacity — not bugs)

| Feature | Requires |
|---|---|
| `export_power_bi_report_to_file`, `export_paginated_report_to_file` | Workspace on **Premium / Embedded / Fabric capacity** — explicitly NOT supported on PPU or shared. |
| Enhanced refresh options on `refresh_semantic_model` (refreshType/commitMode/…) | Premium / PPU / Embedded. Shared capacity accepts `notifyOption` only. |
| `cancel_semantic_model_refresh`, `get_semantic_model_refresh_details` | Enhanced (API-started) refreshes only — the API cannot cancel scheduled/portal refreshes. |
| `trigger_query_scale_out_sync`, `get_query_scale_out_sync_status` | Premium with query scale-out enabled. |
| Deployment pipelines (all 10) | Premium / Fabric capacity. |
| `import_power_bi_file` > 1 GB | Not supported (Premium temporary-upload path deliberately not shipped). |
| `execute_dax_query` | Tenant setting "Dataset Execute Queries REST API" ON + Build permission on the model. |

## Known blockers / limitations (each with the exact reason + follow-up)

1. **Tenant-admin governance triggers NOT shipped** — `tenant_activity_event`,
   `unused_artifact_detected`, `capacity_refreshable_failed`.
   *Reason:* they require `Tenant.Read.All`, which is **admin-consent-gated**, plus
   the connecting user must be a Fabric administrator. V2 has one connect-time consent
   list per provider and no optional/incremental-consent flow, so adding the scope
   would break connect for every non-admin user — the opposite of honest capability.
   *Follow-up:* build an optional-scope reconnect flow (manifest `scopes.optional` +
   a per-integration consent upgrade), then ship these three behind it.
2. **Exports longer than ~40s fail with a retry hint.** The in-run export poll budget
   is 40s inside a 60s platform run window. *Follow-up:* durable async job
   continuation (a queued job that resumes across runs).
3. **Non-enhanced refresh cancellation unsupported** — the API only cancels enhanced
   refreshes. Not a gap we can close.
4. **Dataflow schedule `MailOnCompletion` unsupported** — not in the API's schedule
   notify enum.
5. **`rebind_report` is Power BI reports only**; `update_paginated_report_datasources`
   and `bind_paginated_report_to_gateway` are paginated (RDL) only. API-side split.
6. **Gateway credential encryption:** implemented per Microsoft's documented
   RSA-OAEP (1024-bit segmented) and hybrid AES-256-CBC+HMAC schemes, ported from the
   official PowerBI-CSharp encryptor and round-trip unit-tested. Cloud (non-on-prem)
   and VNet gateways are out of scope for these v1 endpoints; `Anonymous` and `OAuth2`
   credential types are excluded (unverifiable encrypted wire shape / not a V2 config
   shape).
7. **Push/streaming datasets, Goals/Scorecards, embed tokens, destructive deletes,
   and a generic API-call action are deliberately absent** per the product brief.
8. **Write-harness phase plans not authored (37 write fixtures).** The write smoke
   harness runs setup → execute → verify → cleanup against real provider resources; the
   plans can't be written honestly (or run) without a live workspace/model/gateway.
   Phase 13 authors them alongside live certification. The fixtures themselves are
   registered and env-gated, so nothing silently executes.

## Phase 13 — live certification plan (after setup)

1. **Environment alignment:** confirm the deployed commit contains the provider,
   `NEXT_PUBLIC_APP_URL` matches the environment, and the redirect URI is registered
   for that same environment.
2. **Live OAuth:** connect → confirm the `integrations` row + `provider_account_id` =
   the id_token email → force a token refresh.
3. **Live actions:** run each action with `testMode=false`; for capacity-gated ones,
   record the licensing outcome honestly rather than marking them pass.
4. **Live triggers:** activate → confirm zero events on the first poll → cause a real
   refresh/import/deployment → confirm exactly one run per event → deactivate.
5. **Live option sources:** verify each cascade and that labels leak no values.
6. **Event-shape review:** save sanitized observed payloads into `research.md`;
   re-check dedup keys against real ids.
7. **Cleanup accounting:** the smoke workspace, cloned reports, created pipelines, and
   any imported models must be listed as cleaned or intentionally left.
