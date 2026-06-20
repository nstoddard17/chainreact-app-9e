/**
 * @jest-environment node
 *
 * Workflow-guidance intake (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 * Proves: the intake never mutates the workflow; it imports NO mutation/repository/model
 * path; only the de-identified request reaches the provider; default provider is inert;
 * guidance is advisory (a suggestion is returned, never applied).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requestWorkflowGuidance } from "@/services/ai-guidance/workflowGuidanceIntake";
import type { WorkflowGuidanceProvider, WorkflowGuidanceRequest } from "@/services/ai-guidance/types";
import type { WorkflowDefinition } from "@/contracts/workflow";

// Real ids are distinctive (no substring collision with legitimate kinds like "trigger").
const def = {
  nodes: [
    { id: "REALID_TRIGGER_77", kind: "trigger", provider: "slack", type: "message_posted", config: { token: "SECRET" }, position: { x: 0, y: 0 } },
    { id: "REALID_ACTION_88", kind: "action", provider: "gmail", type: "send_email", config: { to: "x@y.com" }, position: { x: 0, y: 200 } },
  ],
  edges: [{ id: "REALID_EDGE_99", from: "REALID_TRIGGER_77", to: "REALID_ACTION_88" }],
} as unknown as WorkflowDefinition;

describe("requestWorkflowGuidance — no mutation, advisory only", () => {
  it("defaults to the inert noop provider (PROVIDER_DISABLED), no throw", async () => {
    const res = await requestWorkflowGuidance({ definition: def, guidanceKind: "repair_suggestion" });
    expect(res).toEqual({ ok: false, code: "PROVIDER_DISABLED" });
  });

  it("does NOT mutate the input workflow definition", async () => {
    const snapshot = JSON.parse(JSON.stringify(def));
    await requestWorkflowGuidance({ definition: def, guidanceKind: "workflow_design" });
    expect(def).toEqual(snapshot);
  });

  it("forwards ONLY the de-identified request to the provider (no config/secret/real id)", async () => {
    let seen: WorkflowGuidanceRequest | null = null;
    const spy: WorkflowGuidanceProvider = {
      providerId: "spy",
      async getWorkflowGuidance(r) { seen = r; return { ok: false, code: "PROVIDER_DISABLED" }; },
    };
    await requestWorkflowGuidance({ definition: def, guidanceKind: "repair_suggestion", provider: spy });
    const s = JSON.stringify(seen);
    for (const needle of ["SECRET", "x@y.com", "config", "token", "REALID_TRIGGER_77", "REALID_ACTION_88", "REALID_EDGE_99"]) {
      expect(s).not.toContain(needle);
    }
    expect(seen!.workflow.nodes.map((n) => n.ref)).toEqual(["n0", "n1"]);
  });

  it("returns provider ADVICE verbatim — it never applies/mutates from a suggestion", async () => {
    const advisory: WorkflowGuidanceProvider = {
      providerId: "advisor",
      async getWorkflowGuidance() {
        return { ok: true, response: { schemaVersion: 1, guidanceKind: "repair_suggestion", providerId: "advisor", suggestions: [{ title: "Add a trigger", detail: "...", suggestedOperationKinds: ["addNode"] }] } };
      },
    };
    const snapshot = JSON.parse(JSON.stringify(def));
    const res = await requestWorkflowGuidance({ definition: def, guidanceKind: "repair_suggestion", provider: advisory });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.response.suggestions[0]!.suggestedOperationKinds).toEqual(["addNode"]);
    // The advice is returned; the workflow is untouched (advisory, not applied).
    expect(def).toEqual(snapshot);
  });

  it("the intake module imports NO mutation / repository / model / DB path", () => {
    const src = readFileSync(resolve(process.cwd(), "services/ai-guidance/workflowGuidanceIntake.ts"), "utf8");
    const importSpec = /from\s+["']([^"']+)["']/g;
    const specs = [...src.matchAll(importSpec)].map((m) => m[1] ?? "");
    for (const spec of specs) {
      expect(spec).not.toMatch(/repositories\/|updateDraftDefinition|applyRepairPatch|executeWorkflowPatch|lifecycle|modelClient|supabase|@\/services\/ai\/|aiCostEvents|aiCreditGate/i);
    }
  });
});
