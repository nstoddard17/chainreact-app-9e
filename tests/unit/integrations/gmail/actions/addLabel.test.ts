/**
 * @jest-environment node
 *
 * Tests for the Gmail addLabel action handler.
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

import { addLabel } from "@/integrations/gmail/actions/addLabel";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersMessagesModify.mockReset();
});

function makeGmailTriggerEvent(providerAccountId: string): TriggerEvent {
  return {
    provider: "gmail",
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-12T12:00:00Z",
    providerAccountId,
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
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "node-add-label",
    config: overrides.config ?? {
      messageId: "msg-1",
      labelIds: ["Label_5", "INBOX"],
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

describe("addLabel — refreshAndRetry + accountId routing", () => {
  it("calls refreshAndRetry with userId / provider 'gmail' / accountId from Gmail trigger", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["INBOX", "Label_5"],
    });

    await addLabel(baseHandlerInput());

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.userId).toBe("user-1");
    expect(call.provider).toBe("gmail");
    expect(call.accountId).toBe("me@example.com");
  });

  it("passes providerAccountId: null when the trigger event is not Gmail-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "m",
      threadId: "t",
      labelIds: [],
    });

    await addLabel(
      baseHandlerInput({
        triggerEvent: {
          provider: "slack",
          eventType: "x",
          eventId: "e",
          occurredAt: "2026-05-12T12:00:00Z",
          providerAccountId: "T1",
          payload: {},
        },
      }),
    );

    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBeNull();
  });
});

describe("addLabel — apiCall builds users.messages.modify request", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersMessagesModify.mockResolvedValue({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["INBOX", "Label_5", "Label_6"],
    });
  });

  it("calls usersMessagesModify with addLabelIds (no removeLabelIds)", async () => {
    await addLabel(
      baseHandlerInput({
        config: { messageId: "msg-1", labelIds: ["Label_5", "Label_6"] },
      }),
    );

    expect(mockUsersMessagesModify).toHaveBeenCalledTimes(1);
    const args = mockUsersMessagesModify.mock.calls[0]![0];
    expect(args).toEqual({
      accessToken: "token",
      messageId: "msg-1",
      addLabelIds: ["Label_5", "Label_6"],
    });
    expect(args.removeLabelIds).toBeUndefined();
  });
});

describe("addLabel — output shape", () => {
  it("returns { messageId, threadId, labelIds } from the modify response", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "msg-99",
      threadId: "thr-99",
      labelIds: ["SENT", "Label_5", "INBOX"],
    });

    const result = await addLabel(baseHandlerInput());

    expect(result).toEqual({
      output: {
        messageId: "msg-99",
        threadId: "thr-99",
        labelIds: ["SENT", "Label_5", "INBOX"],
      },
    });
  });
});

describe("addLabel — error propagation", () => {
  it("throws ZodError when messageId is missing", async () => {
    await expect(
      addLabel(
        baseHandlerInput({
          config: { labelIds: ["L"] },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws ZodError when labelIds is empty", async () => {
    await expect(
      addLabel(
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
    await expect(addLabel(baseHandlerInput())).rejects.toThrow(
      /Invalid label ID/,
    );
  });
});
