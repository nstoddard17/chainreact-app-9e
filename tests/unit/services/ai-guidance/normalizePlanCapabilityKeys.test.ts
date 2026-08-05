/**
 * @jest-environment node
 *
 * REACT-AGENT-LIVE-BROWSER-CERTIFICATION-RUN-1 — deterministic capability-key normalization.
 *
 * Reproduced live in browser certification: the model returned the correct Gmail → Slack shape but
 * wrote the full id into `type` (`{provider:"gmail", type:"gmail:new_email"}`), so the validated key
 * was `gmail:gmail:new_email`. The plan was discarded and the user got a blank canvas on the turn
 * they had just answered a clarification. Runs against the REAL discovery registry.
 */
import { normalizePlanCapabilityKeys } from "@/services/ai-guidance/normalizePlanCapabilityKeys";
import { validateWorkflowPlan } from "@/services/ai-guidance/validateWorkflowPlan";
import { WORKFLOW_PLAN_SCHEMA_VERSION, type WorkflowPlan } from "@/contracts/guidanceSession";

function planWith(steps: WorkflowPlan["steps"]): WorkflowPlan {
  return {
    schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
    title: "t",
    summary: "s",
    notApplied: true,
    steps,
  };
}

describe("normalizePlanCapabilityKeys — repairs the observed duplication", () => {
  it("repairs provider-duplicated trigger AND action ids into registered capabilities", () => {
    const plan = planWith([
      { ref: "s0", role: "trigger", provider: "gmail", type: "gmail:new_email", purpose: "watch" },
      {
        ref: "s1",
        role: "action",
        provider: "slack",
        type: "slack:send_direct_message",
        purpose: "notify",
      },
    ]);
    expect(validateWorkflowPlan(plan).ok).toBe(false); // the live failure

    const { plan: fixed, repairedKeys } = normalizePlanCapabilityKeys(plan);
    expect(repairedKeys).toEqual(["gmail:gmail:new_email", "slack:slack:send_direct_message"]);
    expect(fixed.steps.map((s) => `${s.provider}:${s.type}`)).toEqual([
      "gmail:new_email",
      "slack:send_direct_message",
    ]);
    expect(validateWorkflowPlan(fixed).ok).toBe(true);
  });

  it("preserves everything else about the plan (refs, roles, order, purpose)", () => {
    const plan = planWith([
      { ref: "s0", role: "trigger", provider: "gmail", type: "gmail:new_email", purpose: "watch" },
    ]);
    const { plan: fixed } = normalizePlanCapabilityKeys(plan);
    expect(fixed.steps[0]).toMatchObject({ ref: "s0", role: "trigger", purpose: "watch" });
    expect(fixed.title).toBe(plan.title);
  });
});

describe("normalizePlanCapabilityKeys — never changes a plan's meaning", () => {
  it("leaves an already-valid plan untouched (same object)", () => {
    const plan = planWith([
      { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" },
      { ref: "s1", role: "action", provider: "slack", type: "send_direct_message", purpose: "notify" },
    ]);
    const { plan: out, repairedKeys } = normalizePlanCapabilityKeys(plan);
    expect(repairedKeys).toEqual([]);
    expect(out).toBe(plan);
  });

  it("does NOT invent a capability when stripping yields another unknown id", () => {
    const plan = planWith([
      { ref: "s0", role: "action", provider: "slack", type: "slack:send_smoke_signal", purpose: "x" },
    ]);
    const { plan: out, repairedKeys } = normalizePlanCapabilityKeys(plan);
    expect(repairedKeys).toEqual([]);
    expect(out.steps[0]!.type).toBe("slack:send_smoke_signal");
    expect(validateWorkflowPlan(out).ok).toBe(false); // still fails closed
  });

  it("does not touch a genuinely unsupported provider", () => {
    const plan = planWith([
      { ref: "s0", role: "action", provider: "madeup", type: "madeup:do_thing", purpose: "x" },
    ]);
    const { repairedKeys } = normalizePlanCapabilityKeys(plan);
    expect(repairedKeys).toEqual([]);
  });

  it("does not rewrite a trigger id into an action id (role is respected)", () => {
    // slack:send_direct_message is an ACTION; claiming it as a trigger must stay invalid.
    const plan = planWith([
      { ref: "s0", role: "trigger", provider: "slack", type: "slack:send_direct_message", purpose: "x" },
    ]);
    const { repairedKeys } = normalizePlanCapabilityKeys(plan);
    expect(repairedKeys).toEqual([]);
  });
});
