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

import {
  inferDeterministicPreviewPlan,
  detectCatalogGap,
} from "@/services/ai-guidance/fallback/inferDeterministicPreview";
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

// REACT-LIVE-SKELETON — the Mailchimp win-back example from Marcus's screenshots. The TAG part is
// catalog-backed (mailchimp:add_tag) → a visible skeleton; the SEND-email part is a catalog gap.
describe("inferDeterministicPreviewPlan — Mailchimp tag flow", () => {
  it("produces a validated manual.run → mailchimp:add_tag plan for a win-back tag goal", () => {
    const plan = inferDeterministicPreviewPlan(
      "tag canceled customers in Mailchimp with a win-back tag for retention",
    );
    expect(plan).not.toBeNull();
    expect(plan!.steps.map((s) => `${s.provider}:${s.type}`)).toEqual([
      "native:manual.run",
      "mailchimp:add_tag",
    ]);
    expect(validateWorkflowPlan(plan!).ok).toBe(true);
    // requiredInputs come from REAL add_tag metadata (not hardcoded).
    const tagStep = plan!.steps.find((s) => s.type === "add_tag")!;
    const expected = realRegistry
      .getActionMeta("mailchimp:add_tag")!
      .fields.filter((f) => f.required)
      .map((f) => f.name);
    expect(tagStep.requiredInputs).toEqual(expected);
  });

  it("declines a remove/untag-only Mailchimp goal (different shape)", () => {
    expect(
      inferDeterministicPreviewPlan("remove the canceled tag from a Mailchimp subscriber"),
    ).toBeNull();
  });

  it("fails closed when mailchimp:add_tag metadata is unavailable", () => {
    mockGetActionMeta.mockImplementation((k: string) =>
      k === "mailchimp:add_tag" ? undefined : realRegistry.getActionMeta(k),
    );
    expect(
      inferDeterministicPreviewPlan("apply a win-back tag in Mailchimp"),
    ).toBeNull();
  });
});

// REACT-LIVE-SKELETON — the churn / low-usage → Slack alert case from Marcus's screenshot. ChainReact
// has no "watch usage" trigger, but the Slack alert half is catalog-backed, so we produce a CLEARLY
// LABELED starter skeleton (manual placeholder trigger + Slack channel message) instead of an empty
// canvas. The user re-points the trigger to a real source.
describe("inferDeterministicPreviewPlan — Slack alert starter skeleton (no catalog trigger for the source)", () => {
  it("builds a validated manual.run → slack:send_channel_message starter for the screenshot prompt", () => {
    const plan = inferDeterministicPreviewPlan("low usage and it should go to slack. it should just alert someone");
    expect(plan).not.toBeNull();
    expect(plan!.steps.map((s) => `${s.provider}:${s.type}`)).toEqual([
      "native:manual.run",
      "slack:send_channel_message",
    ]);
    expect(validateWorkflowPlan(plan!).ok).toBe(true);
    expect(plan!.notApplied).toBe(true);
  });

  it("clearly labels it as a STARTER skeleton (title/summary say it can't watch usage on its own)", () => {
    const plan = inferDeterministicPreviewPlan("alert our slack channel when usage drops below the threshold")!;
    expect(plan.title.toLowerCase()).toContain("starter");
    expect(plan.summary.toLowerCase()).toMatch(/starter skeleton/);
    expect(plan.summary.toLowerCase()).toMatch(/can'?t watch usage|pick the real source/);
    // The placeholder trigger explains itself; no guessed provider trigger.
    expect(plan.steps[0]!.provider).toBe("native");
    expect(plan.steps[0]!.purpose.toLowerCase()).toContain("replace this with your real source");
  });

  it("reads the Slack action's REAL requiredInputs (channel, text) — not hardcoded", () => {
    const plan = inferDeterministicPreviewPlan("notify slack with an alert when churn rises")!;
    const slackStep = plan.steps.find((s) => s.type === "send_channel_message")!;
    const expected = realRegistry
      .getActionMeta("slack:send_channel_message")!
      .fields.filter((f) => f.required)
      .map((f) => f.name);
    expect(slackStep.requiredInputs).toEqual(expected);
    expect(slackStep.requiredInputs).toEqual(expect.arrayContaining(["channel", "text"]));
  });

  it("matches other watch-a-metric → Slack alert phrasings", () => {
    for (const g of [
      "alert me on slack when revenue drops",
      "ping our slack channel if active users fall below 100",
      "send a slack alert when error rate spikes",
      "notify slack about low engagement",
    ]) {
      expect(inferDeterministicPreviewPlan(g)).not.toBeNull();
    }
  });

  it("does NOT fire for a plain Slack message with no alert+source intent (stays null)", () => {
    for (const g of [
      "send a slack message",
      "post a slack update to the team channel",
      "share a slack note with everyone",
    ]) {
      expect(inferDeterministicPreviewPlan(g)).toBeNull();
    }
  });

  it("declines the Slack DM shape even with an alert+source intent", () => {
    expect(inferDeterministicPreviewPlan("alert me with a slack DM when usage drops")).toBeNull();
  });

  it("fails closed when the Slack action metadata is unavailable (no guessed ids)", () => {
    mockGetActionMeta.mockImplementation((k: string) =>
      k === "slack:send_channel_message" ? undefined : realRegistry.getActionMeta(k),
    );
    expect(inferDeterministicPreviewPlan("alert slack when usage drops")).toBeNull();
  });
});

describe("detectCatalogGap — Mailchimp send/email has no catalog action", () => {
  it("reports the exact gap for a Mailchimp win-back EMAIL/campaign intent", () => {
    const gap = detectCatalogGap(
      "send a win-back email campaign in Mailchimp to canceled customers",
    );
    expect(gap).not.toBeNull();
    expect(gap!.provider).toBe("mailchimp");
    expect(gap!.message).toMatch(/send-campaign|send-email/i);
  });

  it("returns null for a tag-only Mailchimp goal (no send intent → no gap)", () => {
    expect(detectCatalogGap("apply a win-back tag in Mailchimp")).toBeNull();
  });

  it("returns null for non-Mailchimp goals", () => {
    expect(detectCatalogGap("send a Slack message when I run this manually")).toBeNull();
    expect(detectCatalogGap("")).toBeNull();
  });

  it("auto-clears the gap if a Mailchimp send action ever exists in the catalog", () => {
    mockGetActionMeta.mockImplementation((k: string) =>
      k === "mailchimp:send_campaign"
        ? ({ key: k, provider: "mailchimp", type: "send_campaign", fields: [] } as unknown as ReturnType<typeof realRegistry.getActionMeta>)
        : realRegistry.getActionMeta(k),
    );
    expect(detectCatalogGap("send a Mailchimp email campaign")).toBeNull();
  });
});
