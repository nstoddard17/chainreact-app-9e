/**
 * @jest-environment node
 */
import { randomBytes } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockCardsAddLabel = jest.fn();
const mockGetActiveForExecution = jest.fn();

jest.mock("@/integrations/trello/api/cards", () => ({
  cardsAddLabel: (...args: unknown[]) => mockCardsAddLabel(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

import { addLabelToCard } from "@/integrations/trello/actions/addLabelToCard";
import { AddLabelToCardConfigSchema } from "@/integrations/trello/actions/addLabelToCard.schema";

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
  mockCardsAddLabel.mockReset();
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

describe("addLabelToCard handler", () => {
  it("forwards cardId+labelId and returns the post-mutation label list", async () => {
    wireIntegration();
    mockCardsAddLabel.mockResolvedValue(["lab1", "lab2"]);
    const result = await addLabelToCard({
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
      userId: "user-1",
      accountId: "acct-user-1",
      config: { cardId: "c1", labelId: "lab2" },
      triggerEvent,
    });
    expect(mockCardsAddLabel).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: "c1", labelId: "lab2" }),
    );
    expect(result.output).toEqual({
      cardId: "c1",
      idLabels: ["lab1", "lab2"],
    });
  });

  it("schema rejects missing labelId (no name-based lookup)", () => {
    expect(
      AddLabelToCardConfigSchema.safeParse({ cardId: "c1" }).success,
    ).toBe(false);
  });

  it("schema rejects missing cardId", () => {
    expect(
      AddLabelToCardConfigSchema.safeParse({ labelId: "l1" }).success,
    ).toBe(false);
  });
});
