/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — GA4 Data API wrappers (runReport /
 * runPivotReport / runRealtimeReport). Endpoint paths, request bodies,
 * status mapping (401/404/quota/generic), and error sanitization.
 */
import { runReport } from "@/integrations/_shared/google/api/analytics/runReport";
import { runPivotReport } from "@/integrations/_shared/google/api/analytics/runPivotReport";
import { runRealtimeReport } from "@/integrations/_shared/google/api/analytics/runRealtimeReport";
import {
  AnalyticsApiError,
  AnalyticsNotFoundError,
  AnalyticsQuotaError,
} from "@/integrations/_shared/google/api/analytics/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

interface Captured {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: unknown;
}

function mockFetchOnce(status: number, json: unknown): { captured: () => Captured } {
  let cap: Captured | undefined;
  jest.spyOn(globalThis, "fetch").mockImplementationOnce(async (input, init) => {
    cap = {
      url: String(input),
      method: init?.method,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    return new Response(typeof json === "string" ? json : JSON.stringify(json), {
      status,
    });
  });
  return { captured: () => cap! };
}

afterEach(() => jest.restoreAllMocks());

describe("runReport wrapper", () => {
  it("POSTs to /v1beta/properties/{id}:runReport with dateRanges + metrics + dimensions", async () => {
    const m = mockFetchOnce(200, { rows: [], rowCount: 0 });
    await runReport({
      accessToken: "ya29.tok",
      propertyId: "123456",
      startDate: "2026-05-01",
      endDate: "2026-05-07",
      metrics: ["sessions", "totalUsers"],
      dimensions: ["date"],
      limit: 50,
    });
    const c = m.captured();
    expect(c.url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport",
    );
    expect(c.method).toBe("POST");
    expect(c.headers.Authorization).toBe("Bearer ya29.tok");
    expect(c.body).toMatchObject({
      dateRanges: [{ startDate: "2026-05-01", endDate: "2026-05-07" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      dimensions: [{ name: "date" }],
      limit: 50,
      keepEmptyRows: false,
    });
  });

  it("maps 401 → Unauthorized401Error (no token in message)", async () => {
    mockFetchOnce(401, { error: { status: "UNAUTHENTICATED", message: "tok ya29.secret bad" } });
    let caught: unknown;
    try {
      await runReport({ accessToken: "ya29.secret", propertyId: "1", startDate: "a", endDate: "b", metrics: ["sessions"] });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Unauthorized401Error);
    expect((caught as Error).message).not.toContain("ya29.secret");
  });

  it("maps 404 → AnalyticsNotFoundError", async () => {
    mockFetchOnce(404, { error: { status: "NOT_FOUND" } });
    await expect(
      runReport({ accessToken: "t", propertyId: "999", startDate: "a", endDate: "b", metrics: ["sessions"] }),
    ).rejects.toBeInstanceOf(AnalyticsNotFoundError);
  });

  it("maps 429 → AnalyticsQuotaError", async () => {
    mockFetchOnce(429, { error: { status: "RESOURCE_EXHAUSTED" } });
    await expect(
      runReport({ accessToken: "t", propertyId: "1", startDate: "a", endDate: "b", metrics: ["sessions"] }),
    ).rejects.toBeInstanceOf(AnalyticsQuotaError);
  });

  it("maps RESOURCE_EXHAUSTED status (HTTP 400) → AnalyticsQuotaError", async () => {
    mockFetchOnce(400, { error: { status: "RESOURCE_EXHAUSTED" } });
    await expect(
      runReport({ accessToken: "t", propertyId: "1", startDate: "a", endDate: "b", metrics: ["sessions"] }),
    ).rejects.toBeInstanceOf(AnalyticsQuotaError);
  });

  it("maps generic 400 → AnalyticsApiError; message carries only the sanitized status (NOT the free-text GA message)", async () => {
    mockFetchOnce(400, { error: { status: "INVALID_ARGUMENT", message: "secret-internal-detail xyz" } });
    let caught: unknown;
    try {
      await runReport({ accessToken: "t", propertyId: "1", startDate: "a", endDate: "b", metrics: ["x"] });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(AnalyticsApiError);
    expect((caught as Error).message).toContain("INVALID_ARGUMENT");
    expect((caught as Error).message).not.toContain("secret-internal-detail");
  });
});

describe("runPivotReport wrapper", () => {
  it("POSTs to :runPivotReport, unions row+pivot dims into `dimensions`, builds pivots[]", async () => {
    const m = mockFetchOnce(200, { rows: [] });
    await runPivotReport({
      accessToken: "t",
      propertyId: "123",
      startDate: "2026-05-01",
      endDate: "2026-05-07",
      metrics: ["sessions"],
      dimensions: ["country"],
      pivotDimensions: ["deviceCategory"],
      limit: 25,
    });
    const c = m.captured();
    expect(c.url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123:runPivotReport",
    );
    expect(c.body).toMatchObject({
      dimensions: [{ name: "country" }, { name: "deviceCategory" }],
      pivots: [
        { fieldNames: ["country"], limit: 25 },
        { fieldNames: ["deviceCategory"], limit: 25 },
      ],
    });
  });
});

describe("runRealtimeReport wrapper", () => {
  it("POSTs to :runRealtimeReport with metrics and NO dateRanges", async () => {
    const m = mockFetchOnce(200, { rows: [] });
    await runRealtimeReport({ accessToken: "t", propertyId: "123", metrics: ["activeUsers"] });
    const c = m.captured();
    expect(c.url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123:runRealtimeReport",
    );
    expect(c.body).toMatchObject({ metrics: [{ name: "activeUsers" }] });
    expect((c.body as Record<string, unknown>).dateRanges).toBeUndefined();
  });
});
