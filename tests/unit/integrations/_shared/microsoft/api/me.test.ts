/**
 * @jest-environment node
 *
 * Tests for the shared Microsoft Graph /me wrapper. Used by every
 * provider's OAuth callback for accountId resolution. The wrapper itself
 * does pure-fetch + JSON parse; the `mail ?? userPrincipalName` fallback
 * lives in per-provider OAuth modules so per-provider tests can assert it
 * (see `tests/unit/integrations/microsoft-outlook/oauth.test.ts`).
 */
import { getMe } from "@/integrations/_shared/microsoft/api/me";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(opts: { ok: boolean; status?: number; json?: unknown }) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("getMe wrapper", () => {
  it("GETs /v1.0/me?$select=mail,userPrincipalName,id with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "graph-uid",
        mail: "alice@contoso.com",
        userPrincipalName: "alice@contoso.com",
      },
    });

    await getMe("ms-access-token");

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,id",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Authorization: "Bearer ms-access-token" });
  });

  it("returns the parsed Graph response on 200", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "uid-1",
        mail: "bob@contoso.com",
        userPrincipalName: "bob@contoso.com",
        displayName: "Bob",
      },
    });

    const result = await getMe("t");

    expect(result).toEqual({
      id: "uid-1",
      mail: "bob@contoso.com",
      userPrincipalName: "bob@contoso.com",
      displayName: "Bob",
    });
  });

  it("preserves mail: null in the response (fallback policy lives at the caller)", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "consumer-uid",
        mail: null,
        userPrincipalName: "alice@outlook.com",
      },
    });

    const result = await getMe("t");

    expect(result.mail).toBeNull();
    expect(result.userPrincipalName).toBe("alice@outlook.com");
  });

  it("throws on HTTP non-OK with the status code in the message", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(getMe("stale")).rejects.toThrow(
      /Microsoft Graph \/me failed: HTTP 401/,
    );
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "x" } });

    await getMe("t");

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me?$select=mail,userPrincipalName,id",
    );
  });
});
