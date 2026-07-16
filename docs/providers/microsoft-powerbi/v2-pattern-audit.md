# Microsoft Power BI — V2 Pattern Audit

Date: 2026-07-15 · Audited against `v2-main` @ `f94c35b26`.

## Providers inspected as implementation references

| Concern | Reference | Why |
|---|---|---|
| Polling triggers (baseline-first, snapshot, shared poller) | `integrations/microsoft-excel/triggers/` | Newest Microsoft polling lifecycle; `_shared/pollingHandler.ts` + `snapshot.ts` |
| OAuth (Azure AD v2, PKCE, shared app) | `integrations/microsoft-excel/oauth.ts` + `integrations/_shared/microsoft/oauth.ts` | Same Entra app + `/common` endpoints; scopes are caller-supplied |
| Async provider jobs | `integrations/microsoft-onedrive/actions/copyItem.ts` | Monitor-URL pattern; smoke `completeAsync` harness |
| FileRef outputs | `core/files/createFileRef.ts`, `services/files/stageFileToStorage.ts`, google-docs `exportDocument`, gmail `getAttachment` | Durable `v2_storage` staging into `workflow-files` |
| FileRef inputs | `integrations/slack/actions/files/uploadFile.ts` | `fetchFileBytes` with `v2_storage`/`signed_url` arms; `provider_url` rejected |
| Cascading option sources | `integrations/microsoft-excel/options/` (workbooks → worksheets → columns) | `requiredDeps` + field `dependsOn` |
| Domain-subfolder action trees | `integrations/eden/actions/*`, `integrations/asana/actions/tasks/` | 50-file leaf cap precedent; registry imports from subfolders |
| Newest overall action/meta patterns | asana, quickbooks, eden | Most recent provider arcs |

Full raw audit notes (code excerpts of every contract) were captured during the build
session; the durable summary of each contract is below.

## Contracts reused (no divergence)

- **Manifest**: `ProviderManifest` (`contracts/integration.ts`), `tokenScope:"user"`,
  `oauthFlows:["v2"]`, `authFlow:"code_callback"`, `refreshable:true`,
  `accountIdField:"email"`, `healthCheckIntervalMs: 6h`. Registered by appending to
  `ALL_MANIFESTS` in `integrations/_registry.ts`; triggers register via side-effect
  imports at the top of the same file.
- **Actions**: `ActionHandler` from `services/execution/handlers/types.ts`; registered in
  `services/execution/handlers/_handlerInventory.ts` (`{provider, type, handler}`);
  triplet `<action>.ts` / `<action>.schema.ts` (zod `.strict()`) / `<action>.meta.ts`
  (`ActionMeta`, key `microsoft-powerbi:<type>`).
- **401 handling**: `services/oauth/refreshAndRetry.ts` — wrappers throw
  `Unauthorized401Error` on 401 only; one refresh+retry.
- **Triggers**: per-event folder `{index.ts, activate.ts, schema.ts, <event>.meta.ts}`;
  `registerActivation(provider, eventType, activate)` (throw on seed failure);
  ONE shared `PollingHandler` registered once via `registerPollingHandler`;
  snapshot + `config.polling.lastPolledAt` persisted via
  `repositories/triggerResources.updateConfig`; events via `enqueueRun` with
  short-form `eventType`; synthetic dedup-safe event ids
  (`${provider}:${workflowId}:${nodeId}:${eventType}:${key}`), DB dedup via
  `repositories/webhookEventDedup.markSeen` (fail-closed).
- **Option sources**: `OptionsResolver` (`services/options/types.ts`), registered in
  `services/options/_registry.ts`; cascade via `requiredDeps` + meta `dependsOn`;
  errors via `OptionsResolverError` with safe static messages.
- **Apps catalog**: `lib/apps/providerCategories.ts` (category + description) — gated by
  `tests/unit/lib/apps/providerCategories.test.ts`; icon at
  `public/integrations/microsoft-powerbi.svg`.
- **Discovery / Builder / AI**: `services/discovery/providers/microsoft-powerbi.ts`
  exporting `ACTION_METAS`/`TRIGGER_METAS`, spread into
  `services/discovery/_metaInventory.ts`. AI visibility is automatic from manifests +
  discovery (manifest capability honesty is the AI gate).
- **credentialSharing**: `core/integrations/credentialSharing.ts` → `"personal"`
  (matches every other `microsoft-*` provider; the Power BI login is the human's own
  Entra identity, even though workspaces are shared resources — same call as Outlook/
  OneDrive; team sharing is governed by the personal-credential policy).
- **Smoke**: one `defineActionSmokeFixture` per action under
  `tests/fixtures/action-smoke/microsoft-powerbi/`.

## Intentional divergences (all documented)

1. **API base is not Graph.** `_shared/microsoft/api/_base.ts` is Graph-hardcoded
   (`graphApiBase()`). Power BI gets its own base helper in
   `integrations/microsoft-powerbi/api/_base.ts` → `POWERBI_API_BASE ??
   "https://api.powerbi.com"` (path prefix `/v1.0/myorg`). Error surface mirrors
   `_shared/microsoft/api/errors.ts` (401 → `Unauthorized401Error`, 404 →
   `NotFoundError`, others → sanitized `Error`), adapted for the Power BI error
   envelope (`error.code` / `pbi.error`).
2. **OAuth identity via `id_token`, not Graph `/me`.** Other Microsoft providers call
   Graph `/me` with the access token; a Power BI-audience access token cannot call
   Graph. We add `openid profile email` to the scope list and surface the token
   endpoint's `id_token` through an additive optional field on
   `MicrosoftTokenExchangeResult` (`integrations/_shared/microsoft/oauth.ts`), then
   decode its payload (TLS-direct from the token endpoint — same trust as the access
   token) for `email`/`preferred_username` as `provider_account_id`. No behavior
   change for existing Microsoft providers.
3. **Scopes are Power BI resource scopes** (`https://analysis.windows.net/powerbi/api/…`)
   rather than Graph scopes. The shared authorize/token helpers are resource-agnostic —
   verified: scopes are a plain caller-supplied list.
4. **Export actions complete async jobs in-run.** OneDrive `copy_item` returns
   `pending + monitorUrl`; Power BI export jobs instead poll to completion inside the
   handler (bounded ~40s budget honoring `Retry-After`; run routes have
   `maxDuration=60`), then stage bytes → `FileRef(v2_storage)`. Over-budget exports
   throw a classifiable timeout error with author guidance. This satisfies the
   product requirement "exports return a durable FileRef" within platform physics.
5. **Domain subfolders from day one** — `actions/{semantic_models,reports,imports,
   dataflows,pipelines,workspaces,gateways,capacities}/` (47 actions × 3 files would
   blow the 50-file leaf cap).
6. **Gateway credential encryption** — new pure helper
   `integrations/microsoft-powerbi/api/gatewayCredentials.ts` implementing Microsoft's
   documented RSA-OAEP (+ hybrid AES for large keys) encryption against the gateway
   public key. Credentials accepted as `sensitivity:"secret"` config fields
   (precedent: google-analytics `api_secret`) and never logged or returned in outputs.

## Registry presence = shipped

Nothing under `integrations/microsoft-powerbi/` is "shipped" unless it is registered in
`_handlerInventory.ts` / trigger side-effect imports / `_registry.ts` / options registry
and carries meta in the discovery file. Orphan files are not features.
