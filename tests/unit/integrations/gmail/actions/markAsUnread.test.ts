/**
 * @jest-environment node
 *
 * Tests for the Gmail markAsUnread action handler. Mirror of
 * markAsRead with addLabelIds: ["UNREAD"] instead.
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

import { markAsUnread } from "@/integrations/gmail/actions/markAsUnread";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersMessagesModify.mockReset();
});

function makeGmailTriggerEvent(): TriggerEvent {
  return {
    provider: "gmail",
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-12T12:00:00Z",
    accountId: "me@example.com",
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
    nodeId: "node-mark-as-unread",
    config: overrides.config ?? { messageId: "msg-1" },
    triggerEvent: makeGmailTriggerEvent(),
  };
}

function wireRefreshAndRetry() {
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    },
  );
}

describe("markAsUnread — happy path", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersMessagesModify.mockResolvedValue({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["INBOX", "UNREAD"],
    });
  });

  it("calls usersMessagesModify with addLabelIds: ['UNREAD'] (no removeLabelIds)", async () => {
    await markAsUnread(baseHandlerInput());

    const args = mockUsersMessagesModify.mock.calls[0]![0];
    expect(args.addLabelIds).toEqual(["UNREAD"]);
    expect(args.removeLabelIds).toBeUndefined();
    expect(args.messageId).toBe("msg-1");
  });

  it("returns { messageId, threadId, labelIds }", async () => {
    mockUsersMessagesModify.mockResolvedValueOnce({
      id: "msg-2",
      threadId: "thr-2",
      labelIds: ["INBOX", "UNREAD"],
    });

    const result = await markAsUnread(baseHandlerInput());

    expect(result).toEqual({
      output: {
        messageId: "msg-2",
        threadId: "thr-2",
        labelIds: ["INBOX", "UNREAD"],
      },
    });
  });
});

describe("markAsUnread — error propagation", () => {
  it("throws ZodError when messageId is missing", async () => {
    await expect(
      markAsUnread(baseHandlerInput({ config: {} })),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});
