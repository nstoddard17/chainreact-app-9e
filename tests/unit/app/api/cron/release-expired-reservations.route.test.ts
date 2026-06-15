/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/release-expired-reservations (Slice 4.COST-15K).
 *
 * Uses the REAL requireCronAuth (with a test CRON_SECRET) so missing / wrong /
 * correct-secret behavior is proven through the route; only the COST-13
 * releaseExpiredBillingReservations SERVICE is mocked. The service is NOT
 * flag-gated (janitor), so these tests never touch ENABLE_RESERVE_RECONCILE_*.
 * Mirrors cleanup-workflow-files.route.test.ts.
 */

const mockReleaseExpired = jest.fn();

jest.mock("@/services/billing/reserveReconcileBilling", () => ({
  releaseExpiredBillingReservations: (...args: unknown[]) => mockReleaseExpired(...args),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET, POST } from "@/app/api/cron/release-expired-reservations/route";

const SECRET = "cost15k-test-secret";

beforeEach(() => {
  mockReleaseExpired.mockReset();
  process.env.CRON_SECRET = SECRET;
});

function req(opts: { method?: string; auth?: string | null } = {}) {
  const method = opts.method ?? "POST";
  const headers: Record<string, string> = {};
  if (opts.auth !== null && opts.auth !== undefined) headers.authorization = opts.auth;
  return new Request(
    "https://app.example.test/api/cron/release-expired-reservations",
    { method, headers },
  );
}

describe("/api/cron/release-expired-reservations route", () => {
  it("rejects a missing cron secret with 401 and never calls the sweep", async () => {
    const res = await POST(req({ auth: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockReleaseExpired).not.toHaveBeenCalled();
  });

  it("rejects a wrong cron secret with 401 and never calls the sweep", async () => {
    const res = await POST(req({ auth: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(mockReleaseExpired).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unset (misconfiguration, not 401)", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(mockReleaseExpired).not.toHaveBeenCalled();
  });

  it("accepts the correct cron secret and returns the release summary", async () => {
    mockReleaseExpired.mockResolvedValueOnce({
      ok: true,
      reason: "swept",
      releasedCount: 3,
      releasedTasks: 7,
    });
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(mockReleaseExpired).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({
      ok: true,
      releasedCount: 3,
      releasedTasks: 7,
    });
  });

  it("accepts an authorized GET (Vercel cron sends GET)", async () => {
    mockReleaseExpired.mockResolvedValueOnce({
      ok: true,
      reason: "swept",
      releasedCount: 0,
      releasedTasks: 0,
    });
    const res = await GET(req({ method: "GET", auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
  });

  it("maps a service ok:false (RPC error, never throws) to a 500", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReleaseExpired.mockResolvedValueOnce({
      ok: false,
      reason: "rpc_error",
      releasedCount: 0,
      releasedTasks: 0,
      error: "boom",
    });
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Expired-reservation sweep cron failed.",
    });
    errSpy.mockRestore();
  });

  it("returns a generic 500 (fail-safe) when the service throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReleaseExpired.mockRejectedValueOnce(new Error("unexpected"));
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("response payload exposes count fields only", async () => {
    mockReleaseExpired.mockResolvedValueOnce({
      ok: true,
      reason: "swept",
      releasedCount: 1,
      releasedTasks: 2,
    });
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["ok", "releasedCount", "releasedTasks"].sort(),
    );
  });
});

/**
 * V2-READY-33 — Schedule guard. Orphaned billing reservations only get reclaimed
 * if this cron is scheduled; dropping it silently strands reserved task balance.
 */
describe("release-expired-reservations cron is scheduled in vercel.json", () => {
  const SCHEDULE_PATH = "/api/cron/release-expired-reservations";

  function readCrons(): Array<{ path: string; schedule: string }> {
    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    return (JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
  }

  it("registers the reservation-release cron on a five-field schedule", () => {
    const entry = readCrons().find((c) => c.path === SCHEDULE_PATH);
    expect(entry).toBeDefined();
    expect(entry!.schedule.trim().split(/\s+/)).toHaveLength(5);
  });

  it("runs at least hourly", () => {
    const entry = readCrons().find((c) => c.path === SCHEDULE_PATH);
    expect(entry).toBeDefined();
    const [minute, hour] = entry!.schedule.trim().split(/\s+/);
    expect(hour).toBe("*");
    const step = /^\*\/(\d+)$/.exec(minute!);
    const okMinute =
      minute === "*" || /^\d+$/.test(minute!) || (step !== null && Number(step[1]) <= 60);
    expect(okMinute).toBe(true);
  });
});
