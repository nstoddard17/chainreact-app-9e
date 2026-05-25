/**
 * @jest-environment node
 */
import { randomBytes } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockCardsUpdate = jest.fn();
const mockGetActiveForExecution = jest.fn();

jest.mock("@/integrations/trello/api/cards", () => ({
  cardsUpdate: (...args: unknown[]) => mockCardsUpdate(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

import { moveCard } from "@/integrations/trello/actions/moveCard";
import { MoveCardConfigSchema } from "@/integrations/trello/actions/moveCard.schema";

const triggerEvent: TriggerEvent = {
  provider: "manual",
  eventType: "manual",
  eventId: "t1",
  occurredAt: "2026-05-11T00:00:00Z",
  accountId: "manual",
  payload: {},
};

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  mockCardsUpdate.mockReset();
  mockGetActiveForExecution.mockReset();
});

afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

function wireIntegration(): void {
  const { encryptToken } = jest.requireActual("@/core/encryption/tokens");
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "trello",
    providerAccountId: "mem-1",
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
}

describe("moveCard handler", () => {
  it("PUTs cardId with target idList", async () => {
    wireIntegration();
    mockCardsUpdate.mockResolvedValue({
      id: "c1",
      name: "x",
      idList: "l2",
      idBoard: "b1",
      pos: 32000,
      url: "https://trello.com/c/x",
    });
    const result = await moveCard({
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
      userId: "user-1",
      config: { cardId: "c1", idList: "l2" },
      triggerEvent,
    });
    expect(mockCardsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "token-abc",
        cardId: "c1",
        idList: "l2",
      }),
    );
    expect(result.output).toEqual({
      cardId: "c1",
      name: "x",
      idList: "l2",
      idBoard: "b1",
      pos: 32000,
      url: "https://trello.com/c/x",
    });
  });

  it("schema rejects missing idList (no silent default)", () => {
    expect(MoveCardConfigSchema.safeParse({ cardId: "c1" }).success).toBe(
      false,
    );
  });

  it("schema rejects missing cardId", () => {
    expect(MoveCardConfigSchema.safeParse({ idList: "l1" }).success).toBe(
      false,
    );
  });

  it("schema accepts optional pos", () => {
    expect(
      MoveCardConfigSchema.safeParse({
        cardId: "c1",
        idList: "l1",
        pos: "top",
      }).success,
    ).toBe(true);
  });
});
