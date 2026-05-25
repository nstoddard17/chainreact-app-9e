import { decryptToken } from "@/core/encryption/tokens";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { listsList } from "@/integrations/trello/api/listsList";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";
import {
  filterByLabel,
  mapTrelloOptionsError,
  requireTrelloIntegration,
  requireDep,
} from "./_shared";

/**
 * `trello:lists` options resolver — Slice 4.TRELLO-META-2.
 *
 * Backs `create_card.listId`, `move_card.idList`, and `update_card.idList`.
 * Single-parent cascade off `boardId`.
 *
 * **Dep name `boardId` is pinned verbatim** to the UI-scope field added in
 * TRELLO-META-3; the metadata fields wire `dependsOn: "boardId"`.
 *
 * Mapping (list → OptionItem):
 *   - `value`: list `id` (opaque; handlers consume the id).
 *   - `label`: `name` when non-empty, else `id`.
 *   - `description`: `"Archived"` for a closed list (safe hint).
 *
 * Ordering: **preserves Trello's order** — the list order mirrors the
 * left-to-right column order in the Trello board UI, which is meaningful
 * to authors.
 *
 * `hasMore`: `false` — a board's lists come back in one unpaginated page.
 *
 * Cascade fallback: if `boardId` points at a board deleted / access-lost
 * between picker mounts, `listsList` throws `TrelloNotFoundError` → return
 * empty `items` (NOT an error). Re-picking the board clears `listId`.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; other →
 * `PROVIDER_ERROR`. No token / raw body / card-content leakage.
 */
export const trelloListsResolver: OptionsResolver = {
  source: "trello:lists",
  provider: "trello",
  requiresIntegration: true,
  requiredDeps: ["boardId"],
  async resolve(ctx) {
    const integration = requireTrelloIntegration(ctx);
    const boardId = requireDep(ctx, "boardId", "board");
    const accessToken = decryptToken(integration.accessTokenEncrypted);

    let lists;
    try {
      lists = await listsList({ accessToken, boardId });
    } catch (err) {
      if (err instanceof TrelloNotFoundError) {
        return { items: [], hasMore: false };
      }
      mapTrelloOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const list of lists) {
      if (typeof list.id !== "string" || list.id.length === 0) continue;
      const label =
        typeof list.name === "string" && list.name.length > 0
          ? list.name
          : list.id;
      items.push(
        list.closed === true
          ? { value: list.id, label, description: "Archived" }
          : { value: list.id, label },
      );
    }

    return { items: filterByLabel(items, ctx.q), hasMore: false };
  },
};
