/**
 * @jest-environment node
 */
import {
  pagesCreate,
  pagesRetrieve,
  pagesUpdate,
} from "@/integrations/notion/api/pages";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(body: unknown, status = 200): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status }),
    );
}

describe("pagesCreate", () => {
  it("POSTs /v1/pages with parent + properties + optional children/icon/cover", async () => {
    const spy = mockFetchOnce({ object: "page", id: "p-1", url: "https://x" });
    await pagesCreate({
      accessToken: "tok",
      parent: { database_id: "db-1" },
      properties: { Name: { title: [{ type: "text", text: { content: "Q" } }] } },
      children: [{ object: "block", type: "divider", divider: {} }],
      icon: { type: "emoji", emoji: "📄" },
    });
    expect(spy.mock.calls[0]![0]).toBe("https://api.notion.com/v1/pages");
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.parent).toEqual({ database_id: "db-1" });
    expect(body.properties.Name.title[0].text.content).toBe("Q");
    expect(body.children).toHaveLength(1);
    expect(body.icon).toEqual({ type: "emoji", emoji: "📄" });
  });

  it("omits children when empty / undefined", async () => {
    const spy = mockFetchOnce({ object: "page", id: "p-1" });
    await pagesCreate({
      accessToken: "tok",
      parent: { page_id: "parent-page" },
      properties: { title: { title: [{ type: "text", text: { content: "T" } }] } },
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.children).toBeUndefined();
    expect(body.icon).toBeUndefined();
    expect(body.cover).toBeUndefined();
  });

  it("returns the parsed Notion page response", async () => {
    mockFetchOnce({
      object: "page",
      id: "p-2",
      url: "https://www.notion.so/p-2",
      created_time: "2026-05-09T10:00:00Z",
    });
    const result = await pagesCreate({
      accessToken: "tok",
      parent: { database_id: "db" },
      properties: {},
    });
    expect(result.id).toBe("p-2");
    expect(result.url).toBe("https://www.notion.so/p-2");
  });
});

describe("pagesRetrieve", () => {
  it("GETs /v1/pages/{id}", async () => {
    const spy = mockFetchOnce({ object: "page", id: "p-1" });
    await pagesRetrieve({ accessToken: "tok", pageId: "p-1" });
    expect(spy.mock.calls[0]![0]).toBe("https://api.notion.com/v1/pages/p-1");
    expect(spy.mock.calls[0]![1]!.method).toBe("GET");
  });

  it("URL-encodes the pageId", async () => {
    const spy = mockFetchOnce({ object: "page", id: "p/1" });
    await pagesRetrieve({ accessToken: "t", pageId: "p/with space" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/pages/p%2Fwith%20space",
    );
  });
});

describe("pagesUpdate", () => {
  it("PATCHes /v1/pages/{id} with only the fields the caller set (Q11)", async () => {
    const spy = mockFetchOnce({ object: "page", id: "p-1", archived: true });
    await pagesUpdate({
      accessToken: "tok",
      pageId: "p-1",
      archived: true,
    });
    expect(spy.mock.calls[0]![1]!.method).toBe("PATCH");
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ archived: true });
    expect(body.properties).toBeUndefined();
    expect(body.icon).toBeUndefined();
    expect(body.cover).toBeUndefined();
  });

  it("sends properties when supplied", async () => {
    const spy = mockFetchOnce({ object: "page", id: "p-1" });
    await pagesUpdate({
      accessToken: "tok",
      pageId: "p-1",
      properties: { Done: { checkbox: true } },
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.properties).toEqual({ Done: { checkbox: true } });
  });

  it("supports null icon (clears it) vs undefined icon (unchanged)", async () => {
    const spy = mockFetchOnce({ object: "page", id: "p-1" });
    await pagesUpdate({
      accessToken: "tok",
      pageId: "p-1",
      icon: null,
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.icon).toBeNull();
  });
});
