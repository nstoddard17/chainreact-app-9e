/**
 * @jest-environment node
 *
 * Tests for `integrations/github/options/branches.ts` — RESOLVERS-1.
 *
 * Pin:
 *   - Canonical source / provider / requiresIntegration / requiredDeps shape.
 *   - Decrypts the token + splits the `repository` dep into owner/repo.
 *   - Maps branch name → {value,label} (+ Protected hint); labels carry NO
 *     commit SHAs / URLs / payload fields.
 *   - Case-insensitive `q` filter + alpha sort; hasMore from `truncated`.
 *   - Malformed `repository` dep → empty items (mid-manual-entry, not error).
 *   - Repo 404 → empty items (cascade fallback).
 *   - 401 → PROVIDER_REAUTH_REQUIRED (GitHub non-refreshable); rate-limit /
 *     other → PROVIDER_ERROR. Leak-free: no token / raw body in the message.
 *   - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
 */

const mockReposBranchesList = jest.fn();
jest.mock("@/integrations/_shared/github/api/repos", () => ({
  __esModule: true,
  reposBranchesList: (...args: unknown[]) => mockReposBranchesList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { githubBranchesResolver } from "@/integrations/github/options/branches";
import { NotFoundError } from "@/integrations/_shared/github/errors";
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
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { repository: "octocat/hello-world" },
    ...overrides,
  };
}

beforeEach(() => {
  mockReposBranchesList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("gho-decrypted-token");
});

describe("githubBranchesResolver — shape", () => {
  it("declares source / provider / requiresIntegration / requiredDeps", () => {
    expect(githubBranchesResolver.source).toBe("github:branches");
    expect(githubBranchesResolver.provider).toBe("github");
    expect(githubBranchesResolver.requiresIntegration).toBe(true);
    expect(githubBranchesResolver.requiredDeps).toEqual(["repository"]);
  });
});

describe("githubBranchesResolver — mapping", () => {
  it("splits the repository dep, decrypts once, and maps names → options (Protected hint)", async () => {
    mockReposBranchesList.mockResolvedValueOnce({
      branches: [
        { name: "main", protected: true },
        { name: "feature/widget", protected: false },
      ],
      truncated: false,
    });
    const result = await githubBranchesResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:gh-token-cipher");
    expect(mockReposBranchesList).toHaveBeenCalledWith({
      accessToken: "gho-decrypted-token",
      owner: "octocat",
      repo: "hello-world",
    });
    // Alpha-sorted: feature/widget before main.
    expect(result.items).toEqual([
      { value: "feature/widget", label: "feature/widget" },
      { value: "main", label: "main", description: "Protected" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("labels never carry SHAs / URLs (no raw payload beyond the name)", async () => {
    mockReposBranchesList.mockResolvedValueOnce({
      branches: [{ name: "main", protected: false }],
      truncated: false,
    });
    const result = await githubBranchesResolver.resolve(ctx());
    expect(JSON.stringify(result)).not.toMatch(/sha|commit|https?:/i);
  });

  it("propagates truncated → hasMore", async () => {
    mockReposBranchesList.mockResolvedValueOnce({
      branches: [{ name: "main", protected: false }],
      truncated: true,
    });
    const result = await githubBranchesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("filters case-insensitively on q", async () => {
    mockReposBranchesList.mockResolvedValueOnce({
      branches: [
        { name: "main", protected: false },
        { name: "feature/PAY-1", protected: false },
        { name: "release/1.0", protected: false },
      ],
      truncated: false,
    });
    const result = await githubBranchesResolver.resolve(ctx({ q: "pay" }));
    expect(result.items.map((i) => i.value)).toEqual(["feature/PAY-1"]);
  });
});

describe("githubBranchesResolver — graceful dep / not-found fallbacks", () => {
  it.each(["no-slash", "owner/", "/repo", "a/b/c", "owner /repo"])(
    "malformed repository dep '%s' → empty items, no fetch",
    async (repository) => {
      const result = await githubBranchesResolver.resolve(
        ctx({ deps: { repository } }),
      );
      expect(result).toEqual({ items: [], hasMore: false });
      expect(mockReposBranchesList).not.toHaveBeenCalled();
    },
  );

  it("repo 404 → empty items (cascade fallback), not an error", async () => {
    mockReposBranchesList.mockRejectedValueOnce(
      new NotFoundError("repository octocat/gone", "Not Found"),
    );
    const result = await githubBranchesResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("githubBranchesResolver — error sanitization (leak-free)", () => {
  it("maps a 401 to PROVIDER_REAUTH_REQUIRED (GitHub is non-refreshable)", async () => {
    mockReposBranchesList.mockRejectedValueOnce(
      new Unauthorized401Error("GitHub GET /repos/o/r/branches returned HTTP 401"),
    );
    const err = await githubBranchesResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_REAUTH_REQUIRED");
    expect(err.message).toMatch(/reconnect/i);
    expect(err.message).not.toMatch(/gho-decrypted-token|401/i);
  });

  it("maps a rate-limit error to PROVIDER_ERROR", async () => {
    mockReposBranchesList.mockRejectedValueOnce(
      new Error("GitHub GET /repos/o/r/branches failed: API rate limit exceeded"),
    );
    const err = await githubBranchesResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).toMatch(/rate limit/i);
  });

  it("maps an unexpected error to a generic PROVIDER_ERROR with no raw leak", async () => {
    mockReposBranchesList.mockRejectedValueOnce(
      new Error("secret-internal token=gho-decrypted-token boom"),
    );
    const err = await githubBranchesResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|gho-decrypted-token/);
    expect(err.message).toMatch(/couldn't load github branches/i);
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no token read, no fetch)", async () => {
    const err = await githubBranchesResolver
      .resolve(ctx({ integration: null }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockDecryptToken).not.toHaveBeenCalled();
    expect(mockReposBranchesList).not.toHaveBeenCalled();
  });
});
