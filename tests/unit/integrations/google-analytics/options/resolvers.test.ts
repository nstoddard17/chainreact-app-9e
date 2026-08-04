/**
 * @jest-environment node
 *
 * google-analytics options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockAccountSummaries = jest.fn();
const mockList = jest.fn();
const mockDataStreams = jest.fn();

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

jest.mock("@/integrations/_shared/google/api/analytics/conversionEventsList", () => ({
  conversionEventsList: (...args: unknown[]) => mockList(...args),
}));

jest.mock("@/integrations/_shared/google/api/analytics/dataStreamsList", () => ({
  dataStreamsList: (...args: unknown[]) => mockDataStreams(...args),
}));

import { googleAnalyticsAccountsResolver } from "@/integrations/google-analytics/options/accounts";
import { IntegrationActionRequiredError, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { AnalyticsQuotaError, AnalyticsNotFoundError } from "@/integrations/_shared/google/api/analytics/errors";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { googleAnalyticsConversionEventsResolver } from "@/integrations/google-analytics/options/conversionEvents";
import type { OptionsResolverContext } from "@/services/options/types";
import { googleAnalyticsDataStreamsResolver } from "@/integrations/google-analytics/options/dataStreams";
import { googleAnalyticsPropertiesResolver } from "@/integrations/google-analytics/options/properties";
import { googleAnalyticsPropertiesFlatResolver } from "@/integrations/google-analytics/options/propertiesFlat";

// ---------------------------------------------------------------------------
// Merged from the former accounts.test.ts
// Tests for `integrations/google-analytics/options/accounts.ts` —
// Slice 3.GOOGLE-ANALYTICS-3.
// ---------------------------------------------------------------------------
describe("accounts (options)", () => {

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
      providerAccountId: "alice@example.com",
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
        accountId: "user-1",
        provider: "google-analytics",
        providerAccountId: "alice@example.com",
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

});

// ---------------------------------------------------------------------------
// Merged from the former conversionEvents.test.ts
// Tests for `integrations/google-analytics/options/conversionEvents.ts` —
// Slice 3.GOOGLE-ANALYTICS-3.
// ---------------------------------------------------------------------------
describe("conversionEvents (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former dataStreams.test.ts
// Tests for `integrations/google-analytics/options/dataStreams.ts` —
// Slice 3.GOOGLE-ANALYTICS-3.
// ---------------------------------------------------------------------------
describe("dataStreams (options)", () => {

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
  mockDataStreams.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("ya29.tok"),
  );
});

describe("googleAnalyticsDataStreamsResolver — shape", () => {
  it("declares requiredDeps=['propertyId'] (verbatim)", () => {
    expect(googleAnalyticsDataStreamsResolver.source).toBe("google-analytics:data_streams");
    expect(googleAnalyticsDataStreamsResolver.requiredDeps).toEqual(["propertyId"]);
  });

  it("MISSING_DEPENDENCY when propertyId dep absent", async () => {
    await expect(
      googleAnalyticsDataStreamsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });
});

describe("googleAnalyticsDataStreamsResolver — mapping", () => {
  it("value = measurementId; only WEB streams (with a measurement id) are included", async () => {
    mockDataStreams.mockResolvedValueOnce({
      dataStreams: [
        { name: "properties/999/dataStreams/1", type: "WEB_DATA_STREAM", displayName: "Marketing Web", webStreamData: { measurementId: "G-ABC123" } },
        { name: "properties/999/dataStreams/2", type: "ANDROID_APP_DATA_STREAM", displayName: "Android App" },
        { name: "properties/999/dataStreams/3", type: "WEB_DATA_STREAM", displayName: "Blog Web", webStreamData: { measurementId: "G-XYZ789" } },
      ],
    });
    const result = await googleAnalyticsDataStreamsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "G-XYZ789", label: "Blog Web", description: "G-XYZ789" },
      { value: "G-ABC123", label: "Marketing Web", description: "G-ABC123" },
    ]);
  });

  it("passes propertyId to the wrapper", async () => {
    mockDataStreams.mockResolvedValueOnce({ dataStreams: [] });
    await googleAnalyticsDataStreamsResolver.resolve(ctx({ deps: { propertyId: "555" } }));
    expect(mockDataStreams.mock.calls[0]![0]).toMatchObject({ propertyId: "555" });
  });

  it("NotFoundError (missing/no-access property) → empty items (cascade fallback)", async () => {
    mockDataStreams.mockRejectedValueOnce(new AnalyticsNotFoundError("property 999"));
    const result = await googleAnalyticsDataStreamsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("applies the q filter client-side", async () => {
    mockDataStreams.mockResolvedValueOnce({
      dataStreams: [
        { displayName: "Marketing Web", webStreamData: { measurementId: "G-1" } },
        { displayName: "Blog Web", webStreamData: { measurementId: "G-2" } },
      ],
    });
    const result = await googleAnalyticsDataStreamsResolver.resolve(ctx({ q: "blog" }));
    expect(result.items.map((i) => i.value)).toEqual(["G-2"]);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former properties.test.ts
// Tests for `integrations/google-analytics/options/properties.ts` —
// Slice 3.GOOGLE-ANALYTICS-3.
// ---------------------------------------------------------------------------
describe("properties (options)", () => {

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
        accountId: "user-1",
        provider: "google-analytics",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      googleAnalyticsPropertiesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former propertiesFlat.test.ts
// Tests for `integrations/google-analytics/options/propertiesFlat.ts` —
// Slice ANALYTICS-SOURCES-GA-1. The FLAT property picker for the Analytics widget:
// lists every property across all accounts in one accountSummaries.list call, no
// accountId dep, id + label only, leak-free errors.
// ---------------------------------------------------------------------------
describe("propertiesFlat (options)", () => {

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

});
