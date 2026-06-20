/**
 * @jest-environment node
 *
 * Tests for `integrations/google-analytics/options/propertiesFlat.ts` —
 * Slice ANALYTICS-SOURCES-GA-1. The FLAT property picker for the Analytics widget:
 * lists every property across all accounts in one accountSummaries.list call, no
 * accountId dep, id + label only, leak-free errors.
 */
const mockRefreshAndRetry = jest.fn();
const mockAccountSummaries = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args) };
});
jest.mock("@/integrations/_shared/google/api/analytics/accountSummariesList", () => ({
  accountSummariesList: (...args: unknown[]) => mockAccountSummaries(...args),
}));

import { googleAnalyticsPropertiesFlatResolver } from "@/integrations/google-analytics/options/propertiesFlat";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { AnalyticsQuotaError } from "@/integrations/_shared/google/api/analytics/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-analytics",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["analytics.readonly"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-25T00:00:00Z",
  updatedAt: "2026-05-25T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockAccountSummaries.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("ya29.tok"),
  );
});

describe("googleAnalyticsPropertiesFlatResolver — shape", () => {
  it("declares google-analytics:properties_flat, account-scoped, NO accountId dep", () => {
    expect(googleAnalyticsPropertiesFlatResolver.source).toBe("google-analytics:properties_flat");
    expect(googleAnalyticsPropertiesFlatResolver.provider).toBe("google-analytics");
    expect(googleAnalyticsPropertiesFlatResolver.requiresIntegration).toBe(true);
    expect(googleAnalyticsPropertiesFlatResolver.requiredDeps).toBeUndefined();
  });

  it("INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      googleAnalyticsPropertiesFlatResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("googleAnalyticsPropertiesFlatResolver — mapping", () => {
  it("flattens ALL properties across accounts; value=bare id, label=name, description=account", async () => {
    mockAccountSummaries.mockResolvedValueOnce({
      accountSummaries: [
        {
          account: "accounts/222",
          displayName: "Zeta Corp",
          propertySummaries: [{ property: "properties/9002", displayName: "Zeta Web" }],
        },
        {
          account: "accounts/111",
          displayName: "Acme Inc",
          propertySummaries: [
            { property: "properties/9000", displayName: "Acme Marketing" },
            { property: "properties/9001", displayName: "Acme App" },
          ],
        },
      ],
    });
    const result = await googleAnalyticsPropertiesFlatResolver.resolve(ctx());
    // Sorted by account label, then property label.
    expect(result.items).toEqual([
      { value: "9001", label: "Acme App", description: "Acme Inc" },
      { value: "9000", label: "Acme Marketing", description: "Acme Inc" },
      { value: "9002", label: "Zeta Web", description: "Zeta Corp" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to the bare property id when displayName is missing", async () => {
    mockAccountSummaries.mockResolvedValueOnce({
      accountSummaries: [
        { account: "accounts/1", displayName: "Acme", propertySummaries: [{ property: "properties/9" }] },
      ],
    });
    const result = await googleAnalyticsPropertiesFlatResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "9", label: "9", description: "Acme" }]);
  });

  it("empty result returns empty items", async () => {
    mockAccountSummaries.mockResolvedValueOnce({});
    const result = await googleAnalyticsPropertiesFlatResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("applies the q filter over property label AND account label", async () => {
    mockAccountSummaries.mockResolvedValue({
      accountSummaries: [
        { account: "accounts/1", displayName: "Acme", propertySummaries: [{ property: "properties/1", displayName: "Web" }] },
        { account: "accounts/2", displayName: "Beta", propertySummaries: [{ property: "properties/2", displayName: "App" }] },
      ],
    });
    const byProperty = await googleAnalyticsPropertiesFlatResolver.resolve(ctx({ q: "web" }));
    expect(byProperty.items.map((i) => i.value)).toEqual(["1"]);
    const byAccount = await googleAnalyticsPropertiesFlatResolver.resolve(ctx({ q: "beta" }));
    expect(byAccount.items.map((i) => i.value)).toEqual(["2"]);
  });
});

describe("googleAnalyticsPropertiesFlatResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockAccountSummaries.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "google-analytics",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(googleAnalyticsPropertiesFlatResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("INTEGRATION_DISCONNECTED on leaked Unauthorized401Error", async () => {
    mockAccountSummaries.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(googleAnalyticsPropertiesFlatResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR on quota error with a sanitized message", async () => {
    mockAccountSummaries.mockRejectedValueOnce(new AnalyticsQuotaError("RESOURCE_EXHAUSTED"));
    let caught: unknown;
    try {
      await googleAnalyticsPropertiesFlatResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toMatch(/RESOURCE_EXHAUSTED/);
  });

  it("PROVIDER_ERROR with no token leak", async () => {
    const leak = "ya29.secret-token";
    mockAccountSummaries.mockRejectedValueOnce(new Error(`boom ${leak}`));
    let caught: unknown;
    try {
      await googleAnalyticsPropertiesFlatResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});
