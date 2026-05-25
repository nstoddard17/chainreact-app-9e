/**
 * @jest-environment node
 *
 * Tests for integrations/native/actions/_conditionEvaluator.ts — the
 * shared pure operator engine consumed by `if_then_condition` (Slice 3
 * Commit 2) and `router` (Slice 3 Commit 3). Pinning the rule in
 * isolation means a refactor that breaks any operator surfaces here
 * BEFORE the two handler integration tests notice.
 *
 * Plan: docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md
 * §9.1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateCondition,
  IF_THEN_OPERATORS,
  UnknownOperatorError,
  type Operator,
} from "@/integrations/native/actions/_conditionEvaluator";

describe("evaluateCondition — operator surface (D-IT1)", () => {
  it("exports exactly the 14 accepted operators", () => {
    expect([...IF_THEN_OPERATORS]).toEqual([
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
      "greater_than",
      "less_than",
      "greater_equal",
      "less_equal",
      "is_empty",
      "is_not_empty",
      "is_truthy",
      "is_falsy",
    ]);
    expect(IF_THEN_OPERATORS).toHaveLength(14);
  });

  it("throws UnknownOperatorError when called with a literal not in the union (defensive guard)", () => {
    expect(() =>
      // Cast through `as` to bypass the type guard — simulating a caller
      // who bypassed the schema.
      evaluateCondition({ operator: "regex_match" as unknown as Operator, input: "x", value: "y" }),
    ).toThrow(UnknownOperatorError);
  });
});

describe("evaluateCondition — equals / not_equals (D-IT2: strict ===)", () => {
  it('1 equals "1" is false (no loose coercion)', () => {
    expect(evaluateCondition({ operator: "equals", input: 1, value: "1" })).toBe(false);
    expect(evaluateCondition({ operator: "not_equals", input: 1, value: "1" })).toBe(true);
  });

  it('"abc" equals "abc" is true', () => {
    expect(evaluateCondition({ operator: "equals", input: "abc", value: "abc" })).toBe(true);
    expect(evaluateCondition({ operator: "not_equals", input: "abc", value: "abc" })).toBe(false);
  });

  it("5 equals 5 is true", () => {
    expect(evaluateCondition({ operator: "equals", input: 5, value: 5 })).toBe(true);
  });

  it("0 equals false is false (no loose coercion)", () => {
    expect(evaluateCondition({ operator: "equals", input: 0, value: false })).toBe(false);
  });

  it("null equals undefined is false (strict equality)", () => {
    expect(evaluateCondition({ operator: "equals", input: null, value: undefined })).toBe(false);
  });

  it("NaN equals NaN is false (per IEEE 754 + strict equality)", () => {
    expect(evaluateCondition({ operator: "equals", input: NaN, value: NaN })).toBe(false);
  });

  it("object identity — same reference equals; structurally-equal objects don't", () => {
    const a = { x: 1 };
    expect(evaluateCondition({ operator: "equals", input: a, value: a })).toBe(true);
    expect(
      evaluateCondition({ operator: "equals", input: { x: 1 }, value: { x: 1 } }),
    ).toBe(false);
  });

  it("array does not accidentally stringify into a matching string", () => {
    expect(
      evaluateCondition({ operator: "equals", input: [1, 2, 3], value: "1,2,3" }),
    ).toBe(false);
  });
});

describe("evaluateCondition — contains / not_contains (D-IT3: case-insensitive strings; arrays use strict)", () => {
  it("string contains substring (case-insensitive)", () => {
    expect(evaluateCondition({ operator: "contains", input: "Hello World", value: "world" })).toBe(true);
    expect(evaluateCondition({ operator: "contains", input: "Hello World", value: "WORLD" })).toBe(true);
  });

  it("string does not contain substring", () => {
    expect(evaluateCondition({ operator: "contains", input: "Hello", value: "xyz" })).toBe(false);
  });

  it("not_contains inverts string check (still case-insensitive)", () => {
    expect(evaluateCondition({ operator: "not_contains", input: "Hello", value: "xyz" })).toBe(true);
    expect(evaluateCondition({ operator: "not_contains", input: "Hello", value: "ELL" })).toBe(false);
  });

  it("array contains uses strict equality (V1 parity)", () => {
    expect(evaluateCondition({ operator: "contains", input: [1, 2, 3], value: 2 })).toBe(true);
    expect(evaluateCondition({ operator: "contains", input: [1, "2", 3], value: 2 })).toBe(false);
    expect(evaluateCondition({ operator: "contains", input: ["a", "b"], value: "B" })).toBe(false);
  });

  it("type mismatch returns false for contains AND not_contains (D-IT7 defensive)", () => {
    expect(evaluateCondition({ operator: "contains", input: null, value: "x" })).toBe(false);
    expect(evaluateCondition({ operator: "contains", input: 42, value: "4" })).toBe(false);
    expect(evaluateCondition({ operator: "contains", input: { a: 1 }, value: "a" })).toBe(false);
    expect(evaluateCondition({ operator: "not_contains", input: null, value: "x" })).toBe(false);
    expect(evaluateCondition({ operator: "not_contains", input: 42, value: "4" })).toBe(false);
    expect(evaluateCondition({ operator: "not_contains", input: { a: 1 }, value: "a" })).toBe(false);
  });
});

describe("evaluateCondition — starts_with / ends_with (D-IT3 case-insensitive)", () => {
  it("starts_with is case-insensitive", () => {
    expect(evaluateCondition({ operator: "starts_with", input: "Hello World", value: "hello" })).toBe(true);
    expect(evaluateCondition({ operator: "starts_with", input: "Hello World", value: "world" })).toBe(false);
  });

  it("ends_with is case-insensitive", () => {
    expect(evaluateCondition({ operator: "ends_with", input: "Hello World", value: "WORLD" })).toBe(true);
    expect(evaluateCondition({ operator: "ends_with", input: "Hello World", value: "hello" })).toBe(false);
  });

  it("starts_with / ends_with return false on non-string input or value (D-IT7)", () => {
    expect(evaluateCondition({ operator: "starts_with", input: 12345, value: "12" })).toBe(false);
    expect(evaluateCondition({ operator: "ends_with", input: null, value: "x" })).toBe(false);
    expect(evaluateCondition({ operator: "starts_with", input: "abc", value: 123 })).toBe(false);
  });
});

describe("evaluateCondition — numeric comparisons (NaN-guarded)", () => {
  it("greater_than / less_than basic integer comparisons", () => {
    expect(evaluateCondition({ operator: "greater_than", input: 10, value: 5 })).toBe(true);
    expect(evaluateCondition({ operator: "greater_than", input: 5, value: 10 })).toBe(false);
    expect(evaluateCondition({ operator: "less_than", input: 5, value: 10 })).toBe(true);
    expect(evaluateCondition({ operator: "less_than", input: 10, value: 5 })).toBe(false);
  });

  it("greater_equal / less_equal cover the equality edge", () => {
    expect(evaluateCondition({ operator: "greater_equal", input: 5, value: 5 })).toBe(true);
    expect(evaluateCondition({ operator: "less_equal", input: 5, value: 5 })).toBe(true);
    expect(evaluateCondition({ operator: "greater_equal", input: 4, value: 5 })).toBe(false);
    expect(evaluateCondition({ operator: "less_equal", input: 6, value: 5 })).toBe(false);
  });

  it("numeric strings coerce ('10' > 5 is true)", () => {
    expect(evaluateCondition({ operator: "greater_than", input: "10", value: 5 })).toBe(true);
    expect(evaluateCondition({ operator: "less_than", input: 5, value: "10" })).toBe(true);
  });

  it("decimal comparisons work", () => {
    expect(evaluateCondition({ operator: "greater_than", input: 3.14, value: 2.71 })).toBe(true);
    expect(evaluateCondition({ operator: "less_than", input: 0.1, value: 0.2 })).toBe(true);
  });

  it("type mismatch on numeric comparisons returns false (NaN, null, undefined, bool, array, object)", () => {
    expect(evaluateCondition({ operator: "greater_than", input: "abc", value: 5 })).toBe(false);
    expect(evaluateCondition({ operator: "greater_than", input: 5, value: "abc" })).toBe(false);
    expect(evaluateCondition({ operator: "greater_than", input: null, value: 0 })).toBe(false);
    expect(evaluateCondition({ operator: "greater_than", input: undefined, value: 0 })).toBe(false);
    expect(evaluateCondition({ operator: "greater_than", input: true, value: 0 })).toBe(false);
    expect(evaluateCondition({ operator: "less_than", input: [1], value: 5 })).toBe(false);
    expect(evaluateCondition({ operator: "greater_equal", input: { x: 1 }, value: 0 })).toBe(false);
    expect(evaluateCondition({ operator: "less_equal", input: NaN, value: 0 })).toBe(false);
  });

  it("empty string and whitespace-only string do not coerce to 0 (avoid silent surprise)", () => {
    expect(evaluateCondition({ operator: "greater_than", input: "", value: -1 })).toBe(false);
    expect(evaluateCondition({ operator: "greater_than", input: "   ", value: -1 })).toBe(false);
  });

  it("Infinity is not treated as a valid finite comparator", () => {
    expect(
      evaluateCondition({ operator: "greater_than", input: Number.POSITIVE_INFINITY, value: 0 }),
    ).toBe(false);
  });
});

describe("evaluateCondition — is_empty / is_not_empty", () => {
  it("null and undefined are empty", () => {
    expect(evaluateCondition({ operator: "is_empty", input: null })).toBe(true);
    expect(evaluateCondition({ operator: "is_empty", input: undefined })).toBe(true);
  });

  it("empty string is empty; whitespace-only string is NOT (V1 parity)", () => {
    expect(evaluateCondition({ operator: "is_empty", input: "" })).toBe(true);
    expect(evaluateCondition({ operator: "is_empty", input: "   " })).toBe(false);
    expect(evaluateCondition({ operator: "is_empty", input: "hello" })).toBe(false);
  });

  it("empty array is empty; non-empty array is not", () => {
    expect(evaluateCondition({ operator: "is_empty", input: [] })).toBe(true);
    expect(evaluateCondition({ operator: "is_empty", input: [0] })).toBe(false);
    expect(evaluateCondition({ operator: "is_empty", input: [null] })).toBe(false);
  });

  it("empty plain object is empty; non-empty object is not", () => {
    expect(evaluateCondition({ operator: "is_empty", input: {} })).toBe(true);
    expect(evaluateCondition({ operator: "is_empty", input: { a: 1 } })).toBe(false);
  });

  it("numeric 0 is NOT empty (zero is a real value)", () => {
    expect(evaluateCondition({ operator: "is_empty", input: 0 })).toBe(false);
    expect(evaluateCondition({ operator: "is_not_empty", input: 0 })).toBe(true);
  });

  it("false is NOT empty (boolean false is a real value)", () => {
    expect(evaluateCondition({ operator: "is_empty", input: false })).toBe(false);
  });

  it("is_not_empty inverts is_empty across all the above", () => {
    expect(evaluateCondition({ operator: "is_not_empty", input: null })).toBe(false);
    expect(evaluateCondition({ operator: "is_not_empty", input: "" })).toBe(false);
    expect(evaluateCondition({ operator: "is_not_empty", input: [] })).toBe(false);
    expect(evaluateCondition({ operator: "is_not_empty", input: {} })).toBe(false);
    expect(evaluateCondition({ operator: "is_not_empty", input: "hello" })).toBe(true);
    expect(evaluateCondition({ operator: "is_not_empty", input: [1] })).toBe(true);
    expect(evaluateCondition({ operator: "is_not_empty", input: { a: 1 } })).toBe(true);
  });

  it("unary operators ignore a supplied `value` arg (defensive)", () => {
    expect(evaluateCondition({ operator: "is_empty", input: "", value: "ignored" })).toBe(true);
    expect(evaluateCondition({ operator: "is_not_empty", input: "x", value: 999 })).toBe(true);
  });
});

describe("evaluateCondition — is_truthy / is_falsy (raw JS Boolean semantics)", () => {
  it("Boolean(input) truthy values", () => {
    expect(evaluateCondition({ operator: "is_truthy", input: true })).toBe(true);
    expect(evaluateCondition({ operator: "is_truthy", input: 1 })).toBe(true);
    expect(evaluateCondition({ operator: "is_truthy", input: "x" })).toBe(true);
    // JS quirks documented in source: [] and {} are truthy.
    expect(evaluateCondition({ operator: "is_truthy", input: [] })).toBe(true);
    expect(evaluateCondition({ operator: "is_truthy", input: {} })).toBe(true);
    // "0" string is truthy; only numeric 0 is falsy.
    expect(evaluateCondition({ operator: "is_truthy", input: "0" })).toBe(true);
  });

  it("Boolean(input) falsy values", () => {
    expect(evaluateCondition({ operator: "is_falsy", input: false })).toBe(true);
    expect(evaluateCondition({ operator: "is_falsy", input: 0 })).toBe(true);
    expect(evaluateCondition({ operator: "is_falsy", input: "" })).toBe(true);
    expect(evaluateCondition({ operator: "is_falsy", input: null })).toBe(true);
    expect(evaluateCondition({ operator: "is_falsy", input: undefined })).toBe(true);
    expect(evaluateCondition({ operator: "is_falsy", input: NaN })).toBe(true);
  });

  it("is_truthy and is_falsy are inverses", () => {
    for (const v of [true, 1, "x", [], {}, false, 0, "", null, undefined, NaN]) {
      const t = evaluateCondition({ operator: "is_truthy", input: v });
      const f = evaluateCondition({ operator: "is_falsy", input: v });
      expect(t).toBe(!f);
    }
  });
});

describe("_conditionEvaluator.ts — source-level purity guards", () => {
  // Defends the "no eval / no Function / no regex / no I/O / no logger"
  // contract listed in the file header. A future contributor who reaches
  // for one of these primitives breaks the build here before the engine
  // tests notice. Plan §5.2 + §6.3 + §6.8.
  //
  // We strip block comments (/** ... */) and line comments (// ...)
  // before checking — the source's own JSDoc mentions the forbidden
  // primitives by name (deliberately, as documentation), and those
  // mentions must not trip the guard.
  const SOURCE = readFileSync(
    join(__dirname, "..", "..", "..", "..", "..", "integrations", "native", "actions", "_conditionEvaluator.ts"),
    "utf8",
  );
  const CODE_ONLY = stripComments(SOURCE);

  it("does not contain `eval(`", () => {
    expect(CODE_ONLY).not.toMatch(/\beval\s*\(/);
  });

  it("does not contain `new Function(`", () => {
    expect(CODE_ONLY).not.toMatch(/\bnew\s+Function\s*\(/);
  });

  it("does not contain `new RegExp(`", () => {
    expect(CODE_ONLY).not.toMatch(/\bnew\s+RegExp\s*\(/);
  });

  it("does not contain a runtime regex literal `/.../`", () => {
    // After comment stripping, any remaining `/.../[flags]` shape is a
    // regex literal in the runtime code. We look for the canonical form:
    // a `/`, one+ non-slash non-newline chars, a closing `/`, optional
    // flags. Conservative but catches the cases we care about.
    expect(CODE_ONLY).not.toMatch(/\/[^/\n]+\/[gimsuy]*/);
  });

  it("does not import a logger or any I/O module", () => {
    expect(CODE_ONLY).not.toMatch(/from\s+["']@\/lib\/utils\/logger["']/);
    expect(CODE_ONLY).not.toMatch(/from\s+["']node:fs["']/);
    expect(CODE_ONLY).not.toMatch(/from\s+["']node:http["']/);
    expect(CODE_ONLY).not.toMatch(/from\s+["']node:https["']/);
    expect(CODE_ONLY).not.toMatch(/console\.(log|info|warn|error|debug)\s*\(/);
  });
});

/**
 * Strip both `/* ... *\/` block comments and `// ...` line comments from
 * a TypeScript source. Crude — does not handle the unicorn case of a
 * comment-shape inside a string literal — but sufficient for purity
 * checks of an evaluator file that has no string literals containing
 * comment syntax.
 */
function stripComments(source: string): string {
  // Block comments first (greedy match across newlines).
  const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Then line comments.
  return withoutBlock
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}
