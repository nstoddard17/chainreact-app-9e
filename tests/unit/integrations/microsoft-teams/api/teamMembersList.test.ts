/**
 * @jest-environment node
 */
import { teamMembersList } from "@/integrations/microsoft-teams/api/teamMembersList";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  json?: unknown;
}) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("teamMembersList wrapper", () => {
  it("GETs /teams/{id}/members and surfaces nextLink", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        value: [
          {
            id: "mem-1",
            displayName: "Alice",
            email: "alice@contoso.com",
            userId: "aad-alice",
            roles: ["owner"],
          },
        ],
        "@odata.nextLink":
          "https://graph.microsoft.com/v1.0/teams/team-1/members?$skiptoken=x",
      },
    });

    const result = await teamMembersList({
      accessToken: "t",
      teamId: "team-1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/teams/team-1/members",
    );
    expect(result.members).toHaveLength(1);
    expect(result.members[0]).toMatchObject({
      id: "mem-1",
      displayName: "Alice",
      roles: ["owner"],
    });
    expect(result.nextLink).toMatch(/skiptoken/);
  });

  it("returns nextLink: null when Graph omits @odata.nextLink", async () => {
    mockFetchOnce({ ok: true, json: { value: [] } });

    const result = await teamMembersList({
      accessToken: "t",
      teamId: "team-1",
    });

    expect(result.nextLink).toBeNull();
    expect(result.members).toEqual([]);
  });

  it("forwards top to $top", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });

    await teamMembersList({
      accessToken: "t",
      teamId: "team-1",
      top: 50,
    });

    expect(fetchSpy.mock.calls[0]![0]).toMatch(/%24top=50/);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      teamMembersList({ accessToken: "stale", teamId: "t" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({ ok: false, status: 404 });

    await expect(
      teamMembersList({ accessToken: "t", teamId: "gone" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
