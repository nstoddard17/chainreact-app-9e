/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/api/boardsList.ts` — Slice
 * 4.TRELLO-META-2. New list-boards helper (GET /1/members/me/boards)
 * routed through the shared `trelloRequest` transport. Backs the
 * `trello:boards` resolver.
 *
 * Pattern: capture the wire request, return a stub response, assert
 * URL + method + query shape. Auth params (key/token) ride in the URL.
 */
import { boardsList } from "@/integrations/trello/api/boardsList";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const ORIGINAL_FETCH = global.fetch;

interface CapturedRequest {
  url?: string;
  method?: string;
}

function captureFetch(responseBody: unknown, status = 200): CapturedRequest {
  const captured: CapturedRequest = {};
  global.fetch = jest.fn(
    async (input: unknown, init?: Parameters<typeof fetch>[1]) => {
      captured.url =
        typeof input === "string"
          ? input
          : (input as { toString: () => string }).toString();
      captured.method = init?.method;
      return new Response(JSON.stringify(responseBody), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  ) as unknown as typeof fetch;
  return captured;
}

beforeEach(() => {
  process.env.TRELLO_CLIENT_ID = "test-key";
});

afterEach(() => {
  delete process.env.TRELLO_CLIENT_ID;
  global.fetch = ORIGINAL_FETCH;
});

describe("boardsList", () => {
  it("GETs /1/members/me/boards with fields=id,name,closed + key+token", async () => {
    const captured = captureFetch([{ id: "b1", name: "CRM", closed: false }]);
    await boardsList({ accessToken: "tok" });
    const u = new URL(captured.url!);
    expect(captured.method).toBe("GET");
    expect(u.pathname).toBe("/1/members/me/boards");
    expect(u.searchParams.get("fields")).toBe("id,name,closed");
    expect(u.searchParams.get("key")).toBe("test-key");
    expect(u.searchParams.get("token")).toBe("tok");
  });

  it("returns the boards array", async () => {
    captureFetch([
      { id: "b1", name: "CRM", closed: false },
      { id: "b2", name: "Archive", closed: true },
    ]);
    const boards = await boardsList({ accessToken: "tok" });
    expect(boards).toHaveLength(2);
    expect(boards[0]).toEqual({ id: "b1", name: "CRM", closed: false });
  });

  it("propagates HTTP 401 as Unauthorized401Error", async () => {
    captureFetch("invalid token", 401);
    await expect(boardsList({ accessToken: "tok" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("propagates HTTP 404 as TrelloNotFoundError(boards)", async () => {
    captureFetch("not found", 404);
    let captured: unknown;
    try {
      await boardsList({ accessToken: "tok" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(TrelloNotFoundError);
    expect((captured as TrelloNotFoundError).resource).toBe("boards");
  });

  it("never embeds the token in the thrown error message (non-OK)", async () => {
    captureFetch("boom", 500);
    let msg = "";
    try {
      await boardsList({ accessToken: "super-secret-token" });
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).not.toContain("super-secret-token");
  });
});
