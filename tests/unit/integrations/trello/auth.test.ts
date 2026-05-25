/**
 * @jest-environment node
 *
 * Tests for integrations/trello/auth.ts — the Trello token-ingest
 * implementation (Slice 17 Commit 3).
 */
import { randomBytes } from "node:crypto";

import { trelloAuth } from "@/integrations/trello/auth";
import { TokenIngestVerificationError } from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";

const ORIGINAL_FETCH = global.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env.TRELLO_CLIENT_ID = "test-trello-app-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  delete process.env.TRELLO_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.TRELLO_AUTHORIZE_BASE;
  delete process.env.TRELLO_API_BASE;
  global.fetch = ORIGINAL_FETCH;
});

describe("trelloAuth.buildAuthUrl", () => {
  it("returns a Trello authorize URL with state embedded in return_url", () => {
    const url = trelloAuth.buildAuthUrl("STATE-XYZ", []);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://trello.com/1/authorize");
    expect(u.searchParams.get("key")).toBe("test-trello-app-key");
    expect(u.searchParams.get("name")).toBe("ChainReact");
    expect(u.searchParams.get("scope")).toBe("read,write,account");
    expect(u.searchParams.get("expiration")).toBe("never");
    expect(u.searchParams.get("response_type")).toBe("token");
    expect(u.searchParams.get("callback_method")).toBe("fragment");
    const returnUrl = u.searchParams.get("return_url");
    expect(returnUrl).toBeTruthy();
    const ru = new URL(returnUrl!);
    expect(ru.origin + ru.pathname).toBe(
      "https://app.example.test/integrations/token-ingest/trello",
    );
    expect(ru.searchParams.get("state")).toBe("STATE-XYZ");
  });

  it("uses TRELLO_AUTHORIZE_BASE override when set (e2e seam)", () => {
    process.env.TRELLO_AUTHORIZE_BASE = "http://localhost:9885";
    const url = trelloAuth.buildAuthUrl("S", []);
    expect(new URL(url).origin).toBe("http://localhost:9885");
  });

  it("throws when TRELLO_CLIENT_ID is missing", () => {
    delete process.env.TRELLO_CLIENT_ID;
    expect(() => trelloAuth.buildAuthUrl("S", [])).toThrow(/TRELLO_CLIENT_ID/);
  });
});

describe("trelloAuth.verifyAndIngestToken", () => {
  it("calls GET /1/members/me with key + token, encrypts the token, returns account info", async () => {
    const captured: { url?: string; method?: string } = {};
    global.fetch = jest.fn(async (input: unknown, init?: { method?: string }) => {
      captured.url =
        typeof input === "string"
          ? input
          : (input as { toString: () => string }).toString();
      captured.method = init?.method;
      return jsonResponse(200, {
        id: "trello-member-id-abc",
        username: "octocat",
        fullName: "Octo Cat",
        initials: "OC",
        avatarUrl: "https://trello-members.s3.amazonaws.com/abc/170.png",
        url: "https://trello.com/octocat",
      });
    }) as unknown as typeof fetch;

    const result = await trelloAuth.verifyAndIngestToken({
      token: "user-token-9999",
      state: "ignored-state",
    });

    expect(captured.method).toBe("GET");
    const u = new URL(captured.url!);
    expect(u.origin + u.pathname).toBe("https://api.trello.com/1/members/me");
    expect(u.searchParams.get("key")).toBe("test-trello-app-key");
    expect(u.searchParams.get("token")).toBe("user-token-9999");

    expect(result.account.providerAccountId).toBe("trello-member-id-abc");
    expect(result.account.displayName).toBe("Octo Cat");
    expect(result.account.metadata.username).toBe("octocat");
    expect(result.account.metadata.appKey).toBe("test-trello-app-key");

    expect(result.tokens.refreshTokenEncrypted).toBeNull();
    expect(result.tokens.accessTokenExpiresAt).toBeNull();
    expect(result.tokens.scopes).toEqual([]);

    const recovered = decryptToken(result.tokens.accessTokenEncrypted);
    expect(recovered).toBe("user-token-9999");
    expect(result.tokens.accessTokenEncrypted).not.toBe("user-token-9999");
  });

  it("falls back to username, then id, for displayName when fullName is missing", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, { id: "abc", username: "octo" }),
    ) as unknown as typeof fetch;
    const { account } = await trelloAuth.verifyAndIngestToken({
      token: "t",
      state: "s",
    });
    expect(account.displayName).toBe("octo");
  });

  it("falls back to id when both fullName and username are missing", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, { id: "abc" }),
    ) as unknown as typeof fetch;
    const { account } = await trelloAuth.verifyAndIngestToken({
      token: "t",
      state: "s",
    });
    expect(account.displayName).toBe("abc");
  });

  it("throws TokenIngestVerificationError on 401", async () => {
    global.fetch = jest.fn(async () =>
      new Response("invalid token", { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(
      trelloAuth.verifyAndIngestToken({ token: "bad-token", state: "s" }),
    ).rejects.toBeInstanceOf(TokenIngestVerificationError);
  });

  it("throws TokenIngestVerificationError on 403", async () => {
    global.fetch = jest.fn(async () =>
      new Response("forbidden", { status: 403 }),
    ) as unknown as typeof fetch;
    await expect(
      trelloAuth.verifyAndIngestToken({ token: "bad-token", state: "s" }),
    ).rejects.toBeInstanceOf(TokenIngestVerificationError);
  });

  it("throws TokenIngestVerificationError when member response has no id", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, { username: "octo" }),
    ) as unknown as typeof fetch;
    await expect(
      trelloAuth.verifyAndIngestToken({ token: "t", state: "s" }),
    ).rejects.toBeInstanceOf(TokenIngestVerificationError);
  });

  it("throws generic error on 5xx (dispatcher maps to 502)", async () => {
    global.fetch = jest.fn(async () =>
      new Response("server error", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      trelloAuth.verifyAndIngestToken({ token: "t", state: "s" }),
    ).rejects.toThrow(/verify failed/i);
  });

  it("throws generic error on network failure (dispatcher maps to 502)", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(
      trelloAuth.verifyAndIngestToken({ token: "t", state: "s" }),
    ).rejects.toThrow(/fetch failed/i);
  });

  it("never includes the token in any thrown error message", async () => {
    const sensitiveToken = "secret-abc-9999";
    global.fetch = jest.fn(async () =>
      new Response("nope", { status: 401 }),
    ) as unknown as typeof fetch;
    try {
      await trelloAuth.verifyAndIngestToken({
        token: sensitiveToken,
        state: "s",
      });
      throw new Error("verify should have thrown");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(sensitiveToken);
    }
  });
});

describe("trelloAuth.revoke", () => {
  it("calls DELETE /1/tokens/{token} with key", async () => {
    const captured: { url?: string; method?: string } = {};
    global.fetch = jest.fn(async (input: unknown, init?: { method?: string }) => {
      captured.url =
        typeof input === "string"
          ? input
          : (input as { toString: () => string }).toString();
      captured.method = init?.method;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    await trelloAuth.revoke("user-token-1234");
    expect(captured.method).toBe("DELETE");
    expect(captured.url).toContain("/1/tokens/user-token-1234");
    expect(captured.url).toContain("key=test-trello-app-key");
  });

  it("swallows fetch failures (best-effort)", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(trelloAuth.revoke("t")).resolves.toBeUndefined();
  });
});
