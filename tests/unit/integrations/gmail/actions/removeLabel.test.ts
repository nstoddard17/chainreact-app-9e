/**
 * @jest-environment node
 *
 * Tests for the Gmail removeLabel action handler. Mirrors
 * addLabel.test.ts; only difference is the modify call uses
 * removeLabelIds instead of addLabelIds.
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

import { removeLabel } from "@/integrations/gmail/actions/removeLabel";

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
  triggerEvent?: TriggerEvent;
} = {}) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-1",
    nodeId: "node-remove-label",
    config: overrides.config ?? {
      messageId: "msg-1",
      labelIds: ["INBOX"],
    },
    triggerEvent: overrides.triggerEvent ?? makeGmailTriggerEvent("me@example.com"),
  };
}

function wireRefreshAndRetry() {
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    },
  );
}

describe("removeLabel — refreshAndRetry + accountId routing", () => {
  it("calls refreshAndRetry with userId / provider 'gmail' / accountId from Gmail trigger", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: [],
    });

    await removeLabel(baseHandlerInput());

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.userId).toBe("user-1");
    expect(call.provider).toBe("gmail");
    expect(call.accountId).toBe("me@example.com");
  });
});

describe("removeLabel — apiCall builds users.messages.modify request", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersMessagesModify.mockResolvedValue({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: [],
    });
  });

  it("calls usersMessagesModify with removeLabelIds (no addLabelIds)", async () => {
    await removeLabel(
      baseHandlerInput({
        config: { messageId: "msg-1", labelIds: ["INBOX", "UNREAD"] },
      }),
    );

    expect(mockUsersMessagesModify).toHaveBeenCalledTimes(1);
    const args = mockUsersMessagesModify.mock.calls[0]![0];
    expect(args).toEqual({
      accessToken: "token",
      messageId: "msg-1",
      removeLabelIds: ["INBOX", "UNREAD"],
    });
    expect(args.addLabelIds).toBeUndefined();
  });
});

describe("removeLabel — output shape", () => {
  it("returns { messageId, threadId, labelIds } from the modify response", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "msg-77",
      threadId: "thr-77",
      labelIds: ["SENT"],
    });

    const result = await removeLabel(baseHandlerInput());

    expect(result).toEqual({
      output: {
        messageId: "msg-77",
        threadId: "thr-77",
        labelIds: ["SENT"],
      },
    });
  });
});

describe("removeLabel — error propagation", () => {
  it("throws ZodError when messageId is missing", async () => {
    await expect(
      removeLabel(
        baseHandlerInput({
          config: { labelIds: ["L"] },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws ZodError when labelIds is empty", async () => {
    await expect(
      removeLabel(
        baseHandlerInput({
          config: { messageId: "msg-1", labelIds: [] },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates errors from refreshAndRetry untouched", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Gmail modify failed: Invalid label ID."),
    );
    await expect(removeLabel(baseHandlerInput())).rejects.toThrow(
      /Invalid label ID/,
    );
  });
});
