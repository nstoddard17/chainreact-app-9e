/**
 * @jest-environment node
 */
import { channelGet } from "@/integrations/microsoft-teams/api/channelGet";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
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

describe("channelGet wrapper", () => {
  it("GETs /v1.0/teams/{teamId}/channels/{channelId} with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "ch-1", displayName: "General" },
    });

    await channelGet({
      accessToken: "t",
      teamId: "team-1",
      channelId: "ch-1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/teams/team-1/channels/ch-1",
    );
    expect(fetchSpy.mock.calls[0]![1]!.method).toBe("GET");
    expect(fetchSpy.mock.calls[0]![1]!.headers).toEqual({
      Authorization: "Bearer t",
    });
  });

  it("returns the parsed channel resource (narrow shape)", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "ch-1",
        displayName: "General",
        description: "Default channel",
        email: "general@team.example",
        membershipType: "standard",
        createdDateTime: "2026-01-01T00:00:00Z",
        webUrl: "https://teams.microsoft.com/l/channel/...",
      },
    });

    const result = await channelGet({
      accessToken: "t",
      teamId: "team-1",
      channelId: "ch-1",
    });

    expect(result.id).toBe("ch-1");
    expect(result.displayName).toBe("General");
    expect(result.membershipType).toBe("standard");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      channelGet({ accessToken: "stale", teamId: "t", channelId: "c" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"NotFound","message":"Channel not found."}}',
    });

    await expect(
      channelGet({ accessToken: "t", teamId: "team-1", channelId: "gone" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
