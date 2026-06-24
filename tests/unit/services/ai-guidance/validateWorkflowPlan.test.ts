/**
 * @jest-environment node
 *
 * WorkflowPlan capability validation (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 * Proves a plan's provider/action claims are validated against the REAL ChainReact capability
 * registry — a hallucinated provider:type is rejected; real ones (pulled from discovery) pass.
 */

import {
  validateWorkflowPlan,
  isPlanStepKnown,
  summarizeInvalidPlan,
  GUIDANCE_SOURCE_QUESTION,
} from "@/services/ai-guidance/validateWorkflowPlan";
import { listAllActionMetas, listAllTriggerMetas } from "@/services/discovery/_registry";
import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";

const realAction = listAllActionMetas()[0]!;
const realTrigger = listAllTriggerMetas()[0]!;

function plan(steps: WorkflowPlanStep[]): WorkflowPlan {
  return { schemaVersion: 1, title: "t", summary: "s", steps, notApplied: true };
}

describe("validateWorkflowPlan — capability validation", () => {
  it("accepts a plan whose trigger + action exist in the discovery registry", () => {
    const res = validateWorkflowPlan(plan([
      { ref: "s0", role: "trigger", provider: realTrigger.provider, type: realTrigger.type, purpose: "start" },
      { ref: "s1", role: "action", provider: realAction.provider, type: realAction.type, purpose: "do" },
    ]));
    expect(res.ok).toBe(true);
  });

  it("REJECTS a hallucinated action provider:type (Hermes cannot invent capabilities)", () => {
    const res = validateWorkflowPlan(plan([
      { ref: "s0", role: "action", provider: "totallymadeup", type: "do_magic", purpose: "x" },
    ]));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.invalidSteps).toHaveLength(1);
      expect(res.invalidSteps[0]).toMatchObject({ ref: "s0", reason: "UNKNOWN_ACTION", capabilityKey: "totallymadeup:do_magic" });
    }
  });

  it("REJECTS a hallucinated trigger", () => {
    const res = validateWorkflowPlan(plan([
      { ref: "s0", role: "trigger", provider: "ghostprovider", type: "never_happens", purpose: "x" },
    ]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.invalidSteps[0]!.reason).toBe("UNKNOWN_TRIGGER");
  });

  it("accepts a logic step with no provider; rejects a logic step that claims an unknown provider", () => {
    expect(isPlanStepKnown({ ref: "s0", role: "logic", provider: "", type: "if", purpose: "branch" })).toBe(true);
    expect(isPlanStepKnown({ ref: "s0", role: "logic", provider: "core", type: "loop", purpose: "iterate" })).toBe(true);
    const res = validateWorkflowPlan(plan([{ ref: "s0", role: "logic", provider: "madeup", type: "if", purpose: "x" }]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.invalidSteps[0]!.reason).toBe("UNKNOWN_CAPABILITY");
  });

  it("reports every invalid step, not just the first", () => {
    const res = validateWorkflowPlan(plan([
      { ref: "s0", role: "action", provider: "realish", type: "nope", purpose: "x" },
      { ref: "s1", role: "trigger", provider: "alsofake", type: "nope", purpose: "y" },
    ]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.invalidSteps.map((s) => s.ref)).toEqual(["s0", "s1"]);
  });
});

describe("summarizeInvalidPlan — safe, actionable failure reasons (no raw model JSON / secrets)", () => {
  it("an unknown TRIGGER asks WHERE the data should come from (needsSource) + keeps keys for logs only", () => {
    const res = validateWorkflowPlan(plan([
      { ref: "s0", role: "trigger", provider: "usage", type: "drops_below_threshold", purpose: "watch" },
      { ref: "s1", role: "action", provider: realAction.provider, type: realAction.type, purpose: "alert" },
    ]));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const summary = summarizeInvalidPlan(res.invalidSteps);
    expect(summary.needsSource).toBe(true);
    expect(summary.message).toContain(GUIDANCE_SOURCE_QUESTION);
    expect(summary.message).toMatch(/can't watch that automatically/i);
    // The de-identified capability key is available for LOGS, but never embedded in the user message.
    expect(summary.invalidCapabilityKeys).toContain("usage:drops_below_threshold");
    expect(summary.message).not.toContain("usage:drops_below_threshold");
  });

  it("an unknown ACTION (no unknown trigger) says it isn't in the catalog yet + asks which app", () => {
    const res = validateWorkflowPlan(plan([
      { ref: "s0", role: "action", provider: "totallymadeup", type: "do_magic", purpose: "x" },
    ]));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const summary = summarizeInvalidPlan(res.invalidSteps);
    expect(summary.needsSource).toBe(false);
    expect(summary.message).toMatch(/isn'?t in ChainReact'?s catalog yet/i);
    expect(summary.message).toMatch(/which app/i);
  });

  it("a missing trigger takes priority over a missing action (the source question wins)", () => {
    const res = validateWorkflowPlan(plan([
      { ref: "s0", role: "trigger", provider: "ghost", type: "x", purpose: "y" },
      { ref: "s1", role: "action", provider: "nope", type: "z", purpose: "w" },
    ]));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(summarizeInvalidPlan(res.invalidSteps).needsSource).toBe(true);
  });
});
