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

import { archiveCard } from "@/integrations/trello/actions/archiveCard";
import { ArchiveCardConfigSchema } from "@/integrations/trello/actions/archiveCard.schema";

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

describe("archiveCard handler", () => {
  it("defaults closed=true and forwards to cardsUpdate", async () => {
    wireIntegration();
    mockCardsUpdate.mockResolvedValue({
      id: "c1",
      name: "x",
      closed: true,
      url: "https://trello.com/c/x",
    });
    const result = await archiveCard({
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
      userId: "user-1",
      accountId: "acct-user-1",
      config: { cardId: "c1" },
      triggerEvent,
    });
    expect(mockCardsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: "c1", closed: true }),
    );
    expect(result.output).toEqual({
      cardId: "c1",
      name: "x",
      closed: true,
      url: "https://trello.com/c/x",
    });
  });

  it("accepts closed=false (unarchive)", async () => {
    wireIntegration();
    mockCardsUpdate.mockResolvedValue({ id: "c1", name: "x", closed: false });
    await archiveCard({
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
      userId: "user-1",
      accountId: "acct-user-1",
      config: { cardId: "c1", closed: false },
      triggerEvent,
    });
    expect(mockCardsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ closed: false }),
    );
  });

  it("schema rejects string closed (must be boolean)", () => {
    expect(
      ArchiveCardConfigSchema.safeParse({ cardId: "c1", closed: "true" }).success,
    ).toBe(false);
  });

  it("schema rejects missing cardId", () => {
    expect(ArchiveCardConfigSchema.safeParse({}).success).toBe(false);
  });
});
