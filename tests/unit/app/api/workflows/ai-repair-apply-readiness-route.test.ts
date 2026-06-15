/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/ai/repair/apply-readiness (AI-REPAIR-3B).
 *
 * DRY-RUN readiness route. Auth + load are mocked; `parseJsonBody` stays REAL (so the
 * 400-on-bad-body contract is genuine). The readiness service is mocked so the route's
 * auth → authz → parse → delegate → safe-response contract is isolated. The route
 * never persists / saves / runs / activates — proven structurally by an import scan.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockRequireUser = jest.fn();
const mockLoad = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => {
  const actual = jest.requireActual("@/app/api/workflows/_shared");
  return {
    ...actual,
    requireUser: (...a: unknown[]) => mockRequireUser(...a),
    loadWorkflowForMember: (...a: unknown[]) => mockLoad(...a),
  };
});

const mockAssess = jest.fn();
jest.mock("@/services/ai/repair/assessRepairApplyReadiness", () => ({
  assessRepairApplyReadiness: (...a: unknown[]) => mockAssess(...a),
}));

import { NextResponse } from "next/server";
import { POST } from "@/app/api/workflows/[id]/ai/repair/apply-readiness/route";

function call(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/repair/apply-readiness`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const okBody = { operations: [{ op: "updateNodeConfig", nodeId: "n1", config: { text: "hi" } }], baseRevision: "rev-1" };

beforeEach(() => {
  mockRequireUser.mockReset();
  mockRequireUser.mockResolvedValue({ ok: true, userId: "u1" });
  mockLoad.mockReset();
  mockLoad.mockResolvedValue({ ok: true, record: { id: "wf-1", accountId: "acct-1", state: "disabled", updatedAt: "rev-1", draftDefinition: { nodes: [], edges: [] } } });
  mockAssess.mockReset();
  mockAssess.mockReturnValue({
    readiness: { applyable: true, blocks: [], blockedCategories: [], requiresConfirmation: false, operationKinds: ["updateNodeConfig"] },
    currentRevision: "rev-1",
  });
});

describe("apply-readiness route — auth + access", () => {
  it("unauthenticated request is rejected (401)", async () => {
    mockRequireUser.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) });
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockAssess).not.toHaveBeenCalled();
  });

  it("unauthorized / not-found workflow is rejected (404), no readiness computed", async () => {
    mockLoad.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" }, { status: 404 }) });
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(404);
    expect(mockAssess).not.toHaveBeenCalled();
  });

  it("empty workflow id is rejected (400)", async () => {
    const res = await call("   ", okBody);
    expect(res.status).toBe(400);
  });
});

describe("apply-readiness route — request validation", () => {
  it("missing operations (patch/metadata) is rejected (400)", async () => {
    const res = await call("wf-1", { baseRevision: "rev-1" });
    expect(res.status).toBe(400);
    expect(mockAssess).not.toHaveBeenCalled();
  });

  it("non-array operations (raw model text) is rejected at the boundary (400)", async () => {
    const res = await call("wf-1", { operations: "fix my workflow", baseRevision: "rev-1" });
    expect(res.status).toBe(400);
  });
});

describe("apply-readiness route — dry-run verdict", () => {
  it("a safe patch returns 200 with applyable:true in dry-run mode", async () => {
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, mode: "dry-run", applyable: true });
    expect(body.currentRevision).toBe("rev-1");
  });

  it("a blocked patch returns 200 with applyable:false + safe block reasons", async () => {
    mockAssess.mockReturnValue({
      readiness: {
        applyable: false,
        blocks: [{ code: "SECRET_WRITE", message: "This change writes to a sensitive field, which can't be applied automatically." }],
        blockedCategories: ["SECRET_WRITE"],
        requiresConfirmation: false,
        operationKinds: ["updateNodeConfig"],
      },
      currentRevision: "rev-1",
    });
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applyable).toBe(false);
    expect(body.readiness.blockedCategories).toContain("SECRET_WRITE");
  });

  it("the response carries ONLY the safe verdict fields (no raw validation / config)", async () => {
    const res = await call("wf-1", okBody);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["applyable", "currentRevision", "mode", "ok", "readiness"]);
  });

  it("delegates to the readiness service with the loaded record + posted patch metadata", async () => {
    await call("wf-1", { operations: okBody.operations, baseRevision: "rev-1", previewRevision: "rev-1", recipientChangeConfirmed: true });
    expect(mockAssess).toHaveBeenCalledTimes(1);
    const arg = mockAssess.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.workflowId).toBe("wf-1");
    expect(arg.baseRevision).toBe("rev-1");
    expect(arg.previewRevision).toBe("rev-1");
    expect(arg.recipientChangeConfirmed).toBe(true);
    expect((arg.record as { id: string }).id).toBe("wf-1");
  });
});

describe("apply-readiness route — persistence / reachability boundary", () => {
  it("the route imports NO save / run / activation path", () => {
    const src = readFileSync(resolve(process.cwd(), "app/api/workflows/[id]/ai/repair/apply-readiness/route.ts"), "utf8");
    const importSpec = /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    const specifiers = [...src.matchAll(importSpec)].map((m) => m[1] ?? "");
    for (const spec of specifiers) {
      expect(spec).not.toMatch(/saveDraftDefinition|updateDraftDefinition|applyWorkflowPatch|lifecycle|execution\/engine|runWorkflow/i);
    }
  });

  it("no client (features/ components/ lib/api/ hooks/) references the new route/service — not wired to UI", () => {
    let hits = "";
    try {
      // Match the DISTINCTIVE new route path + service name, not the loose phrase
      // "apply-readiness" (which appears in unrelated planner-flow comments).
      hits = execSync(
        'git grep -l -E "repair/apply-readiness|assessRepairApplyReadiness" -- "features/**" "components/**" "lib/api/**" "hooks/**"',
        { cwd: process.cwd(), encoding: "utf8" },
      );
    } catch {
      hits = ""; // git grep exits non-zero when there are no matches
    }
    expect(hits.trim()).toBe("");
  });
});
