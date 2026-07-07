/**
 * Tests for the shared json-field value logic (CONFIG-UX-AUDIT-2) —
 * `_jsonFieldValue.ts`, the single source of truth behind JsonField's
 * inline errors and the config modal's Save gate.
 */
import {
  collectJsonFieldBlockingError,
  isPureVariableReference,
  jsonFieldValueToText,
  validateJsonFieldText,
  validateJsonFieldValue,
} from "@/features/workflow-builder/config-modal/fields/_jsonFieldValue";
import type { FieldMeta } from "@/contracts/actionMeta";

describe("validateJsonFieldText", () => {
  it("valid array text parses to a REAL array for shape 'array'", () => {
    const r = validateJsonFieldText('[{"type":"section"}]', "array");
    expect(r.error).toBeNull();
    expect(r.committed).toEqual([{ type: "section" }]);
    expect(Array.isArray(r.committed)).toBe(true);
  });

  it("valid object text parses to a REAL object for shape 'object'", () => {
    const r = validateJsonFieldText('{"enabled": true}', "object");
    expect(r.error).toBeNull();
    expect(r.committed).toEqual({ enabled: true });
    expect(typeof r.committed).toBe("object");
  });

  it("invalid JSON returns friendly copy only — no parser internals", () => {
    const r = validateJsonFieldText('{"enabled": tru', "object");
    expect(r.error).toMatch(/this needs valid json/i);
    expect(r.error).not.toMatch(/SyntaxError|Unexpected token|position \d/i);
  });

  it("shape mismatch returns friendly copy (object where a list is expected, and vice versa)", () => {
    expect(validateJsonFieldText('{"a":1}', "array").error).toMatch(/needs a list/i);
    expect(validateJsonFieldText("[1,2]", "object").error).toMatch(/needs an object/i);
    // Arrays are objects in JS — the object shape must still reject them.
    expect(validateJsonFieldText("[]", "object").error).toMatch(/needs an object/i);
    // Scalars fail both concrete shapes.
    expect(validateJsonFieldText("42", "array").error).toMatch(/needs a list/i);
    expect(validateJsonFieldText('"hi"', "object").error).toMatch(/needs an object/i);
  });

  it("shape 'any' accepts any JSON value", () => {
    expect(validateJsonFieldText("42", "any")).toEqual({ error: null, committed: 42 });
    expect(validateJsonFieldText("[1]", "any").committed).toEqual([1]);
  });

  it("a pure {{...}} variable commits as the string token (runtime resolver supplies the value)", () => {
    const r = validateJsonFieldText("  {{trigger.payload.items}}  ", "array");
    expect(r.error).toBeNull();
    expect(r.committed).toBe("{{trigger.payload.items}}");
  });

  it("mixed variable + JSON text is rejected with whole-value copy", () => {
    const r = validateJsonFieldText('[{"t":"{{trigger.title}}"}]', "array");
    expect(r.error).toMatch(/whole value/i);
    expect(r.error).toMatch(/\{\{trigger\.items\}\}/); // copy shows an example token
  });

  it("empty / whitespace text commits undefined", () => {
    expect(validateJsonFieldText("", "array")).toEqual({ error: null, committed: undefined });
    expect(validateJsonFieldText("   \n", "object")).toEqual({
      error: null,
      committed: undefined,
    });
  });
});

describe("validateJsonFieldValue (committed drafts / saved configs)", () => {
  it("accepts parsed values matching the shape", () => {
    expect(validateJsonFieldValue([{ a: 1 }], "array").error).toBeNull();
    expect(validateJsonFieldValue({ a: 1 }, "object").error).toBeNull();
    expect(validateJsonFieldValue(undefined, "array").error).toBeNull();
    expect(validateJsonFieldValue(null, "object").error).toBeNull();
  });

  it("rejects parsed values of the wrong shape", () => {
    expect(validateJsonFieldValue({ a: 1 }, "array").error).toMatch(/needs a list/i);
    expect(validateJsonFieldValue([1], "object").error).toMatch(/needs an object/i);
  });

  it("re-validates string drafts: pure variables pass, unfixed JSON text fails", () => {
    expect(validateJsonFieldValue("{{trigger.items}}", "array").error).toBeNull();
    expect(validateJsonFieldValue('[{"broken"', "array").error).toMatch(
      /this needs valid json/i,
    );
    expect(validateJsonFieldValue('{"a":1}', "array").error).toMatch(/needs a list/i);
  });
});

describe("jsonFieldValueToText", () => {
  it("round-trips: undefined → '', strings verbatim, values pretty-printed", () => {
    expect(jsonFieldValueToText(undefined)).toBe("");
    expect(jsonFieldValueToText("{{trigger.items}}")).toBe("{{trigger.items}}");
    expect(jsonFieldValueToText({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("isPureVariableReference", () => {
  it("matches only a single whole-value token", () => {
    expect(isPureVariableReference("{{a.b}}")).toBe(true);
    expect(isPureVariableReference(" {{a.b}} ")).toBe(true);
    expect(isPureVariableReference("x {{a.b}}")).toBe(false);
    expect(isPureVariableReference("{{a}}{{b}}")).toBe(false);
    expect(isPureVariableReference("{{}}")).toBe(false);
  });
});

describe("collectJsonFieldBlockingError (Save gate)", () => {
  const fields: FieldMeta[] = [
    { name: "title", label: "Title", type: "text", required: true } as FieldMeta,
    {
      name: "blocks",
      label: "Blocks",
      type: "json",
      required: true,
      advanced: true,
      jsonShape: "array",
    } as FieldMeta,
  ];

  it("returns null when every json field is committable (parsed value / variable / empty)", () => {
    expect(collectJsonFieldBlockingError(fields, { blocks: [{ type: "s" }] })).toBeNull();
    expect(
      collectJsonFieldBlockingError(fields, { blocks: "{{trigger.blocks}}" }),
    ).toBeNull();
    expect(collectJsonFieldBlockingError(fields, {})).toBeNull();
  });

  it("returns the field label + friendly error for an unfixed string draft", () => {
    const r = collectJsonFieldBlockingError(fields, { blocks: '[{"broken"' });
    expect(r).not.toBeNull();
    expect(r!.fieldLabel).toBe("Blocks");
    expect(r!.error).toMatch(/this needs valid json/i);
  });

  it("ignores non-json fields entirely", () => {
    expect(
      collectJsonFieldBlockingError(fields, { title: '{"not json but a text field"' }),
    ).toBeNull();
  });
});
