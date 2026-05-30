/**
 * @jest-environment node
 *
 * Tests for the GitHub `new_commit` activation hook.
 *
 * Load-bearing for V2's V1-bug-fix: V1 silently fell back to
 * `GITHUB_CLIENT_SECRET` when `GITHUB_WEBHOOK_SECRET` was absent. V2
 * fails closed at activation time (the earliest possible point).
 */
const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockDecrypt = jest.fn();

jest.mock("@/integrations/_shared/github/api/webhooks", () => ({
  repoHooksCreate: (...args: unknown[]) => mockCreate(...args),
  repoHooksDelete: (...args: unknown[]) => mockDelete(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

import { activate } from "@/integrations/github/triggers/newCommit/activate";

beforeEach(() => {
  mockCreate.mockReset();
  mockDelete.mockReset();
  mockDecrypt.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.GITHUB_WEBHOOK_SECRET = "test-webhook-secret";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.GITHUB_WEBHOOK_URL;
  delete process.env.GITHUB_WEBHOOK_SECRET;
});

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "github",
  providerAccountId: "octocat",
  displayName: "octocat",
  accessTokenEncrypted: "ENC-USER",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["repo", "read:org", "gist"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "github",
  type: "new_commit",
  config: {
    repository: "octocat/hello",
  },
  position: { x: 0, y: 0 },
};

describe("github new_commit activate — happy path", () => {
  it("creates one repo webhook for the push event and persists hookId to config", async () => {
    mockCreate.mockResolvedValueOnce({ id: 999, events: ["push"] });
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]![0]!).toMatchObject({
      accessToken: "decrypted-ENC-USER",
      owner: "octocat",
      repo: "hello",
      events: ["push"],
      secret: "test-webhook-secret",
    });
    expect(result.hookId).toBe(999);
    expect(result.repository).toBe("octocat/hello");
    expect(result.owner).toBe("octocat");
    expect(result.repo).toBe("hello");
    expect(result.events).toEqual(["push"]);
    expect(result.webhookEnabled).toBe(true);
  });

  it("includes workflowId and nodeId in the notification URL (strict-direct-lookup)", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, events: ["push"] });
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-42",
    });
    const arg = mockCreate.mock.calls[0]![0]!;
    expect(arg.url).toBe(
      "https://app.example.test/api/webhooks/github?workflowId=wf-42&nodeId=node-trigger-1",
    );
  });

  it("returns notificationUrl in config payload (parity with shopify/stripe)", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, events: ["push"] });
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(result.notificationUrl).toContain("/api/webhooks/github");
    expect(result.notificationUrl).toContain("workflowId=wf");
    expect(result.notificationUrl).toContain("nodeId=node-trigger-1");
  });

  it("does NOT register a 'subscription-watch' marker (GitHub webhooks don't expire)", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, events: ["push"] });
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf",
    });
    // The renewal cron filters on `config.type === "subscription-watch"`.
    // GitHub MUST NOT carry this marker.
    expect(result.type).toBeUndefined();
  });

  it("uses GITHUB_WEBHOOK_URL override when set (e2e mock surface)", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, events: ["push"] });
    process.env.GITHUB_WEBHOOK_URL = "http://localhost:9884";
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(mockCreate.mock.calls[0]![0]!.url).toBe(
      "http://localhost:9884/api/webhooks/github?workflowId=wf&nodeId=node-trigger-1",
    );
  });

  it("strips trailing /api/webhooks/github from GITHUB_WEBHOOK_URL if user already added it", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, events: ["push"] });
    process.env.GITHUB_WEBHOOK_URL =
      "http://localhost:9884/api/webhooks/github";
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf",
    });
    // The URL is reconstructed without doubling.
    expect(mockCreate.mock.calls[0]![0]!.url).toBe(
      "http://localhost:9884/api/webhooks/github?workflowId=wf&nodeId=node-trigger-1",
    );
  });
});

describe("github new_commit activate — branch filter", () => {
  it("captures the branch filter when supplied", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, events: ["push"] });
    const result = await activate({
      node: { ...baseNode, config: { repository: "u/r", branch: "main" } },
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(result.branch).toBe("main");
  });

  it("stores branch=null when not supplied", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, events: ["push"] });
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(result.branch).toBeNull();
  });

  it("stores branch=null when supplied empty string", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, events: ["push"] });
    const result = await activate({
      node: { ...baseNode, config: { repository: "u/r", branch: "" } },
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(result.branch).toBeNull();
  });

  it("rejects non-string branch values", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { repository: "u/r", branch: 123 as unknown as string },
        },
        integration: baseIntegration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/branch must be a string/);
  });
});

describe("github new_commit activate — V1-bug-fix gates", () => {
  it("FAILS CLOSED when GITHUB_WEBHOOK_SECRET is missing (V1 silently used GITHUB_CLIENT_SECRET fallback)", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/GITHUB_WEBHOOK_SECRET env var is not set/);
    // Critically: no API call attempted.
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("github new_commit activate — schema validation", () => {
  it("rejects missing repository", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/repository is required/);
  });

  it("rejects empty repository", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { repository: "" } },
        integration: baseIntegration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/repository is required/);
  });

  it("rejects malformed repository (no slash)", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { repository: "no-slash" } },
        integration: baseIntegration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/owner\/repo/);
  });

  it("rejects repository with extra slash (owner/repo/extra)", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { repository: "u/r/extra" } },
        integration: baseIntegration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/owner\/repo/);
  });
});

describe("github new_commit activate — auth handling", () => {
  it("decrypts the integration's access token before calling create", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, events: ["push"] });
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(mockDecrypt).toHaveBeenCalledWith("ENC-USER");
    expect(mockCreate.mock.calls[0]![0]!.accessToken).toBe("decrypted-ENC-USER");
  });
});
