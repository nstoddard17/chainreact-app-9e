/**
 * @jest-environment node
 *
 * Deterministic plan → additive builder patch (HERMES-AGENT-APPLY-PREVIEW-PATCH).
 * Proves planToBuilderPatch maps a validated WorkflowPlan into an ADDITIVE-ONLY patch (kind:"additive",
 * patch-local refs p0/p1…, linear edges), skips "logic" steps (no V2 graph kind), carries provider/type
 * LABELS only (no config/ids), and returns null when nothing additive remains. Static: no
 * delete/replace/update ops, no repo/DB/network/vendor.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planToBuilderPatch } from "@/services/ai-guidance/preview/planToBuilderPatch";
import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";

function plan(steps: WorkflowPlanStep[]): WorkflowPlan {
  return { schemaVersion: 1, title: "t", summary: "s", steps, notApplied: true };
}

describe("planToBuilderPatch", () => {
  it("maps trigger+action steps to an additive patch with linear edges + p-refs", () => {
    const patch = planToBuilderPatch(
      plan([
        { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" },
        { ref: "s1", role: "action", provider: "slack", type: "send_message", purpose: "notify" },
      ]),
    )!;
    expect(patch.kind).toBe("additive");
    expect(patch.nodes).toEqual([
      { ref: "p0", kind: "trigger", provider: "gmail", type: "new_email" },
      { ref: "p1", kind: "action", provider: "slack", type: "send_message" },
    ]);
    expect(patch.edges).toEqual([{ fromRef: "p0", toRef: "p1" }]);
  });

  it("carries provider/type LABELS only — no config/values/ids in the patch", () => {
    const patch = planToBuilderPatch(
      plan([{ ref: "s0", role: "action", provider: "slack", type: "send_message", purpose: "x", requiredInputs: ["channel"] }]),
    )!;
    const s = JSON.stringify(patch);
    for (const needle of ["config", "value", "requiredInputs", "channel", "secret", "credential"]) {
      expect(s).not.toContain(needle);
    }
  });

  it("SKIPS logic steps (no V2 graph kind) and chains the kept steps in order", () => {
    const patch = planToBuilderPatch(
      plan([
        { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "a" },
        { ref: "s1", role: "logic", provider: "", type: "filter", purpose: "b" },
        { ref: "s2", role: "action", provider: "slack", type: "send_message", purpose: "c" },
      ]),
    )!;
    expect(patch.nodes.map((n) => n.kind)).toEqual(["trigger", "action"]);
    expect(patch.nodes.map((n) => `${n.provider}:${n.type}`)).toEqual(["gmail:new_email", "slack:send_message"]);
    expect(patch.edges).toEqual([{ fromRef: "p0", toRef: "p1" }]);
  });

  it("returns null when there are no trigger/action steps (only logic) or no steps", () => {
    expect(planToBuilderPatch(plan([{ ref: "s0", role: "logic", provider: "", type: "if", purpose: "x" }]))).toBeNull();
    expect(planToBuilderPatch(plan([]))).toBeNull();
    expect(planToBuilderPatch(null)).toBeNull();
    expect(planToBuilderPatch(undefined)).toBeNull();
  });

  it("a single step yields one node and zero edges", () => {
    const patch = planToBuilderPatch(plan([{ ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "x" }]))!;
    expect(patch.nodes).toHaveLength(1);
    expect(patch.edges).toHaveLength(0);
  });

  it("the module emits no delete/replace/update ops and no repo/DB/network/vendor (static)", () => {
    const src = readFileSync(resolve(process.cwd(), "services/ai-guidance/preview/planToBuilderPatch.ts"), "utf8");
    for (const pat of [
      /deleteNode|removeNode|replaceNode|updateNodeConfig|removeEdge|"delete"|"replace"|"update"/,
      /@\/repositories\//,
      /createClient|supabase/i,
      /\bfetch\s*\(/,
      /nousresearch|api\.openai\.com|hermesAgentGatewayClient/i,
    ]) {
      expect({ pat: String(pat), matched: pat.test(src) }).toEqual({ pat: String(pat), matched: false });
    }
  });
});
