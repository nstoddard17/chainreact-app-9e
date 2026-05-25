/**
 * @jest-environment node
 */
import { eventsGet } from "@/integrations/google-calendar/api/eventsGet";
import { NotFoundError } from "@/integrations/google-calendar/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
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

describe("eventsGet", () => {
  it("GETs the event endpoint with URL-encoded ids", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "evt-1", summary: "Standup" },
    });

    await eventsGet({
      accessToken: "ya29.x",
      calendarId: "user@example.com",
      eventId: "evt id with spaces",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/user%40example.com/events/evt%20id%20with%20spaces",
    );
    expect(fetchSpy.mock.calls[0]![1]?.method).toBe("GET");
    expect(fetchSpy.mock.calls[0]![1]?.headers).toEqual({
      Authorization: "Bearer ya29.x",
    });
  });

  it("returns the event resource on success", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "evt-1",
        summary: "Standup",
        attendees: [{ email: "alice@example.com" }],
      },
    });

    const result = await eventsGet({
      accessToken: "x",
      calendarId: "primary",
      eventId: "evt-1",
    });
    expect(result.id).toBe("evt-1");
    expect(result.attendees).toEqual([{ email: "alice@example.com" }]);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401, json: { error: { code: 401 } } });
    await expect(
      eventsGet({ accessToken: "stale", calendarId: "primary", eventId: "x" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { error: { code: 404, message: "Not Found" } },
    });
    await expect(
      eventsGet({ accessToken: "x", calendarId: "primary", eventId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
