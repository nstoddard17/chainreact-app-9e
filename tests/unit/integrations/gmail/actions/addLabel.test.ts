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
import { AddLabelConfigSchema } from "@/integrations/gmail/actions/addLabel.schema";

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
    expect(call.accountId).toBe("acct-user-1");
    expect(call.provider).toBe("gmail");
    expect(call.providerAccountId).toBe("me@example.com");
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

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBeNull();
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

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling addLabel.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the Gmail add_label config schema. Validates the strict
// shape — every V1 conflation (createIfNotExists, applyToThread,
// searchQuery, name-based labels) is rejected at parse time.
// ---------------------------------------------------------------------------

describe("AddLabelConfigSchema", () => {
  it("accepts a minimal valid config (messageId + non-empty labelIds)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["Label_5"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts multiple labelIds", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["Label_5", "INBOX", "IMPORTANT"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects when messageId is missing", () => {
    const r = AddLabelConfigSchema.safeParse({ labelIds: ["L"] });
    expect(r.success).toBe(false);
  });

  it("rejects when messageId is empty string", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "",
      labelIds: ["L"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects when labelIds is missing", () => {
    const r = AddLabelConfigSchema.safeParse({ messageId: "msg-1" });
    expect(r.success).toBe(false);
  });

  it("rejects when labelIds is an empty array (must include at least one)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects when labelIds contains an empty-string id", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["INBOX", ""],
    });
    expect(r.success).toBe(false);
  });

  it("rejects messageId as an array (V1 batch shape dropped in V2)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: ["msg-1", "msg-2"],
      labelIds: ["L"],
    });
    expect(r.success).toBe(false);
  });

  // V1 conflations — all rejected by .strict()

  it("rejects createIfNotExists (V1 auto-create dropped — use create_label)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      createIfNotExists: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects autoCreate (alternative naming for V1's createIfNotExists)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      autoCreate: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects applyToThread (silent thread-level labeling dropped)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      applyToThread: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects searchQuery (V1's bulk-label-by-search compound action dropped)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      searchQuery: "is:unread",
    });
    expect(r.success).toBe(false);
  });

  it("rejects `labels` (V1 name list — V2 uses labelIds only)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labels: ["MyLabel"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects `addLabels` (V1 conflation — V2 uses labelIds only)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      addLabels: ["MyLabel"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects `removeLabels` (use remove_label action for inverse)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      removeLabels: ["X"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      xCustomField: "value",
    });
    expect(r.success).toBe(false);
  });
});
