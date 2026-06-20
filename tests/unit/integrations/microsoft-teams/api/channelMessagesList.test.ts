/**
 * @jest-environment node
 *
 * Slice 4.TEAMS-READ-2 — channelMessagesList wrapper (one page of channel
 * messages). Pins URL construction (messages list on the encoded team/channel
 * path, optional $top) + the 401/404/error mapping + nextLink passthrough.
 */
import { channelMessagesList } from "@/integrations/microsoft-teams/api/channelMessagesList";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(opts: { ok: boolean; status?: number; json?: unknown; bodyText?: string }) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body =
    opts.bodyText !== undefined
      ? opts.bodyText
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : "";
  return jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status }));
}

describe("channelMessagesList wrapper", () => {
  it("GETs the channel messages endpoint with $top on the encoded path", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });

    await channelMessagesList({ accessToken: "t", teamId: "team 1", channelId: "ch/1", top: 20 });

    const raw = String(fetchSpy.mock.calls[0]![0]);
    expect(raw).toContain("/v1.0/teams/team%201/channels/ch%2F1/messages");
    // searchParams encodes `$` as `%24` (same as the sibling teamsList /
    // channelsList `$select` wrappers); Graph decodes it. Assert via the
    // parsed param rather than the raw literal.
    expect(new URL(raw).searchParams.get("$top")).toBe("20");
  });

  it("omits $top when not supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });
    await channelMessagesList({ accessToken: "t", teamId: "t1", channelId: "c1" });
    expect(new URL(String(fetchSpy.mock.calls[0]![0])).searchParams.has("$top")).toBe(false);
  });

  it("returns the message page plus nextLink", async () => {
    mockFetchOnce({
      ok: true,
      json: { value: [{ id: "m1" }], "@odata.nextLink": "https://graph/next" },
    });
    const result = await channelMessagesList({ accessToken: "t", teamId: "t1", channelId: "c1", top: 5 });
    expect(result.messages).toEqual([{ id: "m1" }]);
    expect(result.nextLink).toBe("https://graph/next");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    await expect(
      channelMessagesList({ accessToken: "stale", teamId: "t1", channelId: "c1", top: 5 }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({ ok: false, status: 404, bodyText: '{"error":{"code":"itemNotFound"}}' });
    await expect(
      channelMessagesList({ accessToken: "t", teamId: "t1", channelId: "gone", top: 5 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
