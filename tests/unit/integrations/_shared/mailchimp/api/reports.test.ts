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
  reportOpenDetails,
  reportSummary,
} from "@/integrations/_shared/mailchimp/api/reports";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(response: { ok: boolean; json?: unknown }) {
  const spy = jest.spyOn(globalThis, "fetch");
  spy.mockResolvedValueOnce(
    new Response(JSON.stringify(response.json ?? {}), {
      status: response.ok ? 200 : 500,
    }),
  );
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
