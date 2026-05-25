/**
 * @jest-environment node
 *
 * Tests for `_shared/github/api/issues.ts` — issuesCreate +
 * issueCommentsCreate body shape and URL routing.
 */
import {
  issueCommentsCreate,
  issuesCreate,
} from "@/integrations/_shared/github/api/issues";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(json: unknown, status = 200) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify(json), { status }),
    );
}

describe("issuesCreate", () => {
  it("POSTs /repos/{owner}/{repo}/issues with required title only", async () => {
    const spy = mockFetchOnce(
      {
        id: 1,
        number: 42,
        title: "Bug",
        state: "open",
        html_url: "x",
      },
      201,
    );
    await issuesCreate({
      accessToken: "tok",
      owner: "octocat",
      repo: "hello",
      title: "Bug",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/octocat/hello/issues",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      title: "Bug",
    });
  });

  it("includes body / labels / assignees / milestone when supplied", async () => {
    const spy = mockFetchOnce(
      { id: 1, number: 1, title: "x", state: "open", html_url: "x" },
      201,
    );
    await issuesCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      title: "Bug",
      body: "Description here",
      labels: ["bug", "p1"],
      assignees: ["alice", "bob"],
      milestone: 7,
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      title: "Bug",
      body: "Description here",
      labels: ["bug", "p1"],
      assignees: ["alice", "bob"],
      milestone: 7,
    });
  });

  it("OMITS labels and assignees when empty arrays (avoids sending spurious empty arrays)", async () => {
    // Some GitHub endpoints care about empty arrays vs missing
    // fields. We treat empty as "user didn't set it" and omit.
    const spy = mockFetchOnce(
      { id: 1, number: 1, title: "x", state: "open", html_url: "x" },
      201,
    );
    await issuesCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      title: "Bug",
      labels: [],
      assignees: [],
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ title: "Bug" });
    expect(body.labels).toBeUndefined();
    expect(body.assignees).toBeUndefined();
  });

  it("OMITS body when undefined (vs sending body: '')", async () => {
    const spy = mockFetchOnce(
      { id: 1, number: 1, title: "x", state: "open", html_url: "x" },
      201,
    );
    await issuesCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      title: "Bug",
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.body).toBeUndefined();
  });
});

describe("issueCommentsCreate", () => {
  it("POSTs /repos/{owner}/{repo}/issues/{number}/comments", async () => {
    const spy = mockFetchOnce(
      {
        id: 99,
        body: "Thanks for filing.",
        html_url: "x",
      },
      201,
    );
    await issueCommentsCreate({
      accessToken: "tok",
      owner: "octocat",
      repo: "hello",
      issueNumber: 42,
      body: "Thanks for filing.",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/octocat/hello/issues/42/comments",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      body: "Thanks for filing.",
    });
  });
});
