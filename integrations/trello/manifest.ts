import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Trello provider manifest (Slice 17 Commit 3).
 *
 * V2's first **token-ingest** auth provider — see
 * `docs/slices/trello-token-ingest-contract-plan.md` and
 * `docs/slices/slice-17-trello.md`.
 *
 * Auth model:
 *   - `authFlow: "token_ingest"` — Trello's "client authorization" flow
 *     returns the user token in the browser URL fragment, not in a
 *     server callback's query params. A V2 client page captures the
 *     fragment and POSTs to the dispatcher's ingest endpoint.
 *   - `refreshable: false` — Trello tokens (with `expiration=never`) do
 *     not refresh. `verifyAndIngestToken` returns
 *     `refreshTokenEncrypted: null`.
 *   - `tokenScope: "user"` — one Trello integration per (user, member id).
 *   - `apiVersion: "1"` — Trello's REST API uses `/1/` as the versioning
 *     path; no quarterly version pinning is needed.
 *   - Scopes `read,write,account` (Trello's coarse scope set) are
 *     declared as required because every action in Batch 1 needs them.
 *
 * Capabilities flip incrementally as later commits land actions and
 * webhooks; Commit 3 only ships auth.
 */
export const trelloManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "trello",
  displayName: "Trello",
  isEnabled: true,
  isExperimental: false,
  apiVersion: "1",
  tokenScope: "user",
  oauthFlows: ["client_authorization"],
  scopes: {
    required: ["read", "write", "account"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: false,
    pollingTrigger: false,
    actions: true,
  },
  healthCheckIntervalMs: 4 * 60 * 60 * 1000,
  refreshable: false,
  authFlow: "token_ingest",
});
