/** @jest-environment node */
/**
 * Tests for services/observability/signalRecorders.
 *
 * Business rule: cron heartbeats record `ok` on 2xx and `failed` otherwise, skip
 * unauthenticated (401) probes (no service-role write for junk traffic), record a
 * `fatal` heartbeat then rethrow when the handler throws, and NEVER let a recorder
 * failure break the cron tick or the instrumented webhook.
 */
import { jest } from "@jest/globals";

const record = jest.fn<(input: unknown) => Promise<void>>(async () => undefined);
jest.mock("@/repositories/opsSignalEvents", () => ({
  record: (input: unknown) => record(input),
}));

import {
  recordBillingWebhookFailure,
  withCronHeartbeat,
} from "@/services/observability/signalRecorders";

beforeEach(() => {
  record.mockReset();
  record.mockResolvedValue(undefined);
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// The jest env has no DOM Request/Response constructors; use minimal stand-ins
// (the wrapper only reads response.status/.ok and passes the request through).
function res(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as Response;
}
const req = {} as Request;

describe("withCronHeartbeat", () => {
  it("records an ok heartbeat on a 2xx response", async () => {
    const wrapped = withCronHeartbeat("poll-triggers", async () => res(200));
    const out = await wrapped(req);
    expect(out.status).toBe(200);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "cron_run", source: "poll-triggers", outcome: "ok" }),
    );
  });

  it("records a failed heartbeat (http_500) on a 500 response", async () => {
    const wrapped = withCronHeartbeat("sweep-stale-runs", async () => res(500));
    await wrapped(req);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed", detailCode: "http_500" }),
    );
  });

  it("does NOT record on a 401 (unauthenticated probe)", async () => {
    const wrapped = withCronHeartbeat("poll-triggers", async () => res(401));
    await wrapped(req);
    expect(record).not.toHaveBeenCalled();
  });

  it("records a fatal heartbeat and rethrows when the handler throws", async () => {
    const wrapped = withCronHeartbeat("renew-watch-subscriptions", async () => {
      throw new Error("boom");
    });
    await expect(wrapped(req)).rejects.toThrow("boom");
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed", detailCode: "fatal" }),
    );
  });

  it("never throws when the recorder itself fails — the response still returns", async () => {
    record.mockRejectedValueOnce(new Error("db down"));
    const wrapped = withCronHeartbeat("poll-triggers", async () => res(200));
    const out = await wrapped(req);
    expect(out.status).toBe(200); // tick succeeded despite recorder failure
  });
});

describe("recordBillingWebhookFailure", () => {
  it("records a safe billing-webhook failure signal", async () => {
    await recordBillingWebhookFailure("invalid_signature");
    expect(record).toHaveBeenCalledWith({
      kind: "billing_webhook_failure",
      source: "stripe_billing",
      outcome: "failed",
      detailCode: "invalid_signature",
    });
  });

  it("never throws when the recorder fails", async () => {
    record.mockRejectedValueOnce(new Error("db down"));
    await expect(recordBillingWebhookFailure("processing_error")).resolves.toBeUndefined();
  });
});
