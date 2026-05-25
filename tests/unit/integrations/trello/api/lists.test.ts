/**
 * @jest-environment node
 */
import { listsCreate } from "@/integrations/trello/api/lists";

const ORIGINAL_FETCH = global.fetch;

interface CapturedRequest {
  url?: string;
  method?: string;
  body?: string;
}

function captureFetch(responseBody: unknown): CapturedRequest {
  const captured: CapturedRequest = {};
  global.fetch = jest.fn(async (input: unknown, init?: Parameters<typeof fetch>[1]) => {
    captured.url =
      typeof input === "string"
        ? input
        : (input as { toString: () => string }).toString();
    captured.method = init?.method;
    if (typeof init?.body === "string") captured.body = init.body;
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return captured;
}

beforeEach(() => {
  process.env.TRELLO_CLIENT_ID = "test-key";
});

afterEach(() => {
  delete process.env.TRELLO_CLIENT_ID;
  global.fetch = ORIGINAL_FETCH;
});

describe("listsCreate", () => {
  it("POSTs /1/lists with idBoard + name", async () => {
    const captured = captureFetch({ id: "l1", name: "Backlog", idBoard: "b1" });
    const list = await listsCreate({
      accessToken: "t",
      idBoard: "b1",
      name: "Backlog",
    });
    expect(captured.method).toBe("POST");
    expect(new URL(captured.url!).pathname).toBe("/1/lists");
    expect(JSON.parse(captured.body!)).toEqual({ idBoard: "b1", name: "Backlog" });
    expect(list.id).toBe("l1");
  });

  it("forwards pos when provided", async () => {
    const captured = captureFetch({ id: "l1", name: "x", idBoard: "b1" });
    await listsCreate({
      accessToken: "t",
      idBoard: "b1",
      name: "x",
      pos: "top",
    });
    const body = JSON.parse(captured.body!);
    expect(body.pos).toBe("top");
  });

  it("omits pos when not provided (Trello server-side default applies)", async () => {
    const captured = captureFetch({ id: "l1", name: "x", idBoard: "b1" });
    await listsCreate({
      accessToken: "t",
      idBoard: "b1",
      name: "x",
    });
    const body = JSON.parse(captured.body!);
    expect(body).toEqual({ idBoard: "b1", name: "x" });
  });
});
