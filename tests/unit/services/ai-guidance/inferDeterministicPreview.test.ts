/**
 * @jest-environment node
 *
 * Deterministic guidance fallback (HERMES-AGENT-DETERMINISTIC-SHAPE-FALLBACK).
 *
 * Proves the narrow fallback: produces a catalog-validated partial plan for the obvious
 * manual-run → Slack-channel-message shape, reads requiredInputs from REAL action metadata, fails
 * closed (null) for ambiguous goals and when the registry/metadata can't confirm a capability, and
 * its output passes validateWorkflowPlan. Model-free — no Hermes/network.
 *
 * The discovery registry is mocked with delegating wrappers (real behavior by default) so one test can
 * simulate "Slack action metadata unavailable" without faking the happy path.
 */
const mockGetActionMeta = jest.fn();
const mockGetTriggerMeta = jest.fn();
jest.mock("@/services/discovery/_registry", () => ({
  getActionMeta: (k: string) => mockGetActionMeta(k),
  getTriggerMeta: (k: string) => mockGetTriggerMeta(k),
}));

import { inferDeterministicPreviewPlan } from "@/services/ai-guidance/fallback/inferDeterministicPreview";
import { validateWorkflowPlan } from "@/services/ai-guidance/validateWorkflowPlan";

// Real registry, used to delegate the mock + to compute expected metadata-driven requiredInputs.
const realRegistry = jest.requireActual("@/services/discovery/_registry") as typeof import("@/services/discovery/_registry");

beforeEach(() => {
  mockGetActionMeta.mockReset().mockImplementation((k: string) => realRegistry.getActionMeta(k));
  mockGetTriggerMeta.mockReset().mockImplementation((k: string) => realRegistry.getTriggerMeta(k));
});

const LIVE_PROMPT =
  "When I run this workflow manually, send a Slack message to a channel reminding the team to review new leads.";

describe("inferDeterministicPreviewPlan — manual run → Slack channel message", () => {
  it("produces a validated plan with native:manual.run → slack:send_channel_message for the live prompt", () => {
    const plan = inferDeterministicPreviewPlan(LIVE_PROMPT);
    expect(plan).not.toBeNull();
    expect(plan!.notApplied).toBe(true);
    expect(plan!.steps.map((s) => `${s.provider}:${s.type}`)).toEqual([
      "native:manual.run",
      "slack:send_channel_message",
    ]);
    expect(plan!.steps[0]!.role).toBe("trigger");
    expect(plan!.steps[1]!.role).toBe("action");
    // The produced plan passes the SAME deterministic capability validator as the Hermes path.
    expect(validateWorkflowPlan(plan!).ok).toBe(true);
  });

  it("reads requiredInputs from REAL Slack action metadata (not hardcoded keys)", () => {
    const plan = inferDeterministicPreviewPlan(LIVE_PROMPT)!;
    const slackStep = plan.steps.find((s) => s.type === "send_channel_message")!;
    const expected = realRegistry
      .getActionMeta("slack:send_channel_message")!
      .fields.filter((f) => f.required)
      .map((f) => f.name);
    expect(expected.length).toBeGreaterThan(0);
    expect(slackStep.requiredInputs).toEqual(expected);
    // Sanity: the channel + message keys the rail setup card collects are among them.
    expect(slackStep.requiredInputs).toEqual(expect.arrayContaining(["channel", "text"]));
  });

  it("matches other obvious manual+Slack phrasings", () => {
    for (const g of [
      "when I run this manually, post a Slack message to a channel",
      "manual run, then send a slack reminder to the team channel",
      "When I run this workflow manually send a Slack message",
    ]) {
      expect(inferDeterministicPreviewPlan(g)).not.toBeNull();
    }
  });
});

describe("inferDeterministicPreviewPlan — fails closed (null)", () => {
  it("returns null for ambiguous goals", () => {
    for (const g of [
      "automate my leads",
      "notify the team when something important happens",
      "send a slack message",            // no manual-run signal
      "when I run this manually, do something", // no Slack signal
      "",
      "   ",
    ]) {
      expect(inferDeterministicPreviewPlan(g)).toBeNull();
    }
  });

  it("declines the explicit Slack DM / direct-message shape (does not guess the channel action)", () => {
    expect(inferDeterministicPreviewPlan("when I run this manually, send a slack DM to a teammate")).toBeNull();
    expect(inferDeterministicPreviewPlan("manual run then send a slack direct message")).toBeNull();
  });

  it("returns null when the Slack action metadata is unavailable (fail closed, no guessed ids)", () => {
    mockGetActionMeta.mockImplementation((k: string) =>
      k === "slack:send_channel_message" ? undefined : realRegistry.getActionMeta(k),
    );
    expect(inferDeterministicPreviewPlan(LIVE_PROMPT)).toBeNull();
  });

  it("returns null when the manual trigger metadata is unavailable", () => {
    mockGetTriggerMeta.mockImplementation((k: string) =>
      k === "native:manual.run" ? undefined : realRegistry.getTriggerMeta(k),
    );
    expect(inferDeterministicPreviewPlan(LIVE_PROMPT)).toBeNull();
  });
});
