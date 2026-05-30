import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { boardsList } from "@/integrations/_shared/monday/api/boardsList";

/**
 * `monday:boards` options resolver — Slice 3.MONDAY-3.
 *
 * Top-level Monday picker. Account-scoped (one boards list per
 * connected user). Backs the `boardId` cascade root on the future
 * Monday action metas (MONDAY-4) — `create_item`, `update_item`,
 * `delete_item`, `move_item`, `get_item`, `list_items`. The cascade
 * pattern mirrors `microsoft-onenote:notebooks` (top-level picker that
 * 90% of the provider's other resolvers depend on).
 *
 * Architecture:
 *   - `requiresIntegration: true` — route loads an active Monday
 *     integration via `getActiveForExecution(userId, "monday", null)`
 *     and short-circuits with `INTEGRATION_DISCONNECTED` if no row.
 *   - No `requiredDeps` — boards are account-scoped.
 *   - Wrapper through `refreshAndRetry({provider: "monday", providerAccountId:
 *     ctx.integration.accountId})` so a stale Monday access
 *     token triggers exactly one refresh + retry cycle.
 *
 * Sort: client-side alphabetical by label. Monday's `boards` GraphQL
 * field doesn't accept an `order_by` arg — V1 never sorted server-side
 * either. Alphabetical is the natural UX for a top-level picker.
 *
 * Pagination: single page of 100 (Monday's `boards` field uses
 * page-based pagination but 100 is the practical max for a top-level
 * picker — workflow authors with >100 boards refine via `q`).
 * `hasMore` is `false` because we don't paginate the picker; if a real
 * consumer needs cursored picker, follow-up work can add it.
 *
 * Mapping (Monday board → OptionItem):
 *   - `value`: `id` (numeric Monday board id as string).
 *   - `label`: `name` when non-empty, else the id as fallback.
 *   - `description`: `board_kind` + `updated_at` date when both
 *     available, e.g. "public — updated 2026-05-24". Falls back to
 *     just the date or just the kind when one is missing. Omitted
 *     when neither is present.
 *
 * Client-side `q` filter: case-insensitive substring on the label.
 *
 * Error sanitization:
 *   - `IntegrationActionRequiredError` → `INTEGRATION_DISCONNECTED`.
 *   - Leaked `Unauthorized401Error` → `INTEGRATION_DISCONNECTED`.
 *   - Any other error from the wrapper (provider 4xx/5xx, network
 *     failure, decode failure) → `PROVIDER_ERROR` with a static
 *     caller-friendly message. The shared GraphQL request layer
 *     already strips the raw response body from its error messages.
 */

const PAGE_SIZE = 100;

function formatDescription(
  boardKind: string | null,
  updatedAt: string | null,
): string | undefined {
  const datePart =
    typeof updatedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(updatedAt)
      ? updatedAt.slice(0, 10)
      : null;
  if (boardKind && datePart) return `${boardKind} — updated ${datePart}`;
  if (boardKind) return boardKind;
  if (datePart) return `updated ${datePart}`;
  return undefined;
}

export const mondayBoardsResolver: OptionsResolver = {
  source: "monday:boards",
  provider: "monday",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Monday integration. Connect Monday first.",
      );
    }

    const integration = ctx.integration;

    const providerAccountId = integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "monday",
        providerAccountId,
        apiCall: (accessToken) =>
          boardsList({ accessToken, limit: PAGE_SIZE, page: 1 }),
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
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Monday boards. Try again.",
      );
    }

    const mapped: Array<{
      value: string;
      label: string;
      description?: string;
    }> = [];
    for (const b of result.boards) {
      if (typeof b.id !== "string" || b.id.length === 0) continue;
      const label =
        typeof b.name === "string" && b.name.length > 0 ? b.name : b.id;
      const description = formatDescription(b.board_kind, b.updated_at);
      mapped.push(
        description !== undefined
          ? { value: b.id, label, description }
          : { value: b.id, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    // Alphabetical sort by label — Monday's `boards` field doesn't
    // expose an order_by arg, so we sort client-side.
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
