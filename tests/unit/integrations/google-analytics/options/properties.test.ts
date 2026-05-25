/**
 * @jest-environment node
 *
 * Tests for `integrations/google-analytics/options/properties.ts` —
 * Slice 3.GOOGLE-ANALYTICS-3.
 */
const mockRefreshAndRetry = jest.fn();
const mockAccountSummaries = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});
jest.mock("@/integrations/_shared/google/api/analytics/accountSummariesList", () => ({
  accountSummariesList: (...args: unknown[]) => mockAccountSummaries(...args),
}));

import { googleAnalyticsPropertiesResolver } from "@/integrations/google-analytics/options/properties";
import {
  IntegrationActionRequiredError,
} from "@/services/oauth/refreshAndRetry";
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
  return { userId: "user-1", integration, q: "", deps: { accountId: "111" }, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockAccountSummaries.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("ya29.tok"),
  );
});

describe("googleAnalyticsPropertiesResolver — shape", () => {
  it("declares requiredDeps=['accountId'] (verbatim)", () => {
    expect(googleAnalyticsPropertiesResolver.source).toBe("google-analytics:properties");
    expect(googleAnalyticsPropertiesResolver.requiredDeps).toEqual(["accountId"]);
  });

  it("MISSING_DEPENDENCY when accountId dep absent", async () => {
    await expect(
      googleAnalyticsPropertiesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      googleAnalyticsPropertiesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("googleAnalyticsPropertiesResolver — mapping", () => {
  it("filters the matching account's property summaries → {value: bare id, label, description: type}", async () => {
    mockAccountSummaries.mockResolvedValueOnce({
      accountSummaries: [
        {
          account: "accounts/111",
          displayName: "Acme",
          propertySummaries: [
            { property: "properties/999", displayName: "Web Prop", propertyType: "PROPERTY_TYPE_ORDINARY" },
            { property: "properties/888", displayName: "App Prop", propertyType: "PROPERTY_TYPE_ORDINARY" },
          ],
        },
        { account: "accounts/222", displayName: "Other", propertySummaries: [{ property: "properties/777", displayName: "Other Prop" }] },
      ],
    });
    const result = await googleAnalyticsPropertiesResolver.resolve(ctx({ deps: { accountId: "111" } }));
    expect(result.items).toEqual([
      { value: "888", label: "App Prop", description: "PROPERTY_TYPE_ORDINARY" },
      { value: "999", label: "Web Prop", description: "PROPERTY_TYPE_ORDINARY" },
    ]);
  });

  it("no matching account summary → empty items (cascade fallback)", async () => {
    mockAccountSummaries.mockResolvedValueOnce({
      accountSummaries: [{ account: "accounts/999", displayName: "Different", propertySummaries: [] }],
    });
    const result = await googleAnalyticsPropertiesResolver.resolve(ctx({ deps: { accountId: "111" } }));
    expect(result.items).toEqual([]);
  });

  it("applies the q filter client-side", async () => {
    mockAccountSummaries.mockResolvedValueOnce({
      accountSummaries: [
        {
          account: "accounts/111",
          propertySummaries: [
            { property: "properties/1", displayName: "Marketing Site" },
            { property: "properties/2", displayName: "Blog" },
          ],
        },
      ],
    });
    const result = await googleAnalyticsPropertiesResolver.resolve(ctx({ deps: { accountId: "111" }, q: "blog" }));
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
  });
});

describe("googleAnalyticsPropertiesResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockAccountSummaries.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        userId: "user-1",
        provider: "google-analytics",
        accountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      googleAnalyticsPropertiesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});
