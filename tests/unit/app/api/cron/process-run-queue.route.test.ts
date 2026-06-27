/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/process-run-queue (Slice 6.DURABLE-QUEUE-1).
 *
 * Uses the REAL requireCronAuth (with a test CRON_SECRET) so the missing /
 * wrong / correct-secret behavior is proven end-to-end; only the processor
 * SERVICE is mocked so the route's auth gate, delegation, and status mapping are
 * exercised in isolation. Mirrors sweep-stale-runs.route.test.ts.
 */

const mockProcess = jest.fn();

jest.mock("@/services/execution/runQueueProcessor", () => ({
  processQueuedRuns: (...args: unknown[]) => mockProcess(...args),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET, POST } from "@/app/api/cron/process-run-queue/route";
import { DEFAULT_QUEUE_BATCH_LIMIT } from "@/app/api/cron/process-run-queue/constants";

const SECRET = "durable-queue-test-secret";

beforeEach(() => {
  mockProcess.mockReset();
  process.env.CRON_SECRET = SECRET;
});

function req(opts: { method?: string; auth?: string | null; url?: string } = {}) {
  const method = opts.method ?? "POST";
  const headers: Record<string, string> = {};
  if (opts.auth !== null && opts.auth !== undefined) headers.authorization = opts.auth;
  return new Request(
    opts.url ?? "https://app.example.test/api/cron/process-run-queue",
    { method, headers },
  );
}

function okOutcome(over: Partial<Record<string, unknown>> = {}) {
  return { fetched: 2, processed: 2, failed: 0, ...over };
}

describe("/api/cron/process-run-queue route", () => {
  it("rejects a missing cron secret with 401 and never drains the queue", async () => {
    const res = await POST(req({ auth: null }));
    expect(res.status).toBe(401);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("rejects a wrong cron secret with 401 and never drains the queue", async () => {
    const res = await POST(req({ auth: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unset (misconfiguration, not 401)", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("accepts the correct secret and delegates with the default batch limit", async () => {
    mockProcess.mockResolvedValueOnce(okOutcome());
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledWith({ limit: DEFAULT_QUEUE_BATCH_LIMIT });
    expect(await res.json()).toEqual({
      ok: true,
      fetched: 2,
      processed: 2,
      failed: 0,
      limit: DEFAULT_QUEUE_BATCH_LIMIT,
    });
  });

  it("accepts an authorized GET (Vercel cron sends GET)", async () => {
    mockProcess.mockResolvedValueOnce(okOutcome({ fetched: 0, processed: 0 }));
    const res = await GET(req({ method: "GET", auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledWith({ limit: DEFAULT_QUEUE_BATCH_LIMIT });
  });

  it("forwards a valid ?limit= query param", async () => {
    mockProcess.mockResolvedValueOnce(okOutcome());
    await POST(
      req({
        auth: `Bearer ${SECRET}`,
        url: "https://app.example.test/api/cron/process-run-queue?limit=5",
      }),
    );
    expect(mockProcess).toHaveBeenCalledWith({ limit: 5 });
  });

  it("falls back to the default for an invalid ?limit=", async () => {
    mockProcess.mockResolvedValueOnce(okOutcome());
    await POST(
      req({
        auth: `Bearer ${SECRET}`,
        url: "https://app.example.test/api/cron/process-run-queue?limit=0",
      }),
    );
    expect(mockProcess).toHaveBeenCalledWith({ limit: DEFAULT_QUEUE_BATCH_LIMIT });
  });

  it("returns a generic 500 (fail-safe) when the processor throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockProcess.mockRejectedValueOnce(new Error("DB down"));
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Run-queue processor cron failed." });
    errSpy.mockRestore();
  });
});

/**
 * Schedule guard. The durability guarantee for webhook / polling / dropped
 * run-now runs depends on this cron actually being SCHEDULED, not just callable.
 * Removing the vercel.json entry would silently re-create the "queued run never
 * executes" risk with every other test still green. This fails loudly if the
 * schedule is dropped or slowed below every-minute.
 */
describe("process-run-queue cron is scheduled every minute in vercel.json", () => {
  const QUEUE_PATH = "/api/cron/process-run-queue";

  function readCrons(): Array<{ path: string; schedule: string }> {
    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    return (JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
  }

  it("registers the run-queue processor on an every-minute schedule", () => {
    const entry = readCrons().find((c) => c.path === QUEUE_PATH);
    expect(entry).toBeDefined();
    expect(entry!.schedule.trim()).toBe("* * * * *");
  });
});
