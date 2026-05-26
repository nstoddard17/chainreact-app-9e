/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-teams/api/teamsList.ts` — Slice
 * 4.TEAMS-META-2. New list-joined-teams helper (GET /v1.0/me/joinedTeams)
 * mirroring the `teamMembersList` Graph transport. Backs the
 * `microsoft-teams:teams` resolver.
 */
import { teamsList } from "@/integrations/microsoft-teams/api/teamsList";
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
    { id: "t1", displayName: "Engineering", description: "Eng team" },
    { id: "t2", displayName: "Marketing", description: null },
  ],
};

describe("teamsList", () => {
  it("GETs /v1.0/me/joinedTeams with $select and a Bearer token", async () => {
    const fetchSpy = mockFetchOnce(RESPONSE);
    await teamsList({ accessToken: "tok" });
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/me/joinedTeams");
    expect(url.searchParams.get("$select")).toBe("id,displayName,description");
    const init = fetchSpy.mock.calls[0]![1] as {
      method?: string;
      headers?: Record<string, string>;
    };
    expect(init.method).toBe("GET");
    expect(init.headers?.Authorization).toBe("Bearer tok");
  });

  it("returns the teams array + nextLink", async () => {
    mockFetchOnce({ ...RESPONSE, "@odata.nextLink": "https://graph/next" });
    const result = await teamsList({ accessToken: "tok" });
    expect(result.teams.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(result.nextLink).toBe("https://graph/next");
  });

  it("nextLink is null when absent", async () => {
    mockFetchOnce(RESPONSE);
    const result = await teamsList({ accessToken: "tok" });
    expect(result.nextLink).toBeNull();
  });

  it("propagates HTTP 401 as Unauthorized401Error", async () => {
    mockFetchOnce({ error: { code: "InvalidAuthenticationToken" } }, 401);
    await expect(teamsList({ accessToken: "tok" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("propagates HTTP 404 as NotFoundError(joined teams)", async () => {
    mockFetchOnce({ error: { code: "NotFound", message: "nope" } }, 404);
    let captured: unknown;
    try {
      await teamsList({ accessToken: "tok" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(NotFoundError);
    expect((captured as NotFoundError).resource).toBe("joined teams");
  });

  it("never embeds the token in the thrown error (non-OK)", async () => {
    mockFetchOnce({ error: { code: "Throttled", message: "slow down" } }, 429);
    let msg = "";
    try {
      await teamsList({ accessToken: "super-secret-token" });
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).not.toContain("super-secret-token");
  });
});
