/**
 * @jest-environment node
 */
import { eventsDelete } from "@/integrations/microsoft-outlook-calendar/api/eventsDelete";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  bodyText?: string;
}) {
  const status = opts.status ?? (opts.ok ? 204 : 400);
  // Status 204 / 205 / 304 forbid a body per WHATWG.
  const noBody = status === 204 || status === 205 || status === 304;
  const body = noBody ? null : (opts.bodyText ?? "");
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("eventsDelete wrapper", () => {
  it("DELETEs /v1.0/me/events/{id} with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await eventsDelete({ accessToken: "t", eventId: "evt-1" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/events/evt-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ Authorization: "Bearer t" });
    expect(init.body).toBeUndefined();
  });

  it("returns void on 204 No Content", async () => {
    mockFetchOnce({ ok: true, status: 204 });

    const result = await eventsDelete({
      accessToken: "t",
      eventId: "evt-1",
    });

    expect(result).toBeUndefined();
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}',
    });

    await expect(
      eventsDelete({ accessToken: "stale", eventId: "x" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (action handler turns into idempotent success)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText:
        '{"error":{"code":"ErrorItemNotFound","message":"Not found"}}',
    });

    await expect(
      eventsDelete({ accessToken: "t", eventId: "evt-gone" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Graph error message on 4xx other than 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      bodyText:
        '{"error":{"code":"ErrorAccessDenied","message":"Access denied"}}',
    });

    await expect(
      eventsDelete({ accessToken: "t", eventId: "evt-1" }),
    ).rejects.toThrow(/Access denied/);
  });
});
