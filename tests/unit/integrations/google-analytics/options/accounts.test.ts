/**
 * @jest-environment node
 *
 * Tests for `integrations/google-analytics/options/accounts.ts` —
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

import { googleAnalyticsAccountsResolver } from "@/integrations/google-analytics/options/accounts";
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
  userId: "user-1",
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

describe("googleAnalyticsAccountsResolver — shape", () => {
  it("declares google-analytics:accounts, account-scoped, no deps", () => {
    expect(googleAnalyticsAccountsResolver.source).toBe("google-analytics:accounts");
    expect(googleAnalyticsAccountsResolver.provider).toBe("google-analytics");
    expect(googleAnalyticsAccountsResolver.requiresIntegration).toBe(true);
    expect(googleAnalyticsAccountsResolver.requiredDeps).toBeUndefined();
  });

  it("INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      googleAnalyticsAccountsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("googleAnalyticsAccountsResolver — mapping", () => {
  it("lists accounts via refreshAndRetry(provider=google-analytics, accountId=email)", async () => {
    mockAccountSummaries.mockResolvedValueOnce({ accountSummaries: [] });
    await googleAnalyticsAccountsResolver.resolve(ctx());
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "google-analytics",
      accountId: "alice@example.com",
      userId: "user-1",
    });
  });

  it("maps account summaries → {value: bare id, label: displayName}, alpha-sorted", async () => {
    mockAccountSummaries.mockResolvedValueOnce({
      accountSummaries: [
        { account: "accounts/222", displayName: "Zeta Corp" },
        { account: "accounts/111", displayName: "Acme Inc" },
      ],
    });
    const result = await googleAnalyticsAccountsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "111", label: "Acme Inc" },
      { value: "222", label: "Zeta Corp" },
    ]);
  });

  it("empty result returns empty items", async () => {
    mockAccountSummaries.mockResolvedValueOnce({});
    const result = await googleAnalyticsAccountsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("applies the q filter client-side", async () => {
    mockAccountSummaries.mockResolvedValueOnce({
      accountSummaries: [
        { account: "accounts/1", displayName: "Acme Inc" },
        { account: "accounts/2", displayName: "Beta LLC" },
      ],
    });
    const result = await googleAnalyticsAccountsResolver.resolve(ctx({ q: "acme" }));
    expect(result.items.map((i) => i.value)).toEqual(["1"]);
  });
});

describe("googleAnalyticsAccountsResolver — error sanitization", () => {
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
      googleAnalyticsAccountsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("INTEGRATION_DISCONNECTED on leaked Unauthorized401Error", async () => {
    mockAccountSummaries.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(
      googleAnalyticsAccountsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("PROVIDER_ERROR on quota error with a sanitized message", async () => {
    mockAccountSummaries.mockRejectedValueOnce(new AnalyticsQuotaError("RESOURCE_EXHAUSTED"));
    let caught: unknown;
    try {
      await googleAnalyticsAccountsResolver.resolve(ctx());
    } catch (e) { caught = e; }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toMatch(/RESOURCE_EXHAUSTED/);
  });

  it("PROVIDER_ERROR with no token leak", async () => {
    const leak = "ya29.secret-token";
    mockAccountSummaries.mockRejectedValueOnce(new Error(`boom ${leak}`));
    let caught: unknown;
    try {
      await googleAnalyticsAccountsResolver.resolve(ctx());
    } catch (e) { caught = e; }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});
