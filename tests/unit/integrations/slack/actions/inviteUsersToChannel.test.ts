/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsInvite = jest.fn();
jest.mock("@/integrations/slack/api/conversationsInvite", () => ({
  conversationsInvite: (...args: unknown[]) => mockConversationsInvite(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { inviteUsersToChannel } from "@/integrations/slack/actions/channels/inviteUsersToChannel";
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
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockConversationsInvite.mockReset();
  mockDecryptToken.mockReset();
});

describe("inviteUsersToChannel — happy path", () => {
  it("accepts an array of user ids and joins them as CSV before calling Slack", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsInvite.mockResolvedValueOnce({ channel: { id: "C1" } });

    const result = await inviteUsersToChannel(
      makeInput({
        channel: "C1",
        users: ["U1", "U2", "U3"],
        sendInviteNotification: true,
      }),
    );
    expect(mockConversationsInvite).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      users: "U1,U2,U3",
    });
    expect(result.output).toEqual({
      channel: { id: "C1" },
      users: "U1,U2,U3",
      invited_count: 3,
    });
  });

  it("accepts a CSV string of user ids and re-joins after trimming", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsInvite.mockResolvedValueOnce({ channel: { id: "C1" } });

    await inviteUsersToChannel(
      makeInput({
        channel: "C1",
        users: "U1, U2 , U3",
        sendInviteNotification: false,
      }),
    );
    expect(mockConversationsInvite).toHaveBeenCalledWith(
      expect.objectContaining({ users: "U1,U2,U3" }),
    );
  });

  it("accepts a mixed array-of-CSV (Q7 parseRecipients flattening)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsInvite.mockResolvedValueOnce({ channel: { id: "C1" } });

    await inviteUsersToChannel(
      makeInput({
        channel: "C1",
        users: ["U1,U2", "U3"],
        sendInviteNotification: true,
      }),
    );
    expect(mockConversationsInvite).toHaveBeenCalledWith(
      expect.objectContaining({ users: "U1,U2,U3" }),
    );
  });
});

describe("inviteUsersToChannel — validation (fail-closed)", () => {
  it("rejects when sendInviteNotification is missing (Q11)", async () => {
    await expect(
      inviteUsersToChannel(
        makeInput({ channel: "C1", users: ["U1"] }),
      ),
    ).rejects.toThrow();
  });

  it("rejects when users is an empty array", async () => {
    await expect(
      inviteUsersToChannel(
        makeInput({
          channel: "C1",
          users: [],
          sendInviteNotification: true,
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects when users CSV resolves to an empty list (whitespace + commas only)", async () => {
    await expect(
      inviteUsersToChannel(
        makeInput({
          channel: "C1",
          users: " , , ",
          sendInviteNotification: true,
        }),
      ),
    ).rejects.toThrow(/empty list/);
  });

  it("rejects a non-U-prefixed user id (post-parse validation)", async () => {
    await expect(
      inviteUsersToChannel(
        makeInput({
          channel: "C1",
          users: ["U1", "NOTAUSER"],
          sendInviteNotification: true,
        }),
      ),
    ).rejects.toThrow(/Invalid Slack user id/);
  });

  it("rejects unknown keys (strict schema)", async () => {
    await expect(
      inviteUsersToChannel(
        makeInput({
          channel: "C1",
          users: ["U1"],
          sendInviteNotification: true,
          customWelcomeMessage: "welcome",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("inviteUsersToChannel — error propagation", () => {
  it("propagates SlackApiError (not_in_channel — bot not member yet)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsInvite.mockRejectedValueOnce(
      new Error("Slack API failed: not_in_channel"),
    );
    await expect(
      inviteUsersToChannel(
        makeInput({
          channel: "C1",
          users: ["U1"],
          sendInviteNotification: true,
        }),
      ),
    ).rejects.toThrow(/not_in_channel/);
  });
});
