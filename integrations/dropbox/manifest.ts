import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Dropbox provider manifest — Slice 3.DROPBOX-2.
 *
 * Green-field V2 port. Wire-format derived from V1's
 * `lib/integrations/oauthConfig.ts:211-226` +
 * `lib/integrations/provider-registry.ts:892-936`, re-evaluated under the
 * DROPBOX-1 audit (`docs/slices/phase-3/dropbox-metadata-plan.md`).
 *
 * Auth — OAuth 2.0 authorization-code, refreshable, NO PKCE (D-DB2):
 *   - Confidential client with a secret; matches HubSpot / Monday's
 *     body-auth, PKCE-less shape. The Google/Microsoft PKCE helpers are
 *     NOT used.
 *   - Authorize: `https://www.dropbox.com/oauth2/authorize` with
 *     `token_access_type=offline` (REQUIRED for Dropbox to issue a
 *     refresh token).
 *   - Token: `https://api.dropboxapi.com/oauth2/token`.
 *   - Refresh tokens are long-lived (V1's
 *     `refreshTokenExpirationSupported: false`); the refresh response
 *     does not rotate the refresh token, so the OAuth impl preserves the
 *     original. Same preserve-old policy as HubSpot / Monday.
 *
 * Scopes — 6 (D-DB1/D-DB3). V1 declared 4 (`files.content.{read,write}`,
 * `files.metadata.read`, `account_info.read`). DROPBOX-2 adds
 * `sharing.write` (required by `create_shared_link_with_settings`) and
 * `sharing.read` (required by `list_shared_links`, used to reuse an
 * existing link on conflict — D-DB8). `get_temporary_link` needs only
 * `files.content.read` (already present). No over-scoping beyond the
 * shipped 11-action surface.
 *
 * tokenScope "user" — one Dropbox integration per user. accountIdField
 * "account_id" — `providerAccountId` is the Dropbox `account_id`
 * (`dbid:...`) resolved from `/2/users/get_current_account` at callback
 * time. This is load-bearing: the future `dropbox:new_file` webhook
 * (DROPBOX-5) routes account-scoped notifications by `account_id`, so the
 * id (not email) MUST be the stable account key.
 *
 * Health-check interval 12h — Dropbox is not in CLAUDE.md's per-provider
 * table, so it falls into the "Others" bucket. 401s between checks are
 * handled by `refreshAndRetry` (Q3).
 *
 * Capabilities:
 *   - oauth: true.
 *   - actions: true — 11 action handlers ship in DROPBOX-2.
 *   - webhookTrigger: false — flips true in DROPBOX-5 (Dropbox's
 *     app-level webhook + per-account cursor model; shared-infra, not the
 *     per-workflow create_webhook pattern).
 *   - pollingTrigger: false — Dropbox triggers are webhook-based.
 */
export const dropboxManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "dropbox",
  displayName: "Dropbox",
  isEnabled: true,
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "account_id",
  scopes: {
    required: [
      "account_info.read",
      "files.metadata.read",
      "files.content.read",
      "files.content.write",
      "sharing.read",
      "sharing.write",
    ],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    // Flips true in DROPBOX-5 — Dropbox app-level webhook + per-account
    // cursor reconciliation. Polling stays false (webhook-based).
    webhookTrigger: false,
    pollingTrigger: false,
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000,
  refreshable: true,
});
