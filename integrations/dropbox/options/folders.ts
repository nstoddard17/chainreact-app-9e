import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { filesListFolder } from "@/integrations/_shared/dropbox/api/filesListFolder";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";

/**
 * `dropbox:folders` options resolver — Slice 3.DROPBOX-3.
 *
 * Account-scoped, top-level Dropbox folder picker (no deps). Backs the
 * destination-folder fields on the future DROPBOX-4 action metas
 * (upload destination, the UI-scope folder parent for the `dropbox:files`
 * cascade, etc.).
 *
 * **Path-as-value (DROPBOX-1 D-DB6):** Dropbox identifies resources by
 * PATH, not id — each option's `value` is the folder's Dropbox path
 * (`path_display`), `label` is the folder name. A synthetic **Root**
 * option (`value: ""`, the Dropbox root convention) is prepended so
 * workflows can target the top level.
 *
 * **Recursive, single bounded page (DROPBOX-1 §4):** lists from root with
 * `recursive: true` so nested folders are pickable, capped to one page of
 * `PAGE_SIZE` (Dropbox's `list_folder` max). `hasMore` is always `false`
 * — the picker is a single page; authors refine via `q`. Follow-up: if
 * folder-heavy accounts overflow the page, switch to cursor pagination or
 * lazy per-level loading.
 *
 * Architecture mirrors `monday:boards` (top-level account-scoped picker):
 *   - `requiresIntegration: true` — route short-circuits with
 *     `INTEGRATION_DISCONNECTED` if no active Dropbox row.
 *   - No `requiredDeps`.
 *   - `refreshAndRetry({ provider: "dropbox", accountId })` so a stale
 *     access token triggers exactly one refresh + retry.
 *
 * Sort: alphabetical by label; Root stays pinned first. `q`: client-side
 * case-insensitive substring on the label.
 *
 * Error sanitization (never leaks token / refresh token / client secret /
 * raw Dropbox body / paths / temporary or shared links / bytes):
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error` →
 *     `INTEGRATION_DISCONNECTED`.
 *   - anything else → `PROVIDER_ERROR` with a static message. The shared
 *     request layer already strips the raw body from its errors.
 */

const PAGE_SIZE = 2000;

export const dropboxFoldersResolver: OptionsResolver = {
  source: "dropbox:folders",
  provider: "dropbox",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Dropbox integration. Connect Dropbox first.",
      );
    }

    const integration = ctx.integration;

    const providerAccountId = integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "dropbox",
        providerAccountId,
        apiCall: (accessToken) =>
          filesListFolder({
            accessToken,
            path: "",
            recursive: true,
            limit: PAGE_SIZE,
          }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Dropbox and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Dropbox and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Dropbox folders. Try again.",
      );
    }

    const folderItems: Array<{ value: string; label: string }> = [];
    for (const e of result.entries) {
      if (e[".tag"] !== "folder") continue;
      const n = normalizeDropboxEntry(e);
      if (n.path === null || n.name === null) continue;
      folderItems.push({ value: n.path, label: n.name });
    }
    folderItems.sort((a, b) =>
      a.label.toLowerCase() < b.label.toLowerCase()
        ? -1
        : a.label.toLowerCase() > b.label.toLowerCase()
          ? 1
          : 0,
    );

    // Root pinned first (Dropbox root path is the empty string).
    let items: Array<{ value: string; label: string }> = [
      { value: "", label: "Root" },
      ...folderItems,
    ];

    const lowerQ = ctx.q.toLowerCase();
    if (lowerQ.length > 0) {
      items = items.filter((i) => i.label.toLowerCase().includes(lowerQ));
    }

    return { items, hasMore: false };
  },
};
