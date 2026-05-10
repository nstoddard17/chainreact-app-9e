/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `campaigns` resource wrappers — Slice 14
 * Commit 5.
 *
 * Verifies:
 *   - `campaignsList` builds the right query (status / list_id /
 *     sort_field / sort_dir / count / offset).
 *   - count is clamped at 100.
 *   - `campaignGet` fetches one record by id.
 *   - Empty / absent `campaigns[]` returns [].
 */
import {
  campaignsList,
  campaignGet,
} from "@/integrations/_shared/mailchimp/api/campaigns";

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

describe("campaignsList", () => {
  it("GETs /campaigns with all filter+sort+pagination query params", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { campaigns: [{ id: "c1" }, { id: "c2" }] },
    });
    await campaignsList({
      accessToken: "t",
      dc: "us21",
      status: "sent",
      listId: "list_1",
      sortField: "send_time",
      sortDir: "DESC",
      count: 50,
      offset: 100,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("https://us21.api.mailchimp.com/3.0/campaigns?");
    const params = new URL(url).searchParams;
    expect(params.get("status")).toBe("sent");
    expect(params.get("list_id")).toBe("list_1");
    expect(params.get("sort_field")).toBe("send_time");
    expect(params.get("sort_dir")).toBe("DESC");
    expect(params.get("count")).toBe("50");
    expect(params.get("offset")).toBe("100");
  });

  it("clamps count at 100 even when caller requests more", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { campaigns: [] } });
    await campaignsList({
      accessToken: "t",
      dc: "us21",
      count: 500,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(new URL(url).searchParams.get("count")).toBe("100");
  });

  it("returns [] when campaigns array is absent", async () => {
    mockFetchOnce({ ok: true, json: {} });
    const result = await campaignsList({
      accessToken: "t",
      dc: "us21",
    });
    expect(result).toEqual([]);
  });

  it("returns the parsed campaigns array on success", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        campaigns: [
          { id: "c1", status: "sent" },
          { id: "c2", status: "save" },
        ],
      },
    });
    const result = await campaignsList({
      accessToken: "t",
      dc: "us21",
    });
    expect(result.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});

describe("campaignGet", () => {
  it("GETs /campaigns/{id}", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "c1", status: "sent" },
    });
    const result = await campaignGet({
      accessToken: "t",
      dc: "us21",
      campaignId: "c1",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://us21.api.mailchimp.com/3.0/campaigns/c1",
    );
    expect(result.id).toBe("c1");
  });
});
