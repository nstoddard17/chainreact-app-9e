/**
 * @jest-environment node
 *
 * Tests for the create_draft_email action handler. Mirrors send_email
 * test shape (Q11 isHtml + importance required; Q7 parseRecipients;
 * Q3 refreshAndRetry; account routing) plus draft-specific output
 * fields (draftId, webLink, createdAt from the Graph 201 response).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreateMessage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/createMessage", () => ({
  createMessage: (...args: unknown[]) => mockCreateMessage(...args),
}));

import { createDraftEmail } from "@/integrations/microsoft-outlook/actions/createDraftEmail";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreateMessage.mockReset();
});

function trigger(provider: string = "microsoft-outlook"): TriggerEvent {
  return {
    provider,
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

const BASE_CONFIG = {
  to: "alice@example.test",
  subject: "Draft hello",
  body: "Hi",
  isHtml: false,
  importance: "normal" as const,
};

function draftResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    subject: "Draft hello",
    webLink: "https://outlook.office.com/owa/?ItemID=draft-1",
    createdDateTime: "2026-05-08T12:00:00Z",
    ...overrides,
  };
}

describe("create_draft_email action", () => {
  it("forwards parsed recipients + subject + body + importance to createMessage", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("ms-token"),
    );
    mockCreateMessage.mockResolvedValue(draftResponse());

    const result = await createDraftEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
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

    expect(mockCreateMessage).toHaveBeenCalledWith({
      accessToken: "ms-token",
      message: {
        subject: "Hi all",
        body: { contentType: "HTML", content: "<p>Hello</p>" },
        toRecipients: [
          { emailAddress: { address: "alice@example.test" } },
          { emailAddress: { address: "bob@example.test" } },
        ],
        ccRecipients: [{ emailAddress: { address: "carol@example.test" } }],
        bccRecipients: [{ emailAddress: { address: "dan@example.test" } }],
        importance: "high",
      },
    });

    expect(result.output).toEqual({
      draftId: "draft-1",
      subject: "Draft hello",
      webLink: "https://outlook.office.com/owa/?ItemID=draft-1",
      createdAt: "2026-05-08T12:00:00Z",
      to: ["alice@example.test", "bob@example.test"],
      cc: ["carol@example.test"],
      bcc: ["dan@example.test"],
    });
  });

  it("uses 'Text' contentType when isHtml=false", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockCreateMessage.mockResolvedValue(draftResponse());

    await createDraftEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { ...BASE_CONFIG, isHtml: false },
      triggerEvent: trigger(),
    });

    expect(mockCreateMessage.mock.calls[0]![0].message.body).toEqual({
      contentType: "Text",
      content: "Hi",
    });
  });

  it("omits ccRecipients/bccRecipients when absent", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockCreateMessage.mockResolvedValue(draftResponse());

    await createDraftEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    const message = mockCreateMessage.mock.calls[0]![0].message;
    expect(message.ccRecipients).toBeUndefined();
    expect(message.bccRecipients).toBeUndefined();
  });

  it("rejects when `to` parses to an empty list (whitespace-only CSV)", async () => {
    await expect(
      createDraftEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ...BASE_CONFIG, to: "   ,   " },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/at least one address in `to`/);
    expect(mockCreateMessage).not.toHaveBeenCalled();
  });

  it("threads accountId through when trigger came from microsoft-outlook", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockCreateMessage.mockResolvedValue(draftResponse());

    await createDraftEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger("microsoft-outlook"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        accountId: "alice@contoso.com",
      }),
    );
  });

  it("passes accountId: null when trigger came from a different provider", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockCreateMessage.mockResolvedValue(draftResponse());

    await createDraftEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger("slack"),
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
      createDraftEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreateMessage).not.toHaveBeenCalled();
  });

  it("rejects missing importance at the schema layer (Q11)", async () => {
    const { importance: _importance, ...rest } = BASE_CONFIG;
    await expect(
      createDraftEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreateMessage).not.toHaveBeenCalled();
  });

  it("falls back to config.subject when wrapper returns no subject field", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockCreateMessage.mockResolvedValue({ id: "draft-1" });

    const result = await createDraftEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { ...BASE_CONFIG, subject: "Echo back" },
      triggerEvent: trigger(),
    });

    expect(result.output.subject).toBe("Echo back");
    expect(result.output.webLink).toBeNull();
    expect(result.output.createdAt).toBeNull();
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("graph-boom"));

    await expect(
      createDraftEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: BASE_CONFIG,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/graph-boom/);
  });

  it("does NOT spread arbitrary provider response fields into the output", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    // Wrapper happens to return extra fields beyond the typed subset —
    // handler must ignore them.
    mockCreateMessage.mockResolvedValue({
      id: "draft-1",
      subject: "Draft hello",
      webLink: "wl",
      createdDateTime: "2026-05-08T12:00:00Z",
      sensitivity: "personal",
      bodyPreview: "Hi…",
      changeKey: "ABCD",
    });

    const result = await createDraftEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      draftId: "draft-1",
      subject: "Draft hello",
      webLink: "wl",
      createdAt: "2026-05-08T12:00:00Z",
      to: ["alice@example.test"],
      cc: [],
      bcc: [],
    });
    expect((result.output as Record<string, unknown>).sensitivity).toBeUndefined();
    expect((result.output as Record<string, unknown>).bodyPreview).toBeUndefined();
    expect((result.output as Record<string, unknown>).changeKey).toBeUndefined();
  });
});
