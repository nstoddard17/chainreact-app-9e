import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Google Drive provider manifest.
 *
 * Capability flags follow the V2 honest-state convention — they flip true
 * only when a real handler/trigger lands. As of this slice (Slice 4 Commit
 * 2 — manifest + OAuth + dispatcher registration), `oauth` is true and
 * the rest are still false. Subsequent commits in the same batch flip
 * `actions` (when the 5 action handlers register) and `webhookTrigger`
 * (when the watch-based `file_changed` trigger registers).
 *
 * Scopes — full Drive + OIDC userinfo:
 *   - `drive` (read/write/watch) — required for the Batch 1 surface
 *     (folder watches via `files.watch` on `'root'` or specific folder ids,
 *     plus write actions: upload_file, create_folder, move_file,
 *     delete_file). `drive.file` is too narrow (only files the app
 *     created); `drive.readonly` doesn't permit writes. The first time
 *     real users complain about consent breadth we can split into a
 *     read-only mode, but Batch 1 needs the full scope.
 *   - `userinfo.email` is the OIDC scope that lets us identify the
 *     connected account at callback time via the OIDC userinfo endpoint
 *     (`oauth2.googleapis.com`). Drive's own API doesn't expose a
 *     getProfile-like endpoint that works with `drive` alone, so userinfo
 *     is the cleanest source of the user's email — same pattern Calendar
 *     uses.
 *
 * tokenScope: "user" matches Gmail and Calendar — one Drive integration
 * per (user, email). A user with Gmail + Calendar + Drive connected has
 * three separate integration rows under the same Google identity.
 *
 * Health-check interval: 6h matches Gmail and Calendar (CLAUDE.md
 * "Google/Microsoft: 6h").
 */
export const googleDriveManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "google-drive",
    displayName: "Google Drive",
    isEnabled: true,
    apiVersion: "v3",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // Flips true in Commit 4 once the watch-based file_changed trigger
      // is registered via integrations/google-drive/triggers/fileChanged/.
      webhookTrigger: false,
      pollingTrigger: false,
      // True: 5 action handlers (upload_file, create_folder, list_files,
      // move_file, delete_file) are registered in
      // services/execution/handlers/_registry.ts.
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000, // 6h
    refreshable: true,
  });
