/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `segments` resource wrapper — Slice 14
 * Commit 3.
 */
import { segmentCreate } from "@/integrations/_shared/mailchimp/api/segments";

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

const AUDIENCE_ID = "1a2b3c4d";

describe("segmentCreate", () => {
  it("POSTs /lists/{id}/segments with static_segment for static mode", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: 42, name: "VIPs", member_count: 2 },
    });
    await segmentCreate({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      name: "VIPs",
      staticSegment: ["a@b.com", "c@d.com"],
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/segments`,
    );
    expect(init!.method).toBe("POST");
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({
      name: "VIPs",
      static_segment: ["a@b.com", "c@d.com"],
    });
  });

  it("supports empty static segment", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: 7, name: "Empty" } });
    await segmentCreate({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      name: "Empty",
      staticSegment: [],
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.static_segment).toEqual([]);
  });

  it("uses options.conditions for saved mode (NOT static_segment)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: 99, name: "EN Speakers" },
    });
    await segmentCreate({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      name: "EN Speakers",
      conditions: [{ field: "language", op: "is", value: "en" }],
      match: "all",
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body).toEqual({
      name: "EN Speakers",
      options: {
        conditions: [{ field: "language", op: "is", value: "en" }],
        match: "all",
      },
    });
    // Anti-test: static_segment must NOT appear when in saved mode.
    expect("static_segment" in body).toBe(false);
  });

  it("omits match when not supplied (Mailchimp default 'any' applies server-side)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: 1, name: "x" } });
    await segmentCreate({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      name: "x",
      conditions: [{ field: "EMAIL", op: "is", value: "a@b.com" }],
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect("match" in body.options).toBe(false);
  });
});
