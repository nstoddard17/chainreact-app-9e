/**
 * @jest-environment node
 *
 * POST /api/onboarding/presentation (5.ONBOARD-1 Batch 1): the ONLY
 * client-writable onboarding surface. Proves the forgery wall (completion /
 * step state unreachable, strict body), the cross-account no-leak 404 for
 * select_workflow, server-assigned timestamps, and flag-off inertness.
 */
import { NextResponse } from "next/server";

const mockRequireUserWithAccount = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUserWithAccount: (...a: unknown[]) => mockRequireUserWithAccount(...a),
  workflowNotFoundResponse: () =>
    NextResponse.json({ error: "WORKFLOW_NOT_FOUND" }, { status: 404 }),
}));

const mockGetWorkflowById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflowById(...a),
}));

const mockUpdatePresentation = jest.fn();
jest.mock("@/repositories/onboarding/userOnboardingStates", () => ({
  updatePresentationServiceRole: (...a: unknown[]) => mockUpdatePresentation(...a),
}));

import { POST } from "@/app/api/onboarding/presentation/route";

const WF_UUID = "8a3f0c6a-6f0e-4d9a-9b6e-2f4f9a6d1c22";

function authedAs(userId: string, accountId: string): void {
  mockRequireUserWithAccount.mockResolvedValue({ ok: true, userId, accountId });
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/onboarding/presentation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function updatedRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    accountId: "acct-1",
    selectedWorkflowId: null,
    completionWorkflowId: null,
    firstShownAt: null,
    dismissedAt: null,
    minimized: false,
    videoWatchedAt: null,
    completedAt: null,
    celebratedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ENABLE_ONBOARDING_CHECKLIST = "true";
  mockUpdatePresentation.mockResolvedValue(updatedRow());
});

afterEach(() => {
  delete process.env.ENABLE_ONBOARDING_CHECKLIST;
});

describe("POST /api/onboarding/presentation", () => {
  it("unauthenticated → gate response, no write", async () => {
    mockRequireUserWithAccount.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    });
    const res = await POST(req({ action: "dismiss" }));
    expect(res.status).toBe(401);
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it("flag off → 404 ONBOARDING_DISABLED, no write", async () => {
    delete process.env.ENABLE_ONBOARDING_CHECKLIST;
    authedAs("user-1", "acct-1");
    const res = await POST(req({ action: "dismiss" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "ONBOARDING_DISABLED" });
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it.each([
    ["dismiss", "dismissedAt"],
    ["video_watched", "videoWatchedAt"],
    ["celebrated", "celebratedAt"],
  ] as const)("%s → server-assigned timestamp patch (never a client value)", async (action, field) => {
    authedAs("user-1", "acct-1");
    const res = await POST(req({ action }));
    expect(res.status).toBe(200);
    const patch = mockUpdatePresentation.mock.calls[0]![2] as Record<string, unknown>;
    expect(typeof patch[field]).toBe("string");
    expect(Number.isNaN(Date.parse(patch[field] as string))).toBe(false);
  });

  it("minimize / expand / reopen map to the expected presentation patches", async () => {
    authedAs("user-1", "acct-1");
    await POST(req({ action: "minimize" }));
    expect(mockUpdatePresentation).toHaveBeenLastCalledWith("user-1", "acct-1", {
      minimized: true,
    });
    await POST(req({ action: "expand" }));
    expect(mockUpdatePresentation).toHaveBeenLastCalledWith("user-1", "acct-1", {
      minimized: false,
    });
    await POST(req({ action: "reopen" }));
    expect(mockUpdatePresentation).toHaveBeenLastCalledWith("user-1", "acct-1", {
      dismissedAt: null,
      minimized: false,
    });
  });

  it("FORGERY: a body smuggling completedAt alongside a valid action is a 400, nothing written", async () => {
    authedAs("user-1", "acct-1");
    const res = await POST(
      req({ action: "dismiss", completedAt: "2026-01-01T00:00:00Z" }),
    );
    expect(res.status).toBe(400);
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it("FORGERY: invented step-completion verbs are a 400, nothing written", async () => {
    authedAs("user-1", "acct-1");
    for (const body of [
      { action: "complete_step", step: "test" },
      { action: "set_completed" },
      { completedAt: "2026-01-01T00:00:00Z" },
    ]) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
    }
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it("select_workflow: own-account workflow persists the selection", async () => {
    authedAs("user-1", "acct-1");
    mockGetWorkflowById.mockResolvedValue({
      id: WF_UUID,
      accountId: "acct-1",
      state: "draft",
    });
    const res = await POST(req({ action: "select_workflow", workflowId: WF_UUID }));
    expect(res.status).toBe(200);
    expect(mockUpdatePresentation).toHaveBeenCalledWith("user-1", "acct-1", {
      selectedWorkflowId: WF_UUID,
    });
  });

  it("select_workflow: foreign-account workflow collapses to the no-leak 404, nothing written", async () => {
    authedAs("user-1", "acct-1");
    mockGetWorkflowById.mockResolvedValue({
      id: WF_UUID,
      accountId: "acct-OTHER",
      state: "draft",
    });
    const res = await POST(req({ action: "select_workflow", workflowId: WF_UUID }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "WORKFLOW_NOT_FOUND" });
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown workflow", null],
    ["deleted workflow", { id: WF_UUID, accountId: "acct-1", state: "deleted" }],
  ])("select_workflow: %s → identical no-leak 404", async (_label, record) => {
    authedAs("user-1", "acct-1");
    mockGetWorkflowById.mockResolvedValue(record);
    const res = await POST(req({ action: "select_workflow", workflowId: WF_UUID }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "WORKFLOW_NOT_FOUND" });
  });

  it("repository failure → safe 500, internals not leaked", async () => {
    authedAs("user-1", "acct-1");
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockUpdatePresentation.mockRejectedValue(new Error("pg: constraint violated"));
    const res = await POST(req({ action: "dismiss" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("pg:");
    consoleSpy.mockRestore();
  });
});
