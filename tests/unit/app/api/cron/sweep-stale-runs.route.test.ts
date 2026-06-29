/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/sweep-stale-runs (Slice 4.COST-15K).
 *
 * Uses the REAL requireCronAuth (with a test CRON_SECRET) so the missing /
 * wrong / correct-secret behavior is proven end-to-end through the route; only
 * the sweep SERVICE is mocked so the route's delegation + status mapping are
 * exercised in isolation. Mirrors cleanup-workflow-files.route.test.ts.
 */

const mockSweep = jest.fn();
const mockQueuedSweep = jest.fn();

jest.mock("@/services/execution/staleWorkflowRunSweep", () => ({
  sweepStaleRunningWorkflowRuns: (...args: unknown[]) => mockSweep(...args),
}));
jest.mock("@/services/execution/staleQueuedRunSweep", () => ({
  sweepStaleQueuedWorkflowRuns: (...args: unknown[]) => mockQueuedSweep(...args),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET, POST } from "@/app/api/cron/sweep-stale-runs/route";
import { DEFAULT_BATCH_LIMIT } from "@/app/api/cron/sweep-stale-runs/constants";

const SECRET = "cost15k-test-secret";

beforeEach(() => {
  mockSweep.mockReset();
  mockQueuedSweep.mockReset();
  // Default: the queued-age finalizer sweeps nothing (most ticks).
  mockQueuedSweep.mockResolvedValue({
    sweptCount: 0,
    runIds: [],
    cutoff: "2026-05-25T00:00:00.000Z",
    olderThanMs: 1_800_000,
  });
  process.env.CRON_SECRET = SECRET;
});

function req(opts: { method?: string; auth?: string | null; url?: string } = {}) {
  const method = opts.method ?? "POST";
  const headers: Record<string, string> = {};
  if (opts.auth !== null && opts.auth !== undefined) headers.authorization = opts.auth;
  return new Request(
    opts.url ?? "https://app.example.test/api/cron/sweep-stale-runs",
    { method, headers },
  );
}

function okOutcome(over: Partial<Record<string, unknown>> = {}) {
  return {
    sweptCount: 2,
    runIds: ["r1", "r2"],
    cutoff: "2026-05-25T00:00:00.000Z",
    olderThanMs: 3_600_000,
    ...over,
  };
}

describe("/api/cron/sweep-stale-runs route", () => {
  it("rejects a missing cron secret with 401 and never calls the sweep", async () => {
    const res = await POST(req({ auth: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockSweep).not.toHaveBeenCalled();
  });

  it("rejects a wrong cron secret with 401 and never calls the sweep", async () => {
    const res = await POST(req({ auth: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(mockSweep).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unset (misconfiguration, not 401)", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(mockSweep).not.toHaveBeenCalled();
  });

  it("accepts the correct cron secret and delegates to the sweep (default batch limit)", async () => {
    mockSweep.mockResolvedValueOnce(okOutcome());
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(mockSweep).toHaveBeenCalledWith({ limit: DEFAULT_BATCH_LIMIT });
    // The reaper also runs the queued-age finalizer in the same tick.
    expect(mockQueuedSweep).toHaveBeenCalledWith({ limit: DEFAULT_BATCH_LIMIT });
    expect(await res.json()).toEqual({
      ok: true,
      sweptCount: 2,
      queuedSweptCount: 0,
      cutoff: "2026-05-25T00:00:00.000Z",
      olderThanMs: 3_600_000,
    });
  });

  it("accepts an authorized GET (Vercel cron sends GET)", async () => {
    mockSweep.mockResolvedValueOnce(okOutcome({ sweptCount: 0, runIds: [] }));
    const res = await GET(req({ method: "GET", auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(mockSweep).toHaveBeenCalledWith({ limit: DEFAULT_BATCH_LIMIT });
  });

  it("forwards a valid ?limit= query param to the sweep", async () => {
    mockSweep.mockResolvedValueOnce(okOutcome());
    await POST(
      req({
        auth: `Bearer ${SECRET}`,
        url: "https://app.example.test/api/cron/sweep-stale-runs?limit=50",
      }),
    );
    expect(mockSweep).toHaveBeenCalledWith({ limit: 50 });
  });

  it("falls back to the default batch limit for an invalid ?limit=", async () => {
    mockSweep.mockResolvedValueOnce(okOutcome());
    await POST(
      req({
        auth: `Bearer ${SECRET}`,
        url: "https://app.example.test/api/cron/sweep-stale-runs?limit=-3",
      }),
    );
    expect(mockSweep).toHaveBeenCalledWith({ limit: DEFAULT_BATCH_LIMIT });
  });

  it("returns a generic 500 (fail-safe) when the sweep throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockSweep.mockRejectedValueOnce(new Error("DB down"));
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Stale-run sweep cron failed." });
    errSpy.mockRestore();
  });

  it("response payload exposes count/cutoff fields only (no run ids)", async () => {
    mockSweep.mockResolvedValueOnce(okOutcome());
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["cutoff", "ok", "olderThanMs", "queuedSweptCount", "sweptCount"].sort(),
    );
    expect(JSON.stringify(body)).not.toContain("r1");
  });
});

/**
 * V2-READY-1 — Schedule guard. The whole reliability guarantee (a crashed run
 * eventually reaches a terminal status) depends on this cron actually being
 * SCHEDULED, not just callable. Removing the `vercel.json` entry would silently
 * re-create the orphaned-`running` risk the readiness audit flagged, with every
 * route/service/repo test still green. This test fails loudly if the schedule
 * is dropped or slowed below hourly.
 */
describe("sweep-stale-runs cron is scheduled in vercel.json", () => {
  const SWEEP_PATH = "/api/cron/sweep-stale-runs";

  function readCrons(): Array<{ path: string; schedule: string }> {
    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    return (JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
  }

  it("registers the stale-run sweep on a cron schedule", () => {
    const entry = readCrons().find((c) => c.path === SWEEP_PATH);
    expect(entry).toBeDefined();
    // Five-field cron expression.
    expect(entry!.schedule.trim().split(/\s+/)).toHaveLength(5);
  });

  it("runs at least hourly so stale runs (default 60-min cutoff) are caught promptly", () => {
    const entry = readCrons().find((c) => c.path === SWEEP_PATH);
    expect(entry).toBeDefined();
    const [minute, hour] = entry!.schedule.trim().split(/\s+/);
    // Hour field must be every-hour so the sweep fires within the hour.
    expect(hour).toBe("*");
    // Minute field must run at least once an hour: '*' (every minute) or a
    // '*/N' step with N <= 60. A fixed minute ("30") also runs hourly.
    const stepMatch = /^\*\/(\d+)$/.exec(minute!);
    const okMinute =
      minute === "*" ||
      /^\d+$/.test(minute!) ||
      (stepMatch !== null && Number(stepMatch[1]) <= 60);
    expect(okMinute).toBe(true);
  });
});
