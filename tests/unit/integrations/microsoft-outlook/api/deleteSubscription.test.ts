/**
 * @jest-environment node
 */
import { deleteSubscription } from "@/integrations/microsoft-outlook/api/deleteSubscription";
import { NotFoundError } from "@/integrations/microsoft-outlook/api/errors";
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
  // Status 204 / 205 / 304 forbid a body per WHATWG; pass `null` body
  // for those, anything else gets the bodyText (default empty string).
  const noBody = status === 204 || status === 205 || status === 304;
  const body = noBody ? null : (opts.bodyText ?? "");
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("deleteSubscription wrapper", () => {
  it("DELETEs /v1.0/subscriptions/{id} with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await deleteSubscription({ accessToken: "t", subscriptionId: "sub-1" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/subscriptions/sub-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ Authorization: "Bearer t" });
    expect(init.body).toBeUndefined();
  });

  it("returns void on 204 No Content (Graph's success status)", async () => {
    mockFetchOnce({ ok: true, status: 204 });

    const result = await deleteSubscription({
      accessToken: "t",
      subscriptionId: "sub",
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
      deleteSubscription({ accessToken: "stale", subscriptionId: "sub" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (already gone)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"ResourceNotFound","message":"gone"}}',
    });

    await expect(
      deleteSubscription({ accessToken: "t", subscriptionId: "expired" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws generic Error on 403 with message surfaced (deactivate hook decides whether to swallow)", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      bodyText: '{"error":{"code":"ErrorAccessDenied","message":"Access denied"}}',
    });

    await expect(
      deleteSubscription({ accessToken: "t", subscriptionId: "sub" }),
    ).rejects.toThrow(/Access denied/);
  });
});
