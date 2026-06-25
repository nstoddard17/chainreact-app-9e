/**
 * @jest-environment node
 *
 * Deterministic MUTATION fallback (HERMES-AGENT-MUTATION-PREVIEW).
 *
 * Proves a "change it to an email notification" request against a current graph (manual.run →
 * slack:send_channel_message) yields a FULL updated plan that swaps Slack for a catalog email action,
 * marks the swapped step with `replaces` (so Apply replaces in place), reads requiredInputs from real
 * metadata, asks Gmail-vs-Outlook when ambiguous, reports the catalog gap when no email action exists,
 * never invents a generic "email" provider, and returns `none` when nothing safe matches. Model-free.
 */
const mockGetActionMeta = jest.fn();
const mockGetTriggerMeta = jest.fn();
jest.mock("@/services/discovery/_registry", () => ({
  getActionMeta: (k: string) => mockGetActionMeta(k),
  getTriggerMeta: (k: string) => mockGetTriggerMeta(k),
}));

import { inferDeterministicMutationPlan, type CurrentGraphNode } from "@/services/ai-guidance/fallback/inferDeterministicMutation";
import { validateWorkflowPlan } from "@/services/ai-guidance/validateWorkflowPlan";

const realRegistry = jest.requireActual("@/services/discovery/_registry") as typeof import("@/services/discovery/_registry");

beforeEach(() => {
  mockGetActionMeta.mockReset().mockImplementation((k: string) => realRegistry.getActionMeta(k));
  mockGetTriggerMeta.mockReset().mockImplementation((k: string) => realRegistry.getTriggerMeta(k));
});

const SLACK_GRAPH: CurrentGraphNode[] = [
  { kind: "trigger", provider: "native", type: "manual.run" },
  { kind: "action", provider: "slack", type: "send_channel_message" },
];

describe("inferDeterministicMutationPlan — Slack → email swap", () => {
  it("explicit Gmail: swaps slack:send_channel_message → gmail:send_email, keeps the trigger, marks `replaces`", () => {
    const res = inferDeterministicMutationPlan({ goalText: "change it to a gmail email notification", currentGraph: SLACK_GRAPH });
    expect(res.kind).toBe("plan");
    if (res.kind !== "plan") return;
    expect(res.plan.steps.map((s) => `${s.provider}:${s.type}`)).toEqual(["native:manual.run", "gmail:send_email"]);
    const emailStep = res.plan.steps.find((s) => s.type === "send_email")!;
    expect(emailStep.replaces).toEqual({ provider: "slack", type: "send_channel_message" });
    // requiredInputs come from REAL gmail metadata (to is required) — not hardcoded, not a validation failure.
    const expected = realRegistry.getActionMeta("gmail:send_email")!.fields.filter((f) => f.required).map((f) => f.name);
    expect(emailStep.requiredInputs).toEqual(expected);
    expect(emailStep.requiredInputs).toContain("to");
    // The produced plan passes the SAME capability validator as the model path.
    expect(validateWorkflowPlan(res.plan).ok).toBe(true);
  });

  it("explicit Outlook → microsoft-outlook:send_email", () => {
    const res = inferDeterministicMutationPlan({ goalText: "switch the notification to an outlook email", currentGraph: SLACK_GRAPH });
    expect(res.kind).toBe("plan");
    if (res.kind !== "plan") return;
    expect(res.plan.steps.map((s) => `${s.provider}:${s.type}`)).toEqual(["native:manual.run", "microsoft-outlook:send_email"]);
  });

  it("no provider specified + BOTH connected → ASKS Gmail vs Outlook (does not invent a generic email)", () => {
    const res = inferDeterministicMutationPlan({
      goalText: "change it to an email notification",
      currentGraph: SLACK_GRAPH,
      connectedEmailProviders: ["gmail", "microsoft-outlook"],
    });
    expect(res.kind).toBe("needs_provider_choice");
    if (res.kind !== "needs_provider_choice") return;
    expect(res.message).toMatch(/gmail or outlook/i);
    // No invented "email" provider anywhere.
    expect(JSON.stringify(res)).not.toMatch(/"provider"\s*:\s*"email"/i);
  });

  it("no provider specified + NEITHER connected → still ASKS (both exist in catalog, no approved default)", () => {
    const res = inferDeterministicMutationPlan({ goalText: "change it to an email notification", currentGraph: SLACK_GRAPH });
    expect(res.kind).toBe("needs_provider_choice");
  });

  it("no provider specified + exactly ONE connected → uses it as the safe default", () => {
    const res = inferDeterministicMutationPlan({
      goalText: "change it to an email notification",
      currentGraph: SLACK_GRAPH,
      connectedEmailProviders: ["gmail"],
    });
    expect(res.kind).toBe("plan");
    if (res.kind !== "plan") return;
    expect(res.plan.steps.map((s) => `${s.provider}:${s.type}`)).toEqual(["native:manual.run", "gmail:send_email"]);
  });

  it("no email action in the catalog → actionable catalog-gap message (no invented action)", () => {
    mockGetActionMeta.mockImplementation((k: string) =>
      k === "gmail:send_email" || k === "microsoft-outlook:send_email" ? undefined : realRegistry.getActionMeta(k),
    );
    const res = inferDeterministicMutationPlan({ goalText: "change it to an email notification", currentGraph: SLACK_GRAPH });
    expect(res.kind).toBe("catalog_gap");
    if (res.kind !== "catalog_gap") return;
    expect(res.message).toMatch(/email send action|doesn't have an email/i);
  });
});

describe("inferDeterministicMutationPlan — email → Slack swap", () => {
  it("swaps gmail:send_email → slack:send_channel_message, keeps the trigger, marks `replaces`", () => {
    const graph: CurrentGraphNode[] = [
      { kind: "trigger", provider: "native", type: "manual.run" },
      { kind: "action", provider: "gmail", type: "send_email" },
    ];
    const res = inferDeterministicMutationPlan({ goalText: "change it to a slack message instead", currentGraph: graph });
    expect(res.kind).toBe("plan");
    if (res.kind !== "plan") return;
    expect(res.plan.steps.map((s) => `${s.provider}:${s.type}`)).toEqual(["native:manual.run", "slack:send_channel_message"]);
    expect(res.plan.steps.find((s) => s.type === "send_channel_message")!.replaces).toEqual({ provider: "gmail", type: "send_email" });
  });
});

describe("inferDeterministicMutationPlan — fails closed (none)", () => {
  it("returns none when there is no slack action to swap", () => {
    const graph: CurrentGraphNode[] = [{ kind: "trigger", provider: "native", type: "manual.run" }];
    expect(inferDeterministicMutationPlan({ goalText: "change it to an email notification", currentGraph: graph }).kind).toBe("none");
  });

  it("returns none when the goal is not a change request", () => {
    expect(inferDeterministicMutationPlan({ goalText: "looks great, thanks", currentGraph: SLACK_GRAPH }).kind).toBe("none");
  });

  it("returns none for an empty graph or empty goal", () => {
    expect(inferDeterministicMutationPlan({ goalText: "change it to email", currentGraph: [] }).kind).toBe("none");
    expect(inferDeterministicMutationPlan({ goalText: "", currentGraph: SLACK_GRAPH }).kind).toBe("none");
  });
});
