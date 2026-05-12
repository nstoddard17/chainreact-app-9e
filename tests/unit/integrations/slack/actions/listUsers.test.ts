/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/users/listUsers (Slack 2.3 Commit 4).
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

const mockUsersList = jest.fn();
jest.mock("@/integrations/slack/api/usersList", () => ({
  usersList: (...args: unknown[]) => mockUsersList(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { listUsers } from "@/integrations/slack/actions/users/listUsers";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-11T00:00:00Z",
  accountId: "T0001",
  payload: {},
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "slack",
  providerAccountId: "T0001",
  displayName: "Acme",
  accessTokenEncrypted: "ENCRYPTED_TOKEN",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["users:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-11T00:00:00Z",
  updatedAt: "2026-05-11T00:00:00Z",
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-1",
    nodeId: "n5",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockUsersList.mockReset();
  mockDecryptToken.mockReset();
});

describe("listUsers — happy path", () => {
  it("calls users.list with no body fields when no config supplied; returns users + pagination metadata", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockUsersList.mockResolvedValueOnce({
      users: [
        { id: "U1", name: "alice" },
        { id: "U2", name: "bob" },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const result = await listUsers(makeInput({}));

    expect(mockUsersList).toHaveBeenCalledWith({
      botToken: "xoxb",
      limit: undefined,
      cursor: undefined,
    });
    expect(result.output).toEqual({
      users: [
        { id: "U1", name: "alice" },
        { id: "U2", name: "bob" },
      ],
      count: 2,
      hasMore: false,
      nextCursor: null,
    });
  });

  it("forwards optional limit + cursor", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockUsersList.mockResolvedValueOnce({
      users: [],
      hasMore: false,
      nextCursor: null,
    });

    await listUsers(makeInput({ limit: 50, cursor: "cursor-page-2" }));
    expect(mockUsersList).toHaveBeenCalledWith({
      botToken: "xoxb",
      limit: 50,
      cursor: "cursor-page-2",
    });
  });

  it("surfaces hasMore + nextCursor for pagination output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockUsersList.mockResolvedValueOnce({
      users: [{ id: "U1", name: "alice" }],
      hasMore: true,
      nextCursor: "cursor-page-2",
    });

    const result = await listUsers(makeInput({}));
    expect(result.output).toEqual({
      users: [{ id: "U1", name: "alice" }],
      count: 1,
      hasMore: true,
      nextCursor: "cursor-page-2",
    });
  });

  it("returns count=0 + nextCursor=null when no users + no more pages", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockUsersList.mockResolvedValueOnce({
      users: [],
      hasMore: false,
      nextCursor: null,
    });

    const result = await listUsers(makeInput({}));
    expect(result.output).toEqual({
      users: [],
      count: 0,
      hasMore: false,
      nextCursor: null,
    });
  });
});

describe("listUsers — strict schema (fail-closed)", () => {
  it("rejects unknown keys (strict)", async () => {
    await expect(
      listUsers(makeInput({ noSuchField: "x" })),
    ).rejects.toThrow();
  });

  it("rejects limit out of range (>1000)", async () => {
    await expect(listUsers(makeInput({ limit: 5000 }))).rejects.toThrow();
  });

  it("rejects limit out of range (<1)", async () => {
    await expect(listUsers(makeInput({ limit: 0 }))).rejects.toThrow();
  });

  it("rejects empty-string cursor", async () => {
    await expect(listUsers(makeInput({ cursor: "" }))).rejects.toThrow();
  });
});

describe("listUsers — error propagation", () => {
  it("propagates SlackApiError (missing_scope) — users:read must be granted", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockUsersList.mockRejectedValueOnce(
      new Error("Slack API failed: missing_scope"),
    );
    await expect(listUsers(makeInput({}))).rejects.toThrow(/missing_scope/);
  });

  it("throws when no Slack integration is active", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(listUsers(makeInput({}))).rejects.toThrow(
      /No active Slack integration/,
    );
  });
});
