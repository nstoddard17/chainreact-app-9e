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
import { ReplyToEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/replyToEmail.schema";

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
        provider: "microsoft-outlook",
        providerAccountId: "alice@contoso.com",
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
        providerAccountId: null,
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

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling replyToEmail.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the reply_to_email config schema. Q11 contract — `replyAll`
// is REQUIRED with no hidden default; `emailId` must be non-empty;
// `body` must be present (may be empty); strict mode rejects unknowns.
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  emailId: "AAMkAGI2abc",
  replyAll: false,
  body: "Got it",
};

describe("ReplyToEmailConfigSchema", () => {
  it("accepts the minimal valid config (all required fields present)", () => {
    expect(() => ReplyToEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts replyAll=true", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({ ...VALID_CONFIG, replyAll: true }),
    ).not.toThrow();
  });

  it("allows empty body (mirrors send_email policy)", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({ ...VALID_CONFIG, body: "" }),
    ).not.toThrow();
  });

  it("rejects missing emailId", () => {
    const { emailId: _emailId, ...rest } = VALID_CONFIG;
    expect(() => ReplyToEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({ ...VALID_CONFIG, emailId: "" }),
    ).toThrow();
  });

  it("rejects missing replyAll (Q11 — no hidden default)", () => {
    const { replyAll: _replyAll, ...rest } = VALID_CONFIG;
    expect(() => ReplyToEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects non-boolean replyAll", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({
        ...VALID_CONFIG,
        replyAll: "true",
      }),
    ).toThrow();
  });

  it("rejects missing body (must be present even if empty)", () => {
    const { body: _body, ...rest } = VALID_CONFIG;
    expect(() => ReplyToEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });
});
