/**
 * @jest-environment node
 */
import { eventsPatch } from "@/integrations/google-calendar/api/eventsPatch";
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

describe("eventsPatch", () => {
  it("PATCHes the event endpoint with body + sendUpdates + conferenceDataVersion", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "evt-1", summary: "Updated" },
    });

    await eventsPatch({
      accessToken: "ya29.x",
      calendarId: "primary",
      eventId: "evt-1",
      body: { summary: "Updated" },
      conferenceDataVersion: 1,
      sendUpdates: "all",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.pathname).toBe("/calendar/v3/calendars/primary/events/evt-1");
    expect(u.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(u.searchParams.get("sendUpdates")).toBe("all");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toEqual({
      Authorization: "Bearer ya29.x",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({ summary: "Updated" });
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401, json: { error: { code: 401 } } });
    await expect(
      eventsPatch({
        accessToken: "stale",
        calendarId: "primary",
        eventId: "x",
        body: {},
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { error: { code: 404, message: "Not Found" } },
    });
    await expect(
      eventsPatch({
        accessToken: "x",
        calendarId: "primary",
        eventId: "missing",
        body: {},
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
