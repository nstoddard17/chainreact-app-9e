/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/quickbooks — QUICKBOOKS-1.
 * Mocks receive + enrich so we exercise status-code mapping in
 * isolation (signature/parse/enrichment have their own dedicated test
 * files).
 *
 * Contract:
 *   - MissingSecretError → 503 (fail-closed; never accept unsigned)
 *   - InvalidSignatureError → 401
 *   - unexpected receive error → 500
 *   - enrichment errors > 0 → 500 (Intuit redelivers; dedup collapses)
 *   - clean processing → 200 with the summary counts
 */
const mockReceive = jest.fn();
const mockProcess = jest.fn();

jest.mock("@/integrations/quickbooks/webhooks/receive", () => {
  const actual = jest.requireActual(
    "@/integrations/quickbooks/webhooks/receive",
  );
  return {
    ...actual,
    receiveQuickbooksWebhook: (...args: unknown[]) => mockReceive(...args),
  };
});

jest.mock("@/integrations/quickbooks/webhooks/enrich", () => ({
  processQuickbooksEvents: (...args: unknown[]) => mockProcess(...args),
}));

// Bypass the registry side-effect import — registration is covered by the
// per-trigger index modules + the activation-invariant structural test.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { MissingSecretError } from "@/integrations/quickbooks/webhooks/receive";
import { GET, POST } from "@/app/api/webhooks/quickbooks/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockProcess.mockReset();
});

function req(): Request {
  return new Request("https://app.example.test/api/webhooks/quickbooks", {
    method: "POST",
    body: '{"eventNotifications":[]}',
  });
}

const CLEAN_SUMMARY = {
  received: 1,
  dispatched: 1,
  duplicates: 0,
  ignoredOperations: 0,
  droppedNoIntegration: 0,
  goneEntities: 0,
  errors: 0,
};

describe("/api/webhooks/quickbooks — error mapping", () => {
  it("returns 503 when the verifier token is not configured (fail-closed)", async () => {
    mockReceive.mockImplementationOnce(() => {
      throw new MissingSecretError("env unset");
    });
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("returns 401 on InvalidSignatureError without dispatching", async () => {
    mockReceive.mockImplementationOnce(() => {
      throw new InvalidSignatureError("bad");
    });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid signature");
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("returns 500 on an unexpected receive error", async () => {
    mockReceive.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const res = await POST(req());
    expect(res.status).toBe(500);
  });

  it("returns 500 when enrichment reported errors (Intuit retries; dedup collapses)", async () => {
    mockReceive.mockReturnValueOnce({ events: [{}], malformedSkipped: 0 });
    mockProcess.mockResolvedValueOnce({ ...CLEAN_SUMMARY, errors: 2 });
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("/api/webhooks/quickbooks — success", () => {
  it("returns 200 with the summary counts on clean processing", async () => {
    mockReceive.mockReturnValueOnce({ events: [{}], malformedSkipped: 1 });
    mockProcess.mockResolvedValueOnce(CLEAN_SUMMARY);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      dispatched: 1,
      malformedSkipped: 1,
    });
  });

  it("GET returns service info (no challenge — Intuit verification is portal-driven)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).service).toBe("quickbooks webhook");
  });
});
