/** @jest-environment node */
import { notionOAuth } from "@/integrations/notion/oauth";
import { RefreshNotSupportedError } from "@/contracts/integration";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.NOTION_CLIENT_ID = "test-notion-client-id";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("notionOAuth.buildAuthUrl", () => {
  it("produces a Notion v2 authorize URL with all required params (no scope param)", () => {
    const url = notionOAuth.buildAuthUrl(
      "STATE-TOKEN",
      ["read_content", "update_content"],
      null,
    );
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://api.notion.com/v1/oauth/authorize",
    );
    expect(u.searchParams.get("client_id")).toBe("test-notion-client-id");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("owner")).toBe("user");
    expect(u.searchParams.get("state")).toBe("STATE-TOKEN");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/notion/callback",
    );
    // Notion's authorize URL does NOT carry a scope parameter —
    // capabilities are integration-level. The dispatcher passes the
    // manifest's scope set, but buildAuthUrl deliberately ignores it.
    expect(u.searchParams.get("scope")).toBeNull();
  });

  it("falls back to localhost redirect_uri when NEXT_PUBLIC_APP_URL is not set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = notionOAuth.buildAuthUrl("S", ["read_content"], null);
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/oauth/notion/callback",
    );
  });

  it("throws when NOTION_CLIENT_ID is not set", () => {
    delete process.env.NOTION_CLIENT_ID;
    expect(() =>
      notionOAuth.buildAuthUrl("S", ["read_content"], null),
    ).toThrow(/NOTION_CLIENT_ID/);
  });

  it("uses NOTION_AUTHORIZE_BASE override when set (e2e mock surface)", () => {
    process.env.NOTION_AUTHORIZE_BASE = "http://localhost:9879";
    const url = notionOAuth.buildAuthUrl("S", ["read_content"], null);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "http://localhost:9879/v1/oauth/authorize",
    );
  });

  it("defaults to api.notion.com when NOTION_AUTHORIZE_BASE is unset (production-safe)", () => {
    delete process.env.NOTION_AUTHORIZE_BASE;
    const url = notionOAuth.buildAuthUrl("S", ["read_content"], null);
    expect(new URL(url).origin).toBe("https://api.notion.com");
  });

  it("ignores the requestedScopes argument (Notion's authorize URL takes no scope param)", () => {
    const url = notionOAuth.buildAuthUrl(
      "S",
      ["read_content", "update_content", "insert_content"],
      null,
    );
    const u = new URL(url);
    // No scope parameter in any form.
    expect(u.searchParams.get("scope")).toBeNull();
    expect(u.searchParams.get("scopes")).toBeNull();
  });
});

describe("notionOAuth — refresh + revoke", () => {
  // handleCallback has its own dedicated test file (oauth-callback.test.ts).
  it("refreshToken throws RefreshNotSupportedError (Slice 9 scope: non-refreshable)", async () => {
    await expect(notionOAuth.refreshToken("any")).rejects.toThrow(
      RefreshNotSupportedError,
    );
  });

  it("RefreshNotSupportedError carries 'notion' as the provider name", async () => {
    await expect(notionOAuth.refreshToken("any")).rejects.toThrow(
      /notion/,
    );
  });

  it("revoke is a no-op (Notion has no revocation endpoint)", async () => {
    await expect(notionOAuth.revoke("any-token")).resolves.toBeUndefined();
  });
});

describe("notionOAuth — generatePkce", () => {
  it("does not implement generatePkce (Notion does not use PKCE)", () => {
    // Field absent rather than null — the dispatcher checks
    // `oauth.generatePkce?.()` and skips PKCE plumbing entirely when
    // the method is undefined.
    expect(notionOAuth.generatePkce).toBeUndefined();
  });
});
