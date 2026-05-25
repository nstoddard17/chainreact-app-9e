/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/api/labelsList.ts` — Slice
 * 4.TRELLO-META-2. New list-labels helper
 * (GET /1/boards/{boardId}/labels). Requests Trello's max page. Backs
 * the `trello:labels` resolver.
 */
import {
  labelsList,
  TRELLO_LABELS_MAX,
} from "@/integrations/trello/api/labelsList";
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

describe("labelsList", () => {
  it("GETs /1/boards/{boardId}/labels with fields=id,name,color + max limit", async () => {
    const captured = captureFetch([{ id: "lab1", name: "Bug", color: "red" }]);
    await labelsList({ accessToken: "tok", boardId: "b1" });
    const u = new URL(captured.url!);
    expect(captured.method).toBe("GET");
    expect(u.pathname).toBe("/1/boards/b1/labels");
    expect(u.searchParams.get("fields")).toBe("id,name,color");
    expect(u.searchParams.get("limit")).toBe(String(TRELLO_LABELS_MAX));
  });

  it("returns the labels array", async () => {
    captureFetch([
      { id: "lab1", name: "Bug", color: "red" },
      { id: "lab2", name: "", color: "green" },
    ]);
    const labels = await labelsList({ accessToken: "tok", boardId: "b1" });
    expect(labels.map((l) => l.id)).toEqual(["lab1", "lab2"]);
  });

  it("propagates HTTP 401 as Unauthorized401Error", async () => {
    captureFetch("nope", 401);
    await expect(
      labelsList({ accessToken: "tok", boardId: "b1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("propagates HTTP 404 as TrelloNotFoundError(board <id> labels)", async () => {
    captureFetch("not found", 404);
    let captured: unknown;
    try {
      await labelsList({ accessToken: "tok", boardId: "bGONE" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(TrelloNotFoundError);
    expect((captured as TrelloNotFoundError).resource).toBe(
      "board bGONE labels",
    );
  });
});
