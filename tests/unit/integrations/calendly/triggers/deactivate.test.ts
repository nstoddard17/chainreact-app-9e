/**
 * @jest-environment node
 *
 * Tests for the shared Calendly deactivation hook — Slice 5.CALENDLY-1.
 * Best-effort semantics (exact Asana/Typeform posture): NotFound and
 * dead-credential swallowed, other errors propagate, no-op without a
 * stored subscription URI.
 */
const mockRefreshAndRetry = jest.fn();
const mockSubscriptionDelete = jest.fn();

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

jest.mock("@/integrations/_shared/calendly/api/webhookSubscriptions", () => ({
  webhookSubscriptionCreate: jest.fn(),
  webhookSubscriptionDelete: (...args: unknown[]) =>
    mockSubscriptionDelete(...args),
}));

import { IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/calendly/errors";
import { calendlyDeactivate } from "@/integrations/calendly/triggers/_shared/deactivate";

const SUB_URI = "https://api.calendly.com/webhook_subscriptions/SUB789";

function ctx(config: Record<string, unknown>) {
  return {
    trigger: {
      id: "tr-1",
      provider: "calendly",
      eventType: "event_scheduled",
      config,
    },
    integration: {
      id: "int-1",
      accountId: "acct-1",
      provider: "calendly",
      providerAccountId: "marcus@example.test",
    },
  } as never;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSubscriptionDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("calendlyDeactivate", () => {
  it("DELETEs the subscription by the UUID extracted from the stored URI", async () => {
    mockSubscriptionDelete.mockResolvedValueOnce(undefined);
    await calendlyDeactivate(ctx({ subscriptionUri: SUB_URI }));
    expect(mockSubscriptionDelete).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionDelete.mock.calls[0]![0]).toMatchObject({
      subscriptionUuid: "SUB789",
    });
  });

  it("skips silently when the row has no subscriptionUri (activation never completed)", async () => {
    await calendlyDeactivate(ctx({}));
    await calendlyDeactivate(ctx({ subscriptionUri: "" }));
    expect(mockSubscriptionDelete).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (already gone provider-side)", async () => {
    mockSubscriptionDelete.mockRejectedValueOnce(
      new NotFoundError("webhook subscription SUB789"),
    );
    await expect(
      calendlyDeactivate(ctx({ subscriptionUri: SUB_URI })),
    ).resolves.toBeUndefined();
  });

  it("swallows IntegrationActionRequiredError (dead credential; cleanup is best-effort)", async () => {
    mockSubscriptionDelete.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "calendly",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      calendlyDeactivate(ctx({ subscriptionUri: SUB_URI })),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (orchestrator logs and proceeds)", async () => {
    mockSubscriptionDelete.mockRejectedValueOnce(new Error("rate limited"));
    await expect(
      calendlyDeactivate(ctx({ subscriptionUri: SUB_URI })),
    ).rejects.toThrow("rate limited");
  });
});
