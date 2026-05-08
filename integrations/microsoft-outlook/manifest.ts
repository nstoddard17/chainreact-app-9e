import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Microsoft Outlook (mail-only) provider manifest.
 *
 * First non-Google non-Slack provider in V2. The id is `microsoft-outlook`
 * (not `outlook` and not `microsoft`) so that Slice 7 (Calendar) can land
 * a sibling `microsoft-calendar` manifest under the same Azure AD app
 * without scope conflict. Each Microsoft surface is a separate provider
 * row in the registry — the shared OAuth wire-format gets factored into
 * `_shared/microsoft/` only once a second Microsoft provider exists
 * (deferred per docs/slices/slice-6-outlook-mail.md §"Confirmed scope
 * decisions" #6).
 *
 * Capability flags follow the V2 honest-state convention — they flip true
 * only when a real handler/trigger lands. As of this commit (Slice 6
 * Commit 2 — manifest + OAuth + dispatcher registration), `oauth` is true
 * and the rest are still false. Subsequent commits in the slice flip
 * `actions` (when send_email registers) and `webhookTrigger` (when
 * new_email's subscription trigger registers).
 *
 * Scopes — exactly the three mail-only Graph scopes:
 *   - `offline_access` — required for the Microsoft v2 endpoint to issue
 *     a refresh_token. Without it tokens last 60-90 minutes and the
 *     integration goes cold.
 *   - `Mail.Send` — required by the send_email action (Commit 3).
 *   - `Mail.Read` — required by the new_email trigger (Commit 4) so the
 *     webhook receiver can fetch the message body via /me/messages/{id}.
 *
 * Calendar / Files / Teams scopes are explicitly NOT here — the V1 rot
 * we fix is scope bloat (V1's auth.ts requested 8 scopes for any
 * Microsoft surface). Slice 7 (Calendar) widens additively via a
 * re-auth flow.
 *
 * tokenScope: "user" matches Gmail / Calendar / Drive / Sheets — one
 * Outlook integration per (user, email). A user with both Gmail and
 * Outlook connected has two independent integration rows — independent
 * OAuth, independent tokens, independent health.
 *
 * accountIdField: "email" is the email address resolved from Graph
 * `/me` (`mail` field with `userPrincipalName` fallback for consumer
 * accounts where the mailbox isn't provisioned). Same shape as Gmail.
 *
 * Health-check interval: 6h matches Gmail / Calendar / Drive / Sheets
 * (CLAUDE.md "Google/Microsoft: 6h").
 *
 * apiVersion: "v1.0" pins the Graph API version. The `beta` endpoint
 * exists but Slice 6 stays on `v1.0` (stable, fully backwards-compatible).
 *
 * refreshable: true — Microsoft's v2 OAuth issues refresh tokens when
 * `offline_access` is granted. Tokens rotate (new refresh_token returned
 * with each refresh response); when omitted from a response we preserve
 * the existing one (matches V1's auth.ts:113 policy and Google's
 * preserve-old behavior).
 */
export const microsoftOutlookManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "microsoft-outlook",
    displayName: "Microsoft Outlook",
    isEnabled: true,
    apiVersion: "v1.0",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: ["offline_access", "Mail.Send", "Mail.Read"],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // Flipped to true in Slice 6 Commit 4 when the new_email
      // subscription trigger + webhook receiver land.
      webhookTrigger: false,
      pollingTrigger: false,
      // Flipped to true in Slice 6 Commit 3 when send_email registers
      // in services/execution/handlers/_registry.ts.
      actions: false,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000, // 6h
    refreshable: true,
  });
