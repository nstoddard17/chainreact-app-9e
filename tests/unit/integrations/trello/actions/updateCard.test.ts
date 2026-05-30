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

import { updateCard } from "@/integrations/trello/actions/updateCard";
import { UpdateCardConfigSchema } from "@/integrations/trello/actions/updateCard.schema";

const triggerEvent: TriggerEvent = {
  provider: "manual",
  eventType: "manual",
  eventId: "t1",
  occurredAt: "2026-05-11T00:00:00Z",
  providerAccountId: "manual",
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
}

describe("updateCard handler", () => {
  it("passes only set fields and shapes output", async () => {
    wireIntegration();
    mockCardsUpdate.mockResolvedValue({
      id: "c1",
      name: "renamed",
      desc: null,
      url: "https://trello.com/c/x",
      idList: "l2",
      idBoard: "b1",
      due: null,
      closed: false,
    });
    const result = await updateCard({
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
      userId: "user-1",
      accountId: "acct-user-1",
      config: { cardId: "c1", name: "renamed" },
      triggerEvent,
    });
    expect(mockCardsUpdate).toHaveBeenCalledTimes(1);
    const apiArg = mockCardsUpdate.mock.calls[0]![0] as Record<string, unknown>;
    expect(apiArg.cardId).toBe("c1");
    expect(apiArg.name).toBe("renamed");
    expect(apiArg.desc).toBeUndefined();
    expect(result.output.cardId).toBe("c1");
  });

  it("schema rejects empty update payload (Q11)", () => {
    const r = UpdateCardConfigSchema.safeParse({ cardId: "c1" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.message).toMatch(/at least one/);
    }
  });

  it("schema accepts a partial update with a single mutable field", () => {
    expect(
      UpdateCardConfigSchema.safeParse({ cardId: "c1", closed: true }).success,
    ).toBe(true);
  });

  it("schema rejects missing cardId", () => {
    expect(
      UpdateCardConfigSchema.safeParse({ name: "x" }).success,
    ).toBe(false);
  });

  it("schema rejects unknown fields (strict shape)", () => {
    expect(
      UpdateCardConfigSchema.safeParse({
        cardId: "c1",
        name: "x",
        unknown: "y",
      }).success,
    ).toBe(false);
  });
});
