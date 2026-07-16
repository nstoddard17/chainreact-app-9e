# Microsoft Power BI REST API — Integration Research Report

Researched 2026-07-15 against official Microsoft Learn documentation only (learn.microsoft.com).
All endpoints below were verified against the live v1.0 reference pages (`learn.microsoft.com/en-us/rest/api/power-bi/...`) unless explicitly flagged in **Could not verify**.

Base URL for all endpoints: `https://api.powerbi.com/v1.0/myorg/`
Group-scoped variants insert `/groups/{groupId}` after `myorg`. Endpoints without the `groups/{groupId}` segment target **My workspace** (personal workspace). ChainReact will require workspace selection, so the **In Group** variants are the primary surface.

Overview page: https://learn.microsoft.com/en-us/rest/api/power-bi/

---

## 1. Auth

### 1.1 OAuth 2.0 authorization-code flow (delegated user tokens)

Doc: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

- Authorize endpoint: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`
- Token endpoint: `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- `{tenant}` valid values: `common`, `organizations`, `consumers`, or a tenant ID. **`common` works**; for a work-account-only product `organizations` is also valid (Power BI requires work/school accounts, so `consumers` is not useful).
- Authorize params: `client_id`, `response_type=code`, `redirect_uri`, `scope` (space-separated), `state` (recommended), `code_challenge`/`code_challenge_method=S256` (PKCE recommended for all app types).
- Token redemption: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_secret` (confidential web apps), `code_verifier`.
- **Refresh tokens**: returned **only if `offline_access` scope was requested**. Refresh grant: `grant_type=refresh_token`, `refresh_token`, optional `scope` (subset of original). New refresh token is returned on each refresh; discard the old one. Access token lifetime ~3599s (`expires_in`).
- Recommended full scope request for sign-in: `openid profile offline_access https://analysis.windows.net/powerbi/api/<Scope> ...` (all resource scopes must come from a single resource per token request).
- Enhanced-refresh doc confirms the token audience must be `https://api.powerbi.com` (i.e., token issued for the Power BI resource): https://learn.microsoft.com/en-us/power-bi/connect-data/asynchronous-refresh

### 1.2 Power BI resource / scope model

- Resource URI: `https://analysis.windows.net/powerbi/api` — delegated scopes are requested as `https://analysis.windows.net/powerbi/api/{ScopeName}`.
- In the Entra portal the API is called **"Power BI Service"** and only **Delegated Permissions** exist (there are no app-only permissions for Power BI; service principals bypass scopes entirely — confirmed by the API overview: "Scopes are not required if you're using a service principal").
  - https://learn.microsoft.com/en-us/rest/api/power-bi/ (Scopes + Throttling sections)
  - https://learn.microsoft.com/en-us/power-bi/developer/embedded/change-permissions
  - https://learn.microsoft.com/en-us/power-bi/developer/embedded/register-app

Delegated scope names, verified per-endpoint from the "Required Scope" section of each v1.0 reference page fetched in this research:

| Area | Scopes (verified in endpoint docs) |
|---|---|
| Datasets read | `Dataset.Read.All` |
| Datasets write / refresh / parameters / schedules / takeover / gateway binding / scale-out | `Dataset.ReadWrite.All` |
| Reports read (incl. export status/file) | `Report.Read.All` |
| Reports write / rebind | `Report.ReadWrite.All` (note: paginated Update Datasources page prints `Reports.ReadWrite.All` — plural — likely a doc typo; the portal permission is `Report.ReadWrite.All`) |
| Export To File | `Report.ReadWrite.All` **or** `Report.Read.All`, **plus** `Dataset.ReadWrite.All` or `Dataset.Read.All` |
| Export .pbix | `Report.ReadWrite.All` or (`Report.Read.All` + `Dataset.Read.All`) |
| Clone report / imports of new content | `Content.Create` (Clone) / `Dataset.ReadWrite.All` (Post Import, temp upload location) |
| Workspaces (groups) | `Workspace.Read.All`, `Workspace.ReadWrite.All` |
| Dataflows | `Dataflow.Read.All`, `Dataflow.ReadWrite.All` |
| Deployment pipelines | `Pipeline.Read.All`, `Pipeline.ReadWrite.All`, and a dedicated **`Pipeline.Deploy`** for Deploy All / Selective Deploy |
| Gateways (all gateway endpoints incl. Create/Update Datasource, datasource users, status) | **`Dataset.ReadWrite.All`** (read ops accept `Dataset.Read.All`). There is no `Gateway.*` scope on any fetched gateway endpoint page. |
| Paginated report Bind To Gateway | `Workspace.Read.All` or `Workspace.ReadWrite.All` |
| Capacities | `Capacity.Read.All`, `Capacity.ReadWrite.All`; Groups AssignToCapacity requires `Capacity.ReadWrite.All` **and** `Workspace.ReadWrite.All`; CapacityAssignmentStatus lists `Workspace.Read.All and Workspace.ReadWrite.All` |
| Admin APIs (activity events, unused artifacts, admin refreshables) | `Tenant.Read.All` **or** `Tenant.ReadWrite.All` |

**Admin requirement on top of the scope:** every admin endpoint fetched states: *"The user must be a Fabric administrator or authenticate using a service principal. Delegated permissions are supported."* So for delegated user tokens, the signed-in user must hold the Fabric (Power BI) administrator role in addition to consenting `Tenant.Read.All` / `Tenant.ReadWrite.All`. (Admin scopes are admin-consent-required permissions.) Also note the doc warning: when authenticating admin APIs via *service principal*, the app must NOT have any admin-consent-required Power BI permissions configured.
Docs: https://learn.microsoft.com/en-us/rest/api/power-bi/admin/get-activity-events , https://learn.microsoft.com/en-us/rest/api/power-bi/admin/groups-get-unused-artifacts-as-admin , https://learn.microsoft.com/en-us/rest/api/power-bi/admin/get-refreshables

### 1.3 Licensing / capacity constraints (verified statements)

- **Export To File (Power BI reports)**: "The report you're exporting must reside in a workspace backed by a Premium, Embedded, or Fabric capacity." and "The exportToFile API is **not** supported for Premium Per User (PPU)." Also: "All related semantic models in the report you're exporting must reside on a Fabric, Premium or Embedded capacity, including semantic models with a Direct Query connection."
  https://learn.microsoft.com/en-us/power-bi/developer/embedded/export-to
- **Enhanced refresh**: requires "A semantic model in Power BI Premium, Premium per user, or Power BI Embedded." Refresh-Dataset-In-Group limitations: "Enhanced refresh is not supported for shared capacities." and "For Shared capacities, only `notifyOption` can be specified in the request body."
  https://learn.microsoft.com/en-us/power-bi/connect-data/asynchronous-refresh
- **Refresh count**: "For Shared capacities, a maximum of eight requests per day, including refreshes executed by using scheduled refresh, can be initiated." Premium: limited only by capacity resources; throttled if overloaded; "The refresh will fail if throttling exceeds 1 hour."
  https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/refresh-dataset-in-group
- **Large .pbix import (1–10 GB via temporary upload location)**: "only available for Premium capacity workspaces."
  https://learn.microsoft.com/en-us/rest/api/power-bi/imports/create-temporary-upload-location-in-group
- **Execute Queries** has NO capacity requirement in its doc, but requires the tenant setting "Dataset Execute Queries REST API" (Integration settings) to be enabled, and the user needs workspace access + dataset Read and **Build** permissions.
- **Query scale-out** endpoints don't state a licensing requirement on the endpoint pages; scale-out itself is a Premium feature (see Could not verify).
- Registering to use the APIs requires a Microsoft Entra tenant and an organizational user or a Power BI Pro account (https://learn.microsoft.com/en-us/power-bi/developer/embedded/register-app). Per-operation Pro requirements (e.g., workspace creation) are not stated on the endpoint pages — see Could not verify.

---

## 2. Endpoints (v1.0, all verified to exist)

Operation-group indexes fetched: datasets, reports, imports, dataflows, pipelines, groups, gateways, capacities (all under https://learn.microsoft.com/en-us/rest/api/power-bi/<group>).

### 2.1 Datasets (semantic models)

Docs root: https://learn.microsoft.com/en-us/rest/api/power-bi/datasets

**Refresh Dataset In Group** — `POST /groups/{groupId}/datasets/{datasetId}/refreshes` — scope `Dataset.ReadWrite.All`
- Body (`DatasetRefreshRequest`): `notifyOption` (**required** for standard refresh; enum `NoNotification` | `MailOnFailure` | `MailOnCompletion`; "not applicable to enhanced refreshes or API operations with a service principal" — for enhanced refresh it "must be excluded"), plus enhanced-refresh-only fields: `type` (`Full` | `ClearValues` | `Calculate` | `DataOnly` | `Automatic` | `Defragment`; default `automatic`), `commitMode` (`Transactional` | `PartialBatch`; default transactional), `maxParallelism` (int, default 10), `retryCount` (int, default 0), `objects` (array of `{table, partition}`; default entire model), `applyRefreshPolicy` (bool, default true; must be false when commitMode=partialBatch), `effectiveDate` (date-time), `timeout` (string `hh:mm:ss`, default 05:00:00 per attempt; total incl. retries ≤ 24h).
- **An enhanced refresh is triggered only if a request payload other than `notifyOption` is set.**
- Response: `202 Accepted`, headers `x-ms-request-id` (= refreshId) and `Location` (…/refreshes/{requestId}).
- Only one refresh at a time per model; a second request while one is running returns `400 Bad Request` (asynchronous-refresh doc).
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/refresh-dataset-in-group

**Cancel Refresh In Group** — `DELETE /groups/{groupId}/datasets/{datasetId}/refreshes/{refreshId}` — scope `Dataset.ReadWrite.All` — returns 200.
- Enhanced refresh only: asynchronous-refresh doc states "You can't cancel scheduled or on-demand model refreshes… using DELETE" and "Get details and Cancel are new operations for enhanced refresh only. Standard refresh doesn't support these operations."
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/cancel-refresh-in-group

**Get Refresh History In Group** — `GET /groups/{groupId}/datasets/{datasetId}/refreshes?$top={n}` — scope `Dataset.ReadWrite.All` or `Dataset.Read.All`
- `$top` optional (min 1); default = last available **60** entries. Caller must have Write permission on the dataset. OneDrive refresh history isn't returned.
- Response `Refreshes.value[]` (`Refresh`): `refreshType` (`Scheduled` | `OnDemand` | `ViaApi` | `ViaXmlaEndpoint` | `ViaEnhancedApi` | `OnDemandTraining`), `startTime`, `endTime` (empty while in progress), `status` (`Unknown` = in progress/unknown, `Completed`, `Failed` — serviceExceptionJson has error code, `Disabled`; per asynchronous-refresh doc `Cancelled` also appears), `serviceExceptionJson` (e.g. `{"errorCode":"ModelRefreshFailed_CredentialsNotSpecified"}`), `requestId`, `refreshAttempts[]` (`attemptId`, `startTime`, `endTime`, `type` `Data`|`Query`, `serviceExceptionJson`, `executionMetrics`).
- Poll this endpoint for refresh-completed triggers. Power BI retains a 7-day history, max 60 refreshes (refreshables doc).
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/get-refresh-history-in-group

**Get Refresh Execution Details In Group** — `GET /groups/{groupId}/datasets/{datasetId}/refreshes/{refreshId}` — scope `Dataset.ReadWrite.All` or `Dataset.Read.All`
- Returns `200` when completed/failed, `202` while in progress. Works for enhanced refreshes; standard portal-triggered refreshes don't support it (asynchronous-refresh doc), though the reference now shows an "On-Demand refresh - Completed" example.
- `DatasetRefreshDetail`: `startTime`, `endTime`, `type`, `commitMode`, `status` (`Unknown` | `Completed` | `Failed` | `Disabled`), `extendedStatus` (`Unknown` | `NotStarted` | `InProgress` | `Completed` | `TimedOut` | `Failed` | `Disabled` | `Cancelled`), `currentRefreshType`, `numberOfAttempts`, `objects[]` (per-partition status), `messages[]` (engine `{code, message, type Error|Warning}`), `refreshAttempts[]`, `serviceExceptionJson`, `initiatedBy`.
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/get-refresh-execution-details-in-group

**Execute Queries In Group** — `POST /groups/{groupId}/datasets/{datasetId}/executeQueries` — scope `Dataset.ReadWrite.All` or `Dataset.Read.All`
- Body: `queries` (required; array of `{query: "<DAX>"}`), `serializerSettings.includeNulls` (bool, default false), `impersonatedUserName` (UPN; ignored if model not RLS-enabled).
- Response 200: `results[].tables[].rows[]` (row objects keyed `Table[Column]`; renamed/created columns come back as `[MyNewColumn]`), `results[].error`, top-level `error {code, message}`, `informationProtectionLabel {id, name}`.
- Limits (verbatim from doc): **one query per API call; one table request per query; max 100,000 rows or 1,000,000 values per query (whichever hit first); max 15 MB of data per query** (current row completed, then truncation); **120 query requests per minute per user, regardless of dataset**; DAX only (no MDX/INFO/DMV); Azure Analysis Services-hosted or AAS-live-connection datasets not supported; tenant setting "Dataset Execute Queries REST API" must be enabled; requires dataset Read + Build permission.
- DAX query error → HTTP 400 with response error `DAX query failure`. Over-limit table/rows → HTTP **200** with limited data plus a response error (`More than one result table in a query` / `More than {allowed number} rows in a query result`).
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries-in-group

**Update Parameters In Group** — `POST /groups/{groupId}/datasets/{datasetId}/Default.UpdateParameters` — scope `Dataset.ReadWrite.All`
- Body: `updateDetails: [{name, newValue}]` (both strings). Max **100 parameters per request**; all must exist; names case-sensitive; no duplicates/empty list; expected types; parameter types `Any`/`Binary` can't be updated; `IsRequired` must have a non-empty value.
- **The caller must be the dataset owner** (use Take Over first if not). XMLA-endpoint-created/modified datasets not supported; DirectQuery only with enhanced dataset metadata; AAS live connections not supported.
- After update: with enhanced dataset metadata, refresh the dataset to apply; without, wait 30 minutes then refresh.
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/update-parameters-in-group

**Update Refresh Schedule In Group** — `PATCH /groups/{groupId}/datasets/{datasetId}/refreshSchedule` — scope `Dataset.ReadWrite.All`
- Body: `{"value": {days: ["Monday"...], times: ["07:00","16:00"], enabled: bool, localTimeZoneId: "UTC", notifyOption: "MailOnFailure"|"NoNotification"}}` (ScheduleNotifyOption here has NO MailOnCompletion; service principals only support NoNotification).
- Rules: a disable request (`enabled:false`) must contain no other changes; at least one day must be specified (if no times, Power BI uses one default time/day); time-slot count limit depends on Shared vs Premium capacity.
- **The caller must be the dataset owner.**
- Direct Query datasets use a separate pair: **Get/Update Direct Query Refresh Schedule In Group** — `GET/PATCH /groups/{groupId}/datasets/{datasetId}/directQueryRefreshSchedule` (verified to exist in the operation list; body uses frequency/days/times/localTimeZoneId).
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/update-refresh-schedule-in-group

**Update Datasources In Group** — `POST /groups/{groupId}/datasets/{datasetId}/Default.UpdateDatasources` — scope `Dataset.ReadWrite.All`
- Body: `updateDetails: [{datasourceSelector: {datasourceType, connectionDetails{server,database,url,path,kind,...}}, connectionDetails: {…new target…}}]`. `datasourceSelector` is mandatory when the dataset has more than one data source.
- Supported source types **only**: SQL Server, Azure SQL Server, Azure Analysis Services, Azure Synapse, OData, SharePoint, Teradata, SAP HANA — for others use Update Parameters. Original and new source must have the exact same schema. Changing datasource type not supported; connection strings with parameters not supported; XMLA-modified datasets not supported; merged/joined tables only with enhanced dataset metadata; Advanced Query w/ multiple sources → only first updated; incremental-refresh datasets not fully supported.
- **Caller must be the dataset owner.** Refresh after update (or wait 30 min without enhanced metadata).
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/update-datasources-in-group

**Bind To Gateway In Group** — `POST /groups/{groupId}/datasets/{datasetId}/Default.BindToGateway` — scope `Dataset.ReadWrite.All`
- Body: `gatewayObjectId` (required, uuid; for clusters = primary gateway id ≈ cluster id), `datasourceObjectIds` (optional uuid[]; if omitted, binds to the first matching data source in the gateway).
- "Only supports the on-premises data gateway." Important note: "Add the API caller principal as a data source user on the gateway."
- Companion: **Discover Gateways In Group** — `GET /groups/{groupId}/datasets/{datasetId}/Default.DiscoverGateways` (returns bindable gateways; verified in ops list).
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/bind-to-gateway-in-group

**Take Over In Group** — `POST /groups/{groupId}/datasets/{datasetId}/Default.TakeOver` — scope `Dataset.ReadWrite.All` — no body; 200. Transfers dataset ownership to the caller. (Group-only; no My-workspace variant in the ops list.)
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/take-over-in-group

**Query scale-out**
- **Trigger Query Scale Out Sync In Group** — `POST /groups/{groupId}/datasets/{datasetId}/queryScaleOut/sync` — scope `Dataset.ReadWrite.All` — 200 with `DatasetQueryScaleOutSyncStatus`: `commitVersion`, `commitTimestamp`, `targetSyncVersion`, `targetSyncTimestamp`, `triggerReason` (`explicit` | `automatic` | `system`), `syncStartTime`, `syncEndTime`, `minActiveReadVersion`, `minActiveReadTimestamp`, `scaleOutStatus` (`Enabled` | `TenantSettingDisabled` | `StorageModeNotSupported` | `ReadOnlyReplicasDisabled`).
- **Get Query Scale Out Sync Status In Group** — `GET /groups/{groupId}/datasets/{datasetId}/queryScaleOut/syncStatus` (verified in ops list; scope Dataset.Read/ReadWrite).
- https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/trigger-query-scale-out-sync-in-group

**Reads (verified in ops list):** Get Datasets In Group `GET /groups/{groupId}/datasets`; Get Dataset In Group `GET /groups/{groupId}/datasets/{datasetId}`; Get Parameters In Group `GET .../datasets/{id}/parameters`; Get Datasources In Group `GET .../datasets/{id}/datasources`; Get Refresh Schedule In Group `GET .../datasets/{id}/refreshSchedule`; Get Gateway Datasources In Group (deprecated-style helper); Get Dataset Users In Group; Get Dataset To Dataflows Links In Group. Dataset object fields include `id, name, configuredBy (owner), isRefreshable, isOnPremGatewayRequired, targetStorageMode, createdDate, webUrl, queryScaleOutSettings, upstreamDataflows` (from Import/Dataset definition).

### 2.2 Reports

Docs root: https://learn.microsoft.com/en-us/rest/api/power-bi/reports

**Export To File In Group** — `POST /groups/{groupId}/reports/{reportId}/ExportTo` — scopes: (`Report.ReadWrite.All` or `Report.Read.All`) AND (`Dataset.ReadWrite.All` or `Dataset.Read.All`)
- Body: `format` (required; `FileFormat`: `PPTX`, `PDF`, `PNG` (Power BI reports only), `IMAGE` (paginated only: BMP/EMF/GIF/JPEG/PNG/TIFF), `XLSX`, `DOCX`, `CSV`, `XML`, `MHTML`, `ACCESSIBLEPDF` (all paginated-only)), plus one of:
  - `powerBIReportConfiguration`: `pages[] {pageName, visualName, bookmark {name | state}}`, `reportLevelFilters[] {filter}` ("Currently, only one filter is supported"; URL-filter syntax without `?filter=`), `defaultBookmark {name|state}`, `identities[]` (EffectiveIdentity for RLS: username, roles ≤50, datasets, customData, identityBlob), `datasetToBind` (dynamic binding), `settings {includeHiddenPages, locale}`.
  - `paginatedReportConfiguration`: `formatSettings` (dict of device-info props), `parameterValues[] {name, value}`, `identities[]`, `locale`.
- Response: **202 Accepted** with an `Export` object (`id` = exportId). Async job.
- **Get Export To File Status In Group** — `GET /groups/{groupId}/reports/{reportId}/exports/{exportId}` — 200 (done) / 202 (in progress). `Export`: `id`, `status` (`Undefined` | `NotStarted` | `Running` | `Succeeded` | `Failed`), `percentComplete` (0-100), `resourceLocation` (retrieval URL), `resourceFileExtension` (e.g. `.pptx`), `expirationTime`, `createdDateTime`, `lastActionDateTime`, `reportId`, `reportName`. Recommended poll interval comes from the **Retry-After** response header ("not always populated"). A `Failed` status WITH Retry-After = retryable; `Failed` without Retry-After = permanent failure.
- **Get File Of Export To File In Group** — `GET /groups/{groupId}/reports/{reportId}/exports/{exportId}/file` — 200 file stream; media types `application/*`, `image/*`, `text/csv`, `text/xml`, `multipart/related`. The retrieval URL is valid **24 hours**.
- Limits (export-to doc): Premium/Embedded/Fabric capacity required (PPU NOT supported); max **500 concurrent requests per capacity** (429 beyond); only 5 pages processed concurrently; max **50 exports (pages/visuals) per exported report**; exported file ≤ **250 MB**; PNG multi-page → zip; personal bookmarks & persistent filters unsupported; unsupported visuals (uncertified custom visuals, R, Python, PowerApps, Power Automate, paginated report visual, Visio, ArcGIS) render as error symbol; sensitivity-labeled report can't be exported by service principal to pdf/pptx; tenant settings "Export reports as PowerPoint presentations or PDF documents" (default on) and "Export reports as image files" (default off; needed for PNG).
- https://learn.microsoft.com/en-us/rest/api/power-bi/reports/export-to-file-in-group ; status: .../get-export-to-file-status-in-group ; file: .../get-file-of-export-to-file-in-group ; considerations: https://learn.microsoft.com/en-us/power-bi/developer/embedded/export-to

**Export Report In Group (.pbix / .rdl download)** — `GET /groups/{groupId}/reports/{reportId}/Export?downloadType={LiveConnect|IncludeModel}` — scope `Report.ReadWrite.All` or both `Report.Read.All` and `Dataset.Read.All`
- 200 file stream (`application/zip`, `application/octet-stream`). Synchronous (no job). `preferClientRouting=true` query param is a documented workaround for timeout exceptions; large files download to a temporary blob whose URL is returned/stored in the downloaded .pbix.
- Limitations: subject to the same limitations as downloading a report .pbix from the service (linked doc `service-export-to-pbix` — includes e.g. incremental-refresh restrictions; see Could not verify for exact list); after Rebind, exporting a report with a Power BI service live connection is not supported. Try-it not supported.
- https://learn.microsoft.com/en-us/rest/api/power-bi/reports/export-report-in-group

**Clone Report In Group** — `POST /groups/{groupId}/reports/{reportId}/Clone` — scope `Content.Create`
- Body: `name` (required), `targetWorkspaceId` (optional uuid; empty GUID `00000000-0000-0000-0000-000000000000` = My workspace; omitted = same workspace), `targetModelId` (optional; omitted = same dataset).
- Permissions: Write on the report; Build on target dataset if `targetModelId` used. Cross-workspace dataset → a shared dataset is created in the report's workspace. Live-connection reports lose the connection and get a direct binding.
- 200 returns the new `Report` object (`id, name, datasetId, webUrl, embedUrl, reportType PowerBIReport|PaginatedReport, format PBIR|PBIRLegacy|RDL, isOwnedByMe, ...`).
- https://learn.microsoft.com/en-us/rest/api/power-bi/reports/clone-report-in-group

**Rebind Report In Group** — `POST /groups/{groupId}/reports/{reportId}/Rebind` — scope `Report.ReadWrite.All`
- Body: `datasetId` (required). Permissions: Write on report + Build on target dataset. **Paginated reports are not supported.** Cross-workspace dataset → shared dataset created in report's workspace; live-connection reports become direct-bound.
- https://learn.microsoft.com/en-us/rest/api/power-bi/reports/rebind-report-in-group

**Update Datasources In Group (paginated/RDL only)** — `POST /groups/{groupId}/reports/{reportId}/Default.UpdateDatasources` — scope printed as `Reports.ReadWrite.All`
- Body: `updateDetails: [{datasourceName, connectionDetails {server, database}}]`. Only paginated reports; same-schema requirement; type change not supported; ODBC not supported. **Caller must be the data source owner** (see Reports Take Over In Group — `POST /groups/{groupId}/reports/{reportId}/Default.TakeOver`, verified in ops list, transfers RDL data source ownership).
- https://learn.microsoft.com/en-us/rest/api/power-bi/reports/update-datasources-in-group

**Bind To Gateway In Group (paginated/RDL only)** — `POST /groups/{groupId}/reports/{reportId}/Default.BindToGateway` — delegated scopes `Workspace.Read.All` or `Workspace.ReadWrite.All`
- Body: `gatewayObjectId` (required), `bindDetails: [{dataSourceName, dataSourceObjectId}]` (required). Only on-premises data gateway. (Yes — reports BindToGateway EXISTS, but only for paginated report data sources.)
- https://learn.microsoft.com/en-us/rest/api/power-bi/reports/bind-to-gateway-in-group

**Reads (verified in ops list):** Get Reports In Group `GET /groups/{groupId}/reports`; Get Report In Group `GET /groups/{groupId}/reports/{reportId}`; Get Pages In Group `GET /groups/{groupId}/reports/{reportId}/pages` (+ Get Page …/pages/{pageName}); Get Datasources In Group (paginated only). Also Update Report Content In Group (`POST .../reports/{reportId}/UpdateReportContent`, copies content from a source report), Delete Report In Group.

### 2.3 Imports

Docs root: https://learn.microsoft.com/en-us/rest/api/power-bi/imports

**Post Import In Group** — `POST /groups/{groupId}/imports?datasetDisplayName={name}&nameConflict={mode}&skipReport={bool}&overrideReportLabel={bool}&overrideModelLabel={bool}&subfolderObjectId={uuid}` — scope `Dataset.ReadWrite.All`
- Supported content: **.pbix, .json (dataflow model.json), .xlsx, .rdl**.
- Regular upload: `Content-Type: multipart/form-data`, file encoded as form data in body; `datasetDisplayName` = file name **including extension** (required for multipart & fileUrl imports).
- Large .pbix 1–10 GB: `Content-Type: application/json` with body `ImportInfo {fileUrl}` = SAS URL from Create Temporary Upload Location; **Premium capacity workspaces only**; `datasetDisplayName` must end `.pbix`.
- OneDrive for Business .xlsx: `application/json` with `ImportInfo {filePath, connectionType: "import"|"connect"}`; do NOT set `datasetDisplayName`. (.pbix from OneDrive not supported.)
- `nameConflict` (`ImportConflictHandlerMode`): `Ignore` (default; creates another dataset with same name), `Abort`, `Overwrite` (fails if no conflict or >1 same-name dataset), `CreateOrOverwrite`, `GenerateUniqueName` (dataflows only). RDL: only `Abort`/`Overwrite`. Dataflow model.json: only `Abort`/`GenerateUniqueName`, `datasetDisplayName=model.json`.
- `skipReport` — only `true` allowed; .pbix only. Dataflows via service principal not supported. Protected-sensitivity-label files not importable by service principals.
- Response: 200/202 with `{ "id": "<importId>" }`.
- https://learn.microsoft.com/en-us/rest/api/power-bi/imports/post-import-in-group

**Get Import In Group** — `GET /groups/{groupId}/imports/{importId}` — scope `Dataset.ReadWrite.All` or `Dataset.Read.All`
- `Import`: `id`, `importState` (`Publishing` | `Succeeded` | `Failed`), `createdDateTime`, `updatedDateTime`, `name`, `connectionType`, `source` (e.g. `"Upload"`), `datasets[]`, `reports[]`, `error {code, details[]}` on failure (e.g. `DMTS_PowerBIDataMovementUserDatasourceExceededLimit`). Poll this for import completion.
- https://learn.microsoft.com/en-us/rest/api/power-bi/imports/get-import-in-group

**Create Temporary Upload Location In Group** — `POST /groups/{groupId}/imports/createTemporaryUploadLocation` — scope `Dataset.ReadWrite.All` — 200 `{expirationTime, url}` (SAS URL for blob upload; then pass as `fileUrl` to Post Import). For 1–10 GB .pbix; Premium-only.
- https://learn.microsoft.com/en-us/rest/api/power-bi/imports/create-temporary-upload-location-in-group

### 2.4 Dataflows (Gen1)

Docs root: https://learn.microsoft.com/en-us/rest/api/power-bi/dataflows
(All dataflow endpoints are group-scoped only — no My-workspace variants.)

**Refresh Dataflow** — `POST /groups/{groupId}/dataflows/{dataflowId}/refreshes?processType={processType}` — scope `Dataflow.ReadWrite.All`
- Body: `{"notifyOption": "MailOnFailure" | "NoNotification"}` (required; `MailOnCompletion` NOT supported for dataflows). `processType` is a query string param, example value `default` (enumeration not documented — see Could not verify). Response 200 (no refresh id returned; completion detection via transactions).
- https://learn.microsoft.com/en-us/rest/api/power-bi/dataflows/refresh-dataflow

**Get Dataflow Transactions** — `GET /groups/{groupId}/dataflows/{dataflowId}/transactions` — scope `Dataflow.ReadWrite.All` or `Dataflow.Read.All`
- 200 `value[]` `DataflowTransaction`: `id` (string like `2020-08-26T16:40:55.09Z@{guid}$1`), `refreshType` (string, e.g. `OnDemand`), `startTime`, `endTime`, `status` (string; enum values not documented on this page — observed statuses like Success/Failed/InProgress are not enumerated; see Could not verify). This is the dataflow analogue of refresh history for polling.
- https://learn.microsoft.com/en-us/rest/api/power-bi/dataflows/get-dataflow-transactions

**Cancel Dataflow Transaction** — `POST /groups/{groupId}/dataflows/transactions/{transactionId}/cancel` — scope `Dataflow.ReadWrite.All`
- Note path: transactions sits directly under `/dataflows/` (no dataflowId). 200 `DataflowTransactionStatus`: `transactionId`, `status` (`alreadyConcluded` | `invalid` | `notFound` | `successfullyMarked` — sample shows `SuccessfullyMarked`).
- https://learn.microsoft.com/en-us/rest/api/power-bi/dataflows/cancel-dataflow-transaction

**Update Refresh Schedule (dataflow)** — `PATCH /groups/{groupId}/dataflows/{dataflowId}/refreshSchedule` — scope `Dataflow.ReadWrite.All`
- Body identical shape to dataset schedule: `{"value": {days[], times[], enabled, localTimeZoneId, notifyOption NoNotification|MailOnFailure}}`. "Creates or updates."
- https://learn.microsoft.com/en-us/rest/api/power-bi/dataflows/update-refresh-schedule

**Reads:** Get Dataflows `GET /groups/{groupId}/dataflows`; Get Dataflow `GET /groups/{groupId}/dataflows/{dataflowId}` (exports the dataflow definition **as a JSON file**); Get Dataflow Data Sources `GET .../dataflows/{dataflowId}/datasources`; Get Upstream Dataflows In Group. Also Update Dataflow (PATCH properties), Delete Dataflow, and preview **Save Dataflow Gen One As Dataflow Gen Two (CI/CD)**.

### 2.5 Deployment pipelines

Docs root: https://learn.microsoft.com/en-us/rest/api/power-bi/pipelines
(Note: pipeline endpoints are NOT group-scoped — they live at `/v1.0/myorg/pipelines/...`.)

**Deploy All** — `POST /pipelines/{pipelineId}/deployAll` — scope **`Pipeline.Deploy`**
- Body: `sourceStageOrder` (required int: Development=0, Test=1, Production=2), `isBackwardDeployment` (bool, default false), `newWorkspace {name, capacityId}` (required when target stage has no assigned workspace), `note` (string), `updateAppSettings {updateAppInTargetWorkspace}`, `options` (`DeploymentOptions`): `allowCreateArtifact`, `allowOverwriteArtifact`, `allowPurgeData` (schema-mismatch data purge), `allowSkipTilesWithMissingPrerequisites`, `allowTakeOver` (paginated report ownership), `allowOverwriteTargetArtifactLabel` — each must be `true` when the deployment needs it or the deploy fails.
- Permissions: "The user must at least be a contributor on both source and target deployment workspaces." Limit: **max 300 deployed items per request**.
- Response: **202 Accepted** with `PipelineOperation` (`id` = operationId, `type: "Deploy"`, `status: NotStarted`, sourceStageOrder, targetStageOrder, …). Poll Get Pipeline Operation.
- https://learn.microsoft.com/en-us/rest/api/power-bi/pipelines/deploy-all

**Selective Deploy** — `POST /pipelines/{pipelineId}/deploy` — scope `Pipeline.Deploy`
- Body: `sourceStageOrder` (required) + item arrays `datasets` / `reports` / `dashboards` / `dataflows` / `datamarts`, each `[{sourceId, options?}]` (per-item `options` override request-level `options`), plus the same `isBackwardDeployment` / `newWorkspace` / `note` / `options` / `updateAppSettings`. 202 `PipelineOperation`. Max 300 items.
- https://learn.microsoft.com/en-us/rest/api/power-bi/pipelines/selective-deploy

**Get Pipeline Operations** — `GET /pipelines/{pipelineId}/operations` — scope `Pipeline.ReadWrite.All` or `Pipeline.Read.All` — returns up-to-20 most recent deploy operations.
**Get Pipeline Operation** — `GET /pipelines/{pipelineId}/operations/{operationId}` — same scopes
- `PipelineOperation`: `id`, `type` (`Deploy`), `status` (`NotStarted` | `Executing` | `Succeeded` | `Failed`), `lastUpdatedTime`, `executionStartTime`, `executionEndTime`, `sourceStageOrder`, `targetStageOrder`, `note {content, isTruncated}`, `preDeploymentDiffInformation {newArtifactsCount, differentArtifactsCount, noDifferenceArtifactsCount}`, `performedBy {userPrincipalName, principalType, principalObjectID}`, `executionPlan.steps[] {index, type DatasetDeployment|ReportDeployment|DashboardDeployment|DataflowDeployment|DatamartDeployment, status, preDeploymentDiffState New|Different|NoDifference, sourceAndTarget {source, sourceDisplayName, target, targetDisplayName, type}, error {errorCode, errorDetails}}`.
- https://learn.microsoft.com/en-us/rest/api/power-bi/pipelines/get-pipeline-operation

**Create Pipeline** — `POST /pipelines` — scope `Pipeline.ReadWrite.All` — body `{displayName (≤256, required), description (≤1024)}` — **201 Created** `{id, displayName, description}`.
**Update Pipeline** — `PATCH /pipelines/{pipelineId}` — verified in ops list (displayName/description).
**Delete Pipeline** — `DELETE /pipelines/{pipelineId}` — verified in ops list.
**Get Pipelines** — `GET /pipelines`; **Get Pipeline** — `GET /pipelines/{pipelineId}?$expand=stages` (stages only returned when `$expand=stages`); **Get Pipeline Stages** — `GET /pipelines/{pipelineId}/stages` (stage: `order`, `workspaceId`, `workspaceName`); **Get Pipeline Stage Artifacts** — `GET /pipelines/{pipelineId}/stages/{stageOrder}/artifacts` (verified in ops list); **Get Pipeline Users** — `GET /pipelines/{pipelineId}/users`.
- https://learn.microsoft.com/en-us/rest/api/power-bi/pipelines/create-pipeline

**Update Pipeline User** — `POST /pipelines/{pipelineId}/users` — scope `Pipeline.ReadWrite.All`
- Body: `identifier` (UPN for `User`, object id otherwise; required), `principalType` (`User` | `Group` | `App` | `None`; required), `accessRight` (`PipelineUserAccessRight` — only documented value: **`Admin`**).
**Delete Pipeline User** — `DELETE /pipelines/{pipelineId}/users/{identifier}` (verified in ops list).
- https://learn.microsoft.com/en-us/rest/api/power-bi/pipelines/update-pipeline-user

**Assign Workspace** — `POST /pipelines/{pipelineId}/stages/{stageOrder}/assignWorkspace` — scopes `Pipeline.ReadWrite.All` **and** `Workspace.ReadWrite.All`
- Body: `{workspaceId}`. Constraints: stage not already assigned; caller must be an **admin of the workspace**; workspace not assigned to any other pipeline; fails during an active deployment.
**Unassign Workspace** — `POST /pipelines/{pipelineId}/stages/{stageOrder}/unassignWorkspace` (verified in ops list).
- https://learn.microsoft.com/en-us/rest/api/power-bi/pipelines/assign-workspace

### 2.6 Workspaces (Groups)

Docs root: https://learn.microsoft.com/en-us/rest/api/power-bi/groups

**Create Group** — `POST /groups?workspaceV2={true}` — scope `Workspace.ReadWrite.All`
- Body: `{name}`. `workspaceV2` "(Preview feature) Whether to create a workspace. The only supported value is `true`" (creates a new/V2 workspace). 200 returns Group: `id`, `name`, `isOnDedicatedCapacity`, (`isReadOnly` in the non-V2 example). Service principals need the Fabric admin setting "Service principals can create workspaces, connections, and deployment pipelines".
- https://learn.microsoft.com/en-us/rest/api/power-bi/groups/create-group

**Get Groups** — `GET /groups?$filter={odata}&$top={n}&$skip={n}` — scope `Workspace.Read.All` or `Workspace.ReadWrite.All`
- `$filter` example: `contains(name,'marketing') or name eq 'contoso'`. Group fields: `id`, `name`, `isReadOnly`, `isOnDedicatedCapacity`, `capacityId`, `defaultDatasetStorageFormat` (`Small`|`Large`, only when on dedicated capacity), `dataflowStorageId`, `logAnalyticsWorkspace` (single-group get only).
- https://learn.microsoft.com/en-us/rest/api/power-bi/groups/get-groups

**Update Group** — `PATCH /groups/{groupId}` — verified in ops list ("Updates a specified workspace"; body name/description/defaultDatasetStorageFormat — detail page not fetched).
**Delete Group** — `DELETE /groups/{groupId}` — verified in ops list.

**Add Group User** — `POST /groups/{groupId}/users` — scope `Workspace.ReadWrite.All`
- Body: `groupUserAccessRight` (required; `Admin` | `Member` | `Contributor` | `Viewer` | `None`), `identifier` (required; principal id — email works for users per example `{"emailAddress": "john@contoso.com", "groupUserAccessRight": "Admin"}`), `principalType` (required; `User` | `Group` | `App` | `None`), optional `displayName`, `emailAddress`, `graphId`, `userType`, `profile`.
- Limits: permissions take time to propagate (use Users RefreshUserPermissions API); **max 1,000 users/groups in workspace roles per workspace**.
- **Update Group User** — `PUT /groups/{groupId}/users` (verified in ops list; same body). **Delete User In Group** — `DELETE /groups/{groupId}/users/{user}` (user = UPN/identifier; verified in ops list). **Get Group Users** — `GET /groups/{groupId}/users`.
- https://learn.microsoft.com/en-us/rest/api/power-bi/groups/add-group-user

### 2.7 Gateways

Docs root: https://learn.microsoft.com/en-us/rest/api/power-bi/gateways
These are **on-premises data gateway (v1)** APIs. Every fetched gateway page states: "Virtual network (VNet) gateways aren't supported" (Create Datasource adds "and Cloud gateways"). Caller must have **gateway admin permissions** for gateway/datasource management ops.

**Get Gateways** — `GET /gateways` — scope `Dataset.Read.All` or `Dataset.ReadWrite.All` — gateways where the user is an admin.
**Get Gateway** — `GET /gateways/{gatewayId}` — same scopes — returns `Gateway`: `id`, `name`, `type` (e.g. `Resource`), `gatewayAnnotation` (JSON metadata), `gatewayStatus`, **`publicKey {exponent, modulus}`** (e.g. exponent `"AQAB"`) — this public key is what credentials are encrypted against.
- https://learn.microsoft.com/en-us/rest/api/power-bi/gateways/get-gateway

**Get Datasources** — `GET /gateways/{gatewayId}/datasources`; **Get Datasource** — `GET /gateways/{gatewayId}/datasources/{datasourceId}` (verified in ops list).

**Get Datasource Status** — `GET /gateways/{gatewayId}/datasources/{datasourceId}/status` — scope `Dataset.ReadWrite.All`
- "Checks the connectivity status of the specified data source from the specified gateway." 200 = reachable (body unspecified in doc); failure example: HTTP **400** with error envelope `{"error": {"code": "DM_GWPipeline_Client_GatewayUnreachable", "pbi.error": {"code": ..., "parameters": {}, "details": [], "exceptionCulprit": 1}}}`. Suitable as a connectivity check.
- https://learn.microsoft.com/en-us/rest/api/power-bi/gateways/get-datasource-status

**Create Datasource** — `POST /gateways/{gatewayId}/datasources` — scope `Dataset.ReadWrite.All` — 201 Created
- Body (`PublishDatasourceToGatewayRequest`): `dataSourceType` (string; documented type table includes Sql, SQL, AnalysisServices, Oracle, PostgreSql, MySql, OData, ODBC, SharePoint, SAPHana, File, Folder, Web, Extension, …), `connectionDetails` (a **JSON-in-string**, e.g. `"{\"server\":\"MyServer\",\"database\":\"MyDatabase\"}"`), `dataSourceName`, `credentialDetails`:
  - `credentialType`: `Basic` | `Windows` | `Anonymous` | `OAuth2` | `Key` | `SAS` | `KeyPair` — **but "OAuth2 as a credential type isn't supported" for Create Datasource** (it is supported on Update Datasource).
  - `credentials`: string. Plain (pre-encryption) wire format is `{"credentialData":[{"name":"username","value":"john"},{"name":"password","value":"*****"}]}` (Basic/Windows), `{"credentialData":[{"name":"key","value":"ec....LA="}]}` (Key), `{"credentialData":[{"name":"accessToken","value":"eyJ0..."}]}` (OAuth2), `{"credentialData":""}` (Anonymous).
  - `encryptedConnection`: `Encrypted` | `NotEncrypted` — whether to encrypt the connection to the data source ("The API call will fail if you select encryption and Power BI is unable to establish an encrypted connection with the data source") — note this governs the datasource connection, NOT credential encryption.
  - `encryptionAlgorithm`: `RSA-OAEP` | `None` — "For a cloud data source, specify `None`. For an on-premises data source, specify `RSA-OAEP` and use the gateway public key to encrypt the credentials."
  - `privacyLevel`: `None` | `Public` | `Organizational` | `Private`.
  - `useCallerAADIdentity` (caller's Entra OAuth identity as the credential; caller must be datasource owner), `useEndUserOAuth2Credentials` (SSO in DirectQuery).
- **Credential encryption story (on-premises gateway):** "On premises data source credentials must be encrypted. The `encryptedConnection` parameter must be set to `Encrypted` and the credentials should be encrypted using the gateway public key." The gateway public key (RSA exponent + modulus) comes from Get Gateway / Get Gateways. Microsoft's reference encryptors are in the SDK: `AsymmetricKeyEncryptor.cs`, `Asymmetric1024KeyEncryptionHelper.cs` (1024-bit keys: pure RSA-OAEP), `AsymmetricHigherKeyEncryptionHelper.cs` + `AuthenticatedEncryption.cs` (larger keys: hybrid scheme — RSA-OAEP-wrapped AES authenticated encryption). "Different gateway versions might have different public key sizes." Sample implementations exist for .NET, Java, Python, PowerShell (linked from the doc).
  - **So: plaintext basic credentials to an on-prem gateway are NOT possible** — for on-prem the credentials field must carry the RSA-OAEP-encrypted blob. For **cloud** data sources (Update Datasource path), `encryptionAlgorithm: None` is used and the credentials JSON is sent as-is over TLS.
- Docs: https://learn.microsoft.com/en-us/rest/api/power-bi/gateways/create-datasource and https://learn.microsoft.com/en-us/power-bi/developer/embedded/configure-credentials

**Update Datasource** — `PATCH /gateways/{gatewayId}/datasources/{datasourceId}` — updates the `credentialDetails` of an existing gateway datasource (verified in ops list; detail page not fetched — credential body shapes cross-referenced from configure-credentials, which routes cloud-datasource credential updates through this API with the gateway/datasource ids from dataset Get Datasources).

**Add Datasource User** — `POST /gateways/{gatewayId}/datasources/{datasourceId}/users` — scope `Dataset.ReadWrite.All`
- Body: `datasourceAccessRight` (required; `Read` | `ReadOverrideEffectiveIdentity` | `None` (None only for updates)), plus `emailAddress` (users) or `identifier` (object id, e.g. service principals), `principalType`, `displayName`, `profile`. "Adding groups through the API is not supported."
- **Remove Datasource User** — `DELETE /gateways/{gatewayId}/datasources/{datasourceId}/users/{emailAdress}` (verified in ops list as Delete Datasource User).
- https://learn.microsoft.com/en-us/rest/api/power-bi/gateways/add-datasource-user

**Delete Datasource** — `DELETE /gateways/{gatewayId}/datasources/{datasourceId}` (verified in ops list).

### 2.8 Capacities

Docs root: https://learn.microsoft.com/en-us/rest/api/power-bi/capacities

**Get Capacities** — `GET /capacities` — capacities the user has access to. Capacity: `id`, `displayName`, `sku`, `region`, `state` (`Active`, `Suspended`, `Provisioning`, …), `admins[]`, `capacityUserAccessRight` (`None` | `Assign` | `Admin`).
**Groups AssignToCapacity** — `POST /groups/{groupId}/AssignToCapacity` — scopes `Capacity.ReadWrite.All` **and** `Workspace.ReadWrite.All`
- Body: `{capacityId}`; **empty GUID `00000000-0000-0000-0000-000000000000` unassigns** from capacity. Permissions: "administrator rights or assign permissions on the capacity". 200.
- https://learn.microsoft.com/en-us/rest/api/power-bi/capacities/groups-assign-to-capacity
**Groups CapacityAssignmentStatus** — `GET /groups/{groupId}/CapacityAssignmentStatus` — scopes `Workspace.Read.All and Workspace.ReadWrite.All`
- 200: `status` (`Pending` | `InProgress` | `CompletedSuccessfully` | `AssignmentFailed`), `activityId` (on failure), `capacityId`, `startTime`, `endTime`.
- https://learn.microsoft.com/en-us/rest/api/power-bi/capacities/groups-capacity-assignment-status

**Refreshables (user-scope)** — `GET /capacities/refreshables?$top={n}[&$expand=capacity,group&$filter=...&$skip=...]` — scope `Capacity.Read.All` or `Capacity.ReadWrite.All` — for capacities the user can access. Also `GET /capacities/{capacityId}/refreshables` and `.../refreshables/{refreshableId}`.
**Refreshables (admin)** — `GET /admin/capacities/refreshables?$top={n}` (`$top` **required**, min 1; optional `$expand=capacities,groups`, `$filter` (OData; e.g. `averageDuration gt 1800`), `$skip` — use with $top to page beyond 1000) — scope `Tenant.Read.All` or `Tenant.ReadWrite.All`; **user must be a Fabric administrator** (or service principal). Max **200 requests per hour**.
- `Refreshable`: `id`, `name`, `kind` (`Dataset` only), `startTime`/`endTime` (data window), `refreshCount`, `refreshFailures`, `averageDuration` (sec), `medianDuration`, `refreshesPerDay`, `lastRefresh` (a full `Refresh` history entry), `refreshSchedule` (days/times/enabled/localTimeZoneId/notifyOption), `configuredBy[]` (owners). "Power BI retains a seven-day refresh history for each dataset, up to a maximum of sixty refreshes." A refreshable = dataset refreshed at least once OR with a valid schedule.
- https://learn.microsoft.com/en-us/rest/api/power-bi/capacities/get-refreshables and https://learn.microsoft.com/en-us/rest/api/power-bi/admin/get-refreshables

### 2.9 Admin / activity

**Get Activity Events** — `GET /admin/activityevents?startDateTime='{ISO8601}'&endDateTime='{ISO8601}'&continuationToken={token}&$filter={filter}` — scope `Tenant.Read.All` or `Tenant.ReadWrite.All`; user must be a **Fabric administrator** (or service principal; delegated permissions supported).
- Constraints (verbatim): "Provide either a continuation token or both a start and end date time. `StartDateTime` and `EndDateTime` **must be in the same UTC day, within the last 28 days**, and should be wrapped in single quotes." Rate limit: **maximum 200 requests per hour**.
- `$filter`: "Filters the results based on a boolean condition, using 'Activity', 'UserId', or both properties. **Supports only 'eq' and 'and' operators**" — e.g. `$filter=Activity eq 'ViewReport' and UserId eq 'john@contoso.com'`.
- Response: `activityEventEntities[]` (schema = Microsoft 365 Management Activity API Power BI schema; fields observed: Id, RecordType, CreationTime, Operation, OrganizationId, UserType, UserKey, Workload:"PowerBI", UserId, ClientIP, UserAgent, Activity, IsSuccess, RequestId, ActivityId, ItemName, WorkSpaceName/WorkspaceId, DatasetName/DatasetId, ReportName/ReportId, CapacityId/CapacityName, AppName, ObjectId, ArtifactId/ArtifactName/ArtifactKind, DistributionMethod, ConsumptionMethod, …), `continuationUri`, `continuationToken`. Page until `continuationToken` is null; pass token WITHOUT other params.
- The doc does not enumerate all Activity values on this page; it links the M365 Management Activity Power BI schema for event properties (operation names like ViewReport, GetSnapshots, ViewDashboard appear in examples).
- https://learn.microsoft.com/en-us/rest/api/power-bi/admin/get-activity-events

**Groups GetUnusedArtifactsAsAdmin** — `GET /admin/groups/{groupId}/unused?continuationToken={token}` — scope `Tenant.Read.All` or `Tenant.ReadWrite.All`; Fabric administrator required. **Preview API.** Max 200 requests/hour.
- Returns items unused for 30 days: `unusedArtifactEntities[] {artifactId, displayName, artifactType, artifactSizeInMB, createdDateTime, lastAccessedDateTime}`, `continuationUri`, `continuationToken`.
- https://learn.microsoft.com/en-us/rest/api/power-bi/admin/groups-get-unused-artifacts-as-admin

---

## 3. Cross-cutting

### 3.1 Base URL & workspace scoping
- `https://api.powerbi.com/v1.0/myorg/` — all v1.0 operations. "Some of the Power BI APIs refer to workspaces as groups." Group-less dataset/report/import endpoints target **My workspace**; since ChainReact requires workspace selection, always use `groups/{groupId}` variants (dataflows and pipelines have no My-workspace forms anyway; pipelines are tenant-level `/pipelines/...`).
- https://learn.microsoft.com/en-us/rest/api/power-bi/

### 3.2 Rate limits / throttling
- General policy (API overview, verbatim): "Power BI limits the number of API calls within a time window per user. When a user sends a number of requests that exceeds a predetermined limit… Power BI throttles any further requests… returns HTTP status code **429 (Too many requests) with a Retry-After HTTP header** indicating how many seconds to wait." Exact universal per-user numbers are NOT published.
- Documented per-endpoint limits: executeQueries **120 requests/min/user**; dataset refresh **8/day on shared capacity** (incl. scheduled); admin APIs (activity events, unused artifacts, admin refreshables) **200 requests/hour**; export-to-file **500 concurrent jobs/capacity**, 5 pages concurrently per job, 50 exports/report, 250 MB file cap; deploy 300 items/request; workspace roles 1,000 principals.
- https://learn.microsoft.com/en-us/rest/api/power-bi/ (Throttling section)

### 3.3 Pagination models
- Collection endpoints: OData `$top` / `$skip` / `$filter` (Get Groups, Get Datasets, refreshables — refreshables: "Use $skip with $top to fetch results beyond the first 1000").
- Admin activity events & unused artifacts: **continuationToken/continuationUri** loop (no $top).
- Refresh history: `$top` only (default last 60).

### 3.4 Error envelope
- Standard Power BI error shape (observed in Get Datasource Status doc): `{"error": {"code": "<Code>", "pbi.error": {"code": "<Code>", "parameters": {}, "details": [], "exceptionCulprit": 1}}}`; sometimes `error.message` present. Import errors: `error {code, details[{code, message, target}]}`. executeQueries: `error {code, message}` at response/result/table level. Refresh failures put the error code in `serviceExceptionJson` (stringified JSON `{"errorCode": "..."}`, optionally `errorDescription`). Entra token errors use `{error, error_description, error_codes[], trace_id, correlation_id}`.

### 3.5 Async job patterns (summary)
| Operation | Kick-off | Poll | Terminal states | Result |
|---|---|---|---|---|
| Dataset refresh | POST refreshes → 202 + `x-ms-request-id`/Location | GET refreshes?$top / GET refreshes/{id} (enhanced: 202 while running) | Completed / Failed / Disabled / Cancelled (extendedStatus adds TimedOut, NotStarted, InProgress) | n/a |
| Export to file | POST ExportTo → 202 + Export.id | GET exports/{id} (200/202, percentComplete, Retry-After) | Succeeded / Failed | GET exports/{id}/file (URL valid 24h) |
| Import | POST imports → 202 + id | GET imports/{id} | Succeeded / Failed (importState; else Publishing) | datasets[]/reports[] in Import |
| Dataflow refresh | POST refreshes → 200 (no id) | GET transactions (latest transaction status) | transaction status | cancel via POST dataflows/transactions/{txid}/cancel |
| Pipeline deploy | POST deployAll / deploy → 202 + PipelineOperation.id | GET operations/{id} | Succeeded / Failed (else NotStarted/Executing) | executionPlan step statuses |
| Capacity assignment | POST AssignToCapacity → 200 | GET CapacityAssignmentStatus | CompletedSuccessfully / AssignmentFailed (else Pending/InProgress) | n/a |

### 3.6 Refresh completion detection for polling triggers
- Datasets: poll `GET .../refreshes?$top=1..n`; entry transitions `status: Unknown` (in progress; endTime empty) → `Completed`/`Failed`/`Cancelled`. Works on shared and Premium capacity. `requestId` is the stable id to dedup on. Enhanced refreshes additionally support `GET .../refreshes/{refreshId}`. Note: "Power BI might drop requests if there are too many requests in a short period… By design, you can't query status on dropped requests."
- Dataflows: poll `GET .../dataflows/{id}/transactions`; latest `DataflowTransaction.status` + `endTime`.

### 3.7 2025–2026 naming / platform notes
- "Datasets" were renamed **"semantic models"** in the product; newer doc text uses "semantic model" (e.g., refresh docs) while **API paths, operation names, and scope names are unchanged** (`/datasets/...`, `Dataset.ReadWrite.All`). The v1.0 reference remains the active, current API version — all pages above are marked "API Version: v1.0" and many were updated in 2025–2026.
- Dataflows Gen1 vs Gen2: these Power BI dataflow APIs cover Gen1 dataflows. The Dataflows operation group now includes **"Save Dataflow Gen One As Dataflow Gen Two (CI/CD) (Preview)"** (`dataflows/save-dataflow-gen-one-as-dataflow-gen-two`), confirming the Gen1→Gen2 (Fabric) migration path. Gen2 dataflows are Fabric items managed via the Fabric REST API (api.fabric.microsoft.com), not these endpoints.
- Fabric REST API vs Power BI REST API: the Power BI v1.0 overview page contains **no deprecation notice**; Power BI REST APIs remain supported for Power BI items. Fabric-only item types (lakehouses, Gen2 dataflows, Fabric deployment-pipeline extensions to non-PBI items) live under `api.fabric.microsoft.com`. Where our catalog only touches Power BI items (datasets, reports, dataflows Gen1, pipelines for PBI items, workspaces, gateways), the v1.0 API is the correct, stable choice.
- Admin activity: "The user must be a **Fabric administrator**" (terminology updated from "Power BI admin").
- Groups Create: service principals creating workspaces now gated by Fabric admin portal setting "Service principals can create workspaces, connections, and deployment pipelines".

---

## 4. Not supported / gotchas relevant to action design

- **No MailOnCompletion** for dataflow refresh notifyOption, and no MailOnCompletion in refresh *schedule* notifyOption (only refresh-now supports it). Service principals only support NoNotification everywhere.
- **Enhanced refresh options are rejected on shared capacity** (only `notifyOption` allowed there) — the "advanced refresh options" UI must be gated on capacity.
- **Cancel refresh works only for enhanced refreshes**; can't cancel scheduled/portal refreshes via API.
- **executeQueries**: tenant setting can disable it; 1 query/call; row/value/size caps; Build permission needed.
- **Update Parameters / Update Datasources / Update Refresh Schedule require dataset ownership** → a robust action flow should offer/perform `Default.TakeOver` first (with user consent), since takeover changes credentials binding.
- **Export-to-file requires Premium/Embedded/Fabric capacity and is NOT available on PPU or Pro/shared** — a Power BI report PDF/PNG/PPTX export action will hard-fail for most Pro-only tenants; surface a clear capacity error.
- **Gateway Create/Update Datasource requires client-side RSA-OAEP encryption against the gateway public key** (1024-bit legacy vs larger-key hybrid AES+RSA scheme depending on gateway version) — nontrivial; consider deferring gateway credential-write actions or implementing the documented encryptor.
- **Gateway APIs don't support VNet/cloud gateways**; OAuth2 credentialType unsupported on Create Datasource; adding *groups* as datasource users unsupported.
- **Admin APIs need the user to be a Fabric admin** — scope consent alone is insufficient.
- **Reports Rebind: paginated reports unsupported.** Reports Update Datasources & BindToGateway: paginated (RDL) ONLY. Two different mechanisms per report type.
- **Import Overwrite fails when 0 or >1 datasets share the name**; RDL restricted to Abort/Overwrite; large-file import Premium-only.
- **My workspace** endpoints exist for most dataset/report/import ops but ChainReact will use group-scoped routes exclusively; note Take Over has only an In-Group variant.

---

## 5. Could not verify (explicit)

1. **A single canonical Learn page enumerating every delegated scope name.** Scope names above are verified per-endpoint. Scopes that exist in the Entra portal list but were not confirmed on a fetched Learn page in this session: `App.Read.All`, `Gateway.Read.All`/`Gateway.ReadWrite.All` (gateway endpoints document `Dataset.*` scopes instead), `StorageAccount.Read.All`/`ReadWrite.All`, `UserState.ReadWrite.All`. The change-permissions doc showed only an older example scope string (`Group.Read`, `Metadata.View_Any`, `Data.Alter_Any` — legacy names).
   - **RESOLVED 2026-07-16 (implementation):** `Dashboard.Read.All` / `Dashboard.ReadWrite.All` ARE confirmed. [Dashboards - Get Dashboards In Group](https://learn.microsoft.com/en-us/rest/api/power-bi/dashboards/get-dashboards-in-group) documents **Required Scope: `Dashboard.ReadWrite.All` or `Dashboard.Read.All`** for `GET /v1.0/myorg/groups/{groupId}/dashboards` (response fields: `id`, `displayName`, `embedUrl`, `isReadOnly`, `webUrl`, `appId`). The provider ships the READ scope only — the sole dashboard surface is listing them for the `workspace_item_added` / `workspace_item_removed` item-type filter.
2. **`Report.ReadWrite.All` vs `Reports.ReadWrite.All`**: the paginated Update Datasources page prints the plural form; all other report pages use singular. Treat singular as correct; test at implementation time.
3. **Exact .pbix download (Export Report) limitation list** (e.g., whether datasets with incremental refresh can be downloaded, >1 GB behavior): the endpoint page defers to `service-export-to-pbix#limitations-when-downloading-a-report-pbix-file`, which was not fetched. Do not assert specifics beyond "same limitations as portal .pbix download; post-Rebind live-connection export unsupported."
4. **Dataflow `processType` allowed values**: doc says only "Type of refresh process to use", example `processType=default`. An enumeration (e.g., default vs. incremental) is not documented.
5. **DataflowTransaction.status enumeration**: typed as plain string; values (e.g. `Success`, `Failed`, `InProgress`) not enumerated in the reference.
6. **Query scale-out licensing** (Premium/Fabric capacity requirement) is not stated on the endpoint pages; it is a Premium-family feature per product docs not fetched here.
7. **Universal per-user API rate limit numbers** for non-admin endpoints: Microsoft documents the 429/Retry-After behavior but not a global numeric limit.
8. **Whether Create Group (workspace) requires the user to hold a Pro/PPU license**: not stated on the endpoint page; licensing-to-operation mapping beyond the verified statements in §1.3 was not confirmed.
9. **Update Group / Update Group User / Delete User In Group / Get Pipeline Stage Artifacts / Gateway Update Datasource / Get Direct Query Refresh Schedule detail pages** were verified to exist via the operation-group indexes but their detail pages were not individually fetched; methods/paths follow the patterns shown (PATCH /groups/{id}; PUT /groups/{id}/users; DELETE /groups/{id}/users/{user}; GET /pipelines/{id}/stages/{order}/artifacts; PATCH /gateways/{gid}/datasources/{dsid}; GET/PATCH .../directQueryRefreshSchedule).
10. **Complete Activity value enumeration for activity-events $filter**: the reference links the M365 Management Activity Power BI schema rather than enumerating operations; only example values (ViewReport, ViewDashboard, GetSnapshots) verified.
11. **An explicit Microsoft statement "use Fabric APIs instead of Power BI v1.0 where available"**: not present on the fetched v1.0 overview; the coexistence description in §3.7 is based on the fetched pages (no deprecation notice) plus the presence of the Gen1→Gen2 preview API.

---

## 6. Doc URL index

- Overview/scopes/throttling: https://learn.microsoft.com/en-us/rest/api/power-bi/
- Register app: https://learn.microsoft.com/en-us/power-bi/developer/embedded/register-app · Permissions edit: https://learn.microsoft.com/en-us/power-bi/developer/embedded/change-permissions
- OAuth code flow: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- Datasets group: https://learn.microsoft.com/en-us/rest/api/power-bi/datasets — refresh-dataset-in-group · get-refresh-history-in-group · get-refresh-execution-details-in-group · cancel-refresh-in-group · execute-queries-in-group · update-parameters-in-group · update-refresh-schedule-in-group · update-datasources-in-group · bind-to-gateway-in-group · take-over-in-group · trigger-query-scale-out-sync-in-group
- Enhanced refresh: https://learn.microsoft.com/en-us/power-bi/connect-data/asynchronous-refresh
- Reports group: https://learn.microsoft.com/en-us/rest/api/power-bi/reports — export-to-file-in-group · get-export-to-file-status-in-group · get-file-of-export-to-file-in-group · export-report-in-group · clone-report-in-group · rebind-report-in-group · update-datasources-in-group · bind-to-gateway-in-group
- Export considerations: https://learn.microsoft.com/en-us/power-bi/developer/embedded/export-to
- Imports group: https://learn.microsoft.com/en-us/rest/api/power-bi/imports — post-import-in-group · get-import-in-group · create-temporary-upload-location-in-group
- Dataflows group: https://learn.microsoft.com/en-us/rest/api/power-bi/dataflows — refresh-dataflow · get-dataflow-transactions · cancel-dataflow-transaction · update-refresh-schedule
- Pipelines group: https://learn.microsoft.com/en-us/rest/api/power-bi/pipelines — deploy-all · selective-deploy · get-pipeline-operation · create-pipeline · update-pipeline-user · assign-workspace
- Groups group: https://learn.microsoft.com/en-us/rest/api/power-bi/groups — create-group · get-groups · add-group-user
- Gateways group: https://learn.microsoft.com/en-us/rest/api/power-bi/gateways — get-gateway · create-datasource · get-datasource-status · add-datasource-user
- Credential encryption: https://learn.microsoft.com/en-us/power-bi/developer/embedded/configure-credentials
- Capacities group: https://learn.microsoft.com/en-us/rest/api/power-bi/capacities — groups-assign-to-capacity · groups-capacity-assignment-status · get-refreshables
- Admin: https://learn.microsoft.com/en-us/rest/api/power-bi/admin/get-activity-events · .../admin/groups-get-unused-artifacts-as-admin · .../admin/get-refreshables
