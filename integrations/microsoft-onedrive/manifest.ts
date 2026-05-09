import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Microsoft OneDrive provider manifest.
 *
 * Sibling to `microsoft-outlook` (Slice 6 mail) and
 * `microsoft-outlook-calendar` (Slice 7). All three share the same Azure
 * AD app — `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` env vars
 * cover every Microsoft surface; each provider has its own redirect URI
 * and scope set; users grant / revoke each independently.
 *
 * Per-surface split rationale documented in
 * `docs/slices/slice-7-outlook-calendar.md` §"Provider-id decision" and
 * carried forward in `docs/slices/slice-8-onedrive.md`. Slice 8 is the
 * third Microsoft consumer of `_shared/microsoft/`; the abstraction
 * extracted in Slice 7 is exercised here without modification.
 *
 * Capability flags follow the V2 honest-state convention — they flip
 * true only when a real handler/trigger lands. As of this commit
 * (Slice 8 Commit 2 — manifest + OAuth + dispatcher registration),
 * `oauth` is true and the rest are false. Subsequent commits flip
 * `actions` (Commit 3 — 7 OneDrive actions) and `webhookTrigger`
 * (Commit 4 — `file_changed` subscription trigger).
 *
 * Scopes — exactly two:
 *   - `offline_access` — required for the Microsoft v2 endpoint to
 *     issue a refresh_token. Without it tokens last 60-90 minutes and
 *     the integration goes cold.
 *   - `Files.ReadWrite` — required by all 7 actions (upload_file,
 *     get_file, create_folder, delete_item, move_item, copy_item,
 *     list_items) and by the file_changed trigger. Microsoft's
 *     permissions are hierarchical: `Files.ReadWrite` includes
 *     `Files.Read`, so we don't request both.
 *
 * Slice 8 deliberately uses `Files.ReadWrite` — NOT V1's
 * `Files.ReadWrite.All`. The narrower scope covers the user's personal
 * drive (the `/me/drive` endpoint family); SharePoint sites and shared
 * drives are deferred to a follow-up slice. Same no-scope-bloat
 * principle as Slice 6 + 7.
 *
 * Mail-specific scopes (`Mail.Send`, `Mail.Read`) and Calendar-specific
 * (`Calendars.ReadWrite`) are NOT here — each Microsoft provider
 * declares only what its own actions / triggers need.
 *
 * tokenScope: "user" matches every Microsoft + Google sibling provider.
 * One OneDrive integration per (user, email).
 *
 * accountIdField: "email" — resolved from Graph `/me` (`mail` field
 * with `userPrincipalName` fallback for consumer accounts where the
 * mailbox isn't provisioned). Same shape as Slice 6 + 7. Shared via
 * `_shared/microsoft/api/me.ts`.
 *
 * Health-check interval: 6h matches every Microsoft + Google provider
 * (CLAUDE.md "Google/Microsoft: 6h").
 *
 * apiVersion: "v1.0" pins the Graph API version. Same as Slice 6 + 7.
 *
 * refreshable: true — Microsoft's v2 OAuth issues refresh tokens when
 * `offline_access` is granted. Preserve-old policy on rotation
 * (shared with Slice 6 + 7 via `_shared/microsoft/oauth.ts`).
 *
 * /me access via Files.ReadWrite: Microsoft Graph grants
 * `/me?$select=mail,userPrincipalName,id` whenever any delegated
 * permission is granted (`userPrincipalName` is part of the sign-in
 * identity). If a real Azure AD tenant requires explicit `User.Read`
 * for /me, we add it in a follow-up — Slice 8 follows the Slice 6 + 7
 * minimum-scope precedent.
 */
export const microsoftOneDriveManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "microsoft-onedrive",
    displayName: "Microsoft OneDrive",
    isEnabled: true,
    apiVersion: "v1.0",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: ["offline_access", "Files.ReadWrite"],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // Flipped to true in Slice 8 Commit 4 when the file_changed
      // subscription trigger + webhook receiver land.
      webhookTrigger: false,
      pollingTrigger: false,
      // True: 7 action handlers (upload_file, get_file, create_folder,
      // delete_item, move_item, copy_item, list_items) are registered
      // in services/execution/handlers/_registry.ts.
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000, // 6h
    refreshable: true,
  });
