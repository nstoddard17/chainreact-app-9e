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
    // Slice 4.AI-35I — authoritative-latest closing (replaced the AI-35
    // "Produce the workflow patch for the original request" wording).
    expect(out).toContain("The user's latest message is authoritative.");
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

describe("composeFollowUpPrompt — structured answers (AI-22)", () => {
  it("renders structured answers under 'User provided:' with label + display", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send a Slack message when I run.",
      requiredInputLabels: ["Which Slack channel?", "What should the message say?"],
      priorFollowUpAnswers: [],
      followUp: "",
      structuredAnswers: [
        { label: "Channel", display: "#general", value: "C123456" },
        { label: "Message", display: "Test from ChainReact AI" },
      ],
    });
    expect(out).toContain("User provided:");
    expect(out).toContain("- Channel: #general (value: C123456)");
    expect(out).toContain("- Message: Test from ChainReact AI");
  });

  it("omits the '(value: …)' suffix when value === display (no redundant id echo)", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "x",
      requiredInputLabels: [],
      priorFollowUpAnswers: [],
      followUp: "",
      structuredAnswers: [{ label: "Channel", display: "#general", value: "#general" }],
    });
    expect(out).toContain("- Channel: #general");
    expect(out).not.toMatch(/value:\s*#general/);
  });

  it("works with only structured answers and an empty followUp text", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send a Slack message",
      requiredInputLabels: ["Channel?"],
      priorFollowUpAnswers: [],
      followUp: "",
      structuredAnswers: [{ label: "Channel", display: "#general", value: "C123" }],
    });
    expect(out).toContain("User provided:");
    expect(out).not.toContain("User follow-up:");
    expect(out).toContain("The user's latest message is authoritative.");
  });

  it("renders both 'User provided' and 'User follow-up' sections when both are present", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "x",
      requiredInputLabels: [],
      priorFollowUpAnswers: [],
      followUp: "also retry once on 5xx",
      structuredAnswers: [{ label: "Channel", display: "#general", value: "C123" }],
    });
    expect(out).toContain("User provided:");
    expect(out).toContain("- Channel: #general");
    expect(out).toContain("User follow-up:\nalso retry once on 5xx");
  });

  it("omits the 'User provided' section when no structured answers are passed (backwards compatible)", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "x",
      requiredInputLabels: [],
      priorFollowUpAnswers: [],
      followUp: "answer",
    });
    expect(out).not.toContain("User provided:");
    expect(out).toContain("User follow-up:\nanswer");
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
    // knows to build the workflow (AI-35I authoritative-latest closing).
    expect(out).toContain("The user's latest message is authoritative.");
  });
});

describe("composeFollowUpPrompt — AI-35 provider-choice citation + edit-aware closing", () => {
  it("renders a provider_choice answer as a clear directive ('The email provider is Gmail.')", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "When I get an email send a Slack message",
      requiredInputLabels: ["Which email app should this use — Gmail or Microsoft Outlook?"],
      priorFollowUpAnswers: [],
      followUp: "",
      structuredAnswers: [
        { label: "email provider", display: "Gmail", value: "gmail", category: "email" },
      ],
    });
    expect(out).toContain("The email provider is Gmail (id: gmail).");
    expect(out).toContain("The user's latest message is authoritative.");
  });

  it("closing instruction is edit-aware (UPDATE existing nodes, not always create)", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Change this to send the message to a different person",
      requiredInputLabels: ["Which Slack user should receive the direct message?"],
      priorFollowUpAnswers: [],
      followUp: "user123",
    });
    expect(out).toContain("UPDATE those existing nodes");
    expect(out).not.toContain("Create the workflow using the original request");
  });
});

describe("composeFollowUpPrompt — AI-35I authoritative-latest + correction override", () => {
  it("always renders the authoritative-latest closing (latest message overrides prior context)", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send me a Slack DM when I manually run this workflow",
      requiredInputLabels: ["Which Slack user should receive the DM?"],
      priorFollowUpAnswers: [],
      followUp: "This is to a channel",
    });
    expect(out).toContain("The user's latest message is authoritative.");
    expect(out).toContain("CONTEXT ONLY");
    expect(out).toContain("REPLACE the obsolete provider/action/trigger choice");
  });

  it("adds a prominent 'Correction:' override directive when isCorrection is true", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send me a Slack DM when I manually run this workflow",
      requiredInputLabels: ["Which Slack user should receive the DM?"],
      priorFollowUpAnswers: [],
      followUp: "This is to a channel",
      isCorrection: true,
    });
    expect(out).toContain("Correction:");
    expect(out).toContain("explicit override of the previously inferred provider, action, and trigger");
  });

  it("omits the 'Correction:' directive when isCorrection is false / absent (backwards compatible)", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send a Slack message",
      requiredInputLabels: ["What should the message say?"],
      priorFollowUpAnswers: [],
      followUp: "Hey",
    });
    expect(out).not.toContain("Correction:");
    // The authoritative-latest closing is still present even without a correction.
    expect(out).toContain("The user's latest message is authoritative.");
  });

  it("renders the prior plan summary as NON-BINDING context when provided", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send me a Slack DM when I manually run this workflow",
      requiredInputLabels: ["Which Slack user should receive the DM?"],
      priorFollowUpAnswers: [],
      followUp: "This is to a channel",
      isCorrection: true,
      priorPlanSummary: "Send a Slack direct message when the workflow is run manually.",
    });
    expect(out).toContain("Current plan so far (context only — may be replaced by your latest message):");
    expect(out).toContain("Send a Slack direct message when the workflow is run manually.");
  });

  it("omits the prior-plan-summary section when not provided / blank", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "x",
      requiredInputLabels: [],
      priorFollowUpAnswers: [],
      followUp: "This is to a channel",
      priorPlanSummary: "   ",
    });
    expect(out).not.toContain("Current plan so far");
  });
});

describe("composeFollowUpPrompt — AI-35J preserve compatible values across corrections", () => {
  it("the correction directive instructs the planner to PRESERVE compatible prior values", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send me a Slack DM when I manually run this workflow",
      requiredInputLabels: ["Which Slack user should receive the DM?"],
      priorFollowUpAnswers: ["What should the Slack direct message say?: hey"],
      followUp: "this is to a channel",
      isCorrection: true,
    });
    // The override is still present (AI-35I), AND a preserve instruction is added.
    expect(out).toContain("Correction:");
    expect(out).toContain("PRESERVE earlier user-provided values that still apply");
    expect(out).toContain("do NOT re-ask for a value the user already supplied when it remains compatible");
    // The already-supplied message text is in the prompt for the planner to reuse.
    expect(out).toContain("What should the Slack direct message say?: hey");
  });

  it("the always-rendered closing keeps obsolete-input discarding AND adds value preservation", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send me a Slack DM",
      requiredInputLabels: ["Which Slack user should receive the DM?"],
      priorFollowUpAnswers: [],
      followUp: "this is to a channel",
      isCorrection: true,
    });
    expect(out).toContain("REPLACE the obsolete provider/action/trigger choice");
    expect(out).toContain("PRESERVING earlier user-provided values that still apply");
    expect(out).toContain("message text/body/content, schedule times, filter terms");
  });

  it("guards incompatible destination transfer (recipient/channel only when destination type is unchanged)", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send me a Slack DM",
      requiredInputLabels: ["Which Slack user should receive the DM?"],
      priorFollowUpAnswers: [],
      followUp: "this is to a channel",
      isCorrection: true,
    });
    // The qualifier is what stops a DM user id being reused as a channel id.
    expect(out).toContain("destination details when the destination type is unchanged");
  });

  it("the preserve clause is in the closing even for a NON-correction follow-up (always rendered)", () => {
    const out = composeFollowUpPrompt({
      originalPrompt: "Send a Slack message",
      requiredInputLabels: ["What should the message say?"],
      priorFollowUpAnswers: ["Use #general"],
      followUp: "say hello",
    });
    // No correction directive, but prior answers still render + closing still
    // carries the preserve clause (no regression to AI-21/22 follow-ups).
    expect(out).not.toContain("Correction:");
    expect(out).toContain("- Use #general");
    expect(out).toContain("PRESERVING earlier user-provided values that still apply");
  });
});
