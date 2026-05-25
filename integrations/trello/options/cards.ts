import { decryptToken } from "@/core/encryption/tokens";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { cardsList } from "@/integrations/trello/api/cardsList";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";
import {
  filterByLabel,
  mapTrelloOptionsError,
  requireTrelloIntegration,
  requireDep,
} from "./_shared";

/**
 * `trello:cards` options resolver — Slice 4.TRELLO-META-2.
 *
 * Backs the `cardId` field on `update_card` / `move_card` / `archive_card`
 * / `add_comment` / `add_label_to_card`. Single-parent cascade off
 * `boardId`. `cardId` also commonly flows from an upstream trigger, so
 * this picker is a convenience — it stays bounded.
 *
 * **Bounded by design.** A busy board can hold thousands of open cards.
 * The helper fetches one page (`filter=open`, `limit=CARDS_PAGE_LIMIT`)
 * and the resolver caps output at `CARDS_PAGE_LIMIT` + sets `hasMore`
 * when the page was truncated — so output is bounded even if a Trello
 * version ignores `limit`. Authors refine with the search box (`q`).
 *
 * **No card body content is exposed.** Only `id` / `name` / `due` are
 * read. Card descriptions, comments, and attachment URLs are NEVER
 * fetched or surfaced.
 *
 * Mapping (card → OptionItem):
 *   - `value`: card `id` (opaque).
 *   - `label`: `name` when non-empty, else `id`.
 *   - `description`: `"Due <iso>"` when the card has a due date — safe,
 *     non-secret scheduling metadata.
 *
 * Ordering: **preserves Trello's order** (the order Trello returns open
 * cards in).
 *
 * Cascade fallback: a deleted / access-lost board → `TrelloNotFoundError`
 * → empty items.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; other →
 * `PROVIDER_ERROR`. No token / raw body / card-content leakage.
 */

/** Page cap — one bounded page of open cards per board. */
export const CARDS_PAGE_LIMIT = 200;

export const trelloCardsResolver: OptionsResolver = {
  source: "trello:cards",
  provider: "trello",
  requiresIntegration: true,
  requiredDeps: ["boardId"],
  async resolve(ctx) {
    const integration = requireTrelloIntegration(ctx);
    const boardId = requireDep(ctx, "boardId", "board");
    const accessToken = decryptToken(integration.accessTokenEncrypted);

    let cards;
    try {
      cards = await cardsList({ accessToken, boardId, limit: CARDS_PAGE_LIMIT });
    } catch (err) {
      if (err instanceof TrelloNotFoundError) {
        return { items: [], hasMore: false };
      }
      mapTrelloOptionsError(err);
    }

    const mapped: OptionItem[] = [];
    for (const card of cards) {
      if (typeof card.id !== "string" || card.id.length === 0) continue;
      const label =
        typeof card.name === "string" && card.name.length > 0
          ? card.name
          : card.id;
      mapped.push(
        typeof card.due === "string" && card.due.length > 0
          ? { value: card.id, label, description: `Due ${card.due}` }
          : { value: card.id, label },
      );
    }

    // Bound the output even if Trello ignored `limit`; `hasMore` signals
    // the author to refine with search.
    const truncated = mapped.length > CARDS_PAGE_LIMIT;
    const capped = mapped.slice(0, CARDS_PAGE_LIMIT);

    return { items: filterByLabel(capped, ctx.q), hasMore: truncated };
  },
};
