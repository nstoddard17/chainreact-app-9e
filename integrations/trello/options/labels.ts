import { decryptToken } from "@/core/encryption/tokens";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { labelsList } from "@/integrations/trello/api/labelsList";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";
import {
  filterByLabelOrDescription,
  mapTrelloOptionsError,
  requireTrelloIntegration,
  requireDep,
} from "./_shared";

/**
 * `trello:labels` options resolver — Slice 4.TRELLO-META-2.
 *
 * Backs `add_label_to_card.labelId` + the optional multi-value
 * `create_card.idLabels` field. Single-parent cascade off `boardId`. A
 * `labelId` is an opaque 24-hex id (not name-resolvable per the runtime
 * schemas), so this picker is required, not optional.
 *
 * Mapping (label → OptionItem):
 *   - `value`: label `id` (opaque).
 *   - `label`: `name` when non-empty, else the `color` (Trello labels can
 *     be color-only with an empty name), else `id`.
 *   - `description`: the `color` when present — a safe, non-secret hint
 *     (e.g. "green") that disambiguates same-named or unnamed labels.
 *
 * `q` filtering matches `label` OR `description`, so authors can search by
 * label name OR color.
 *
 * Ordering: **preserves Trello's order** (the board's label order).
 *
 * `hasMore`: `false` — the helper requests Trello's max page; a board's
 * label set is tiny.
 *
 * Cascade fallback: a deleted / access-lost board → `TrelloNotFoundError`
 * → empty items.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; other →
 * `PROVIDER_ERROR`. No token / raw body leakage.
 */
export const trelloLabelsResolver: OptionsResolver = {
  source: "trello:labels",
  provider: "trello",
  requiresIntegration: true,
  requiredDeps: ["boardId"],
  async resolve(ctx) {
    const integration = requireTrelloIntegration(ctx);
    const boardId = requireDep(ctx, "boardId", "board");
    const accessToken = decryptToken(integration.accessTokenEncrypted);

    let labels;
    try {
      labels = await labelsList({ accessToken, boardId });
    } catch (err) {
      if (err instanceof TrelloNotFoundError) {
        return { items: [], hasMore: false };
      }
      mapTrelloOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const label of labels) {
      if (typeof label.id !== "string" || label.id.length === 0) continue;
      const name =
        typeof label.name === "string" && label.name.length > 0
          ? label.name
          : null;
      const color =
        typeof label.color === "string" && label.color.length > 0
          ? label.color
          : null;
      const text = name ?? color ?? label.id;
      items.push(
        color
          ? { value: label.id, label: text, description: color }
          : { value: label.id, label: text },
      );
    }

    return {
      items: filterByLabelOrDescription(items, ctx.q),
      hasMore: false,
    };
  },
};
