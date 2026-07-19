/**
 * @jest-environment node
 *
 * POST /api/onboarding/presentation (5.ONBOARD-1 Batch 1): the ONLY
 * client-writable onboarding surface. Proves the forgery wall (completion /
 * step state unreachable, strict body), server-assigned timestamps, and that
 * every read/write is scoped to the CALLER'S resolved (userId, accountId).
 *
 * 5.ONBOARD-2: the checklist is account-level — `select_workflow` is gone from
 * the action union, so no workflow id crosses this boundary at all. A body
 * still sending it is a schema rejection (400), not a 200 and not a 404.
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
  mockUpdatePresentation.mockResolvedValue(updatedRow());
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

  it("5.ONBOARD-2: select_workflow is REJECTED by the action union (400), nothing written, no workflow lookup", async () => {
    authedAs("user-1", "acct-1");
    for (const body of [
      { action: "select_workflow", workflowId: WF_UUID },
      { action: "select_workflow", workflowId: null },
      { action: "select_workflow" },
    ]) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
      // Never the old cross-account no-leak 404 path, and never a silent 200.
      expect(await res.json()).not.toEqual({ error: "WORKFLOW_NOT_FOUND" });
    }
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
    expect(mockGetWorkflowById).not.toHaveBeenCalled();
  });

  it("no workflow id crosses this boundary: a valid verb never reads a workflow row", async () => {
    authedAs("user-1", "acct-1");
    await POST(req({ action: "dismiss" }));
    expect(mockGetWorkflowById).not.toHaveBeenCalled();
    expect(mockUpdatePresentation).toHaveBeenCalledWith("user-1", "acct-1", {
      dismissedAt: expect.any(String),
    });
  });

  describe("NO CROSS-ACCOUNT LEAK: scoping comes from the auth helper, never the body", () => {
    it.each([
      ["dismiss"],
      ["reopen"],
      ["minimize"],
      ["expand"],
      ["video_watched"],
      ["celebrated"],
    ] as const)(
      "%s writes to the CALLER'S (userId, accountId) pair only",
      async (action) => {
        authedAs("user-B", "acct-B");
        const res = await POST(req({ action }));
        expect(res.status).toBe(200);
        const [userId, accountId] = mockUpdatePresentation.mock.calls[0]!;
        expect(userId).toBe("user-B");
        expect(accountId).toBe("acct-B");
      },
    );

    it("a body smuggling another account's userId/accountId is a 400, nothing written", async () => {
      authedAs("user-A", "acct-A");
      for (const body of [
        { action: "dismiss", accountId: "acct-B" },
        { action: "dismiss", userId: "user-B" },
        { action: "reopen", accountId: "acct-B", userId: "user-B" },
      ]) {
        const res = await POST(req(body));
        expect(res.status).toBe(400);
      }
      expect(mockUpdatePresentation).not.toHaveBeenCalled();
    });

    it("account A's request can never touch account B's row (same user, different active account)", async () => {
      authedAs("user-1", "acct-A");
      await POST(req({ action: "minimize" }));
      authedAs("user-1", "acct-B");
      await POST(req({ action: "minimize" }));

      const accountsWritten = mockUpdatePresentation.mock.calls.map((c) => c[1]);
      expect(accountsWritten).toEqual(["acct-A", "acct-B"]);
      // Each call is scoped to exactly one account — no call ever received the
      // other account's id, so progress cannot bleed across accounts.
      expect(
        mockUpdatePresentation.mock.calls.every(
          (c) => typeof c[0] === "string" && typeof c[1] === "string",
        ),
      ).toBe(true);
    });

    it("the response is built ONLY from the row the caller's own scoped write returned", async () => {
      authedAs("user-A", "acct-A");
      mockUpdatePresentation.mockResolvedValue(
        updatedRow({ userId: "user-A", accountId: "acct-A", minimized: true }),
      );
      const res = await POST(req({ action: "minimize" }));
      expect(res.status).toBe(200);
      const body = JSON.stringify(await res.json());
      // No foreign identifiers, and no account/user identity echoed back at all.
      for (const forbidden of ["acct-B", "user-B", "acct-A", "user-A"]) {
        expect(body).not.toContain(forbidden);
      }
    });
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
