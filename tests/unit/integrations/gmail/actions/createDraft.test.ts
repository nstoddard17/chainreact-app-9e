/**
 * @jest-environment node
 *
 * Tests for the Gmail createDraft action handler.
 *
 * Mock layout mirrors sendEmail.test.ts — refreshAndRetry and the
 * principal API wrapper (usersDraftsCreate) are mocked so the
 * handler's apiCall closure can be exercised without the real
 * wrapper / HTTP layer.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
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

jest.mock("@/integrations/gmail/api/usersDraftsCreate", () => ({
  usersDraftsCreate: (...args: unknown[]) => mockUsersDraftsCreate(...args),
}));

import { createDraft } from "@/integrations/gmail/actions/createDraft";
import { CreateDraftConfigSchema } from "@/integrations/gmail/actions/createDraft.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
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

function baseHandlerInput(overrides: {
  config?: Record<string, unknown>;
  triggerEvent?: TriggerEvent;
} = {}) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "node-create-draft",
    config: overrides.config ?? {
      to: "alice@example.com",
      subject: "Draft hello",
      textBody: "Draft body.",
    },
    triggerEvent: overrides.triggerEvent ?? makeGmailTriggerEvent("alice@example.com"),
  };
}

describe("createDraft — refreshAndRetry + accountId routing", () => {
  it("calls refreshAndRetry with userId / provider 'gmail' / accountId from Gmail trigger", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "draft-1",
      message: { id: "msg-1", threadId: "thr-1" },
    });

    await createDraft(baseHandlerInput());

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.accountId).toBe("acct-user-1");
    expect(call.provider).toBe("gmail");
    expect(call.providerAccountId).toBe("alice@example.com");
    expect(typeof call.apiCall).toBe("function");
  });

  it("passes providerAccountId: null when the trigger event is not Gmail-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "d",
      message: { id: "m", threadId: "t" },
    });

    await createDraft(
      baseHandlerInput({
        triggerEvent: {
          provider: "slack",
          eventType: "msg",
          eventId: "e",
          occurredAt: "2026-05-12T12:00:00Z",
          providerAccountId: "T123",
          payload: {},
        },
      }),
    );

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBeNull();
  });
});

describe("createDraft — apiCall builds MIME + calls usersDraftsCreate", () => {
  beforeEach(() => {
    mockRefreshAndRetry.mockImplementation(
      async (input: { apiCall: (t: string) => Promise<unknown> }) => {
        return await input.apiCall("token");
      },
    );
    mockUsersDraftsCreate.mockResolvedValue({
      id: "draft-1",
      message: { id: "msg-1", threadId: "thr-1", labelIds: ["DRAFT"] },
    });
  });

  it("invokes usersDraftsCreate with the access token + base64url raw message + NO threadId (new draft)", async () => {
    await createDraft(baseHandlerInput());

    expect(mockUsersDraftsCreate).toHaveBeenCalledTimes(1);
    const args = mockUsersDraftsCreate.mock.calls[0]![0];
    expect(args.accessToken).toBe("token");
    expect(typeof args.rawMessage).toBe("string");
    // New draft (not a reply) — handler must not pass threadId.
    expect(args.threadId).toBeUndefined();
  });

  it("builds the To / Subject / text body MIME shape", async () => {
    await createDraft(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "Draft hello",
          textBody: "Draft body.",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("To: alice@example.com\r\n");
    expect(decoded).toContain("Subject: Draft hello\r\n");
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).toContain("Draft body.");
  });

  it("normalizes recipients via parseRecipients (P-G2)", async () => {
    await createDraft(
      baseHandlerInput({
        config: {
          to: ["alice@x.com", "bob@x.com,carol@x.com"],
          subject: "S",
          textBody: "B",
          cc: "c1@x.com, c2@x.com",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain(
      "To: alice@x.com, bob@x.com, carol@x.com\r\n",
    );
    expect(decoded).toContain("Cc: c1@x.com, c2@x.com\r\n");
  });

  it("appends signature with V1-faithful separators (text + html)", async () => {
    await createDraft(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "Plain.",
          htmlBody: "<p>HTML.</p>",
          signature: "[SIG]",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Plain.\n\n[SIG]");
    expect(decoded).toContain("<p>HTML.</p><br><br>[SIG]");
  });

  it("emits Reply-To when configured", async () => {
    await createDraft(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
          replyTo: "support@chainreact.app",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Reply-To: support@chainreact.app\r\n");
  });

  it("does NOT emit In-Reply-To / References for a NEW draft (no thread context)", async () => {
    await createDraft(baseHandlerInput());

    const decoded = Buffer.from(
      mockUsersDraftsCreate.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).not.toContain("In-Reply-To:");
    expect(decoded).not.toContain("References:");
  });
});

describe("createDraft — output shape", () => {
  it("returns { draftId, messageId, threadId, to, subject } on success", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "draft-99",
      message: {
        id: "msg-99",
        threadId: "thr-99",
        labelIds: ["DRAFT"],
      },
    });

    const result = await createDraft(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "Hello",
          textBody: "B",
        },
      }),
    );

    expect(result).toEqual({
      output: {
        draftId: "draft-99",
        messageId: "msg-99",
        threadId: "thr-99",
        to: "alice@example.com",
        subject: "Hello",
      },
    });
  });
});

describe("createDraft — error propagation", () => {
  it("throws ZodError when no body is provided", async () => {
    await expect(
      createDraft(
        baseHandlerInput({
          config: { to: "alice@example.com", subject: "S" },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws when `to` parses to [] after Q7 normalization", async () => {
    await expect(
      createDraft(
        baseHandlerInput({
          config: { to: "   ,  , ", subject: "S", textBody: "B" },
        }),
      ),
    ).rejects.toThrow(/at least one address in `to` is required/);
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates errors from refreshAndRetry untouched", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Gmail drafts.create failed: invalid_recipient"),
    );
    await expect(createDraft(baseHandlerInput())).rejects.toThrow(
      /invalid_recipient/,
    );
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling createDraft.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the Gmail create_draft config schema. The engine
// pre-resolves every `{{...}}` reference before this schema runs;
// validation here is defense-in-depth.
// Pattern mirrors `sendEmail.schema.test.ts` because create_draft
// shares most of send_email's schema shape (minus `labels`).
// ---------------------------------------------------------------------------

describe("CreateDraftConfigSchema", () => {
  it("accepts a minimal valid config (textBody only)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "Hello there.",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a minimal valid config (htmlBody only)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      htmlBody: "<p>Hello.</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts both textBody and htmlBody", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "plain",
      htmlBody: "<p>html</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts cc and bcc as strings", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      cc: "carbon@example.com",
      bcc: "blind@example.com",
    });
    expect(r.success).toBe(true);
  });

  it("accepts cc and bcc as string arrays (P-G2)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      cc: ["c1@x.com", "c2@x.com"],
      bcc: ["b1@x.com"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts to as a string array", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: ["alice@x.com", "bob@x.com"],
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(true);
  });

  it("accepts empty subject string (matches send_email Slice 2d decision)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "",
      textBody: "x",
    });
    expect(r.success).toBe(true);
  });

  it("accepts replyTo + signature (shared with send_email Commit 2 expansion)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      replyTo: "noreply@example.com",
      signature: "— ChainReact",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when `to` is missing", () => {
    const r = CreateDraftConfigSchema.safeParse({
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when `to` is an empty string", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "",
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when `subject` is missing (must be present, may be empty)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when neither textBody nor htmlBody is provided", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when both bodies are empty strings", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "",
      htmlBody: "",
    });
    expect(r.success).toBe(false);
  });

  // Q11 / strict-mode rejection — drafts must NOT accept the same
  // dropped fields as send_email.

  it("rejects scheduleSend (Q11 — silent no-op field dropped)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      scheduleSend: "2026-06-01T12:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("rejects trackOpens / trackClicks", () => {
    expect(
      CreateDraftConfigSchema.safeParse({
        to: "alice@example.com",
        subject: "Hi",
        textBody: "x",
        trackOpens: true,
      }).success,
    ).toBe(false);
    expect(
      CreateDraftConfigSchema.safeParse({
        to: "alice@example.com",
        subject: "Hi",
        textBody: "x",
        trackClicks: true,
      }).success,
    ).toBe(false);
  });

  it("rejects attachments (DEFERRED to Gmail 2.3 / P-S3)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      attachments: [{ filename: "x.pdf", content: "..." }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects labels (labels-on-send is a send_email concern; drafts use add_label downstream)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      labels: ["INBOX"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a V1-style single `body` field (no auto-detect)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      body: "<p>HTML?</p>",
    });
    expect(r.success).toBe(false);
  });
});
