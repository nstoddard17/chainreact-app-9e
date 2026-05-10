/**
 * @jest-environment node
 *
 * Tests for `normalizeGitHubEvent` — converts a GitHub push delivery
 * to V2's canonical `TriggerEvent` shape.
 */
import {
  GITHUB_TRIGGER_EVENT_TYPE,
  normalizeGitHubEvent,
  type GitHubHeaders,
} from "@/integrations/github/triggers/newCommit/normalize";

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
    expect(result.accountId).toBe("octocat");
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
    expect(result.accountId).toBe("myorg");
  });

  it("uses 'unknown' accountId when no owner can be determined", () => {
    const result = normalizeGitHubEvent({
      headers: baseHeaders,
      body: { ref: "refs/heads/main" },
    });
    expect(result.accountId).toBe("unknown");
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
