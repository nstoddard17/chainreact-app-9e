/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — GA4 Measurement Protocol wrapper
 * (mp/collect). 204 success; the THROWN ERROR never leaks the api_secret,
 * the URL, the client_id/user_id, or the payload.
 */
import { measurementProtocolCollect } from "@/integrations/_shared/google/api/analytics/measurementProtocolCollect";
import { AnalyticsApiError } from "@/integrations/_shared/google/api/analytics/errors";

interface Captured {
  url: string;
  body: unknown;
}

function mockFetchOnce(status: number, text = ""): { captured: () => Captured } {
  let cap: Captured | undefined;
  jest.spyOn(globalThis, "fetch").mockImplementationOnce(async (input, init) => {
    cap = { url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    // 204 is a null-body status — the Response constructor rejects a body.
    return new Response(status === 204 ? null : text, { status });
  });
  return { captured: () => cap! };
}

afterEach(() => jest.restoreAllMocks());

describe("measurementProtocolCollect wrapper", () => {
  it("POSTs to mp/collect with measurement_id + api_secret query params + GA4 events payload; 204 → success", async () => {
    const m = mockFetchOnce(204);
    const res = await measurementProtocolCollect({
      measurementId: "G-XXXX",
      apiSecret: "SECRET123",
      clientId: "111.222",
      eventName: "purchase",
      eventParams: { value: 9.99, currency: "USD" },
      userId: "user-7",
    });
    expect(res.status).toBe(204);
    const c = m.captured();
    const u = new URL(c.url);
    expect(u.pathname).toBe("/mp/collect");
    expect(u.searchParams.get("measurement_id")).toBe("G-XXXX");
    expect(u.searchParams.get("api_secret")).toBe("SECRET123");
    expect(c.body).toEqual({
      client_id: "111.222",
      events: [{ name: "purchase", params: { value: 9.99, currency: "USD" } }],
      user_id: "user-7",
    });
  });

  it("200 also counts as success", async () => {
    mockFetchOnce(200);
    const res = await measurementProtocolCollect({
      measurementId: "G-XXXX",
      apiSecret: "SECRET123",
      clientId: "111.222",
      eventName: "sign_up",
    });
    expect(res.status).toBe(200);
  });

  it("non-2xx → AnalyticsApiError carrying ONLY the HTTP status — never the api_secret / URL / client_id", async () => {
    mockFetchOnce(400, "bad request: client 111.222 invalid");
    let caught: unknown;
    try {
      await measurementProtocolCollect({
        measurementId: "G-XXXX",
        apiSecret: "SECRET123",
        clientId: "111.222",
        eventName: "purchase",
        userId: "user-7",
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(AnalyticsApiError);
    const msg = (caught as Error).message;
    expect(msg).toContain("400");
    expect(msg).not.toContain("SECRET123");
    expect(msg).not.toContain("111.222");
    expect(msg).not.toContain("user-7");
    expect(msg).not.toContain("mp/collect");
    expect(msg).not.toContain("bad request");
  });
});
