/**
 * @jest-environment node
 *
 * Tests for `githubRequest` — the shared GitHub REST HTTP wrapper.
 * Mocks `fetch` so we don't hit GitHub. Verifies:
 *   - Static API base (default) + env override (GITHUB_API_BASE).
 *   - `Authorization: token <token>` (NOT `Bearer`) — V1 lifecycle
 *     used Bearer, V2 standardizes to `token`.
 *   - `Accept: application/vnd.github+json` + `X-GitHub-Api-Version`
 *     headers present on every request.
 *   - `Content-Type: application/json` for POST / PATCH / PUT bodies;
 *     absent on GET / DELETE.
 *   - Query-string append on GET / DELETE.
 *   - 401 → `Unauthorized401Error`.
 *   - 404 → `NotFoundError`.
 *   - 422 → `ValidationError` (V2 distinct class for GitHub's
 *     "Validation Failed" status).
 *   - 204 → returns `{}` (caller-friendly no-content shape).
 *   - Other non-2xx → generic Error with `surfaceGitHubError` message.
 */
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { githubRequest } from "@/integrations/_shared/github/api/_request";
import {
  NotFoundError,
  ValidationError,
} from "@/integrations/_shared/github/errors";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GITHUB_API_BASE;
});

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const spy = jest.spyOn(globalThis, "fetch");
  const status = response.status ?? (response.ok ? 200 : 500);
  // 204 / 205 forbid a body per the Fetch spec; pass null.
  const body =
    status === 204 || status === 205
      ? null
      : response.text !== undefined
        ? response.text
        : JSON.stringify(response.json ?? {});
  spy.mockResolvedValueOnce(new Response(body, { status }));
  return spy;
}

// ─── URL routing ────────────────────────────────────────────────────────────

describe("githubRequest — URL routing", () => {
  it("defaults to https://api.github.com when GITHUB_API_BASE is unset", async () => {
    const spy = mockFetchOnce({ ok: true, json: { login: "octocat" } });
    await githubRequest({
      accessToken: "tok",
      method: "GET",
      path: "/user",
      resourceForNotFound: "user",
    });
    expect(spy.mock.calls[0]![0]).toBe("https://api.github.com/user");
  });

  it("uses GITHUB_API_BASE override when set (e2e mock surface)", async () => {
    process.env.GITHUB_API_BASE = "http://localhost:9884";
    const spy = mockFetchOnce({ ok: true, json: {} });
    await githubRequest({
      accessToken: "tok",
      method: "GET",
      path: "/repos/octocat/hello",
      resourceForNotFound: "repository octocat/hello",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://localhost:9884/repos/octocat/hello",
    );
  });

  it("appends query-string params when supplied", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await githubRequest({
      accessToken: "tok",
      method: "GET",
      path: "/search/issues",
      query: new URLSearchParams({ q: "label:bug", per_page: "5" }),
      resourceForNotFound: "search results",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/search/issues?q=label%3Abug&per_page=5",
    );
  });
});

// ─── Headers ────────────────────────────────────────────────────────────────

describe("githubRequest — headers", () => {
  it("sends Authorization: token <token> (NOT Bearer — V2 standardization)", async () => {
    // V1 lifecycle uses `Bearer ${token}` (inconsistent with V1
    // actions which use `token ${token}`). V2 standardizes to
    // `token` everywhere — GitHub's idiomatic header for OAuth App
    // tokens.
    const spy = mockFetchOnce({ ok: true, json: {} });
    await githubRequest({
      accessToken: "gho_test_xyz",
      method: "GET",
      path: "/user",
      resourceForNotFound: "user",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("token gho_test_xyz");
    expect(headers.Authorization).not.toMatch(/^Bearer /);
  });

  it("sends Accept: application/vnd.github+json on every request", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await githubRequest({
      accessToken: "tok",
      method: "GET",
      path: "/user",
      resourceForNotFound: "user",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.github+json");
  });

  it("sends X-GitHub-Api-Version: 2022-11-28 on every request", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await githubRequest({
      accessToken: "tok",
      method: "GET",
      path: "/user",
      resourceForNotFound: "user",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("sends Content-Type: application/json when body is supplied", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await githubRequest({
      accessToken: "tok",
      method: "POST",
      path: "/user/repos",
      body: { name: "x" },
      resourceForNotFound: "repository (create)",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("does NOT send Content-Type when body is undefined (GET / DELETE)", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await githubRequest({
      accessToken: "tok",
      method: "GET",
      path: "/user",
      resourceForNotFound: "user",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });
});

// ─── Body handling ──────────────────────────────────────────────────────────

describe("githubRequest — body handling", () => {
  it("JSON-stringifies the body verbatim", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await githubRequest({
      accessToken: "tok",
      method: "POST",
      path: "/user/repos",
      body: { name: "x", private: true, description: "hello" },
      resourceForNotFound: "repository (create)",
    });
    expect(spy.mock.calls[0]![1]!.body).toBe(
      JSON.stringify({ name: "x", private: true, description: "hello" }),
    );
  });

  it("does NOT include body when undefined (GET method)", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await githubRequest({
      accessToken: "tok",
      method: "GET",
      path: "/user",
      resourceForNotFound: "user",
    });
    expect(spy.mock.calls[0]![1]!.body).toBeUndefined();
  });
});

// ─── Error mapping ──────────────────────────────────────────────────────────

describe("githubRequest — error mapping", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { message: "Bad credentials" },
    });
    await expect(
      githubRequest({
        accessToken: "tok",
        method: "GET",
        path: "/user",
        resourceForNotFound: "user",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 with surfaced message", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: {
        message: "Not Found",
        documentation_url: "https://docs.github.com/...",
      },
    });
    await expect(
      githubRequest({
        accessToken: "tok",
        method: "GET",
        path: "/repos/missing/repo",
        resourceForNotFound: "repository missing/repo",
      }),
    ).rejects.toThrow(/repository missing\/repo not found: Not Found/);
  });

  it("404 produces NotFoundError instance (not generic Error)", async () => {
    mockFetchOnce({ ok: false, status: 404, json: { message: "x" } });
    await expect(
      githubRequest({
        accessToken: "tok",
        method: "GET",
        path: "/repos/x/y",
        resourceForNotFound: "repository x/y",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ValidationError on HTTP 422 with surfaced message", async () => {
    // GitHub's "Validation Failed" — branch already exists, missing
    // required field, etc.
    mockFetchOnce({
      ok: false,
      status: 422,
      json: {
        message: "Validation Failed",
        errors: [{ resource: "Issue", code: "missing_field", field: "title" }],
      },
    });
    await expect(
      githubRequest({
        accessToken: "tok",
        method: "POST",
        path: "/repos/x/y/issues",
        body: {},
        resourceForNotFound: "issue (create) on x/y",
      }),
    ).rejects.toThrow(
      /issue \(create\) on x\/y validation failed: Validation Failed: missing_field on title/,
    );
  });

  it("422 produces ValidationError instance (not generic Error)", async () => {
    mockFetchOnce({ ok: false, status: 422, json: { message: "x" } });
    await expect(
      githubRequest({
        accessToken: "tok",
        method: "POST",
        path: "/repos/x/y/git/refs",
        body: {},
        resourceForNotFound: "branch x (create)",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns {} for HTTP 204 (no-content response)", async () => {
    mockFetchOnce({ ok: true, status: 204, text: "" });
    const result = await githubRequest({
      accessToken: "tok",
      method: "DELETE",
      path: "/repos/x/y/issues/comments/1",
      resourceForNotFound: "comment 1",
    });
    expect(result).toEqual({});
  });

  it("throws generic Error on other non-2xx with surfaced message", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: { message: "Server Error" },
    });
    await expect(
      githubRequest({
        accessToken: "tok",
        method: "GET",
        path: "/user",
        resourceForNotFound: "user",
      }),
    ).rejects.toThrow(/GitHub GET \/user failed: Server Error/);
  });

  it("falls back to HTTP <status> when error body is unparseable", async () => {
    mockFetchOnce({ ok: false, status: 502, text: "Bad Gateway" });
    await expect(
      githubRequest({
        accessToken: "tok",
        method: "GET",
        path: "/user",
        resourceForNotFound: "user",
      }),
    ).rejects.toThrow(/GitHub GET \/user failed: HTTP 502/);
  });
});

// ─── Success — JSON parsing ─────────────────────────────────────────────────

describe("githubRequest — success", () => {
  it("returns the parsed JSON body on 2xx", async () => {
    mockFetchOnce({
      ok: true,
      json: { id: 42, login: "octocat" },
    });
    const result = await githubRequest<{ id: number; login: string }>({
      accessToken: "tok",
      method: "GET",
      path: "/user",
      resourceForNotFound: "user",
    });
    expect(result).toEqual({ id: 42, login: "octocat" });
  });

  it("returns the parsed JSON body on 201 created", async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: { id: 7, name: "new-repo" },
    });
    const result = await githubRequest<{ id: number; name: string }>({
      accessToken: "tok",
      method: "POST",
      path: "/user/repos",
      body: { name: "new-repo" },
      resourceForNotFound: "repository (create)",
    });
    expect(result).toEqual({ id: 7, name: "new-repo" });
  });
});
