/**
 * Number-field variable compatibility (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * The sharp edge, verified against the runtime: the config resolver
 * preserves the underlying type of a SINGLE-reference template, so
 * `{{find_row.rowNumber}}` resolving to a number parses fine — while an
 * output declared `string` arrives as `"5"` and `z.number()` rejects it.
 * The workflow then fails mid-run, on live data, with a schema error the
 * author had no way to foresee.
 *
 * The grading is the point: only what the builder can be SURE about
 * blocks. Missing metadata warns, because refusing a configuration for
 * want of a declaration punishes the user for a gap that is ours — and
 * runtime validation stays authoritative either way.
 */
import { checkNumberFieldCompatibility } from "@/features/workflow-builder/config-modal/guided/numberFieldCompatibility";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

function source(outputs: VariableSource["outputs"]): VariableSource {
  return {
    sourceId: "find_row",
    displayName: "Find Row",
    kind: "action",
    provider: "microsoft-excel",
    outputs,
  } as VariableSource;
}

const NUMERIC = source([
  { name: "rowNumber", type: "number" },
  { name: "address", type: "string" },
  {
    name: "match",
    type: "object",
    fields: [{ name: "index", type: "number" }],
  },
]);

function check(value: unknown, sources = [NUMERIC], latest?: Record<string, unknown>) {
  return checkNumberFieldCompatibility({
    value,
    fieldLabel: "Row number",
    sources,
    latestValuesBySource: latest,
  });
}

describe("what is accepted", () => {
  it("a literal whole number", () => {
    expect(check(42).kind).toBe("ok");
  });

  it("nothing chosen yet", () => {
    expect(check(undefined).kind).toBe("ok");
    expect(check(null).kind).toBe("ok");
  });

  it("plain text with no variable in it — that is the number field's own business", () => {
    expect(check("42").kind).toBe("ok");
  });

  it("a variable from an output declared as a number", () => {
    expect(check("{{find_row.rowNumber}}").kind).toBe("ok");
  });

  it("a nested numeric output", () => {
    expect(check("{{find_row.match.index}}").kind).toBe("ok");
  });

  it("surrounding whitespace does not change the verdict", () => {
    expect(check("  {{find_row.rowNumber}}  ").kind).toBe("ok");
  });
});

describe("what is blocked — the cases the builder is sure about", () => {
  it("a variable from an output declared as a string", () => {
    const result = check("{{find_row.address}}");
    expect(result.kind).toBe("blocked");
    expect(result.kind !== "ok" && result.message).toMatch(/whole number/i);
    expect(result.kind !== "ok" && result.message).toMatch(/gives text/i);
  });

  it("names the step, so the user knows where to look", () => {
    const result = check("{{find_row.address}}");
    expect(result.kind !== "ok" && result.message).toContain("Find Row");
  });

  it("a variable from an output declared as an object or a list", () => {
    const withShapes = source([
      { name: "rows", type: "array" },
      { name: "meta", type: "object" },
    ]);
    expect(check("{{find_row.rows}}", [withShapes]).kind).toBe("blocked");
    expect(check("{{find_row.meta}}", [withShapes]).kind).toBe("blocked");
  });

  it("a variable CONCATENATED with text — always a string, whatever its type", () => {
    const result = check("row {{find_row.rowNumber}}");
    expect(result.kind).toBe("blocked");
    expect(result.kind !== "ok" && result.message).toMatch(/combines text/i);
  });

  it("two variables together", () => {
    expect(check("{{find_row.rowNumber}}{{find_row.rowNumber}}").kind).toBe(
      "blocked",
    );
  });

  it("an untyped output whose last test produced text", () => {
    // Evidence about THIS workflow beats the absence of a declaration.
    const untyped = source([{ name: "value", type: "unknown" }]);
    const result = check("{{find_row.value}}", [untyped], {
      find_row: { value: "not a number" },
    });
    expect(result.kind).toBe("blocked");
    expect(result.kind !== "ok" && result.message).toMatch(/last test produced text/i);
  });
});

describe("what only warns — where the builder is guessing", () => {
  it("an output with no usable declared type and no test data", () => {
    const untyped = source([{ name: "value", type: "unknown" }]);
    const result = check("{{find_row.value}}", [untyped]);
    expect(result.kind).toBe("unverified");
    expect(result.kind !== "ok" && result.message).toMatch(/can't tell/i);
  });

  it("a path the metadata does not describe at all", () => {
    expect(check("{{find_row.something.unknown}}").kind).toBe("unverified");
  });

  it("an untyped output whose last test DID produce a number is accepted outright", () => {
    const untyped = source([{ name: "value", type: "unknown" }]);
    expect(
      check("{{find_row.value}}", [untyped], { find_row: { value: 7 } }).kind,
    ).toBe("ok");
  });

  it("an untyped output whose last test produced numeric TEXT is not blocked", () => {
    // `"7"` still fails `z.number()` at run time, but the resolver's
    // type-preservation makes the outcome genuinely uncertain from here,
    // and a false block is worse than a warning the runtime will settle.
    const untyped = source([{ name: "value", type: "unknown" }]);
    expect(
      check("{{find_row.value}}", [untyped], { find_row: { value: "7" } }).kind,
    ).toBe("unverified");
  });
});

describe("a reference to a step that is gone", () => {
  it("is reported as broken rather than as a type problem", () => {
    const result = check("{{deleted_step.rowNumber}}");
    expect(result.kind).toBe("broken");
    expect(result.kind !== "ok" && result.message).toMatch(
      /isn't in this workflow any more/i,
    );
  });
});
