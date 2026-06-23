import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { filesList } from "../api/filesList";

/**
 * `google-drive:files` options resolver — CONFIG-FIELD-UX-SWEEP-2 (Scope C).
 *
 * Searchable FILE picker for the Drive action `fileId` fields
 * (`get_file_metadata`, `delete_file`, `move_file`). Sibling of
 * `google-drive:folders`; reuses the SAME `filesList` wrapper + the
 * already-granted Drive read scope (no new scope, no new transport).
 *
 * METADATA ONLY: the resolver reads `files(id,name,mimeType)` and returns
 * `{ value: <file id>, label: <file name> }`. It NEVER requests or returns
 * file bytes / content / webContentLink — only the id + display name.
 *
 *   - `requiresIntegration: true` — the route loads an active Drive
 *     integration row first; wrapped in `refreshAndRetry`.
 *   - No `requiredDeps` — account-scoped, opens against the connected Drive.
 *   - Folders are excluded (they have their own `google-drive:folders`
 *     picker); only non-folder files are listed.
 *   - `q` is pushed server-side via Drive's `name contains` (title match
 *     only — NOT `fullText`, so file CONTENT is never searched), keeping
 *     the single bounded page relevant.
 *   - Sorted `modifiedTime desc` (most-recent first — what authors usually
 *     want when picking a file to act on).
 *
 * Error sanitization mirrors `google-drive:folders`: auth/disconnect →
 * `INTEGRATION_DISCONNECTED` (reconnect prompt); anything else →
 * `PROVIDER_ERROR`. Never logs the access token or echoes raw Drive bodies.
 */

const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const PAGE_SIZE = 200;

export const googleDriveFilesResolver: OptionsResolver = {
  source: "google-drive:files",
  provider: "google-drive",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Drive integration. Connect Google Drive first.",
      );
    }
    const integration = ctx.integration;
    const q = ctx.q.trim();

    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "google-drive",
        providerAccountId: null,
        apiCall: (accessToken) =>
          filesList({
            accessToken,
            pageSize: PAGE_SIZE,
            orderBy: "modifiedTime desc",
            fields: "files(id,name,mimeType),nextPageToken",
            ...(q.length > 0 && { nameContains: q }),
          }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Drive and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Google Drive files. Try again.",
      );
    }

    const rawFiles = Array.isArray(page.files) ? page.files : [];
    const items: Array<{ value: string; label: string }> = [];
    for (const raw of rawFiles) {
      const file = raw as { id?: unknown; name?: unknown; mimeType?: unknown };
      const id = typeof file.id === "string" ? file.id : null;
      const name = typeof file.name === "string" ? file.name : null;
      if (!id || id.length === 0) continue;
      if (!name || name.length === 0) continue;
      // Folders have their own picker — exclude them from the file list.
      if (file.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE) continue;
      items.push({ value: id, label: name });
    }

    return {
      items,
      hasMore: rawFiles.length >= PAGE_SIZE,
    };
  },
};
