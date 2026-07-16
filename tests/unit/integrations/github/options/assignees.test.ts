/**
 * @jest-environment node
 *
 * Tests for `integrations/github/options/assignees.ts` — RESOLVERS-1.
 *
 * Pin:
 *   - Canonical source / provider / requiresIntegration / requiredDeps shape.
 *   - Decrypts the token + splits the `repository` dep into owner/repo.
 *   - Maps login → {value,label}; value is the LOGIN (what
 *     `create_issue.assignees` stores), never a numeric user id.
 *   - NO collaborator PII: real names / emails / avatar URLs present on the
 *     wire payload never reach an option (the wrapper only surfaces `login`).
 *   - Case-insensitive `q` filter + alpha sort; hasMore from `truncated`.
 *   - Malformed `repository` dep → empty items (mid-manual-entry, not error).
 *   - Repo 404 → empty items (cascade fallback).
 *   - 401 → PROVIDER_REAUTH_REQUIRED (GitHub non-refreshable); rate-limit /
 *     other → PROVIDER_ERROR. Leak-free: no token / raw body in the message.
 *   - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
 */

const mockReposAssigneesList = jest.fn();
jest.mock("@/integrations/_shared/github/api/repos", () => ({
  __esModule: true,
  reposAssigneesList: (...args: unknown[]) => mockReposAssigneesList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { githubAssigneesResolver } from "@/integrations/github/options/assignees";
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
  mockReposAssigneesList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("gho-decrypted-token");
});

describe("githubAssigneesResolver — shape", () => {
  it("declares source / provider / requiresIntegration / requiredDeps (matching github:branches)", () => {
    expect(githubAssigneesResolver.source).toBe("github:assignees");
    expect(githubAssigneesResolver.provider).toBe("github");
    expect(githubAssigneesResolver.requiresIntegration).toBe(true);
    expect(githubAssigneesResolver.requiredDeps).toEqual(["repository"]);
  });
});

describe("githubAssigneesResolver — mapping", () => {
  it("splits the repository dep, decrypts once, and maps logins → options (value = LOGIN)", async () => {
    mockReposAssigneesList.mockResolvedValueOnce({
      assignees: [{ login: "octocat" }, { login: "hubot" }],
      truncated: false,
    });
    const result = await githubAssigneesResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:gh-token-cipher");
    expect(mockReposAssigneesList).toHaveBeenCalledWith({
      accessToken: "gho-decrypted-token",
      owner: "octocat",
      repo: "hello-world",
    });
    // Alpha-sorted: hubot before octocat.
    expect(result.items).toEqual([
      { value: "hubot", label: "hubot" },
      { value: "octocat", label: "octocat" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("value is the LOGIN (the string create_issue.assignees stores), never a numeric id", async () => {
    mockReposAssigneesList.mockResolvedValueOnce({
      assignees: [{ login: "octocat" }],
      truncated: false,
    });
    const result = await githubAssigneesResolver.resolve(ctx());
    expect(result.items[0]!.value).toBe("octocat");
    expect(typeof result.items[0]!.value).toBe("string");
  });

  it("no collaborator PII in options — only the public login is ever surfaced", async () => {
    // The wrapper normalizes to `{login}`, so even if a caller handed the
    // resolver a fuller record, nothing but the login can reach an option.
    mockReposAssigneesList.mockResolvedValueOnce({
      assignees: [
        {
          login: "octocat",
          name: "Mona Lisa",
          email: "mona@example.com",
          avatar_url: "https://avatars.githubusercontent.com/u/1",
          id: 583231,
        },
      ],
      truncated: false,
    });
    const result = await githubAssigneesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "octocat", label: "octocat" }]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/mona@example\.com|Mona Lisa|avatars|583231/i);
  });

  it("propagates truncated → hasMore", async () => {
    mockReposAssigneesList.mockResolvedValueOnce({
      assignees: [{ login: "octocat" }],
      truncated: true,
    });
    const result = await githubAssigneesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("filters case-insensitively on q", async () => {
    mockReposAssigneesList.mockResolvedValueOnce({
      assignees: [{ login: "octocat" }, { login: "HUBOT" }, { login: "defunkt" }],
      truncated: false,
    });
    const result = await githubAssigneesResolver.resolve(ctx({ q: "hub" }));
    expect(result.items.map((i) => i.value)).toEqual(["HUBOT"]);
  });
});

describe("githubAssigneesResolver — graceful dep / not-found fallbacks", () => {
  it.each(["no-slash", "owner/", "/repo", "a/b/c", "owner /repo"])(
    "malformed repository dep '%s' → empty items, no fetch",
    async (repository) => {
      const result = await githubAssigneesResolver.resolve(
        ctx({ deps: { repository } }),
      );
      expect(result).toEqual({ items: [], hasMore: false });
      expect(mockReposAssigneesList).not.toHaveBeenCalled();
    },
  );

  it("repo 404 → empty items (cascade fallback), not an error", async () => {
    mockReposAssigneesList.mockRejectedValueOnce(
      new NotFoundError("repository octocat/gone", "Not Found"),
    );
    const result = await githubAssigneesResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("githubAssigneesResolver — error sanitization (leak-free)", () => {
  it("maps a 401 to PROVIDER_REAUTH_REQUIRED (GitHub is non-refreshable)", async () => {
    mockReposAssigneesList.mockRejectedValueOnce(
      new Unauthorized401Error("GitHub GET /repos/o/r/assignees returned HTTP 401"),
    );
    const err = await githubAssigneesResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_REAUTH_REQUIRED");
    expect(err.message).toMatch(/reconnect/i);
    expect(err.message).not.toMatch(/gho-decrypted-token|401/i);
  });

  it("maps a rate-limit error to PROVIDER_ERROR", async () => {
    mockReposAssigneesList.mockRejectedValueOnce(
      new Error("GitHub GET /repos/o/r/assignees failed: API rate limit exceeded"),
    );
    const err = await githubAssigneesResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).toMatch(/rate limit/i);
  });

  it("maps an unexpected error to a generic PROVIDER_ERROR with no raw leak", async () => {
    mockReposAssigneesList.mockRejectedValueOnce(
      new Error("secret-internal token=gho-decrypted-token boom"),
    );
    const err = await githubAssigneesResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|gho-decrypted-token/);
    expect(err.message).toMatch(/couldn't load github assignees/i);
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no token read, no fetch)", async () => {
    const err = await githubAssigneesResolver
      .resolve(ctx({ integration: null }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockDecryptToken).not.toHaveBeenCalled();
    expect(mockReposAssigneesList).not.toHaveBeenCalled();
  });
});
