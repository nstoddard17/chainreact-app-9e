import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Asana provider manifest — Slice 5.ASANA-1.
 *
 * FIRST NET-NEW V2 PROVIDER (no V1 code existed — see
 * docs/providers/asana/v1-audit.md). Wire-format choices verified against
 * current Asana docs (docs/providers/asana/research.md, 2026-07-04).
 *
 * Auth model — OAuth 2.0 authorization code, refreshable, PKCE S256:
 *   - `authorize`: `https://app.asana.com/-/oauth_authorize`
 *   - `token`:     `https://app.asana.com/-/oauth_token`
 *   - Body-auth (`client_id` + `client_secret` in the form body).
 *   - Access tokens expire hourly (`expires_in: 3600`); refresh tokens are
 *     long-lived with no documented expiration. Rotation is undocumented —
 *     preserve-old policy (persist a rotated refresh_token when the refresh
 *     response carries one, else keep the original). Same contract as
 *     HubSpot / Monday / Stripe.
 *   - PKCE is OPTIONAL per Asana docs; V2 sends S256 (free hardening,
 *     mirrors Airtable's standalone PKCE shape).
 *
 * Scopes — the minimum set for the first slice (5 task actions, 2
 * project-webhook triggers, 4 option sources). Asana's granular scopes
 * launched Apr 2025; exact names verified against
 * https://developers.asana.com/docs/oauth-scopes:
 *   - `tasks:read`      — get_task + `asana:tasks` option source.
 *   - `tasks:write`     — create_task / update_task / complete_task.
 *   - `stories:write`   — add_comment_to_task (POST /tasks/{gid}/stories).
 *   - `projects:read`   — `asana:projects` option source.
 *   - `users:read`      — `asana:users` option source + GET /users/me
 *                         identity fallback at OAuth-callback time.
 *   - `workspaces:read` — `asana:workspaces` option source.
 *   - `webhooks:write`  — trigger activation (POST /webhooks).
 *   - `webhooks:delete` — trigger deactivation (DELETE /webhooks/{gid}).
 *                         NOT covered by `webhooks:write` per the
 *                         reference pages.
 *
 * Deliberately EXCLUDED (no-scope-bloat): `stories:read` (no comment
 * listing shipped), `webhooks:read` (we never list webhooks),
 * `tasks:delete` (no delete action), sections scopes (sections DEFERRED —
 * the scope gating GET /projects/{gid}/sections is ambiguous in current
 * docs; see research.md "Known limitations").
 *
 * tokenScope: "user" — one Asana integration per user, mirrors every
 * other refreshable-OAuth personal provider (Airtable / Monday / Google).
 * Credential class is PERSONAL (core/integrations/credentialSharing.ts):
 * the token acts as the connecting human.
 *
 * accountIdField: "email" — the token response includes a `data` object
 * with the user's gid/name/email; email is the user-recognizable label.
 * OAuth falls back to the numeric gid when email is absent.
 *
 * apiVersion: "1.0" — all endpoints live under
 * `https://app.asana.com/api/1.0`.
 *
 * Health-check interval: 12h — the "Others" bucket. Hourly token expiry
 * between checks is handled reactively by `refreshAndRetry` (Q3).
 *
 * Capabilities (honest — all real handlers land in this same slice):
 *   - `oauth: true` — code flow + refresh implemented.
 *   - `actions: true` — 5 action handlers registered.
 *   - `webhookTrigger: true` — 2 project-scoped webhook triggers with a
 *     full activate (POST /webhooks + X-Hook-Secret handshake persistence)
 *     / deactivate (DELETE /webhooks/{gid}) lifecycle.
 *   - `pollingTrigger: false` — webhook-only; Asana webhooks are reliable
 *     and polling never ships for this provider.
 */
export const asanaManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "asana",
  displayName: "Asana",
  isEnabled: true,
  apiVersion: "1.0",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "email",
  scopes: {
    required: [
      "tasks:read",
      "tasks:write",
      "stories:write",
      "projects:read",
      "users:read",
      "workspaces:read",
      "webhooks:write",
      "webhooks:delete",
    ],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: true,
    pollingTrigger: false,
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000,
  refreshable: true,
});
