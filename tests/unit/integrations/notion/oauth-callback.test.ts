/**
 * @jest-environment node
 *
 * Tests for notionOAuth.handleCallback. Mocks the global fetch so we
 * don't hit Notion. Verifies the request shape (HTTP Basic auth header,
 * JSON body, exact body fields), error handling, and that the response
 * tokens are encrypted before returning (decrypt round-trips to the
 * original).
 */
import { randomBytes } from "node:crypto";
import { notionOAuth } from "@/integrations/notion/oauth";
import { decryptToken } from "@/core/encryption/tokens";

const TOKEN_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.NOTION_CLIENT_ID = "test-client-id";
  process.env.NOTION_CLIENT_SECRET = "test-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.NOTION_CLIENT_ID;
  delete process.env.NOTION_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.NOTION_API_BASE;
});

function mockFetchOnce(response: { ok: boolean; status?: number; json: unknown }) {
  jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(response.json), {
      status: response.status ?? (response.ok ? 200 : 500),
    }),
  );
}

describe("notionOAuth.handleCallback", () => {
  it("posts JSON body to /v1/oauth/token with HTTP Basic auth", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "secret_test-token",
            token_type: "bearer",
            bot_id: "bot-abc",
            workspace_id: "ws-123",
            workspace_name: "Acme",
          }),
          { status: 200 },
        ),
      );

    await notionOAuth.handleCallback("auth-code-xyz", "state-token", null);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/oauth/token");
    expect(init!.method).toBe("POST");

    // HTTP Basic auth header — base64(client_id:client_secret).
    const headers = init!.headers as Record<string, string>;
    const expectedAuth = `Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`;
    expect(headers.Authorization).toBe(expectedAuth);
    // Notion requires JSON body — NOT form-encoded.
    expect(headers["Content-Type"]).toBe("application/json");

    // Body is JSON with exactly the three required fields.
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({
      grant_type: "authorization_code",
      code: "auth-code-xyz",
      redirect_uri: "https://app.example.test/api/integrations/oauth/notion/callback",
    });
  });

  it("encrypts the access_token; decrypt round-trips to the original", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        access_token: "secret_real-bot-token-xyz",
        token_type: "bearer",
        bot_id: "bot-abc",
        workspace_id: "ws-123",
        workspace_name: "Acme",
      },
    });
    const result = await notionOAuth.handleCallback("code", "state", null);
    expect(result.tokens.accessTokenEncrypted).not.toContain(
      "secret_real-bot-token-xyz",
    );
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "secret_real-bot-token-xyz",
    );
  });

  it("drops Notion's refresh_token on the floor (Slice 9 scope: non-refreshable)", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        access_token: "secret_x",
        token_type: "bearer",
        bot_id: "bot-abc",
        workspace_id: "ws-123",
        // Notion DOES return a refresh_token per current docs;
        // Slice 9 intentionally drops it.
        refresh_token: "secret_refresh-xyz",
      },
    });
    const result = await notionOAuth.handleCallback("c", "s", null);
    expect(result.tokens.refreshTokenEncrypted).toBeNull();
    expect(result.tokens.accessTokenExpiresAt).toBeNull();
  });

  it("returns empty scopes array (Notion doesn't echo per-flow scopes)", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        access_token: "secret_x",
        token_type: "bearer",
        bot_id: "bot-abc",
        workspace_id: "ws-123",
      },
    });
    const result = await notionOAuth.handleCallback("c", "s", null);
    expect(result.tokens.scopes).toEqual([]);
  });

  it("populates ProviderAccountInfo from the Notion token response", async () => {
    const owner = {
      type: "user",
      user: { object: "user", id: "u-owner-1" },
    };
    mockFetchOnce({
      ok: true,
      json: {
        access_token: "secret_x",
        token_type: "bearer",
        bot_id: "bot-stable-id",
        workspace_id: "ws-456",
        workspace_name: "Acme HQ",
        workspace_icon: "https://example.test/icon.png",
        owner,
      },
    });
    const result = await notionOAuth.handleCallback("c", "s", null);
    expect(result.account.providerAccountId).toBe("bot-stable-id");
    expect(result.account.displayName).toBe("Acme HQ");
    expect(result.account.metadata).toEqual({
      botId: "bot-stable-id",
      workspaceId: "ws-456",
      workspaceName: "Acme HQ",
      workspaceIcon: "https://example.test/icon.png",
      owner,
    });
  });

  it("falls back displayName to bot_id when workspace_name is null/missing", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        access_token: "secret_x",
        token_type: "bearer",
        bot_id: "bot-no-workspace-name",
        workspace_id: "ws-789",
        // workspace_name omitted — Notion omits it for unnamed workspaces.
      },
    });
    const result = await notionOAuth.handleCallback("c", "s", null);
    expect(result.account.displayName).toBe("bot-no-workspace-name");
    const meta = result.account.metadata as Record<string, unknown>;
    expect(meta.workspaceName).toBeNull();
    expect(meta.workspaceIcon).toBeNull();
    expect(meta.owner).toBeNull();
  });

  it("throws on HTTP-level failure (4xx/5xx)", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("invalid_grant", { status: 400 }),
      );
    await expect(
      notionOAuth.handleCallback("bad-code", "s", null),
    ).rejects.toThrow(/HTTP 400.*invalid_grant/);
  });

  it("throws when NOTION_CLIENT_SECRET is missing", async () => {
    delete process.env.NOTION_CLIENT_SECRET;
    await expect(notionOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /NOTION_CLIENT_SECRET/,
    );
  });

  it("throws when response is missing access_token or bot_id", async () => {
    mockFetchOnce({
      ok: true,
      json: { token_type: "bearer", workspace_id: "ws" },
    });
    await expect(notionOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /missing access_token or bot_id/,
    );
  });

  it("uses NOTION_API_BASE override for the token exchange (e2e mock surface)", async () => {
    process.env.NOTION_API_BASE = "http://localhost:9879";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "secret_x",
          token_type: "bearer",
          bot_id: "b",
          workspace_id: "w",
        }),
        { status: 200 },
      ),
    );
    await notionOAuth.handleCallback("c", "s", null);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:9879/v1/oauth/token",
      expect.any(Object),
    );
  });
});
