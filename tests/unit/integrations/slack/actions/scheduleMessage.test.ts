/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/scheduleMessage.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockChatScheduleMessage = jest.fn();
jest.mock("@/integrations/slack/api/chatScheduleMessage", () => ({
  chatScheduleMessage: (...args: unknown[]) => mockChatScheduleMessage(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { scheduleMessage } from "@/integrations/slack/actions/scheduleMessage";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
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
  scopes: ["chat:write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-1",
    nodeId: "n7",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockChatScheduleMessage.mockReset();
  mockDecryptToken.mockReset();
});

describe("scheduleMessage — happy path", () => {
  it("parses Unix-seconds string, calls chat.scheduleMessage, returns the scheduled id + postAt", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-real");
    mockChatScheduleMessage.mockResolvedValueOnce({
      channel: "C1",
      scheduledMessageId: "Q1234ABCD",
      postAt: 1730000000,
    });

    const result = await scheduleMessage(
      makeInput({ channel: "C1", text: "hello", postAt: "1730000000" }),
    );

    expect(mockChatScheduleMessage).toHaveBeenCalledWith({
      botToken: "xoxb-real",
      channel: "C1",
      text: "hello",
      postAt: 1730000000,
      threadTs: undefined,
    });
    expect(result.output).toEqual({
      channel: "C1",
      scheduledMessageId: "Q1234ABCD",
      postAt: 1730000000,
    });
  });

  it("parses ISO with explicit timezone and forwards the integer epoch", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatScheduleMessage.mockResolvedValueOnce({
      channel: "C1",
      scheduledMessageId: "Q1",
      postAt: 1747754400,
    });

    await scheduleMessage(
      makeInput({ channel: "C1", text: "hi", postAt: "2025-05-20T14:00:00Z" }),
    );

    const expectedEpoch = Math.floor(Date.UTC(2025, 4, 20, 14, 0, 0) / 1000);
    expect(mockChatScheduleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ postAt: expectedEpoch }),
    );
  });

  it("forwards thread_ts to the API wrapper when provided", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatScheduleMessage.mockResolvedValueOnce({
      channel: "C1",
      scheduledMessageId: "Q1",
      postAt: 1730000000,
    });

    await scheduleMessage(
      makeInput({
        channel: "C1",
        text: "thread reply",
        postAt: "1730000000",
        threadTs: "1.0",
      }),
    );

    expect(mockChatScheduleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ threadTs: "1.0" }),
    );
  });
});

describe("scheduleMessage — Q11 strictness (no silent defaults)", () => {
  it("rejects naive ISO without timezone (would silently default to UTC/local)", async () => {
    await expect(
      scheduleMessage(
        makeInput({ channel: "C1", text: "x", postAt: "2026-05-20T15:30:00" }),
      ),
    ).rejects.toThrow(/explicit timezone/);
    expect(mockChatScheduleMessage).not.toHaveBeenCalled();
  });

  it("rejects date-only string (would default to midnight UTC/local)", async () => {
    await expect(
      scheduleMessage(makeInput({ channel: "C1", text: "x", postAt: "2026-05-20" })),
    ).rejects.toThrow(/explicit timezone/);
    expect(mockChatScheduleMessage).not.toHaveBeenCalled();
  });

  it("rejects freeform 'tomorrow at 3pm'", async () => {
    await expect(
      scheduleMessage(
        makeInput({ channel: "C1", text: "x", postAt: "tomorrow at 3pm" }),
      ),
    ).rejects.toThrow();
    expect(mockChatScheduleMessage).not.toHaveBeenCalled();
  });

  it("rejects missing postAt", async () => {
    await expect(
      scheduleMessage(makeInput({ channel: "C1", text: "x" })),
    ).rejects.toThrow(/postAt/);
  });

  it("rejects empty postAt string", async () => {
    await expect(
      scheduleMessage(makeInput({ channel: "C1", text: "x", postAt: "" })),
    ).rejects.toThrow();
  });
});

describe("scheduleMessage — config validation", () => {
  it("rejects missing channel", async () => {
    await expect(
      scheduleMessage(makeInput({ text: "x", postAt: "1730000000" })),
    ).rejects.toThrow();
  });

  it("rejects empty text", async () => {
    await expect(
      scheduleMessage(makeInput({ channel: "C1", text: "", postAt: "1730000000" })),
    ).rejects.toThrow();
  });
});

describe("scheduleMessage — error propagation", () => {
  it("propagates SlackApiError on time_in_past", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatScheduleMessage.mockRejectedValueOnce(new Error("Slack API failed: time_in_past"));
    await expect(
      scheduleMessage(makeInput({ channel: "C1", text: "x", postAt: "1" })),
    ).rejects.toThrow(/time_in_past/);
  });

  it("throws workspace-specific 'connect Slack' when no integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      scheduleMessage(makeInput({ channel: "C1", text: "x", postAt: "1730000000" })),
    ).rejects.toThrow(/No active Slack integration found for workspace T0001/);
  });
});
