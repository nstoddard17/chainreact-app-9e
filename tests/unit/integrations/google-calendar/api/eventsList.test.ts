/**
 * @jest-environment node
 */
import { eventsList } from "@/integrations/google-calendar/api/eventsList";
import { NotFoundError } from "@/integrations/google-calendar/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GOOGLE_CALENDAR_API_BASE;
});

function mockFetchOnce(response: { ok: boolean; status?: number; json: unknown }) {
  return jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      typeof response.json === "string"
        ? response.json
        : JSON.stringify(response.json),
      { status: response.status ?? (response.ok ? 200 : 500) },
    ),
  );
}

describe("eventsList", () => {
  it("GETs the events endpoint with Bearer auth and forwards query params", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { items: [{ id: "e1" }, { id: "e2" }], nextPageToken: "tok" },
    });

    await eventsList({
      accessToken: "ya29.x",
      calendarId: "primary",
      timeMin: "2026-01-01T00:00:00Z",
      timeMax: "2026-12-31T23:59:59Z",
      maxResults: 100,
      q: "standup",
      orderBy: "startTime",
      singleEvents: true,
      showDeleted: false,
      pageToken: "prevTok",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({ Authorization: "Bearer ya29.x" });
    expect(u.searchParams.get("timeMin")).toBe("2026-01-01T00:00:00Z");
    expect(u.searchParams.get("timeMax")).toBe("2026-12-31T23:59:59Z");
    expect(u.searchParams.get("maxResults")).toBe("100");
    expect(u.searchParams.get("q")).toBe("standup");
    expect(u.searchParams.get("orderBy")).toBe("startTime");
    expect(u.searchParams.get("singleEvents")).toBe("true");
    expect(u.searchParams.get("showDeleted")).toBe("false");
    expect(u.searchParams.get("pageToken")).toBe("prevTok");
  });

  it("returns the parsed response unchanged", async () => {
    mockFetchOnce({
      ok: true,
      json: { items: [{ id: "e1" }], nextSyncToken: "sync-1" },
    });

    const result = await eventsList({ accessToken: "x", calendarId: "primary" });
    expect(result).toEqual({
      items: [{ id: "e1" }],
      nextSyncToken: "sync-1",
    });
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401, json: { error: { code: 401 } } });
    await expect(
      eventsList({ accessToken: "stale", calendarId: "primary" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { error: { code: 404, message: "Calendar not found." } },
    });
    await expect(
      eventsList({ accessToken: "x", calendarId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
