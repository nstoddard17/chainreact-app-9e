/**
 * @jest-environment node
 *
 * Tests for `resolveShopDomain` — the helper every Shopify action
 * handler uses to figure out which shop to talk to. Two paths:
 *
 *   1. Shopify-triggered run → use `triggerEvent.accountId` (set at
 *      OAuth callback to the shop domain).
 *   2. Other trigger → look up the user's single Shopify integration.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockGetActive = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));

import { resolveShopDomain } from "@/integrations/shopify/actions/_resolveShop";

beforeEach(() => {
  mockGetActive.mockReset();
});

function trigger(
  provider: string,
  accountId = "x.myshopify.com",
): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId,
    payload: {},
  };
}

describe("Shopify-triggered runs (path 1)", () => {
  it("uses triggerEvent.accountId as the shop domain (NO DB lookup)", async () => {
    const result = await resolveShopDomain({
      userId: "u-1",
      triggerEvent: trigger("shopify", "buyer-shop.myshopify.com"),
    });
    expect(result.shopDomain).toBe("buyer-shop.myshopify.com");
    expect(result.accountId).toBe("buyer-shop.myshopify.com");
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it("accountId always equals shopDomain (downstream pins refreshAndRetry to this row)", async () => {
    const result = await resolveShopDomain({
      userId: "u-1",
      triggerEvent: trigger("shopify", "store.myshopify.com"),
    });
    expect(result.accountId).toBe(result.shopDomain);
  });
});

describe("Cross-provider / manual trigger runs (path 2)", () => {
  it("falls back to the integration row's providerAccountId", async () => {
    mockGetActive.mockResolvedValueOnce({
      id: "int-1",
      userId: "u-1",
      provider: "shopify",
      providerAccountId: "manual-shop.myshopify.com",
      displayName: null,
      accessTokenEncrypted: "ENC",
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      scopes: [],
      accountMetadata: {},
      disconnectedAt: null,
      createdAt: "2026-05-09T00:00:00Z",
      updatedAt: "2026-05-09T00:00:00Z",
    });
    const result = await resolveShopDomain({
      userId: "u-1",
      triggerEvent: trigger("scheduled", "n/a"),
    });
    expect(result.shopDomain).toBe("manual-shop.myshopify.com");
    expect(result.accountId).toBe("manual-shop.myshopify.com");
    expect(mockGetActive).toHaveBeenCalledWith("u-1", "shopify", null);
  });

  it("throws when no Shopify integration exists for the user", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    await expect(
      resolveShopDomain({
        userId: "u-1",
        triggerEvent: trigger("scheduled"),
      }),
    ).rejects.toThrow(/no active Shopify integration/);
  });
});

describe("Defensive paths", () => {
  it("falls back to DB lookup when Shopify trigger has empty-string accountId", async () => {
    mockGetActive.mockResolvedValueOnce({
      id: "int-1",
      userId: "u-1",
      provider: "shopify",
      providerAccountId: "fallback.myshopify.com",
      displayName: null,
      accessTokenEncrypted: "ENC",
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      scopes: [],
      accountMetadata: {},
      disconnectedAt: null,
      createdAt: "2026-05-09T00:00:00Z",
      updatedAt: "2026-05-09T00:00:00Z",
    });
    // TriggerEventSchema requires accountId.length >= 1, but the helper
    // is defensive against any zero-length value reaching it.
    const result = await resolveShopDomain({
      userId: "u-1",
      triggerEvent: { ...trigger("shopify"), accountId: "" } as TriggerEvent,
    });
    expect(result.shopDomain).toBe("fallback.myshopify.com");
    expect(mockGetActive).toHaveBeenCalledTimes(1);
  });

  it("requires userId", async () => {
    await expect(
      resolveShopDomain({ userId: "", triggerEvent: trigger("shopify") }),
    ).rejects.toThrow(/userId is required/);
  });
});
