import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/_shared/dropbox/errors";
import { filesListFolder } from "@/integrations/_shared/dropbox/api/filesListFolder";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";

/**
 * `dropbox:files` options resolver — Slice 3.DROPBOX-3.
 *
 * Folder-scoped file picker. Lists the FILES directly inside a folder
 * (non-recursive). Backs the file-targeted fields on the future
 * DROPBOX-4 action metas (download / metadata / shared-link / temp-link)
 * via a folder → file cascade.
 *
 * **Path-as-value (DROPBOX-1 D-DB6):** option `value` is the file's
 * Dropbox path (`path_display`); `label` is the file name; `description`
 * surfaces size + modified date as a disambiguation hint.
 *
 * **Dependency: `path` (DROPBOX-1):** `requiredDeps: ["path"]` — the
 * parent FOLDER path field. Dep is named `path` (Dropbox is path-based;
 * NOT a synthetic `folderId`). The route validates `deps.path` is present
 * + non-empty BEFORE dispatch.
 *
 * **Root limitation (documented):** the options route drops empty /
 * whitespace dep values, so the Dropbox **root** (path `""`) cannot be
 * passed as the `path` dep — the file picker requires a non-root folder.
 * Root-level files are reached by typing the file path directly into the
 * action's `path` field; the picker is a convenience for nested folders.
 *
 * Architecture mirrors `monday:columns` (dep-based picker with cascade
 * fallback):
 *   - `requiresIntegration: true`.
 *   - `refreshAndRetry({ provider: "dropbox", accountId })`.
 *   - Missing / deleted folder (`NotFoundError`) → empty `items`
 *     (cascade fallback — same as Monday columns / OneNote sections).
 *
 * Sort: alphabetical by label. `q`: client-side case-insensitive
 * substring on the label.
 *
 * Error sanitization: never leaks token / refresh token / client secret /
 * raw Dropbox body / temporary or shared links / bytes — static
 * caller-friendly messages only.
 */

const PAGE_SIZE = 2000;

function humanizeBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatDescription(
  sizeBytes: number | null,
  serverModified: string | null,
): string | undefined {
  const parts: string[] = [];
  if (sizeBytes !== null) parts.push(humanizeBytes(sizeBytes));
  const date =
    serverModified !== null && /^\d{4}-\d{2}-\d{2}/.test(serverModified)
      ? serverModified.slice(0, 10)
      : null;
  if (date) parts.push(date);
  return parts.length > 0 ? parts.join(" — ") : undefined;
}

export const dropboxFilesResolver: OptionsResolver = {
  source: "dropbox:files",
  provider: "dropbox",
  requiresIntegration: true,
  requiredDeps: ["path"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Dropbox integration. Connect Dropbox first.",
      );
    }

    const path = ctx.deps.path;
    if (typeof path !== "string") {
      // Belt-and-suspenders: the route already enforces requiredDeps.
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a folder first.",
      );
    }

    const accountId = ctx.integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "dropbox",
        accountId,
        apiCall: (accessToken) =>
          filesListFolder({
            accessToken,
            path,
            recursive: false,
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
      if (err instanceof NotFoundError) {
        // Deleted / missing folder — cascade fallback to empty.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Dropbox files. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const e of result.entries) {
      if (e[".tag"] !== "file") continue;
      const n = normalizeDropboxEntry(e);
      if (n.path === null || n.name === null) continue;
      const description = formatDescription(n.sizeBytes, n.serverModified);
      items.push(
        description !== undefined
          ? { value: n.path, label: n.name, description }
          : { value: n.path, label: n.name },
      );
    }

    items.sort((a, b) =>
      a.label.toLowerCase() < b.label.toLowerCase()
        ? -1
        : a.label.toLowerCase() > b.label.toLowerCase()
          ? 1
          : 0,
    );

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((i) => i.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
