/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/purge-anonymized-ledgers (4.ACCOUNT-MODEL-10d).
 * Mocks cron auth, the ledger-purge flag, and the sweep service so the route's
 * auth + flag-gate + status mapping is exercised in isolation.
 */

const mockRequireCronAuth = jest.fn();
const mockIsEnabled = jest.fn();
const mockPurge = jest.fn();

jest.mock("@/services/cron/auth", () => ({
  requireCronAuth: (...a: unknown[]) => mockRequireCronAuth(...a),
}));
jest.mock("@/services/accounts/accountDeletionFlags", () => ({
  isLedgerPurgeCronEnabled: (...a: unknown[]) => mockIsEnabled(...a),
}));
jest.mock("@/services/accounts/ledgerPurge", () => ({
  purgeExpiredAnonymizedLedgers: (...a: unknown[]) => mockPurge(...a),
}));

import { GET, POST } from "@/app/api/cron/purge-anonymized-ledgers/route";

beforeEach(() => {
  mockRequireCronAuth.mockReset();
  mockIsEnabled.mockReset();
  mockPurge.mockReset();
});

function req(method = "POST") {
  return new Request("https://app.example.test/api/cron/purge-anonymized-ledgers", {
    method,
  });
}

describe("/api/cron/purge-anonymized-ledgers route", () => {
  it("returns 401 when unauthorized and never touches the purge service", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: false, message: "Unauthorized", status: 401 });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unset (misconfig)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({
      authorized: false,
      message: "Server misconfiguration: CRON_SECRET is not set.",
      status: 500,
    });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it("when the flag is OFF: authenticates but does NOT purge (enabled:false)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(false);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enabled: false });
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it("when the flag is ON: runs the sweep and returns its counts", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurge.mockResolvedValueOnce({
      taskUsageEvents: 3, aiCostEvents: 1, billingShadowComparisons: 0, total: 4,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, enabled: true, taskUsageEvents: 3, aiCostEvents: 1, billingShadowComparisons: 0, total: 4,
    });
    expect(mockPurge).toHaveBeenCalledTimes(1);
  });

  it("runs on authorized GET too (Vercel cron sends GET)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurge.mockResolvedValueOnce({ taskUsageEvents: 0, aiCostEvents: 0, billingShadowComparisons: 0, total: 0 });
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
  });

  it("returns 500 with a generic error when the sweep throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurge.mockRejectedValueOnce(new Error("DB down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Anonymized-ledger purge cron failed." });
    errSpy.mockRestore();
  });

  it("response exposes counts only (no row/account/user ids)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurge.mockResolvedValueOnce({ taskUsageEvents: 1, aiCostEvents: 0, billingShadowComparisons: 0, total: 1 });
    const res = await POST(req());
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["aiCostEvents", "billingShadowComparisons", "enabled", "ok", "taskUsageEvents", "total"].sort(),
    );
  });
});
