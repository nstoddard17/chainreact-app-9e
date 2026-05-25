import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Google Sheets provider manifest.
 *
 * Capability flags follow the V2 honest-state convention — they flip true
 * only when a real handler/trigger lands. As of this slice (Slice 5 Commit 2
 * — manifest + OAuth + dispatcher registration), `oauth` is true and the
 * rest are still false. Subsequent commits in the same batch flip `actions`
 * (when the 5 action handlers register) and `webhookTrigger` (when the
 * watch-based `row_changed` trigger registers).
 *
 * Scopes — full Sheets + Drive metadata read-only + OIDC userinfo:
 *   - `spreadsheets` (read/write) — required for the Batch 1 surface
 *     (read_rows + append_row + update_row + clear_range +
 *     get_sheet_metadata). `spreadsheets.readonly` is too narrow for the
 *     write actions; the first time real users complain about consent
 *     breadth we can split into a read-only mode, but Batch 1 needs full
 *     read/write.
 *   - `drive.metadata.readonly` (Slice 3.GSHEETS-2) — required for the
 *     `google-sheets:spreadsheets` builder options resolver. The Sheets
 *     API has no "list spreadsheets" endpoint; spreadsheet enumeration
 *     happens via Drive's `files.list` filtered by spreadsheet mimeType.
 *     The metadata-only scope grants read access to file ids + names +
 *     modifiedTime (everything the picker needs) without exposing cell
 *     content — narrower than `drive.readonly` by design. Existing
 *     connected users need to reconnect to grant the new scope; the
 *     OAuth flow handles consent automatically.
 *   - `userinfo.email` is the OIDC scope that lets us identify the
 *     connected account at callback time via the OIDC userinfo endpoint
 *     (`oauth2.googleapis.com`). Sheets' own API doesn't expose a
 *     getProfile-like endpoint that works with `spreadsheets` alone, so
 *     userinfo is the cleanest source of the user's email — same pattern
 *     Calendar and Drive use.
 *
 * Watch transport (FYI for downstream code, not encoded in this manifest):
 *   - Sheets has no native push notifications. Slice 5 Commit 4's
 *     `row_changed` trigger uses Drive's `files.watch` against the
 *     spreadsheet's fileId (V1 confirmed). The capability flag
 *     `webhookTrigger: true` is honest because a watch IS registered;
 *     the fact that it rides Drive's API is an implementation detail.
 *
 * tokenScope: "user" matches Gmail / Calendar / Drive — one Sheets
 * integration per (user, email). A user with all four Google providers
 * connected has four separate integration rows under the same Google
 * identity.
 *
 * Health-check interval: 6h matches Gmail / Calendar / Drive (CLAUDE.md
 * "Google/Microsoft: 6h").
 */
export const googleSheetsManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "google-sheets",
    displayName: "Google Sheets",
    isEnabled: true,
    apiVersion: "v4",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // True: the watch-based row_changed trigger is registered via
      // integrations/google-sheets/triggers/rowChanged/index.ts (it
      // wires activation, deactivation, and subscription-renewal hooks).
      // The trigger uses Drive's files.watch transport because Sheets
      // has no native push notifications — see
      // docs/slices/slice-5-google-sheets.md for the design rationale.
      webhookTrigger: true,
      pollingTrigger: false,
      // True: 5 action handlers (read_rows, append_row, update_row,
      // clear_range, get_sheet_metadata) are registered in
      // services/execution/handlers/_registry.ts.
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000, // 6h
    refreshable: true,
  });
