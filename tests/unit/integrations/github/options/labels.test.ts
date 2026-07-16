/**
 * @jest-environment node
 *
 * Tests for `integrations/github/options/labels.ts` — RESOLVERS-1.
 *
 * Pin:
 *   - Canonical source / provider / requiresIntegration / requiredDeps shape.
 *   - Decrypts the token + splits the `repository` dep into owner/repo.
 *   - Maps label name → {value,label}; value is the NAME (what
 *     `create_issue.labels` stores), never a numeric label id.
 *   - Labels carry NO colors / descriptions / ids / URLs.
 *   - Case-insensitive `q` filter + alpha sort; hasMore from `truncated`.
 *   - Malformed `repository` dep → empty items (mid-manual-entry, not error).
 *   - Repo 404 → empty items (cascade fallback).
 *   - 401 → PROVIDER_REAUTH_REQUIRED (GitHub non-refreshable); rate-limit /
 *     other → PROVIDER_ERROR. Leak-free: no token / raw body in the message.
 *   - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
 */

const mockReposLabelsList = jest.fn();
jest.mock("@/integrations/_shared/github/api/repos", () => ({
  __esModule: true,
  reposLabelsList: (...args: unknown[]) => mockReposLabelsList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { githubLabelsResolver } from "@/integrations/github/options/labels";
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
  mockReposLabelsList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("gho-decrypted-token");
});

describe("githubLabelsResolver — shape", () => {
  it("declares source / provider / requiresIntegration / requiredDeps (matching github:branches)", () => {
    expect(githubLabelsResolver.source).toBe("github:labels");
    expect(githubLabelsResolver.provider).toBe("github");
    expect(githubLabelsResolver.requiresIntegration).toBe(true);
    expect(githubLabelsResolver.requiredDeps).toEqual(["repository"]);
  });
});

describe("githubLabelsResolver — mapping", () => {
  it("splits the repository dep, decrypts once, and maps names → options (value = NAME)", async () => {
    mockReposLabelsList.mockResolvedValueOnce({
      labels: [{ name: "bug" }, { name: "priority: high" }],
      truncated: false,
    });
    const result = await githubLabelsResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:gh-token-cipher");
    expect(mockReposLabelsList).toHaveBeenCalledWith({
      accessToken: "gho-decrypted-token",
      owner: "octocat",
      repo: "hello-world",
    });
    // Alpha-sorted.
    expect(result.items).toEqual([
      { value: "bug", label: "bug" },
      { value: "priority: high", label: "priority: high" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("value is the label NAME (the string create_issue.labels stores), never a numeric id", async () => {
    mockReposLabelsList.mockResolvedValueOnce({
      labels: [{ name: "bug" }],
      truncated: false,
    });
    const result = await githubLabelsResolver.resolve(ctx());
    expect(result.items[0]!.value).toBe("bug");
    expect(typeof result.items[0]!.value).toBe("string");
  });

  it("options carry no colors / descriptions / ids / URLs (no raw payload beyond the name)", async () => {
    mockReposLabelsList.mockResolvedValueOnce({
      labels: [{ name: "bug" }],
      truncated: false,
    });
    const result = await githubLabelsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "bug", label: "bug" }]);
    expect(JSON.stringify(result)).not.toMatch(/color|https?:|"id"/i);
  });

  it("propagates truncated → hasMore", async () => {
    mockReposLabelsList.mockResolvedValueOnce({
      labels: [{ name: "bug" }],
      truncated: true,
    });
    const result = await githubLabelsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("filters case-insensitively on q", async () => {
    mockReposLabelsList.mockResolvedValueOnce({
      labels: [{ name: "bug" }, { name: "Priority-HIGH" }, { name: "docs" }],
      truncated: false,
    });
    const result = await githubLabelsResolver.resolve(ctx({ q: "priority" }));
    expect(result.items.map((i) => i.value)).toEqual(["Priority-HIGH"]);
  });
});

describe("githubLabelsResolver — graceful dep / not-found fallbacks", () => {
  it.each(["no-slash", "owner/", "/repo", "a/b/c", "owner /repo"])(
    "malformed repository dep '%s' → empty items, no fetch",
    async (repository) => {
      const result = await githubLabelsResolver.resolve(
        ctx({ deps: { repository } }),
      );
      expect(result).toEqual({ items: [], hasMore: false });
      expect(mockReposLabelsList).not.toHaveBeenCalled();
    },
  );

  it("repo 404 → empty items (cascade fallback), not an error", async () => {
    mockReposLabelsList.mockRejectedValueOnce(
      new NotFoundError("repository octocat/gone", "Not Found"),
    );
    const result = await githubLabelsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("githubLabelsResolver — error sanitization (leak-free)", () => {
  it("maps a 401 to PROVIDER_REAUTH_REQUIRED (GitHub is non-refreshable)", async () => {
    mockReposLabelsList.mockRejectedValueOnce(
      new Unauthorized401Error("GitHub GET /repos/o/r/labels returned HTTP 401"),
    );
    const err = await githubLabelsResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_REAUTH_REQUIRED");
    expect(err.message).toMatch(/reconnect/i);
    expect(err.message).not.toMatch(/gho-decrypted-token|401/i);
  });

  it("maps a rate-limit error to PROVIDER_ERROR", async () => {
    mockReposLabelsList.mockRejectedValueOnce(
      new Error("GitHub GET /repos/o/r/labels failed: API rate limit exceeded"),
    );
    const err = await githubLabelsResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).toMatch(/rate limit/i);
  });

  it("maps an unexpected error to a generic PROVIDER_ERROR with no raw leak", async () => {
    mockReposLabelsList.mockRejectedValueOnce(
      new Error("secret-internal token=gho-decrypted-token boom"),
    );
    const err = await githubLabelsResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|gho-decrypted-token/);
    expect(err.message).toMatch(/couldn't load github labels/i);
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no token read, no fetch)", async () => {
    const err = await githubLabelsResolver
      .resolve(ctx({ integration: null }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockDecryptToken).not.toHaveBeenCalled();
    expect(mockReposLabelsList).not.toHaveBeenCalled();
  });
});
