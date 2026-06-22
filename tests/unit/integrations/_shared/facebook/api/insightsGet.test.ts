/**
 * @jest-environment node
 *
 * Tests for `_shared/facebook/api/insightsGet.ts`.
 *
 * Behavior-focused: assert the EXACT Graph request the wrapper produces
 * (path `/{pageId}/insights`, the `metric` + `period` query, optional
 * `since`/`until` only when provided) and that it parses the metric series.
 * These pin the request shape so a regression in the query (e.g. a dropped
 * metric/period, or sending since/until when unset) is caught — and document
 * that metric *validity* is Graph's call, not the wrapper's (the metric is
 * forwarded verbatim).
 */
import { insightsGet } from "@/integrations/_shared/facebook/api/insightsGet";
import { GRAPH_API_VERSION } from "@/integrations/_shared/facebook/api/_request";

beforeEach(() => {
  delete process.env.FACEBOOK_CLIENT_SECRET;
  delete process.env.FACEBOOK_GRAPH_BASE;
});
afterEach(() => jest.restoreAllMocks());

function mockOnce(body: unknown, status = 200) {
  const spy = jest.spyOn(globalThis, "fetch");
  spy.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
  return spy;
}

describe("insightsGet — Graph request shape", () => {
  it("GETs /{pageId}/insights with metric + period, no since/until when unset", async () => {
    const spy = mockOnce({ data: [{ name: "page_post_engagements", period: "day", values: [{ value: 3 }] }] });
    const result = await insightsGet({
      pageAccessToken: "PAGE_TOK",
      pageId: "12345",
      metric: "page_post_engagements",
      period: "day",
    });

    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe(`/${GRAPH_API_VERSION}/12345/insights`);
    expect(url.searchParams.get("metric")).toBe("page_post_engagements");
    expect(url.searchParams.get("period")).toBe("day");
    expect(url.searchParams.has("since")).toBe(false);
    expect(url.searchParams.has("until")).toBe(false);
    // Page token (not the user token) authorizes the call.
    const init = spy.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer PAGE_TOK");
    // The metric series is returned to the caller.
    expect(result.data[0]!.name).toBe("page_post_engagements");
  });

  it("forwards since/until as unix-second query params when provided", async () => {
    const spy = mockOnce({ data: [] });
    await insightsGet({
      pageAccessToken: "PAGE_TOK",
      pageId: "p",
      metric: "page_views_total",
      period: "week",
      since: 1735689600,
      until: 1736294400,
    });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("metric")).toBe("page_views_total");
    expect(url.searchParams.get("period")).toBe("week");
    expect(url.searchParams.get("since")).toBe("1735689600");
    expect(url.searchParams.get("until")).toBe("1736294400");
  });

  it("forwards the metric verbatim (metric validity is Graph's call, not the wrapper's)", async () => {
    const spy = mockOnce({ data: [] });
    // A comma-separated multi-metric list passes straight through.
    await insightsGet({
      pageAccessToken: "PAGE_TOK",
      pageId: "p",
      metric: "page_post_engagements,page_views_total",
      period: "day",
    });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("metric")).toBe("page_post_engagements,page_views_total");
  });
});
