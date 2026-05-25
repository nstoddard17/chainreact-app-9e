/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — GA4 Admin API wrappers (conversionEvents
 * list / create). Endpoint paths, request body, status mapping, sanitization.
 */
import { conversionEventsList } from "@/integrations/_shared/google/api/analytics/conversionEventsList";
import { conversionEventsCreate } from "@/integrations/_shared/google/api/analytics/conversionEventsCreate";
import {
  AnalyticsApiError,
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
    return new Response(JSON.stringify(json), { status });
  });
  return { captured: () => cap! };
}

afterEach(() => jest.restoreAllMocks());

describe("conversionEventsList wrapper", () => {
  it("GETs /v1beta/properties/{id}/conversionEvents", async () => {
    const m = mockFetchOnce(200, { conversionEvents: [{ eventName: "purchase", name: "properties/1/conversionEvents/99" }] });
    const res = await conversionEventsList({ accessToken: "ya29.tok", propertyId: "123" });
    const c = m.captured();
    expect(c.url).toBe(
      "https://analyticsadmin.googleapis.com/v1beta/properties/123/conversionEvents?pageSize=200",
    );
    expect(c.method).toBe("GET");
    expect(c.headers.Authorization).toBe("Bearer ya29.tok");
    expect(res.conversionEvents?.[0]?.eventName).toBe("purchase");
  });

  it("maps 401 → Unauthorized401Error", async () => {
    mockFetchOnce(401, { error: { status: "UNAUTHENTICATED" } });
    await expect(
      conversionEventsList({ accessToken: "t", propertyId: "1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 429 → AnalyticsQuotaError", async () => {
    mockFetchOnce(429, { error: { status: "RESOURCE_EXHAUSTED" } });
    await expect(
      conversionEventsList({ accessToken: "t", propertyId: "1" }),
    ).rejects.toBeInstanceOf(AnalyticsQuotaError);
  });
});

describe("conversionEventsCreate wrapper", () => {
  it("POSTs /v1beta/properties/{id}/conversionEvents with eventName + countingMethod + custom", async () => {
    const m = mockFetchOnce(200, {
      name: "properties/123/conversionEvents/55",
      eventName: "purchase",
      countingMethod: "ONCE_PER_EVENT",
    });
    await conversionEventsCreate({
      accessToken: "ya29.tok",
      propertyId: "123",
      eventName: "purchase",
      countingMethod: "ONCE_PER_EVENT",
      custom: false,
    });
    const c = m.captured();
    expect(c.url).toBe(
      "https://analyticsadmin.googleapis.com/v1beta/properties/123/conversionEvents",
    );
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({
      eventName: "purchase",
      countingMethod: "ONCE_PER_EVENT",
      custom: false,
    });
  });

  it("maps a 409 (already exists) → AnalyticsApiError with sanitized status only", async () => {
    mockFetchOnce(409, { error: { status: "ALREADY_EXISTS", message: "conversion purchase already exists for property 123" } });
    let caught: unknown;
    try {
      await conversionEventsCreate({ accessToken: "t", propertyId: "1", eventName: "purchase" });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(AnalyticsApiError);
    expect((caught as Error).message).toContain("ALREADY_EXISTS");
    expect((caught as Error).message).not.toContain("already exists for property");
  });
});
