/**
 * @jest-environment node
 *
 * Dynamic trigger outputs + semantic mapping (TYPEFORM-DYNAMIC-OUTPUTS-CONSUMPTION-1).
 *
 * Covers Phase 1 (a reusable, resolver-backed dynamic-output contract for triggers) and Phase 4 (a
 * provider-neutral semantic mapper), plus the service that joins them. Real registry metadata, real
 * pure logic; only the options-resolver call is injected.
 */

import {
  dynamicOutputPath,
  isAwaitingDynamicSchema,
  mergeDynamicTriggerOutputs,
} from "@/core/workflows/mapping/dynamicTriggerOutputs";
import {
  buildSummaryBody,
  classifyConcept,
  mapFieldSemantically,
  normalizeLabel,
  toReference,
  type MappingCandidate,
} from "@/core/workflows/mapping/semanticFieldMapping";
import { resolveDynamicTriggerOutputs } from "@/services/discovery/dynamicTriggerOutputs";
import { typeformNewResponseInFormTriggerMeta as TYPEFORM } from "@/integrations/typeform/triggers/newResponseInForm/newResponseInForm.meta";
import { getTriggerMeta } from "@/services/discovery/_registry";
import { applyDynamicOutputs } from "@/core/workflows/dynamicOutputs";
import { getActionMeta } from "@/services/discovery/_registry";

const QUESTIONS = [
  { key: "email", label: "Email address", type: "string" },
  { key: "first_name", label: "First name", type: "string" },
  { key: "last_name", label: "Last name", type: "string" },
  { key: "company", label: "Company", type: "string" },
  { key: "message", label: "Message", type: "string" },
];

// ───────────────────── Phase 1: the dynamic trigger-output contract ─────────────────────

describe("dynamic trigger outputs (#1-#8)", () => {
  it("(#1) merges dynamic children under the declared static output", () => {
    const { outputs, synthesized } = mergeDynamicTriggerOutputs(TYPEFORM, QUESTIONS);
    expect(synthesized).toBe(true);
    const byRef = outputs.find((o) => o.name === "answersByRef")!;
    expect((byRef.fields ?? []).map((f) => f.name)).toEqual([
      "email",
      "first_name",
      "last_name",
      "company",
      "message",
    ]);
    // Static siblings are untouched and keep their identity.
    expect(outputs.find((o) => o.name === "answers")).toBe(
      TYPEFORM.payloadShape.find((o) => o.name === "answers"),
    );
  });

  it("(#3) outputs depend on the selected configuration", () => {
    expect(isAwaitingDynamicSchema(TYPEFORM, {})).toBe(true);
    expect(isAwaitingDynamicSchema(TYPEFORM, { formId: "" })).toBe(true);
    expect(isAwaitingDynamicSchema(TYPEFORM, { formId: "form-1" })).toBe(false);
  });

  it("(#5) a different form yields a different output set", () => {
    const a = mergeDynamicTriggerOutputs(TYPEFORM, [{ key: "email", label: "Email" }]);
    const b = mergeDynamicTriggerOutputs(TYPEFORM, [{ key: "rating", label: "Rating", type: "number" }]);
    const namesA = (a.outputs.find((o) => o.name === "answersByRef")!.fields ?? []).map((f) => f.name);
    const namesB = (b.outputs.find((o) => o.name === "answersByRef")!.fields ?? []).map((f) => f.name);
    expect(namesA).toEqual(["email"]);
    expect(namesB).toEqual(["rating"]);
  });

  it("(#6) duplicate and unsafe keys fail VISIBLY rather than silently dropping data", () => {
    const { outputs, rejectedKeys } = mergeDynamicTriggerOutputs(TYPEFORM, [
      { key: "email", label: "Email" },
      { key: "email", label: "Email (again)" },
      { key: "bad.key", label: "Unsafe" },
      { key: "", label: "Empty" },
    ]);
    expect(rejectedKeys).toEqual(["email", "bad.key", ""]);
    const names = (outputs.find((o) => o.name === "answersByRef")!.fields ?? []).map((f) => f.name);
    expect(names).toEqual(["email"]);
  });

  it("(#7) the static registry metadata is never mutated", () => {
    const before = JSON.stringify(getTriggerMeta("typeform:new_response_in_form"));
    mergeDynamicTriggerOutputs(TYPEFORM, QUESTIONS);
    expect(JSON.stringify(getTriggerMeta("typeform:new_response_in_form"))).toBe(before);
  });

  it("(#8) a trigger with no declaration is unaffected and keeps output identity", () => {
    const plain = { payloadShape: TYPEFORM.payloadShape } as const;
    const result = mergeDynamicTriggerOutputs(plain, QUESTIONS);
    expect(result.synthesized).toBe(false);
    expect(result.outputs).toBe(TYPEFORM.payloadShape); // by reference — memo friendly
  });

  it("(#2) the ACTION-side dynamic-output path is untouched by this contract", () => {
    const meta = getActionMeta("ai:analyze_document");
    if (!meta) return; // provider not registered in this build
    expect(applyDynamicOutputs(meta, {})).toBe(meta.outputs);
  });

  it("builds the canonical reference path for a dynamic child", () => {
    expect(dynamicOutputPath(TYPEFORM, "email")).toBe("answersByRef.email");
    expect(dynamicOutputPath(TYPEFORM, "bad.key")).toBeNull();
  });
});

describe("dynamic trigger output SERVICE (#4, #15)", () => {
  const resolveOk = async () =>
    QUESTIONS.map((q) => ({ value: q.key, label: q.label, description: q.type }));

  it("(#4) no selection → awaiting_selection, static outputs preserved", async () => {
    const res = await resolveDynamicTriggerOutputs({
      meta: TYPEFORM,
      config: {},
      resolveOptions: resolveOk,
    });
    expect(res.status).toBe("awaiting_selection");
    expect(res.outputs).toBe(TYPEFORM.payloadShape);
  });

  it("a selected form resolves and merges", async () => {
    const res = await resolveDynamicTriggerOutputs({
      meta: TYPEFORM,
      config: { formId: "form-1" },
      resolveOptions: resolveOk,
    });
    expect(res.status).toBe("resolved");
    const byRef = res.outputs.find((o) => o.name === "answersByRef")!;
    expect((byRef.fields ?? []).map((f) => f.name)).toContain("email");
  });

  it("passes the selected value as the resolver dependency", async () => {
    const spy = jest.fn(resolveOk);
    await resolveDynamicTriggerOutputs({
      meta: TYPEFORM,
      config: { formId: "form-9" },
      resolveOptions: spy,
    });
    expect(spy).toHaveBeenCalledWith({ source: "typeform:form_questions", deps: { formId: "form-9" } });
  });

  it("(#15) a resolver failure degrades to static outputs with a typed reason — never throws", async () => {
    const res = await resolveDynamicTriggerOutputs({
      meta: TYPEFORM,
      config: { formId: "form-1" },
      resolveOptions: async () => {
        throw Object.assign(new Error("nope"), { code: "INTEGRATION_DISCONNECTED" });
      },
    });
    expect(res.status).toBe("unavailable");
    expect(res.errorCode).toBe("INTEGRATION_DISCONNECTED");
    expect(res.outputs).toBe(TYPEFORM.payloadShape);
  });

  it("a meta with no declaration short-circuits without calling the resolver", async () => {
    const spy = jest.fn(resolveOk);
    const res = await resolveDynamicTriggerOutputs({
      meta: { payloadShape: TYPEFORM.payloadShape },
      config: { formId: "x" },
      resolveOptions: spy,
    });
    expect(res.status).toBe("not_applicable");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ───────────────────── Phase 4: semantic mapping ─────────────────────

const CANDIDATES: MappingCandidate[] = QUESTIONS.map((q) => ({
  path: `answersByRef.${q.key}`,
  label: q.label,
  type: q.type,
}));

describe("semantic mapping (#25-#33)", () => {
  it("normalizes labels across naming styles", () => {
    expect(normalizeLabel("firstName")).toBe("first name");
    expect(normalizeLabel("first_name")).toBe("first name");
    expect(normalizeLabel("First Name*")).toBe("first name");
  });

  it("classifies concepts, longest alias winning", () => {
    expect(classifyConcept("Email address")).toBe("email");
    expect(classifyConcept("Work email")).toBe("email");
    // "first name" must not be swallowed by the shorter "name" alias.
    expect(classifyConcept("First name")).toBe("first_name");
    expect(classifyConcept("Your name")).toBe("full_name");
    expect(classifyConcept("Organisation")).toBe("company");
    expect(classifyConcept("How can we help")).toBe("message");
    expect(classifyConcept("Favourite colour")).toBeNull();
  });

  it.each([
    ["email", "Email", "answersByRef.email"],
    ["firstname", "First name", "answersByRef.first_name"],
    ["lastname", "Last name", "answersByRef.last_name"],
    ["company", "Company", "answersByRef.company"],
  ])("(#25-#28) destination %s maps automatically", (name, label, expectedPath) => {
    const outcome = mapFieldSemantically({ name, label, type: "text" }, CANDIDATES);
    expect(outcome.kind).toBe("mapped");
    if (outcome.kind === "mapped") expect(outcome.candidate.path).toBe(expectedPath);
  });

  it("(#29) a message/notes destination maps from the form's message question", () => {
    const outcome = mapFieldSemantically({ name: "notes", label: "Notes", type: "textarea" }, CANDIDATES);
    expect(outcome.kind).toBe("mapped");
    if (outcome.kind === "mapped") expect(outcome.candidate.path).toBe("answersByRef.message");
  });

  it("(#30) two plausible email questions produce a CHOICE, never a silent pick", () => {
    const outcome = mapFieldSemantically({ name: "email", label: "Email", type: "text" }, [
      { path: "answersByRef.work_email", label: "Work email", type: "string" },
      { path: "answersByRef.personal_email", label: "Personal email", type: "string" },
    ]);
    expect(outcome.kind).toBe("ambiguous");
    if (outcome.kind === "ambiguous") expect(outcome.candidates).toHaveLength(2);
  });

  it("(#31) a missing company question is reported, not invented", () => {
    const withoutCompany = CANDIDATES.filter((c) => !c.path.endsWith("company"));
    const outcome = mapFieldSemantically({ name: "company", label: "Company", type: "text" }, withoutCompany);
    expect(outcome).toEqual({ kind: "missing", concept: "company" });
  });

  it("(#32) an incompatible source type is not auto-mapped", () => {
    const outcome = mapFieldSemantically({ name: "message", label: "Message", type: "textarea" }, [
      { path: "answersByRef.rating", label: "Message rating", type: "number" },
    ]);
    expect(outcome.kind).toBe("missing");
  });

  it("a destination this layer does not understand stays silent (not 'missing')", () => {
    const outcome = mapFieldSemantically({ name: "audience_id", label: "Audience", type: "combobox" }, CANDIDATES);
    expect(outcome).toEqual({ kind: "no_concept" });
  });

  it("formats canonical references", () => {
    expect(toReference("trigger", CANDIDATES[0]!)).toBe("{{trigger.answersByRef.email}}");
  });
});

describe("summary body construction (#41)", () => {
  it("builds a readable body from real references only", () => {
    const body = buildSummaryBody("trigger", CANDIDATES, { heading: "New Typeform submission" })!;
    expect(body).toContain("New Typeform submission");
    expect(body).toContain("Name: {{trigger.answersByRef.first_name}} {{trigger.answersByRef.last_name}}");
    expect(body).toContain("Email address: {{trigger.answersByRef.email}}");
    expect(body).toContain("Company: {{trigger.answersByRef.company}}");
    expect(body).toContain("Message: {{trigger.answersByRef.message}}");
    // Never a fabricated value, never a path the trigger does not produce.
    expect(body).not.toMatch(/@/);
    expect(body).not.toContain("answers[");
  });

  it("omits concepts the form does not have", () => {
    const body = buildSummaryBody("trigger", [{ path: "answersByRef.email", label: "Email", type: "string" }])!;
    expect(body).toContain("{{trigger.answersByRef.email}}");
    expect(body).not.toContain("Company");
  });

  it("skips an ambiguous concept rather than guessing which one to summarize", () => {
    const body = buildSummaryBody("trigger", [
      { path: "answersByRef.work_email", label: "Work email", type: "string" },
      { path: "answersByRef.home_email", label: "Personal email", type: "string" },
    ]);
    expect(body).toBeNull();
  });

  it("returns null when nothing is mappable, so the caller leaves the field to the user", () => {
    expect(buildSummaryBody("trigger", [])).toBeNull();
    expect(buildSummaryBody("trigger", [{ path: "answersByRef.x", label: "Favourite colour" }])).toBeNull();
  });
});
