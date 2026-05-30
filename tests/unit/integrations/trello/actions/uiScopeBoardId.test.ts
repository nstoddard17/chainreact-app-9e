/**
 * @jest-environment node
 *
 * Slice 4.TRELLO-META-3 — UI-scope `boardId` schema additions.
 *
 * The 6 card-targeted Trello action schemas gained an optional,
 * handler-ignored `boardId` so the persisted Builder config (which carries
 * the board-picker value used to cascade the list/card/member/label
 * pickers) validates. These tests pin:
 *   - each schema accepts + preserves an optional boardId;
 *   - `.strict()` still rejects genuinely-unknown fields;
 *   - update_card's "at least one mutable" rule does NOT count boardId;
 *   - the handler IGNORES boardId at runtime (it is never forwarded to the
 *     provider API) — runtime behavior unchanged.
 */
import { randomBytes } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

import { CreateCardConfigSchema } from "@/integrations/trello/actions/createCard.schema";
import { UpdateCardConfigSchema } from "@/integrations/trello/actions/updateCard.schema";
import { MoveCardConfigSchema } from "@/integrations/trello/actions/moveCard.schema";
import { ArchiveCardConfigSchema } from "@/integrations/trello/actions/archiveCard.schema";
import { AddCommentConfigSchema } from "@/integrations/trello/actions/addComment.schema";
import { AddLabelToCardConfigSchema } from "@/integrations/trello/actions/addLabelToCard.schema";

const mockCardsCreate = jest.fn();
const mockGetActiveForExecution = jest.fn();
jest.mock("@/integrations/trello/api/cards", () => ({
  cardsCreate: (...args: unknown[]) => mockCardsCreate(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

import { createCard } from "@/integrations/trello/actions/createCard";

const CARD_TARGETED = [
  {
    name: "create_card",
    schema: CreateCardConfigSchema,
    base: { listId: "l1", name: "Card" } as Record<string, unknown>,
  },
  {
    name: "update_card",
    schema: UpdateCardConfigSchema,
    base: { cardId: "c1", name: "Card" } as Record<string, unknown>,
  },
  {
    name: "move_card",
    schema: MoveCardConfigSchema,
    base: { cardId: "c1", idList: "l1" } as Record<string, unknown>,
  },
  {
    name: "archive_card",
    schema: ArchiveCardConfigSchema,
    base: { cardId: "c1" } as Record<string, unknown>,
  },
  {
    name: "add_comment",
    schema: AddCommentConfigSchema,
    base: { cardId: "c1", text: "hi" } as Record<string, unknown>,
  },
  {
    name: "add_label_to_card",
    schema: AddLabelToCardConfigSchema,
    base: { cardId: "c1", labelId: "lab1" } as Record<string, unknown>,
  },
] as const;

describe("UI-scope boardId — the 6 card-targeted schemas", () => {
  for (const c of CARD_TARGETED) {
    it(`${c.name} accepts an optional boardId and preserves it`, () => {
      const r = c.schema.safeParse({ ...c.base, boardId: "b1" });
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.data as { boardId?: string }).boardId).toBe("b1");
      }
    });

    it(`${c.name} still parses WITHOUT boardId (it is optional)`, () => {
      expect(c.schema.safeParse(c.base).success).toBe(true);
    });

    it(`${c.name} still rejects genuinely-unknown fields (strict)`, () => {
      expect(
        c.schema.safeParse({ ...c.base, boardId: "b1", totallyUnknown: "x" })
          .success,
      ).toBe(false);
    });
  }
});

describe("UI-scope boardId — update_card mutable rule unaffected", () => {
  it("boardId does NOT satisfy the 'at least one mutable field' requirement", () => {
    expect(
      UpdateCardConfigSchema.safeParse({ cardId: "c1", boardId: "b1" }).success,
    ).toBe(false);
  });

  it("boardId alongside a real mutable field passes", () => {
    expect(
      UpdateCardConfigSchema.safeParse({
        cardId: "c1",
        boardId: "b1",
        name: "x",
      }).success,
    ).toBe(true);
  });
});

describe("UI-scope boardId — handler ignores it at runtime", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    mockCardsCreate.mockReset();
    mockGetActiveForExecution.mockReset();
    const { encryptToken } = jest.requireActual("@/core/encryption/tokens");
    mockGetActiveForExecution.mockResolvedValue({
      id: "int-1",
      userId: "user-1",
      accountId: "acct-user-1",
      provider: "trello",
      providerAccountId: "trello-mem-1",
      displayName: "User",
      accessTokenEncrypted: encryptToken("token-abc"),
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      scopes: [],
      accountMetadata: {},
      disconnectedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  it("create_card never forwards boardId to the Trello API", async () => {
    mockCardsCreate.mockResolvedValue({
      id: "card-1",
      name: "Card",
      idList: "l1",
      idBoard: "board-1",
    });

    const triggerEvent: TriggerEvent = {
      provider: "manual",
      eventType: "manual",
      eventId: "trig-1",
      occurredAt: "2026-05-25T00:00:00Z",
      providerAccountId: "manual",
      payload: {},
    };

    const result = await createCard({
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
      userId: "user-1",
      accountId: "acct-user-1",
      // boardId is the UI-scope field — present in the persisted config.
      config: { boardId: "b-ui-only", listId: "l1", name: "Card" },
      triggerEvent,
    });

    expect(mockCardsCreate).toHaveBeenCalledTimes(1);
    const apiArg = mockCardsCreate.mock.calls[0]![0] as Record<string, unknown>;
    // The handler forwards explicit fields only — boardId is dropped.
    expect(apiArg.boardId).toBeUndefined();
    expect(apiArg.idList).toBe("l1");
    expect(apiArg.name).toBe("Card");
    // Output shape unchanged.
    expect(result.output).toMatchObject({ cardId: "card-1", idList: "l1" });
    expect((result.output as Record<string, unknown>).boardId).toBeUndefined();
  });
});
