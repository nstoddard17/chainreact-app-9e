/**
 * @jest-environment node
 *
 * github options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockReposAssigneesList = jest.fn();
const mockDecryptToken = jest.fn<string, [string]>();
const mockReposBranchesList = jest.fn();
const mockReposLabelsList = jest.fn();
const mockUserReposList = jest.fn();

jest.mock("@/integrations/_shared/github/api/repos", () => ({
  __esModule: true,
  reposAssigneesList: (...args: unknown[]) => mockReposAssigneesList(...args),
  reposBranchesList: (...args: unknown[]) => mockReposBranchesList(...args),
  reposLabelsList: (...args: unknown[]) => mockReposLabelsList(...args),
  userReposList: (...args: unknown[]) => mockUserReposList(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { githubAssigneesResolver } from "@/integrations/github/options/assignees";
import { NotFoundError } from "@/integrations/_shared/github/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { githubBranchesResolver } from "@/integrations/github/options/branches";
import { githubLabelsResolver } from "@/integrations/github/options/labels";
import { githubReposResolver } from "@/integrations/github/options/repos";

// ---------------------------------------------------------------------------
// Merged from the former assignees.test.ts
// Tests for `integrations/github/options/assignees.ts` — RESOLVERS-1.
// Pin:
// - Canonical source / provider / requiresIntegration / requiredDeps shape.
// - Decrypts the token + splits the `repository` dep into owner/repo.
// - Maps login → {value,label}; value is the LOGIN (what
// `create_issue.assignees` stores), never a numeric user id.
// - NO collaborator PII: real names / emails / avatar URLs present on the
// wire payload never reach an option (the wrapper only surfaces `login`).
// - Case-insensitive `q` filter + alpha sort; hasMore from `truncated`.
// - Malformed `repository` dep → empty items (mid-manual-entry, not error).
// - Repo 404 → empty items (cascade fallback).
// - 401 → PROVIDER_REAUTH_REQUIRED (GitHub non-refreshable); rate-limit /
// other → PROVIDER_ERROR. Leak-free: no token / raw body in the message.
// - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
// ---------------------------------------------------------------------------
describe("assignees (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former branches.test.ts
// Tests for `integrations/github/options/branches.ts` — RESOLVERS-1.
// Pin:
// - Canonical source / provider / requiresIntegration / requiredDeps shape.
// - Decrypts the token + splits the `repository` dep into owner/repo.
// - Maps branch name → {value,label} (+ Protected hint); labels carry NO
// commit SHAs / URLs / payload fields.
// - Case-insensitive `q` filter + alpha sort; hasMore from `truncated`.
// - Malformed `repository` dep → empty items (mid-manual-entry, not error).
// - Repo 404 → empty items (cascade fallback).
// - 401 → PROVIDER_REAUTH_REQUIRED (GitHub non-refreshable); rate-limit /
// other → PROVIDER_ERROR. Leak-free: no token / raw body in the message.
// - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
// ---------------------------------------------------------------------------
describe("branches (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former labels.test.ts
// Tests for `integrations/github/options/labels.ts` — RESOLVERS-1.
// Pin:
// - Canonical source / provider / requiresIntegration / requiredDeps shape.
// - Decrypts the token + splits the `repository` dep into owner/repo.
// - Maps label name → {value,label}; value is the NAME (what
// `create_issue.labels` stores), never a numeric label id.
// - Labels carry NO colors / descriptions / ids / URLs.
// - Case-insensitive `q` filter + alpha sort; hasMore from `truncated`.
// - Malformed `repository` dep → empty items (mid-manual-entry, not error).
// - Repo 404 → empty items (cascade fallback).
// - 401 → PROVIDER_REAUTH_REQUIRED (GitHub non-refreshable); rate-limit /
// other → PROVIDER_ERROR. Leak-free: no token / raw body in the message.
// - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
// ---------------------------------------------------------------------------
describe("labels (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former repos.test.ts
// Tests for `integrations/github/options/repos.ts` — Slice ANALYTICS-SOURCES-GITHUB-UI-3.
// Pin:
// - Canonical source / provider / requiresIntegration shape.
// - Decrypts the token once + maps full_name → {value,label} (+ Private hint).
// - Case-insensitive `q` filter on full_name; hasMore from the helper's truncated.
// - 401 → PROVIDER_REAUTH_REQUIRED (GitHub non-refreshable); rate-limit / other →
// PROVIDER_ERROR. Leak-free: no token / raw body in the message.
// - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
// ---------------------------------------------------------------------------
describe("repos (options)", () => {

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

});
