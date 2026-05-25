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
import { itemsListSummary } from "@/integrations/_shared/monday/api/itemsListSummary";

/**
 * `monday:items` options resolver — Slice 3.MONDAY-3.
 *
 * Board-scoped Monday picker. Backs the `itemId` cascade field on
 * `update_item`, `delete_item`, `move_item`, `create_update`,
 * `create_subitem` (parentItemId), `get_item` (MONDAY-4 metas).
 *
 * Architecture mirrors `monday:groups` / `monday:columns`:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["boardId"]` — V1-preserved camelCase dep name.
 *   - Wrapper through `refreshAndRetry`.
 *
 * Pagination: single page of 100 (`itemsListSummary` PAGE_SIZE). Monday
 * boards can carry thousands of items; the picker shows the first 100
 * and sets `hasMore: cursor !== null` so the renderer surfaces a
 * refinement hint. The v1 picker filters within the fetched page; if
 * a real consumer needs deeper traversal, a follow-up slice can add
 * cursored picker pagination (the underlying wrapper already supports
 * it).
 *
 * Mapping (Monday item → OptionItem):
 *   - `value`: `id` (Monday item id).
 *   - `label`: `name` when non-empty, else the id as fallback.
 *   - description: omitted — minimal picker shape.
 *
 * Sort: API-returned order preserved. Monday returns items in their
 * board-display order (most recently-created first within a group);
 * alphabetical re-sort would lose that signal.
 */

const PAGE_SIZE = 100;

export const mondayItemsResolver: OptionsResolver = {
  source: "monday:items",
  provider: "monday",
  requiresIntegration: true,
  requiredDeps: ["boardId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Monday integration. Connect Monday first.",
      );
    }

    const boardId = ctx.deps.boardId;
    if (typeof boardId !== "string" || boardId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a board first.",
      );
    }

    const accountId = ctx.integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "monday",
        accountId,
        apiCall: (accessToken) =>
          itemsListSummary({ accessToken, boardId, limit: PAGE_SIZE }),
      });
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
        "Couldn't load Monday items. Try again.",
      );
    }

    if (!result.boardFound) {
      return { items: [], hasMore: false };
    }

    const mapped: Array<{ value: string; label: string }> = [];
    for (const it of result.items) {
      if (typeof it.id !== "string" || it.id.length === 0) continue;
      const label =
        typeof it.name === "string" && it.name.length > 0 ? it.name : it.id;
      mapped.push({ value: it.id, label });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    return {
      items: filtered,
      hasMore: result.cursor !== null,
    };
  },
};
