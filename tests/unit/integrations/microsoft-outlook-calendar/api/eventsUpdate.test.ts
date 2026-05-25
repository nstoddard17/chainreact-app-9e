/**
 * @jest-environment node
 */
import { eventsUpdate } from "@/integrations/microsoft-outlook-calendar/api/eventsUpdate";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
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

describe("eventsUpdate wrapper", () => {
  it("PATCHes /v1.0/me/events/{id} with the body verbatim", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "evt-1", subject: "Updated" },
    });

    await eventsUpdate({
      accessToken: "t",
      eventId: "evt-1",
      body: { subject: "Updated" },
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/events/evt-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({
      Authorization: "Bearer t",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({ subject: "Updated" });
  });

  it("URL-encodes event ids that contain edge chars", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "x" } });

    await eventsUpdate({
      accessToken: "t",
      eventId: "abc/def",
      body: { subject: "x" },
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/events/abc%2Fdef",
    );
  });

  it("returns the parsed Graph event on 200", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "evt-1",
        subject: "Updated",
        start: { dateTime: "2026-05-15T14:30:00", timeZone: "UTC" },
        end: { dateTime: "2026-05-15T16:00:00", timeZone: "UTC" },
      },
    });

    const result = await eventsUpdate({
      accessToken: "t",
      eventId: "evt-1",
      body: { end: { dateTime: "2026-05-15T16:00:00", timeZone: "UTC" } },
    });

    expect(result.subject).toBe("Updated");
    expect(result.end?.dateTime).toBe("2026-05-15T16:00:00");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}',
    });

    await expect(
      eventsUpdate({
        accessToken: "stale",
        eventId: "x",
        body: { subject: "y" },
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (event already gone)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText:
        '{"error":{"code":"ErrorItemNotFound","message":"Not found"}}',
    });

    await expect(
      eventsUpdate({
        accessToken: "t",
        eventId: "evt-gone",
        body: { subject: "x" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Graph error message on 4xx other than 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText:
        '{"error":{"code":"ErrorInvalidArgument","message":"start.timeZone is required"}}',
    });

    await expect(
      eventsUpdate({
        accessToken: "t",
        eventId: "evt-1",
        body: { start: { dateTime: "x", timeZone: "" } },
      }),
    ).rejects.toThrow(/start\.timeZone is required/);
  });
});
