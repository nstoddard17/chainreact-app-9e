/**
 * @jest-environment node
 *
 * github/triggers/newCommit trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockDecrypt = jest.fn();
const mockFindByWorkflowAndNode = jest.fn();

jest.mock("@/integrations/_shared/github/api/webhooks", () => ({
  repoHooksCreate: (...args: unknown[]) => mockCreate(...args),
  repoHooksDelete: (...args: unknown[]) => mockDelete(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) =>
    mockFindByWorkflowAndNode(...args),
}));

import { activate } from "@/integrations/github/triggers/newCommit/activate";
import { NotFoundError } from "@/integrations/_shared/github/errors";
import { deactivate } from "@/integrations/github/triggers/newCommit/deactivate";
import "@/integrations/github/triggers/newCommit";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { GITHUB_TRIGGER_EVENT_TYPE, normalizeGitHubEvent, type GitHubHeaders } from "@/integrations/github/triggers/newCommit/normalize";
import { createHmac } from "node:crypto";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { MissingSecretError, receiveGitHubWebhook } from "@/integrations/github/triggers/newCommit/receive";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Tests for the GitHub `new_commit` activation hook.
// Load-bearing for V2's V1-bug-fix: V1 silently fell back to
// `GITHUB_CLIENT_SECRET` when `GITHUB_WEBHOOK_SECRET` was absent. V2
// fails closed at activation time (the earliest possible point).
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// Tests for the GitHub `new_commit` deactivation hook.
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockDelete.mockReset();
  mockDecrypt.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
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
  scopes: ["repo"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(overrides: Record<string, unknown> = {}) {
  return {
    id: "trig-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "github",
    eventType: "new_commit",
    nodeId: "node-trigger-1",
    providerAccountId: "octocat",
    config: {
      owner: "octocat",
      repo: "hello",
      hookId: 12345,
      ...overrides,
    },
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("github new_commit deactivate — happy path", () => {
  it("DELETEs the repo webhook by hookId from config", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    await deactivate({ trigger: trigger(), integration: baseIntegration });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0]![0]!).toEqual({
      accessToken: "decrypted-ENC-USER",
      owner: "octocat",
      repo: "hello",
      hookId: 12345,
    });
  });
});

describe("github new_commit deactivate — best-effort failure modes", () => {
  it("swallows NotFoundError (webhook already deleted server-side)", async () => {
    mockDelete.mockRejectedValueOnce(
      new NotFoundError("webhook 12345 on octocat/hello"),
    );
    await expect(
      deactivate({ trigger: trigger(), integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("swallows Unauthorized401Error (user revoked OAuth App)", async () => {
    class Unauthorized401Error extends Error {
      constructor(msg = "401") {
        super(msg);
        this.name = "Unauthorized401Error";
      }
    }
    mockDelete.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(
      deactivate({ trigger: trigger(), integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (5xx etc.) so the orchestrator can log", async () => {
    mockDelete.mockRejectedValueOnce(new Error("boom: 503"));
    await expect(
      deactivate({ trigger: trigger(), integration: baseIntegration }),
    ).rejects.toThrow(/boom: 503/);
  });
});

describe("github new_commit deactivate — defensive skips", () => {
  it("skips silently when config.hookId is missing (early test fixture / partial-rollback)", async () => {
    const t = trigger();
    // Strip hookId.
    (t.config as Record<string, unknown>).hookId = undefined;
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("skips silently when config.owner is missing", async () => {
    const t = trigger();
    (t.config as Record<string, unknown>).owner = undefined;
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("skips silently when config.repo is missing", async () => {
    const t = trigger();
    (t.config as Record<string, unknown>).repo = undefined;
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("skips silently when hookId is not a number (corrupted config)", async () => {
    const t = trigger();
    (t.config as Record<string, unknown>).hookId = "not-a-number";
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Tests for the GitHub `new_commit` trigger module-init registration.
// Importing the module force-registers the activation + deactivation
// hooks. Verifies BOTH are registered AND that no
// subscription-renewal handler is registered (GitHub repo webhooks
// don't expire — the renewal cron filters on
// `config.type === "subscription-watch"` and the activate hook
// intentionally omits that marker).
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

describe("GitHub new_commit registration", () => {
  it("registers activation under (provider='github', eventType='new_commit')", () => {
    expect(findActivation("github", "new_commit")).not.toBeNull();
  });

  it("registers deactivation under (provider='github', eventType='new_commit')", () => {
    expect(findDeactivation("github", "new_commit")).not.toBeNull();
  });

  it("does NOT register a subscription-renewal handler that handles GitHub rows (webhooks don't expire)", async () => {
    // The `runRenewals` cron iterates rows whose JSONB config marks
    // them as `type: "subscription-watch"`. GitHub's activate hook
    // intentionally omits that marker, so no row will ever look like
    // a GitHub subscription-watch candidate. Defense-in-depth: even
    // if someone passed a fake row with our provider id, NO
    // subscription handler should claim it.
    const { findSubscriptionHandler } = await import(
      "@/services/triggers/subscriptionRegistry"
    );
    const fakeGithubRow = {
      id: "x",
      workflowId: "wf",
      workflowAccountId: "acct-wf",
      userId: "u",
      provider: "github",
      eventType: "new_commit",
      nodeId: "n",
      // Even if a corrupted row carries the marker, no GitHub-specific
      // handler should match.
      config: { type: "subscription-watch", repository: "u/r" },
      providerAccountId: "u",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const handler = findSubscriptionHandler(fakeGithubRow);
    // Some handler may match the marker generically (Google
    // Calendar's canHandle is broad). This test asserts that NO
    // GitHub-specific handler exists in the registry — i.e. if a
    // handler matches, it isn't ours.
    if (handler !== null) {
      expect(handler.id.toLowerCase()).not.toContain("github");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Tests for `normalizeGitHubEvent` — converts a GitHub push delivery
// to V2's canonical `TriggerEvent` shape.
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const baseHeaders: GitHubHeaders = {
  eventName: "push",
  deliveryId: "12345-67890",
  hookId: "999",
};

const basePushBody = {
  ref: "refs/heads/main",
  before: "abc123",
  after: "def456",
  repository: {
    full_name: "octocat/hello",
    name: "hello",
    owner: { login: "octocat" },
  },
  head_commit: {
    id: "def456",
    message: "Initial commit",
    timestamp: "2026-05-10T12:00:00Z",
    author: { name: "Alice", email: "alice@example.com" },
  },
  commits: [
    { id: "def456", message: "Initial commit" },
  ],
  pusher: { name: "alice" },
  sender: { login: "alice", id: 1 },
};

describe("normalizeGitHubEvent — shape", () => {
  it("returns provider='github' and eventType='new_commit'", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: basePushBody,
    });
    expect(result.provider).toBe("github");
    expect(result.eventType).toBe("new_commit");
    expect(GITHUB_TRIGGER_EVENT_TYPE).toBe("new_commit");
  });

  it("uses X-GitHub-Delivery as eventId (preferred dedup key)", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: basePushBody,
    });
    expect(result.eventId).toBe("12345-67890");
  });

  it("derives a fallback eventId when X-GitHub-Delivery is absent", () => {
    const result = normalizeGitHubEvent({
      headers: { ...baseHeaders, deliveryId: null },
      body: basePushBody,
    });
    // Fallback: ${repo}:${event}:${head_commit.id}
    expect(result.eventId).toBe("octocat/hello:push:def456");
  });

  it("falls back to ref when head_commit.id is also absent", () => {
    const body = {
      ref: "refs/heads/main",
      repository: { full_name: "u/r", owner: { login: "u" } },
    };
    const result = normalizeGitHubEvent({
      headers: { ...baseHeaders, deliveryId: null },
      body,
    });
    expect(result.eventId).toBe("u/r:push:refs/heads/main");
  });

  it("uses head_commit.timestamp as occurredAt", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: basePushBody,
    });
    expect(result.occurredAt).toBe("2026-05-10T12:00:00Z");
  });

  it("falls back to now() when head_commit.timestamp is missing", () => {
    const before = new Date().toISOString();
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: { ...basePushBody, head_commit: { id: "x" } },
    });
    expect(result.occurredAt >= before).toBe(true);
  });

  it("uses repository.owner.login as accountId (stable per-repo)", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: basePushBody,
    });
    expect(result.providerAccountId).toBe("octocat");
  });

  it("falls back to extracting owner from full_name when owner.login is absent", () => {
    const body = {
      ...basePushBody,
      repository: { full_name: "myorg/repo" },
    };
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body,
    });
    expect(result.providerAccountId).toBe("myorg");
  });

  it("uses 'unknown' accountId when no owner can be determined", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: { ref: "refs/heads/main" },
    });
    expect(result.providerAccountId).toBe("unknown");
  });
});

describe("normalizeGitHubEvent — payload shape", () => {
  it("surfaces eventName / deliveryId / hookId from headers", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: basePushBody,
    });
    expect(result.payload.eventName).toBe("push");
    expect(result.payload.deliveryId).toBe("12345-67890");
    expect(result.payload.hookId).toBe("999");
  });

  it("strips refs/heads/ from branch", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: basePushBody,
    });
    expect(result.payload.branch).toBe("main");
  });

  it("preserves ref verbatim when it doesn't start with refs/heads/ (tag pushes)", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: { ...basePushBody, ref: "refs/tags/v1.0.0" },
    });
    expect(result.payload.branch).toBe("refs/tags/v1.0.0");
    expect(result.payload.ref).toBe("refs/tags/v1.0.0");
  });

  it("forwards before / after / pusher / sender / head_commit / commits", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: basePushBody,
    });
    expect(result.payload.before).toBe("abc123");
    expect(result.payload.after).toBe("def456");
    expect(result.payload.pusher).toEqual({ name: "alice" });
    expect(result.payload.sender).toEqual({ login: "alice", id: 1 });
    expect(result.payload.head_commit).toEqual(basePushBody.head_commit);
    expect(result.payload.commits).toEqual(basePushBody.commits);
  });

  it("forwards the raw body so workflows can drill into untyped fields", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: basePushBody,
    });
    expect(result.payload.body).toBe(basePushBody);
  });

  it("returns empty commits array when body.commits is missing", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: { ...basePushBody, commits: undefined },
    });
    expect(result.payload.commits).toEqual([]);
  });

  it("returns null for repository / owner / branch when not derivable", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: {},
    });
    expect(result.payload.repository).toBeNull();
    expect(result.payload.owner).toBeNull();
    expect(result.payload.branch).toBeNull();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former receive.test.ts
// Tests for `receiveGitHubWebhook` — verify-and-parse helper the route
// delegates to. Mocks the trigger_resources repo so we exercise:
// - Strict-direct-lookup query-param requirement.
// - Signature verification (delegates to verifyGitHubSignature).
// - Missing X-GitHub-Event header.
// - GitHub `ping` handshake event.
// - Unsupported event types (anything other than `push`).
// - Branch filter.
// - Normalize → TriggerEvent shape.
// - V2 V1-bug-fix: missing secret throws MissingSecretError so
// route can map to 503.
// ---------------------------------------------------------------------------
describe("receive (lifecycle)", () => {

const SECRET = "test-webhook-secret";

function signBody(body: string, secret: string = SECRET): string {
  const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${hex}`;
}

beforeEach(() => {
  mockFindByWorkflowAndNode.mockReset();
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
});

function reqWith(opts: {
  query?: string;
  body?: string;
  signature?: string | null;
  event?: string | null;
  delivery?: string | null;
  hookId?: string | null;
}): Request {
  const body =
    opts.body ?? '{"ref":"refs/heads/main","repository":{"full_name":"u/r"}}';
  const headers: Record<string, string> = {};
  if (opts.signature !== null) {
    headers["X-Hub-Signature-256"] = opts.signature ?? signBody(body);
  }
  if (opts.event !== null) {
    headers["X-GitHub-Event"] = opts.event ?? "push";
  }
  if (opts.delivery !== null) {
    headers["X-GitHub-Delivery"] = opts.delivery ?? "12345-abcde";
  }
  if (opts.hookId !== undefined && opts.hookId !== null) {
    headers["X-GitHub-Hook-ID"] = opts.hookId;
  }
  return new Request(
    `https://app.example.test/api/webhooks/github${opts.query ?? "?workflowId=wf-1&nodeId=n-1"}`,
    { method: "POST", body, headers },
  );
}

function triggerRow(branch: string | null = null) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "github",
    eventType: "new_commit",
    nodeId: "n-1",
    config: {
      repository: "octocat/hello",
      owner: "octocat",
      repo: "hello",
      branch,
      hookId: 12345,
      events: ["push"],
    },
    providerAccountId: "octocat",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("receiveGitHubWebhook — strict-direct-lookup", () => {
  it("returns unknown_workflow when query params are absent", async () => {
    const result = await receiveGitHubWebhook(reqWith({ query: "" }));
    expect(result).toEqual({ kind: "unknown_workflow" });
    expect(mockFindByWorkflowAndNode).not.toHaveBeenCalled();
  });

  it("returns unknown_workflow when only workflowId is supplied", async () => {
    const result = await receiveGitHubWebhook(
      reqWith({ query: "?workflowId=wf-1" }),
    );
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when no matching trigger row exists", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(null);
    const result = await receiveGitHubWebhook(reqWith({}));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when matching row is for a different provider", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...triggerRow(),
      provider: "shopify",
    });
    const result = await receiveGitHubWebhook(reqWith({}));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when matching row is for a different eventType", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...triggerRow(),
      eventType: "other_event",
    });
    const result = await receiveGitHubWebhook(reqWith({}));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });
});

describe("receiveGitHubWebhook — V1-bug-fix gates (signature)", () => {
  it("throws MissingSecretError when GITHUB_WEBHOOK_SECRET env is missing (route 503)", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    await expect(receiveGitHubWebhook(reqWith({}))).rejects.toBeInstanceOf(
      MissingSecretError,
    );
  });

  it("throws InvalidSignatureError when X-Hub-Signature-256 header is missing (V1 had a dev bypass)", async () => {
    await expect(
      receiveGitHubWebhook(reqWith({ signature: null })),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when signature was computed with the wrong secret", async () => {
    const body = '{"ref":"refs/heads/main"}';
    const wrongSig = signBody(body, "wrong-secret");
    await expect(
      receiveGitHubWebhook(reqWith({ body, signature: wrongSig })),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when the body has been tampered with", async () => {
    const body = '{"ref":"refs/heads/main"}';
    const sig = signBody(body);
    const tampered = '{"ref":"refs/heads/develop"}';
    await expect(
      receiveGitHubWebhook(reqWith({ body: tampered, signature: sig })),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when body is empty (defensive)", async () => {
    await expect(
      receiveGitHubWebhook(reqWith({ body: "" })),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when X-GitHub-Event header is missing despite verified signature", async () => {
    await expect(
      receiveGitHubWebhook(reqWith({ event: null })),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});

describe("receiveGitHubWebhook — ping event handshake", () => {
  it("returns ping_event for X-GitHub-Event=ping (registration handshake)", async () => {
    const result = await receiveGitHubWebhook(
      reqWith({ event: "ping", body: '{"zen":"Speak like a human."}' }),
    );
    expect(result).toEqual({ kind: "ping_event" });
    // Crucially: no DB lookup for ping (we don't need to know the
    // trigger row to ack — signature already proved provenance).
    expect(mockFindByWorkflowAndNode).not.toHaveBeenCalled();
  });
});

describe("receiveGitHubWebhook — unsupported events", () => {
  it("returns unsupported_event for X-GitHub-Event=pull_request (Batch 1 ships push only)", async () => {
    const result = await receiveGitHubWebhook(
      reqWith({ event: "pull_request" }),
    );
    expect(result).toEqual({ kind: "unsupported_event", eventName: "pull_request" });
    // No DB lookup for unsupported events either — saves a query.
    expect(mockFindByWorkflowAndNode).not.toHaveBeenCalled();
  });

  it("returns unsupported_event for X-GitHub-Event=release", async () => {
    const result = await receiveGitHubWebhook(reqWith({ event: "release" }));
    expect(result).toEqual({ kind: "unsupported_event", eventName: "release" });
  });

  it("returns unsupported_event for X-GitHub-Event=issues", async () => {
    const result = await receiveGitHubWebhook(reqWith({ event: "issues" }));
    expect(result).toEqual({ kind: "unsupported_event", eventName: "issues" });
  });
});

describe("receiveGitHubWebhook — branch filter", () => {
  it("returns events when no branch filter is configured", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow(null));
    const body =
      '{"ref":"refs/heads/feature/x","repository":{"full_name":"octocat/hello","owner":{"login":"octocat"}}}';
    const result = await receiveGitHubWebhook(
      reqWith({ body, signature: signBody(body) }),
    );
    expect(result.kind).toBe("events");
  });

  it("returns events when branch filter matches the pushed branch", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow("main"));
    const body =
      '{"ref":"refs/heads/main","repository":{"full_name":"octocat/hello","owner":{"login":"octocat"}}}';
    const result = await receiveGitHubWebhook(
      reqWith({ body, signature: signBody(body) }),
    );
    expect(result.kind).toBe("events");
  });

  it("returns branch_filtered when branch filter does NOT match", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow("main"));
    const body =
      '{"ref":"refs/heads/feature/x","repository":{"full_name":"octocat/hello","owner":{"login":"octocat"}}}';
    const result = await receiveGitHubWebhook(
      reqWith({ body, signature: signBody(body) }),
    );
    expect(result).toEqual({
      kind: "branch_filtered",
      branch: "feature/x",
      configuredBranch: "main",
    });
  });

  it("compares against the post-`refs/heads/` branch name, not the full ref", async () => {
    // Defensive — workflow author writes `main`, not `refs/heads/main`.
    // Verifier strips the prefix before comparing.
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow("main"));
    const body =
      '{"ref":"refs/heads/main","repository":{"full_name":"u/r","owner":{"login":"u"}}}';
    const result = await receiveGitHubWebhook(
      reqWith({ body, signature: signBody(body) }),
    );
    expect(result.kind).toBe("events");
  });
});

describe("receiveGitHubWebhook — happy path normalize", () => {
  it("returns events with one normalized TriggerEvent for a valid push", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow(null));
    const body = JSON.stringify({
      ref: "refs/heads/main",
      before: "old",
      after: "new",
      repository: {
        full_name: "octocat/hello",
        name: "hello",
        owner: { login: "octocat" },
      },
      head_commit: {
        id: "new",
        message: "msg",
        timestamp: "2026-05-10T12:00:00Z",
        author: { name: "Alice" },
      },
      commits: [{ id: "new", message: "msg" }],
      pusher: { name: "alice" },
    });
    const result = await receiveGitHubWebhook(
      reqWith({ body, signature: signBody(body) }),
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event).toMatchObject({
      provider: "github",
      eventType: "new_commit",
      eventId: "12345-abcde",
      providerAccountId: "octocat",
      occurredAt: "2026-05-10T12:00:00Z",
    });
    expect(event.payload).toMatchObject({
      eventName: "push",
      deliveryId: "12345-abcde",
      branch: "main",
      repository: "octocat/hello",
    });
  });

  it("queries findByWorkflowAndNode with the strict-direct-lookup ids from query params", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow(null));
    const body =
      '{"ref":"refs/heads/main","repository":{"full_name":"u/r","owner":{"login":"u"}}}';
    await receiveGitHubWebhook(
      reqWith({ body, signature: signBody(body) }),
    );
    expect(mockFindByWorkflowAndNode).toHaveBeenCalledWith("wf-1", "n-1");
  });

  it("throws InvalidSignatureError when JSON parse fails on a verified body", async () => {
    // Defensive — if the verified body isn't valid JSON, something
    // upstream re-encoded it. Rare but possible with broken proxies.
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow(null));
    const body = "not-json-{}";
    await expect(
      receiveGitHubWebhook(reqWith({ body, signature: signBody(body) })),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});

});
