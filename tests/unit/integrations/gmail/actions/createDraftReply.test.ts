/**
 * @jest-environment node
 *
 * Tests for the Gmail createDraftReply action handler.
 *
 * The handler makes TWO refreshAndRetry-wrapped API calls:
 *   1. usersMessagesGet to fetch the original message metadata.
 *   2. usersDraftsCreate to write the threaded draft.
 *
 * Both are mocked at the API-wrapper boundary. refreshAndRetry is
 * mocked to immediately invoke the apiCall so the closure shape is
 * exercised.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { UsersMessagesGetResult } from "@/integrations/gmail/api/usersMessagesGet";

const mockRefreshAndRetry = jest.fn();
const mockUsersMessagesGet = jest.fn();
const mockUsersDraftsCreate = jest.fn();

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

jest.mock("@/integrations/gmail/api/usersMessagesGet", () => ({
  usersMessagesGet: (...args: unknown[]) => mockUsersMessagesGet(...args),
}));

jest.mock("@/integrations/gmail/api/usersDraftsCreate", () => ({
  usersDraftsCreate: (...args: unknown[]) => mockUsersDraftsCreate(...args),
}));

import { createDraftReply } from "@/integrations/gmail/actions/createDraftReply";
import { CreateDraftReplyConfigSchema } from "@/integrations/gmail/actions/createDraftReply.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersMessagesGet.mockReset();
  mockUsersDraftsCreate.mockReset();
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

function makeOriginal(overrides: Partial<UsersMessagesGetResult> = {}): UsersMessagesGetResult {
  return {
    id: "orig-1",
    threadId: overrides.threadId ?? "thr-orig",
    labelIds: overrides.labelIds ?? ["INBOX"],
    snippet: "...",
    internalDate: "1700000000000",
    sizeEstimate: 1024,
    payload: {
      mimeType: overrides.payload?.mimeType ?? "text/plain",
      headers: overrides.payload?.headers ?? [
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "me@example.com" },
        { name: "Subject", value: "Original topic" },
        { name: "Message-ID", value: "<orig-msg-id@example.com>" },
      ],
    },
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
    nodeId: "node-create-draft-reply",
    config: overrides.config ?? {
      originalMessageId: "orig-1",
      textBody: "My reply.",
    },
    triggerEvent: makeGmailTriggerEvent("me@example.com"),
  };
}

// Helper: drive the wrapper to call apiCall with a fake token, route
// API helpers via the mocks. Both API calls share this implementation.
function wireRefreshAndRetry() {
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    },
  );
}

describe("createDraftReply — lookup + reply context", () => {
  it("calls usersMessagesGet first with the originalMessageId", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());
    mockUsersDraftsCreate.mockResolvedValueOnce({
      id: "draft-1",
      message: { id: "msg-new", threadId: "thr-orig", labelIds: ["DRAFT"] },
    });

    await createDraftReply(baseHandlerInput());

    expect(mockUsersMessagesGet).toHaveBeenCalledTimes(1);
    const getArgs = mockUsersMessagesGet.mock.calls[0]![0];
    expect(getArgs.accessToken).toBe("token");
    expect(getArgs.messageId).toBe("orig-1");
  });

  it("creates the draft with threadId derived from the original (NOT from caller config)", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesGet.mockResolvedValueOnce(
      makeOriginal({ threadId: "thr-original-conversation" }),
    );
    mockUsersDraftsCreate.mockResolvedValueOnce({
      id: "draft-1",
      message: {
        id: "msg-new",
        threadId: "thr-original-conversation",
      },
    });

    await createDraftReply(baseHandlerInput());

    expect(mockUsersDraftsCreate).toHaveBeenCalledTimes(1);
    const args = mockUsersDraftsCreate.mock.calls[0]![0];
    expect(args.threadId).toBe("thr-original-conversation");
  });
});

describe("createDraftReply — reply MIME shape", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersDraftsCreate.mockResolvedValue({
      id: "draft-1",
      message: {
        id: "msg-new",
        threadId: "thr-orig",
        labelIds: ["DRAFT"],
      },
    });
  });

  it("sets To to the original From header (display-name form preserved)", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());
    await createDraftReply(baseHandlerInput());

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("To: Alice <alice@example.com>\r\n");
  });

  it("auto-prefixes Subject with 'Re: ' when no custom subject is supplied", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());
    await createDraftReply(baseHandlerInput());

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Subject: Re: Original topic\r\n");
  });

  it("uses caller-supplied custom subject when provided", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());

    await createDraftReply(
      baseHandlerInput({
        config: {
          originalMessageId: "orig-1",
          textBody: "x",
          subject: "Explicit override",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Subject: Explicit override\r\n");
  });

  it("emits In-Reply-To and References from the original Message-ID", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());
    await createDraftReply(baseHandlerInput());

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain(
      "In-Reply-To: <orig-msg-id@example.com>\r\n",
    );
    expect(decoded).toContain(
      "References: <orig-msg-id@example.com>\r\n",
    );
  });

  it("normalizes additional cc / bcc via parseRecipients", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());

    await createDraftReply(
      baseHandlerInput({
        config: {
          originalMessageId: "orig-1",
          textBody: "x",
          cc: ["c1@x.com", "c2@x.com,c3@x.com"],
          bcc: "b@x.com",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Cc: c1@x.com, c2@x.com, c3@x.com\r\n");
    expect(decoded).toContain("Bcc: b@x.com\r\n");
  });

  it("appends signature to textBody and htmlBody with V1-faithful separators", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());

    await createDraftReply(
      baseHandlerInput({
        config: {
          originalMessageId: "orig-1",
          textBody: "Reply body.",
          htmlBody: "<p>Reply body.</p>",
          signature: "[SIG]",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Reply body.\n\n[SIG]");
    expect(decoded).toContain("<p>Reply body.</p><br><br>[SIG]");
  });

  it("emits Reply-To when configured", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());

    await createDraftReply(
      baseHandlerInput({
        config: {
          originalMessageId: "orig-1",
          textBody: "x",
          replyTo: "noreply@chainreact.app",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Reply-To: noreply@chainreact.app\r\n");
  });
});

describe("createDraftReply — output shape", () => {
  it("returns { draftId, messageId, threadId, replyingTo, subject }", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());
    mockUsersDraftsCreate.mockResolvedValueOnce({
      id: "draft-77",
      message: {
        id: "msg-77",
        threadId: "thr-orig",
        labelIds: ["DRAFT"],
      },
    });

    const result = await createDraftReply(baseHandlerInput());

    expect(result).toEqual({
      output: {
        draftId: "draft-77",
        messageId: "msg-77",
        threadId: "thr-orig",
        replyingTo: "orig-1",
        subject: "Re: Original topic",
      },
    });
  });
});

describe("createDraftReply — error propagation", () => {
  it("throws ZodError when originalMessageId is missing", async () => {
    await expect(
      createDraftReply(
        baseHandlerInput({
          config: { textBody: "x" },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates lookup failure (does not attempt drafts.create)", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesGet.mockRejectedValueOnce(
      new Error("Gmail messages.get failed: Not Found"),
    );

    await expect(createDraftReply(baseHandlerInput())).rejects.toThrow(
      /Not Found/,
    );
    expect(mockUsersDraftsCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling createDraftReply.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the Gmail create_draft_reply config schema.
// ---------------------------------------------------------------------------

describe("CreateDraftReplyConfigSchema", () => {
  it("accepts a minimal valid config (originalMessageId + textBody)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "My reply.",
    });
    expect(r.success).toBe(true);
  });

  it("accepts htmlBody only", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      htmlBody: "<p>Reply.</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts both bodies (multipart/alternative reply)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "Plain.",
      htmlBody: "<p>HTML.</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts optional subject override", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      subject: "Custom Re: subject",
    });
    expect(r.success).toBe(true);
  });

  it("accepts cc + bcc as strings OR arrays (P-G2)", () => {
    expect(
      CreateDraftReplyConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        cc: "c@x.com",
        bcc: "b@x.com",
      }).success,
    ).toBe(true);
    expect(
      CreateDraftReplyConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        cc: ["c1@x.com", "c2@x.com"],
        bcc: ["b1@x.com"],
      }).success,
    ).toBe(true);
  });

  it("accepts replyTo + signature", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      replyTo: "noreply@example.com",
      signature: "— ChainReact",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when originalMessageId is missing", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when originalMessageId is empty string", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when no body provided", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when both bodies are empty strings", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "",
      htmlBody: "",
    });
    expect(r.success).toBe(false);
  });

  // Dropped fields — strict mode rejects.

  it("rejects threadId override (V2 always uses lookup-derived threadId)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      threadId: "thr-explicit",
    });
    expect(r.success).toBe(false);
  });

  it("rejects replyAll (deferred — V1 logic was unclean)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      replyAll: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects attachments (DEFERRED to Gmail 2.3 / P-S3)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      attachments: [{ filename: "x.pdf" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects labels (drafts don't take labels-on-send)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      labels: ["INBOX"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects scheduleSend / trackOpens / trackClicks", () => {
    for (const dropped of ["scheduleSend", "trackOpens", "trackClicks"] as const) {
      const r = CreateDraftReplyConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        [dropped]: true,
      });
      expect(r.success).toBe(false);
    }
  });
});
