/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/api/membersList.ts` — Slice
 * 4.TRELLO-META-2. New list-members helper
 * (GET /1/boards/{boardId}/members). Backs the `trello:members`
 * resolver. Asserts NO email field is requested.
 */
import { membersList } from "@/integrations/trello/api/membersList";
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

describe("membersList", () => {
  it("GETs /1/boards/{boardId}/members with fields=id,fullName,username", async () => {
    const captured = captureFetch([
      { id: "m1", fullName: "Ada Lovelace", username: "ada" },
    ]);
    await membersList({ accessToken: "tok", boardId: "b1" });
    const u = new URL(captured.url!);
    expect(captured.method).toBe("GET");
    expect(u.pathname).toBe("/1/boards/b1/members");
    expect(u.searchParams.get("fields")).toBe("id,fullName,username");
  });

  it("does NOT request the email field (privacy)", async () => {
    const captured = captureFetch([]);
    await membersList({ accessToken: "tok", boardId: "b1" });
    const fields = new URL(captured.url!).searchParams.get("fields") ?? "";
    expect(fields).not.toContain("email");
  });

  it("returns the members array", async () => {
    captureFetch([
      { id: "m1", fullName: "Ada", username: "ada" },
      { id: "m2", fullName: "Grace", username: "grace" },
    ]);
    const members = await membersList({ accessToken: "tok", boardId: "b1" });
    expect(members.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("propagates HTTP 401 as Unauthorized401Error", async () => {
    captureFetch("nope", 401);
    await expect(
      membersList({ accessToken: "tok", boardId: "b1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("propagates HTTP 404 as TrelloNotFoundError(board <id> members)", async () => {
    captureFetch("not found", 404);
    let captured: unknown;
    try {
      await membersList({ accessToken: "tok", boardId: "bGONE" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(TrelloNotFoundError);
    expect((captured as TrelloNotFoundError).resource).toBe(
      "board bGONE members",
    );
  });
});
