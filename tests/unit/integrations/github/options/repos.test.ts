/**
 * @jest-environment node
 *
 * Tests for `integrations/github/options/repos.ts` — Slice ANALYTICS-SOURCES-GITHUB-UI-3.
 *
 * Pin:
 *   - Canonical source / provider / requiresIntegration shape.
 *   - Decrypts the token once + maps full_name → {value,label} (+ Private hint).
 *   - Case-insensitive `q` filter on full_name; hasMore from the helper's truncated.
 *   - 401 → PROVIDER_REAUTH_REQUIRED (GitHub non-refreshable); rate-limit / other →
 *     PROVIDER_ERROR. Leak-free: no token / raw body in the message.
 *   - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
 */

const mockUserReposList = jest.fn();
jest.mock("@/integrations/_shared/github/api/repos", () => ({
  __esModule: true,
  userReposList: (...args: unknown[]) => mockUserReposList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { githubReposResolver } from "@/integrations/github/options/repos";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-1",
  connectedByUserId: "user-1",
  provider: "github",
  providerAccountId: "octocat",
  displayName: "octocat",
  accessTokenEncrypted: "enc:gh-token-cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["repo", "read:org", "gist"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-06-19T00:00:00Z",
  updatedAt: "2026-06-19T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockUserReposList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("gho-decrypted-token");
});

describe("githubReposResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields", () => {
    expect(githubReposResolver.source).toBe("github:repos");
    expect(githubReposResolver.provider).toBe("github");
    expect(githubReposResolver.requiresIntegration).toBe(true);
    expect(githubReposResolver.requiredDeps).toBeUndefined();
  });
});

describe("githubReposResolver — mapping", () => {
  it("decrypts the token once and maps full_name → {value,label}; private gets a hint", async () => {
    mockUserReposList.mockResolvedValueOnce({
      repos: [
        { fullName: "octocat/public-one", private: false },
        { fullName: "octocat/secret", private: true },
      ],
      truncated: false,
    });
    const result = await githubReposResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:gh-token-cipher");
    expect(mockUserReposList).toHaveBeenCalledWith({ accessToken: "gho-decrypted-token" });
    expect(result.items).toEqual([
      { value: "octocat/public-one", label: "octocat/public-one" },
      { value: "octocat/secret", label: "octocat/secret", description: "Private" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("propagates truncated → hasMore", async () => {
    mockUserReposList.mockResolvedValueOnce({
      repos: [{ fullName: "o/a", private: false }],
      truncated: true,
    });
    const result = await githubReposResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("githubReposResolver — q filtering", () => {
  it("filters case-insensitively on full_name", async () => {
    mockUserReposList.mockResolvedValueOnce({
      repos: [
        { fullName: "octocat/web-app", private: false },
        { fullName: "octocat/api-server", private: false },
        { fullName: "other/web-lib", private: false },
      ],
      truncated: false,
    });
    const result = await githubReposResolver.resolve(ctx({ q: "WEB" }));
    expect(result.items.map((i) => i.value)).toEqual(["octocat/web-app", "other/web-lib"]);
  });

  it("returns all repos when q is empty", async () => {
    mockUserReposList.mockResolvedValueOnce({
      repos: [
        { fullName: "o/a", private: false },
        { fullName: "o/b", private: false },
      ],
      truncated: false,
    });
    const result = await githubReposResolver.resolve(ctx({ q: "" }));
    expect(result.items).toHaveLength(2);
  });
});

describe("githubReposResolver — error sanitization (leak-free)", () => {
  it("maps a 401 to PROVIDER_REAUTH_REQUIRED (GitHub is non-refreshable)", async () => {
    mockUserReposList.mockRejectedValueOnce(new Unauthorized401Error("GitHub GET /user/repos returned HTTP 401"));
    const err = await githubReposResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_REAUTH_REQUIRED");
    expect(err.message).toMatch(/reconnect/i);
    expect(err.message).not.toMatch(/gho-decrypted-token|401/i);
  });

  it("maps a rate-limit error to PROVIDER_ERROR", async () => {
    mockUserReposList.mockRejectedValueOnce(
      new Error("GitHub GET /user/repos failed: API rate limit exceeded"),
    );
    const err = await githubReposResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).toMatch(/rate limit/i);
  });

  it("maps an unexpected error to a generic PROVIDER_ERROR with no raw leak", async () => {
    mockUserReposList.mockRejectedValueOnce(new Error("secret-internal token=gho-decrypted-token boom"));
    const err = await githubReposResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|gho-decrypted-token/);
    expect(err.message).toMatch(/couldn't load your github repositories/i);
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no token read, no fetch)", async () => {
    const err = await githubReposResolver.resolve(ctx({ integration: null })).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockDecryptToken).not.toHaveBeenCalled();
    expect(mockUserReposList).not.toHaveBeenCalled();
  });
});
