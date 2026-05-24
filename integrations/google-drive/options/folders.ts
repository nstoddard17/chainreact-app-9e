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
 * `google-drive:folders` options resolver — Slice 3.GDOCS-3.
 *
 * Account-scoped folder picker. Intentionally lives under Google Drive
 * options (not Google Docs) so future Google Workspace metadata
 * surfaces — Drive's own actions, Sheets-create-into-folder, Docs-
 * create-into-folder, future Slides actions — can all reuse the same
 * resolver key (`google-drive:folders`) rather than duplicating folder
 * pickers per provider tree.
 *
 * The resolver enumerates Drive files filtered by the folder mimeType
 * (`application/vnd.google-apps.folder`) and `trashed=false`. Uses the
 * shared `integrations/google-drive/api/filesList.ts` wrapper (extended
 * in this slice to accept `mimeType` + `orderBy`).
 *
 * Architecture:
 *   - `requiresIntegration: true` — the route loads an active Google
 *     Drive integration row before invocation. Users connecting Google
 *     Docs ALSO get a Drive token via the shared Google identity flow
 *     (per `services/oauth/dispatcher.ts`), but the resolver guards
 *     against a missing Drive row defensively.
 *   - No `requiredDeps` — folders are account-scoped; the picker opens
 *     against the connected Drive root. (A future
 *     `google-drive:folders_in` resolver with `parentFolderId` dep can
 *     support drill-down; deferred until a real consumer asks for it.)
 *   - Wraps the Drive call in `refreshAndRetry({provider: "google-drive",
 *     accountId: null})`.
 *
 * Mapping (Drive file → OptionItem):
 *   - `value`: folder id.
 *   - `label`: folder name.
 *   - `description`: omitted. The Slack channels resolver pattern
 *     surfaces purpose; the Sheets / Docs document resolvers surface
 *     modifiedTime. For folders, `modifiedTime` reflects last-add /
 *     last-rename and is rarely useful to the picker — folders tend
 *     to be long-lived structural objects. Including it would be
 *     noise.
 *
 * Pagination:
 *   - `pageSize: 200` — matches the sibling Docs / Sheets resolvers.
 *   - `hasMore: true` when the result hits the 200 cap (same
 *     page-cap-based semantic documented in `documents.ts`).
 *
 * Sort order: `orderBy: "name"`. Drive's default sort for `files.list`
 * is unspecified; explicit alphabetical sort keeps the picker stable
 * across requests and matches user expectations for a folder list.
 *
 * Client-side `q` filter — case-insensitive substring match on the
 * label. Same shape as the sibling resolvers.
 *
 * Error sanitization mirrors `google-docs:documents`:
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error`
 *     → `INTEGRATION_DISCONNECTED` with a Drive reconnect prompt.
 *   - Anything else → `PROVIDER_ERROR` with a sanitized message.
 *   - Never logs the access token, never echoes raw Drive bodies.
 */

const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const PAGE_SIZE = 200;

export const googleDriveFoldersResolver: OptionsResolver = {
  source: "google-drive:folders",
  provider: "google-drive",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Drive integration. Connect Google Drive first.",
      );
    }

    let page;
    try {
      page = await refreshAndRetry({
        userId: ctx.userId,
        provider: "google-drive",
        accountId: null,
        apiCall: (accessToken) =>
          filesList({
            accessToken,
            mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
            pageSize: PAGE_SIZE,
            orderBy: "name",
            fields: "files(id,name),nextPageToken",
          }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Drive and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Drive and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Google Drive folders. Try again.",
      );
    }

    const rawFiles = Array.isArray(page.files) ? page.files : [];
    const items: Array<{ value: string; label: string }> = [];
    for (const raw of rawFiles) {
      const id =
        typeof (raw as { id?: unknown }).id === "string"
          ? ((raw as { id: string }).id)
          : null;
      const name =
        typeof (raw as { name?: unknown }).name === "string"
          ? ((raw as { name: string }).name)
          : null;
      if (!id || id.length === 0) continue;
      if (!name || name.length === 0) continue;
      items.push({ value: id, label: name });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return {
      items: filtered,
      hasMore: rawFiles.length >= PAGE_SIZE,
    };
  },
};
