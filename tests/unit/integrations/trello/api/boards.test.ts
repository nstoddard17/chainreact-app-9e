/**
 * @jest-environment node
 */
import {
  boardsCreate,
  visibilityToTrelloPref,
} from "@/integrations/trello/api/boards";

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

describe("visibilityToTrelloPref", () => {
  it("maps workspace → org (Trello's wire-format value)", () => {
    expect(visibilityToTrelloPref("workspace")).toBe("org");
  });

  it("passes private and public through unchanged", () => {
    expect(visibilityToTrelloPref("private")).toBe("private");
    expect(visibilityToTrelloPref("public")).toBe("public");
  });
});

describe("boardsCreate", () => {
  it("POSTs /1/boards with name + visibility (mapped) + defaultLists=false", async () => {
    const captured = captureFetch({ id: "b1", name: "Sprint" });
    const board = await boardsCreate({
      accessToken: "t",
      name: "Sprint",
      visibility: "workspace",
    });
    expect(captured.method).toBe("POST");
    expect(new URL(captured.url!).pathname).toBe("/1/boards");
    const body = JSON.parse(captured.body!);
    expect(body).toEqual({
      name: "Sprint",
      defaultLists: false,
      prefs_permissionLevel: "org",
    });
    expect(board.id).toBe("b1");
  });

  it("forwards desc when provided", async () => {
    const captured = captureFetch({ id: "b1", name: "x" });
    await boardsCreate({
      accessToken: "t",
      name: "x",
      visibility: "private",
      desc: "team backlog",
    });
    const body = JSON.parse(captured.body!);
    expect(body.desc).toBe("team backlog");
    expect(body.prefs_permissionLevel).toBe("private");
  });

  it("allows opting into defaultLists when requested", async () => {
    const captured = captureFetch({ id: "b1", name: "x" });
    await boardsCreate({
      accessToken: "t",
      name: "x",
      visibility: "private",
      defaultLists: true,
    });
    const body = JSON.parse(captured.body!);
    expect(body.defaultLists).toBe(true);
  });
});
