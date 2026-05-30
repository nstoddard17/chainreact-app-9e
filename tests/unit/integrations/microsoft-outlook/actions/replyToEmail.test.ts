/**
 * @jest-environment node
 *
 * Tests for the reply_to_email action handler. Mocks refreshAndRetry +
 * replyMessage wrapper to assert Q11 schema enforcement, account
 * routing, output shape, and error pass-through without touching real
 * Graph or real OAuth.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockReplyMessage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/replyMessage", () => ({
  replyMessage: (...args: unknown[]) => mockReplyMessage(...args),
}));

import { replyToEmail } from "@/integrations/microsoft-outlook/actions/replyToEmail";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockReplyMessage.mockReset();
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
  emailId: "AAMkAGI2abc",
  replyAll: false,
  body: "Got it",
};

describe("reply_to_email action", () => {
  it("forwards emailId, body, and replyAll to replyMessage", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("ms-token"),
    );
    mockReplyMessage.mockResolvedValue(undefined);

    const result = await replyToEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    expect(mockReplyMessage).toHaveBeenCalledWith({
      accessToken: "ms-token",
      messageId: "AAMkAGI2abc",
      comment: "Got it",
      replyAll: false,
    });

    expect(result.output).toEqual({
      replied: true,
      replyAll: false,
      originalEmailId: "AAMkAGI2abc",
    });
  });

  it("routes replyAll=true through to the wrapper", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockReplyMessage.mockResolvedValue(undefined);

    const result = await replyToEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { ...BASE_CONFIG, replyAll: true },
      triggerEvent: trigger(),
    });

    expect(mockReplyMessage).toHaveBeenCalledWith(
      expect.objectContaining({ replyAll: true }),
    );
    expect(result.output.replyAll).toBe(true);
  });

  it("threads accountId through when trigger came from microsoft-outlook", async () => {
    mockRefreshAndRetry.mockResolvedValue(undefined);

    await replyToEmail({
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
        userId: "u",
        provider: "microsoft-outlook",
        accountId: "alice@contoso.com",
      }),
    );
  });

  it("passes accountId: null when trigger came from a different provider", async () => {
    mockRefreshAndRetry.mockResolvedValue(undefined);

    await replyToEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
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

  it("rejects missing replyAll at the schema layer (Q11) — no wrapper call", async () => {
    const { replyAll: _replyAll, ...rest } = BASE_CONFIG;
    await expect(
      replyToEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockReplyMessage).not.toHaveBeenCalled();
  });

  it("rejects missing emailId at the schema layer — no wrapper call", async () => {
    const { emailId: _emailId, ...rest } = BASE_CONFIG;
    await expect(
      replyToEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockReplyMessage).not.toHaveBeenCalled();
  });

  it("rejects empty-string emailId at the schema layer", async () => {
    await expect(
      replyToEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ...BASE_CONFIG, emailId: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockReplyMessage).not.toHaveBeenCalled();
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("graph-boom"));

    await expect(
      replyToEmail({
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

  it("does NOT spread the provider response into the output", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    // Wrapper returns void; even if it returned something, handler should
    // not surface it. Sanity test for the contract.
    mockReplyMessage.mockResolvedValue({
      shouldNotAppear: true,
      anotherSecret: "leak",
    } as unknown as void);

    const result = await replyToEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      replied: true,
      replyAll: false,
      originalEmailId: "AAMkAGI2abc",
    });
    expect((result.output as Record<string, unknown>).shouldNotAppear).toBeUndefined();
  });
});
