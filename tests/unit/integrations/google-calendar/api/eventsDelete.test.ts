/**
 * @jest-environment node
 */
import { eventsDelete } from "@/integrations/google-calendar/api/eventsDelete";
import { NotFoundError } from "@/integrations/google-calendar/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(response: { ok: boolean; status?: number; json?: unknown }) {
  return jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      response.json === undefined
        ? null
        : typeof response.json === "string"
          ? response.json
          : JSON.stringify(response.json),
      { status: response.status ?? (response.ok ? 204 : 500) },
    ),
  );
}

describe("eventsDelete", () => {
  it("DELETEs the event endpoint with sendUpdates query param", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await eventsDelete({
      accessToken: "ya29.x",
      calendarId: "primary",
      eventId: "evt-1",
      sendUpdates: "all",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.pathname).toBe("/calendar/v3/calendars/primary/events/evt-1");
    expect(u.searchParams.get("sendUpdates")).toBe("all");
    expect(init?.method).toBe("DELETE");
    expect(init?.headers).toEqual({ Authorization: "Bearer ya29.x" });
  });

  it("returns void (no body) on 204", async () => {
    mockFetchOnce({ ok: true, status: 204 });

    const result = await eventsDelete({
      accessToken: "x",
      calendarId: "primary",
      eventId: "evt-1",
    });
    expect(result).toBeUndefined();
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401, json: { error: { code: 401 } } });
    await expect(
      eventsDelete({
        accessToken: "stale",
        calendarId: "primary",
        eventId: "x",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (event missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { error: { code: 404, message: "Not Found" } },
    });
    await expect(
      eventsDelete({
        accessToken: "x",
        calendarId: "primary",
        eventId: "missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError on HTTP 410 (event already deleted, gone)", async () => {
    mockFetchOnce({
      ok: false,
      status: 410,
      json: { error: { code: 410, message: "Gone" } },
    });
    await expect(
      eventsDelete({ accessToken: "x", calendarId: "primary", eventId: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
