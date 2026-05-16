/**
 * @jest-environment node
 *
 * Route-level test for /api/cron/run-scheduled-triggers — Native-nodes
 * Slice 2 Commit 3.
 *
 * Mirrors tests/unit/app/api/cron/poll-triggers.route.test.ts: mocks the
 * scheduler + registry side-effect so the route is tested in isolation.
 * Verifies the auth gates (missing / wrong / unconfigured CRON_SECRET)
 * and the success path on both GET and POST.
 */

const mockRunScheduledTriggers = jest.fn();
jest.mock("@/services/cron/runScheduledTriggers", () => ({
  runScheduledTriggers: (...args: unknown[]) =>
    mockRunScheduledTriggers(...args),
}));

// Side-effect registry import: no-op so loading the route doesn't pull
// in all provider modules.
jest.mock("@/integrations/_registry", () => ({}));

import { GET, POST } from "@/app/api/cron/run-scheduled-triggers/route";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  mockRunScheduledTriggers.mockReset();
  process.env.CRON_SECRET = "test-secret";
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_SECRET;
  }
});

function reqWithAuth(method: "GET" | "POST", header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request(
    "http://localhost/api/cron/run-scheduled-triggers",
    { method, headers },
  );
}

describe("/api/cron/run-scheduled-triggers — auth", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await POST(reqWithAuth("POST", null));
    expect(res.status).toBe(401);
    expect(mockRunScheduledTriggers).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer token is wrong", async () => {
    const res = await POST(reqWithAuth("POST", "Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockRunScheduledTriggers).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(reqWithAuth("POST", "Bearer anything"));
    expect(res.status).toBe(500);
    expect(mockRunScheduledTriggers).not.toHaveBeenCalled();
  });
});

describe("/api/cron/run-scheduled-triggers — happy path", () => {
  it("authorized POST delegates to runScheduledTriggers", async () => {
    mockRunScheduledTriggers.mockResolvedValueOnce({
      examined: 2,
      fired: 1,
      skipped: 1,
      errors: 0,
      startedAt: "2026-05-16T12:00:00Z",
    });
    const res = await POST(reqWithAuth("POST", "Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.examined).toBe(2);
    expect(body.fired).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.errors).toBe(0);
    expect(mockRunScheduledTriggers).toHaveBeenCalledTimes(1);
  });

  it("authorized GET also delegates (Vercel cron sends GET)", async () => {
    mockRunScheduledTriggers.mockResolvedValueOnce({
      examined: 0,
      fired: 0,
      skipped: 0,
      errors: 0,
      startedAt: "2026-05-16T12:00:00Z",
    });
    const res = await GET(reqWithAuth("GET", "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(mockRunScheduledTriggers).toHaveBeenCalledTimes(1);
  });

  it("scheduler throwing produces a generic 500 (no internal leakage)", async () => {
    mockRunScheduledTriggers.mockRejectedValueOnce(
      new Error("db connection lost"),
    );
    const res = await POST(reqWithAuth("POST", "Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("db connection lost");
    expect(body.error).toMatch(/Scheduled-triggers cron failed/);
  });
});
