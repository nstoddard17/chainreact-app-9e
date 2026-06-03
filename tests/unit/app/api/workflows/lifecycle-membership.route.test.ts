/**
 * @jest-environment node
 *
 * 4.TEAM-WORKFLOWS-1 (TW-1) — account-membership authorization on the
 * lifecycle routes that hand the id straight to the orchestrator:
 * pause / resume / disable.
 *
 * A caller who is NOT a member of the workflow's account gets the standard 404
 * (no existence leak) and the orchestrator is NEVER invoked. A member proceeds
 * to the orchestrator. A missing/deleted workflow defers to the orchestrator's
 * own not-found mapping (membership check is skipped — preserves prior behavior).
 *
 * Mocks supabase auth, the workflows repo (getById), accountMemberships
 * (isMember), and the orchestrator factory.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...args: unknown[]) => mockIsMember(...args),
}));

const mockPause = jest.fn();
const mockResume = jest.fn();
const mockDisable = jest.fn();
jest.mock("@/services/workflows/orchestratorFactory", () => ({
  createLifecycleOrchestrator: () => ({
    pause: mockPause,
    resume: mockResume,
    disable: mockDisable,
  }),
}));

import { POST as PAUSE } from "@/app/api/workflows/[id]/pause/route";
import { POST as RESUME } from "@/app/api/workflows/[id]/resume/route";
import { POST as DISABLE } from "@/app/api/workflows/[id]/disable/route";

const baseRecord = {
  id: "wf-1",
  accountId: "acct-team-A",
  createdByUserId: "owner-1",
  name: "WF",
  state: "active" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-06-03T00:00:00Z",
  updatedAt: "2026-06-03T00:00:00Z",
};

function authedAs(userId: string): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function summaryRecord(state: string) {
  return { ...baseRecord, state };
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetById.mockReset();
  mockIsMember.mockReset();
  mockPause.mockReset();
  mockResume.mockReset();
  mockDisable.mockReset();
});

const disableReq = () =>
  new Request("http://x/api/workflows/wf-1/disable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "manual_admin" }),
  });

const emptyReq = () =>
  new Request("http://x/api/workflows/wf-1/pause", { method: "POST" });

const params = { params: Promise.resolve({ id: "wf-1" }) };

describe("lifecycle routes — membership authorization (TW-1)", () => {
  describe("non-member is rejected with 404 and the orchestrator is never called", () => {
    it("pause", async () => {
      authedAs("user-1");
      mockGetById.mockResolvedValueOnce({ ...baseRecord, accountId: "acct-team-B" });
      mockIsMember.mockResolvedValueOnce(false);
      const res = await PAUSE(emptyReq(), params);
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("WORKFLOW_NOT_FOUND");
      expect(mockPause).not.toHaveBeenCalled();
      expect(mockIsMember).toHaveBeenCalledWith("user-1", "acct-team-B");
    });

    it("resume", async () => {
      authedAs("user-1");
      mockGetById.mockResolvedValueOnce({ ...baseRecord, accountId: "acct-team-B" });
      mockIsMember.mockResolvedValueOnce(false);
      const res = await RESUME(emptyReq(), params);
      expect(res.status).toBe(404);
      expect(mockResume).not.toHaveBeenCalled();
    });

    it("disable", async () => {
      authedAs("user-1");
      mockGetById.mockResolvedValueOnce({ ...baseRecord, accountId: "acct-team-B" });
      mockIsMember.mockResolvedValueOnce(false);
      const res = await DISABLE(disableReq(), params);
      expect(res.status).toBe(404);
      expect(mockDisable).not.toHaveBeenCalled();
    });
  });

  describe("member proceeds to the orchestrator", () => {
    it("pause", async () => {
      authedAs("member-2");
      mockGetById.mockResolvedValueOnce(baseRecord);
      mockIsMember.mockResolvedValueOnce(true);
      mockPause.mockResolvedValueOnce(summaryRecord("paused"));
      const res = await PAUSE(emptyReq(), params);
      expect(res.status).toBe(200);
      expect(mockPause).toHaveBeenCalledWith("wf-1");
      expect(mockIsMember).toHaveBeenCalledWith("member-2", "acct-team-A");
    });

    it("resume", async () => {
      authedAs("member-2");
      mockGetById.mockResolvedValueOnce(baseRecord);
      mockIsMember.mockResolvedValueOnce(true);
      mockResume.mockResolvedValueOnce(summaryRecord("active"));
      const res = await RESUME(emptyReq(), params);
      expect(res.status).toBe(200);
      expect(mockResume).toHaveBeenCalledWith("wf-1");
    });

    it("disable", async () => {
      authedAs("member-2");
      mockGetById.mockResolvedValueOnce(baseRecord);
      mockIsMember.mockResolvedValueOnce(true);
      mockDisable.mockResolvedValueOnce(summaryRecord("disabled"));
      const res = await DISABLE(disableReq(), params);
      expect(res.status).toBe(200);
      expect(mockDisable).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: "wf-1", reason: "manual_admin" }),
      );
    });
  });

  it("a missing workflow defers to the orchestrator (membership check skipped)", async () => {
    authedAs("user-1");
    mockGetById.mockResolvedValueOnce(null);
    mockPause.mockResolvedValueOnce(summaryRecord("paused"));
    const res = await PAUSE(emptyReq(), params);
    // Membership not checked (no account to check); orchestrator owns the
    // not-found decision — here we just assert it was reached.
    expect(mockIsMember).not.toHaveBeenCalled();
    expect(mockPause).toHaveBeenCalledWith("wf-1");
    expect(res.status).toBe(200);
  });

  it("a member can run lifecycle actions regardless of role (roles do not gate workflow access)", async () => {
    // The route never consults roles — only membership. A plain `member` (here
    // represented simply by isMember=true) activates/pauses without a role gate.
    authedAs("plain-member");
    mockGetById.mockResolvedValueOnce(baseRecord);
    mockIsMember.mockResolvedValueOnce(true);
    mockPause.mockResolvedValueOnce(summaryRecord("paused"));
    const res = await PAUSE(emptyReq(), params);
    expect(res.status).toBe(200);
    expect(mockPause).toHaveBeenCalled();
  });
});
