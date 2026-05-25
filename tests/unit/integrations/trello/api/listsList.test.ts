/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/api/listsList.ts` — Slice
 * 4.TRELLO-META-2. New list-lists helper
 * (GET /1/boards/{boardId}/lists). Backs the `trello:lists` resolver.
 */
import { listsList } from "@/integrations/trello/api/listsList";
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

describe("listsList", () => {
  it("GETs /1/boards/{boardId}/lists with fields=id,name,closed", async () => {
    const captured = captureFetch([{ id: "l1", name: "To Do", idBoard: "b1" }]);
    await listsList({ accessToken: "tok", boardId: "b1" });
    const u = new URL(captured.url!);
    expect(captured.method).toBe("GET");
    expect(u.pathname).toBe("/1/boards/b1/lists");
    expect(u.searchParams.get("fields")).toBe("id,name,closed");
    expect(u.searchParams.get("token")).toBe("tok");
  });

  it("URL-encodes the board id in the path", async () => {
    const captured = captureFetch([]);
    await listsList({ accessToken: "tok", boardId: "b/1" });
    expect(new URL(captured.url!).pathname).toBe("/1/boards/b%2F1/lists");
  });

  it("returns the lists array", async () => {
    captureFetch([
      { id: "l1", name: "To Do", idBoard: "b1", closed: false },
      { id: "l2", name: "Done", idBoard: "b1", closed: false },
    ]);
    const lists = await listsList({ accessToken: "tok", boardId: "b1" });
    expect(lists.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("propagates HTTP 401 as Unauthorized401Error", async () => {
    captureFetch("nope", 401);
    await expect(
      listsList({ accessToken: "tok", boardId: "b1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("propagates HTTP 404 as TrelloNotFoundError(board <id> lists)", async () => {
    captureFetch("not found", 404);
    let captured: unknown;
    try {
      await listsList({ accessToken: "tok", boardId: "bGONE" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(TrelloNotFoundError);
    expect((captured as TrelloNotFoundError).resource).toBe("board bGONE lists");
  });
});
