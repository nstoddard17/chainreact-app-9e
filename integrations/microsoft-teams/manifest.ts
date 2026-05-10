import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Microsoft Teams provider manifest.
 *
 * Fifth Microsoft consumer of `_shared/microsoft/` after Outlook Mail
 * (slice 6), Outlook Calendar (slice 7), OneDrive (slice 8), and Excel
 * (slice 15). Reuses the same Azure AD app (`MICROSOFT_CLIENT_ID` /
 * `MICROSOFT_CLIENT_SECRET`) — Slice 16 deliberately does NOT introduce
 * V1's `TEAMS_CLIENT_ID/SECRET` separate-app rot. See
 * `docs/slices/slice-16-microsoft-teams.md` §"V1 rot to fix during port".
 *
 * Capability flags follow the honest-state convention — they flip true
 * only when handlers/triggers actually register. Slice 16 Commit 2
 * (this — manifest + OAuth + dispatcher registration) flips `oauth`
 * only. Commit 3 flips `actions` (5 delegated-user handlers).
 * Commit 4 flips `webhookTrigger` (`new_channel_message` Graph
 * subscription).
 *
 * Scopes — Batch 1 narrow set (8 required):
 *   - `offline_access` — required for the Microsoft v2 endpoint to
 *     issue a refresh_token. Without it tokens last 60-90 minutes and
 *     the integration goes cold.
 *   - `User.Read` — Graph `/me` lookup at OAuth callback for
 *     `accountIdField: "email"` resolution.
 *   - `ChannelMessage.Send` — required by `send_channel_message` and
 *     `reply_to_channel_message` actions.
 *   - `ChannelMessage.Read.All` — required by the `new_channel_message`
 *     trigger's id-fetch hydration (the receive route GETs
 *     `/teams/{id}/channels/{id}/messages/{id}` to read the message
 *     payload because `includeResourceData` stays false).
 *   - `Channel.ReadBasic.All` — required by `get_channel_details`.
 *   - `Team.ReadBasic.All` — required by `get_team_members` (team
 *     existence precondition).
 *   - `TeamMember.Read.All` — required by `get_team_members`. Read-only
 *     scope; the `.ReadWrite.All` variant typically requires tenant
 *     admin consent and is deferred to Batch 2.
 *   - `Chat.ReadWrite` — required by `send_chat_message`. The stable
 *     surface for chat-message write; the narrower `ChatMessage.Send`
 *     is preview-tagged in some Graph docs.
 *
 * Slice 16 deliberately uses ONLY these 8 scopes. V1's manifest requests
 * 19 scopes — many requiring tenant admin consent (`Channel.Delete.All`,
 * `TeamMember.ReadWrite.All`, `Team.Create`, `User.Invite.All`,
 * `Chat.Create`) or covering deferred features (`OnlineMeetings.ReadWrite`,
 * `Calendars.ReadWrite`, `Channel.Create`). All deferred scopes return
 * with their corresponding Batch 2 actions.
 *
 * Mail-specific scopes (`Mail.Send`, `Mail.Read`), Calendar-specific
 * (`Calendars.ReadWrite`), and OneDrive/Excel-specific (`Files.ReadWrite`)
 * are NOT here — each Microsoft provider declares only what its own
 * actions/triggers need.
 *
 * tokenScope: "user" matches every Microsoft sibling. One Teams
 * integration per (user, email).
 *
 * accountIdField: "email" — resolved from Graph `/me` (`mail` field
 * with `userPrincipalName` fallback for consumer accounts). Same as
 * OneDrive / Outlook Mail / Outlook Calendar / Excel.
 *
 * Health-check interval: 6h matches every Microsoft + Google provider
 * (CLAUDE.md "Google/Microsoft: 6h").
 *
 * apiVersion: "v1.0" pins the Graph API version.
 *
 * refreshable: true — Microsoft's v2 OAuth issues refresh tokens when
 * `offline_access` is granted. Preserve-old policy on rotation (shared
 * via `_shared/microsoft/oauth.ts`).
 */
export const microsoftTeamsManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "microsoft-teams",
    displayName: "Microsoft Teams",
    isEnabled: true,
    apiVersion: "v1.0",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: [
        "offline_access",
        "User.Read",
        "ChannelMessage.Send",
        "ChannelMessage.Read.All",
        "Channel.ReadBasic.All",
        "Team.ReadBasic.All",
        "TeamMember.Read.All",
        "Chat.ReadWrite",
      ],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: false,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000,
    refreshable: true,
  });
