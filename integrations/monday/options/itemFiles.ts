import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import {
  itemFilesGet,
  type MondayAsset,
} from "@/integrations/_shared/monday/api/itemFilesGet";
import { assetsGet } from "@/integrations/_shared/monday/api/assetsGet";

/**
 * `monday:item_files` options resolver — Slice 3.MONDAY-5.
 *
 * Backs the OPTIONAL `fileId` field on the `download_file` action
 * (MONDAY-6 meta) — lets the workflow author pick a specific file/asset
 * on an item instead of always taking the first. The single resolver
 * gap MONDAY-5's audit found (the other 23 actions' picker fields are
 * covered by the 6 MONDAY-3 resolvers).
 *
 * Architecture mirrors `monday:groups` / `monday:columns` cascades but
 * with a TWO-dep cascade so the candidate set matches the
 * `download_file` handler's own asset resolution exactly:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["itemId", "columnId"]` — camelCase, V1-preserved.
 *     `columnId` is either a file-typed column id OR the
 *     `__item_files__` sentinel (the item's general files area), exactly
 *     as `download_file` consumes it.
 *
 * Asset resolution (mirrors `download_file`):
 *   - `columnId === "__item_files__"` → item-level assets + update assets.
 *   - specific file column → parse that column's `value` JSON for
 *     `files[].assetId`, resolve via `assets(ids:)`. Falls back to the
 *     item's general assets when the column carries none.
 *
 * Mapping (Monday asset → OptionItem):
 *   - `value`: asset `id`.
 *   - `label`: asset `name` when present, else the id.
 *   - `description`: `file_extension` when present (a lightweight type
 *     hint). NEVER the asset URL — file URLs are sensitive and never
 *     surface in the picker.
 *
 * Cascade fallback: a missing parent item (`itemFilesGet` returns null /
 * NotFoundError) yields empty `items` rather than throwing — re-picking
 * the parent item clears `fileId`. Same pattern as the board-scoped
 * resolvers.
 *
 * Error sanitization mirrors the other Monday resolvers — provider
 * bodies / tokens / file URLs never reach the browser.
 */

const ITEM_FILES_SENTINEL = "__item_files__";

interface AssetIdRef {
  assetIds: string[];
}

function parseFileColumnAssetIds(value: string | null): AssetIdRef {
  if (!value) return { assetIds: [] };
  try {
    const parsed = JSON.parse(value) as { files?: unknown };
    const files = Array.isArray(parsed.files) ? parsed.files : [];
    const assetIds: string[] = [];
    for (const f of files) {
      if (f && typeof f === "object") {
        const rec = f as Record<string, unknown>;
        const id = rec.assetId ?? rec.id;
        if (typeof id === "string" && id.length > 0) assetIds.push(id);
        else if (typeof id === "number") assetIds.push(String(id));
      }
    }
    return { assetIds };
  } catch {
    return { assetIds: [] };
  }
}

export const mondayItemFilesResolver: OptionsResolver = {
  source: "monday:item_files",
  provider: "monday",
  requiresIntegration: true,
  requiredDeps: ["itemId", "columnId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Monday integration. Connect Monday first.",
      );
    }

    const integration = ctx.integration;

    const itemId = ctx.deps.itemId;
    const columnId = ctx.deps.columnId;
    if (typeof itemId !== "string" || itemId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select an item first.",
      );
    }
    if (typeof columnId !== "string" || columnId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a file column first.",
      );
    }

    const providerAccountId = integration.providerAccountId;

    let candidates: MondayAsset[];
    try {
      const itemFiles = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "monday",
        providerAccountId,
        apiCall: (accessToken) => itemFilesGet({ accessToken, itemId }),
      });
      if (itemFiles === null) {
        // Parent item gone — empty picker (re-pick clears fileId).
        return { items: [], hasMore: false };
      }

      if (columnId === ITEM_FILES_SENTINEL) {
        candidates = [...itemFiles.assets, ...itemFiles.updateAssets];
      } else {
        const column = itemFiles.columnValues.find((c) => c.id === columnId);
        const { assetIds } = parseFileColumnAssetIds(column?.value ?? null);
        if (assetIds.length > 0) {
          candidates = await refreshAndRetry({
            accountId: integration.accountId,
            provider: "monday",
            providerAccountId,
            apiCall: (accessToken) => assetsGet({ accessToken, assetIds }),
          });
        } else {
          candidates = [...itemFiles.assets, ...itemFiles.updateAssets];
        }
      }
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Monday and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Monday and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Monday item files. Try again.",
      );
    }

    const mapped: Array<{
      value: string;
      label: string;
      description?: string;
    }> = [];
    for (const a of candidates) {
      if (typeof a.id !== "string" || a.id.length === 0) continue;
      const label =
        typeof a.name === "string" && a.name.length > 0 ? a.name : a.id;
      const description =
        typeof a.file_extension === "string" && a.file_extension.length > 0
          ? a.file_extension
          : undefined;
      mapped.push(
        description !== undefined
          ? { value: a.id, label, description }
          : { value: a.id, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    return {
      items: filtered,
      hasMore: false,
    };
  },
};
