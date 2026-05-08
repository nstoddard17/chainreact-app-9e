/**
 * @jest-environment node
 *
 * Tests for the send_email action handler. Mocks refreshAndRetry +
 * sendMail wrapper so we exercise the parseRecipients glue, Q11 schema
 * enforcement, account resolution, and error pass-through without
 * touching real Graph or real OAuth.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSendMail = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/sendMail", () => ({
  sendMail: (...args: unknown[]) => mockSendMail(...args),
}));

import { sendEmail } from "@/integrations/microsoft-outlook/actions/sendEmail";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSendMail.mockReset();
});

function trigger(provider: string = "microsoft-outlook"): TriggerEvent {
  return {
    provider,
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

const BASE_CONFIG = {
  to: "alice@example.test",
  subject: "Hello",
  body: "Hi",
  isHtml: false,
  importance: "normal" as const,
};

describe("send_email action", () => {
  it("forwards parsed recipients + subject + body + importance to sendMail", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("ms-token"),
    );
    mockSendMail.mockResolvedValue(undefined);

    const result = await sendEmail({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        ...BASE_CONFIG,
        to: "alice@example.test, bob@example.test",
        cc: "carol@example.test",
        bcc: "dan@example.test",
        subject: "Hi all",
        body: "<p>Hello</p>",
        isHtml: true,
        importance: "high",
      },
      triggerEvent: trigger(),
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "ms-token",
        message: {
          subject: "Hi all",
          body: { contentType: "HTML", content: "<p>Hello</p>" },
          toRecipients: [
            { emailAddress: { address: "alice@example.test" } },
            { emailAddress: { address: "bob@example.test" } },
          ],
          ccRecipients: [
            { emailAddress: { address: "carol@example.test" } },
          ],
          bccRecipients: [
            { emailAddress: { address: "dan@example.test" } },
          ],
          importance: "high",
        },
        saveToSentItems: true,
      }),
    );

    expect(result.output).toEqual({
      sent: true,
      to: ["alice@example.test", "bob@example.test"],
      cc: ["carol@example.test"],
      bcc: ["dan@example.test"],
      subject: "Hi all",
      isHtml: true,
      importance: "high",
    });
  });

  it("uses 'Text' contentType when isHtml=false", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { ...BASE_CONFIG, isHtml: false },
      triggerEvent: trigger(),
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          body: { contentType: "Text", content: "Hi" },
        }),
      }),
    );
  });

  it("accepts to as an array (parseRecipients flattens)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        ...BASE_CONFIG,
        to: ["alice@example.test", "bob@example.test, carol@example.test"],
      },
      triggerEvent: trigger(),
    });

    const call = mockSendMail.mock.calls[0]![0];
    expect(call.message.toRecipients).toEqual([
      { emailAddress: { address: "alice@example.test" } },
      { emailAddress: { address: "bob@example.test" } },
      { emailAddress: { address: "carol@example.test" } },
    ]);
  });

  it("omits ccRecipients/bccRecipients when not provided (cleaner Graph payload)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    const call = mockSendMail.mock.calls[0]![0];
    expect(call.message.ccRecipients).toBeUndefined();
    expect(call.message.bccRecipients).toBeUndefined();
  });

  it("rejects when `to` parses to an empty list (whitespace-only CSV)", async () => {
    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { ...BASE_CONFIG, to: "   ,   " },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/at least one address in `to`/);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("threads accountId through when trigger came from microsoft-outlook", async () => {
    mockRefreshAndRetry.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger("microsoft-outlook"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u",
        provider: "microsoft-outlook",
        accountId: "alice@contoso.com",
      }),
    );
  });

  it("passes accountId: null when trigger came from a different provider", async () => {
    mockRefreshAndRetry.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger("gmail"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        accountId: null,
      }),
    );
  });

  it("rejects missing isHtml at the schema layer (Q11)", async () => {
    const { isHtml: _isHtml, ...rest } = BASE_CONFIG;
    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("rejects missing importance at the schema layer (Q11)", async () => {
    const { importance: _importance, ...rest } = BASE_CONFIG;
    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("graph-boom"));

    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: BASE_CONFIG,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/graph-boom/);
  });
});
