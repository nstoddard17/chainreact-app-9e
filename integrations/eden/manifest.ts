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
 *   - `actions/webhookTrigger/pollingTrigger: false` — none are registered yet.
 *     Every action's `.strict()` schema depends on the LIVE MCP `tools/list`
 *     capture, which is blocked until an authorized `eden_pat_` credential is
 *     supplied (docs/providers/eden/implementation-plan.md, blocker B3).
 *   - `isExperimental: true` — Eden is NOT live-certified and the MCP transport
 *     has unverified live details; keep it out of the default Apps catalog until
 *     actions ship and Phase 13 live certification passes, then flip to false.
 */
export const edenManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "eden",
  displayName: "Eden",
  isEnabled: true,
  isExperimental: true,
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
    actions: false,
  },
  healthCheckIntervalMs: 4 * 60 * 60 * 1000,
  refreshable: false,
  authFlow: "token_paste",
});
