/**
 * @jest-environment node
 */
import { renewSubscription } from "@/integrations/microsoft-outlook/api/renewSubscription";
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

describe("renewSubscription wrapper", () => {
  it("PATCHes /v1.0/subscriptions/{id} with new expirationDateTime", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "sub-1",
        expirationDateTime: "2026-05-15T00:00:00.000Z",
      },
    });

    const result = await renewSubscription({
      accessToken: "t",
      subscriptionId: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/subscriptions/sub-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({
      Authorization: "Bearer t",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });
    expect(result.expirationDateTime).toBe("2026-05-15T00:00:00.000Z");
  });

  it("URL-encodes subscription ids that contain GUID hyphens (no encoding needed) and edge chars", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "x", expirationDateTime: "x" },
    });

    await renewSubscription({
      accessToken: "t",
      subscriptionId: "abc/def",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/subscriptions/abc%2Fdef",
    );
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}',
    });

    await expect(
      renewSubscription({
        accessToken: "stale",
        subscriptionId: "sub",
        expirationDateTime: "2026-05-15T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Graph error message on 4xx renewal failures", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText:
        '{"error":{"code":"ResourceNotFound","message":"Subscription not found"}}',
    });

    await expect(
      renewSubscription({
        accessToken: "t",
        subscriptionId: "stale-sub",
        expirationDateTime: "2026-05-15T00:00:00.000Z",
      }),
    ).rejects.toThrow(/Subscription not found/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "x", expirationDateTime: "x" },
    });

    await renewSubscription({
      accessToken: "t",
      subscriptionId: "sub",
      expirationDateTime: "x",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/subscriptions/sub",
    );
  });
});
