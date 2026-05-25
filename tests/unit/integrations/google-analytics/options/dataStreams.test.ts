/**
 * @jest-environment node
 *
 * Tests for `integrations/google-analytics/options/dataStreams.ts` —
 * Slice 3.GOOGLE-ANALYTICS-3.
 */
const mockRefreshAndRetry = jest.fn();
const mockDataStreams = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});
jest.mock("@/integrations/_shared/google/api/analytics/dataStreamsList", () => ({
  dataStreamsList: (...args: unknown[]) => mockDataStreams(...args),
}));

import { googleAnalyticsDataStreamsResolver } from "@/integrations/google-analytics/options/dataStreams";
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
