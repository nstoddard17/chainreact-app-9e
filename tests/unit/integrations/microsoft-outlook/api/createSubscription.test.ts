/**
 * @jest-environment node
 */
import { createSubscription } from "@/integrations/microsoft-outlook/api/createSubscription";
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

const VALID_INPUT = {
  accessToken: "ms-token",
  resource: "/me/messages",
  changeType: "created",
  notificationUrl: "https://app.example.test/api/webhooks/microsoft-outlook",
  lifecycleNotificationUrl:
    "https://app.example.test/api/webhooks/microsoft-outlook/lifecycle",
  expirationDateTime: "2026-05-11T00:00:00.000Z",
  clientState: "deadbeef-32-bytes-hex",
};

describe("createSubscription wrapper", () => {
  it("POSTs to /v1.0/subscriptions with the full subscription envelope", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      status: 201,
      json: {
        id: "sub-1",
        resource: "/me/messages",
        changeType: "created",
        notificationUrl: VALID_INPUT.notificationUrl,
        expirationDateTime: VALID_INPUT.expirationDateTime,
        clientState: VALID_INPUT.clientState,
      },
    });

    const result = await createSubscription(VALID_INPUT);

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/subscriptions",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer ms-token",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      changeType: "created",
      notificationUrl: VALID_INPUT.notificationUrl,
      resource: "/me/messages",
      expirationDateTime: VALID_INPUT.expirationDateTime,
      clientState: "deadbeef-32-bytes-hex",
      lifecycleNotificationUrl: VALID_INPUT.lifecycleNotificationUrl,
    });
    expect(result.id).toBe("sub-1");
  });

  it("omits lifecycleNotificationUrl from the body when not provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      status: 201,
      json: { id: "sub", resource: "x", changeType: "created", notificationUrl: "x", expirationDateTime: "x" },
    });

    const { lifecycleNotificationUrl: _lc, ...withoutLifecycle } = VALID_INPUT;
    await createSubscription(withoutLifecycle);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.lifecycleNotificationUrl).toBeUndefined();
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}',
    });

    await expect(createSubscription(VALID_INPUT)).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("surfaces Graph error.message on validation failure", async () => {
    // Validation handshake failure surfaces as 400 with an informative
    // message — the most common failure mode in production.
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText:
        '{"error":{"code":"ValidationError","message":"Subscription validation request failed."}}',
    });

    await expect(createSubscription(VALID_INPUT)).rejects.toThrow(
      /Subscription validation request failed/,
    );
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({
      ok: true,
      status: 201,
      json: {
        id: "sub",
        resource: "/me/messages",
        changeType: "created",
        notificationUrl: "x",
        expirationDateTime: "x",
      },
    });

    await createSubscription(VALID_INPUT);

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/subscriptions",
    );
  });
});
