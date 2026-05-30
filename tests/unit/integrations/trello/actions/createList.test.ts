/**
 * @jest-environment node
 */
import { randomBytes } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockListsCreate = jest.fn();
const mockGetActiveForExecution = jest.fn();

jest.mock("@/integrations/trello/api/lists", () => ({
  listsCreate: (...args: unknown[]) => mockListsCreate(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

import { createList } from "@/integrations/trello/actions/createList";
import { CreateListConfigSchema } from "@/integrations/trello/actions/createList.schema";

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
  mockListsCreate.mockReset();
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

describe("createList handler", () => {
  it("forwards idBoard+name and returns shaped output", async () => {
    wireIntegration();
    mockListsCreate.mockResolvedValue({
      id: "l1",
      name: "Backlog",
      idBoard: "b1",
      pos: 65536,
      closed: false,
    });
    const result = await createList({
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
      userId: "user-1",
      accountId: "acct-user-1",
      config: { idBoard: "b1", name: "Backlog" },
      triggerEvent,
    });
    expect(result.output).toEqual({
      listId: "l1",
      name: "Backlog",
      idBoard: "b1",
      pos: 65536,
      closed: false,
    });
  });

  it("schema rejects missing idBoard", () => {
    expect(
      CreateListConfigSchema.safeParse({ name: "x" }).success,
    ).toBe(false);
  });

  it("schema rejects missing name", () => {
    expect(
      CreateListConfigSchema.safeParse({ idBoard: "b1" }).success,
    ).toBe(false);
  });
});
