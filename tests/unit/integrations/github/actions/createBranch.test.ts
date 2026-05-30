/**
 * @jest-environment node
 *
 * Tests for `create_branch` action handler.
 *
 * Load-bearing for V2's V1-bug-fix: V1
 * [`github.ts:465`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L465)
 * silently defaulted `sourceBranch = "main"`. V2 extends PR-G6's
 * fail-closed default-branch auto-detect to source-branch resolution.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  EmptyDefaultBranchError,
  RepoNotFoundForDefaultBranchError,
} from "@/integrations/_shared/github/api/resolveDefaultBranch";

const mockRefreshAndRetry = jest.fn();
const mockGitRefGet = jest.fn();
const mockGitRefsCreate = jest.fn();
const mockResolveDefaultBranch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/github/api/repos", () => ({
  gitRefGet: (...a: unknown[]) => mockGitRefGet(...a),
  gitRefsCreate: (...a: unknown[]) => mockGitRefsCreate(...a),
}));

jest.mock("@/integrations/_shared/github/api/resolveDefaultBranch", () => {
  const actual = jest.requireActual(
    "@/integrations/_shared/github/api/resolveDefaultBranch",
  );
  return {
    ...actual,
    resolveDefaultBranch: (...a: unknown[]) => mockResolveDefaultBranch(...a),
  };
});

import { createBranch } from "@/integrations/github/actions/createBranch";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGitRefGet.mockReset();
  mockGitRefsCreate.mockReset();
  mockResolveDefaultBranch.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const triggerEvent: TriggerEvent = {
  provider: "manual",
  eventType: "manual",
  eventId: "evt-1",
  occurredAt: "2026-05-10T12:00:00Z",
  providerAccountId: "n/a",
  payload: {},
};

const baseInput = {
  workflowId: "wf",
  userId: "u",
  accountId: "acct-u",
  runId: "r",
  nodeId: "n",
  triggerEvent,
};

const sourceRef = {
  ref: "refs/heads/main",
  url: "x",
  object: { sha: "abc123def", type: "commit" },
};

const newRef = {
  ref: "refs/heads/feature/x",
  url: "x",
  object: { sha: "abc123def" },
};

describe("create_branch — explicit source branch", () => {
  it("uses the supplied sourceBranch and looks up its SHA", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("develop");
    mockGitRefGet.mockResolvedValueOnce(sourceRef);
    mockGitRefsCreate.mockResolvedValueOnce(newRef);
    await createBranch({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        branchName: "feature/x",
        sourceBranch: "develop",
      },
    });
    // resolveDefaultBranch is called with supplied: 'develop' —
    // pass-through.
    expect(mockResolveDefaultBranch.mock.calls[0]![0]!.supplied).toBe(
      "develop",
    );
    // gitRefGet is called with the resolved branch (mock returns 'develop').
    expect(mockGitRefGet.mock.calls[0]![0]!.branch).toBe("develop");
  });
});

describe("create_branch — PR-G6 extension auto-detect (V2 fix)", () => {
  it("auto-detects via resolveDefaultBranch when sourceBranch is omitted", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("master");
    mockGitRefGet.mockResolvedValueOnce(sourceRef);
    mockGitRefsCreate.mockResolvedValueOnce(newRef);
    await createBranch({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        branchName: "feature/x",
        // sourceBranch omitted
      },
    });
    expect(mockResolveDefaultBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "octocat",
        repo: "hello",
        supplied: undefined,
      }),
    );
    expect(mockGitRefGet.mock.calls[0]![0]!.branch).toBe("master");
  });

  it("auto-detects 'develop' (proves no V1 'main' fallback)", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("develop");
    mockGitRefGet.mockResolvedValueOnce(sourceRef);
    mockGitRefsCreate.mockResolvedValueOnce(newRef);
    await createBranch({
      ...baseInput,
      config: { repository: "u/r", branchName: "feature/x" },
    });
    expect(mockGitRefGet.mock.calls[0]![0]!.branch).toBe("develop");
  });

  it("propagates RepoNotFoundForDefaultBranchError when auto-detect 404s", async () => {
    mockResolveDefaultBranch.mockRejectedValueOnce(
      new RepoNotFoundForDefaultBranchError("u", "missing", new Error("404")),
    );
    await expect(
      createBranch({
        ...baseInput,
        config: { repository: "u/missing", branchName: "x" },
      }),
    ).rejects.toBeInstanceOf(RepoNotFoundForDefaultBranchError);
    expect(mockGitRefGet).not.toHaveBeenCalled();
    expect(mockGitRefsCreate).not.toHaveBeenCalled();
  });

  it("propagates EmptyDefaultBranchError when auto-detect returns empty default_branch", async () => {
    mockResolveDefaultBranch.mockRejectedValueOnce(
      new EmptyDefaultBranchError("u", "r"),
    );
    await expect(
      createBranch({
        ...baseInput,
        config: { repository: "u/r", branchName: "x" },
      }),
    ).rejects.toBeInstanceOf(EmptyDefaultBranchError);
  });
});

describe("create_branch — three-phase call sequence", () => {
  it("calls resolveDefaultBranch → gitRefGet → gitRefsCreate in order", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("main");
    mockGitRefGet.mockResolvedValueOnce(sourceRef);
    mockGitRefsCreate.mockResolvedValueOnce(newRef);

    await createBranch({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        branchName: "feature/x",
        sourceBranch: "main",
      },
    });

    // 3 refreshAndRetry calls — one per phase.
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(3);

    // gitRefsCreate gets the SHA from gitRefGet.
    expect(mockGitRefsCreate.mock.calls[0]![0]!).toEqual({
      accessToken: "tok",
      owner: "octocat",
      repo: "hello",
      branchName: "feature/x",
      sha: "abc123def",
    });
  });
});

describe("create_branch — output shape", () => {
  it("returns canonical output shape", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("main");
    mockGitRefGet.mockResolvedValueOnce(sourceRef);
    mockGitRefsCreate.mockResolvedValueOnce(newRef);
    const result = await createBranch({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        branchName: "feature/x",
        sourceBranch: "main",
      },
    });
    expect(result.output).toEqual({
      ref: "refs/heads/feature/x",
      branchName: "feature/x",
      sha: "abc123def",
      repository: "octocat/hello",
      sourceBranch: "main",
      url: "https://github.com/octocat/hello/tree/feature/x",
    });
  });

  it("output.sourceBranch reflects the auto-detected value when default-branch was used", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("trunk");
    mockGitRefGet.mockResolvedValueOnce(sourceRef);
    mockGitRefsCreate.mockResolvedValueOnce({
      ref: "refs/heads/feature",
      url: "x",
      object: { sha: "abc" },
    });
    const result = await createBranch({
      ...baseInput,
      config: { repository: "u/r", branchName: "feature" },
    });
    // sourceBranch in the output is the *resolved* value, not the
    // (omitted) input — workflow author can chain
    // `{{nodeId.sourceBranch}}` and get the truth.
    expect(result.output.sourceBranch).toBe("trunk");
  });
});

describe("create_branch — schema validation", () => {
  it("rejects missing repository / branchName", async () => {
    await expect(
      createBranch({ ...baseInput, config: { branchName: "x" } }),
    ).rejects.toThrow();
    await expect(
      createBranch({ ...baseInput, config: { repository: "u/r" } }),
    ).rejects.toThrow();
  });

  it("rejects branchName starting with '-'", async () => {
    await expect(
      createBranch({
        ...baseInput,
        config: { repository: "u/r", branchName: "-bad" },
      }),
    ).rejects.toThrow();
  });

  it("rejects branchName ending with '/'", async () => {
    await expect(
      createBranch({
        ...baseInput,
        config: { repository: "u/r", branchName: "foo/" },
      }),
    ).rejects.toThrow();
  });

  it("rejects branchName ending with '.lock'", async () => {
    await expect(
      createBranch({
        ...baseInput,
        config: { repository: "u/r", branchName: "feature.lock" },
      }),
    ).rejects.toThrow();
  });

  it("rejects branchName containing '..'", async () => {
    await expect(
      createBranch({
        ...baseInput,
        config: { repository: "u/r", branchName: "foo..bar" },
      }),
    ).rejects.toThrow();
  });

  it("accepts feature/x style nested branch names", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("main");
    mockGitRefGet.mockResolvedValueOnce(sourceRef);
    mockGitRefsCreate.mockResolvedValueOnce(newRef);
    await expect(
      createBranch({
        ...baseInput,
        config: { repository: "u/r", branchName: "feature/abc-123" },
      }),
    ).resolves.toBeDefined();
  });
});
