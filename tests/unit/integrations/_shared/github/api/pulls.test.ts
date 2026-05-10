/**
 * @jest-environment node
 *
 * Tests for `_shared/github/api/pulls.ts` — pullsCreate body shape
 * and URL routing.
 */
import { pullsCreate } from "@/integrations/_shared/github/api/pulls";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(json: unknown, status = 200) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify(json), { status }),
    );
}

describe("pullsCreate", () => {
  it("POSTs /repos/{owner}/{repo}/pulls with required title + head + base", async () => {
    const spy = mockFetchOnce(
      {
        id: 1,
        number: 5,
        title: "Add feature",
        state: "open",
        html_url: "x",
        head: { ref: "feature/x", sha: "h1" },
        base: { ref: "main", sha: "b1" },
      },
      201,
    );
    await pullsCreate({
      accessToken: "tok",
      owner: "octocat",
      repo: "hello",
      title: "Add feature",
      head: "feature/x",
      base: "main",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/octocat/hello/pulls",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      title: "Add feature",
      head: "feature/x",
      base: "main",
    });
  });

  it("includes body and draft when supplied", async () => {
    const spy = mockFetchOnce(
      {
        id: 1,
        number: 1,
        title: "x",
        state: "open",
        html_url: "x",
        head: { ref: "h", sha: "h" },
        base: { ref: "b", sha: "b" },
        draft: true,
      },
      201,
    );
    await pullsCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      title: "x",
      head: "h",
      base: "b",
      body: "PR description",
      draft: true,
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      title: "x",
      head: "h",
      base: "b",
      body: "PR description",
      draft: true,
    });
  });

  it("OMITS body and draft when undefined", async () => {
    const spy = mockFetchOnce(
      {
        id: 1,
        number: 1,
        title: "x",
        state: "open",
        html_url: "x",
        head: { ref: "h", sha: "h" },
        base: { ref: "b", sha: "b" },
      },
      201,
    );
    await pullsCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      title: "x",
      head: "h",
      base: "b",
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.body).toBeUndefined();
    expect(body.draft).toBeUndefined();
  });

  it("supports cross-repo head notation (forkOwner:branch)", async () => {
    const spy = mockFetchOnce(
      {
        id: 1,
        number: 1,
        title: "x",
        state: "open",
        html_url: "x",
        head: { ref: "fork:branch", sha: "h" },
        base: { ref: "b", sha: "b" },
      },
      201,
    );
    await pullsCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      title: "x",
      head: "fork-owner:feature",
      base: "main",
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).head).toBe(
      "fork-owner:feature",
    );
  });
});
