/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `reports/*` resource wrappers — Slice 14
 * Commit 5.
 *
 * Verifies:
 *   - reportSummary GETs /reports/{id}.
 *   - reportOpenDetails sorts DESC by timestamp + clamps count at 100.
 *   - reportClickDetails GETs /reports/{id}/click-details.
 *   - reportClickDetailMembers GETs /reports/{id}/click-details/{urlId}/members.
 *   - Each unwraps the appropriate response array (or returns []).
 */
import {
  reportClickDetailMembers,
  reportClickDetails,
  reportGet,
  reportOpenDetails,
  reportSummary,
} from "@/integrations/_shared/mailchimp/api/reports";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(response: {
  ok: boolean;
  json?: unknown;
  status?: number;
  text?: string;
}) {
  const spy = jest.spyOn(globalThis, "fetch");
  const status = response.status ?? (response.ok ? 200 : 500);
  const body =
    response.text !== undefined
      ? response.text
      : JSON.stringify(response.json ?? {});
  spy.mockResolvedValueOnce(new Response(body, { status }));
  return spy;
}

describe("reportSummary", () => {
  it("GETs /reports/{campaignId} and returns the parsed body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "c1",
        opens: { opens_total: 42 },
        clicks: { clicks_total: 7 },
      },
    });
    const result = await reportSummary({
      accessToken: "t",
      dc: "us21",
      campaignId: "c1",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://us21.api.mailchimp.com/3.0/reports/c1",
    );
    expect(result.opens?.opens_total).toBe(42);
    expect(result.clicks?.clicks_total).toBe(7);
  });
});

describe("reportGet (Mailchimp 2.1 — same endpoint, full projection)", () => {
  it("GETs /reports/{campaignId} via the same wire path as reportSummary", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "c1",
        emails_sent: 1000,
        send_time: "2026-02-01T12:00:00+00:00",
        abuse_reports: 0,
        unsubscribed: 3,
        opens: { opens_total: 42, unique_opens: 30 },
        clicks: { clicks_total: 7, unique_clicks: 5 },
        bounces: { hard_bounces: 1, soft_bounces: 2 },
        forwards: { forwards_count: 4, forwards_opens: 2 },
        industry_stats: { type: "Tech", open_rate: 0.22 },
      },
    });
    const result = await reportGet({
      accessToken: "t",
      dc: "us21",
      campaignId: "c1",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://us21.api.mailchimp.com/3.0/reports/c1",
    );
    expect(result.emails_sent).toBe(1000);
    expect(result.send_time).toBe("2026-02-01T12:00:00+00:00");
    expect(result.abuse_reports).toBe(0);
    expect(result.unsubscribed).toBe(3);
    expect(result.forwards?.forwards_count).toBe(4);
    expect(result.industry_stats?.open_rate).toBe(0.22);
  });

  it("routes through the per-dc origin", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "c1" } });
    await reportGet({ accessToken: "t", dc: "eu1", campaignId: "c1" });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://eu1.api.mailchimp.com/3.0/reports/c1",
    );
  });

  it("propagates 404 as NotFoundError via the shared request helper", async () => {
    mockFetchOnce({ ok: false, status: 404, text: '{"detail":"missing"}' });
    await expect(
      reportGet({ accessToken: "t", dc: "us21", campaignId: "missing" }),
    ).rejects.toThrow();
  });
});

describe("reportOpenDetails", () => {
  it("GETs open-details with sort=timestamp DESC + count clamped at 100", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        members: [
          { email_address: "a@x.com", opens_count: 1 },
          { email_address: "b@x.com", opens_count: 2 },
        ],
      },
    });
    await reportOpenDetails({
      accessToken: "t",
      dc: "us21",
      campaignId: "c1",
      count: 200,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "https://us21.api.mailchimp.com/3.0/reports/c1/open-details",
    );
    const params = new URL(url).searchParams;
    expect(params.get("count")).toBe("100");
    expect(params.get("sort_field")).toBe("timestamp");
    expect(params.get("sort_dir")).toBe("DESC");
  });

  it("returns [] when members is absent", async () => {
    mockFetchOnce({ ok: true, json: {} });
    const result = await reportOpenDetails({
      accessToken: "t",
      dc: "us21",
      campaignId: "c1",
    });
    expect(result).toEqual([]);
  });
});

describe("reportClickDetails", () => {
  it("GETs /reports/{id}/click-details and returns urls_clicked[]", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        urls_clicked: [
          { id: "u1", url: "https://acme.example/foo", total_clicks: 5 },
        ],
      },
    });
    const result = await reportClickDetails({
      accessToken: "t",
      dc: "us21",
      campaignId: "c1",
    });
    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "/reports/c1/click-details?",
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe("https://acme.example/foo");
  });
});

describe("reportClickDetailMembers", () => {
  it("GETs /reports/{id}/click-details/{urlId}/members and returns members[]", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        members: [{ email_address: "a@x.com", clicks: 3 }],
      },
    });
    const result = await reportClickDetailMembers({
      accessToken: "t",
      dc: "us21",
      campaignId: "c1",
      urlId: "u1",
    });
    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "/reports/c1/click-details/u1/members?",
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.email_address).toBe("a@x.com");
  });
});
