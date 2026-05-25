/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/api/cardsList.ts` — Slice
 * 4.TRELLO-META-2. New list-cards helper
 * (GET /1/boards/{boardId}/cards). Bounded: filter=open + limit. Backs
 * the `trello:cards` resolver. Asserts NO card body content is requested.
 */
import { cardsList } from "@/integrations/trello/api/cardsList";
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

describe("cardsList", () => {
  it("GETs /1/boards/{boardId}/cards with filter=open, fields, and the limit", async () => {
    const captured = captureFetch([{ id: "c1", name: "Card" }]);
    await cardsList({ accessToken: "tok", boardId: "b1", limit: 200 });
    const u = new URL(captured.url!);
    expect(captured.method).toBe("GET");
    expect(u.pathname).toBe("/1/boards/b1/cards");
    expect(u.searchParams.get("filter")).toBe("open");
    expect(u.searchParams.get("fields")).toBe("id,name,due,idList");
    expect(u.searchParams.get("limit")).toBe("200");
  });

  it("requests NO card body content (no desc / no comments)", async () => {
    const captured = captureFetch([]);
    await cardsList({ accessToken: "tok", boardId: "b1", limit: 50 });
    const fields = new URL(captured.url!).searchParams.get("fields") ?? "";
    expect(fields).not.toContain("desc");
    expect(fields.split(",")).toEqual(["id", "name", "due", "idList"]);
  });

  it("forwards a custom limit", async () => {
    const captured = captureFetch([]);
    await cardsList({ accessToken: "tok", boardId: "b1", limit: 25 });
    expect(new URL(captured.url!).searchParams.get("limit")).toBe("25");
  });

  it("returns the cards array", async () => {
    captureFetch([
      { id: "c1", name: "A", idList: "l1", due: null },
      { id: "c2", name: "B", idList: "l2", due: "2026-06-01T00:00:00Z" },
    ]);
    const cards = await cardsList({ accessToken: "tok", boardId: "b1", limit: 200 });
    expect(cards.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("propagates HTTP 401 as Unauthorized401Error", async () => {
    captureFetch("nope", 401);
    await expect(
      cardsList({ accessToken: "tok", boardId: "b1", limit: 200 }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("propagates HTTP 404 as TrelloNotFoundError(board <id> cards)", async () => {
    captureFetch("not found", 404);
    let captured: unknown;
    try {
      await cardsList({ accessToken: "tok", boardId: "bGONE", limit: 200 });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(TrelloNotFoundError);
    expect((captured as TrelloNotFoundError).resource).toBe("board bGONE cards");
  });
});
