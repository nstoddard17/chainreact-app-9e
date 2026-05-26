/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-teams/api/channelsList.ts` — Slice
 * 4.TEAMS-META-2. New list-channels helper
 * (GET /v1.0/teams/{teamId}/channels). Backs the `microsoft-teams:channels`
 * resolver. Asserts the channel `email` field is NOT requested.
 */
import { channelsList } from "@/integrations/microsoft-teams/api/channelsList";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(json: unknown, status = 200) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(json), { status }));
}

const RESPONSE = {
  value: [
    { id: "c1", displayName: "General", membershipType: "standard" },
    { id: "c2", displayName: "Secret", membershipType: "private" },
  ],
};

describe("channelsList", () => {
  it("GETs /v1.0/teams/{teamId}/channels with $select + Bearer token", async () => {
    const fetchSpy = mockFetchOnce(RESPONSE);
    await channelsList({ accessToken: "tok", teamId: "t1" });
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/teams/t1/channels");
    expect(url.searchParams.get("$select")).toBe(
      "id,displayName,description,membershipType",
    );
    const init = fetchSpy.mock.calls[0]![1] as {
      headers?: Record<string, string>;
    };
    expect(init.headers?.Authorization).toBe("Bearer tok");
  });

  it("does NOT request the channel email field (sensitive)", async () => {
    const fetchSpy = mockFetchOnce(RESPONSE);
    await channelsList({ accessToken: "tok", teamId: "t1" });
    const select = new URL(fetchSpy.mock.calls[0]![0] as string).searchParams.get(
      "$select",
    )!;
    expect(select).not.toContain("email");
  });

  it("URL-encodes the team id in the path", async () => {
    const fetchSpy = mockFetchOnce(RESPONSE);
    await channelsList({ accessToken: "tok", teamId: "19:abc@thread.tacv2" });
    expect(new URL(fetchSpy.mock.calls[0]![0] as string).pathname).toBe(
      "/v1.0/teams/19%3Aabc%40thread.tacv2/channels",
    );
  });

  it("returns the channels array + nextLink", async () => {
    mockFetchOnce({ ...RESPONSE, "@odata.nextLink": "https://graph/next" });
    const result = await channelsList({ accessToken: "tok", teamId: "t1" });
    expect(result.channels.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(result.nextLink).toBe("https://graph/next");
  });

  it("propagates HTTP 401 as Unauthorized401Error", async () => {
    mockFetchOnce({ error: { code: "InvalidAuthenticationToken" } }, 401);
    await expect(
      channelsList({ accessToken: "tok", teamId: "t1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("propagates HTTP 404 as NotFoundError(team <id> channels)", async () => {
    mockFetchOnce({ error: { code: "NotFound" } }, 404);
    let captured: unknown;
    try {
      await channelsList({ accessToken: "tok", teamId: "tGONE" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(NotFoundError);
    expect((captured as NotFoundError).resource).toBe("team tGONE channels");
  });
});
