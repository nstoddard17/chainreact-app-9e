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
