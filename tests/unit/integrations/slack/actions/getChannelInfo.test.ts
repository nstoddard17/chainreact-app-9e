/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/getChannelInfo (Slack 2.3 Commit 2).
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

const mockConversationsInfo = jest.fn();
jest.mock("@/integrations/slack/api/conversationsInfo", () => ({
  conversationsInfo: (...args: unknown[]) => mockConversationsInfo(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { getChannelInfo } from "@/integrations/slack/actions/channels/getChannelInfo";
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
  scopes: ["channels:read", "groups:read"],
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
  mockConversationsInfo.mockReset();
  mockDecryptToken.mockReset();
});

describe("getChannelInfo — happy path", () => {
  it("decrypts the bot token, calls conversations.info, projects flat fields + preserves raw channel object", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-real");
    mockConversationsInfo.mockResolvedValueOnce({
      channel: {
        id: "C1",
        name: "general",
        is_private: false,
        is_archived: false,
        num_members: 42,
        topic: { value: "Topic text", creator: "U1", last_set: 1730000000 },
        purpose: { value: "Purpose text", creator: "U1", last_set: 1730000000 },
        created: 1730000000,
        extra_field_slack_might_add: "preserved",
      },
    });

    const result = await getChannelInfo(makeInput({ channel: "C1" }));

    expect(mockConversationsInfo).toHaveBeenCalledWith({
      botToken: "xoxb-real",
      channel: "C1",
    });
    expect(result.output).toEqual({
      channel: {
        id: "C1",
        name: "general",
        is_private: false,
        is_archived: false,
        num_members: 42,
        topic: { value: "Topic text", creator: "U1", last_set: 1730000000 },
        purpose: { value: "Purpose text", creator: "U1", last_set: 1730000000 },
        created: 1730000000,
        extra_field_slack_might_add: "preserved",
      },
      id: "C1",
      name: "general",
      is_private: false,
      is_archived: false,
      num_members: 42,
      topic: "Topic text",
      purpose: "Purpose text",
      created: 1730000000,
    });
  });

  it("works for a private channel with C-prefixed id and channel_type='group' semantics (passthrough)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsInfo.mockResolvedValueOnce({
      channel: { id: "CPRIV01", name: "secret-room", is_private: true },
    });

    const result = await getChannelInfo(makeInput({ channel: "CPRIV01" }));
    expect(result.output.is_private).toBe(true);
    expect(result.output.id).toBe("CPRIV01");
  });

  it("works for a legacy G-prefixed private channel id", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsInfo.mockResolvedValueOnce({
      channel: { id: "GLEGACY1", name: "legacy", is_private: true },
    });

    await getChannelInfo(makeInput({ channel: "GLEGACY1" }));
    expect(mockConversationsInfo).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "GLEGACY1",
    });
  });

  it("leaves topic / purpose undefined when Slack returns them as empty-value objects with no string", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsInfo.mockResolvedValueOnce({
      channel: { id: "C1", name: "general", topic: {}, purpose: {} },
    });

    const result = await getChannelInfo(makeInput({ channel: "C1" }));
    expect(result.output.topic).toBeUndefined();
    expect(result.output.purpose).toBeUndefined();
  });
});

describe("getChannelInfo — strict schema (fail-closed)", () => {
  it("rejects missing channel id", async () => {
    await expect(getChannelInfo(makeInput({}))).rejects.toThrow();
  });

  it("rejects a lowercase channel id", async () => {
    await expect(
      getChannelInfo(makeInput({ channel: "c1abc" })),
    ).rejects.toThrow();
  });

  it("rejects a channel id with a non-CDG prefix (no silent name resolution)", async () => {
    await expect(
      getChannelInfo(makeInput({ channel: "X1ABC" })),
    ).rejects.toThrow();
  });

  it("rejects unknown keys (strict schema)", async () => {
    await expect(
      getChannelInfo(makeInput({ channel: "C1", noSuchField: "x" })),
    ).rejects.toThrow();
  });
});

describe("getChannelInfo — error propagation", () => {
  it("propagates SlackApiError when the wrapper rejects (channel_not_found)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsInfo.mockRejectedValueOnce(
      new Error("Slack API failed: channel_not_found"),
    );
    await expect(
      getChannelInfo(makeInput({ channel: "C1" })),
    ).rejects.toThrow(/channel_not_found/);
  });

  it("throws when no Slack integration is active for the user/workspace", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      getChannelInfo(makeInput({ channel: "C1" })),
    ).rejects.toThrow(/No active Slack integration/);
  });
});
