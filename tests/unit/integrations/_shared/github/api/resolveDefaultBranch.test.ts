/**
 * @jest-environment node
 *
 * Tests for `_shared/github/api/resolveDefaultBranch.ts` — the V2
 * shared PR-G6 helper that powers both `create_pull_request` and
 * `create_branch`.
 *
 * Load-bearing for V2's V1-bug-fix: V1 hard-defaulted source branch
 * to `'main'` for `create_branch`. Slice 14b extends the same
 * fail-closed auto-detect that V1 already had for `create_pull_request`.
 *
 * Mocks `reposGet` so we don't hit the network. Verifies:
 *   - Pass-through when the caller supplied a non-empty string.
 *   - Auto-detect (calls `reposGet`) when supplied is null /
 *     undefined / empty string.
 *   - Throws `RepoNotFoundForDefaultBranchError` on lookup failure.
 *   - Throws `EmptyDefaultBranchError` when the response's
 *     `default_branch` is empty / non-string.
 *   - **NEVER falls back to 'main'** (anti-test for V1's silent default).
 */
const mockReposGet = jest.fn();

jest.mock("@/integrations/_shared/github/api/repos", () => ({
  reposGet: (...args: unknown[]) => mockReposGet(...args),
}));

import {
  EmptyDefaultBranchError,
  RepoNotFoundForDefaultBranchError,
  resolveDefaultBranch,
} from "@/integrations/_shared/github/api/resolveDefaultBranch";

beforeEach(() => mockReposGet.mockReset());

describe("resolveDefaultBranch — pass-through", () => {
  it("returns the supplied value unchanged when non-empty string", async () => {
    const result = await resolveDefaultBranch({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      supplied: "develop",
    });
    expect(result).toBe("develop");
    // No reposGet call — we trust the supplied value.
    expect(mockReposGet).not.toHaveBeenCalled();
  });

  it("does NOT auto-detect when caller supplied a non-empty string", async () => {
    await resolveDefaultBranch({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      supplied: "trunk",
    });
    expect(mockReposGet).not.toHaveBeenCalled();
  });
});

describe("resolveDefaultBranch — auto-detect", () => {
  it("calls reposGet when supplied is null", async () => {
    mockReposGet.mockResolvedValueOnce({
      default_branch: "develop",
      full_name: "u/r",
    });
    const result = await resolveDefaultBranch({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      supplied: null,
    });
    expect(result).toBe("develop");
    expect(mockReposGet).toHaveBeenCalledWith({
      accessToken: "tok",
      owner: "u",
      repo: "r",
    });
  });

  it("calls reposGet when supplied is undefined", async () => {
    mockReposGet.mockResolvedValueOnce({
      default_branch: "master",
      full_name: "u/r",
    });
    const result = await resolveDefaultBranch({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      supplied: undefined,
    });
    expect(result).toBe("master");
  });

  it("calls reposGet when supplied is empty string", async () => {
    mockReposGet.mockResolvedValueOnce({
      default_branch: "trunk",
      full_name: "u/r",
    });
    const result = await resolveDefaultBranch({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      supplied: "",
    });
    expect(result).toBe("trunk");
  });

  it("returns the auto-detected branch verbatim (no transformation)", async () => {
    mockReposGet.mockResolvedValueOnce({
      default_branch: "Main",
      full_name: "u/r",
    });
    const result = await resolveDefaultBranch({
      accessToken: "tok",
      owner: "u",
      repo: "r",
      supplied: null,
    });
    expect(result).toBe("Main"); // No lowercasing, no munging.
  });
});

describe("resolveDefaultBranch — failure modes (fail-closed contract)", () => {
  it("throws RepoNotFoundForDefaultBranchError when reposGet throws", async () => {
    mockReposGet.mockRejectedValueOnce(new Error("404 Not Found"));
    await expect(
      resolveDefaultBranch({
        accessToken: "tok",
        owner: "u",
        repo: "missing",
        supplied: null,
      }),
    ).rejects.toBeInstanceOf(RepoNotFoundForDefaultBranchError);
  });

  it("captures owner / repo / cause on RepoNotFoundForDefaultBranchError", async () => {
    const cause = new Error("boom");
    mockReposGet.mockRejectedValueOnce(cause);
    let captured: RepoNotFoundForDefaultBranchError | null = null;
    try {
      await resolveDefaultBranch({
        accessToken: "tok",
        owner: "u",
        repo: "missing",
        supplied: null,
      });
    } catch (e) {
      captured = e as RepoNotFoundForDefaultBranchError;
    }
    expect(captured).toBeInstanceOf(RepoNotFoundForDefaultBranchError);
    expect(captured!.owner).toBe("u");
    expect(captured!.repo).toBe("missing");
    expect(captured!.cause).toBe(cause);
  });

  it("throws EmptyDefaultBranchError when reposGet returns empty default_branch", async () => {
    mockReposGet.mockResolvedValueOnce({
      default_branch: "",
      full_name: "u/r",
    });
    await expect(
      resolveDefaultBranch({
        accessToken: "tok",
        owner: "u",
        repo: "r",
        supplied: null,
      }),
    ).rejects.toBeInstanceOf(EmptyDefaultBranchError);
  });

  it("throws EmptyDefaultBranchError when reposGet returns non-string default_branch", async () => {
    // Defensive — if GitHub's response shape changes.
    mockReposGet.mockResolvedValueOnce({
      default_branch: null,
      full_name: "u/r",
    });
    await expect(
      resolveDefaultBranch({
        accessToken: "tok",
        owner: "u",
        repo: "r",
        supplied: null,
      }),
    ).rejects.toBeInstanceOf(EmptyDefaultBranchError);
  });

  it("NEVER falls back to literal 'main' on lookup failure (V1 bug fix)", async () => {
    // Anti-test for V1 [`github.ts:465`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L465)
    // which silently defaulted createBranch's sourceBranch to "main".
    // V2 fail-closes — better to error than to PR/branch against the
    // wrong base.
    mockReposGet.mockRejectedValueOnce(new Error("404"));
    let result: string | null = null;
    try {
      result = await resolveDefaultBranch({
        accessToken: "tok",
        owner: "u",
        repo: "missing",
        supplied: null,
      });
    } catch {
      // Expected.
    }
    expect(result).toBeNull(); // Never returned a fallback value.
  });
});
