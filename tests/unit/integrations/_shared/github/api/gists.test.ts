/**
 * @jest-environment node
 *
 * Tests for `_shared/github/api/gists.ts` — gistsCreate body shape.
 */
import { gistsCreate } from "@/integrations/_shared/github/api/gists";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(json: unknown, status = 201) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify(json), { status }),
    );
}

describe("gistsCreate", () => {
  it("POSTs /gists with files map keyed by filename", async () => {
    const spy = mockFetchOnce({
      id: "abc123",
      public: false,
      html_url: "https://gist.github.com/octocat/abc123",
      files: { "snippet.ts": { filename: "snippet.ts", content: "x" } },
    });
    await gistsCreate({
      accessToken: "tok",
      filename: "snippet.ts",
      content: "console.log('hi')",
      public: false,
    });
    expect(spy.mock.calls[0]![0]).toBe("https://api.github.com/gists");
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      public: false,
      files: { "snippet.ts": { content: "console.log('hi')" } },
    });
  });

  it("includes description when supplied", async () => {
    const spy = mockFetchOnce({
      id: "abc",
      public: true,
      html_url: "x",
      files: { "x.ts": {} },
    });
    await gistsCreate({
      accessToken: "tok",
      filename: "x.ts",
      content: "a",
      description: "A test gist",
      public: true,
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.description).toBe("A test gist");
    expect(body.public).toBe(true);
  });

  it("OMITS description when undefined", async () => {
    const spy = mockFetchOnce({
      id: "abc",
      public: false,
      html_url: "x",
      files: { "x.ts": {} },
    });
    await gistsCreate({
      accessToken: "tok",
      filename: "x.ts",
      content: "a",
      public: false,
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.description).toBeUndefined();
  });

  it("respects the public flag (true sends public: true; false sends public: false)", async () => {
    // V2 schema requires explicit choice — Q11 consent gate. Test
    // that the boolean flows through unchanged (no inversion bug).
    const spy = mockFetchOnce({
      id: "abc",
      public: true,
      html_url: "x",
      files: { "x.ts": {} },
    });
    await gistsCreate({
      accessToken: "tok",
      filename: "x.ts",
      content: "a",
      public: true,
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).public).toBe(true);
  });
});
