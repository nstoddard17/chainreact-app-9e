/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/github. Mocks receive +
 * dispatch so we exercise the route's status-code mapping in
 * isolation. Receive helper + signature verifier all have their own
 * dedicated test files.
 *
 * Critical V2 contract:
 *   - InvalidSignatureError → 401
 *   - MissingSecretError → 503 (V1 silently 200-acked unsigned events)
 *   - unknown_workflow → 200 (quiet ack)
 *   - ping_event → 200 (GitHub registration handshake)
 *   - unsupported_event → 200 (skipped)
 *   - branch_filtered → 200 (skipped)
 *   - events → dispatch + 200 with count
 *   - dispatch failure → 500 so GitHub retries
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/github/triggers/newCommit/receive", () => {
  // Need the real MissingSecretError class so `instanceof` works
  // against the mocked module.
  const actual = jest.requireActual(
    "@/integrations/github/triggers/newCommit/receive",
  );
  return {
    ...actual,
    receiveGitHubWebhook: (...args: unknown[]) => mockReceive(...args),
  };
});

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the registry side-effect import so the registration tests
// cover that path directly.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { MissingSecretError } from "@/integrations/github/triggers/newCommit/receive";
import { GET, POST } from "@/app/api/webhooks/github/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request(
    "https://app.example.test/api/webhooks/github?workflowId=wf-1&nodeId=n-1",
    {
      method: "POST",
      body: '{"ref":"refs/heads/main"}',
    },
  );
}

describe("/api/webhooks/github route — error mapping", () => {
  it("returns 503 on MissingSecretError (V1 silently 200-acked unsigned events here)", async () => {
    // Load-bearing V1-bug-fix test. V1 returned `true` from
    // `verifyGitHubSignature` when the secret env was missing,
    // turning the route into a 200-quiet-ack for unsigned traffic.
    // V2 distinguishes the failure mode and surfaces 503.
    mockReceive.mockRejectedValueOnce(new MissingSecretError());
    const res = await POST(req());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/secret/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 on InvalidSignatureError with 'invalid signature' body", async () => {
    mockReceive.mockRejectedValueOnce(
      new InvalidSignatureError("signature mismatch"),
    );
    const res = await POST(req());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("invalid signature");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected receive error", async () => {
    mockReceive.mockRejectedValueOnce(new Error("network"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("/api/webhooks/github route — non-dispatch acks", () => {
  it("returns 200 with dispatched: 0 on unknown_workflow (quiet ack)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_workflow" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 200 with message:'pong' on ping_event (GitHub registration handshake)", async () => {
    // GitHub requires a 2xx on the first delivery (`X-GitHub-Event: ping`)
    // for the webhook to register as healthy in the repo settings UI.
    mockReceive.mockResolvedValueOnce({ kind: "ping_event" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: "pong" });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 200 with skipped:true on unsupported_event (Batch 1 ships push only)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "unsupported_event",
      eventName: "pull_request",
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dispatched: 0,
      skipped: true,
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 200 with skipped:true on branch_filtered (filter mismatch)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "branch_filtered",
      branch: "feature/x",
      configuredBranch: "main",
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dispatched: 0,
      skipped: true,
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("/api/webhooks/github route — dispatch", () => {
  const event = {
    provider: "github",
    eventType: "new_commit",
    eventId: "delivery-uuid",
    occurredAt: "2026-05-10T12:00:00Z",
    providerAccountId: "octocat",
    payload: {},
  };

  it("dispatches each event and returns the enqueued count on success", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [event] });
    mockDispatch.mockResolvedValueOnce({
      matched: 1,
      enqueued: 1,
      duplicate: false,
      dedupOutage: false,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("counts enqueued=0 on duplicate delivery (dedup blocked)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [event] });
    mockDispatch.mockResolvedValueOnce({
      matched: 0,
      enqueued: 0,
      duplicate: true,
      dedupOutage: false,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
  });

  it("returns 500 on dispatch failure (GitHub retries on non-2xx)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [event] });
    mockDispatch.mockRejectedValueOnce(new Error("dispatch boom"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("/api/webhooks/github GET", () => {
  it("returns service info JSON (no challenge / handshake)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("github webhook");
    expect(json.description).toMatch(/X-Hub-Signature-256/);
    expect(json.description).toMatch(/GITHUB_WEBHOOK_SECRET/);
  });
});
