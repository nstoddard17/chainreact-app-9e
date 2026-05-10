/**
 * @jest-environment node
 *
 * Tests for `receiveGitHubWebhook` — verify-and-parse helper the route
 * delegates to. Mocks the trigger_resources repo so we exercise:
 *   - Strict-direct-lookup query-param requirement.
 *   - Signature verification (delegates to verifyGitHubSignature).
 *   - Missing X-GitHub-Event header.
 *   - GitHub `ping` handshake event.
 *   - Unsupported event types (anything other than `push`).
 *   - Branch filter.
 *   - Normalize → TriggerEvent shape.
 *   - V2 V1-bug-fix: missing secret throws MissingSecretError so
 *     route can map to 503.
 */
import { createHmac } from "node:crypto";

const mockFindByWorkflowAndNode = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) =>
    mockFindByWorkflowAndNode(...args),
}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  MissingSecretError,
  receiveGitHubWebhook,
} from "@/integrations/github/triggers/newCommit/receive";

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
    accountId: "octocat",
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
      accountId: "octocat",
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
