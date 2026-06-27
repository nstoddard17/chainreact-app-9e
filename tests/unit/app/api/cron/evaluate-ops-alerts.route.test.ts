/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/evaluate-ops-alerts (Phase 8b launch alerts).
 *
 * Uses the REAL requireCronAuth (test CRON_SECRET) so missing/wrong/correct-secret
 * behavior is proven through the route; the evaluator SERVICE is mocked so the
 * route's auth gate, delegation, status mapping, and self-heartbeat are exercised
 * in isolation. Mirrors sweep-stale-runs.route.test.ts.
 */

const mockEvaluate = jest.fn();
const mockBuildDeps = jest.fn(() => ({ __deps: true }));
jest.mock("@/services/observability/opsAlertEvaluator", () => ({
  evaluateOpsAlerts: (...args: unknown[]) => mockEvaluate(...args),
  buildDefaultDeps: () => mockBuildDeps(),
}));

const mockRecord = jest.fn();
jest.mock("@/repositories/opsSignalEvents", () => ({
  record: (...args: unknown[]) => mockRecord(...args),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET, POST } from "@/app/api/cron/evaluate-ops-alerts/route";

const SECRET = "ops-alerts-test-secret";

const SUMMARY = {
  fired: 1,
  delivered: 1,
  suppressed: 0,
  resolved: 0,
  queueMonitored: false,
  candidateCount: 1,
  readerErrors: [],
  retention: { signalsDeleted: 0, alertsDeleted: 0 },
};

beforeEach(() => {
  mockEvaluate.mockReset();
  mockBuildDeps.mockClear();
  mockRecord.mockReset();
  mockRecord.mockResolvedValue(undefined);
  process.env.CRON_SECRET = SECRET;
});

function req(opts: { method?: string; auth?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (opts.auth !== null && opts.auth !== undefined) headers.authorization = opts.auth;
  return new Request("https://app.example.test/api/cron/evaluate-ops-alerts", {
    method: opts.method ?? "POST",
    headers,
  });
}

describe("/api/cron/evaluate-ops-alerts route", () => {
  it("rejects a missing cron secret with 401 and never evaluates", async () => {
    const res = await POST(req({ auth: null }));
    expect(res.status).toBe(401);
    expect(mockEvaluate).not.toHaveBeenCalled();
    // 401 probe must NOT write a heartbeat (no service-role write for junk traffic)
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("rejects a wrong cron secret with 401", async () => {
    const res = await POST(req({ auth: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unset (misconfiguration, not 401)", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it("accepts the correct secret, evaluates, and returns the summary", async () => {
    mockEvaluate.mockResolvedValueOnce(SUMMARY);
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(mockEvaluate).toHaveBeenCalledWith({ __deps: true });
    expect(await res.json()).toEqual({ ok: true, ...SUMMARY });
  });

  it("records its own ok heartbeat on a successful tick (self-monitoring)", async () => {
    mockEvaluate.mockResolvedValueOnce(SUMMARY);
    await GET(req({ method: "GET", auth: `Bearer ${SECRET}` }));
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "cron_run", source: "evaluate-ops-alerts", outcome: "ok" }),
    );
  });

  it("returns a generic 500 (fail-safe) and a failed heartbeat when evaluation throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockEvaluate.mockRejectedValueOnce(new Error("evaluator boom"));
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Ops-alert evaluation failed." });
    // route catches the throw and returns 500 → heartbeat records a failed tick
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ source: "evaluate-ops-alerts", outcome: "failed" }),
    );
    errSpy.mockRestore();
  });
});

describe("evaluate-ops-alerts cron is scheduled in vercel.json", () => {
  it("registers the evaluator every 5 minutes (the automated server-side path)", () => {
    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const crons = (JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
    const entry = crons.find((c) => c.path === "/api/cron/evaluate-ops-alerts");
    expect(entry).toBeDefined();
    expect(entry!.schedule.trim().split(/\s+/)).toHaveLength(5);
    const [minute, hour] = entry!.schedule.trim().split(/\s+/);
    expect(hour).toBe("*");
    const step = /^\*\/(\d+)$/.exec(minute!);
    expect(step !== null && Number(step[1]) <= 60).toBe(true);
  });
});
