/**
 * @jest-environment node
 */
import { eventsGet } from "@/integrations/microsoft-outlook-calendar/api/eventsGet";
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
  const status = opts.status ?? (opts.ok ? 200 : 500);
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

describe("eventsGet wrapper", () => {
  it("GETs /v1.0/me/events/{id} with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "evt-1", subject: "Hello" },
    });

    await eventsGet({ accessToken: "t", eventId: "evt-1" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/events/evt-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Authorization: "Bearer t" });
  });

  it("URL-encodes event ids that contain edge chars", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "x" } });

    await eventsGet({
      accessToken: "t",
      eventId: "AAMk+evt/with=specials",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/events/AAMk%2Bevt%2Fwith%3Dspecials",
    );
  });

  it("returns the parsed Graph event on 200", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "evt-2",
        subject: "Hello",
        start: { dateTime: "2026-05-15T14:30:00", timeZone: "UTC" },
        end: { dateTime: "2026-05-15T15:30:00", timeZone: "UTC" },
        attendees: [
          { emailAddress: { address: "alice@x.com" }, type: "required" },
        ],
      },
    });

    const result = await eventsGet({ accessToken: "t", eventId: "evt-2" });

    expect(result.id).toBe("evt-2");
    expect(result.attendees).toHaveLength(1);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}',
    });

    await expect(
      eventsGet({ accessToken: "stale", eventId: "x" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (event deleted between caller's interactions)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText:
        '{"error":{"code":"ErrorItemNotFound","message":"The specified object was not found"}}',
    });

    await expect(
      eventsGet({ accessToken: "t", eventId: "evt-gone" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Graph error message on 4xx failures other than 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText: '{"error":{"code":"BadRequest","message":"Invalid event id"}}',
    });

    await expect(
      eventsGet({ accessToken: "t", eventId: "bad" }),
    ).rejects.toThrow(/Invalid event id/);
  });
});
