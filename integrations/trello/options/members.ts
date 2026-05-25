import { decryptToken } from "@/core/encryption/tokens";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { membersList } from "@/integrations/trello/api/membersList";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";
import {
  filterByLabelOrDescription,
  mapTrelloOptionsError,
  requireTrelloIntegration,
  requireDep,
} from "./_shared";

/**
 * `trello:members` options resolver — Slice 4.TRELLO-META-2.
 *
 * Backs the optional multi-value `create_card.idMembers` field.
 * Single-parent cascade off `boardId`.
 *
 * **Privacy:** the helper reads `id` / `fullName` / `username` only — NO
 * email. The resolver surfaces the display name + username; member emails
 * are never fetched or surfaced.
 *
 * Mapping (member → OptionItem):
 *   - `value`: member `id` (opaque).
 *   - `label`: `fullName` when non-empty, else `username`, else `id`.
 *   - `description`: `username` when the label came from `fullName` and a
 *     username exists (so the picker shows both name + @handle).
 *
 * `q` filtering matches `label` OR `description`, so authors can search by
 * full name OR username.
 *
 * Ordering: **preserves Trello's order** (board member order).
 *
 * `hasMore`: `false` — a board's member list is small + unpaginated.
 *
 * Cascade fallback: a deleted / access-lost board → `TrelloNotFoundError`
 * → empty items.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; other →
 * `PROVIDER_ERROR`. No token / raw body / email leakage.
 */
export const trelloMembersResolver: OptionsResolver = {
  source: "trello:members",
  provider: "trello",
  requiresIntegration: true,
  requiredDeps: ["boardId"],
  async resolve(ctx) {
    const integration = requireTrelloIntegration(ctx);
    const boardId = requireDep(ctx, "boardId", "board");
    const accessToken = decryptToken(integration.accessTokenEncrypted);

    let members;
    try {
      members = await membersList({ accessToken, boardId });
    } catch (err) {
      if (err instanceof TrelloNotFoundError) {
        return { items: [], hasMore: false };
      }
      mapTrelloOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const member of members) {
      if (typeof member.id !== "string" || member.id.length === 0) continue;
      const fullName =
        typeof member.fullName === "string" && member.fullName.length > 0
          ? member.fullName
          : null;
      const username =
        typeof member.username === "string" && member.username.length > 0
          ? member.username
          : null;
      if (fullName) {
        items.push(
          username
            ? { value: member.id, label: fullName, description: username }
            : { value: member.id, label: fullName },
        );
      } else if (username) {
        items.push({ value: member.id, label: username });
      } else {
        items.push({ value: member.id, label: member.id });
      }
    }

    return {
      items: filterByLabelOrDescription(items, ctx.q),
      hasMore: false,
    };
  },
};
