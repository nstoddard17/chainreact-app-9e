/**
 * @jest-environment node
 *
 * Tests for the Gmail sendEmail action handler. Mocks refreshAndRetry +
 * usersMessagesSend so the handler's apiCall closure can be exercised
 * without coupling to the real wrapper or HTTP layer (those have their
 * own dedicated test suites).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUsersMessagesSend = jest.fn();
const mockUsersMessagesModify = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  // Re-export error classes (the handler doesn't import them directly,
  // but type-only imports flow through; provide so dispatcher imports
  // resolve cleanly in the rest of the module graph).
  Unauthorized401Error: class extends Error {
    constructor(message?: string) {
      super(message);
      this.name = "Unauthorized401Error";
    }
  },
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersMessagesSend", () => ({
  usersMessagesSend: (...args: unknown[]) => mockUsersMessagesSend(...args),
}));

jest.mock("@/integrations/gmail/api/usersMessagesModify", () => ({
  usersMessagesModify: (...args: unknown[]) => mockUsersMessagesModify(...args),
}));

import {
  GmailLabelsOnSendError,
  sendEmail,
} from "@/integrations/gmail/actions/sendEmail";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersMessagesSend.mockReset();
  mockUsersMessagesModify.mockReset();
});

function makeGmailTriggerEvent(providerAccountId: string): TriggerEvent {
  return {
    provider: "gmail",
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-07T12:00:00Z",
    providerAccountId,
    payload: {},
  };
}

function makeNonGmailTriggerEvent(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "message_received",
    eventId: "evt-2",
    occurredAt: "2026-05-07T12:00:00Z",
    providerAccountId: "T123",
    payload: {},
  };
}

function baseHandlerInput(overrides: { config?: Record<string, unknown>; triggerEvent?: TriggerEvent } = {}) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "node-send",
    config: overrides.config ?? {
      to: "alice@example.com",
      subject: "Hello",
      textBody: "Plain body.",
    },
    triggerEvent: overrides.triggerEvent ?? makeGmailTriggerEvent("alice@example.com"),
  };
}

describe("sendEmail — refreshAndRetry usage", () => {
  it("calls refreshAndRetry with userId, provider 'gmail', and accountId from a Gmail trigger event", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "msg-1",
      threadId: "thr-1",
    });

    await sendEmail(baseHandlerInput());

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.accountId).toBe("acct-user-1");
    expect(call.provider).toBe("gmail");
    expect(call.providerAccountId).toBe("alice@example.com");
    expect(typeof call.apiCall).toBe("function");
  });

  it("passes accountId: null when the trigger event is not Gmail-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ id: "m", threadId: "t" });

    await sendEmail(
      baseHandlerInput({ triggerEvent: makeNonGmailTriggerEvent() }),
    );

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBeNull();
  });
});

describe("sendEmail — apiCall closure builds RFC 5322 + calls Gmail API", () => {
  it("invokes usersMessagesSend with the provided access token and a base64url raw message", async () => {
    // Drive the wrapper's apiCall callback with a fake token; capture
    // what usersMessagesSend received.
    mockRefreshAndRetry.mockImplementation(async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("ya29.live-token");
    });
    mockUsersMessagesSend.mockResolvedValueOnce({
      id: "msg-99",
      threadId: "thr-99",
    });

    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "Hi",
          textBody: "Plain body.",
        },
      }),
    );

    expect(mockUsersMessagesSend).toHaveBeenCalledTimes(1);
    const sendArgs = mockUsersMessagesSend.mock.calls[0]![0];
    expect(sendArgs.accessToken).toBe("ya29.live-token");

    // rawMessage is base64url-encoded RFC 5322 — decode and check headers
    const decoded = Buffer.from(sendArgs.rawMessage, "base64url").toString("utf8");
    expect(decoded).toContain("To: alice@example.com\r\n");
    expect(decoded).toContain("Subject: Hi\r\n");
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"\r\n');
    expect(decoded).toContain("\r\n\r\nPlain body.");
  });

  it("builds multipart/alternative when both textBody and htmlBody are provided", async () => {
    mockRefreshAndRetry.mockImplementation(async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    });
    mockUsersMessagesSend.mockResolvedValueOnce({ id: "m", threadId: "t" });

    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "Both",
          textBody: "Plain.",
          htmlBody: "<p>HTML.</p>",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Content-Type: multipart/alternative;");
    expect(decoded).toContain("Plain.");
    expect(decoded).toContain("<p>HTML.</p>");
    // text part comes before html part
    expect(decoded.indexOf("Plain.")).toBeLessThan(decoded.indexOf("<p>HTML.</p>"));
  });

  it("includes Cc and Bcc when provided in config", async () => {
    mockRefreshAndRetry.mockImplementation(async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    });
    mockUsersMessagesSend.mockResolvedValueOnce({ id: "m", threadId: "t" });

    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
          cc: "carbon@example.com",
          bcc: "blind@example.com",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Cc: carbon@example.com\r\n");
    expect(decoded).toContain("Bcc: blind@example.com\r\n");
  });
});

describe("sendEmail — output shape (Decision 2d-4 + Gmail 2.1 Commit 2 labelIds)", () => {
  it("returns { id, threadId, to, subject } when send response has no labelIds", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "msg-99",
      threadId: "thr-99",
    });

    const result = await sendEmail(
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
        id: "msg-99",
        threadId: "thr-99",
        to: "alice@example.com",
        subject: "Hello",
      },
    });
  });

  it("echoes send-response labelIds in output when no `labels` config (no modify call)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["SENT"],
    });

    const result = await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "Hello",
          textBody: "B",
        },
      }),
    );

    expect(result.output.labelIds).toEqual(["SENT"]);
    // refreshAndRetry was called only for send, not modify
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockUsersMessagesModify).not.toHaveBeenCalled();
  });
});

describe("sendEmail — Q7 parseRecipients normalization (P-G2)", () => {
  beforeEach(() => {
    mockRefreshAndRetry.mockImplementation(async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    });
    mockUsersMessagesSend.mockResolvedValue({ id: "m", threadId: "t" });
  });

  it("splits a CSV string in `to` and joins as a single RFC 5322 header", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com,bob@example.com , carol@example.com",
          subject: "S",
          textBody: "B",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain(
      "To: alice@example.com, bob@example.com, carol@example.com\r\n",
    );
  });

  it("accepts a string array in `to` and joins for the header", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: ["alice@example.com", "bob@example.com"],
          subject: "S",
          textBody: "B",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("To: alice@example.com, bob@example.com\r\n");
  });

  it("flattens mixed CSV-in-array shapes", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: ["alice@example.com,bob@example.com", "carol@example.com"],
          subject: "S",
          textBody: "B",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain(
      "To: alice@example.com, bob@example.com, carol@example.com\r\n",
    );
  });

  it("normalizes cc and bcc CSV strings the same way", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
          cc: "c1@example.com, c2@example.com",
          bcc: ["b1@example.com", "b2@example.com"],
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Cc: c1@example.com, c2@example.com\r\n");
    expect(decoded).toContain("Bcc: b1@example.com, b2@example.com\r\n");
  });

  it("omits the Cc header when cc parses to []", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
          cc: "   ,  , ", // whitespace-only CSV → []
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).not.toContain("Cc:");
  });

  it("throws when `to` is a whitespace-only CSV (post-parse empty)", async () => {
    await expect(
      sendEmail(
        baseHandlerInput({
          config: {
            to: "   ,  , ",
            subject: "S",
            textBody: "B",
          },
        }),
      ),
    ).rejects.toThrow(/at least one address in `to` is required/);

    // refreshAndRetry never invoked when post-parse to[] is empty.
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

describe("sendEmail — Gmail 2.1 Commit 2: replyTo, signature, labels-on-send", () => {
  beforeEach(() => {
    mockRefreshAndRetry.mockImplementation(
      async (input: { apiCall: (t: string) => Promise<unknown> }) => {
        return await input.apiCall("token");
      },
    );
    mockUsersMessagesSend.mockResolvedValue({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["SENT"],
    });
    mockUsersMessagesModify.mockResolvedValue({
      id: "msg-1",
      threadId: "thr-1",
      labelIds: ["SENT", "Label_5", "Label_6"],
    });
  });

  // replyTo

  it("includes Reply-To header when replyTo is provided", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
          replyTo: "noreply@example.com",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Reply-To: noreply@example.com\r\n");
  });

  it("omits Reply-To header when replyTo is absent", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).not.toContain("Reply-To:");
  });

  // signature appending

  it("appends signature to textBody with `\\n\\n` separator (matches V1 sendEmail.ts:164)", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "Body line.",
          signature: "— Sent via ChainReact",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    // V1-faithful LF-only separator inside the body. RFC 5322 headers
    // still use CRLF (joined by the RFC builder); the body bytes are
    // preserved verbatim — same shape every email client accepts.
    expect(decoded).toContain("Body line.\n\n— Sent via ChainReact");
    // ensure no HTML-ification crept in: textBody path keeps text/plain
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
  });

  it("appends signature to htmlBody with `<br><br>` separator (no plaintext conversion)", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          htmlBody: "<p>Body.</p>",
          signature: "<p>— ChainReact</p>",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("<p>Body.</p><br><br><p>— ChainReact</p>");
    expect(decoded).toContain('Content-Type: text/html; charset="UTF-8"');
  });

  it("appends signature to BOTH bodies independently when both provided (multipart/alternative)", async () => {
    await sendEmail(
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
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Plain.\n\n[SIG]");
    expect(decoded).toContain("<p>HTML.</p><br><br>[SIG]");
    expect(decoded).toContain("Content-Type: multipart/alternative;");
  });

  it("does not silently HTML-ify textBody when signature contains HTML-looking bytes", async () => {
    // G-R6 regression guard — V1 auto-detected HTML in the body string.
    // V2 keeps textBody as text/plain regardless of signature content.
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "Hello",
          signature: "<p>look HTML-ish</p>",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    // signature is appended verbatim; this is "user-facing weird" but
    // explicit per the schema contract (workflow author chose textBody)
    expect(decoded).toContain("Hello\n\n<p>look HTML-ish</p>");
  });

  // labels-on-send

  it("calls users.messages.modify with addLabelIds after a successful send", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
          labels: ["Label_5", "Label_6"],
        },
      }),
    );

    // refreshAndRetry called twice: once for send, once for modify
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    expect(mockUsersMessagesModify).toHaveBeenCalledTimes(1);
    const modifyArgs = mockUsersMessagesModify.mock.calls[0]![0];
    expect(modifyArgs).toEqual({
      accessToken: "token",
      messageId: "msg-1",
      addLabelIds: ["Label_5", "Label_6"],
    });
  });

  it("omits the modify call when no labels are configured", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
        },
      }),
    );

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockUsersMessagesModify).not.toHaveBeenCalled();
  });

  it("omits the modify call when labels is an empty array (zero-length skip)", async () => {
    await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
          labels: [],
        },
      }),
    );

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockUsersMessagesModify).not.toHaveBeenCalled();
  });

  it("returns labelIds from the modify response when labels are applied", async () => {
    const result = await sendEmail(
      baseHandlerInput({
        config: {
          to: "alice@example.com",
          subject: "S",
          textBody: "B",
          labels: ["Label_5", "Label_6"],
        },
      }),
    );

    expect(result.output.labelIds).toEqual(["SENT", "Label_5", "Label_6"]);
  });

  it("throws GmailLabelsOnSendError if modify fails after send succeeds (honest failure — no silent swallow)", async () => {
    mockUsersMessagesModify.mockRejectedValueOnce(
      new Error("Gmail modify failed: Invalid label ID."),
    );

    let caught: unknown = null;
    try {
      await sendEmail(
        baseHandlerInput({
          config: {
            to: "alice@example.com",
            subject: "S",
            textBody: "B",
            labels: ["bad_label"],
          },
        }),
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GmailLabelsOnSendError);
    const labelsErr = caught as GmailLabelsOnSendError;
    // Error message names the sent message id so operators can correlate
    expect(labelsErr.message).toContain("msg-1");
    expect(labelsErr.message).toContain("Invalid label ID");
    expect(labelsErr.messageId).toBe("msg-1");
    expect(labelsErr.threadId).toBe("thr-1");
    // send still happened — that's not the part that failed
    expect(mockUsersMessagesSend).toHaveBeenCalledTimes(1);
  });
});

describe("sendEmail — error propagation", () => {
  it("throws ZodError when the config is invalid (no body)", async () => {
    await expect(
      sendEmail(
        baseHandlerInput({
          config: {
            to: "alice@example.com",
            subject: "S",
            // neither textBody nor htmlBody
          },
        }),
      ),
    ).rejects.toThrow();
    // refreshAndRetry never invoked when schema parse fails.
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates errors from refreshAndRetry untouched", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("Gmail send failed: invalid_recipient"));
    await expect(sendEmail(baseHandlerInput())).rejects.toThrow(/invalid_recipient/);
  });
});
