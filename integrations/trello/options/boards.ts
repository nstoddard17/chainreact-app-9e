import { decryptToken } from "@/core/encryption/tokens";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { boardsList } from "@/integrations/trello/api/boardsList";
import {
  filterByLabel,
  mapTrelloOptionsError,
  requireTrelloIntegration,
} from "./_shared";

/**
 * `trello:boards` options resolver — Slice 4.TRELLO-META-2.
 *
 * Account-scoped top-level picker (no deps). The cascade ROOT every
 * Trello action's `boardId` hangs off — the UI-scope `boardId` field
 * added to the 6 card-targeted actions in TRELLO-META-3, the real
 * `create_list.idBoard` field, and all 6 webhook triggers' `boardId`.
 *
 * **Why a resolver is required (not optional polish):** a Trello board id
 * is an opaque 24-hex string a human cannot reasonably hand-type (same
 * rationale as Excel's `workbookId` / Airtable's `baseId`). Without this
 * picker the Trello builder is effectively unusable.
 *
 * **Auth:** Trello is non-refreshable; the resolver decrypts the stored
 * token and calls `boardsList` directly (mirrors the trigger `activate` +
 * Slack resolver pattern) — no `refreshAndRetry`.
 *
 * Mapping (board → OptionItem):
 *   - `value`: board `id` (the opaque id handlers/triggers consume).
 *   - `label`: `name` when non-empty, else `id` (defensive fallback).
 *   - `description`: `"Archived"` for a closed board — a safe, non-secret
 *     hint so authors don't pick a board their workflow can't act on.
 *     Board NAMES are titles in the user's own account, not secrets; card
 *     content is never read here.
 *
 * Ordering: **sorted by label (alphabetical)** — Trello's
 * `/members/me/boards` order has no strong meaning for a flat picker;
 * alpha sort aids findability in accounts with many boards (matches the
 * `airtable:bases` precedent; contrast the lists/cards resolvers, which
 * preserve Trello's order).
 *
 * `hasMore`: always `false` — the endpoint is unpaginated for a single
 * member.
 *
 * Error sanitization: `Unauthorized401Error` /
 * `IntegrationActionRequiredError` → `INTEGRATION_DISCONNECTED`; anything
 * else → `PROVIDER_ERROR`. The token / raw Trello body / request URL
 * never reach the browser.
 */
export const trelloBoardsResolver: OptionsResolver = {
  source: "trello:boards",
  provider: "trello",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireTrelloIntegration(ctx);
    const accessToken = decryptToken(integration.accessTokenEncrypted);

    let boards;
    try {
      boards = await boardsList({ accessToken });
    } catch (err) {
      mapTrelloOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const board of boards) {
      if (typeof board.id !== "string" || board.id.length === 0) continue;
      const label =
        typeof board.name === "string" && board.name.length > 0
          ? board.name
          : board.id;
      items.push(
        board.closed === true
          ? { value: board.id, label, description: "Archived" }
          : { value: board.id, label },
      );
    }

    const filtered = filterByLabel(items, ctx.q).sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    return { items: filtered, hasMore: false };
  },
};
