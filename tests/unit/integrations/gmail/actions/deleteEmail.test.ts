/**
 * @jest-environment node
 *
 * Tests for the Gmail deleteEmail action handler. Pins the
 * mode-dispatch contract:
 *   - deleteMode="trash"     → usersMessagesTrash (NOT delete)
 *   - deleteMode="permanent" → usersMessagesDelete (NOT trash)
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUsersMessagesTrash = jest.fn();
const mockUsersMessagesDelete = jest.fn();

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

jest.mock("@/integrations/gmail/api/usersMessagesTrash", () => ({
  usersMessagesTrash: (...args: unknown[]) => mockUsersMessagesTrash(...args),
}));

jest.mock("@/integrations/gmail/api/usersMessagesDelete", () => ({
  usersMessagesDelete: (...args: unknown[]) => mockUsersMessagesDelete(...args),
}));

import { deleteEmail } from "@/integrations/gmail/actions/deleteEmail";
import { DeleteEmailConfigSchema } from "@/integrations/gmail/actions/deleteEmail.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersMessagesTrash.mockReset();
  mockUsersMessagesDelete.mockReset();
});

function makeGmailTriggerEvent(): TriggerEvent {
  return {
    provider: "gmail",
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-12T12:00:00Z",
    providerAccountId: "me@example.com",
    payload: {},
  };
}

function baseHandlerInput(overrides: {
  config?: Record<string, unknown>;
} = {}) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "node-delete",
    config: overrides.config ?? { messageId: "msg-1", deleteMode: "trash" },
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

describe("deleteEmail — trash mode", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersMessagesTrash.mockResolvedValue({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["TRASH"],
    });
  });

  it("calls usersMessagesTrash (NOT usersMessagesDelete)", async () => {
    await deleteEmail(
      baseHandlerInput({
        config: { messageId: "msg-1", deleteMode: "trash" },
      }),
    );

    expect(mockUsersMessagesTrash).toHaveBeenCalledTimes(1);
    expect(mockUsersMessagesTrash.mock.calls[0]![0]).toEqual({
      accessToken: "token",
      messageId: "msg-1",
    });
    expect(mockUsersMessagesDelete).not.toHaveBeenCalled();
  });

  it("returns { messageId, threadId, labelIds, deleteMode: 'trash' }", async () => {
    const result = await deleteEmail(
      baseHandlerInput({
        config: { messageId: "msg-1", deleteMode: "trash" },
      }),
    );

    expect(result).toEqual({
      output: {
        messageId: "msg-1",
        threadId: "thr-1",
        labelIds: ["TRASH"],
        deleteMode: "trash",
      },
    });
  });

  it("routes through refreshAndRetry with Gmail accountId", async () => {
    await deleteEmail(
      baseHandlerInput({
        config: { messageId: "msg-1", deleteMode: "trash" },
      }),
    );

    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.provider).toBe("gmail");
    expect(call.providerAccountId).toBe("me@example.com");
  });
});

describe("deleteEmail — permanent mode", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersMessagesDelete.mockResolvedValue({ messageId: "msg-2" });
  });

  it("calls usersMessagesDelete (NOT usersMessagesTrash)", async () => {
    await deleteEmail(
      baseHandlerInput({
        config: { messageId: "msg-2", deleteMode: "permanent" },
      }),
    );

    expect(mockUsersMessagesDelete).toHaveBeenCalledTimes(1);
    expect(mockUsersMessagesDelete.mock.calls[0]![0]).toEqual({
      accessToken: "token",
      messageId: "msg-2",
    });
    expect(mockUsersMessagesTrash).not.toHaveBeenCalled();
  });

  it("returns { messageId, deleteMode: 'permanent' } — no threadId / labelIds (204 response)", async () => {
    const result = await deleteEmail(
      baseHandlerInput({
        config: { messageId: "msg-2", deleteMode: "permanent" },
      }),
    );

    expect(result).toEqual({
      output: {
        messageId: "msg-2",
        deleteMode: "permanent",
      },
    });
  });
});

describe("deleteEmail — error propagation", () => {
  it("throws ZodError when deleteMode is missing (decision 2 — no silent default)", async () => {
    await expect(
      deleteEmail(
        baseHandlerInput({
          config: { messageId: "msg-1" },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
    expect(mockUsersMessagesTrash).not.toHaveBeenCalled();
    expect(mockUsersMessagesDelete).not.toHaveBeenCalled();
  });

  it("throws ZodError when deleteMode is an invalid enum", async () => {
    await expect(
      deleteEmail(
        baseHandlerInput({
          config: { messageId: "msg-1", deleteMode: "soft" },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates trash-path errors untouched", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesTrash.mockRejectedValueOnce(
      new Error("Gmail trash failed: Not Found"),
    );

    await expect(
      deleteEmail(
        baseHandlerInput({
          config: { messageId: "missing", deleteMode: "trash" },
        }),
      ),
    ).rejects.toThrow(/trash failed: Not Found/);
  });

  it("propagates permanent-path errors untouched", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesDelete.mockRejectedValueOnce(
      new Error("Gmail delete failed: PERMISSION_DENIED"),
    );

    await expect(
      deleteEmail(
        baseHandlerInput({
          config: { messageId: "msg-x", deleteMode: "permanent" },
        }),
      ),
    ).rejects.toThrow(/delete failed: PERMISSION_DENIED/);
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling deleteEmail.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the Gmail delete_email config schema. Pins decision 2:
// `deleteMode` is REQUIRED with no silent default.
// ---------------------------------------------------------------------------

describe("DeleteEmailConfigSchema", () => {
  it("accepts deleteMode: 'trash'", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({
        messageId: "msg-1",
        deleteMode: "trash",
      }).success,
    ).toBe(true);
  });

  it("accepts deleteMode: 'permanent'", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({
        messageId: "msg-1",
        deleteMode: "permanent",
      }).success,
    ).toBe(true);
  });

  it("REJECTS when deleteMode is missing (decision 2 — no silent default)", () => {
    const r = DeleteEmailConfigSchema.safeParse({ messageId: "msg-1" });
    expect(r.success).toBe(false);
  });

  it("rejects deleteMode: invalid enum value", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: "msg-1",
      deleteMode: "soft",
    });
    expect(r.success).toBe(false);
  });

  it("rejects deleteMode as boolean (V1 `permanentDelete: boolean` shape dropped)", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: "msg-1",
      deleteMode: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects V1 `permanentDelete` field at top level", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: "msg-1",
      permanentDelete: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects when messageId is missing", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({ deleteMode: "trash" }).success,
    ).toBe(false);
  });

  it("rejects when messageId is empty string", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({
        messageId: "",
        deleteMode: "trash",
      }).success,
    ).toBe(false);
  });

  it("rejects messageId as an array (V1 batch shape dropped)", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: ["m1", "m2"],
      deleteMode: "trash",
    });
    expect(r.success).toBe(false);
  });

  it("rejects searchQuery (V1 bulk-delete-by-search dropped)", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: "msg-1",
      deleteMode: "trash",
      searchQuery: "is:spam",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({
        messageId: "msg-1",
        deleteMode: "trash",
        confirm: true,
      }).success,
    ).toBe(false);
  });
});
