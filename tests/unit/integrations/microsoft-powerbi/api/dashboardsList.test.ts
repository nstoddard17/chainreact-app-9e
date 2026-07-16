/**
 * @jest-environment node
 */
import { dashboardsList } from "@/integrations/microsoft-powerbi/api/dashboards/dashboardsList";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("dashboardsList", () => {
  it("GETs the group-scoped dashboards path with a bearer token", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ value: [] }));

    await dashboardsList({ accessToken: "tok-abc", groupId: "ws 1" });

    const [url, init] = mockFetch.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.powerbi.com/v1.0/myorg/groups/ws%201/dashboards");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok-abc");
  });

  it("maps rows onto the fixed id + displayName key set", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            id: "db-1",
            displayName: "Exec Dash",
            embedUrl: "https://app.powerbi.com/dashboardEmbed?dashboardId=db-1",
            webUrl: "https://app.powerbi.com/groups/ws-1/dashboards/db-1",
            isReadOnly: false,
          },
        ],
      }),
    );

    const result = await dashboardsList({ accessToken: "tok", groupId: "ws-1" });

    // Provider URLs must never reach a workflow variable — fixed keys only.
    expect(result).toEqual([{ id: "db-1", displayName: "Exec Dash" }]);
  });

  it("skips rows missing an id or displayName", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: "db-1", displayName: "Keep" },
          { id: "db-2" },
          { displayName: "No id" },
          { id: 42, displayName: "Wrong type" },
        ],
      }),
    );

    const result = await dashboardsList({ accessToken: "tok", groupId: "ws-1" });

    expect(result).toEqual([{ id: "db-1", displayName: "Keep" }]);
  });

  it("returns an empty list when the body has no value array", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    expect(await dashboardsList({ accessToken: "tok", groupId: "ws-1" })).toEqual([]);
  });

  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(
      dashboardsList({ accessToken: "tok", groupId: "ws-1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError naming the workspace on HTTP 404", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: { code: "WorkspaceNotFound" } }, 404),
    );

    await expect(
      dashboardsList({ accessToken: "tok", groupId: "ws-1" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws a sanitized error on other non-2xx without leaking the token", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: { code: "TooManyRequests" } }, 429),
    );

    await expect(
      dashboardsList({ accessToken: "tok-secret", groupId: "ws-1" }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("tok-secret"),
      }) as Error,
    );
  });
});
