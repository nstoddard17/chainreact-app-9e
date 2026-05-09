/**
 * @jest-environment node
 *
 * Tests for the shared Microsoft Graph subscription wrappers
 * (createSubscription / renewSubscription / deleteSubscription). Consolidated
 * from Slice 6's three per-provider test files when the wrappers moved to
 * `_shared/microsoft/api/subscriptions.ts` in Slice 7. Same coverage,
 * same mock-fetch shape — behavior is preserved end-to-end.
 */
import {
  createSubscription,
  deleteSubscription,
  renewSubscription,
} from "@/integrations/_shared/microsoft/api/subscriptions";
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
  // Status 204 / 205 / 304 forbid a body per WHATWG; pass `null` body
  // for those, anything else gets the bodyText (default empty string)
  // or serialized JSON.
  const noBody = status === 204 || status === 205 || status === 304;
  const body = noBody
    ? null
    : opts.bodyText !== undefined
      ? opts.bodyText
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

// ─── createSubscription ─────────────────────────────────────────────────────

const VALID_CREATE_INPUT = {
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
        notificationUrl: VALID_CREATE_INPUT.notificationUrl,
        expirationDateTime: VALID_CREATE_INPUT.expirationDateTime,
        clientState: VALID_CREATE_INPUT.clientState,
      },
    });

    const result = await createSubscription(VALID_CREATE_INPUT);

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
      notificationUrl: VALID_CREATE_INPUT.notificationUrl,
      resource: "/me/messages",
      expirationDateTime: VALID_CREATE_INPUT.expirationDateTime,
      clientState: "deadbeef-32-bytes-hex",
      lifecycleNotificationUrl: VALID_CREATE_INPUT.lifecycleNotificationUrl,
    });
    expect(result.id).toBe("sub-1");
  });

  it("omits lifecycleNotificationUrl from the body when not provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      status: 201,
      json: {
        id: "sub",
        resource: "x",
        changeType: "created",
        notificationUrl: "x",
        expirationDateTime: "x",
      },
    });

    const { lifecycleNotificationUrl: _lc, ...withoutLifecycle } =
      VALID_CREATE_INPUT;
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

    await expect(createSubscription(VALID_CREATE_INPUT)).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("surfaces Graph error.message on validation failure", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText:
        '{"error":{"code":"ValidationError","message":"Subscription validation request failed."}}',
    });

    await expect(createSubscription(VALID_CREATE_INPUT)).rejects.toThrow(
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

    await createSubscription(VALID_CREATE_INPUT);

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/subscriptions",
    );
  });

  it("works for /me/events resource — same wire-format, different resource string", async () => {
    // Slice 7 add: confirms the wrapper is genuinely resource-agnostic
    // (i.e., Outlook Calendar can use it with no per-provider branching
    // inside the wrapper).
    const fetchSpy = mockFetchOnce({
      ok: true,
      status: 201,
      json: {
        id: "sub-cal",
        resource: "/me/events",
        changeType: "created,updated,deleted",
        notificationUrl: "x",
        expirationDateTime: "x",
      },
    });

    await createSubscription({
      ...VALID_CREATE_INPUT,
      resource: "/me/events",
      changeType: "created,updated,deleted",
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.resource).toBe("/me/events");
    expect(body.changeType).toBe("created,updated,deleted");
  });
});

// ─── renewSubscription ─────────────────────────────────────────────────────

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

  it("URL-encodes subscription ids that contain edge chars (e.g. '/')", async () => {
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

// ─── deleteSubscription ────────────────────────────────────────────────────

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
      bodyText:
        '{"error":{"code":"ErrorAccessDenied","message":"Access denied"}}',
    });

    await expect(
      deleteSubscription({ accessToken: "t", subscriptionId: "sub" }),
    ).rejects.toThrow(/Access denied/);
  });
});
