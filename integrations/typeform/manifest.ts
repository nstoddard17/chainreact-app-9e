import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Typeform provider manifest — Slice 5.TYPEFORM-1.
 *
 * Second net-new V2 provider (no V1 code existed; Asana was the first).
 * Wire-format choices verified against the official docs
 * (docs/providers/typeform/research.md, 2026-07-04).
 *
 * Auth model — OAuth 2.0 authorization code, confidential client, NO PKCE
 * (not documented by Typeform), refreshable:
 *   - `authorize`: `https://api.typeform.com/oauth/authorize`
 *   - `token`:     `https://api.typeform.com/oauth/token`
 *   - Body-auth (`client_id` + `client_secret` in the form body — same
 *     shape as HubSpot / Monday).
 *   - Access tokens expire after ~1 week (`expires_in`); refresh tokens
 *     are issued ONLY with the `offline` scope and ROTATE on every
 *     refresh (documented — the old refresh token is invalidated), so
 *     oauth.ts persists the rotated token each time.
 *
 * Scopes — minimum set for this slice (1 webhook trigger + 1 option
 * source; ZERO actions). Names verified against
 * https://www.typeform.com/developers/get-started/scopes/:
 *   - `accounts:read`  — GET /me connect-time identity (Typeform's token
 *                        response embeds no identity object).
 *   - `forms:read`     — `typeform:forms` option source (GET /forms).
 *   - `webhooks:write` — trigger activation (PUT /forms/{id}/webhooks/{tag})
 *                        AND deactivation (DELETE …) — the scopes page
 *                        lists create/update/delete under webhooks:write.
 *   - `offline`        — refresh-token issuance; without it the 1-week
 *                        access token strands the connection.
 *
 * Deliberately EXCLUDED (no-scope-bloat): `webhooks:read` (we never list
 * webhooks), `responses:read` (the webhook payload carries the full
 * response; no Responses API call ships), `forms:write` / `themes:*` /
 * `images:*` / `workspaces:*` / `responses:write` (out of slice scope).
 *
 * tokenScope: "user" — one Typeform integration per user; credential
 * class is PERSONAL (core/integrations/credentialSharing.ts): the token
 * acts as the connecting human over their own forms.
 *
 * accountIdField: "email" — resolved via GET /me (scope accounts:read),
 * falling back to the numeric user_id when email is absent.
 *
 * apiVersion: "unversioned" — Typeform's REST API has no version segment;
 * all endpoints live directly under `https://api.typeform.com`.
 *
 * Health-check interval: 12h — the "Others" bucket. Weekly token expiry
 * between checks is handled reactively by `refreshAndRetry`.
 *
 * Capabilities (honest — nothing "coming soon"):
 *   - `oauth: true` — code flow + rotating refresh implemented.
 *   - `actions: false` — ZERO action handlers ship in this slice; the
 *     `form_response` webhook payload is self-contained so no read
 *     action is needed. First V2 provider with an actions-less first
 *     slice; `typeform` joins COVERED_PROVIDERS (discovery-meta-coverage)
 *     only when the first action ships.
 *   - `webhookTrigger: true` — 1 per-form webhook trigger with a full
 *     activate (PUT with caller-minted secret) / deactivate (DELETE)
 *     lifecycle.
 *   - `pollingTrigger: false` — webhook-only; Typeform webhooks are
 *     reliable (documented retry policy) and polling never ships here.
 */
export const typeformManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "typeform",
  displayName: "Typeform",
  isEnabled: true,
  apiVersion: "unversioned",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "email",
  scopes: {
    required: ["accounts:read", "forms:read", "webhooks:write", "offline"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: true,
    pollingTrigger: false,
    actions: false,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000,
  refreshable: true,
});
