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

jest.mock("@/services/execution/staleWorkflowRunSweep", () => ({
  sweepStaleRunningWorkflowRuns: (...args: unknown[]) => mockSweep(...args),
}));

import {
  GET,
  POST,
  DEFAULT_BATCH_LIMIT,
} from "@/app/api/cron/sweep-stale-runs/route";

const SECRET = "cost15k-test-secret";

beforeEach(() => {
  mockSweep.mockReset();
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
    expect(await res.json()).toEqual({
      ok: true,
      sweptCount: 2,
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
      ["cutoff", "ok", "olderThanMs", "sweptCount"].sort(),
    );
    expect(JSON.stringify(body)).not.toContain("r1");
  });
});
