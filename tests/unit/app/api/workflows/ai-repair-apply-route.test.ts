/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/ai/repair/apply (AI-REPAIR-3D).
 *
 * The GUARDED persistence route. Auth + load + edit-gate are mocked; `parseJsonBody`
 * stays REAL. The apply service is mocked so the route's auth → membership → edit →
 * delegate → safe HTTP mapping contract is isolated (no DB). The route writes nothing
 * itself and exposes no definition/secret — proven structurally + by response shape.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockRequireUser = jest.fn();
const mockLoad = jest.fn();
const mockEditGate = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => {
  const actual = jest.requireActual("@/app/api/workflows/_shared");
  return {
    ...actual,
    requireUser: (...a: unknown[]) => mockRequireUser(...a),
    loadWorkflowForMember: (...a: unknown[]) => mockLoad(...a),
    assertWorkflowRunEditAllowed: (...a: unknown[]) => mockEditGate(...a),
  };
});

const mockApply = jest.fn();
jest.mock("@/services/ai/repair/applyRepairPatch", () => ({
  applyRepairPatch: (...a: unknown[]) => mockApply(...a),
}));

// REACT-AGENT-CS-7D — capture the injected audit recorder (the real seam runs unmocked).
const mockAuditRecord = jest.fn();
jest.mock("@/services/ai/reactAgent/audit", () => ({
  reactAgentAuditRecorder: { record: (...a: unknown[]) => mockAuditRecord(...a) },
}));

import { NextResponse } from "next/server";
import { POST } from "@/app/api/workflows/[id]/ai/repair/apply/route";
import { repairPatchRef } from "@/services/ai/repair/repairPatchRef";
import type { PatchOperation } from "@/services/workflows/patch/types";

function call(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/repair/apply`, {
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
  mockEditGate.mockReset();
  mockEditGate.mockResolvedValue(null); // allowed
  mockApply.mockReset();
  mockApply.mockResolvedValue({ ok: true, currentRevision: "rev-2", appliedOperations: [{ op: "updateNodeConfig", nodeId: "n1", fields: ["text"] }] });
  mockAuditRecord.mockReset();
  mockAuditRecord.mockResolvedValue(undefined);
});

describe("apply route — authz", () => {
  it("unauthenticated → 401, no load / apply", async () => {
    mockRequireUser.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) });
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("not-found / non-member → no-leak 404, no apply", async () => {
    mockLoad.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" }, { status: 404 }) });
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(404);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("not editable (WF-RUNPERM) → 403, no apply", async () => {
    mockEditGate.mockResolvedValue(NextResponse.json({ error: "private", code: "WORKFLOW_USES_PRIVATE_CREDENTIAL" }, { status: 403 }));
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(403);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("empty id → 400; missing operations → 400 (before any apply)", async () => {
    expect((await call("  ", okBody)).status).toBe(400);
    const res = await call("wf-1", { baseRevision: "rev-1" });
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("apply route — result mapping", () => {
  it("a successful apply → 200 { ok, applied:true } with NO updatedDefinition", async () => {
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, applied: true, currentRevision: "rev-2" });
    expect(Object.keys(body).sort()).toEqual(["applied", "appliedOperations", "currentRevision", "ok"]);
    expect("updatedDefinition" in body).toBe(false);
  });

  it("NOT_APPLYABLE → 422 with safe block categories", async () => {
    mockApply.mockResolvedValue({ ok: false, code: "NOT_APPLYABLE", message: "This change can't be applied.", blockedCategories: ["SECRET_WRITE"] });
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, applied: false, code: "NOT_APPLYABLE", blockedCategories: ["SECRET_WRITE"] });
  });

  it("EXECUTION_FAILED → 422", async () => {
    mockApply.mockResolvedValue({ ok: false, code: "EXECUTION_FAILED", message: "x" });
    expect((await call("wf-1", okBody)).status).toBe(422);
  });

  it("STALE_PATCH → 409 conflict", async () => {
    mockApply.mockResolvedValue({ ok: false, code: "STALE_PATCH", message: "x" });
    expect((await call("wf-1", okBody)).status).toBe(409);
  });

  it("delegates to the service with the loaded record + posted metadata", async () => {
    await call("wf-1", { operations: okBody.operations, baseRevision: "rev-1", previewRevision: "rev-1", recipientChangeConfirmed: true });
    const arg = mockApply.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.workflowId).toBe("wf-1");
    expect(arg.baseRevision).toBe("rev-1");
    expect(arg.recipientChangeConfirmed).toBe(true);
    expect((arg.record as { id: string }).id).toBe("wf-1");
  });
});

describe("apply route — React Agent audit emission (CS-7d)", () => {
  it("successful apply emits ONE react_agent.repair_apply success row (mode requires_approval) on the workflow scope", async () => {
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(200);
    expect(mockApply).toHaveBeenCalledTimes(1); // exec ran THROUGH the seam
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
    expect(mockAuditRecord.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      actorUserId: "u1",
      workflowId: "wf-1",
      capabilityId: "repair_apply",
      intent: "apply_repair",
      mode: "requires_approval",
      creditFeature: null,
      auditKind: "react_agent.repair_apply",
      outcome: "success",
    });
  });

  it("proposedPatchRef matches the preview ref for the same { workflowId, baseRevision, operations }", async () => {
    await call("wf-1", okBody);
    const expected = repairPatchRef({
      workflowId: "wf-1",
      baseRevision: "rev-1",
      operations: okBody.operations as PatchOperation[],
    });
    expect(expected).toMatch(/^repair_patch_sha256:[0-9a-f]{64}$/);
    expect((mockAuditRecord.mock.calls[0]![0] as Record<string, unknown>).proposedPatchRef).toBe(expected);
  });

  it.each([
    ["STALE_PATCH", 409],
    ["NOT_APPLYABLE", 422],
    ["EXECUTION_FAILED", 422],
  ])("a %s apply emits a `failed` audit row (response unchanged: %d)", async (code, status) => {
    mockApply.mockResolvedValue({ ok: false, code, message: "x" });
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(status);
    expect(mockAuditRecord.mock.calls[0]![0]).toMatchObject({ capabilityId: "repair_apply", outcome: "failed" });
  });

  it("no metadata / no raw operations / config / node ids leak into the audit input", async () => {
    await call("wf-1", okBody);
    const input = mockAuditRecord.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).not.toHaveProperty("metadata");
    const s = JSON.stringify(input);
    expect(s).not.toContain("updateNodeConfig");
    expect(s).not.toContain("n1");
    expect(s).not.toContain("hi");
  });

  it("an audit recorder failure NEVER breaks the apply response (fail-open) — still 200", async () => {
    mockAuditRecord.mockRejectedValueOnce(new Error("audit ledger down"));
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, applied: true, currentRevision: "rev-2" });
  });

  it("does NOT emit audit before auth/membership/edit-gate (denial → no audit row)", async () => {
    mockEditGate.mockResolvedValue(NextResponse.json({ error: "private", code: "WORKFLOW_USES_PRIVATE_CREDENTIAL" }, { status: 403 }));
    const res = await call("wf-1", okBody);
    expect(res.status).toBe(403);
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockAuditRecord).not.toHaveBeenCalled();
  });
});

describe("apply route — persistence / reachability boundary", () => {
  it("the route imports NO run / activation / trigger / lifecycle path", () => {
    const src = readFileSync(resolve(process.cwd(), "app/api/workflows/[id]/ai/repair/apply/route.ts"), "utf8");
    const importSpec = /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    const specifiers = [...src.matchAll(importSpec)].map((m) => m[1] ?? "");
    for (const spec of specifiers) {
      expect(spec).not.toMatch(/lifecycle|execution\/engine|runWorkflow|registerTrigger|activateWorkflow|saveDraftDefinition|aiCreditGate|modelClient/i);
    }
  });

  it("only the AI API client wires the apply route — no direct UI/component call", () => {
    // AI-REPAIR-3E intentionally wires Apply: the `applyWorkflowRepair` client in
    // `lib/api/ai` forwards to this route, and the builder panel calls THAT client —
    // never the route path or the server service directly. So the only legitimate
    // reference is the API client; features/components/hooks must not hit the route
    // path or import the server service.
    let hits = "";
    try {
      hits = execSync(
        'git grep -lE "applyRepairPatch|repair/apply[\\"\'`]" -- "features/**" "components/**" "hooks/**"',
        { cwd: process.cwd(), encoding: "utf8" },
      );
    } catch {
      hits = ""; // git grep exits non-zero with no matches
    }
    expect(hits.trim()).toBe("");
    // The server apply SERVICE is never imported by client code.
    let svcHits = "";
    try {
      svcHits = execSync(
        'git grep -lE "applyRepairPatch" -- "features/**" "components/**" "lib/api/**" "hooks/**"',
        { cwd: process.cwd(), encoding: "utf8" },
      );
    } catch {
      svcHits = "";
    }
    expect(svcHits.trim()).toBe("");
  });
});
