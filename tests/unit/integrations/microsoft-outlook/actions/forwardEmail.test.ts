/**
 * @jest-environment node
 *
 * Tests for the forward_email action handler. Q7 parseRecipients +
 * post-parse empty-recipient rejection + omit-cc/comment-when-absent
 * + output projection + account routing.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockForwardMessage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/forwardMessage", () => ({
  forwardMessage: (...args: unknown[]) => mockForwardMessage(...args),
}));

import { forwardEmail } from "@/integrations/microsoft-outlook/actions/forwardEmail";
import { ForwardEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/forwardEmail.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockForwardMessage.mockReset();
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
  to: "alice@example.test",
};

describe("forward_email action", () => {
  it("parses CSV to and forwards to Graph as individual recipients (Q7)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("ms-token"),
    );
    mockForwardMessage.mockResolvedValue(undefined);

    const result = await forwardEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...BASE_CONFIG,
        to: "alice@example.test, bob@example.test",
      },
      triggerEvent: trigger(),
    });

    expect(mockForwardMessage).toHaveBeenCalledWith({
      accessToken: "ms-token",
      messageId: "AAMkAGI2abc",
      toRecipients: [
        { emailAddress: { address: "alice@example.test" } },
        { emailAddress: { address: "bob@example.test" } },
      ],
    });

    expect(result.output).toEqual({
      forwarded: true,
      originalEmailId: "AAMkAGI2abc",
      to: ["alice@example.test", "bob@example.test"],
      cc: [],
    });
  });

  it("accepts to as an array (parseRecipients flattens)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockForwardMessage.mockResolvedValue(undefined);

    await forwardEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...BASE_CONFIG,
        to: ["alice@example.test", "bob@example.test, carol@example.test"],
      },
      triggerEvent: trigger(),
    });

    const call = mockForwardMessage.mock.calls[0]![0];
    expect(call.toRecipients).toEqual([
      { emailAddress: { address: "alice@example.test" } },
      { emailAddress: { address: "bob@example.test" } },
      { emailAddress: { address: "carol@example.test" } },
    ]);
  });

  it("parses cc and forwards to Graph when supplied", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockForwardMessage.mockResolvedValue(undefined);

    const result = await forwardEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...BASE_CONFIG,
        cc: "carol@example.test, dan@example.test",
      },
      triggerEvent: trigger(),
    });

    const call = mockForwardMessage.mock.calls[0]![0];
    expect(call.ccRecipients).toEqual([
      { emailAddress: { address: "carol@example.test" } },
      { emailAddress: { address: "dan@example.test" } },
    ]);
    expect(result.output.cc).toEqual([
      "carol@example.test",
      "dan@example.test",
    ]);
  });

  it("omits ccRecipients from the wrapper call when cc is absent", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockForwardMessage.mockResolvedValue(undefined);

    await forwardEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    const call = mockForwardMessage.mock.calls[0]![0];
    expect(call.ccRecipients).toBeUndefined();
    expect("ccRecipients" in call).toBe(false);
  });

  it("passes comment through when supplied", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockForwardMessage.mockResolvedValue(undefined);

    await forwardEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { ...BASE_CONFIG, comment: "FYI" },
      triggerEvent: trigger(),
    });

    expect(mockForwardMessage.mock.calls[0]![0].comment).toBe("FYI");
  });

  it("omits comment from the wrapper call when absent (V1 silent empty-string default closed)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockForwardMessage.mockResolvedValue(undefined);

    await forwardEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    const call = mockForwardMessage.mock.calls[0]![0];
    expect("comment" in call).toBe(false);
  });

  it("rejects when `to` parses to an empty list (whitespace-only CSV)", async () => {
    await expect(
      forwardEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ...BASE_CONFIG, to: "   ,   " },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/at least one address in `to`/);
    expect(mockForwardMessage).not.toHaveBeenCalled();
  });

  it("threads accountId through when trigger came from microsoft-outlook", async () => {
    mockRefreshAndRetry.mockResolvedValue(undefined);

    await forwardEmail({
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

    await forwardEmail({
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
        providerAccountId: null,
      }),
    );
  });

  it("rejects missing emailId at the schema layer — no wrapper call", async () => {
    const { emailId: _emailId, ...rest } = BASE_CONFIG;
    await expect(
      forwardEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockForwardMessage).not.toHaveBeenCalled();
  });

  it("rejects missing to at the schema layer — no wrapper call", async () => {
    const { to: _to, ...rest } = BASE_CONFIG;
    await expect(
      forwardEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockForwardMessage).not.toHaveBeenCalled();
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("graph-boom"));

    await expect(
      forwardEmail({
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
    mockForwardMessage.mockResolvedValue({
      shouldNotAppear: true,
    } as unknown as void);

    const result = await forwardEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      forwarded: true,
      originalEmailId: "AAMkAGI2abc",
      to: ["alice@example.test"],
      cc: [],
    });
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling forwardEmail.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the forward_email config schema. Q7 — `to` and `cc` accept
// CSV string or array; `cc` and `comment` are optional; `emailId` and
// `to` are required; strict mode rejects unknowns.
// Note: at-least-one parsed `to` recipient is enforced by the handler
// AFTER `parseRecipients` runs (whitespace-only CSV parses to []). The
// schema's `.min(1)` only catches "no value at all" / "[]" / "''".
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  emailId: "AAMkAGI2abc",
  to: "alice@example.test",
};

describe("ForwardEmailConfigSchema", () => {
  it("accepts the minimal valid config (emailId + to)", () => {
    expect(() => ForwardEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts to as a CSV string", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: "a@x.com, b@x.com",
      }),
    ).not.toThrow();
  });

  it("accepts to as an array of strings", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: ["a@x.com", "b@x.com"],
      }),
    ).not.toThrow();
  });

  it("accepts cc as string or array (optional)", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        cc: "c@x.com",
      }),
    ).not.toThrow();
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        cc: ["c@x.com"],
      }),
    ).not.toThrow();
  });

  it("accepts comment when supplied (optional)", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        comment: "FYI",
      }),
    ).not.toThrow();
  });

  it("accepts empty-string comment", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({ ...VALID_CONFIG, comment: "" }),
    ).not.toThrow();
  });

  it("rejects missing emailId", () => {
    const { emailId: _emailId, ...rest } = VALID_CONFIG;
    expect(() => ForwardEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({ ...VALID_CONFIG, emailId: "" }),
    ).toThrow();
  });

  it("rejects missing to", () => {
    const { to: _to, ...rest } = VALID_CONFIG;
    expect(() => ForwardEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string to", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({ ...VALID_CONFIG, to: "" }),
    ).toThrow();
  });

  it("rejects empty-array to", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({ ...VALID_CONFIG, to: [] }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });
});
