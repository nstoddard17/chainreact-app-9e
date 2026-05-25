import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Airtable provider manifest.
 *
 * Slice 10 — V2's first non-Google / non-Microsoft REFRESHABLE OAuth
 * provider, and the first non-G/non-MS PKCE provider. See
 * `docs/slices/slice-10-airtable.md` §"OAuth model — refreshable + PKCE
 * + rotated tokens".
 *
 * Capability flags follow the V2 honest-state convention. Slice 10
 * Commit 2 (this) lands manifest + OAuth + dispatcher registration —
 * `oauth: true`, the rest `false`. Subsequent commits flip `actions`
 * (Commit 3) and `webhookTrigger` (Commit 4).
 *
 * Token model — refreshable with ROTATED refresh tokens:
 *   Airtable's OAuth issues both an access token (60-min TTL) and a
 *   refresh token (60-day idle sliding window). Each successful refresh
 *   returns a NEW access_token AND a NEW refresh_token; the old refresh
 *   token is invalidated. V2's `dispatcher.refresh` → `updateTokens`
 *   flow correctly persists both. The per-provider `refreshToken()` in
 *   `integrations/airtable/oauth.ts` enforces the rotation invariant —
 *   throws if the response is missing the new refresh_token.
 *
 *   V1's `oauthConfig.ts:414` `refreshTokenExpirationSupported: false`
 *   means "the refresh token has no explicit expiration metadata," NOT
 *   "refresh isn't supported." V2's manifest uses `refreshable: true`
 *   and lets the 60-day idle window be enforced by Airtable's server
 *   (V2 surfaces the resulting `invalid_grant` as
 *   `IntegrationActionRequiredError(reason: "refresh_failed")` via the
 *   shared `services/oauth/refreshAndRetry.ts`).
 *
 * `tokenScope: "user"` — one Airtable integration per (user,
 * providerAccountId). The bot/workspace concept doesn't apply to
 * Airtable; each authorize grants tokens scoped to the user's Airtable
 * account.
 *
 * `accountIdField: "userId"` — Airtable's `/v0/meta/whoami` returns
 * `id` (e.g. `usrL2PNC5o3H4lBEi`). The id is stable per Airtable user
 * account and uniquely identifies which Airtable user the access token
 * belongs to.
 *
 * `apiVersion: "v0"` — pins Airtable's REST API version. All wrappers
 * use `/v0/...` paths.
 *
 * `healthCheckIntervalMs: 12h` — matches V2's "other providers" tier
 * (Notion, Slack, Discord). Airtable's API is gentle on rate limits;
 * 12h `/v0/meta/whoami` ping is more than enough.
 *
 * `scopes.required` — exactly four (Slice 10 Batch 1):
 *   - `data.records:read` — list_records, get_record, find_record,
 *     get_record (read fields).
 *   - `data.records:write` — create_record, update_record,
 *     delete_record.
 *   - `schema.bases:read` — get_base_schema, get_table_schema, and
 *     for the field-polymorphism layer to look up field types when
 *     parsing webhook payloads.
 *   - `webhook:manage` — Slice 10 Commit 4's record_changed trigger
 *     creates / refreshes / deletes webhooks programmatically.
 *
 *   NOT included: `schema.bases:write` (no schema-mutation actions in
 *   Batch 1) and `user.email:read` (V2 surfaces `userId` as
 *   accountIdField, not email — V1's plan-doc cross-check).
 *
 * `oauthFlows: ["v2"]` — Airtable's current OAuth 2.0 with PKCE flow.
 */
export const airtableManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "airtable",
  displayName: "Airtable",
  isEnabled: true,
  apiVersion: "v0",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "userId",
  scopes: {
    required: [
      "data.records:read",
      "data.records:write",
      "schema.bases:read",
      "webhook:manage",
    ],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    // True: `record_changed` subscription-watch trigger registered in
    // integrations/airtable/triggers/recordChanged. Webhook route
    // lives at /api/webhooks/airtable. Renewal handler registered
    // with subscriptionRegistry (6-day threshold against Airtable's
    // 7-day TTL).
    webhookTrigger: true,
    pollingTrigger: false,
    // True: 8 action handlers (list_records, get_record, find_record,
    // create_record, update_record, delete_record, get_base_schema,
    // get_table_schema) registered in
    // services/execution/handlers/_registry.ts as of Slice 10 Commit 3.
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000, // 12h
  refreshable: true,
});
