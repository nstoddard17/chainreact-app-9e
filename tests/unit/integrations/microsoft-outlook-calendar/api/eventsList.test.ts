/**
 * @jest-environment node
 */
import { eventsList } from "@/integrations/microsoft-outlook-calendar/api/eventsList";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  json?: unknown;
  bodyText?: string;
}) {
  const status = opts.status ?? (opts.ok ? 200 : 400);
  const body =
    opts.bodyText !== undefined
      ? opts.bodyText
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("eventsList wrapper", () => {
  it("uses /me/events when no date range supplied (master events)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });

    await eventsList({
      accessToken: "t",
      top: 25,
      orderBy: "start",
    });

    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe(
      "https://graph.microsoft.com/v1.0/me/events",
    );
    // /me/events doesn't expose `start` for orderBy; "start" maps to
    // createdDateTime desc.
    expect(url.searchParams.get("$orderby")).toBe("createdDateTime desc");
  });

  it("uses /me/calendarView when both startDateTime and endDateTime supplied (auto-expand recurrences)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });

    await eventsList({
      accessToken: "t",
      startDateTime: "2026-05-09T00:00:00Z",
      endDateTime: "2026-05-16T00:00:00Z",
      top: 50,
      orderBy: "start",
    });

    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe(
      "https://graph.microsoft.com/v1.0/me/calendarView",
    );
    expect(url.searchParams.get("startDateTime")).toBe("2026-05-09T00:00:00Z");
    expect(url.searchParams.get("endDateTime")).toBe("2026-05-16T00:00:00Z");
    // calendarView's chronological orderBy uses start/dateTime.
    expect(url.searchParams.get("$orderby")).toBe("start/dateTime");
  });

  it("forwards top + Bearer token + bounded $select", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });

    await eventsList({
      accessToken: "ms-cal-token",
      top: 10,
      orderBy: "subject",
    });

    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Authorization: "Bearer ms-cal-token" });

    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$top")).toBe("10");
    expect(url.searchParams.get("$orderby")).toBe("subject");
    // $select includes the canonical event fields.
    const select = url.searchParams.get("$select")!;
    expect(select).toContain("id");
    expect(select).toContain("subject");
    expect(select).toContain("start");
    expect(select).toContain("end");
    expect(select).toContain("attendees");
    expect(select).toContain("webLink");
  });

  it("includes $filter when subjectFilter is provided (with single-quote escaping)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });

    await eventsList({
      accessToken: "t",
      top: 25,
      orderBy: "start",
      subjectFilter: "Bob's meeting",
    });

    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    // Single quotes inside the filter value are doubled per OData spec.
    expect(url.searchParams.get("$filter")).toBe(
      "contains(subject, 'Bob''s meeting')",
    );
  });

  it("returns events + nextLink shape on 200", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        value: [
          { id: "evt-1", subject: "A" },
          { id: "evt-2", subject: "B" },
        ],
        "@odata.nextLink":
          "https://graph.microsoft.com/v1.0/me/events?$skiptoken=abc",
      },
    });

    const result = await eventsList({
      accessToken: "t",
      top: 2,
      orderBy: "start",
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[0]!.id).toBe("evt-1");
    expect(result.nextLink).toBe(
      "https://graph.microsoft.com/v1.0/me/events?$skiptoken=abc",
    );
  });

  it("returns nextLink: null when response has no @odata.nextLink", async () => {
    mockFetchOnce({ ok: true, json: { value: [] } });

    const result = await eventsList({
      accessToken: "t",
      top: 25,
      orderBy: "start",
    });

    expect(result.events).toEqual([]);
    expect(result.nextLink).toBeNull();
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}',
    });

    await expect(
      eventsList({ accessToken: "stale", top: 25, orderBy: "start" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Graph error message on 4xx failures", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText:
        '{"error":{"code":"BadRequest","message":"Filter expression is invalid"}}',
    });

    await expect(
      eventsList({ accessToken: "t", top: 25, orderBy: "start" }),
    ).rejects.toThrow(/Filter expression is invalid/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });

    await eventsList({ accessToken: "t", top: 25, orderBy: "start" });

    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.origin).toBe("http://127.0.0.1:9876");
  });
});
