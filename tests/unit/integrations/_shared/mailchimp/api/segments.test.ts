/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `segments` resource wrapper — Slice 14
 * Commit 3.
 */
import {
  segmentCreate,
  segmentGet,
  segmentMembersList,
} from "@/integrations/_shared/mailchimp/api/segments";

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

// ─── segmentGet (Mailchimp 2.1 Commit 3) ────────────────────────────────────

describe("segmentGet", () => {
  it("GETs /lists/{id}/segments/{segId}", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: 42,
        name: "VIPs",
        member_count: 12,
        updated_at: "2026-01-01T00:00:00+00:00",
        type: "static",
      },
    });
    const result = await segmentGet({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      segmentId: "42",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/segments/42`,
    );
    expect(result.member_count).toBe(12);
    expect(result.type).toBe("static");
  });

  it("routes through the per-dc origin (eu1 vs us21)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: 42, name: "x" },
    });
    await segmentGet({
      accessToken: "t",
      dc: "eu1",
      audienceId: AUDIENCE_ID,
      segmentId: "42",
    });
    expect(fetchSpy.mock.calls[0]![0]).toContain("https://eu1.api.mailchimp.com/3.0/lists/");
  });

  it("propagates 404 as NotFoundError via the shared request helper", async () => {
    mockFetchOnce({ ok: false, status: 404, text: '{"detail":"missing"}' });
    await expect(
      segmentGet({
        accessToken: "t",
        dc: "us21",
        audienceId: AUDIENCE_ID,
        segmentId: "missing",
      }),
    ).rejects.toThrow();
  });
});

// ─── segmentMembersList (Mailchimp 2.1 Commit 3) ────────────────────────────

describe("segmentMembersList", () => {
  it("GETs /lists/{id}/segments/{segId}/members with default count=50", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        members: [
          { id: "hash1", email_address: "a@x.com", status: "subscribed" },
        ],
        total_items: 1,
      },
    });
    await segmentMembersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      segmentId: "42",
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      `https://us21.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/segments/42/members?`,
    );
    expect(new URL(url).searchParams.get("count")).toBe("50");
  });

  it("clamps count at 100 even when caller requests more", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { members: [], total_items: 0 },
    });
    await segmentMembersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      segmentId: "42",
      count: 1000,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(new URL(url).searchParams.get("count")).toBe("100");
  });

  it("forwards offset on the wire", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { members: [], total_items: 0 },
    });
    await segmentMembersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      segmentId: "42",
      offset: 50,
    });
    expect(new URL(fetchSpy.mock.calls[0]![0] as string).searchParams.get("offset")).toBe("50");
  });

  it("returns { members: [], totalItems: 0 } when response array is absent", async () => {
    mockFetchOnce({ ok: true, json: {} });
    const result = await segmentMembersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      segmentId: "42",
    });
    expect(result).toEqual({ members: [], totalItems: 0 });
  });

  it("returns parsed members + totalItems on success", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        members: [
          { id: "h1", email_address: "a@x.com", status: "subscribed" },
          { id: "h2", email_address: "b@x.com", status: "unsubscribed" },
        ],
        total_items: 247,
      },
    });
    const result = await segmentMembersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      segmentId: "42",
    });
    expect(result.members.map((m) => m.id)).toEqual(["h1", "h2"]);
    expect(result.totalItems).toBe(247);
  });

  it("propagates 5xx errors", async () => {
    mockFetchOnce({ ok: false, status: 500, text: '{"detail":"oops"}' });
    await expect(
      segmentMembersList({
        accessToken: "t",
        dc: "us21",
        audienceId: AUDIENCE_ID,
        segmentId: "42",
      }),
    ).rejects.toThrow();
  });
});
