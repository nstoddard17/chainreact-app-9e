/**
 * @jest-environment node
 */
import { eventsCreate } from "@/integrations/microsoft-outlook-calendar/api/eventsCreate";
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
  const status = opts.status ?? (opts.ok ? 201 : 400);
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

const VALID_BODY = {
  subject: "Test Meeting",
  start: { dateTime: "2026-05-15T14:30:00", timeZone: "UTC" },
  end: { dateTime: "2026-05-15T15:30:00", timeZone: "UTC" },
  isAllDay: false,
  responseRequested: true,
};

describe("eventsCreate wrapper", () => {
  it("POSTs to /v1.0/me/events with the body verbatim", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      status: 201,
      json: { id: "evt-1", subject: "Test Meeting" },
    });

    await eventsCreate({ accessToken: "t", body: VALID_BODY });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/events",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer t",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual(VALID_BODY);
  });

  it("returns the parsed Graph event on 201", async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: {
        id: "evt-1",
        subject: "Test Meeting",
        start: { dateTime: "2026-05-15T14:30:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2026-05-15T15:30:00.0000000", timeZone: "UTC" },
        webLink: "https://outlook.office.com/...",
      },
    });

    const result = await eventsCreate({ accessToken: "t", body: VALID_BODY });

    expect(result.id).toBe("evt-1");
    expect(result.webLink).toBe("https://outlook.office.com/...");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}',
    });

    await expect(
      eventsCreate({ accessToken: "stale", body: VALID_BODY }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Graph error.message on 4xx failures", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText:
        '{"error":{"code":"ErrorInvalidArgument","message":"Start and end times must use the same timezone for all-day events"}}',
    });

    await expect(
      eventsCreate({ accessToken: "t", body: VALID_BODY }),
    ).rejects.toThrow(/Start and end times/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true, status: 201, json: { id: "x" } });

    await eventsCreate({ accessToken: "t", body: VALID_BODY });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/events",
    );
  });
});
