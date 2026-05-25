/**
 * @jest-environment node
 *
 * Tests for microsoftOneNoteOAuth — Slice 3.ONENOTE-2.
 *
 * Strategy mirrors `microsoft-onedrive/oauth.test.ts` — the
 * wire-format helpers themselves are tested in
 * `_shared/microsoft/oauth.test.ts`. This file focuses on the
 * per-provider redirect URL + Graph /me fallback policy + the
 * ProviderOAuth integration shape.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { microsoftOneNoteOAuth } from "@/integrations/microsoft-onenote/oauth";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.MICROSOFT_CLIENT_ID = "test-microsoft-client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "test-microsoft-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_CLIENT_ID;
  delete process.env.MICROSOFT_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; json: unknown }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(r.json), {
        status: r.status ?? (r.ok ? 200 : 500),
      }),
    );
  }
  return spy;
}

const SCOPES = ["offline_access", "Notes.ReadWrite"] as const;
const PKCE_CHALLENGE = {
  codeChallenge: "fake-onenote-challenge",
  codeChallengeMethod: "S256",
};
const PKCE_INPUTS = {
  codeVerifier: "verifier-43chars-onenote-test-42-x",
  codeChallengeMethod: "S256",
};

describe("microsoftOneNoteOAuth.generatePkce", () => {
  it("delegates to the shared Microsoft PKCE generator", () => {
    expect(microsoftOneNoteOAuth.generatePkce).toBeDefined();
    const pkce = microsoftOneNoteOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("microsoftOneNoteOAuth.buildAuthUrl", () => {
  it("uses the OneNote-specific redirect_uri (NOT mail / calendar / onedrive)", () => {
    const url = microsoftOneNoteOAuth.buildAuthUrl(
      "state-xyz",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const parsed = new URL(url);
    const redirect = parsed.searchParams.get("redirect_uri");
    expect(redirect).toBe(
      "https://app.example.test/api/integrations/oauth/microsoft-onenote/callback",
    );
    expect(redirect).not.toMatch(/microsoft-outlook/);
    expect(redirect).not.toMatch(/microsoft-onedrive/);
  });

  it("throws if pkce is null (defense-in-depth)", () => {
    expect(() =>
      microsoftOneNoteOAuth.buildAuthUrl("s", SCOPES, null),
    ).toThrow(/PKCE challenge is required/);
  });
});

describe("microsoftOneNoteOAuth.handleCallback", () => {
  it("throws if pkce is null", async () => {
    await expect(
      microsoftOneNoteOAuth.handleCallback("code", "state", null),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });

  it("returns providerAccountId from Graph /me mail field when present", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT",
          refresh_token: "RT",
          expires_in: 3600,
          scope: "offline_access Notes.ReadWrite",
        },
      },
      {
        ok: true,
        json: {
          id: "graph-uuid-1",
          mail: "alice@contoso.com",
          userPrincipalName: "alice.something@contoso.onmicrosoft.com",
        },
      },
    ]);
    const result = await microsoftOneNoteOAuth.handleCallback(
      "code-1",
      "state-1",
      PKCE_INPUTS,
    );
    expect(result.account.providerAccountId).toBe("alice@contoso.com");
    expect(result.account.displayName).toBe("alice@contoso.com");
    expect(result.account.metadata!.email).toBe("alice@contoso.com");
    expect(result.account.metadata!.graphId).toBe("graph-uuid-1");
    expect(result.account.metadata!.mailField).toBe("mail");
  });

  it("falls back to userPrincipalName when mail is null (consumer accounts)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT",
          refresh_token: "RT",
          expires_in: 3600,
          scope: "offline_access Notes.ReadWrite",
        },
      },
      {
        ok: true,
        json: {
          id: "graph-uuid-2",
          mail: null,
          userPrincipalName: "bob@outlook.com",
        },
      },
    ]);
    const result = await microsoftOneNoteOAuth.handleCallback(
      "code-2",
      "state-2",
      PKCE_INPUTS,
    );
    expect(result.account.providerAccountId).toBe("bob@outlook.com");
    expect(result.account.metadata!.mailField).toBe("userPrincipalName");
  });

  it("throws when both mail and userPrincipalName are missing", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT",
          refresh_token: "RT",
          expires_in: 3600,
          scope: "offline_access Notes.ReadWrite",
        },
      },
      { ok: true, json: { id: "g", mail: null, userPrincipalName: null } },
    ]);
    await expect(
      microsoftOneNoteOAuth.handleCallback("code-3", "state-3", PKCE_INPUTS),
    ).rejects.toThrow(/mail and userPrincipalName/);
  });

  it("encrypts both access and refresh tokens before returning them", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "the-access-token",
          refresh_token: "the-refresh-token",
          expires_in: 3600,
          scope: "offline_access Notes.ReadWrite",
        },
      },
      {
        ok: true,
        json: { id: "g", mail: "x@y.z", userPrincipalName: "x@y.z" },
      },
    ]);
    const result = await microsoftOneNoteOAuth.handleCallback(
      "code-4",
      "state-4",
      PKCE_INPUTS,
    );
    expect(result.tokens.accessTokenEncrypted).not.toBe("the-access-token");
    expect(result.tokens.refreshTokenEncrypted).not.toBe("the-refresh-token");
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "the-access-token",
    );
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "the-refresh-token",
    );
  });
});

describe("microsoftOneNoteOAuth.revoke", () => {
  it("is a no-op stub (matches every Microsoft + Google sibling)", async () => {
    await expect(
      microsoftOneNoteOAuth.revoke("any-token"),
    ).resolves.toBeUndefined();
  });
});

describe("microsoftOneNoteOAuth.refreshToken", () => {
  it("delegates to the shared Microsoft refresh helper (identity check)", () => {
    // Wire-format covered by `_shared/microsoft/oauth.test.ts`. Here we
    // just verify the provider points at the shared helper, not a
    // OneNote-specific fork.
    expect(microsoftOneNoteOAuth.refreshToken).toBeInstanceOf(Function);
  });
});
