/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-onenote/api/sectionsListAll.ts` —
 * RESOLVERS-1. New account-wide sections list helper
 * (GET /v1.0/me/onenote/sections?$expand=parentNotebook) mirroring the
 * Teams `teamsList` Graph transport style. Backs the
 * `microsoft-onenote:target_sections` resolver.
 */
import { sectionsListAll } from "@/integrations/microsoft-onenote/api/sectionsListAll";
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
    {
      id: "sec-1",
      displayName: "Meeting notes",
      parentNotebook: { id: "nb-1", displayName: "Work" },
    },
    {
      id: "sec-2",
      displayName: "Recipes",
      parentNotebook: { id: "nb-2", displayName: "Personal" },
    },
  ],
};

describe("sectionsListAll", () => {
  it("GETs /v1.0/me/onenote/sections with $expand=parentNotebook, $top, and a Bearer token", async () => {
    const fetchSpy = mockFetchOnce(RESPONSE);
    await sectionsListAll({ accessToken: "tok", top: 100 });
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/me/onenote/sections");
    expect(url.searchParams.get("$expand")).toBe(
      "parentNotebook($select=id,displayName)",
    );
    expect(url.searchParams.get("$top")).toBe("100");
    const init = fetchSpy.mock.calls[0]![1] as {
      method?: string;
      headers?: Record<string, string>;
    };
    expect(init.method).toBe("GET");
    expect(init.headers?.Authorization).toBe("Bearer tok");
  });

  it("returns the sections array (parentNotebook intact) + nextLink", async () => {
    mockFetchOnce({ ...RESPONSE, "@odata.nextLink": "https://graph/next" });
    const result = await sectionsListAll({ accessToken: "tok" });
    expect(result.sections.map((s) => s.id)).toEqual(["sec-1", "sec-2"]);
    expect(result.sections[0]!.parentNotebook?.displayName).toBe("Work");
    expect(result.nextLink).toBe("https://graph/next");
  });

  it("nextLink is null when absent; $top omitted when not passed", async () => {
    const fetchSpy = mockFetchOnce(RESPONSE);
    const result = await sectionsListAll({ accessToken: "tok" });
    expect(result.nextLink).toBeNull();
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.has("$top")).toBe(false);
  });

  it("propagates HTTP 401 as Unauthorized401Error", async () => {
    mockFetchOnce({ error: { code: "InvalidAuthenticationToken" } }, 401);
    await expect(
      sectionsListAll({ accessToken: "tok" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("propagates HTTP 404 as NotFoundError(onenote sections)", async () => {
    mockFetchOnce({ error: { code: "NotFound", message: "nope" } }, 404);
    let captured: unknown;
    try {
      await sectionsListAll({ accessToken: "tok" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(NotFoundError);
    expect((captured as NotFoundError).resource).toBe("onenote sections");
  });

  it("never embeds the token in the thrown error (non-OK)", async () => {
    mockFetchOnce({ error: { code: "Throttled", message: "slow down" } }, 429);
    let msg = "";
    try {
      await sectionsListAll({ accessToken: "super-secret-token" });
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).not.toContain("super-secret-token");
  });
});
