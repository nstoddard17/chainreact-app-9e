/**
 * @jest-environment node
 *
 * Tests for Trello create_card action handler. Mocks the cards API
 * wrapper + integrations repo so the handler runs end-to-end through
 * `refreshAndRetry`.
 */
import { randomBytes } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

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
import { CreateCardConfigSchema } from "@/integrations/trello/actions/createCard.schema";

const triggerEvent: TriggerEvent = {
  provider: "manual",
  eventType: "manual",
  eventId: "trig-1",
  occurredAt: "2026-05-11T00:00:00Z",
  providerAccountId: "manual",
  payload: {},
};

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  mockCardsCreate.mockReset();
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

describe("createCard handler", () => {
  it("passes resolved config through to cardsCreate and shapes output", async () => {
    wireIntegration();
    mockCardsCreate.mockResolvedValue({
      id: "card-1",
      name: "New Card",
      desc: "hi",
      url: "https://trello.com/c/abc",
      shortUrl: "https://trello.com/c/sh",
      idList: "list-1",
      idBoard: "board-1",
      pos: 65536,
      due: null,
      dueComplete: false,
      start: null,
      closed: false,
      idMembers: ["m1"],
      idLabels: ["lab1"],
    });

    const result = await createCard({
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
      userId: "user-1",
      accountId: "acct-user-1",
      config: { listId: "list-1", name: "New Card", desc: "hi" },
      triggerEvent,
    });

    expect(mockCardsCreate).toHaveBeenCalledTimes(1);
    const apiArg = mockCardsCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(apiArg.accessToken).toBe("token-abc");
    expect(apiArg.idList).toBe("list-1");
    expect(apiArg.name).toBe("New Card");
    expect(apiArg.desc).toBe("hi");

    expect(result.output).toEqual({
      cardId: "card-1",
      name: "New Card",
      url: "https://trello.com/c/abc",
      shortUrl: "https://trello.com/c/sh",
      idList: "list-1",
      idBoard: "board-1",
      desc: "hi",
      due: null,
      dueComplete: false,
      start: null,
      closed: false,
      idMembers: ["m1"],
      idLabels: ["lab1"],
      pos: 65536,
    });
  });

  it("schema rejects missing listId", () => {
    expect(
      CreateCardConfigSchema.safeParse({ name: "x" }).success,
    ).toBe(false);
  });

  it("schema rejects missing name", () => {
    expect(
      CreateCardConfigSchema.safeParse({ listId: "l1" }).success,
    ).toBe(false);
  });

  it("schema rejects unknown fields (strict shape)", () => {
    expect(
      CreateCardConfigSchema.safeParse({
        listId: "l1",
        name: "x",
        unknown: "y",
      }).success,
    ).toBe(false);
  });

  it("schema accepts all optional fields", () => {
    const r = CreateCardConfigSchema.safeParse({
      listId: "l1",
      name: "x",
      desc: "hello",
      pos: "top",
      due: "2026-06-01T00:00:00Z",
      dueComplete: false,
      start: "2026-05-01T00:00:00Z",
      idMembers: ["m1"],
      idLabels: ["lab1"],
    });
    expect(r.success).toBe(true);
  });
});
