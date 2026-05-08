/**
 * @jest-environment node
 */
import { channelsStop } from "@/integrations/google-calendar/api/channelsStop";
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

describe("channelsStop", () => {
  it("POSTs channels/stop with id + resourceId", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await channelsStop({
      accessToken: "ya29.x",
      channelId: "channel-1",
      resourceId: "res-1",
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://www.googleapis.com/calendar/v3/channels/stop");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      id: "channel-1",
      resourceId: "res-1",
    });
  });

  it("returns void on 204", async () => {
    mockFetchOnce({ ok: true, status: 204 });
    const result = await channelsStop({
      accessToken: "x",
      channelId: "c",
      resourceId: "r",
    });
    expect(result).toBeUndefined();
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401, json: { error: { code: 401 } } });
    await expect(
      channelsStop({ accessToken: "stale", channelId: "c", resourceId: "r" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (channel already stopped)", async () => {
    mockFetchOnce({ ok: false, status: 404, json: { error: { code: 404, message: "Not Found" } } });
    await expect(
      channelsStop({ accessToken: "x", channelId: "c", resourceId: "r" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError on HTTP 410 (channel gone)", async () => {
    mockFetchOnce({ ok: false, status: 410, json: { error: { code: 410, message: "Gone" } } });
    await expect(
      channelsStop({ accessToken: "x", channelId: "c", resourceId: "r" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
