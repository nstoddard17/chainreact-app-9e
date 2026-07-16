/**
 * @jest-environment node
 *
 * Config-UX sweep — Trello `pos` field meta ↔ runtime contract.
 *
 * The runtime schema for all four position-bearing actions is
 * `z.union([z.literal("top"), z.literal("bottom"), z.number().positive()])`.
 * A `text` field committed STRINGS, so a typed number ("65536") failed the
 * Zod union at runtime — only "top"/"bottom" ever worked from the UI. The
 * meta now ships a `select` limited to the two string literals (the numeric
 * branch stays reachable via a `{{...}}` variable that resolves to a number).
 *
 * Pins:
 *   - `pos` is a select, optional, `advanced: true` on all four metas,
 *   - option values ⊆ the runtime union's string literals,
 *   - every option value parses through the runtime schema,
 *   - the old broken path (numeric string) is rejected by the runtime
 *     schema — documenting why the select drops nothing that worked.
 */
import { trelloCreateCardMeta } from "@/integrations/trello/actions/createCard.meta";
import { trelloUpdateCardMeta } from "@/integrations/trello/actions/updateCard.meta";
import { trelloMoveCardMeta } from "@/integrations/trello/actions/moveCard.meta";
import { trelloCreateListMeta } from "@/integrations/trello/actions/createList.meta";
import { CreateCardConfigSchema } from "@/integrations/trello/actions/createCard.schema";
import { UpdateCardConfigSchema } from "@/integrations/trello/actions/updateCard.schema";
import { MoveCardConfigSchema } from "@/integrations/trello/actions/moveCard.schema";
import { CreateListConfigSchema } from "@/integrations/trello/actions/createList.schema";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { z } from "zod";

const RUNTIME_STRING_LITERALS = ["top", "bottom"];

interface Case {
  meta: ActionMeta;
  schema: z.ZodTypeAny;
  /** Minimal valid config WITHOUT pos. */
  base: Record<string, unknown>;
}

const CASES: readonly Case[] = [
  {
    meta: trelloCreateCardMeta,
    schema: CreateCardConfigSchema,
    base: { listId: "list-1", name: "Card" },
  },
  {
    meta: trelloUpdateCardMeta,
    schema: UpdateCardConfigSchema,
    // `name` satisfies update_card's at-least-one-mutable-field refine so
    // the pos-less base stays valid.
    base: { cardId: "card-1", name: "Renamed" },
  },
  {
    meta: trelloMoveCardMeta,
    schema: MoveCardConfigSchema,
    base: { cardId: "card-1", idList: "list-2" },
  },
  {
    meta: trelloCreateListMeta,
    schema: CreateListConfigSchema,
    base: { idBoard: "board-1", name: "List" },
  },
];

describe.each(CASES.map((c) => [c.meta.key, c] as const))(
  "%s — pos select meta ↔ runtime union",
  (_key, { meta, schema, base }) => {
    const pos = meta.fields.find((f) => f.name === "pos")!;

    it("is an optional advanced select with static options", () => {
      expect(pos).toBeDefined();
      expect(pos.type).toBe("select");
      expect(pos.required).toBe(false);
      expect(pos.advanced).toBe(true);
      expect(pos.optionsSource).toBeUndefined();
      expect(pos.options!.length).toBeGreaterThan(0);
    });

    it("option values equal the runtime union's string literals", () => {
      expect(pos.options!.map((o) => o.value)).toEqual(RUNTIME_STRING_LITERALS);
    });

    it("every option value parses through the runtime schema", () => {
      for (const opt of pos.options!) {
        expect(() => schema.parse({ ...base, pos: opt.value })).not.toThrow();
      }
    });

    it("omitting pos stays valid (optional — provider default applies)", () => {
      expect(() => schema.parse(base)).not.toThrow();
    });

    it("a numeric STRING is rejected by the runtime schema (the old text field's broken path)", () => {
      expect(() => schema.parse({ ...base, pos: "65536" })).toThrow();
      // The number branch itself is still valid — reachable via variables.
      expect(() => schema.parse({ ...base, pos: 65536 })).not.toThrow();
    });
  },
);
