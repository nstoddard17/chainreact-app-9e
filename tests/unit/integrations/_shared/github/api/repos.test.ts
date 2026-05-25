/**
 * @jest-environment node
 *
 * Tests for `_shared/github/api/repos.ts` — the four repos-area
 * wrappers used by Slice 14b actions:
 *   - reposGet (PR-G6 default-branch lookup)
 *   - userReposCreate (`create_repository`)
 *   - gitRefGet (`create_branch` source SHA lookup)
 *   - gitRefsCreate (`create_branch` ref creation)
 */
import {
  gitRefGet,
  gitRefsCreate,
  reposGet,
  userReposCreate,
} from "@/integrations/_shared/github/api/repos";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GITHUB_API_BASE;
});

function mockFetchOnce(json: unknown, status = 200) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify(json), { status }),
    );
}

describe("reposGet", () => {
  it("GETs /repos/{owner}/{repo}", async () => {
    const spy = mockFetchOnce({
      id: 1,
      name: "hello",
      full_name: "octocat/hello",
      private: false,
      html_url: "https://github.com/octocat/hello",
      default_branch: "main",
    });
    const result = await reposGet({
      accessToken: "tok",
      owner: "octocat",
      repo: "hello",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/octocat/hello",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("GET");
    expect(result.default_branch).toBe("main");
    expect(result.full_name).toBe("octocat/hello");
  });

  it("URL-encodes owner and repo (defensive against unusual chars)", async () => {
    const spy = mockFetchOnce({
      id: 1,
      name: "x",
      full_name: "user/repo with space",
      private: false,
      html_url: "x",
      default_branch: "main",
    });
    await reposGet({ accessToken: "tok", owner: "user", repo: "repo with space" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/user/repo%20with%20space",
    );
  });
});

describe("userReposCreate", () => {
  it("POSTs /user/repos with required name only when optional fields omitted", async () => {
    const spy = mockFetchOnce(
      {
        id: 1,
        name: "x",
        full_name: "u/x",
        private: false,
        html_url: "x",
        default_branch: "main",
      },
      201,
    );
    await userReposCreate({ accessToken: "tok", name: "my-repo" });
    expect(spy.mock.calls[0]![0]).toBe("https://api.github.com/user/repos");
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      name: "my-repo",
    });
  });

  it("includes ALL supplied optional fields in the body", async () => {
    const spy = mockFetchOnce(
      {
        id: 1,
        name: "x",
        full_name: "u/x",
        private: true,
        html_url: "x",
        default_branch: "main",
      },
      201,
    );
    await userReposCreate({
      accessToken: "tok",
      name: "my-repo",
      description: "desc",
      private: true,
      auto_init: true,
      gitignore_template: "Node",
      license_template: "mit",
      homepage: "https://example.com",
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      name: "my-repo",
      description: "desc",
      private: true,
      auto_init: true,
      gitignore_template: "Node",
      license_template: "mit",
      homepage: "https://example.com",
    });
  });

  it("OMITS undefined optional fields (V2 fix — V1 silently sent defaults)", async () => {
    // V1 always sent `private: true` + `auto_init: true` because of
    // its destructuring defaults. V2 only sends what the workflow
    // author explicitly chose, letting GitHub's own defaults
    // (private=false, auto_init=false) apply when omitted.
    const spy = mockFetchOnce(
      {
        id: 1,
        name: "x",
        full_name: "u/x",
        private: false,
        html_url: "x",
        default_branch: "main",
      },
      201,
    );
    await userReposCreate({
      accessToken: "tok",
      name: "my-repo",
      description: "desc",
      // private / auto_init / gitignore_template / license_template
      // / homepage all omitted.
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ name: "my-repo", description: "desc" });
    expect(body.private).toBeUndefined();
    expect(body.auto_init).toBeUndefined();
  });
});

describe("gitRefGet", () => {
  it("GETs /repos/{owner}/{repo}/git/ref/heads/{branch}", async () => {
    const spy = mockFetchOnce({
      ref: "refs/heads/main",
      url: "https://api.github.com/repos/octocat/hello/git/refs/heads/main",
      object: { sha: "abc123def", type: "commit" },
    });
    const result = await gitRefGet({
      accessToken: "tok",
      owner: "octocat",
      repo: "hello",
      branch: "main",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/octocat/hello/git/ref/heads/main",
    );
    expect(result.object.sha).toBe("abc123def");
  });

  it("URL-encodes the branch name (handles slashes in feature/* branches)", async () => {
    const spy = mockFetchOnce({
      ref: "refs/heads/feature/abc",
      url: "x",
      object: { sha: "x" },
    });
    await gitRefGet({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      branch: "feature/abc",
    });
    // `feature/abc` URL-encodes to `feature%2Fabc`.
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/u/r/git/ref/heads/feature%2Fabc",
    );
  });
});

describe("gitRefsCreate", () => {
  it("POSTs /repos/{owner}/{repo}/git/refs with refs/heads/<branch> + sha", async () => {
    const spy = mockFetchOnce(
      {
        ref: "refs/heads/feature/x",
        url: "x",
        object: { sha: "newsha" },
      },
      201,
    );
    await gitRefsCreate({
      accessToken: "tok",
      owner: "octocat",
      repo: "hello",
      branchName: "feature/x",
      sha: "abc123",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/octocat/hello/git/refs",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      ref: "refs/heads/feature/x",
      sha: "abc123",
    });
  });

  it("does NOT URL-encode the branchName in the body (only in the URL)", async () => {
    // The body's `ref` field carries the literal branch name — only
    // the URL gets percent-encoding. GitHub rejects encoded refs in
    // the body.
    const spy = mockFetchOnce(
      { ref: "refs/heads/feature/x", url: "x", object: { sha: "newsha" } },
      201,
    );
    await gitRefsCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      branchName: "feature/x",
      sha: "abc",
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.ref).toBe("refs/heads/feature/x");
    expect(body.ref).not.toContain("%2F");
  });
});
