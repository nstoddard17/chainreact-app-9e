/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/purge-pending-deletions (4.ACCOUNT-MODEL-10c).
 * Mocks cron auth, the purge flag, and the sweep service so the route's own
 * auth + flag-gate + status mapping is exercised in isolation.
 */

const mockRequireCronAuth = jest.fn();
const mockIsEnabled = jest.fn();
const mockPurgeDue = jest.fn();

jest.mock("@/services/cron/auth", () => ({
  requireCronAuth: (...a: unknown[]) => mockRequireCronAuth(...a),
}));
jest.mock("@/services/accounts/accountDeletionFlags", () => ({
  isAccountPurgeCronEnabled: (...a: unknown[]) => mockIsEnabled(...a),
}));
jest.mock("@/services/accounts/accountPurge", () => ({
  purgeDuePendingAccounts: (...a: unknown[]) => mockPurgeDue(...a),
}));

import { GET, POST } from "@/app/api/cron/purge-pending-deletions/route";

beforeEach(() => {
  mockRequireCronAuth.mockReset();
  mockIsEnabled.mockReset();
  mockPurgeDue.mockReset();
});

function req(method = "POST") {
  return new Request("https://app.example.test/api/cron/purge-pending-deletions", {
    method,
  });
}

describe("/api/cron/purge-pending-deletions route", () => {
  it("returns 401 when unauthorized and never touches the purge service", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: false, message: "Unauthorized", status: 401 });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockPurgeDue).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unset (misconfig)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({
      authorized: false,
      message: "Server misconfiguration: CRON_SECRET is not set.",
      status: 500,
    });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockPurgeDue).not.toHaveBeenCalled();
  });

  it("when the flag is OFF: authenticates but does NOT purge (enabled:false)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(false);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enabled: false });
    expect(mockPurgeDue).not.toHaveBeenCalled();
  });

  it("when the flag is ON: runs the sweep and returns its counts", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurgeDue.mockResolvedValueOnce({
      scanned: 3, purged: 2, recovered: 0, skipped: 1, failed: 0,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, enabled: true, scanned: 3, purged: 2, recovered: 0, skipped: 1, failed: 0,
    });
    expect(mockPurgeDue).toHaveBeenCalledTimes(1);
  });

  it("runs on authorized GET too (Vercel cron sends GET)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurgeDue.mockResolvedValueOnce({ scanned: 0, purged: 0, recovered: 0, skipped: 0, failed: 0 });
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
  });

  it("returns 500 with a generic error when the sweep throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurgeDue.mockRejectedValueOnce(new Error("DB down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Account-purge sweep cron failed." });
    errSpy.mockRestore();
  });

  it("response exposes no account/user ids (counts only)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurgeDue.mockResolvedValueOnce({ scanned: 1, purged: 1, recovered: 0, skipped: 0, failed: 0 });
    const res = await POST(req());
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["enabled", "failed", "ok", "purged", "recovered", "scanned", "skipped"].sort(),
    );
  });
});
