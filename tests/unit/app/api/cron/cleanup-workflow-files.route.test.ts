/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/cleanup-workflow-files. Mocks
 * cleanupExpiredFiles + requireCronAuth so the route's own status-code
 * mapping can be exercised in isolation. Mirrors the poll-triggers and
 * renew-watch-subscriptions route tests.
 */

const mockRequireCronAuth = jest.fn();
const mockCleanupExpiredFiles = jest.fn();

jest.mock("@/services/cron/auth", () => ({
  requireCronAuth: (...args: unknown[]) => mockRequireCronAuth(...args),
}));

jest.mock("@/services/files/cleanupExpiredFiles", () => ({
  cleanupExpiredFiles: (...args: unknown[]) => mockCleanupExpiredFiles(...args),
}));

import {
  GET,
  POST,
} from "@/app/api/cron/cleanup-workflow-files/route";

beforeEach(() => {
  mockRequireCronAuth.mockReset();
  mockCleanupExpiredFiles.mockReset();
});

function req(method: string = "POST") {
  return new Request(
    "https://app.example.test/api/cron/cleanup-workflow-files",
    { method },
  );
}

describe("/api/cron/cleanup-workflow-files route", () => {
  it("returns 401 with the requireCronAuth message when unauthorized", async () => {
    mockRequireCronAuth.mockReturnValueOnce({
      authorized: false,
      message: "Unauthorized",
      status: 401,
    });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockCleanupExpiredFiles).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unset (requireCronAuth signals misconfig)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({
      authorized: false,
      message: "Server misconfiguration: CRON_SECRET is not set.",
      status: 500,
    });
    const res = await POST(req());
    expect(res.status).toBe(500);
  });

  it("delegates to cleanupExpiredFiles on authorized POST and returns its summary", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockCleanupExpiredFiles.mockResolvedValueOnce({
      scanned: 7,
      storageDeleted: 6,
      metadataDeleted: 6,
      failed: 1,
      startedAt: "2026-05-12T12:00:00Z",
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      scanned: 7,
      storageDeleted: 6,
      metadataDeleted: 6,
      failed: 1,
      startedAt: "2026-05-12T12:00:00Z",
    });
  });

  it("delegates to cleanupExpiredFiles on authorized GET (Vercel cron sends GET)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockCleanupExpiredFiles.mockResolvedValueOnce({
      scanned: 0,
      storageDeleted: 0,
      metadataDeleted: 0,
      failed: 0,
      startedAt: "2026-05-12T12:00:00Z",
    });

    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
  });

  it("returns 500 with a generic error when cleanupExpiredFiles throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockCleanupExpiredFiles.mockRejectedValueOnce(new Error("DB down"));

    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Cleanup cron failed." });
    errSpy.mockRestore();
  });

  it("response payload exposes count fields only (no row ids, paths, or user ids)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockCleanupExpiredFiles.mockResolvedValueOnce({
      scanned: 1,
      storageDeleted: 1,
      metadataDeleted: 1,
      failed: 0,
      startedAt: "2026-05-12T12:00:00Z",
    });

    const res = await POST(req());
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        "failed",
        "metadataDeleted",
        "ok",
        "scanned",
        "startedAt",
        "storageDeleted",
      ].sort(),
    );
  });
});
