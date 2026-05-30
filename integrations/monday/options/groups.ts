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
import { groupsList } from "@/integrations/_shared/monday/api/groupsList";

/**
 * `monday:groups` options resolver — Slice 3.MONDAY-3.
 *
 * Board-scoped Monday picker. Backs the `groupId` cascade field on
 * future Monday action metas (MONDAY-4) — `create_item`, `move_item`.
 *
 * Architecture mirrors `microsoft-onenote:sections`:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["boardId"]` — route validates + short-circuits
 *     with `MISSING_DEPENDENCY` before dispatch. Dep name preserved
 *     verbatim from V1 (camelCase, NOT snake_case `board_id`).
 *   - Wrapper through `refreshAndRetry({provider: "monday", providerAccountId:
 *     ctx.integration.accountId})`.
 *
 * Cascade fallback: Monday returns an empty `boards` array (not a
 * GraphQL error) when the board id is unknown or no longer accessible.
 * We treat that as empty `items` rather than throw — the workflow
 * author's natural next move is to re-pick the parent board, and the
 * cascade clears `groupId` automatically when they do. Mirrors the
 * `NotFoundError → empty items` pattern from OneNote / Mailchimp.
 *
 * Sort: alphabetical by label client-side. Monday doesn't return
 * groups in a meaningful order; alphabetical is the natural UX.
 *
 * Mapping (Monday group → OptionItem):
 *   - `value`: `id` (Monday group id — note: group id is a `String`,
 *     NOT an `ID`, in the GraphQL schema, matching the MONDAY-2
 *     `create_item` mutation arg type).
 *   - `label`: `title` when non-empty, else the id as fallback.
 *   - description: omitted — groups don't carry useful side data.
 *
 * Error sanitization mirrors `monday:boards`.
 */

export const mondayGroupsResolver: OptionsResolver = {
  source: "monday:groups",
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
        apiCall: (accessToken) => groupsList({ accessToken, boardId }),
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
        // Parent board id no longer exists — empty picker. Re-picking
        // the board clears `groupId` and triggers a fresh fetch.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Monday groups. Try again.",
      );
    }

    // boardFound=false → board id invalid / no access → cascade empty.
    if (!result.boardFound) {
      return { items: [], hasMore: false };
    }

    const mapped: Array<{ value: string; label: string }> = [];
    for (const g of result.groups) {
      if (typeof g.id !== "string" || g.id.length === 0) continue;
      const label =
        typeof g.title === "string" && g.title.length > 0 ? g.title : g.id;
      mapped.push({ value: g.id, label });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    const sorted = [...filtered].sort((a, b) =>
      a.label.toLowerCase() < b.label.toLowerCase()
        ? -1
        : a.label.toLowerCase() > b.label.toLowerCase()
          ? 1
          : 0,
    );

    return {
      items: sorted,
      hasMore: false,
    };
  },
};
