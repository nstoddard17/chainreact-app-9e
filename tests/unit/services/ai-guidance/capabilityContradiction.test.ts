/**
 * @jest-environment node
 *
 * REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 — the deterministic capability-contradiction guard.
 * Runs against the REAL discovery registry (no mocks): "Gmail has a registered trigger" must mean
 * the actual `gmail:new_email` polling registration, not a fixture that drifts.
 */
import {
  buildHonestCapabilityCopy,
  findCapabilityContradiction,
} from "@/services/ai-guidance/previewFirst/capabilityContradiction";

const GMAIL_CONVERSATION = ["when I get an email I want to be notified in slack", "gmail"];

describe("findCapabilityContradiction — catches the production false claim", () => {
  it("flags 'ChainReact doesn't have a trigger for Gmail' (gmail:new_email is registered polling)", () => {
    const c = findCapabilityContradiction({
      guidanceText:
        "I can't watch Gmail automatically because ChainReact doesn't have a trigger for that source.",
      conversationTexts: GMAIL_CONVERSATION,
    });
    expect(c).not.toBeNull();
    expect(c!.providerId).toBe("gmail");
    expect(c!.claim).toBe("no_trigger");
    expect(c!.registeredTriggerNames).toContain("New Email");
  });

  it("flags a blanket 'Gmail isn't supported' denial for a registered provider", () => {
    const c = findCapabilityContradiction({
      guidanceText: "Unfortunately Gmail isn't supported yet.",
      conversationTexts: ["gmail"],
    });
    expect(c).not.toBeNull();
    expect(c!.claim).toBe("not_supported");
  });
});

describe("findCapabilityContradiction — never repairs a truthful answer", () => {
  it("a denial that names NO provider is not attributed to a provider in scope (usage metrics are genuinely unwatchable)", () => {
    const c = findCapabilityContradiction({
      guidanceText:
        "I can't watch that automatically yet — ChainReact doesn't have a trigger for that source. Where should React read this from?",
      conversationTexts: ["low usage and it should go to slack. it should just alert someone"],
    });
    expect(c).toBeNull();
  });

  it("a provider the USER never named is out of scope even when the model denies it", () => {
    const c = findCapabilityContradiction({
      guidanceText: "ChainReact doesn't have a trigger for Gmail.",
      conversationTexts: ["notify me in slack when something happens"],
    });
    expect(c).toBeNull();
  });

  it("ordinary helpful prose about a named provider is untouched", () => {
    const c = findCapabilityContradiction({
      guidanceText: "Gmail's New Email trigger can watch your inbox — which Slack channel should the alert go to?",
      conversationTexts: GMAIL_CONVERSATION,
    });
    expect(c).toBeNull();
  });

  it("an app with no ChainReact registration at all cannot contradict (there is nothing to disprove)", () => {
    const c = findCapabilityContradiction({
      guidanceText: "ChainReact doesn't have a trigger for MadeUpApp.",
      conversationTexts: ["watch madeupapp and tell slack"],
    });
    expect(c).toBeNull();
  });
});

describe("buildHonestCapabilityCopy", () => {
  it("names the real registered trigger and invites the next step — application-owned wording", () => {
    const copy = buildHonestCapabilityCopy({
      providerId: "gmail",
      displayName: "Gmail",
      registeredTriggerNames: ["New Email", "New Labeled Email", "New Attachment"],
      claim: "no_trigger",
    });
    expect(copy).toContain("ChainReact can watch Gmail");
    expect(copy).toContain('"New Email"');
    expect(copy).not.toContain("can't");
  });
});
