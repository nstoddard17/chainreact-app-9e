/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/api/cards.ts` — the per-resource Trello
 * card wrappers (Slice 17 Commit 4).
 *
 * Pattern: capture the wire request, return a stub response, assert
 * URL + method + body shape.
 */
import {
  cardsCreate,
  cardsUpdate,
  cardsAddComment,
  cardsAddLabel,
  cardsListComments,
} from "@/integrations/trello/api/cards";

const ORIGINAL_FETCH = global.fetch;

interface CapturedRequest {
  url?: string;
  method?: string;
  body?: string;
}

function captureFetch(responseBody: unknown, status = 200): CapturedRequest {
  const captured: CapturedRequest = {};
  global.fetch = jest.fn(async (input: unknown, init?: Parameters<typeof fetch>[1]) => {
    captured.url =
      typeof input === "string"
        ? input
        : (input as { toString: () => string }).toString();
    captured.method = init?.method;
    if (typeof init?.body === "string") captured.body = init.body;
    return new Response(JSON.stringify(responseBody), {
      status,
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

describe("cardsCreate", () => {
  it("POSTs /1/cards with required fields only", async () => {
    const captured = captureFetch({ id: "c1", name: "Test", idList: "l1" });
    const card = await cardsCreate({
      accessToken: "t",
      idList: "l1",
      name: "Test",
    });
    expect(captured.method).toBe("POST");
    expect(new URL(captured.url!).pathname).toBe("/1/cards");
    const body = JSON.parse(captured.body!);
    expect(body).toEqual({ idList: "l1", name: "Test" });
    expect(card.id).toBe("c1");
  });

  it("forwards optional fields when provided", async () => {
    const captured = captureFetch({ id: "c1", name: "x", idList: "l1" });
    await cardsCreate({
      accessToken: "t",
      idList: "l1",
      name: "x",
      desc: "hello",
      pos: "top",
      due: "2026-06-01T00:00:00Z",
      dueComplete: false,
      start: "2026-05-01T00:00:00Z",
      idMembers: ["m1", "m2"],
      idLabels: ["lab1"],
    });
    const body = JSON.parse(captured.body!);
    expect(body.desc).toBe("hello");
    expect(body.pos).toBe("top");
    expect(body.due).toBe("2026-06-01T00:00:00Z");
    expect(body.dueComplete).toBe(false);
    expect(body.start).toBe("2026-05-01T00:00:00Z");
    expect(body.idMembers).toBe("m1,m2");
    expect(body.idLabels).toBe("lab1");
  });

  it("omits idMembers/idLabels from body when empty arrays", async () => {
    const captured = captureFetch({ id: "c1", name: "x", idList: "l1" });
    await cardsCreate({
      accessToken: "t",
      idList: "l1",
      name: "x",
      idMembers: [],
      idLabels: [],
    });
    const body = JSON.parse(captured.body!);
    expect(body.idMembers).toBeUndefined();
    expect(body.idLabels).toBeUndefined();
  });
});

describe("cardsUpdate", () => {
  it("PUTs /1/cards/{id} with only the provided fields", async () => {
    const captured = captureFetch({ id: "c1", name: "renamed" });
    await cardsUpdate({
      accessToken: "t",
      cardId: "c1",
      name: "renamed",
      idList: "l2",
    });
    expect(captured.method).toBe("PUT");
    expect(new URL(captured.url!).pathname).toBe("/1/cards/c1");
    const body = JSON.parse(captured.body!);
    expect(body).toEqual({ name: "renamed", idList: "l2" });
  });

  it("URL-encodes the card id in the path", async () => {
    const captured = captureFetch({ id: "c/1" });
    await cardsUpdate({
      accessToken: "t",
      cardId: "c/1",
      name: "x",
    });
    expect(new URL(captured.url!).pathname).toBe("/1/cards/c%2F1");
  });

  it("forwards closed boolean for archive/unarchive", async () => {
    const captured = captureFetch({ id: "c1", closed: true });
    await cardsUpdate({
      accessToken: "t",
      cardId: "c1",
      closed: true,
    });
    const body = JSON.parse(captured.body!);
    expect(body).toEqual({ closed: true });
  });
});

describe("cardsAddComment", () => {
  it("POSTs /1/cards/{id}/actions/comments with text body", async () => {
    const captured = captureFetch({
      id: "action-1",
      type: "commentCard",
      date: "2026-05-11T00:00:00Z",
      data: { text: "hello" },
      memberCreator: { id: "m1", username: "u", fullName: "User" },
    });
    const result = await cardsAddComment({
      accessToken: "t",
      cardId: "c1",
      text: "hello",
    });
    expect(captured.method).toBe("POST");
    expect(new URL(captured.url!).pathname).toBe("/1/cards/c1/actions/comments");
    expect(JSON.parse(captured.body!)).toEqual({ text: "hello" });
    expect(result.id).toBe("action-1");
    expect(result.data?.text).toBe("hello");
  });
});

describe("cardsListComments", () => {
  it("GETs /1/cards/{id}/actions filtered to commentCard, bounded by limit", async () => {
    const captured = captureFetch([
      { id: "act-1", type: "commentCard", date: "2026-05-11T00:00:00Z", data: { text: "crsmoke-abc-comment" } },
    ]);
    const result = await cardsListComments({ accessToken: "t", cardId: "c1", limit: 5 });
    expect(captured.method).toBe("GET");
    const url = new URL(captured.url!);
    expect(url.pathname).toBe("/1/cards/c1/actions");
    expect(url.searchParams.get("filter")).toBe("commentCard");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(captured.body).toBeUndefined(); // GET has no body
    expect(result[0]?.data?.text).toBe("crsmoke-abc-comment");
  });
});

describe("cardsAddLabel", () => {
  it("POSTs /1/cards/{id}/idLabels with value query param", async () => {
    const captured = captureFetch(["lab1"]);
    const result = await cardsAddLabel({
      accessToken: "t",
      cardId: "c1",
      labelId: "lab1",
    });
    expect(captured.method).toBe("POST");
    const u = new URL(captured.url!);
    expect(u.pathname).toBe("/1/cards/c1/idLabels");
    expect(u.searchParams.get("value")).toBe("lab1");
    expect(result).toEqual(["lab1"]);
  });
});
