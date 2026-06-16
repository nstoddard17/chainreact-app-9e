/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/renew-watch-subscriptions. Mocks
 * runRenewals + requireCronAuth so the route's own status-code mapping
 * can be exercised in isolation. Mirrors the poll-triggers route test.
 */
const mockRequireCronAuth = jest.fn();
const mockRunRenewals = jest.fn();

jest.mock("@/services/cron/auth", () => ({
  requireCronAuth: (...args: unknown[]) => mockRequireCronAuth(...args),
}));

jest.mock("@/services/triggers/runRenewals", () => ({
  runRenewals: (...args: unknown[]) => mockRunRenewals(...args),
}));

jest.mock("@/integrations/_registry", () => ({}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GET,
  POST,
} from "@/app/api/cron/renew-watch-subscriptions/route";

beforeEach(() => {
  mockRequireCronAuth.mockReset();
  mockRunRenewals.mockReset();
});

function req(method: string = "POST") {
  return new Request(
    "https://app.example.test/api/cron/renew-watch-subscriptions",
    { method },
  );
}

describe("/api/cron/renew-watch-subscriptions route", () => {
  it("returns 401 when requireCronAuth fails", async () => {
    mockRequireCronAuth.mockReturnValueOnce({
      authorized: false,
      message: "missing bearer",
      status: 401,
    });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "missing bearer" });
    expect(mockRunRenewals).not.toHaveBeenCalled();
  });

  it("delegates to runRenewals on authorized POST and returns its summary", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockRunRenewals.mockResolvedValueOnce({
      examined: 3,
      renewed: 2,
      skipped: 1,
      errors: 0,
      startedAt: "2026-05-08T12:00:00Z",
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      examined: 3,
      renewed: 2,
      skipped: 1,
      errors: 0,
      startedAt: "2026-05-08T12:00:00Z",
    });
  });

  it("delegates to runRenewals on authorized GET (Vercel cron sends GET)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockRunRenewals.mockResolvedValueOnce({
      examined: 0,
      renewed: 0,
      skipped: 0,
      errors: 0,
      startedAt: "now",
    });

    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
  });

  it("V2-READY-39 — logs a structured done summary with counts (incl. errors)", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockRunRenewals.mockResolvedValueOnce({
      examined: 5,
      renewed: 3,
      skipped: 1,
      errors: 1,
      startedAt: "2026-05-08T12:00:00Z",
    });

    await POST(req());

    const logged = infoSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("cron.renew_watch_subscriptions.done");
    expect(logged).toContain('"errors":1'); // a silent renewal failure would expire a subscription
    infoSpy.mockRestore();
  });

  it("returns 500 with a generic error when runRenewals throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockRunRenewals.mockRejectedValueOnce(new Error("DB down"));

    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Renewal cron failed." });
    errSpy.mockRestore();
  });
});

/**
 * V2-READY-33 — Schedule guard. Expiring webhook subscriptions only get renewed
 * if this cron is scheduled; dropping it silently lets subscriptions lapse and
 * webhook-triggered workflows stop firing.
 */
describe("renew-watch-subscriptions cron is scheduled in vercel.json", () => {
  const SCHEDULE_PATH = "/api/cron/renew-watch-subscriptions";

  function readCrons(): Array<{ path: string; schedule: string }> {
    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    return (JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
  }

  it("registers the renewal cron on a five-field schedule", () => {
    const entry = readCrons().find((c) => c.path === SCHEDULE_PATH);
    expect(entry).toBeDefined();
    expect(entry!.schedule.trim().split(/\s+/)).toHaveLength(5);
  });

  it("runs at least every 10 minutes (renewal threshold cadence)", () => {
    const entry = readCrons().find((c) => c.path === SCHEDULE_PATH);
    expect(entry).toBeDefined();
    const [minute, hour] = entry!.schedule.trim().split(/\s+/);
    expect(hour).toBe("*");
    // minute must be '*' or '*/N' with N <= 10 so renewals run frequently.
    const step = /^\*\/(\d+)$/.exec(minute!);
    expect(minute === "*" || (step !== null && Number(step[1]) <= 10)).toBe(true);
  });
});
