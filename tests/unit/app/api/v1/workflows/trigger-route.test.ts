/**
 * @jest-environment node
 *
 * Tests for app/api/v1/workflows/[workflowId]/trigger/route.ts
 * (Slice 4.API-KEYS-FOUNDATION-5 / FK-4) — the PUBLIC, API-key-authenticated
 * workflow trigger.
 *
 * Mocks the flag, the verify primitive, the rate-limit seam, the service-role
 * workflow repo, the freeze guard, enqueueRun, and touchLastUsed so the route's
 * decision logic is tested in isolation. Deliberately does NOT mock
 * `@/utils/supabase/server` — the happy path passing without any session mock is
 * the guard that this endpoint uses NO user session / active-account state.
 */

const mockFlag = jest.fn();
jest.mock("@/services/apiKeys/flags", () => ({
  isPublicApiKeysEnabled: () => mockFlag(),
}));

const mockVerify = jest.fn();
jest.mock("@/services/apiKeys/verify", () => ({
  verifyApiKey: (...a: unknown[]) => mockVerify(...a),
}));

const mockRateLimit = jest.fn();
jest.mock("@/services/apiKeys/rateLimit", () => ({
  rateLimitApiKeyTrigger: (...a: unknown[]) => mockRateLimit(...a),
}));

const mockGetByIdServiceRole = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetByIdServiceRole(...a),
}));

const mockTouchLastUsed = jest.fn();
jest.mock("@/repositories/accountApiKeys", () => ({
  touchLastUsedServiceRole: (...a: unknown[]) => mockTouchLastUsed(...a),
}));

const mockEnqueueRun = jest.fn();
jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...a: unknown[]) => mockEnqueueRun(...a),
}));

const mockIsFrozen = jest.fn();
jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: (...a: unknown[]) => mockIsFrozen(...a),
}));

import { POST } from "@/app/api/v1/workflows/[workflowId]/trigger/route";
import {
  MANUAL_TRIGGER_PROVIDER,
  MANUAL_TRIGGER_EVENT_TYPE,
} from "@/integrations/native/triggers/manualTrigger";

const TRIGGER_NODE = {
  id: "trigger-node",
  kind: "trigger" as const,
  provider: MANUAL_TRIGGER_PROVIDER,
  type: MANUAL_TRIGGER_EVENT_TYPE,
  config: {},
  position: { x: 0, y: 0 },
};

function workflow(over: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    accountId: "acct-1",
    createdByUserId: "u-1",
    name: "WF",
    state: "active",
    draftDefinition: { nodes: [TRIGGER_NODE], edges: [] },
    ...over,
  };
}

function buildRequest(opts: { auth?: string | null; body?: string; contentLength?: number | null } = {}): Request {
  const headers = new Headers();
  if (opts.auth !== null && opts.auth !== undefined) headers.set("authorization", opts.auth);
  headers.set("content-type", "application/json");
  if (opts.contentLength !== undefined && opts.contentLength !== null) {
    headers.set("content-length", String(opts.contentLength));
  } else if (opts.body !== undefined) {
    headers.set("content-length", String(Buffer.byteLength(opts.body, "utf8")));
  }
  return new Request("http://localhost/api/v1/workflows/wf-1/trigger", {
    method: "POST",
    headers,
    body: opts.body,
  });
}

const params = (workflowId = "wf-1") => ({ params: Promise.resolve({ workflowId }) });

const VALID_AUTH = "Bearer crk_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  mockFlag.mockReset().mockReturnValue(true);
  mockVerify.mockReset().mockResolvedValue({
    ok: true,
    keyId: "k1",
    accountId: "acct-1",
    prefix: "crk_live_ab12…wxyz",
    scopes: ["workflows:trigger"],
  });
  mockRateLimit.mockReset().mockResolvedValue({ allowed: true });
  mockGetByIdServiceRole.mockReset().mockResolvedValue(workflow());
  mockIsFrozen.mockReset().mockResolvedValue(false);
  mockEnqueueRun.mockReset().mockResolvedValue({ runId: "run-1", enqueuedAt: "2026-06-05T00:00:00Z" });
  mockTouchLastUsed.mockReset().mockResolvedValue(undefined);
});

// ── feature flag ──────────────────────────────────────────────────────────────

describe("feature flag", () => {
  it("OFF → 404 with NO key lookup", async () => {
    mockFlag.mockReturnValue(false);
    const res = await POST(buildRequest({ auth: VALID_AUTH }), params());
    expect(res.status).toBe(404);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockGetByIdServiceRole).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("ON → reaches key verification", async () => {
    await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(mockVerify).toHaveBeenCalledWith(VALID_AUTH);
  });
});

// ── API-key auth (opaque 401) ───────────────────────────────────────────────────

describe("API-key auth", () => {
  it.each(["missing", "malformed", "invalid", "expired"] as const)(
    "verify failure '%s' → opaque 401, no enqueue, no leak",
    async (reason) => {
      mockVerify.mockResolvedValue({ ok: false, reason });
      const res = await POST(buildRequest({ auth: reason === "missing" ? null : VALID_AUTH }), params());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ ok: false, error: "Unauthorized." });
      // No reason / oracle leaked to the client.
      expect(JSON.stringify(body)).not.toContain(reason);
      expect(mockEnqueueRun).not.toHaveBeenCalled();
    },
  );

  it("valid key proceeds to enqueue", async () => {
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });

  it("no raw key or key_hash appears in any response", async () => {
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/crk_live_/);
    expect(text).not.toMatch(/key_?hash/i);
  });
});

// ── scope ───────────────────────────────────────────────────────────────────────

describe("scope", () => {
  it("missing workflows:trigger scope → 403 insufficient_scope, no enqueue", async () => {
    mockVerify.mockResolvedValue({ ok: true, keyId: "k1", accountId: "acct-1", scopes: ["workflows:read"] });
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("insufficient_scope");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

// ── rate limit ──────────────────────────────────────────────────────────────────

describe("rate limit", () => {
  it("allowed → proceeds; limiter keyed on key/account/workflow", async () => {
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(mockRateLimit).toHaveBeenCalledWith({
      keyId: "k1",
      accountId: "acct-1",
      workflowId: "wf-1",
    });
    expect(res.status).toBe(202);
  });

  it("refused → 429 with Retry-After; no enqueue, no last_used touch", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect((await res.json()).code).toBe("rate_limited");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockTouchLastUsed).not.toHaveBeenCalled();
  });

  it("runs AFTER ownership/freeze/state (cross-account → 404, limiter NOT consulted)", async () => {
    mockGetByIdServiceRole.mockResolvedValue(workflow({ accountId: "acct-OTHER" }));
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(404);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("not consulted for an invalid key (opaque 401 first)", async () => {
    mockVerify.mockResolvedValue({ ok: false, reason: "invalid" });
    const res = await POST(buildRequest({ auth: VALID_AUTH }), params());
    expect(res.status).toBe(401);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("not consulted for a wrong-scope key (403 first)", async () => {
    mockVerify.mockResolvedValue({ ok: true, keyId: "k1", accountId: "acct-1", scopes: ["workflows:read"] });
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(403);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("not consulted for a frozen account (403 first)", async () => {
    mockIsFrozen.mockResolvedValue(true);
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(403);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });
});

// ── workflow + account authorization ─────────────────────────────────────────────

describe("workflow + account authorization", () => {
  it("workflow in the key's account → triggers (202)", async () => {
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(202);
  });

  it("workflow owned by ANOTHER account → generic 404 (no leak), no enqueue", async () => {
    mockGetByIdServiceRole.mockResolvedValue(workflow({ accountId: "acct-OTHER" }));
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Not found." });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("missing workflow → 404", async () => {
    mockGetByIdServiceRole.mockResolvedValue(null);
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(404);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("deleted workflow → 404", async () => {
    mockGetByIdServiceRole.mockResolvedValue(workflow({ state: "deleted" }));
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(404);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("frozen / pending-deletion account → 403, no enqueue", async () => {
    mockIsFrozen.mockResolvedValue(true);
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("account_frozen");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("non-triggerable workflow state → 409", async () => {
    mockGetByIdServiceRole.mockResolvedValue(workflow({ state: "disabled" }));
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(409);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("workflow without a manual trigger node → 422", async () => {
    mockGetByIdServiceRole.mockResolvedValue(workflow({ draftDefinition: { nodes: [], edges: [] } }));
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(422);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

// ── body ────────────────────────────────────────────────────────────────────────

describe("body handling", () => {
  it("invalid JSON → 400", async () => {
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{not json" }), params());
    expect(res.status).toBe(400);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("payload over the cap (content-length) → 413", async () => {
    const res = await POST(buildRequest({ auth: VALID_AUTH, contentLength: 256 * 1024 + 1 }), params());
    expect(res.status).toBe(413);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("passes the body through as the manual trigger input", async () => {
    await POST(buildRequest({ auth: VALID_AUTH, body: JSON.stringify({ inputs: { foo: "bar" } }) }), params());
    const arg = mockEnqueueRun.mock.calls[0]![0];
    expect(arg.event.payload).toEqual({ inputs: { foo: "bar" } });
    expect(arg.event.provider).toBe(MANUAL_TRIGGER_PROVIDER);
    expect(arg.event.eventType).toBe(MANUAL_TRIGGER_EVENT_TYPE);
  });
});

// ── run enqueue behavior ──────────────────────────────────────────────────────────

describe("run enqueue", () => {
  it("returns 202 { ok, runId, enqueuedAt }", async () => {
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, runId: "run-1", enqueuedAt: "2026-06-05T00:00:00Z" });
  });

  it("enqueues a real api_key run: no human actor, with key id + prefix provenance", async () => {
    await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    const arg = mockEnqueueRun.mock.calls[0]![0];
    expect(arg).toMatchObject({
      workflowId: "wf-1",
      triggerNodeId: "trigger-node",
      testMode: false,
      triggeredBy: "api_key",
      triggeredByUserId: null,
      triggeredByApiKeyId: "k1",
      triggeredByApiKeyPrefix: "crk_live_ab12…wxyz",
    });
  });

  it("never forwards a raw key or key_hash into the run path", async () => {
    await POST(
      buildRequest({ auth: "Bearer crk_live_THE_RAW_SECRET_VALUE_aaaaaaaaaaaaaaaaaaaa", body: "{}" }),
      params(),
    );
    const arg = mockEnqueueRun.mock.calls[0]![0];
    const serialized = JSON.stringify(arg);
    // Only the non-secret prefix snapshot + key id are present.
    expect(arg.triggeredByApiKeyPrefix).toBe("crk_live_ab12…wxyz");
    expect(serialized).not.toContain("THE_RAW_SECRET_VALUE");
    expect(serialized).not.toMatch(/key_?hash/i);
  });
});

// ── last_used_at (best-effort) ────────────────────────────────────────────────────

describe("last_used_at", () => {
  it("touches last_used_at on a successful trigger", async () => {
    await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(mockTouchLastUsed).toHaveBeenCalledWith({ keyId: "k1" });
  });

  it("a touch failure does NOT fail the trigger (still 202)", async () => {
    mockTouchLastUsed.mockRejectedValue(new Error("db down"));
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(202);
  });
});

// ── guard: no session / active-account state ──────────────────────────────────────

describe("no session dependency", () => {
  it("triggers with ONLY a bearer key — no Supabase session mock present", async () => {
    // This file never mocks @/utils/supabase/server. A 202 here proves the route
    // resolves everything from the API key + service-role repos, not a user session.
    const res = await POST(buildRequest({ auth: VALID_AUTH, body: "{}" }), params());
    expect(res.status).toBe(202);
  });
});
