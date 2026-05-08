/**
 * @jest-environment node
 */
import { eventsWatch } from "@/integrations/google-calendar/api/eventsWatch";
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

describe("eventsWatch", () => {
  it("POSTs the watch endpoint with channel id, type web_hook, address, and token", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        kind: "api#channel",
        id: "channel-1",
        resourceId: "res-1",
        expiration: "1735689600000",
      },
    });

    await eventsWatch({
      accessToken: "ya29.x",
      calendarId: "primary",
      channelId: "channel-1",
      channelToken: "hmac-token",
      webhookAddress: "https://example.com/api/webhooks/google-calendar",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      id: "channel-1",
      type: "web_hook",
      address: "https://example.com/api/webhooks/google-calendar",
      token: "hmac-token",
    });
  });

  it("forwards ttlSeconds via params.ttl when provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "c", resourceId: "r", expiration: "1" },
    });

    await eventsWatch({
      accessToken: "x",
      calendarId: "primary",
      channelId: "c",
      channelToken: "t",
      webhookAddress: "https://e/h",
      ttlSeconds: 3600,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.params).toEqual({ ttl: "3600" });
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401, json: { error: { code: 401 } } });
    await expect(
      eventsWatch({
        accessToken: "stale",
        calendarId: "primary",
        channelId: "c",
        channelToken: "t",
        webhookAddress: "https://e/h",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({ ok: false, status: 404, json: { error: { code: 404, message: "Not Found" } } });
    await expect(
      eventsWatch({
        accessToken: "x",
        calendarId: "missing",
        channelId: "c",
        channelToken: "t",
        webhookAddress: "https://e/h",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns the watch resource on success", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        kind: "api#channel",
        id: "channel-1",
        resourceId: "res-1",
        resourceUri: "https://...",
        expiration: "1735689600000",
      },
    });

    const result = await eventsWatch({
      accessToken: "x",
      calendarId: "primary",
      channelId: "channel-1",
      channelToken: "t",
      webhookAddress: "https://e/h",
    });

    expect(result.id).toBe("channel-1");
    expect(result.resourceId).toBe("res-1");
    expect(result.expiration).toBe("1735689600000");
  });
});
