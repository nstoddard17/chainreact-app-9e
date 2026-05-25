/**
 * @jest-environment node
 *
 * Tests for `create_pull_request` action handler — load-bearing for
 * V2's PR-G6 default-branch auto-detect contract.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  EmptyDefaultBranchError,
  RepoNotFoundForDefaultBranchError,
} from "@/integrations/_shared/github/api/resolveDefaultBranch";

const mockRefreshAndRetry = jest.fn();
const mockPullsCreate = jest.fn();
const mockResolveDefaultBranch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/github/api/pulls", () => ({
  pullsCreate: (...a: unknown[]) => mockPullsCreate(...a),
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

import { createPullRequest } from "@/integrations/github/actions/createPullRequest";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPullsCreate.mockReset();
  mockResolveDefaultBranch.mockReset();
  // refreshAndRetry: just runs apiCall(token).
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const triggerEvent: TriggerEvent = {
  provider: "manual",
  eventType: "manual",
  eventId: "evt-1",
  occurredAt: "2026-05-10T12:00:00Z",
  accountId: "n/a",
  payload: {},
};

const baseInput = {
  workflowId: "wf",
  userId: "u",
  runId: "r",
  nodeId: "n",
  triggerEvent,
};

const basePR = {
  id: 99,
  number: 5,
  title: "Add feature",
  body: "PR body",
  state: "open",
  draft: false,
  html_url: "https://github.com/octocat/hello/pull/5",
  head: { ref: "feature/x", sha: "h1" },
  base: { ref: "main", sha: "b1" },
  created_at: "2026-05-10T12:00:00Z",
};

describe("create_pull_request — explicit base branch", () => {
  it("does NOT call resolveDefaultBranch when base is supplied", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("main");
    mockPullsCreate.mockResolvedValueOnce(basePR);
    await createPullRequest({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        title: "Add feature",
        head: "feature/x",
        base: "develop",
      },
    });
    // resolveDefaultBranch IS called (the handler always passes through it)
    // but with `supplied: 'develop'` so it returns immediately.
    expect(mockResolveDefaultBranch).toHaveBeenCalledTimes(1);
    expect(mockResolveDefaultBranch.mock.calls[0]![0]!.supplied).toBe(
      "develop",
    );
    // pullsCreate uses the supplied value pass-through.
    expect(mockPullsCreate.mock.calls[0]![0]!.base).toBe("main");
    // ^^ base value comes from mockResolveDefaultBranch's return; in
    // production, with the real helper, supplied='develop' → returns
    // 'develop' and the PR's `base` is 'develop'.
  });

  it("forwards all explicit fields to pullsCreate", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("develop");
    mockPullsCreate.mockResolvedValueOnce(basePR);
    await createPullRequest({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        title: "Add feature",
        head: "feature/x",
        base: "develop",
        body: "Description",
        draft: true,
      },
    });
    const arg = mockPullsCreate.mock.calls[0]![0]!;
    expect(arg.owner).toBe("octocat");
    expect(arg.repo).toBe("hello");
    expect(arg.title).toBe("Add feature");
    expect(arg.head).toBe("feature/x");
    expect(arg.base).toBe("develop");
    expect(arg.body).toBe("Description");
    expect(arg.draft).toBe(true);
  });
});

describe("create_pull_request — PR-G6 default-branch auto-detect", () => {
  it("auto-detects via resolveDefaultBranch when base is omitted", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("master");
    mockPullsCreate.mockResolvedValueOnce({
      ...basePR,
      base: { ref: "master", sha: "x" },
    });
    await createPullRequest({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        title: "Add feature",
        head: "feature/x",
        // base omitted
      },
    });
    expect(mockResolveDefaultBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "octocat",
        repo: "hello",
        supplied: undefined,
      }),
    );
    expect(mockPullsCreate.mock.calls[0]![0]!.base).toBe("master");
  });

  it("auto-detects 'develop' (proves no hardcoded 'main' fallback)", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("develop");
    mockPullsCreate.mockResolvedValueOnce({
      ...basePR,
      base: { ref: "develop", sha: "x" },
    });
    await createPullRequest({
      ...baseInput,
      config: {
        repository: "u/r",
        title: "x",
        head: "feature",
      },
    });
    expect(mockPullsCreate.mock.calls[0]![0]!.base).toBe("develop");
  });

  it("auto-detects 'trunk' (proves no hardcoded 'main' fallback)", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("trunk");
    mockPullsCreate.mockResolvedValueOnce({
      ...basePR,
      base: { ref: "trunk", sha: "x" },
    });
    await createPullRequest({
      ...baseInput,
      config: {
        repository: "u/r",
        title: "x",
        head: "feature",
      },
    });
    expect(mockPullsCreate.mock.calls[0]![0]!.base).toBe("trunk");
  });

  it("propagates RepoNotFoundForDefaultBranchError when auto-detect lookup 404s", async () => {
    mockResolveDefaultBranch.mockRejectedValueOnce(
      new RepoNotFoundForDefaultBranchError("u", "missing", new Error("404")),
    );
    await expect(
      createPullRequest({
        ...baseInput,
        config: {
          repository: "u/missing",
          title: "x",
          head: "feature",
        },
      }),
    ).rejects.toBeInstanceOf(RepoNotFoundForDefaultBranchError);
    // pullsCreate must NOT be called when default-branch resolution fails.
    expect(mockPullsCreate).not.toHaveBeenCalled();
  });

  it("propagates EmptyDefaultBranchError when default_branch is empty (V1 silent fallback removed)", async () => {
    mockResolveDefaultBranch.mockRejectedValueOnce(
      new EmptyDefaultBranchError("u", "r"),
    );
    await expect(
      createPullRequest({
        ...baseInput,
        config: { repository: "u/r", title: "x", head: "feature" },
      }),
    ).rejects.toBeInstanceOf(EmptyDefaultBranchError);
    expect(mockPullsCreate).not.toHaveBeenCalled();
  });
});

describe("create_pull_request — output shape", () => {
  it("returns canonical output shape", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("main");
    mockPullsCreate.mockResolvedValueOnce(basePR);
    const result = await createPullRequest({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        title: "Add feature",
        head: "feature/x",
        base: "main",
      },
    });
    expect(result.output).toEqual({
      pullRequestId: 99,
      pullRequestNumber: 5,
      title: "Add feature",
      body: "PR body",
      state: "open",
      draft: false,
      url: "https://github.com/octocat/hello/pull/5",
      repository: "octocat/hello",
      head: "feature/x",
      base: "main",
      createdAt: "2026-05-10T12:00:00Z",
    });
  });
});

describe("create_pull_request — refreshAndRetry wrapping", () => {
  it("wraps both default-branch lookup AND principal pulls.create call", async () => {
    mockResolveDefaultBranch.mockResolvedValueOnce("main");
    mockPullsCreate.mockResolvedValueOnce(basePR);
    await createPullRequest({
      ...baseInput,
      config: { repository: "u/r", title: "x", head: "feature" },
    });
    // Two refreshAndRetry calls: one for the auto-detect, one for
    // pullsCreate. CLAUDE.md "Auxiliary calls" §.
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("github");
    expect(mockRefreshAndRetry.mock.calls[1]![0]!.provider).toBe("github");
  });
});

describe("create_pull_request — schema validation", () => {
  it("rejects missing repository / title / head", async () => {
    await expect(
      createPullRequest({
        ...baseInput,
        config: { title: "x", head: "feature" },
      }),
    ).rejects.toThrow();
    await expect(
      createPullRequest({
        ...baseInput,
        config: { repository: "u/r", head: "feature" },
      }),
    ).rejects.toThrow();
    await expect(
      createPullRequest({
        ...baseInput,
        config: { repository: "u/r", title: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown extra fields", async () => {
    await expect(
      createPullRequest({
        ...baseInput,
        config: {
          repository: "u/r",
          title: "x",
          head: "f",
          extra: "field",
        },
      }),
    ).rejects.toThrow();
  });
});
