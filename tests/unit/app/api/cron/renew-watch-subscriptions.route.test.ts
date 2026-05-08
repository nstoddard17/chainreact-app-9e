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
