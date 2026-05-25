/**
 * @jest-environment node
 *
 * Tests for the Gmail markAsRead action handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUsersMessagesModify = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {
    constructor(message?: string) {
      super(message);
      this.name = "Unauthorized401Error";
    }
  },
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersMessagesModify", () => ({
  usersMessagesModify: (...args: unknown[]) => mockUsersMessagesModify(...args),
}));

import { markAsRead } from "@/integrations/gmail/actions/markAsRead";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersMessagesModify.mockReset();
});

function makeGmailTriggerEvent(accountId: string): TriggerEvent {
  return {
    provider: "gmail",
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-12T12:00:00Z",
    accountId,
    payload: {},
  };
}

function baseHandlerInput(overrides: {
  config?: Record<string, unknown>;
} = {}) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-1",
    nodeId: "node-mark-as-read",
    config: overrides.config ?? { messageId: "msg-1" },
    triggerEvent: makeGmailTriggerEvent("me@example.com"),
  };
}

function wireRefreshAndRetry() {
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    },
  );
}

describe("markAsRead — happy path", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersMessagesModify.mockResolvedValue({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["INBOX"],
    });
  });

  it("calls usersMessagesModify with removeLabelIds: ['UNREAD']", async () => {
    await markAsRead(baseHandlerInput());

    expect(mockUsersMessagesModify).toHaveBeenCalledTimes(1);
    const args = mockUsersMessagesModify.mock.calls[0]![0];
    expect(args.removeLabelIds).toEqual(["UNREAD"]);
    expect(args.addLabelIds).toBeUndefined();
    expect(args.messageId).toBe("msg-1");
  });

  it("routes through refreshAndRetry with Gmail accountId from trigger", async () => {
    await markAsRead(baseHandlerInput());

    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.userId).toBe("user-1");
    expect(call.provider).toBe("gmail");
    expect(call.accountId).toBe("me@example.com");
  });

  it("returns { messageId, threadId, labelIds } from the modify response", async () => {
    mockRefreshAndRetry.mockReset();
    wireRefreshAndRetry();
    mockUsersMessagesModify.mockResolvedValueOnce({
      id: "msg-77",
      threadId: "thr-77",
      labelIds: ["INBOX", "Label_5"],
    });

    const result = await markAsRead(baseHandlerInput());

    expect(result).toEqual({
      output: {
        messageId: "msg-77",
        threadId: "thr-77",
        labelIds: ["INBOX", "Label_5"],
      },
    });
  });
});

describe("markAsRead — error propagation", () => {
  it("throws ZodError when messageId is missing", async () => {
    await expect(
      markAsRead(baseHandlerInput({ config: {} })),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates errors from refreshAndRetry untouched", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Gmail modify failed: Not Found"),
    );
    await expect(markAsRead(baseHandlerInput())).rejects.toThrow(/Not Found/);
  });
});
