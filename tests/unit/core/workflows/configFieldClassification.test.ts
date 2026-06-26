/**
 * @jest-environment node
 */
import {
  classifyConfigFieldValue,
  isWholeValueReference,
  isPrefilledState,
} from "@/core/workflows/configFieldClassification";

describe("classifyConfigFieldValue — empty values", () => {
  it("empty + required -> needs_input", () => {
    expect(classifyConfigFieldValue({ value: "", required: true })).toBe("needs_input");
    expect(classifyConfigFieldValue({ value: undefined, required: true })).toBe("needs_input");
    expect(classifyConfigFieldValue({ value: null, required: true })).toBe("needs_input");
    expect(classifyConfigFieldValue({ value: "   ", required: true })).toBe("needs_input");
    expect(classifyConfigFieldValue({ value: [], required: true })).toBe("needs_input");
  });

  it("empty + not required -> optional_empty", () => {
    expect(classifyConfigFieldValue({ value: "", required: false })).toBe("optional_empty");
    expect(classifyConfigFieldValue({ value: undefined, required: false })).toBe("optional_empty");
  });
});

describe("classifyConfigFieldValue — literal values", () => {
  it("a static non-empty string with no references -> literal", () => {
    expect(classifyConfigFieldValue({ value: "Weekly report", required: true })).toBe("literal");
    expect(classifyConfigFieldValue({ value: "Follow up with new lead", required: false })).toBe("literal");
  });

  it("explicit 0 / false are literal, never treated as missing (Q5)", () => {
    expect(classifyConfigFieldValue({ value: 0, required: true })).toBe("literal");
    expect(classifyConfigFieldValue({ value: false, required: true })).toBe("literal");
  });

  it("an AI_FIELD token is not an author reference -> literal", () => {
    // parseReferences skips AI_FIELD tokens; the value is non-empty -> literal.
    expect(classifyConfigFieldValue({ value: "{{AI_FIELD:summary}}", required: true })).toBe("literal");
  });
});

describe("classifyConfigFieldValue — variable-derived values", () => {
  it("a whole-value single reference -> prefilled_variable", () => {
    expect(classifyConfigFieldValue({ value: "{{trigger.subject}}", required: true })).toBe("prefilled_variable");
    expect(classifyConfigFieldValue({ value: "{{a1.email}}", required: false })).toBe("prefilled_variable");
  });

  it("trims surrounding whitespace for the whole-value check", () => {
    expect(classifyConfigFieldValue({ value: "  {{a1.email}}  ", required: true })).toBe("prefilled_variable");
  });

  it("a mixed string (literal text + reference) -> prefilled_mixed", () => {
    expect(
      classifyConfigFieldValue({ value: "New support request: {{trigger.subject}}", required: true }),
    ).toBe("prefilled_mixed");
  });

  it("multiple references -> prefilled_mixed", () => {
    expect(
      classifyConfigFieldValue({ value: "{{trigger.subject}} {{trigger.from}}", required: false }),
    ).toBe("prefilled_mixed");
  });
});

describe("classifyConfigFieldValue — unresolved references are never 'complete'", () => {
  it("any value with references + hasUnresolvedReference -> unresolved_reference", () => {
    expect(
      classifyConfigFieldValue({ value: "{{ghost.x}}", required: true, hasUnresolvedReference: true }),
    ).toBe("unresolved_reference");
    expect(
      classifyConfigFieldValue({
        value: "Hi {{ghost.name}}",
        required: false,
        hasUnresolvedReference: true,
      }),
    ).toBe("unresolved_reference");
  });

  it("hasUnresolvedReference is ignored when there are no references", () => {
    expect(
      classifyConfigFieldValue({ value: "plain", required: true, hasUnresolvedReference: true }),
    ).toBe("literal");
    expect(
      classifyConfigFieldValue({ value: "", required: true, hasUnresolvedReference: true }),
    ).toBe("needs_input");
  });
});

describe("isWholeValueReference", () => {
  it("true only for a value that is exactly one token", () => {
    expect(isWholeValueReference("{{trigger.subject}}")).toBe(true);
    expect(isWholeValueReference("  {{a.b}}  ")).toBe(true);
    expect(isWholeValueReference("x {{a.b}}")).toBe(false);
    expect(isWholeValueReference("{{a.b}} {{c.d}}")).toBe(false);
    expect(isWholeValueReference("literal")).toBe(false);
    expect(isWholeValueReference(123)).toBe(false);
  });
});

describe("isPrefilledState", () => {
  it("true for the two prefilled states only", () => {
    expect(isPrefilledState("prefilled_variable")).toBe(true);
    expect(isPrefilledState("prefilled_mixed")).toBe(true);
    expect(isPrefilledState("needs_input")).toBe(false);
    expect(isPrefilledState("unresolved_reference")).toBe(false);
    expect(isPrefilledState("literal")).toBe(false);
  });
});
