/**
 * @jest-environment node
 *
 * Tests for `create_repository` action handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUserReposCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/github/api/repos", () => ({
  userReposCreate: (...a: unknown[]) => mockUserReposCreate(...a),
}));

import { createRepository } from "@/integrations/github/actions/createRepository";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUserReposCreate.mockReset();
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

const baseRepo = {
  id: 5,
  name: "my-repo",
  full_name: "octocat/my-repo",
  description: "A test repo",
  private: false,
  html_url: "https://github.com/octocat/my-repo",
  clone_url: "https://github.com/octocat/my-repo.git",
  ssh_url: "git@github.com:octocat/my-repo.git",
  default_branch: "main",
  homepage: null,
};

describe("create_repository — happy path", () => {
  it("calls userReposCreate with name only when optional fields omitted", async () => {
    mockUserReposCreate.mockResolvedValueOnce(baseRepo);
    await createRepository({
      ...baseInput,
      config: { name: "my-repo" },
    });
    const arg = mockUserReposCreate.mock.calls[0]![0]!;
    expect(arg.name).toBe("my-repo");
    expect(arg.private).toBeUndefined();
    expect(arg.auto_init).toBeUndefined();
  });

  it("forwards all optional fields when supplied", async () => {
    mockUserReposCreate.mockResolvedValueOnce(baseRepo);
    await createRepository({
      ...baseInput,
      config: {
        name: "my-repo",
        description: "A test repo",
        private: true,
        auto_init: true,
        gitignore_template: "Node",
        license_template: "mit",
        homepage: "https://example.com",
      },
    });
    const arg = mockUserReposCreate.mock.calls[0]![0]!;
    expect(arg.description).toBe("A test repo");
    expect(arg.private).toBe(true);
    expect(arg.auto_init).toBe(true);
    expect(arg.gitignore_template).toBe("Node");
    expect(arg.license_template).toBe("mit");
    expect(arg.homepage).toBe("https://example.com");
  });

  it("returns canonical output shape", async () => {
    mockUserReposCreate.mockResolvedValueOnce(baseRepo);
    const result = await createRepository({
      ...baseInput,
      config: { name: "my-repo" },
    });
    expect(result.output).toEqual({
      repositoryId: 5,
      name: "my-repo",
      fullName: "octocat/my-repo",
      description: "A test repo",
      private: false,
      url: "https://github.com/octocat/my-repo",
      cloneUrl: "https://github.com/octocat/my-repo.git",
      sshUrl: "git@github.com:octocat/my-repo.git",
      defaultBranch: "main",
      homepage: null,
    });
  });

  it("maps null description / clone_url / ssh_url to null", async () => {
    mockUserReposCreate.mockResolvedValueOnce({
      ...baseRepo,
      description: null,
      clone_url: undefined,
      ssh_url: undefined,
    });
    const result = await createRepository({
      ...baseInput,
      config: { name: "x" },
    });
    expect(result.output.description).toBeNull();
    expect(result.output.cloneUrl).toBeNull();
    expect(result.output.sshUrl).toBeNull();
  });
});

describe("create_repository — refreshAndRetry wrapping", () => {
  it("calls refreshAndRetry with provider='github' and null accountId", async () => {
    mockUserReposCreate.mockResolvedValueOnce(baseRepo);
    await createRepository({
      ...baseInput,
      config: { name: "x" },
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("github");
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.providerAccountId).toBeNull();
  });
});

describe("create_repository — schema validation", () => {
  it("rejects missing name", async () => {
    await expect(
      createRepository({ ...baseInput, config: {} }),
    ).rejects.toThrow();
  });

  it("rejects empty name", async () => {
    await expect(
      createRepository({ ...baseInput, config: { name: "" } }),
    ).rejects.toThrow();
  });

  it("rejects names with spaces or illegal chars", async () => {
    await expect(
      createRepository({ ...baseInput, config: { name: "has spaces" } }),
    ).rejects.toThrow();
    await expect(
      createRepository({ ...baseInput, config: { name: "bad/slash" } }),
    ).rejects.toThrow();
  });

  it("rejects invalid homepage URL", async () => {
    await expect(
      createRepository({
        ...baseInput,
        config: { name: "x", homepage: "not-a-url" },
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown extra fields (strict schema)", async () => {
    await expect(
      createRepository({
        ...baseInput,
        config: { name: "x", extra: 1 },
      }),
    ).rejects.toThrow();
  });
});
