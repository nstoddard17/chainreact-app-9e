/**
 * @jest-environment node
 *
 * Tests for the shared Asana webhook receive helper — Slice 5.ASANA-1.
 *
 * Uses the REAL signature verifier (crypto HMAC) with a reversible fake
 * for the token-encryption seam, and mocks the trigger-row repo.
 */
import { createHmac } from "node:crypto";

const mockFind = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) => mockFind(...args),
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => {
    if (!s.startsWith("enc(") || !s.endsWith(")")) throw new Error("bad ciphertext");
    return s.slice(4, -1);
  },
}));

import { receiveAsanaWebhook } from "@/integrations/asana/triggers/_shared/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";

const SECRET = "asana-hook-secret-1";

function sign(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function makeRequest(
  body: string,
  opts: {
    sig?: string | null;
    hookSecret?: string;
    query?: string;
  } = {},
): Request {
  const query = opts.query ?? "?workflowId=wf&nodeId=n";
  const headers: Record<string, string> = {};
  if (opts.sig) headers["x-hook-signature"] = opts.sig;
  if (opts.hookSecret !== undefined) headers["x-hook-secret"] = opts.hookSecret;
  return new Request(`https://app.test/api/webhooks/asana${query}`, {
    method: "POST",
    headers,
    body,
  });
}

function triggerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tr-1",
    workflowId: "wf",
    workflowAccountId: "acct-wf",
    userId: "user-1",
    provider: "asana",
    eventType: "new_task_in_project",
    nodeId: "n",
    config: {
      projectId: "p-1",
      hookSecretEncrypted: `enc(${SECRET})`,
      webhookEnabled: true,
      handshakePending: false,
    },
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function taskEvent(overrides: Record<string, unknown> = {}) {
  return {
    user: { gid: "actor-1" },
    resource: {
      gid: "t-1",
      resource_type: "task",
      resource_subtype: "default_task",
    },
    parent: { gid: "p-1", resource_type: "project" },
    action: "added",
    created_at: "2026-07-04T05:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockFind.mockReset();
  mockUpdateConfig.mockReset();
});

describe("receiveAsanaWebhook — X-Hook-Secret handshake", () => {
  it("stores the secret ENCRYPTED on a pending row and echoes it", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({
        config: { projectId: "p-1", handshakePending: true, webhookEnabled: false },
      }),
    );
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "fresh-secret" }),
      rawBody: "",
    });
    expect(result).toEqual({ kind: "handshake", secret: "fresh-secret" });
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [rowId, newConfig] = mockUpdateConfig.mock.calls[0]!;
    expect(rowId).toBe("tr-1");
    expect(newConfig.hookSecretEncrypted).toBe("enc(fresh-secret)");
    // Never stored in plaintext.
    expect(JSON.stringify(newConfig)).not.toContain('"fresh-secret"');
  });

  it("rejects a handshake against an ARMED row (secret already stored) — no overwrite, no echo", async () => {
    mockFind.mockResolvedValueOnce(triggerRow()); // armed row
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "attacker-secret" }),
      rawBody: "",
    });
    expect(result).toEqual({ kind: "handshake_rejected", reason: "not_pending" });
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("rejects a handshake with no matching trigger row", async () => {
    mockFind.mockResolvedValueOnce(null);
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "s" }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "unknown_trigger",
    });
  });

  it("rejects a handshake without query params", async () => {
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "s", query: "" }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "missing_query",
    });
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("rejects an oversized handshake secret", async () => {
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "x".repeat(300) }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "malformed_secret",
    });
  });

  it("rejects a handshake against a non-asana row", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ provider: "monday" }));
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "s" }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "unknown_trigger",
    });
  });
});

describe("receiveAsanaWebhook — signature (events fail closed)", () => {
  it("throws InvalidSignatureError on a bad signature", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign("a different body") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when the header is absent", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: null }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies with the ROW's own secret (a different webhook's secret fails)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body, "some-other-secret") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies over the RAW body bytes (re-serialized body fails)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = '{ "events": [] }';
    const reserialized = JSON.stringify(JSON.parse(body));
    expect(reserialized).not.toBe(body);
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(reserialized, { sig: sign(body) }),
        rawBody: reserialized,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("returns unverifiable (never dispatches) for a secretless row", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ config: { projectId: "p-1", handshakePending: true } }),
    );
    const body = JSON.stringify({ events: [taskEvent()] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unverifiable" });
  });
});

describe("receiveAsanaWebhook — routing + normalization", () => {
  it("returns unknown_workflow without query params / row / for foreign rows", async () => {
    const body = JSON.stringify({ events: [] });
    expect(
      await receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body), query: "" }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });

    mockFind.mockResolvedValueOnce(null);
    expect(
      await receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });

    mockFind.mockResolvedValueOnce(triggerRow({ provider: "trello" }));
    expect(
      await receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });
  });

  it("acks the 8h heartbeat (empty events) — verified but no dispatch", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "heartbeat" });
  });

  it("normalizes a task-added event with the SHORT eventType + row-attributed project", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      provider: "asana",
      eventType: "new_task_in_project",
      eventId: "new_task_in_project:p-1:t-1",
      occurredAt: "2026-07-04T05:00:00.000Z",
      providerAccountId: "p-1",
      payload: {
        changeKind: "new_task_in_project",
        taskGid: "t-1",
        projectGid: "p-1",
        actorGid: "actor-1",
        action: "added",
        resourceSubtype: "default_task",
        createdAt: "2026-07-04T05:00:00.000Z",
      },
    });
    // The per-webhook secret never leaks into the normalized event.
    expect(JSON.stringify(result.events[0])).not.toContain(SECRET);
  });

  it("drops unsupported events (stories) and cross-type events (changed on a new_task row)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "new_task_in_project" }));
    const body = JSON.stringify({
      events: [
        taskEvent({ resource: { gid: "s-1", resource_type: "story" } }),
        taskEvent({ action: "changed" }),
        taskEvent({ action: "deleted" }),
        taskEvent(), // the only one that matches
      ],
    });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("new_task_in_project");
  });

  it("produces the SAME eventId for a redelivery (dedup determinism)", async () => {
    const body = JSON.stringify({ events: [taskEvent()] });
    mockFind.mockResolvedValue(triggerRow());
    const first = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    const second = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (first.kind !== "events" || second.kind !== "events") {
      throw new Error("expected events");
    }
    expect(first.events[0]!.eventId).toBe(second.events[0]!.eventId);
  });

  it("routes task-changed events on a task_updated row", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "task_updated_in_project" }),
    );
    const body = JSON.stringify({ events: [taskEvent({ action: "changed" })] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events[0]!.eventType).toBe("task_updated_in_project");
    expect(result.events[0]!.payload.changeKind).toBe("task_updated_in_project");
  });
});
