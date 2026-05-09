import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Microsoft Outlook Calendar provider manifest.
 *
 * Sibling to `microsoft-outlook` (Slice 6 mail). Two integration rows
 * per user (mail + calendar) under one Azure AD app — the same
 * `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` cover both
 * providers. Each provider has its own redirect URI and scope set;
 * users can grant / revoke each independently.
 *
 * Decision: separate provider id (NOT extending `microsoft-outlook`).
 * Rationale documented in docs/slices/slice-7-outlook-calendar.md
 * §"Provider-id decision" — matches V2's per-surface Google split
 * (gmail / google-calendar / google-drive / google-sheets) and
 * preserves Slice 6's no-scope-bloat principle.
 *
 * Capability flags follow the V2 honest-state convention — they flip
 * true only when a real handler/trigger lands. As of this commit
 * (Slice 7 Commit 2 — manifest + OAuth + dispatcher registration),
 * `oauth` is true and the rest are still false. Subsequent commits
 * flip `actions` (Commit 3 — 5 calendar actions) and `webhookTrigger`
 * (Commit 4 — event_changed subscription trigger).
 *
 * Scopes — exactly two:
 *   - `offline_access` — required for the Microsoft v2 endpoint to
 *     issue a refresh_token. Without it tokens last 60-90 minutes and
 *     the integration goes cold.
 *   - `Calendars.ReadWrite` — required by all 5 actions (create_event,
 *     update_event, delete_event, list_events, add_attendees) and by
 *     the event_changed trigger. Microsoft's permissions are
 *     hierarchical: `Calendars.ReadWrite` includes `Calendars.Read`,
 *     so we don't request both.
 *
 * Mail-specific scopes (`Mail.Send`, `Mail.Read`) are NOT here —
 * Slice 6's no-scope-bloat principle holds. Users with both providers
 * consent to mail scopes for the mail provider AND calendar scopes
 * for the calendar provider, separately.
 *
 * tokenScope: "user" matches Gmail / Calendar / Drive / Sheets / Slice
 * 6 mail — one Calendar integration per (user, email).
 *
 * accountIdField: "email" — the email address resolved from Graph
 * `/me` (`mail` field with `userPrincipalName` fallback for consumer
 * accounts where the mailbox isn't provisioned). Same shape as Slice
 * 6 mail. Shared via `_shared/microsoft/api/me.ts`.
 *
 * Health-check interval: 6h matches every Microsoft + Google provider
 * (CLAUDE.md "Google/Microsoft: 6h").
 *
 * apiVersion: "v1.0" pins the Graph API version. Same as Slice 6.
 *
 * refreshable: true — Microsoft's v2 OAuth issues refresh tokens when
 * `offline_access` is granted. Preserve-old policy on rotation
 * (shared with Slice 6 mail via `_shared/microsoft/oauth.ts`).
 *
 * /me access via Calendars.ReadWrite: in practice Microsoft Graph
 * grants `/me?$select=mail,userPrincipalName,id` access whenever any
 * delegated permission is granted (`userPrincipalName` is part of the
 * sign-in identity). If a real Azure AD tenant requires explicit
 * User.Read for /me, we add it in a follow-up — Slice 7 follows the
 * Slice 6 minimum-scope precedent.
 */
export const microsoftOutlookCalendarManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "microsoft-outlook-calendar",
    displayName: "Microsoft Outlook Calendar",
    isEnabled: true,
    apiVersion: "v1.0",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: ["offline_access", "Calendars.ReadWrite"],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // Flipped to true in Slice 7 Commit 4 when the event_changed
      // subscription trigger + webhook receiver land.
      webhookTrigger: false,
      pollingTrigger: false,
      // Flipped to true in Slice 7 Commit 3 when the 5 calendar
      // actions register in services/execution/handlers/_registry.ts.
      actions: false,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000, // 6h
    refreshable: true,
  });
