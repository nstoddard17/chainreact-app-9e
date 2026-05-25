import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Microsoft OneNote provider manifest — Slice 3.ONENOTE-2.
 *
 * Sibling to `microsoft-outlook`, `microsoft-outlook-calendar`,
 * `microsoft-onedrive`, `microsoft-excel`, `microsoft-teams`. Same
 * Azure AD app (`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`),
 * same shared OAuth pipeline (`integrations/_shared/microsoft/oauth.ts`),
 * same Graph base (`integrations/_shared/microsoft/api/_base.ts`),
 * same `/me` lookup for account-id resolution
 * (`integrations/_shared/microsoft/api/me.ts`).
 *
 * Per-surface split rationale documented in
 * `docs/slices/slice-7-outlook-calendar.md` §"Provider-id decision"
 * and carried forward in
 * `docs/slices/phase-3/onenote-metadata-plan.md`.
 *
 * Capability flags follow the V2 honest-state convention — they flip
 * true only when a real handler/trigger lands. As of ONENOTE-5,
 * `oauth` + `actions` + `pollingTrigger` are all true (new_note +
 * updated_note polling triggers shipped). `webhookTrigger` stays
 * false **permanently** — Microsoft Graph deprecated OneNote
 * subscriptions in May 2023 (V1 manifest comment + Microsoft Graph
 * docs); the V2-native trigger architecture is polling-only per
 * ONENOTE-1 §4.2.
 *
 * Scopes — exactly two (ONENOTE-1 §4.3 decision):
 *   - `offline_access` — required for the Microsoft v2 endpoint to
 *     issue a refresh_token. Without it tokens last 60-90 minutes and
 *     the integration goes cold.
 *   - `Notes.ReadWrite` — covers reads + writes on the user's own
 *     notebooks. Microsoft's permissions are hierarchical: ReadWrite
 *     includes Read, so we don't request both.
 *
 * Slice ONENOTE-2 deliberately uses `Notes.ReadWrite` — NOT V1's
 * `Notes.ReadWrite.All`. The narrower scope covers `/me/onenote/*`
 * endpoints (the user's personal notebooks); tenant-wide / shared
 * notebooks are deferred to a follow-up slice if a real consumer asks.
 * Same no-scope-bloat principle as Slice 6 (Outlook Mail) +
 * Slice 7 (Outlook Calendar) + Slice 8 (OneDrive).
 *
 * Mail-specific (`Mail.*`), Calendar-specific (`Calendars.*`),
 * Files-specific (`Files.*`), and Teams-specific scopes are NOT here
 * — each Microsoft provider declares only what its own actions /
 * triggers need.
 *
 * tokenScope: "user" matches every Microsoft + Google sibling
 * provider. One OneNote integration per (user, email).
 *
 * accountIdField: "email" — resolved from Graph `/me` (`mail` field
 * with `userPrincipalName` fallback for consumer accounts where the
 * mailbox isn't provisioned). Same shape as every Microsoft sibling.
 * Shared via `_shared/microsoft/api/me.ts`.
 *
 * Health-check interval: 6h matches every Microsoft + Google provider
 * (CLAUDE.md "Google/Microsoft: 6h").
 *
 * apiVersion: "v1.0" pins the Graph API version. Same as every
 * Microsoft sibling.
 *
 * refreshable: true — Microsoft's v2 OAuth issues refresh tokens when
 * `offline_access` is granted. Preserve-old policy on rotation
 * (shared via `_shared/microsoft/oauth.ts`).
 */
export const microsoftOneNoteManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "microsoft-onenote",
    displayName: "OneNote",
    isEnabled: true,
    apiVersion: "v1.0",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: ["offline_access", "Notes.ReadWrite"],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // False permanently — Microsoft Graph deprecated OneNote
      // subscriptions in May 2023. V2-native triggers use polling
      // (see pollingTrigger flag) — ONENOTE-5 flips that one.
      webhookTrigger: false,
      // True — ONENOTE-5 shipped `new_note` + `updated_note` section-
      // scoped polling triggers via the shared
      // `services/triggers/pollingRegistry` + 5-minute default cadence
      // (services/cron/pollingIntervals). Snapshot shape:
      // `{lastSeenCreatedDateTime}` for new_note,
      // `{lastSeenModifiedDateTime}` for updated_note.
      pollingTrigger: true,
      // True — 12 action handlers ship in this slice.
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000,
    refreshable: true,
  });
