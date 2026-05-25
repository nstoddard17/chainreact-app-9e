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
 * `monday:file_columns` options resolver — Slice 3.MONDAY-3.
 *
 * Board-scoped picker that backs the `columnId` field on V1's
 * `add_file` action (deferred to MONDAY-N — but the resolver lands
 * now per the standard so MONDAY-4 metas can reference the cascade
 * without churning the resolver registry later).
 *
 * Filters the shared `columnsList` payload to `type === "file"` AND
 * prepends the V1-preserved virtual `__item_files__` sentinel. The
 * sentinel represents "the item's general files area" (Monday's
 * built-in attachment surface on every item — distinct from a
 * file-typed column).
 *
 * Critical: workflow authors who configured V1's `add_file` action
 * for `__item_files__` would break if V2 dropped the sentinel. The
 * value string is preserved EXACTLY — never normalize / rename it.
 *
 * Architecture mirrors `monday:groups` / `monday:columns`:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["boardId"]` — V1-preserved camelCase dep name.
 *   - Wrapper through `refreshAndRetry` calling `columnsList`
 *     (deliberate reuse — same payload backs `monday:columns`).
 *
 * Output ordering: sentinel FIRST, then file-typed columns in
 * API-returned board order. The sentinel position is stable so the
 * picker's "default" / "most common" choice stays at the top.
 *
 * Cascade fallback: empty `boards` array → return ONLY the sentinel
 * (workflow authors can still target the general files area even if
 * the board has no file columns). Mirrors V1's behavior.
 */

const SENTINEL_VALUE = "__item_files__";
const SENTINEL_LABEL = "Item files (general)";
const SENTINEL_DESCRIPTION = "The item's built-in files area";

export const mondayFileColumnsResolver: OptionsResolver = {
  source: "monday:file_columns",
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

    const sentinel = {
      value: SENTINEL_VALUE,
      label: SENTINEL_LABEL,
      description: SENTINEL_DESCRIPTION,
    };

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "monday",
        accountId,
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
        // Cascade fallback — sentinel still available even if the
        // parent board went away (re-pick clears the cascade anyway).
        return { items: [sentinel], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Monday file columns. Try again.",
      );
    }

    // boardFound=false → board id invalid / no access → return only
    // the sentinel (matches V1's "no board" path).
    if (!result.boardFound) {
      return { items: [sentinel], hasMore: false };
    }

    const fileColumns: Array<{ value: string; label: string }> = [];
    for (const c of result.columns) {
      if (c.type !== "file") continue;
      if (typeof c.id !== "string" || c.id.length === 0) continue;
      const label =
        typeof c.title === "string" && c.title.length > 0 ? c.title : c.id;
      fileColumns.push({ value: c.id, label });
    }

    const lowerQ = ctx.q.toLowerCase();

    const merged: Array<{
      value: string;
      label: string;
      description?: string;
    }> = [sentinel, ...fileColumns];

    const filtered =
      lowerQ.length > 0
        ? merged.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : merged;

    return {
      items: filtered,
      hasMore: false,
    };
  },
};
