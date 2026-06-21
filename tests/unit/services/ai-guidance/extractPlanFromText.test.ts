/**
 * @jest-environment node
 *
 * Deterministic plan extractor (HERMES-AGENT-PLAN-EXTRACTION).
 * Proves extractPlanFromText pulls a SHAPE-valid WorkflowPlan candidate out of fenced ```json blocks,
 * tolerates ordinary prose (null), ignores malformed/non-plan JSON, is safe with multiple blocks,
 * synthesizes missing refs, always forces notApplied:true, and never throws. Capability validation is
 * NOT this module's job — it returns shape-valid candidates only. stripSourceBlock cleans display.
 */

import { extractPlanFromText, stripSourceBlock } from "@/services/ai-guidance/gateway/extractPlanFromText";

function fenced(json: string, lang = "json"): string {
  return "Here is some guidance.\n\n```" + lang + "\n" + json + "\n```\n\nGood luck!";
}

const validPlanJson = JSON.stringify({
  title: "Follow up with leads",
  summary: "Remind you to follow up.",
  steps: [
    { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch inbox" },
    { ref: "s1", role: "action", provider: "slack", type: "send_message", purpose: "notify" },
  ],
});

describe("extractPlanFromText — prose tolerance", () => {
  it("returns null for ordinary prose with no JSON", () => {
    expect(extractPlanFromText("Just connect Gmail and add a Slack step. No JSON here.")).toBeNull();
  });

  it("returns null for empty / non-string input", () => {
    expect(extractPlanFromText("")).toBeNull();
    expect(extractPlanFromText(undefined as unknown as string)).toBeNull();
  });
});

describe("extractPlanFromText — fenced json plan", () => {
  it("extracts a shape-valid plan from a fenced ```json block (notApplied forced true)", () => {
    const out = extractPlanFromText(fenced(validPlanJson));
    expect(out).not.toBeNull();
    expect(out!.plan.notApplied).toBe(true);
    expect(out!.plan.steps).toHaveLength(2);
    expect(out!.plan.steps[0]).toMatchObject({ ref: "s0", role: "trigger", provider: "gmail", type: "new_email" });
    expect(out!.sourceBlock.startsWith("```")).toBe(true);
  });

  it("works with a bare ``` fence (no language tag)", () => {
    const out = extractPlanFromText(fenced(validPlanJson, ""));
    expect(out).not.toBeNull();
    expect(out!.plan.steps).toHaveLength(2);
  });

  it("synthesizes missing step refs as s0/s1…", () => {
    const json = JSON.stringify({ steps: [{ role: "action", provider: "slack", type: "send_message" }] });
    const out = extractPlanFromText(fenced(json));
    expect(out!.plan.steps[0]!.ref).toBe("s0");
    expect(out!.plan.steps[0]!.purpose).toBe("");
  });
});

describe("extractPlanFromText — fails safe", () => {
  it("ignores malformed JSON inside a fence (no throw, returns null)", () => {
    expect(extractPlanFromText(fenced("{ not valid json,,, }"))).toBeNull();
  });

  it("ignores a fenced JSON object that is not plan-shaped (no steps)", () => {
    expect(extractPlanFromText(fenced(JSON.stringify({ foo: 1, bar: "x" })))).toBeNull();
  });

  it("ignores a plan with an empty steps array", () => {
    expect(extractPlanFromText(fenced(JSON.stringify({ steps: [] })))).toBeNull();
  });
});

describe("extractPlanFromText — multiple blocks (safe)", () => {
  it("skips a leading non-plan block and returns the first plan block", () => {
    const text =
      "```json\n" + JSON.stringify({ example: true }) + "\n```\n\n```json\n" + validPlanJson + "\n```";
    const out = extractPlanFromText(text);
    expect(out).not.toBeNull();
    expect(out!.plan.steps).toHaveLength(2);
  });

  it("returns the FIRST plan when multiple plan blocks exist (deterministic)", () => {
    const first = JSON.stringify({ title: "first", steps: [{ role: "action", provider: "slack", type: "send_message" }] });
    const second = JSON.stringify({ title: "second", steps: [{ role: "action", provider: "gmail", type: "send_email" }] });
    const out = extractPlanFromText("```json\n" + first + "\n```\n```json\n" + second + "\n```");
    expect(out!.plan.title).toBe("first");
  });
});

describe("extractPlanFromText — whole-content JSON", () => {
  it("extracts a plan when the content is a bare JSON object (no fence/prose)", () => {
    const out = extractPlanFromText(validPlanJson);
    expect(out).not.toBeNull();
    expect(out!.sourceBlock).toBe(validPlanJson);
  });
});

describe("stripSourceBlock", () => {
  it("removes the block and collapses the gap, leaving the prose", () => {
    const text = fenced(validPlanJson);
    const out = extractPlanFromText(text)!;
    const stripped = stripSourceBlock(text, out.sourceBlock);
    expect(stripped).toContain("Here is some guidance.");
    expect(stripped).toContain("Good luck!");
    expect(stripped).not.toContain("```");
  });

  it("returns null when stripping would empty the text (bare-JSON case)", () => {
    expect(stripSourceBlock(validPlanJson, validPlanJson)).toBeNull();
  });
});
