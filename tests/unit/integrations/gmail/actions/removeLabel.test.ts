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
import { RemoveLabelConfigSchema } from "@/integrations/gmail/actions/removeLabel.schema";

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
    expect(call.accountId).toBe("acct-user-1");
    expect(call.provider).toBe("gmail");
    expect(call.providerAccountId).toBe("me@example.com");
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

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling removeLabel.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the Gmail remove_label config schema. Same shape as
// addLabel — assert same accept/reject contract.
// ---------------------------------------------------------------------------

describe("RemoveLabelConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const r = RemoveLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["INBOX"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts multiple labelIds", () => {
    const r = RemoveLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["INBOX", "UNREAD"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects when messageId is missing or empty", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({ labelIds: ["L"] }).success,
    ).toBe(false);
    expect(
      RemoveLabelConfigSchema.safeParse({ messageId: "", labelIds: ["L"] })
        .success,
    ).toBe(false);
  });

  it("rejects when labelIds is missing or empty array", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({ messageId: "msg-1" }).success,
    ).toBe(false);
    expect(
      RemoveLabelConfigSchema.safeParse({ messageId: "msg-1", labelIds: [] })
        .success,
    ).toBe(false);
  });

  it("rejects when labelIds contains an empty string", () => {
    const r = RemoveLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["INBOX", ""],
    });
    expect(r.success).toBe(false);
  });

  it("rejects messageId as an array (V1 batch shape dropped)", () => {
    const r = RemoveLabelConfigSchema.safeParse({
      messageId: ["m1", "m2"],
      labelIds: ["L"],
    });
    expect(r.success).toBe(false);
  });

  // V1 conflations + unknown fields

  it("rejects applyToThread", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({
        messageId: "msg-1",
        labelIds: ["L"],
        applyToThread: true,
      }).success,
    ).toBe(false);
  });

  it("rejects searchQuery", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({
        messageId: "msg-1",
        labelIds: ["L"],
        searchQuery: "is:unread",
      }).success,
    ).toBe(false);
  });

  it("rejects `addLabels` (use add_label instead)", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({
        messageId: "msg-1",
        labelIds: ["L"],
        addLabels: ["X"],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({
        messageId: "msg-1",
        labelIds: ["L"],
        xCustom: "value",
      }).success,
    ).toBe(false);
  });
});
