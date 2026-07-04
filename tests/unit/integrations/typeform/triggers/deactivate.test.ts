/**
 * @jest-environment node
 *
 * Tests for the Typeform deactivation hook — Slice 5.TYPEFORM-1.
 * Best-effort semantics mirror Asana: swallow NotFound + dead-credential,
 * propagate everything else, skip silently on never-activated rows.
 */
const mockRefreshAndRetry = jest.fn();
const mockWebhookDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  class Unauthorized401Error extends Error {}
  class InsufficientScopeError extends Error {}
  class IntegrationActionRequiredError extends Error {}
  return {
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
    Unauthorized401Error,
    InsufficientScopeError,
    IntegrationActionRequiredError,
  };
});

jest.mock("@/integrations/_shared/typeform/api/webhooks", () => ({
  webhookPut: jest.fn(),
  webhookDelete: (...args: unknown[]) => mockWebhookDelete(...args),
}));

import { IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/typeform/errors";
import { typeformNewResponseInFormDeactivate } from "@/integrations/typeform/triggers/newResponseInForm/deactivate";

function integration() {
  return {
    accountId: "acct-1",
    provider: "typeform",
    providerAccountId: "marcus@example.test",
  } as never;
}

function trigger(config: Record<string, unknown>) {
  return { config } as never;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhookDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("typeformNewResponseInFormDeactivate", () => {
  it("DELETEs the webhook by (formId, tag)", async () => {
    mockWebhookDelete.mockResolvedValueOnce(undefined);
    await typeformNewResponseInFormDeactivate({
      trigger: trigger({ formId: "form-1", webhookTag: "chainreact-abc" }),
      integration: integration(),
    } as never);
    expect(mockWebhookDelete).toHaveBeenCalledWith({
      accessToken: "tok",
      formId: "form-1",
      tag: "chainreact-abc",
    });
  });

  it("skips silently when the row has no webhookTag (activation never completed)", async () => {
    await typeformNewResponseInFormDeactivate({
      trigger: trigger({ formId: "form-1" }),
      integration: integration(),
    } as never);
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("skips silently when the row has no formId", async () => {
    await typeformNewResponseInFormDeactivate({
      trigger: trigger({ webhookTag: "chainreact-abc" }),
      integration: integration(),
    } as never);
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (already gone provider-side)", async () => {
    mockWebhookDelete.mockRejectedValueOnce(new NotFoundError("webhook x"));
    await expect(
      typeformNewResponseInFormDeactivate({
        trigger: trigger({ formId: "f", webhookTag: "t" }),
        integration: integration(),
      } as never),
    ).resolves.toBeUndefined();
  });

  it("swallows IntegrationActionRequiredError (dead credential; lifecycle proceeds)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "typeform",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      typeformNewResponseInFormDeactivate({
        trigger: trigger({ formId: "f", webhookTag: "t" }),
        integration: integration(),
      } as never),
    ).resolves.toBeUndefined();
  });

  it("propagates unexpected errors", async () => {
    mockWebhookDelete.mockRejectedValueOnce(new Error("boom"));
    await expect(
      typeformNewResponseInFormDeactivate({
        trigger: trigger({ formId: "f", webhookTag: "t" }),
        integration: integration(),
      } as never),
    ).rejects.toThrow("boom");
  });
});
