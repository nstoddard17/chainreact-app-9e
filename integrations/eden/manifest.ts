import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Eden provider manifest (EDEN-3).
 *
 * Eden (`eden.so`) is a content-research / boards / creator-analysis / social-
 * scheduling platform. Its ONLY sanctioned automation surface is a remote MCP
 * server (`https://mcp.eden.so/mcp`) — see `docs/providers/eden/`. There is no
 * REST API and no webhook/event API.
 *
 * Auth model:
 *   - `authFlow: "token_paste"` — the user creates a personal access token
 *     (`eden_pat_…`) in Eden → Settings → Integrations → API access and PASTES it
 *     into a V2-hosted form. No provider authorize redirect, no URL fragment. The
 *     server contract is the shared token-ingest path (state consume → verify →
 *     encrypt → upsert); Eden's `verifyAndIngestToken` proves the token via an MCP
 *     `initialize` + a read-only tool call.
 *   - `refreshable: false` — PATs do not refresh; a 401 surfaces reconnect.
 *   - `tokenScope: "user"` — one Eden integration per user (the PAT acts on the
 *     connecting human's behalf → `personal` credential class, see
 *     `core/integrations/credentialSharing.ts`).
 *
 * Capability honesty:
 *   - `oauth: true` — a real connect path exists (the paste flow IS the connect).
 *   - `actions: true` — 33 typed MCP-backed actions are registered (handlers +
 *     metas), all `.strict()`-schema'd against the live `tools/list` capture and
 *     live success-certified. (CS-6D — the 3 social-publish writes `schedule_post`,
 *     `publish_post_now`, `update_scheduled_post` are DEFERRED: their success path
 *     is not live-certified — the cert account has no connected social accounts —
 *     so they are unregistered from discovery + execution and hidden from the
 *     builder/catalog/agent. Their impl files remain as orphans. See
 *     docs/providers/eden/deferred-actions.md. Re-register only after a live
 *     success capture against a disposable connected account.)
 *   - `webhookTrigger/pollingTrigger: false` — Eden has no event API; none exist.
 *   - `isExperimental: false` — LIVE and published to the production Apps catalog
 *     (CS-6E), jointly with Linear. The certified surface is 33 actions; the 3
 *     social-publish writes stay DEFERRED/hidden (unregistered) pending a live
 *     success capture — see docs/providers/eden/deferred-actions.md.
 */
export const edenManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "eden",
  displayName: "Eden",
  isEnabled: true,
  isExperimental: false,
  apiVersion: "mcp",
  tokenScope: "user",
  oauthFlows: ["personal_access_token"],
  scopes: {
    // Eden PATs are minted "Read only" or "Read & write". `read` is the baseline
    // (all reads); `write` is optional and enables scheduling / board / note writes.
    required: ["read"],
    optional: ["write"],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: false,
    pollingTrigger: false,
    // 33 MCP-backed actions registered against mcp.eden.so (all live
    // success-certified). The 3 social-publish writes are DEFERRED/hidden until
    // certified — see the capability-honesty note above. Triggers remain false.
    actions: true,
  },
  healthCheckIntervalMs: 4 * 60 * 60 * 1000,
  refreshable: false,
  authFlow: "token_paste",
});
