import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Monday.com provider manifest — Slice 3.MONDAY-2.
 *
 * Green-field port. No prior Monday code existed in V2 before this slice.
 * Wire-format choices derived from V1's
 * `lib/integrations/oauthConfig.ts:591-605` + the audit doc
 * `docs/slices/phase-3/monday-metadata-plan.md`.
 *
 * Auth model — OAuth 2.0 authorization code, refreshable, NO PKCE:
 *   - V1 declared `requiresPkce: false` for Monday. Mirrors HubSpot's
 *     PKCE-less + body-auth shape (V2 Slice 13). The shared Microsoft /
 *     Google PKCE helpers are NOT used here.
 *   - `authorize`: `https://auth.monday.com/oauth2/authorize`
 *   - `token`:     `https://auth.monday.com/oauth2/token`
 *   - Both code-exchange and refresh use body-auth (`client_id` +
 *     `client_secret` in the form body, not Basic). V1's
 *     `authMethod: "body"` + `refreshRequiresClientAuth: true`.
 *   - Refresh additionally requires `redirect_uri` (V1's
 *     `sendRedirectUriWithRefresh: true`).
 *   - Refresh tokens are stable across refresh (V1's
 *     `refreshTokenExpirationSupported: false`). Preserve-old policy:
 *     when the refresh response includes a new `refresh_token`, persist
 *     it; otherwise keep the existing one. Same shape as HubSpot.
 *
 * Scopes — exactly the 11 D-MON1 accepted scopes:
 *   - `me:read`        — required for the connect-time `me { id name email }`
 *                        Graph query that resolves `providerAccountId`.
 *   - `boards:read`    — list boards, get board, list groups, list items, get item.
 *   - `boards:write`   — create_item / update_item / delete_item / move_item /
 *                        create_subitem and future board / column writes.
 *   - `users:read`     — list_users (and Graph users lookups for future
 *                        column-aware UX).
 *   - `updates:read`   — list_updates (deferred — included so MONDAY-N
 *                        polish doesn't trigger a re-consent flow).
 *   - `updates:write`  — create_update.
 *   - `assets:read`    — file-column reads (deferred — same future-proofing).
 *   - `assets:write`   — file uploads (deferred — same).
 *   - `webhooks:read`  — required by MONDAY-5's trigger lifecycle (list
 *                        existing webhooks before create_webhook).
 *   - `webhooks:write` — REQUIRED in v1 per D-MON3. MONDAY-5 webhook
 *                        triggers create + delete webhooks via
 *                        `create_webhook` / `delete_webhook` mutations;
 *                        granting at connect-time avoids the missing-scope
 *                        edge case that would otherwise fail trigger
 *                        activation later.
 *   - `workspaces:read`— workspace metadata, future workspace pickers.
 *
 * Deliberately EXCLUDED:
 *   - `account:read` — V1 included it but Monday's Graph `account` type
 *     isn't needed for any MONDAY-2 action or any planned MONDAY-N action.
 *     Dropped per D-MON1 to honor the no-scope-bloat principle.
 *
 * tokenScope: "user" — one Monday integration per user. Mirrors every
 * other refreshable-OAuth provider in V2 (Google / Microsoft siblings,
 * Airtable, HubSpot, Notion).
 *
 * accountIdField: "email" — resolved at OAuth callback time by querying
 * `{ me { id name email } }` against the GraphQL API. Email is the most
 * user-recognizable label (matches Microsoft's UPN-style resolution).
 * The OAuth implementation falls back to the numeric `id` if `email` is
 * absent.
 *
 * apiVersion: "2024-01" pins Monday's GraphQL API header. V1 sends
 * `API-Version: 2024-01` on every request. MONDAY-5 webhook activation
 * may later use `2025-04` for create_webhook, but reads + writes are
 * 2024-01 stable.
 *
 * Health-check interval: 12h — Monday is not in CLAUDE.md's per-provider
 * table, so it falls into the "Others" bucket (12h). Refresh-on-401 via
 * `refreshAndRetry` (Q3) handles transient expiry between health checks.
 *
 * Capabilities:
 *   - `oauth: true` — code-flow + refresh implemented.
 *   - `actions: true` — 10 action handlers ship in this slice.
 *   - `webhookTrigger: false` — flips true in MONDAY-5.
 *   - `pollingTrigger: false` — Monday triggers are webhook-only
 *     (D-MON2). Polling never gets enabled for this provider.
 */
export const mondayManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "monday",
  displayName: "monday.com",
  isEnabled: true,
  apiVersion: "2024-01",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "email",
  scopes: {
    required: [
      "me:read",
      "boards:read",
      "boards:write",
      "users:read",
      "updates:read",
      "updates:write",
      "assets:read",
      "assets:write",
      "webhooks:read",
      "webhooks:write",
      "workspaces:read",
    ],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    // Flips true in MONDAY-5 — Monday's `create_webhook` + delete_webhook
    // lifecycle. Polling stays false permanently (D-MON2 — webhook-only).
    webhookTrigger: false,
    pollingTrigger: false,
    // True — 10 action handlers ship in MONDAY-2 (the remaining 14 are
    // deferred to MONDAY-N polish per D-MON1).
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000,
  refreshable: true,
});
