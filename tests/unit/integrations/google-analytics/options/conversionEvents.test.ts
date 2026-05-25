/**
 * @jest-environment node
 *
 * Tests for `integrations/google-analytics/options/conversionEvents.ts` —
 * Slice 3.GOOGLE-ANALYTICS-3.
 */
const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});
jest.mock("@/integrations/_shared/google/api/analytics/conversionEventsList", () => ({
  conversionEventsList: (...args: unknown[]) => mockList(...args),
}));

import { googleAnalyticsConversionEventsResolver } from "@/integrations/google-analytics/options/conversionEvents";
import { AnalyticsNotFoundError } from "@/integrations/_shared/google/api/analytics/errors";
import type { OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  userId: "user-1",
  provider: "google-analytics",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-25T00:00:00Z",
  updatedAt: "2026-05-25T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: { propertyId: "999" }, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("ya29.tok"),
  );
});

describe("googleAnalyticsConversionEventsResolver — shape", () => {
  it("declares requiredDeps=['propertyId'] (verbatim)", () => {
    expect(googleAnalyticsConversionEventsResolver.source).toBe("google-analytics:conversion_events");
    expect(googleAnalyticsConversionEventsResolver.requiredDeps).toEqual(["propertyId"]);
  });

  it("MISSING_DEPENDENCY when propertyId dep absent", async () => {
    await expect(
      googleAnalyticsConversionEventsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });
});

describe("googleAnalyticsConversionEventsResolver — mapping", () => {
  it("value = label = eventName; description carries countingMethod + custom; alpha-sorted", async () => {
    mockList.mockResolvedValueOnce({
      conversionEvents: [
        { eventName: "purchase", countingMethod: "ONCE_PER_EVENT", custom: false },
        { eventName: "add_to_cart", countingMethod: "ONCE_PER_SESSION", custom: true },
      ],
    });
    const result = await googleAnalyticsConversionEventsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "add_to_cart", label: "add_to_cart", description: "ONCE_PER_SESSION · custom" },
      { value: "purchase", label: "purchase", description: "ONCE_PER_EVENT" },
    ]);
  });

  it("passes propertyId to the wrapper", async () => {
    mockList.mockResolvedValueOnce({ conversionEvents: [] });
    await googleAnalyticsConversionEventsResolver.resolve(ctx({ deps: { propertyId: "555" } }));
    expect(mockList.mock.calls[0]![0]).toMatchObject({ propertyId: "555" });
  });

  it("NotFoundError (missing/no-access property) → empty items (cascade fallback)", async () => {
    mockList.mockRejectedValueOnce(new AnalyticsNotFoundError("property 999"));
    const result = await googleAnalyticsConversionEventsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("applies the q filter client-side", async () => {
    mockList.mockResolvedValueOnce({
      conversionEvents: [{ eventName: "purchase" }, { eventName: "sign_up" }],
    });
    const result = await googleAnalyticsConversionEventsResolver.resolve(ctx({ q: "sign" }));
    expect(result.items.map((i) => i.value)).toEqual(["sign_up"]);
  });
});
