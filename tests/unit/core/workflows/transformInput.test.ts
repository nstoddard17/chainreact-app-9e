/** @jest-environment node */
/**
 * AI-PROVIDER-6 (CS-6) — Transform Data input classification.
 *
 * The rule this file protects: nothing is ever `String(value)`-ed into a paid
 * model call. Unusable shapes are refused with copy that names the remedy.
 */
import {
  classifyTransformInput,
  TRANSFORM_INPUT_MAX_BYTES,
} from "@/core/workflows/transformInput";

describe("supported shapes", () => {
  it("reads an array as rows and counts the items", () => {
    const result = classifyTransformInput([{ a: 1 }, { a: 2 }]);
    expect(result).toEqual({
      kind: "rows",
      json: '[{"a":1},{"a":2}]',
      count: 2,
    });
  });

  it("reads an object as a single record", () => {
    const result = classifyTransformInput({ name: "Ada", pay: 1200 });
    expect(result).toEqual({
      kind: "record",
      json: '{"name":"Ada","pay":1200}',
      count: 1,
    });
  });

  it("accepts an Analyze Document output object", () => {
    const analyzeOutput = {
      mode: "extract_rows",
      rows: [{ description: "Widget", amount: 10, _confidence: 0.9 }],
      rowCount: 1,
      summary: null,
      warnings: [],
    };
    const result = classifyTransformInput(analyzeOutput);
    expect(result.kind).toBe("record");
  });

  it("accepts the rows array an Analyze Document step produced", () => {
    const result = classifyTransformInput([
      { description: "Widget", amount: 10, _confidence: 0.9 },
    ]);
    expect(result.kind).toBe("rows");
    if (result.kind !== "rows") return;
    expect(result.count).toBe(1);
  });

  it("accepts a list of plain values", () => {
    const result = classifyTransformInput(["a", "b", "c"]);
    expect(result).toMatchObject({ kind: "rows", count: 3 });
  });

  it("re-parses a serialized payload rather than treating it as text", () => {
    expect(classifyTransformInput('[{"a":1}]')).toEqual({
      kind: "rows",
      json: '[{"a":1}]',
      count: 1,
    });
    expect(classifyTransformInput(' {"a":1} ')).toMatchObject({ kind: "record" });
  });
});

describe("refusals", () => {
  it.each([
    [undefined, /no data was provided/],
    [null, /no data was provided/],
    ["", /the value is empty/],
    ["   ", /the value is empty/],
    [42, /is a number/],
    [true, /is a boolean/],
    [[], /the list is empty/],
    [{}, /no fields to transform/],
  ])("refuses %p", (value, pattern) => {
    const result = classifyTransformInput(value);
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toMatch(pattern);
  });

  it("points free text at Analyze Document instead of guessing", () => {
    const result = classifyTransformInput("Invoice total: $42, due July 31");
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toMatch(/Analyze Document/);
  });

  it("refuses a serialized scalar", () => {
    const result = classifyTransformInput("42");
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toMatch(/single plain value/);
  });

  it("refuses a self-referencing value instead of throwing", () => {
    const circular: Record<string, unknown> = { name: "a" };
    circular.self = circular;
    const result = classifyTransformInput(circular);
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toMatch(/refers back to itself/);
  });

  it("refuses data larger than the wire budget", () => {
    const big = [{ blob: "x".repeat(200) }];
    const result = classifyTransformInput(big, { maxBytes: 50 });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toMatch(/too large/);
  });

  it("enforces the 1 MiB default ceiling", () => {
    expect(TRANSFORM_INPUT_MAX_BYTES).toBe(1024 * 1024);
    const huge = [{ blob: "x".repeat(TRANSFORM_INPUT_MAX_BYTES + 10) }];
    expect(classifyTransformInput(huge).kind).toBe("unsupported");
  });

  it("never echoes the data in a refusal reason", () => {
    const result = classifyTransformInput("salary 125000 for jane@example.com");
    if (result.kind !== "unsupported") throw new Error("expected refusal");
    expect(result.reason).not.toContain("125000");
    expect(result.reason).not.toContain("jane@example.com");
  });
});
