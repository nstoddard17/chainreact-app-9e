import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";
import { GRAPH_API_VERSION } from "@/integrations/_shared/facebook/version";

/**
 * Facebook provider manifest — Slice 3.FACEBOOK-2.
 *
 * V2-native port (FACEBOOK-1 plan). Pages-first surface: 8 actions
 * (create/update/delete post, comment, photo/video upload, page insights,
 * page Messenger send). NO Ads / Groups / monetization.
 *
 * Auth — OAuth 2.0 authorization-code, **NOT refreshable** (D-FB5):
 *   - Facebook issues a LONG-LIVED user token (~60 days) via the
 *     `fb_exchange_token` exchange at callback time — there is NO
 *     `refresh_token`. So `refreshable: false` (honest per the contract:
 *     "true iff the OAuth flow returns a refresh token"). A 401 after the
 *     ~60-day window surfaces as `action_required` (reconnect) via
 *     refresh-and-retry, exactly like Slack's non-refreshable tokens.
 *   - **Page access tokens are derived at runtime** from the stored user
 *     token (`getPageAccessToken`), never persisted — one token per
 *     integration row holds.
 *   - Account identity: `GET /me` → the app-scoped user `id`
 *     (`accountIdField: "id"`), with name/email for the display label.
 *
 * Scopes — 6, ALL requiring Meta **Advanced Access (App Review)** for
 * EXTERNAL users. In **Development Mode** the app's own admins / developers
 * / testers get Standard Access to all of them WITHOUT review, so the
 * runtime is testable/usable the day it lands (D-FB3); App Review gates GA
 * only. Scopes cover exactly the 8 actions:
 *   - `pages_show_list`       — list managed Pages + derive Page tokens (/me/accounts).
 *   - `pages_read_engagement` — read Page posts + insights base.
 *   - `pages_manage_posts`    — create / update / delete posts; upload photos/videos.
 *   - `pages_manage_engagement` — comment as the Page.
 *   - `read_insights`         — Page insights metrics.
 *   - `pages_messaging`       — Messenger send (separate, stricter Messenger
 *                               Platform review track for GA — D-FB7).
 * The trigger subscription scope (`pages_manage_metadata`) is added in
 * FACEBOOK-5 when the webhook trigger lands — NOT requested here.
 *
 * Capabilities: oauth + actions. `webhookTrigger: false` (flips true in
 * FACEBOOK-5 — app-level webhook + per-page subscribed_apps). pollingTrigger
 * false.
 *
 * Graph version pinned via the shared `GRAPH_API_VERSION` (see version.ts);
 * health-check interval 12h (Facebook is in CLAUDE.md's "Others" bucket).
 */
export const facebookManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "facebook",
  displayName: "Facebook",
  isEnabled: true,
  tokenScope: "user",
  oauthFlows: ["v2"],
  apiVersion: GRAPH_API_VERSION,
  accountIdField: "id",
  scopes: {
    required: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_manage_engagement",
      "read_insights",
      "pages_messaging",
    ],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    // Flips true in FACEBOOK-5 — app-level webhook + per-page
    // subscribed_apps subscription (new_post / new_comment).
    webhookTrigger: false,
    pollingTrigger: false,
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000,
  // Facebook returns a long-lived access token, NOT a refresh token.
  refreshable: false,
});
