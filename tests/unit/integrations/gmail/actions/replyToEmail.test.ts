/**
 * @jest-environment node
 *
 * Tests for the Gmail replyToEmail action handler. Same overall
 * shape as createDraftReply, but the terminal API is
 * usersMessagesSend with threadId (not usersDraftsCreate).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { UsersMessagesGetResult } from "@/integrations/gmail/api/usersMessagesGet";

const mockRefreshAndRetry = jest.fn();
const mockUsersMessagesGet = jest.fn();
const mockUsersMessagesSend = jest.fn();

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

jest.mock("@/integrations/gmail/api/usersMessagesSend", () => ({
  usersMessagesSend: (...args: unknown[]) => mockUsersMessagesSend(...args),
}));

import { replyToEmail } from "@/integrations/gmail/actions/replyToEmail";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersMessagesGet.mockReset();
  mockUsersMessagesSend.mockReset();
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
    runId: "run-1",
    nodeId: "node-reply-to-email",
    config: overrides.config ?? {
      originalMessageId: "orig-1",
      textBody: "My reply.",
    },
    triggerEvent: makeGmailTriggerEvent("me@example.com"),
  };
}

function wireRefreshAndRetry() {
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    },
  );
}

describe("replyToEmail — lookup + threaded send", () => {
  it("calls usersMessagesGet first with originalMessageId, then usersMessagesSend with threadId from the lookup", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesGet.mockResolvedValueOnce(
      makeOriginal({ threadId: "thr-from-original" }),
    );
    mockUsersMessagesSend.mockResolvedValueOnce({
      id: "msg-new",
      threadId: "thr-from-original",
      labelIds: ["SENT"],
    });

    await replyToEmail(baseHandlerInput());

    expect(mockUsersMessagesGet).toHaveBeenCalledTimes(1);
    expect(mockUsersMessagesGet.mock.calls[0]![0].messageId).toBe("orig-1");

    expect(mockUsersMessagesSend).toHaveBeenCalledTimes(1);
    const sendArgs = mockUsersMessagesSend.mock.calls[0]![0];
    expect(sendArgs.threadId).toBe("thr-from-original");
    expect(typeof sendArgs.rawMessage).toBe("string");
  });
});

describe("replyToEmail — reply MIME shape", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersMessagesSend.mockResolvedValue({
      id: "msg-new",
      threadId: "thr-orig",
      labelIds: ["SENT"],
    });
  });

  it("sets To = originalFrom, Subject = 'Re: <original>'", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());
    await replyToEmail(baseHandlerInput());

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("To: Alice <alice@example.com>\r\n");
    expect(decoded).toContain("Subject: Re: Original topic\r\n");
  });

  it("emits In-Reply-To + References from the original Message-ID", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());
    await replyToEmail(baseHandlerInput());

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
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
    await replyToEmail(
      baseHandlerInput({
        config: {
          originalMessageId: "orig-1",
          textBody: "x",
          cc: "c1@x.com, c2@x.com",
          bcc: ["b@x.com"],
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Cc: c1@x.com, c2@x.com\r\n");
    expect(decoded).toContain("Bcc: b@x.com\r\n");
  });

  it("appends signature with V1-faithful separators", async () => {
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());
    await replyToEmail(
      baseHandlerInput({
        config: {
          originalMessageId: "orig-1",
          textBody: "Reply.",
          htmlBody: "<p>Reply.</p>",
          signature: "[SIG]",
        },
      }),
    );

    const decoded = Buffer.from(
      mockUsersMessagesSend.mock.calls[0]![0].rawMessage,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Reply.\n\n[SIG]");
    expect(decoded).toContain("<p>Reply.</p><br><br>[SIG]");
  });
});

describe("replyToEmail — output shape (aligns with send_email)", () => {
  it("returns { id, threadId, labelIds, replyingTo, subject }", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesGet.mockResolvedValueOnce(makeOriginal());
    mockUsersMessagesSend.mockResolvedValueOnce({
      id: "msg-99",
      threadId: "thr-orig",
      labelIds: ["SENT"],
    });

    const result = await replyToEmail(baseHandlerInput());

    expect(result).toEqual({
      output: {
        id: "msg-99",
        threadId: "thr-orig",
        labelIds: ["SENT"],
        replyingTo: "orig-1",
        subject: "Re: Original topic",
      },
    });
  });
});

describe("replyToEmail — error propagation", () => {
  it("throws ZodError when originalMessageId is missing", async () => {
    await expect(
      replyToEmail(
        baseHandlerInput({
          config: { textBody: "x" },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates lookup failure (does not attempt send)", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesGet.mockRejectedValueOnce(
      new Error("Gmail messages.get failed: Not Found"),
    );

    await expect(replyToEmail(baseHandlerInput())).rejects.toThrow(
      /Not Found/,
    );
    expect(mockUsersMessagesSend).not.toHaveBeenCalled();
  });
});
