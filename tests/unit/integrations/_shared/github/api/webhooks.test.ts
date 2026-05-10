/**
 * @jest-environment node
 *
 * Tests for `_shared/github/api/webhooks.ts` — repoHooksCreate +
 * repoHooksDelete body shape and URL routing.
 */
import {
  repoHooksCreate,
  repoHooksDelete,
} from "@/integrations/_shared/github/api/webhooks";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(
  json: unknown,
  status = 200,
): jest.SpyInstance<Promise<Response>> {
  return jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      // 204 forbids a body per the Fetch spec.
      status === 204 ? null : JSON.stringify(json),
      { status },
    ),
  );
}

describe("repoHooksCreate", () => {
  it("POSTs /repos/{owner}/{repo}/hooks with the canonical body", async () => {
    const spy = mockFetchOnce(
      {
        id: 12345,
        type: "Repository",
        name: "web",
        active: true,
        events: ["push"],
        config: { url: "x", content_type: "json", insecure_ssl: "0" },
      },
      201,
    );
    await repoHooksCreate({
      accessToken: "tok",
      owner: "octocat",
      repo: "hello",
      url: "https://app.example.test/api/webhooks/github?workflowId=wf&nodeId=n",
      secret: "shhh",
      events: ["push"],
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/octocat/hello/hooks",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      name: "web",
      active: true,
      events: ["push"],
      config: {
        url: "https://app.example.test/api/webhooks/github?workflowId=wf&nodeId=n",
        content_type: "json",
        secret: "shhh",
        insecure_ssl: "0",
      },
    });
  });

  it("URL-encodes owner and repo (defensive)", async () => {
    const spy = mockFetchOnce({ id: 1 }, 201);
    await repoHooksCreate({
      accessToken: "tok",
      owner: "user-with-dash",
      repo: "repo.with.dots",
      url: "x",
      secret: "s",
      events: ["push"],
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/user-with-dash/repo.with.dots/hooks",
    );
  });

  it("uses active=true by default when caller omits it", async () => {
    const spy = mockFetchOnce({ id: 1 }, 201);
    await repoHooksCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      url: "x",
      secret: "s",
      events: ["push"],
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).active).toBe(true);
  });

  it("respects active=false when caller passes it explicitly", async () => {
    const spy = mockFetchOnce({ id: 1 }, 201);
    await repoHooksCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      url: "x",
      secret: "s",
      events: ["push"],
      active: false,
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).active).toBe(
      false,
    );
  });

  it("forwards the secret in config.secret (HMAC key for X-Hub-Signature-256)", async () => {
    const spy = mockFetchOnce({ id: 1 }, 201);
    await repoHooksCreate({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      url: "x",
      secret: "load-bearing-secret",
      events: ["push"],
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.config.secret).toBe("load-bearing-secret");
  });

  it("sends Authorization: token <accessToken> header (NOT Bearer)", async () => {
    const spy = mockFetchOnce({ id: 1 }, 201);
    await repoHooksCreate({
      accessToken: "gho_test_xyz",
      owner: "u",
      repo: "r",
      url: "x",
      secret: "s",
      events: ["push"],
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("token gho_test_xyz");
    expect(headers.Authorization).not.toMatch(/^Bearer /);
  });
});

describe("repoHooksDelete", () => {
  it("DELETEs /repos/{owner}/{repo}/hooks/{hookId}", async () => {
    const spy = mockFetchOnce(null, 204);
    await repoHooksDelete({
      accessToken: "tok",
      owner: "octocat",
      repo: "hello",
      hookId: 12345,
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/octocat/hello/hooks/12345",
    );
    expect(spy.mock.calls[0]![1]!.method).toBe("DELETE");
  });

  it("treats 204 No Content as success (returns void)", async () => {
    mockFetchOnce(null, 204);
    await expect(
      repoHooksDelete({
        accessToken: "tok",
        owner: "u",
        repo: "r",
        hookId: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
