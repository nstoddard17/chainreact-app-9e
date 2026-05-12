/**
 * @jest-environment node
 */
import { randomBytes } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockCardsAddComment = jest.fn();
const mockGetActiveForExecution = jest.fn();

jest.mock("@/integrations/trello/api/cards", () => ({
  cardsAddComment: (...args: unknown[]) => mockCardsAddComment(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

import { addComment } from "@/integrations/trello/actions/addComment";
import { AddCommentConfigSchema } from "@/integrations/trello/actions/addComment.schema";

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
  mockCardsAddComment.mockReset();
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

describe("addComment handler", () => {
  it("forwards cardId+text and shapes output with comment id + member info", async () => {
    wireIntegration();
    mockCardsAddComment.mockResolvedValue({
      id: "act-1",
      type: "commentCard",
      date: "2026-05-11T01:00:00Z",
      data: { text: "great" },
      memberCreator: { id: "m1", username: "u", fullName: "User One" },
    });
    const result = await addComment({
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
      userId: "user-1",
      config: { cardId: "c1", text: "great" },
      triggerEvent,
    });
    expect(result.output).toEqual({
      commentId: "act-1",
      text: "great",
      date: "2026-05-11T01:00:00Z",
      memberCreatorId: "m1",
      memberCreatorUsername: "u",
      memberCreatorFullName: "User One",
    });
  });

  it("schema rejects empty text", () => {
    expect(
      AddCommentConfigSchema.safeParse({ cardId: "c1", text: "" }).success,
    ).toBe(false);
  });

  it("schema rejects missing cardId", () => {
    expect(AddCommentConfigSchema.safeParse({ text: "hi" }).success).toBe(
      false,
    );
  });
});
