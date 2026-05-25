/**
 * @jest-environment node
 *
 * Tests for services/billing/reserveReconcileBilling.ts (Slice 4.COST-13).
 * The userBilling repo wrappers are mocked — we assert the service's flag /
 * test-mode gating, result mapping, error handling, and no-leak guarantees
 * without a DB. The feature flag is toggled via process.env at call time.
 */

const mockReserve = jest.fn();
const mockReconcile = jest.fn();
const mockRelease = jest.fn();
const mockReleaseExpired = jest.fn();
jest.mock("@/repositories/userBilling", () => ({
  reserveTasks: (...a: unknown[]) => mockReserve(...a),
  reconcileReservation: (...a: unknown[]) => mockReconcile(...a),
  releaseReservation: (...a: unknown[]) => mockRelease(...a),
  releaseExpiredReservations: (...a: unknown[]) => mockReleaseExpired(...a),
}));

import {
  createBillingReservation,
  reconcileBillingReservation,
  releaseBillingReservation,
  releaseExpiredBillingReservations,
  isReserveReconcileEnabled,
} from "@/services/billing/reserveReconcileBilling";

const FLAG = "ENABLE_RESERVE_RECONCILE_BILLING";

function enable() {
  process.env[FLAG] = "true";
}
function disable() {
  delete process.env[FLAG];
}

beforeEach(() => {
  mockReserve.mockReset();
  mockReconcile.mockReset();
  mockRelease.mockReset();
  mockReleaseExpired.mockReset();
  disable();
});

describe("isReserveReconcileEnabled", () => {
  it("reflects the env flag, default false", () => {
    expect(isReserveReconcileEnabled()).toBe(false);
    enable();
    expect(isReserveReconcileEnabled()).toBe(true);
    process.env[FLAG] = "1"; // only the literal "true" enables it
    expect(isReserveReconcileEnabled()).toBe(false);
  });
});

describe("createBillingReservation — gating", () => {
  it("flag disabled → skipped/disabled, no RPC call, no mutation", async () => {
    const r = await createBillingReservation({ userId: "u1", workflowRunId: "run-1", estimatedTasks: 3 });
    expect(r).toMatchObject({ ok: true, skipped: true, reason: "disabled", amount: 3 });
    expect(mockReserve).not.toHaveBeenCalled();
  });

  it("test mode → skipped/test_mode, no RPC call (even when enabled)", async () => {
    enable();
    const r = await createBillingReservation({ userId: "u1", workflowRunId: "run-1", estimatedTasks: 3, testMode: true });
    expect(r).toMatchObject({ ok: true, skipped: true, reason: "test_mode", amount: 3 });
    expect(mockReserve).not.toHaveBeenCalled();
  });
});

describe("createBillingReservation — enabled", () => {
  it("successful reserve maps faithfully and passes params (incl. expiry)", async () => {
    enable();
    mockReserve.mockResolvedValueOnce({ ok: true, reason: "reserved", used: 2, reserved: 3, limit: 100, amount: 3 });
    const r = await createBillingReservation({ userId: "u1", workflowRunId: "run-1", estimatedTasks: 3, expiresAt: "2026-05-25T01:00:00Z" });
    expect(mockReserve).toHaveBeenCalledWith("u1", 3, "run-1", "2026-05-25T01:00:00Z");
    expect(r).toMatchObject({ ok: true, skipped: false, status: "reserved", reason: "reserved", used: 2, reserved: 3, limit: 100, amount: 3 });
  });

  it("insufficient balance → ok:false, reason insufficient_tasks, status failed", async () => {
    enable();
    mockReserve.mockResolvedValueOnce({ ok: false, reason: "insufficient_tasks", used: 100, reserved: 0, limit: 100, amount: 3 });
    const r = await createBillingReservation({ userId: "u1", workflowRunId: "run-1", estimatedTasks: 3 });
    expect(r).toMatchObject({ ok: false, skipped: false, reason: "insufficient_tasks", status: "failed" });
  });

  it("zero estimate → explicit zero_reservation (RPC still called with 0, expiry null)", async () => {
    enable();
    mockReserve.mockResolvedValueOnce({ ok: true, reason: "reserved", used: 0, reserved: 0, limit: 100, amount: 0 });
    const r = await createBillingReservation({ userId: "u1", workflowRunId: "run-1", estimatedTasks: 0 });
    expect(mockReserve).toHaveBeenCalledWith("u1", 0, "run-1", null);
    expect(r).toMatchObject({ ok: true, skipped: false, reason: "zero_reservation", status: "reserved", amount: 0 });
  });

  it("idempotent re-reserve preserves already_reserved", async () => {
    enable();
    mockReserve.mockResolvedValueOnce({ ok: true, reason: "already_reserved", used: 0, reserved: 4, limit: 100, amount: 4 });
    const r = await createBillingReservation({ userId: "u1", workflowRunId: "run-1", estimatedTasks: 4 });
    expect(r).toMatchObject({ ok: true, reason: "already_reserved", status: "reserved" });
  });

  it("RPC throw → ok:false, reason rpc_error, error surfaced (not swallowed)", async () => {
    enable();
    mockReserve.mockRejectedValueOnce(new Error("reserve_tasks_if_available RPC failed: boom"));
    const r = await createBillingReservation({ userId: "u1", workflowRunId: "run-1", estimatedTasks: 3 });
    expect(r).toMatchObject({ ok: false, reason: "rpc_error" });
    expect(r.error).toMatch(/RPC failed: boom/);
  });
});

describe("reconcileBillingReservation", () => {
  it("flag disabled → skipped/disabled, no RPC call", async () => {
    const r = await reconcileBillingReservation({ userId: "u1", workflowRunId: "run-1", actualTasks: 2 });
    expect(r).toMatchObject({ ok: true, skipped: true, reason: "disabled" });
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("test mode → skipped/test_mode", async () => {
    enable();
    const r = await reconcileBillingReservation({ userId: "u1", workflowRunId: "run-1", actualTasks: 2, testMode: true });
    expect(r).toMatchObject({ ok: true, skipped: true, reason: "test_mode" });
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("success maps charged/refunded + status reconciled", async () => {
    enable();
    mockReconcile.mockResolvedValueOnce({ ok: true, reason: "reconciled", used: 7, reserved: 0, limit: 100, charged: 2, refunded: 3 });
    const r = await reconcileBillingReservation({ userId: "u1", workflowRunId: "run-1", actualTasks: 2 });
    expect(mockReconcile).toHaveBeenCalledWith("u1", "run-1", 2);
    expect(r).toMatchObject({ ok: true, status: "reconciled", reason: "reconciled", charged: 2, refunded: 3 });
  });

  it("over-reserve reason preserved", async () => {
    enable();
    mockReconcile.mockResolvedValueOnce({ ok: true, reason: "reconcile_over_reserve", used: 3, reserved: 0, limit: 100, charged: 3, refunded: 0 });
    const r = await reconcileBillingReservation({ userId: "u1", workflowRunId: "run-1", actualTasks: 5 });
    expect(r).toMatchObject({ ok: true, reason: "reconcile_over_reserve", status: "reconciled", charged: 3 });
  });

  it("not-reserved RPC reason normalizes to not_reserved", async () => {
    enable();
    mockReconcile.mockResolvedValueOnce({ ok: false, reason: "not_reserved_released" });
    const r = await reconcileBillingReservation({ userId: "u1", workflowRunId: "run-1", actualTasks: 1 });
    expect(r).toMatchObject({ ok: false, reason: "not_reserved", status: null });
  });

  it("RPC throw → rpc_error", async () => {
    enable();
    mockReconcile.mockRejectedValueOnce(new Error("nope"));
    const r = await reconcileBillingReservation({ userId: "u1", workflowRunId: "run-1", actualTasks: 1 });
    expect(r).toMatchObject({ ok: false, reason: "rpc_error" });
  });
});

describe("releaseBillingReservation", () => {
  it("flag disabled → skipped/disabled, no RPC call", async () => {
    const r = await releaseBillingReservation({ userId: "u1", workflowRunId: "run-1" });
    expect(r).toMatchObject({ ok: true, skipped: true, reason: "disabled" });
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("success maps released + status released", async () => {
    enable();
    mockRelease.mockResolvedValueOnce({ ok: true, reason: "released", reserved: 0, limit: 100, released: 4 });
    const r = await releaseBillingReservation({ userId: "u1", workflowRunId: "run-1" });
    expect(mockRelease).toHaveBeenCalledWith("u1", "run-1");
    expect(r).toMatchObject({ ok: true, status: "released", reason: "released", released: 4 });
  });

  it("nothing-to-release passes through", async () => {
    enable();
    mockRelease.mockResolvedValueOnce({ ok: true, reason: "nothing_to_release", reserved: 0, limit: 100, released: 0 });
    const r = await releaseBillingReservation({ userId: "u1", workflowRunId: "run-1" });
    expect(r).toMatchObject({ ok: true, reason: "nothing_to_release", status: null, released: 0 });
  });

  it("RPC throw → rpc_error", async () => {
    enable();
    mockRelease.mockRejectedValueOnce(new Error("down"));
    const r = await releaseBillingReservation({ userId: "u1", workflowRunId: "run-1" });
    expect(r).toMatchObject({ ok: false, reason: "rpc_error" });
  });
});

describe("releaseExpiredBillingReservations (ungated janitor)", () => {
  it("runs regardless of flag and maps the summary", async () => {
    // flag intentionally NOT enabled — sweep must still run
    mockReleaseExpired.mockResolvedValueOnce({ ok: true, releasedCount: 2, releasedTasks: 5 });
    const r = await releaseExpiredBillingReservations({ now: "2026-05-25T02:00:00Z" });
    expect(mockReleaseExpired).toHaveBeenCalledWith("2026-05-25T02:00:00Z");
    expect(r).toEqual({ ok: true, reason: "swept", releasedCount: 2, releasedTasks: 5 });
  });

  it("RPC throw → rpc_error with zero counts", async () => {
    mockReleaseExpired.mockRejectedValueOnce(new Error("sweep-fail"));
    const r = await releaseExpiredBillingReservations();
    expect(r).toMatchObject({ ok: false, reason: "rpc_error", releasedCount: 0, releasedTasks: 0 });
  });
});

describe("no secret / internals leakage in service results", () => {
  it("results contain only ids/counts/enums/amounts + operational error — no secrets", async () => {
    enable();
    const secretMarkers = ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "Bearer", "eyJ", "postgres://", "supabase.co"];
    // Even an RPC error result must not echo connection/secret internals.
    mockReserve.mockRejectedValueOnce(new Error("reserve_tasks_if_available RPC failed: permission denied"));
    mockReconcile.mockResolvedValueOnce({ ok: true, reason: "reconciled", used: 1, reserved: 0, limit: 10, charged: 1, refunded: 0 });
    mockRelease.mockResolvedValueOnce({ ok: true, reason: "released", reserved: 0, limit: 10, released: 1 });
    mockReleaseExpired.mockResolvedValueOnce({ ok: true, releasedCount: 0, releasedTasks: 0 });
    const results = JSON.stringify([
      await createBillingReservation({ userId: "u1", workflowRunId: "run-1", estimatedTasks: 1 }),
      await reconcileBillingReservation({ userId: "u1", workflowRunId: "run-1", actualTasks: 1 }),
      await releaseBillingReservation({ userId: "u1", workflowRunId: "run-1" }),
      await releaseExpiredBillingReservations(),
    ]);
    for (const m of secretMarkers) expect(results).not.toContain(m);
  });
});
