/**
 * Tests for the deterministic Builder AI composer intent router
 * (Slice 4.AI-DIAG-QA-AUTOROUTE-1, CS-1).
 *
 * Pure-function table tests. They pin the routing policy from the plan
 * (docs/slices/phase-4/ai/ai-diag-qa-autoroute-plan-1.md): clear diagnostic
 * questions → "qa", clear build/edit commands → "plan", vague-mutation-capable or
 * mixed explain+act → "clarify". Precedence: a clear mutation command beats a
 * question wrapper; mixed intent asks rather than guesses; unmatched defaults to
 * the SAFE "clarify" (never "plan").
 */
import {
  classifyComposerIntent,
  type ComposerIntentRoute,
} from "@/features/workflow-builder/ai/classifyComposerIntent";

const route = (s: string): ComposerIntentRoute => classifyComposerIntent(s).route;

describe("classifyComposerIntent — Q&A route", () => {
  const QA: ReadonlyArray<string> = [
    "Why won't this run?",
    "What should I fix first?",
    "Can I ignore this?",
    "What data is available here?",
    "Explain this error",
    "Which step is causing the issue?",
    // extra coverage
    "How does this workflow work?",
    "What does this mean?",
    "What's wrong with the trigger?",
    "Is this configured correctly?",
    "Should I add a Slack step?", // advice question, NOT a command → qa
    "Why won't this workflow run?",
  ];
  it.each(QA)("routes %p to qa", (s) => {
    expect(route(s)).toBe("qa");
  });
});

describe("classifyComposerIntent — planner route", () => {
  const PLAN: ReadonlyArray<string> = [
    "Add a Slack step",
    "Can you add a Slack step?", // mutation command beats the question form
    "Build a workflow that sends an email",
    "Connect Gmail to this",
    "Remove this step",
    "Make it send an email after this",
    // extra coverage
    "Add Gmail after the trigger.",
    "Could you connect Slack for me?",
    "Delete this node",
    "Rename this step to Notify",
    "Change the trigger to a schedule",
    "Set up an HTTP request action",
    "I want to add a filter here",
    "Fix this workflow", // explicit workflow object, command form → plan
  ];
  it.each(PLAN)("routes %p to plan", (s) => {
    expect(route(s)).toBe("plan");
  });
});

describe("classifyComposerIntent — clarify route", () => {
  const CLARIFY: ReadonlyArray<string> = [
    "Fix this",
    "Help me",
    "Make this work",
    "What now?",
    "Can you handle this?",
    "Why is this broken and fix it",
    "Explain what is wrong and fix it",
    // extra coverage
    "What should I fix and then fix it",
    "Help with this workflow",
    "Sort this out",
    "Make it work",
    "Do something",
    "asdf qwerty", // unmatched, non-question → safe default clarify (never plan)
  ];
  it.each(CLARIFY)("routes %p to clarify", (s) => {
    expect(route(s)).toBe("clarify");
  });
});

describe("classifyComposerIntent — precedence rules", () => {
  it("a clear mutation command beats a question form", () => {
    expect(route("Can you add a Slack step?")).toBe("plan");
    expect(route("Could you remove this step?")).toBe("plan");
  });

  it("mixed explanation + mutation asks for clarification (never auto-plans)", () => {
    expect(route("Why is this broken and fix it?")).toBe("clarify");
    expect(route("Explain what is wrong and fix it")).toBe("clarify");
  });

  it("a diagnostic question with 'fix' as the OBJECT stays qa (not mixed)", () => {
    expect(route("What should I fix first?")).toBe("qa");
  });

  it("'make this work' (vague idiom) is clarify, but 'make it send…' (command) is plan", () => {
    expect(route("Make this work")).toBe("clarify");
    expect(route("Make it send an email after this")).toBe("plan");
  });

  it("'fix this' (vague) is clarify, but 'fix this workflow' (command) is plan", () => {
    expect(route("Fix this")).toBe("clarify");
    expect(route("Fix this workflow")).toBe("plan");
  });

  it("'should I add…' (advice) is qa, but 'can you add…' (request to act) is plan", () => {
    expect(route("Should I add a Slack step?")).toBe("qa");
    expect(route("Can you add a Slack step?")).toBe("plan");
  });
});

describe("classifyComposerIntent — edge cases", () => {
  it("empty / whitespace-only → clarify (never plan)", () => {
    expect(route("")).toBe("clarify");
    expect(route("   ")).toBe("clarify");
    expect(route("\n\t  \n")).toBe("clarify");
    expect(classifyComposerIntent("").signals).toContain("empty");
  });

  it("case + punctuation variation is normalized", () => {
    expect(route("ADD A SLACK STEP!!!")).toBe("plan");
    expect(route("why WON'T this RUN???")).toBe("qa");
    expect(route("FIX THIS.")).toBe("clarify");
  });

  it("curly-apostrophe contractions are handled", () => {
    expect(route("Why won’t this run?")).toBe("qa");
    expect(route("Why can’t I save this?")).toBe("qa");
  });

  it("multi-line prompts collapse to one normalized line", () => {
    expect(route("Add a Slack step\nright after the trigger")).toBe("plan");
    expect(route("Why won't this run?\nIt looks configured")).toBe("qa");
  });

  it("leading/trailing whitespace is trimmed", () => {
    expect(route("   Add a Slack step   ")).toBe("plan");
    expect(route("\t Why won't this run? \n")).toBe("qa");
  });

  it("returns diagnostic signals (never user-facing) for debugging", () => {
    expect(classifyComposerIntent("Add a Slack step").signals).toContain("plan:leading-build");
    expect(classifyComposerIntent("Why won't this run?").signals).toContain("qa:interrogative");
    expect(classifyComposerIntent("Why is this broken and fix it?").signals).toContain("mixed:appended-action");
  });
});
