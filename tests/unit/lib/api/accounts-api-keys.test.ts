/**
 * @jest-environment node
 *
 * Tests for the account API-key client wrappers (4.API-KEYS-FOUNDATION-4 / FK-3).
 * Mocks global fetch so the wire shapes (URL, method, body) and error mapping are
 * isolated from the network. The raw secret is only ever surfaced by `createApiKey`
 * (the create response); list/revoke never carry it. Sibling of accounts-team.test.ts.
 */

import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  LAUNCH_API_KEY_SCOPE,
  AccountApiError,
} from "@/lib/api/accounts";

const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  (globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch;
});

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}
function err(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

describe("listApiKeys", () => {
  it("GETs the api-keys route and unwraps `apiKeys`", async () => {
    const apiKeys = [
      {
        id: "k1",
        name: "CI",
        prefix: "crk_live_ab12…wxyz",
        scopes: ["workflows:trigger"],
        status: "active",
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: "2026-06-01T00:00:00Z",
      },
    ];
    mockFetch.mockResolvedValueOnce(ok({ apiKeys }));
    const r = await listApiKeys("acct 1");
    expect(r).toEqual(apiKeys);
    expect(mockFetch).toHaveBeenCalledWith("/api/accounts/acct%201/api-keys");
  });

  it("never carries a key_hash field in the response shape", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ apiKeys: [{ id: "k1", name: "x", prefix: "crk_live_…", scopes: [], status: "active", lastUsedAt: null, expiresAt: null, revokedAt: null, createdAt: "c" }] }),
    );
    const r = await listApiKeys("a1");
    expect(r[0]).not.toHaveProperty("key_hash");
    expect(r[0]).not.toHaveProperty("keyHash");
  });

  it("maps 403 → FORBIDDEN", async () => {
    mockFetch.mockResolvedValueOnce(err(403, { error: "Insufficient permissions." }));
    await expect(listApiKeys("a1")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});

describe("createApiKey", () => {
  it("POSTs name + the launch scope + null expiry, and returns the raw key once", async () => {
    const metadata = {
      id: "k1",
      name: "CI",
      prefix: "crk_live_ab12…wxyz",
      scopes: ["workflows:trigger"],
      status: "active",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: "2026-06-01T00:00:00Z",
    };
    mockFetch.mockResolvedValueOnce(ok({ apiKey: metadata, key: "crk_live_RAW" }, 201));
    const r = await createApiKey("a1", { name: "CI" });
    expect(r).toEqual({ metadata, key: "crk_live_RAW" });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("/api/accounts/a1/api-keys");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "CI",
      scopes: [LAUNCH_API_KEY_SCOPE],
      expiresAt: null,
    });
  });

  it("forwards explicit scopes + expiry when provided", async () => {
    mockFetch.mockResolvedValueOnce(ok({ apiKey: { id: "k1" }, key: "raw" }, 201));
    await createApiKey("a1", { name: "x", scopes: ["workflows:trigger"], expiresAt: "2027-01-01T00:00:00Z" });
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.expiresAt).toBe("2027-01-01T00:00:00Z");
  });

  it("maps a 400 invalid-scope rejection → VALIDATION", async () => {
    mockFetch.mockResolvedValueOnce(err(400, { error: "Unknown scope.", code: "INVALID_SCOPES" }));
    await expect(createApiKey("a1", { name: "x" })).rejects.toMatchObject({
      code: "VALIDATION",
      status: 400,
    });
  });
});

describe("revokeApiKey", () => {
  it("DELETEs the keyId route", async () => {
    mockFetch.mockResolvedValueOnce(ok({ ok: true, alreadyRevoked: false }));
    await revokeApiKey("a1", "k 1");
    expect(mockFetch).toHaveBeenCalledWith("/api/accounts/a1/api-keys/k%201", { method: "DELETE" });
  });

  it("maps 404 → UNKNOWN (no cross-account existence leak surfaced to the client)", async () => {
    mockFetch.mockResolvedValueOnce(err(404, { error: "No such API key." }));
    await expect(revokeApiKey("a1", "missing")).rejects.toBeInstanceOf(AccountApiError);
  });
});
