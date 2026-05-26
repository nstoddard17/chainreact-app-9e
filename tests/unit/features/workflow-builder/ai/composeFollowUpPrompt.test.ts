/**
 * Tests for features/workflow-builder/ai/composeFollowUpPrompt.ts (Slice 4.AI-21).
 *
 * Pure-function tests. The helper is the planner-prompt reconstruction seam
 * for the React Agent's session-local follow-up chain: original prompt +
 * server-sanitized required-input labels + prior follow-up answers + the
 * latest follow-up. It is pure, has no I/O, and never sees a raw patch /
 * config / secret — only user-supplied text + the planner's sanitized
 * `requiredUserInput.label` strings.
 */
import { composeFollowUpPrompt } from "@/features/workflow-builder/ai/composeFollowUpPrompt";

describe("composeFollowUpPrompt — first-turn smoke (AI-21)", () => {
  it("includes the original prompt, the asked labels, and the follow-up", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Create a workflow that sends a Slack message when I manually run it.",
      requiredInputLabels: [
        "Which Slack channel should the message be sent to?",
        "What should the message say?",
      ],
      priorFollowUpAnswers: [],
      followUp: "Use #general and say Test from ChainReact AI.",
    });
    expect(out).toContain("Original request:");
    expect(out).toContain("Create a workflow that sends a Slack message when I manually run it.");
    expect(out).toContain("The agent asked for:");
    expect(out).toContain("- Which Slack channel should the message be sent to?");
    expect(out).toContain("- What should the message say?");
    expect(out).toContain("User follow-up:");
    expect(out).toContain("Use #general and say Test from ChainReact AI.");
    expect(out).toContain("Create the workflow using the original request and the follow-up details.");
  });

  it("omits the 'Previous follow-up answers' section on the first turn", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "do X",
      requiredInputLabels: ["A?", "B?"],
      priorFollowUpAnswers: [],
      followUp: "answer one",
    });
    expect(out).not.toContain("Previous follow-up answers:");
  });

  it("omits the 'The agent asked for' section when no labels are provided", () => {
    // Defensive: shouldn't really happen (the panel only calls follow-up
    // when requiredInputLabels.length > 0) but the helper handles it.
    const out = composeFollowUpPrompt({
      originalPrompt: "do X",
      requiredInputLabels: [],
      priorFollowUpAnswers: [],
      followUp: "extra context",
    });
    expect(out).not.toContain("The agent asked for:");
    expect(out).toContain("Original request:");
    expect(out).toContain("User follow-up:");
  });
});

describe("composeFollowUpPrompt — multi-turn chain (AI-21)", () => {
  it("renders 'Previous follow-up answers' as a bulleted list when prior answers exist", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send a Slack message when I manually run.",
      requiredInputLabels: ["What should the message say?"],
      priorFollowUpAnswers: ["Use #general"],
      followUp: "Say 'Test from ChainReact AI.'",
    });
    expect(out).toContain("Previous follow-up answers:");
    expect(out).toContain("- Use #general");
    expect(out).toContain("User follow-up:");
    expect(out).toContain("Say 'Test from ChainReact AI.'");
  });

  it("preserves prior-answer order and never collapses duplicates", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "do X",
      requiredInputLabels: ["C?"],
      priorFollowUpAnswers: ["answer A", "answer B"],
      followUp: "answer C",
    });
    const aIdx = out.indexOf("- answer A");
    const bIdx = out.indexOf("- answer B");
    const cIdx = out.indexOf("answer C");
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
    expect(cIdx).toBeGreaterThan(bIdx);
  });
});

describe("composeFollowUpPrompt — trimming / safety (AI-21)", () => {
  it("trims surrounding whitespace on the original prompt and the follow-up", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "   hello   \n",
      requiredInputLabels: ["A?"],
      priorFollowUpAnswers: [],
      followUp: "   ok   ",
    });
    expect(out).toContain("Original request:\nhello");
    expect(out).toContain("User follow-up:\nok");
    expect(out).not.toContain("Original request:\n   hello");
    expect(out).not.toContain("User follow-up:\n   ok");
  });

  it("does not invent sections — only what callers passed is rendered", () => {
    // Caller did not provide priorFollowUpAnswers; output must not include
    // any "Previous follow-up answers:" header.
    const out = composeFollowUpPrompt({
      originalPrompt: "hello",
      requiredInputLabels: [],
      priorFollowUpAnswers: [],
      followUp: "world",
    });
    expect(out).not.toContain("Previous follow-up answers:");
    expect(out).not.toContain("The agent asked for:");
    // But the trailing instruction should always be present so the model
    // knows to build the workflow.
    expect(out).toContain(
      "Create the workflow using the original request and the follow-up details.",
    );
  });
});
