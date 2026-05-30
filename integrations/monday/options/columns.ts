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
import { columnsList } from "@/integrations/_shared/monday/api/columnsList";

/**
 * `monday:columns` options resolver — Slice 3.MONDAY-3.
 *
 * Board-scoped Monday picker. Backs the `columnId` cascade field on
 * `update_item` (MONDAY-4 action metas).
 *
 * Architecture mirrors `monday:groups`:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["boardId"]` — dep name preserved verbatim from
 *     V1 (camelCase). Route short-circuits with `MISSING_DEPENDENCY`
 *     before dispatch.
 *
 * Cascade fallback: empty `boards` array → empty `items` (mirrors
 * groups / OneNote sections).
 *
 * Mapping (Monday column → OptionItem):
 *   - `value`: `id` (Monday column id; matches the
 *     `change_multiple_column_values` mutation key).
 *   - `label`: `title` when non-empty, else the id as fallback.
 *   - `description`: column `type` (e.g. `"status"`, `"text"`,
 *     `"person"`). Helps workflow authors target the right column
 *     type for their update_item payload — the V2 textarea doesn't
 *     yet have a column-aware editor (D-MON7 future polish), so
 *     surfacing the type in the picker is the v1 UX hint.
 */

export const mondayColumnsResolver: OptionsResolver = {
  source: "monday:columns",
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

    const integration = ctx.integration;

    const boardId = ctx.deps.boardId;
    if (typeof boardId !== "string" || boardId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a board first.",
      );
    }

    const providerAccountId = integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "monday",
        providerAccountId,
        apiCall: (accessToken) => columnsList({ accessToken, boardId }),
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
        "Couldn't load Monday columns. Try again.",
      );
    }

    if (!result.boardFound) {
      return { items: [], hasMore: false };
    }

    const mapped: Array<{
      value: string;
      label: string;
      description?: string;
    }> = [];
    for (const c of result.columns) {
      if (typeof c.id !== "string" || c.id.length === 0) continue;
      const label =
        typeof c.title === "string" && c.title.length > 0 ? c.title : c.id;
      const description =
        typeof c.type === "string" && c.type.length > 0 ? c.type : undefined;
      mapped.push(
        description !== undefined
          ? { value: c.id, label, description }
          : { value: c.id, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    // Preserve API-returned column order — Monday returns columns in
    // board-display order (first column is the Name column, etc.).
    // Alphabetical sort would obscure the natural board structure.
    return {
      items: filtered,
      hasMore: false,
    };
  },
};
