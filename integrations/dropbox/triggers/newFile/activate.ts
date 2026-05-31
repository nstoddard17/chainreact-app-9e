import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { filesListFolderGetLatestCursor } from "@/integrations/_shared/dropbox/api/filesListFolderGetLatestCursor";
import { DropboxNewFileConfigSchema } from "./schema";

/**
 * Dropbox `new_file` activation hook — Slice 3.DROPBOX-5.
 *
 * Dropbox webhooks are app-level (one URL in the App Console) — there is
 * NO per-workflow `create_webhook` call. Activation's only job is to seed
 * the `list_folder` cursor for the configured folder so the FIRST webhook
 * reconciliation sees only files that arrive AFTER activation:
 *
 *   - `DropboxNewFileConfigSchema.parse` validates the configured `path`
 *     (must be root `""` or start with `/`). A bad path throws here →
 *     the orchestrator aborts the activate transition with
 *     TRIGGER_REGISTRATION_FAILED rather than persisting a broken trigger.
 *   - `/2/files/list_folder/get_latest_cursor` returns a cursor at the
 *     CURRENT state (no entries) — the "first poll miss" protection for
 *     the cursor model (existing files are never replayed).
 *   - The seeded `accountId` lets the webhook fan-out match inbound
 *     changed-account notifications to this row.
 *
 * The returned partial config is merged into the node's config before the
 * `trigger_resources` upsert (see `services/triggers/lifecycle.ts`).
 */
export const activate: ActivationFn = async ({ node, integration }) => {
  const config = DropboxNewFileConfigSchema.parse(node.config);

  const { cursor } = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "dropbox",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      filesListFolderGetLatestCursor({
        accessToken,
        path: config.path,
        recursive: config.recursive,
      }),
  });

  return {
    snapshot: {
      cursor,
      providerAccountId: integration.providerAccountId,
      capturedAt: new Date().toISOString(),
    },
  };
};
