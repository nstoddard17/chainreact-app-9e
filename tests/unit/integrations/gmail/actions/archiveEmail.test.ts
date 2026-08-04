/**
 * @jest-environment node
 *
 * Tests for the Gmail archiveEmail action handler. Mirror of
 * markAsRead with removeLabelIds: ["INBOX"] instead.
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

import { archiveEmail } from "@/integrations/gmail/actions/archiveEmail";
import { ArchiveEmailConfigSchema } from "@/integrations/gmail/actions/archiveEmail.schema";

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
    nodeId: "node-archive",
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

describe("archiveEmail — happy path", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersMessagesModify.mockResolvedValue({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["UNREAD"], // INBOX has been removed
    });
  });

  it("calls usersMessagesModify with removeLabelIds: ['INBOX']", async () => {
    await archiveEmail(baseHandlerInput());

    const args = mockUsersMessagesModify.mock.calls[0]![0];
    expect(args.removeLabelIds).toEqual(["INBOX"]);
    expect(args.addLabelIds).toBeUndefined();
    expect(args.messageId).toBe("msg-1");
  });

  it("returns { messageId, threadId, labelIds } reflecting post-archive state", async () => {
    mockUsersMessagesModify.mockResolvedValueOnce({
      id: "msg-3",
      threadId: "thr-3",
      labelIds: ["SENT", "Label_5"],
    });

    const result = await archiveEmail(baseHandlerInput());

    expect(result).toEqual({
      output: {
        messageId: "msg-3",
        threadId: "thr-3",
        labelIds: ["SENT", "Label_5"],
      },
    });
  });
});

describe("archiveEmail — error propagation", () => {
  it("throws ZodError when messageId is missing", async () => {
    await expect(
      archiveEmail(baseHandlerInput({ config: {} })),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling archiveEmail.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the Gmail archive_email config schema.
// ---------------------------------------------------------------------------

describe("ArchiveEmailConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    expect(
      ArchiveEmailConfigSchema.safeParse({ messageId: "msg-1" }).success,
    ).toBe(true);
  });

  it("rejects when messageId is missing or empty", () => {
    expect(ArchiveEmailConfigSchema.safeParse({}).success).toBe(false);
    expect(
      ArchiveEmailConfigSchema.safeParse({ messageId: "" }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      ArchiveEmailConfigSchema.safeParse({
        messageId: "msg-1",
        applyToThread: true,
      }).success,
    ).toBe(false);
  });
});
