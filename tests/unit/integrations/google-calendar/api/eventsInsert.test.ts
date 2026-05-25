/**
 * @jest-environment node
 *
 * Tests for the Google Calendar events.insert API wrapper.
 */
import { eventsInsert } from "@/integrations/google-calendar/api/eventsInsert";
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

describe("eventsInsert — request shape", () => {
  it("POSTs to events endpoint with Bearer auth + JSON body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "evt-1", htmlLink: "https://calendar.google.com/event?eid=evt-1" },
    });

    await eventsInsert({
      accessToken: "ya29.token",
      calendarId: "primary",
      body: { summary: "Test event" },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer ya29.token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({ summary: "Test event" });
  });

  it("URL-encodes the calendar id", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "evt-1" } });

    await eventsInsert({
      accessToken: "x",
      calendarId: "user@example.com",
      body: { summary: "S" },
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/user%40example.com/events",
    );
  });

  it("appends conferenceDataVersion + sendUpdates query params when provided", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "evt-1" } });

    await eventsInsert({
      accessToken: "x",
      calendarId: "primary",
      body: { summary: "S" },
      conferenceDataVersion: 1,
      sendUpdates: "all",
    });

    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(url.searchParams.get("sendUpdates")).toBe("all");
  });

  it("respects GOOGLE_CALENDAR_API_BASE override", async () => {
    process.env.GOOGLE_CALENDAR_API_BASE = "http://127.0.0.1:9877";
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "evt-1" } });

    await eventsInsert({
      accessToken: "x",
      calendarId: "primary",
      body: { summary: "S" },
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9877/calendar/v3/calendars/primary/events",
    );
  });
});

describe("eventsInsert — error handling", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401, json: { error: { code: 401 } } });
    await expect(
      eventsInsert({ accessToken: "stale", calendarId: "primary", body: {} }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { error: { code: 404, message: "Not Found" } },
    });
    await expect(
      eventsInsert({ accessToken: "x", calendarId: "missing", body: {} }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Google's error.message on 4xx (non-401, non-404)", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: { error: { code: 400, message: "Invalid time range." } },
    });
    await expect(
      eventsInsert({ accessToken: "x", calendarId: "primary", body: {} }),
    ).rejects.toThrow(/Invalid time range/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({ ok: false, status: 502, json: "Bad Gateway" });
    await expect(
      eventsInsert({ accessToken: "x", calendarId: "primary", body: {} }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
