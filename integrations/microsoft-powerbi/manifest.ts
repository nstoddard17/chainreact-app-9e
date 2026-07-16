import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Microsoft Power BI provider manifest.
 *
 * Seventh Microsoft consumer of `_shared/microsoft/` (after Outlook Mail,
 * Outlook Calendar, OneDrive, Excel, OneNote, Teams). Reuses the same
 * Azure AD app (`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`) — no
 * per-provider Entra app.
 *
 * IMPORTANT AUDIENCE NOTE: unlike its Microsoft siblings, Power BI's API
 * is NOT Microsoft Graph. Scopes are delegated permissions on the
 * "Power BI Service" resource (`https://analysis.windows.net/powerbi/api/…`)
 * and the access token cannot call Graph — identity at callback time is
 * resolved from the OIDC id_token instead of Graph `/me`
 * (see `docs/providers/microsoft-powerbi/v2-pattern-audit.md` §2).
 *
 * Scope set (all delegated, all user-consentable):
 *   - OIDC: `openid profile email` (id_token identity) + `offline_access`
 *     (refresh tokens; without it tokens die in ~1h).
 *   - `Dataset.ReadWrite.All` — semantic-model refresh/cancel/history,
 *     DAX executeQueries, parameters, refresh schedule, datasources,
 *     gateway binding, takeover, scale-out sync, AND all on-prem gateway
 *     endpoints (Microsoft documents no Gateway.* scope; the gateways API
 *     group authorizes on Dataset.ReadWrite.All).
 *   - `Report.ReadWrite.All` — export-to-file, .pbix export, clone,
 *     rebind, paginated-report datasources/gateway binding.
 *   - `Dashboard.Read.All` — READ-ONLY. The only dashboard surface we ship is
 *     listing them for the `workspace_item_added` / `workspace_item_removed`
 *     item-type filter (GET /groups/{id}/dashboards documents
 *     "Dashboard.ReadWrite.All or Dashboard.Read.All"). We take the READ scope
 *     because no shipped action or trigger writes a dashboard.
 *   - `Content.Create` — clone into another workspace + .pbix import.
 *   - `Workspace.ReadWrite.All` — workspace create/update/users +
 *     paginated-report gateway binding.
 *   - `Dataflow.ReadWrite.All` — dataflow refresh/cancel/history/schedule.
 *   - `Pipeline.ReadWrite.All` + `Pipeline.Deploy` — deployment-pipeline
 *     CRUD/users/stage assignment + the dedicated deploy permission.
 *   - `Capacity.ReadWrite.All` — workspace↔capacity assignment.
 *
 * `Tenant.Read.All` / `Tenant.ReadWrite.All` are deliberately ABSENT:
 * they are admin-consent-gated, so listing them here would break the
 * connect flow for every non-admin user. The tenant-admin governance
 * triggers are deferred until an optional-scope consent flow exists
 * (see owner-setup-report.md §Deferred).
 *
 * tokenScope: "user" + accountIdField: "email" match every Microsoft
 * sibling (email from the id_token: `email` ?? `preferred_username`).
 *
 * apiVersion: "v1.0" pins the Power BI REST API version segment
 * (`api.powerbi.com/v1.0/myorg`).
 *
 * Capability flags follow the honest-state convention:
 *   - `actions: true` — 47 handlers registered in
 *     `services/execution/handlers/_handlerInventory.ts`.
 *   - `pollingTrigger: true` — 17 polling triggers registered under
 *     `integrations/microsoft-powerbi/triggers/`.
 *   - `webhookTrigger: false` — Power BI has no author-safe outbound
 *     webhook for these resources; everything polls.
 */
export const microsoftPowerBiManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "microsoft-powerbi",
    displayName: "Microsoft Power BI",
    isEnabled: true,
    apiVersion: "v1.0",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "https://analysis.windows.net/powerbi/api/Dataset.ReadWrite.All",
        "https://analysis.windows.net/powerbi/api/Report.ReadWrite.All",
        "https://analysis.windows.net/powerbi/api/Dashboard.Read.All",
        "https://analysis.windows.net/powerbi/api/Content.Create",
        "https://analysis.windows.net/powerbi/api/Workspace.ReadWrite.All",
        "https://analysis.windows.net/powerbi/api/Dataflow.ReadWrite.All",
        "https://analysis.windows.net/powerbi/api/Pipeline.ReadWrite.All",
        "https://analysis.windows.net/powerbi/api/Pipeline.Deploy",
        "https://analysis.windows.net/powerbi/api/Capacity.ReadWrite.All",
      ],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: true,
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000,
    refreshable: true,
  });
