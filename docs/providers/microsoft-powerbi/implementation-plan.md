# Microsoft Power BI — Implementation Plan

Date: 2026-07-15 · Research: [`research.md`](./research.md) · Patterns: [`v2-pattern-audit.md`](./v2-pattern-audit.md)

- **Provider ID:** `microsoft-powerbi`
- **Display name:** Microsoft Power BI
- **Credential class:** `personal` (Entra user identity; same as all `microsoft-*`)
- **Auth flow:** OAuth v2 code flow + PKCE via the shared Microsoft Entra app
  (`MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`), `/common` endpoints,
  `accountIdField: "email"` resolved from the `id_token` (see pattern audit §2).
- **API base:** `https://api.powerbi.com/v1.0/myorg` (env override `POWERBI_API_BASE`).
- **Triggers:** polling only (Power BI has no author-safe outbound webhook for these
  resources); baseline-first; 5-minute default interval.

## Scopes (all delegated, resource `https://analysis.windows.net/powerbi/api/`)

Required: `Dataset.ReadWrite.All`, `Report.ReadWrite.All`, `Content.Create`,
`Workspace.ReadWrite.All`, `Dataflow.ReadWrite.All`, `Pipeline.ReadWrite.All`,
`Pipeline.Deploy`, `Capacity.ReadWrite.All` + OIDC `openid profile email offline_access`.

Notes: gateways APIs are authorized by `Dataset.ReadWrite.All` (no Gateway.* scope in
the REST docs). `Tenant.Read.All` is **excluded** — it is admin-consent-gated and would
break connect for non-admin users (see Deferred).

## Actions — 47, in `actions/<domain>/`

### semantic_models (12)
| type | endpoint |
|---|---|
| `refresh_semantic_model` | POST `groups/{g}/datasets/{d}/refreshes` (notifyOption; optional enhanced body when `useEnhancedRefresh`) |
| `cancel_semantic_model_refresh` | DELETE `groups/{g}/datasets/{d}/refreshes/{r}` (enhanced refreshes only — documented) |
| `get_semantic_model_refresh_history` | GET `groups/{g}/datasets/{d}/refreshes?$top` |
| `get_semantic_model_refresh_details` | GET `groups/{g}/datasets/{d}/refreshes/{r}` |
| `execute_dax_query` | POST `groups/{g}/datasets/{d}/executeQueries` (1 query; bounded rows output + truncation flag) |
| `update_semantic_model_parameters` | POST `…/Default.UpdateParameters` |
| `update_semantic_model_refresh_schedule` | PATCH `…/refreshSchedule` |
| `update_semantic_model_datasources` | POST `…/Default.UpdateDatasources` |
| `bind_semantic_model_to_gateway` | POST `…/Default.BindToGateway` |
| `take_over_semantic_model` | POST `…/Default.TakeOver` |
| `trigger_query_scale_out_sync` | POST `…/queryScaleOut/sync` |
| `get_query_scale_out_sync_status` | GET `…/queryScaleOut/syncStatus` |

### reports (7)
`export_power_bi_report_to_file` (POST `reports/{r}/ExportTo` → in-run poll
`exports/{id}` → GET `…/file` → stage → FileRef), `export_paginated_report_to_file`
(same job API, paginated formats/parameters), `export_report_definition` (GET
`reports/{r}/Export` → .pbix → FileRef), `clone_report`, `rebind_report`,
`update_paginated_report_datasources` (paginated-only endpoint),
`bind_paginated_report_to_gateway` (paginated-only).

### imports (2)
`import_power_bi_file` (POST `groups/{g}/imports?datasetDisplayName&nameConflict`,
multipart body from FileRef input), `get_import_status` (GET `imports/{id}`).

### dataflows (4)
`refresh_dataflow` (POST `dataflows/{d}/refreshes`), `cancel_dataflow_refresh`
(POST `dataflows/transactions/{t}/cancel`), `get_dataflow_refresh_history`
(GET `dataflows/{d}/transactions`), `update_dataflow_refresh_schedule`
(PATCH `dataflows/{d}/refreshSchedule`).

### pipelines (10)
`deploy_all_pipeline_content` (POST `pipelines/{p}/deployAll`),
`selectively_deploy_pipeline_content` (POST `pipelines/{p}/deploy`),
`get_pipeline_deployment_status` (GET `pipelines/{p}/operations/{op}`),
`get_pipeline_deployment_history` (GET `pipelines/{p}/operations`),
`assign_workspace_to_pipeline_stage`, `unassign_workspace_from_pipeline_stage`,
`create_deployment_pipeline`, `update_deployment_pipeline`,
`add_or_update_pipeline_user`, `remove_pipeline_user`.

### workspaces (5)
`create_workspace` (POST `groups?workspaceV2=true`), `update_workspace`,
`add_workspace_user`, `update_workspace_user`, `remove_workspace_user`.

### gateways (5)
`create_gateway_datasource`, `update_gateway_datasource_credentials` (both RSA-OAEP
client-side credential encryption vs gateway public key — see pattern audit §6),
`test_gateway_datasource_connection` (GET `…/datasources/{d}/status`),
`add_or_update_gateway_datasource_user`, `remove_gateway_datasource_user`.

### capacities (2)
`assign_workspace_to_capacity` (POST `groups/{g}/AssignToCapacity`; unassign via the
documented empty-GUID capacityId is exposed as an explicit `unassign` boolean? No —
explicit required `capacityId` plus a separate honest description; unassign is its own
follow-up if product wants it), `get_capacity_assignment_status`.

Deploys are gated by `Pipeline.Deploy`; destructive-ish operations
(`remove_*`, `deployAll` with overwrite) carry `riskLevel:"high"` +
`requiresConfirmation` per existing meta conventions.

## Triggers — 17 shipped, all polling, baseline-first

| eventType (short form) | Poll source |
|---|---|
| `semantic_model_refresh_completed` / `_failed` / `_canceled` | GET refresh history; emit on NEW terminal entries after baseline (key: refresh requestId/startTime) |
| `dataflow_refresh_completed` / `_failed` / `_canceled` | GET dataflow transactions |
| `import_completed` / `import_failed` | GET imports in group; state transitions |
| `pipeline_deployment_completed` / `_failed` | GET pipeline operations |
| `dax_condition_met` | executeQueries; edge-triggered false→true on typed operator vs scalar result |
| `dax_query_result_changed` | executeQueries; result-hash change (bounded rows in payload + truncation flag) |
| `gateway_datasource_status_changed` | GET datasource status; state transitions |
| `workspace_item_added` / `workspace_item_removed` | GET reports+datasets+dashboards+dataflows in workspace; id-set diff; controlled multi-select `itemTypes` filter |
| `workspace_access_changed` | GET group users; diff of principal→right map |

Shared poller: `triggers/_shared/pollingHandler.ts` + `snapshot.ts` (Excel pattern);
one `registerPollingHandler` call; per-trigger `registerActivation` seeds baseline and
THROWS on failure. Dedup: DB-backed `markSeen` with synthetic stable ids.

## Deferred / not shipped (exact reasons — owner report repeats these)

1. `tenant_activity_event`, `unused_artifact_detected`, `capacity_refreshable_failed` —
   require `Tenant.Read.All` (admin-consent-gated) + Fabric-admin user. Adding the scope
   to the single connect-time consent list breaks non-admin connects; V2 has no
   incremental/optional-consent flow yet. Follow-up: optional-scope reconnect flow.
2. Push/streaming semantic-model creation, Goals/Scorecards (preview), embed tokens,
   destructive deletes — excluded by product instruction.
3. Non-enhanced refresh cancellation — the API only cancels enhanced refreshes.
4. Dataflow refresh-schedule `MailOnCompletion` notify — not supported by the API.
5. `rebind` for paginated reports — API supports Power BI reports only.
6. Exports larger than the in-run poll budget (~40s) fail with a classifiable timeout
   error and author guidance — platform run window is 60s. Follow-up: durable async job
   continuation.

## Option sources (16, `microsoft-powerbi:<resource>`)

workspaces; reports(workspace); reportPages(workspace,report);
semanticModels(workspace); semanticModelParameters(workspace,dataset);
semanticModelDatasources(workspace,dataset); dataflows(workspace); imports(workspace);
pipelines; pipelineStages(pipeline); pipelineStageArtifacts(pipeline,stage,itemType);
gateways; gatewayDatasources(gateway); capacities; workspaceUsers(workspace);
dataflowTransactions(workspace,dataflow — for cancel).

## Testing / smoke strategy

- Unit tests per domain under `tests/unit/integrations/microsoft-powerbi/…` — success,
  `.strict()` rejection, 401→refreshAndRetry wiring, 403/429/5xx sanitization, bounded
  output, no token leakage; trigger tests for baseline-first zero-emit, terminal-state
  emission, dedup, disabled-drop, eventType short-form; option-source tests incl.
  non-owner denial.
- Smoke fixtures for all 47 actions (mocked boundary); export/import fixtures use the
  async `completeAsync` harness spec where applicable. Live certification is Phase 13
  after Marcus's portal/env setup.

## Owner setup (summary — full detail in owner-setup-report.md)

Reuse the existing shared Microsoft Entra app: add the Power BI delegated permissions
listed above, add redirect URI `…/api/integrations/oauth/microsoft-powerbi/callback`
(local + prod), no new env vars beyond the existing `MICROSOFT_CLIENT_ID`/`SECRET`
(optional `POWERBI_API_BASE` override for tests). No DB migrations.

## Known blockers

None for code-complete. Live certification requires: Entra app permission update,
a Power BI Pro (or trial) license on the test user, and capacity-gated features
(export-to-file, enhanced refresh, scale-out, pipelines need Premium/Fabric capacity)
verified only where Marcus's tenant has capacity.
