import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Notion provider manifest.
 *
 * V2's first non-Google / non-Microsoft OAuth provider — see
 * `docs/slices/slice-9-notion.md` §"Why Notion next".
 *
 * Capability flags follow the V2 honest-state convention — they flip
 * true only when a real handler/trigger lands. As of Slice 9 Commit 3
 * (actions + property polymorphism + Notion API wrappers), `oauth` and
 * `actions` are true. The 7 actions registered in
 * `services/execution/handlers/_registry.ts` are: create_page,
 * update_page, query_database, create_database_entry,
 * append_block_children, get_page, search. `webhookTrigger` is
 * INTENTIONALLY DEFERRED — Notion does not expose a programmatic
 * webhook subscription API; webhooks must be configured manually
 * through the Notion integration UI. Slice 9 ships actions-only per the
 * Commit 1 plan §"Critical constraint: webhooks are manual-only".
 *
 * Token model — long-lived access token, no refresh in V2:
 *   Notion's OAuth flow does issue a `refresh_token` in the token
 *   exchange response (per Notion's current docs), but Slice 9
 *   intentionally treats Notion as a non-refreshable provider:
 *   - `refreshable: false` — manifest declares non-refreshable.
 *   - `refreshTokenEncrypted: null` — the response field is dropped on
 *     the floor at `handleCallback` time.
 *   - `refreshToken()` throws `RefreshNotSupportedError` — V2's
 *     `services/oauth/refreshAndRetry.ts` catches this and surfaces
 *     `IntegrationActionRequiredError(reason: "refresh_not_supported")`,
 *     prompting the user to reconnect.
 *   This validates V2's `RefreshNotSupportedError` path on a real
 *   provider — the first non-API-key non-refreshable OAuth provider in
 *   V2. Refresh-token support can be opted into in a follow-up slice
 *   without breaking the manifest contract (flip `refreshable: true`,
 *   change `refreshToken()` to actually rotate).
 *
 * `tokenScope: "workspace"` — Notion's OAuth grants access to exactly
 * one workspace per authorize flow. A user reauthorizing against a
 * different workspace creates a sibling integration row (one
 * integration per (user, bot_id)).
 *
 * `accountIdField: "bot_id"` — Notion's `/v1/oauth/token` response and
 * `/v1/users/me` both surface the bot user id, which is stable per
 * (integration, workspace) and uniquely identifies which workspace the
 * access token belongs to.
 *
 * `apiVersion: "2022-06-28"` — pins the Notion API version used by all
 * 7 in-scope actions. The newer `2025-09-03` API introduces multi-source
 * databases (`data_source_id`) which is relevant only for triggers;
 * Slice 9 actions-only stays on the older shape that's stable across
 * the in-scope action surface.
 *
 * `healthCheckIntervalMs: 12h` — matches V2's "other providers" tier
 * (Google/Microsoft are 6h; Slack/Discord/GitHub/Notion are longer per
 * V1's CLAUDE.md health-check tiers). Notion's API is gentle on rate
 * limits; no need to ping `/v1/users/me` more often.
 *
 * `scopes.required` — Notion's authorize URL does NOT take a `scope`
 * query parameter. Capability scopes (`read_content`, `update_content`,
 * `insert_content`) are configured in the integration's developer-portal
 * settings, NOT requested per-OAuth-flow. The manifest declares them
 * here as documentary metadata so V2's UI / health surfaces show
 * accurate "what permissions does this integration use" info; they are
 * never URL-passed. Slice 9's 7 actions cover all three: read for
 * `query_database` / `get_page` / `search`; update for `update_page` /
 * `append_block_children`; insert for `create_page` /
 * `create_database_entry`. ProviderManifestSchema requires non-empty
 * `scopes.required` for OAuth providers (`superRefine`); without these
 * documentary scopes the manifest fails Zod validation. This is the
 * Commit-1-plan-said-empty deviation flagged in the Commit 2 report.
 */
export const notionManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "notion",
  displayName: "Notion",
  isEnabled: true,
  apiVersion: "2022-06-28",
  tokenScope: "workspace",
  oauthFlows: ["v2"],
  accountIdField: "bot_id",
  scopes: {
    required: ["read_content", "update_content", "insert_content"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: false,
    pollingTrigger: false,
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000, // 12h
  refreshable: false,
});
