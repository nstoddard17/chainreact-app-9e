/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/check-slack-health (V2-READY-29).
 *
 * Uses the REAL requireCronAuth (with a test CRON_SECRET) so missing / wrong /
 * correct-secret behavior is proven end-to-end; only the health-check SERVICE is
 * mocked so the route's delegation, status mapping, and safe-aggregate response
 * are exercised in isolation. Mirrors sweep-stale-runs.route.test.ts.
 */

const mockRun = jest.fn();

jest.mock("@/services/integrations/slackHealthCheck", () => ({
  runSlackHealthCheck: (...args: unknown[]) => mockRun(...args),
}));

import { GET, POST } from "@/app/api/cron/check-slack-health/route";
import { DEFAULT_BATCH_LIMIT } from "@/app/api/cron/check-slack-health/constants";

const SECRET = "v2ready29-test-secret";

beforeEach(() => {
  mockRun.mockReset();
  process.env.CRON_SECRET = SECRET;
});

function req(opts: { method?: string; auth?: string | null; url?: string } = {}) {
  const method = opts.method ?? "POST";
  const headers: Record<string, string> = {};
  if (opts.auth !== null && opts.auth !== undefined) headers.authorization = opts.auth;
  return new Request(
    opts.url ?? "https://app.example.test/api/cron/check-slack-health",
    { method, headers },
  );
}

function outcome(over: Partial<Record<string, unknown>> = {}) {
  return {
    enabled: true,
    checked: 3,
    healthy: 2,
    cleared: 1,
    authFailed: 1,
    markedNeedsReconnect: 1,
    skipped: 0,
    errors: 0,
    ...over,
  };
}

describe("/api/cron/check-slack-health route", () => {
  it("rejects a missing cron secret with 401 and never calls the service", async () => {
    const res = await POST(req({ auth: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("rejects a wrong cron secret with 401 and never calls the service", async () => {
    const res = await POST(req({ auth: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unset (misconfiguration, not 401)", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("accepts the correct secret and delegates with the default batch limit", async () => {
    mockRun.mockResolvedValueOnce(outcome());
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith({ limit: DEFAULT_BATCH_LIMIT });
    expect(await res.json()).toEqual({ ok: true, ...outcome() });
  });

  it("accepts an authorized GET (Vercel cron sends GET)", async () => {
    mockRun.mockResolvedValueOnce(outcome({ enabled: false, checked: 0, healthy: 0, cleared: 0, authFailed: 0, markedNeedsReconnect: 0 }));
    const res = await GET(req({ method: "GET", auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith({ limit: DEFAULT_BATCH_LIMIT });
  });

  it("forwards a valid ?limit= query param", async () => {
    mockRun.mockResolvedValueOnce(outcome());
    await POST(
      req({ auth: `Bearer ${SECRET}`, url: "https://app.example.test/api/cron/check-slack-health?limit=50" }),
    );
    expect(mockRun).toHaveBeenCalledWith({ limit: 50 });
  });

  it("falls back to the default batch limit for an invalid ?limit=", async () => {
    mockRun.mockResolvedValueOnce(outcome());
    await POST(
      req({ auth: `Bearer ${SECRET}`, url: "https://app.example.test/api/cron/check-slack-health?limit=-3" }),
    );
    expect(mockRun).toHaveBeenCalledWith({ limit: DEFAULT_BATCH_LIMIT });
  });

  it("returns a generic 500 (fail-safe) when the service throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRun.mockRejectedValueOnce(new Error("DB down"));
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Slack health-check cron failed." });
    errSpy.mockRestore();
  });

  it("response exposes numeric aggregate counts only (no integration ids / provider data)", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    mockRun.mockResolvedValueOnce(outcome());
    const res = await POST(req({ auth: `Bearer ${SECRET}` }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        "ok",
        "enabled",
        "checked",
        "healthy",
        "cleared",
        "authFailed",
        "markedNeedsReconnect",
        "skipped",
        "errors",
      ].sort(),
    );
    for (const [k, v] of Object.entries(body)) {
      if (k === "ok" || k === "enabled") expect(typeof v).toBe("boolean");
      else expect(typeof v).toBe("number");
    }
    infoSpy.mockRestore();
  });
});
