/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-teams/api/chatsList.ts` — RESOLVERS-1.
 * New list-my-chats helper (GET /v1.0/me/chats?$expand=members&$top=50)
 * mirroring the `teamsList` Graph transport. Backs the
 * `microsoft-teams:chats` resolver.
 */
import { chatsList } from "@/integrations/microsoft-teams/api/chatsList";
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
      id: "19:chat1@thread.v2",
      topic: "Launch planning",
      chatType: "group",
      members: [{ displayName: "Ada" }, { displayName: "Grace" }],
    },
    {
      id: "19:chat2@thread.v2",
      topic: null,
      chatType: "oneOnOne",
      members: [{ displayName: "Ada" }, { displayName: "Linus" }],
    },
  ],
};

describe("chatsList", () => {
  it("GETs /v1.0/me/chats with $select, $expand=members, $top=50, and a Bearer token", async () => {
    const fetchSpy = mockFetchOnce(RESPONSE);
    await chatsList({ accessToken: "tok" });
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/me/chats");
    expect(url.searchParams.get("$select")).toBe("id,topic,chatType");
    expect(url.searchParams.get("$expand")).toBe("members");
    expect(url.searchParams.get("$top")).toBe("50");
    const init = fetchSpy.mock.calls[0]![1] as {
      method?: string;
      headers?: Record<string, string>;
    };
    expect(init.method).toBe("GET");
    expect(init.headers?.Authorization).toBe("Bearer tok");
  });

  it("returns the chats array + nextLink", async () => {
    mockFetchOnce({ ...RESPONSE, "@odata.nextLink": "https://graph/next" });
    const result = await chatsList({ accessToken: "tok" });
    expect(result.chats.map((c) => c.id)).toEqual([
      "19:chat1@thread.v2",
      "19:chat2@thread.v2",
    ]);
    expect(result.nextLink).toBe("https://graph/next");
  });

  it("nextLink is null when absent", async () => {
    mockFetchOnce(RESPONSE);
    const result = await chatsList({ accessToken: "tok" });
    expect(result.nextLink).toBeNull();
  });

  it("propagates HTTP 401 as Unauthorized401Error", async () => {
    mockFetchOnce({ error: { code: "InvalidAuthenticationToken" } }, 401);
    await expect(chatsList({ accessToken: "tok" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("propagates HTTP 404 as NotFoundError(chats)", async () => {
    mockFetchOnce({ error: { code: "NotFound", message: "nope" } }, 404);
    let captured: unknown;
    try {
      await chatsList({ accessToken: "tok" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(NotFoundError);
    expect((captured as NotFoundError).resource).toBe("chats");
  });

  it("never embeds the token in the thrown error (non-OK)", async () => {
    mockFetchOnce({ error: { code: "Throttled", message: "slow down" } }, 429);
    let msg = "";
    try {
      await chatsList({ accessToken: "super-secret-token" });
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).not.toContain("super-secret-token");
  });
});
