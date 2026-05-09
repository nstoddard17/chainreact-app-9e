/**
 * @jest-environment node
 */
import { blocksAppendChildren } from "@/integrations/notion/api/blocks";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(body: unknown, status = 200): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

describe("blocksAppendChildren", () => {
  it("PATCHes /v1/blocks/{id}/children with the children array", async () => {
    const spy = mockFetchOnce({
      object: "list",
      results: [{ object: "block", id: "b-1", type: "paragraph" }],
    });
    await blocksAppendChildren({
      accessToken: "tok",
      blockId: "page-1",
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: "hi" } }],
          },
        },
      ],
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/blocks/page-1/children",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("PATCH");
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].type).toBe("paragraph");
  });

  it("URL-encodes the blockId", async () => {
    const spy = mockFetchOnce({ object: "list", results: [] });
    await blocksAppendChildren({
      accessToken: "t",
      blockId: "p with space",
      children: [{ object: "block", type: "divider", divider: {} }],
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.notion.com/v1/blocks/p%20with%20space/children",
    );
  });

  it("returns the list of newly-created block ids", async () => {
    mockFetchOnce({
      object: "list",
      results: [
        { object: "block", id: "b-1" },
        { object: "block", id: "b-2" },
      ],
    });
    const result = await blocksAppendChildren({
      accessToken: "t",
      blockId: "p",
      children: [
        { object: "block", type: "divider", divider: {} },
        { object: "block", type: "divider", divider: {} },
      ],
    });
    expect(result.results.map((r) => r.id)).toEqual(["b-1", "b-2"]);
  });
});
