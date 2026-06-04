/**
 * @jest-environment node
 *
 * Route-level tests for /api/cron/purge-trashed-workflows (WF-4). Mocks cron
 * auth, the purge flag, and the sweep service so the route's auth + flag-gate +
 * status mapping is exercised in isolation.
 */

const mockRequireCronAuth = jest.fn();
const mockIsEnabled = jest.fn();
const mockPurgeDue = jest.fn();

jest.mock("@/services/cron/auth", () => ({
  requireCronAuth: (...a: unknown[]) => mockRequireCronAuth(...a),
}));
jest.mock("@/services/workflowFolders/trashFlags", () => ({
  isWorkflowTrashPurgeCronEnabled: (...a: unknown[]) => mockIsEnabled(...a),
}));
jest.mock("@/services/workflowFolders/trashPurge", () => ({
  purgeDueTrashedItems: (...a: unknown[]) => mockPurgeDue(...a),
}));

import { GET, POST } from "@/app/api/cron/purge-trashed-workflows/route";

beforeEach(() => {
  mockRequireCronAuth.mockReset();
  mockIsEnabled.mockReset();
  mockPurgeDue.mockReset();
});

function req(method = "POST") {
  return new Request("https://app.example.test/api/cron/purge-trashed-workflows", { method });
}

describe("/api/cron/purge-trashed-workflows route", () => {
  it("returns 401 when unauthorized and never touches the purge service", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: false, message: "Unauthorized", status: 401 });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockPurgeDue).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unset (misconfig)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({
      authorized: false,
      message: "Server misconfiguration: CRON_SECRET is not set.",
      status: 500,
    });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockPurgeDue).not.toHaveBeenCalled();
  });

  it("when the flag is OFF: authenticates but does NOT purge (enabled:false)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(false);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enabled: false });
    expect(mockPurgeDue).not.toHaveBeenCalled();
  });

  it("when the flag is ON: runs the sweep and returns its counts", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurgeDue.mockResolvedValueOnce({ scanned: 5, workflowsPurged: 3, foldersPurged: 2 });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, enabled: true, scanned: 5, workflowsPurged: 3, foldersPurged: 2,
    });
    expect(mockPurgeDue).toHaveBeenCalledTimes(1);
  });

  it("runs on authorized GET too (Vercel cron sends GET)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurgeDue.mockResolvedValueOnce({ scanned: 0, workflowsPurged: 0, foldersPurged: 0 });
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
  });

  it("returns 500 with a generic error when the sweep throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurgeDue.mockRejectedValueOnce(new Error("DB down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Workflow-trash purge sweep cron failed." });
    errSpy.mockRestore();
  });

  it("response is counts only — no workflow definitions or folder details", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    mockIsEnabled.mockReturnValueOnce(true);
    mockPurgeDue.mockResolvedValueOnce({ scanned: 1, workflowsPurged: 1, foldersPurged: 0 });
    const res = await POST(req());
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["enabled", "foldersPurged", "ok", "scanned", "workflowsPurged"].sort(),
    );
  });
});
