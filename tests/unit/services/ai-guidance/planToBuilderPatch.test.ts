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
import { planToBuilderPatch } from "@/core/workflows/planToBuilderPatch";
import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";
import type { BuilderAdditivePatch } from "@/contracts/workflowPlanPreview";

function plan(steps: WorkflowPlanStep[]): WorkflowPlan {
  return { schemaVersion: 1, title: "t", summary: "s", steps, notApplied: true };
}

/** Narrow to the additive variant for these additive-path assertions (HERMES-AGENT-MUTATION-PREVIEW
 * made BuilderPreviewPatch a union; a plan with no `replaces` step is always additive). */
function additivePatch(
  ...args: Parameters<typeof planToBuilderPatch>
): BuilderAdditivePatch | null {
  const p = planToBuilderPatch(...args);
  if (p && p.kind !== "additive") throw new Error(`expected additive patch, got ${p.kind}`);
  return (p as BuilderAdditivePatch | null);
}

describe("planToBuilderPatch", () => {
  it("maps trigger+action steps to an additive patch with linear edges + p-refs", () => {
    const patch = additivePatch(
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
    const patch = additivePatch(
      plan([{ ref: "s0", role: "action", provider: "slack", type: "send_message", purpose: "x", requiredInputs: ["channel"] }]),
    )!;
    const s = JSON.stringify(patch);
    for (const needle of ["config", "value", "requiredInputs", "channel", "secret", "credential"]) {
      expect(s).not.toContain(needle);
    }
  });

  it("SKIPS logic steps (no V2 graph kind) and chains the kept steps in order", () => {
    const patch = additivePatch(
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
    const patch = additivePatch(plan([{ ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "x" }]))!;
    expect(patch.nodes).toHaveLength(1);
    expect(patch.edges).toHaveLength(0);
  });

  it("the module emits no delete/replace/update ops and no repo/DB/network/vendor (static)", () => {
    const src = readFileSync(resolve(process.cwd(), "core/workflows/planToBuilderPatch.ts"), "utf8");
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

// HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — guided-setup seeding.
describe("planToBuilderPatch — guided-setup seeding", () => {
  const setupFieldsByType = {
    "slack:send_message": [
      { name: "message", label: "Message", type: "textarea" as const, required: true },
      { name: "count", label: "Count", type: "number" as const, required: false },
    ],
  };

  it("seeds the matching node's config from previewConfig (sanitized), keyed by previewId", () => {
    const patch = additivePatch(
      plan([
        { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" },
        { ref: "s1", role: "action", provider: "slack", type: "send_message", purpose: "notify" },
      ]),
      {
        // preview-step-2 == the slack action (index 1 over ALL steps, 1-based).
        previewConfig: { "preview-step-2": { message: "Review new leads", count: "3" } },
        setupFieldsByType,
      },
    )!;
    expect(patch.nodes[0]).toEqual({ ref: "p0", kind: "trigger", provider: "gmail", type: "new_email" });
    expect(patch.nodes[1]).toEqual({
      ref: "p1",
      kind: "action",
      provider: "slack",
      type: "send_message",
      config: { message: "Review new leads", count: 3 },
    });
  });

  it("drops unknown/secret keys not present in the supported metadata", () => {
    const patch = additivePatch(
      plan([{ ref: "s0", role: "action", provider: "slack", type: "send_message", purpose: "x" }]),
      {
        previewConfig: { "preview-step-1": { message: "ok", accessToken: "ya29.SECRET", bogus: "y" } },
        setupFieldsByType,
      },
    )!;
    expect(patch.nodes[0]!.config).toEqual({ message: "ok" });
    expect(JSON.stringify(patch)).not.toContain("ya29.SECRET");
  });

  it("aligns previewId across SKIPPED logic steps (index over all steps, not kept)", () => {
    const patch = additivePatch(
      plan([
        { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" },
        { ref: "s1", role: "logic", provider: "native", type: "filter", purpose: "branch" },
        { ref: "s2", role: "action", provider: "slack", type: "send_message", purpose: "notify" },
      ]),
      { previewConfig: { "preview-step-3": { message: "hi" } }, setupFieldsByType },
    )!;
    expect(patch.nodes).toHaveLength(2);
    expect(patch.nodes[1]).toMatchObject({ provider: "slack", type: "send_message", config: { message: "hi" } });
  });

  it("with no opts → no config key (back-compat)", () => {
    const patch = additivePatch(
      plan([{ ref: "s0", role: "action", provider: "slack", type: "send_message", purpose: "x" }]),
    )!;
    expect(patch.nodes[0]).not.toHaveProperty("config");
  });
});

// HERMES-AGENT-MUTATION-PREVIEW — a step marked `replaces` (set only by the deterministic mutation
// fallback) produces a TARGETED replace_action patch instead of an additive add.
describe("planToBuilderPatch — replace_action (mutation)", () => {
  it("emits a replace_action patch swapping the marked step's `from` capability for its `to`", () => {
    const patch = planToBuilderPatch(
      plan([
        { ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "keep" },
        {
          ref: "s1",
          role: "action",
          provider: "gmail",
          type: "send_email",
          purpose: "swap",
          requiredInputs: ["to"],
          replaces: { provider: "slack", type: "send_channel_message" },
        },
      ]),
    )!;
    expect(patch.kind).toBe("replace_action");
    if (patch.kind !== "replace_action") return;
    expect(patch.from).toEqual({ provider: "slack", type: "send_channel_message" });
    expect(patch.to).toMatchObject({ provider: "gmail", type: "send_email" });
    // No nodes/edges array — it's a targeted swap, not an additive add. No config/secret leak.
    expect(patch).not.toHaveProperty("nodes");
    expect(JSON.stringify(patch)).not.toMatch(/secret|token|credential/i);
  });

  it("seeds the replacement's config from previewConfig (sanitized), keyed by the swapped step's previewId", () => {
    const patch = planToBuilderPatch(
      plan([
        { ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "keep" },
        { ref: "s1", role: "action", provider: "slack", type: "send_message", purpose: "swap", replaces: { provider: "gmail", type: "send_email" } },
      ]),
      {
        // preview-step-2 == the swapped action (index 1 over all steps, 1-based).
        previewConfig: { "preview-step-2": { message: "hi", bogus: "x" } },
        setupFieldsByType: { "slack:send_message": [{ name: "message", label: "Message", type: "textarea", required: true }] },
      },
    )!;
    expect(patch.kind).toBe("replace_action");
    if (patch.kind !== "replace_action") return;
    expect(patch.to.config).toEqual({ message: "hi" }); // unknown key dropped
  });
});
