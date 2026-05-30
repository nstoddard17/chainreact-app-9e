/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsCreate = jest.fn();
jest.mock("@/integrations/slack/api/conversationsCreate", () => ({
  conversationsCreate: (...args: unknown[]) => mockConversationsCreate(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { createChannel } from "@/integrations/slack/actions/channels/createChannel";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-11T00:00:00Z",
  providerAccountId: "T0001",
  payload: {},
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "slack",
  providerAccountId: "T0001",
  displayName: "Acme",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-11T00:00:00Z",
  updatedAt: "2026-05-11T00:00:00Z",
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockConversationsCreate.mockReset();
  mockDecryptToken.mockReset();
});

describe("createChannel — happy path", () => {
  it("calls conversations.create with name + isPrivate and returns the channel + flat fields", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsCreate.mockResolvedValueOnce({
      channel: { id: "C1", name: "new-room", is_private: false },
    });

    const result = await createChannel(
      makeInput({ name: "new-room", isPrivate: false }),
    );

    expect(mockConversationsCreate).toHaveBeenCalledWith({
      botToken: "xoxb",
      name: "new-room",
      isPrivate: false,
    });
    expect(result.output).toEqual({
      channel: { id: "C1", name: "new-room", is_private: false },
      id: "C1",
      name: "new-room",
      is_private: false,
    });
  });

  it("passes isPrivate=true through", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsCreate.mockResolvedValueOnce({
      channel: { id: "CPRIV", name: "secret", is_private: true },
    });
    await createChannel(makeInput({ name: "secret", isPrivate: true }));
    expect(mockConversationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ isPrivate: true }),
    );
  });
});

describe("createChannel — Q11 strict required isPrivate", () => {
  it("rejects when isPrivate is missing (no hidden default)", async () => {
    await expect(
      createChannel(makeInput({ name: "channel-without-isprivate" })),
    ).rejects.toThrow();
  });

  it("rejects when name is empty", async () => {
    await expect(
      createChannel(makeInput({ name: "", isPrivate: false })),
    ).rejects.toThrow();
  });

  it("rejects when name exceeds 80 chars", async () => {
    await expect(
      createChannel(makeInput({ name: "x".repeat(81), isPrivate: false })),
    ).rejects.toThrow();
  });

  it("rejects unknown keys (strict)", async () => {
    await expect(
      createChannel(
        makeInput({ name: "n", isPrivate: false, initialMembers: ["U1"] }),
      ),
    ).rejects.toThrow();
  });
});

describe("createChannel — error propagation", () => {
  it("throws when no Slack integration is active", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      createChannel(makeInput({ name: "n", isPrivate: false })),
    ).rejects.toThrow(/No active Slack integration/);
  });

  it("propagates SlackApiError from the wrapper", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsCreate.mockRejectedValueOnce(
      new Error("Slack API failed: name_taken"),
    );
    await expect(
      createChannel(makeInput({ name: "n", isPrivate: false })),
    ).rejects.toThrow(/name_taken/);
  });
});
