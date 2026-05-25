/**
 * Tests for core/workflows/formatLatestValuePreview.ts.
 *
 * Pin: every scalar gets a readable preview, objects/arrays compress
 * to a type chip, absent renders nothing, pathological inputs never
 * crash.
 */
import {
  formatLatestValuePreview,
  PREVIEW_MAX_CHARS,
} from "@/core/workflows/formatLatestValuePreview";

describe("formatLatestValuePreview", () => {
  it("absent input (undefined) → absent", () => {
    expect(formatLatestValuePreview(undefined)).toEqual({
      kind: "absent",
      preview: "",
    });
  });

  it("found:false → absent", () => {
    expect(formatLatestValuePreview({ found: false, value: undefined })).toEqual({
      kind: "absent",
      preview: "",
    });
  });

  it("short string → quoted scalar", () => {
    expect(formatLatestValuePreview({ found: true, value: "hello" })).toEqual({
      kind: "scalar",
      preview: '"hello"',
    });
  });

  it("long string is truncated with ellipsis", () => {
    const long = "x".repeat(PREVIEW_MAX_CHARS * 2);
    const out = formatLatestValuePreview({ found: true, value: long });
    expect(out.kind).toBe("scalar");
    expect(out.preview.endsWith("…")).toBe(true);
    expect(out.preview.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS);
  });

  it("number renders as decimal", () => {
    expect(formatLatestValuePreview({ found: true, value: 42 })).toEqual({
      kind: "scalar",
      preview: "42",
    });
    expect(formatLatestValuePreview({ found: true, value: 0 })).toEqual({
      kind: "scalar",
      preview: "0",
    });
    expect(formatLatestValuePreview({ found: true, value: -3.14 })).toEqual({
      kind: "scalar",
      preview: "-3.14",
    });
  });

  it("non-finite numbers render their special token", () => {
    expect(formatLatestValuePreview({ found: true, value: NaN })).toEqual({
      kind: "scalar",
      preview: "NaN",
    });
    expect(formatLatestValuePreview({ found: true, value: Infinity })).toEqual({
      kind: "scalar",
      preview: "Infinity",
    });
  });

  it("boolean renders true/false", () => {
    expect(formatLatestValuePreview({ found: true, value: true })).toEqual({
      kind: "scalar",
      preview: "true",
    });
    expect(formatLatestValuePreview({ found: true, value: false })).toEqual({
      kind: "scalar",
      preview: "false",
    });
  });

  it("null renders 'null'", () => {
    expect(formatLatestValuePreview({ found: true, value: null })).toEqual({
      kind: "scalar",
      preview: "null",
    });
  });

  it("array renders as array(N) chip", () => {
    expect(
      formatLatestValuePreview({ found: true, value: [1, 2, 3] }),
    ).toEqual({ kind: "array", preview: "array(3)" });
    expect(formatLatestValuePreview({ found: true, value: [] })).toEqual({
      kind: "array",
      preview: "array(0)",
    });
  });

  it("object renders as 'object' chip", () => {
    expect(
      formatLatestValuePreview({ found: true, value: { a: 1 } }),
    ).toEqual({ kind: "object", preview: "object" });
  });

  it("bigint renders with trailing n", () => {
    expect(formatLatestValuePreview({ found: true, value: 10n })).toEqual({
      kind: "scalar",
      preview: "10n",
    });
  });

  it("circular references do not crash (object → object chip, never throws)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      formatLatestValuePreview({ found: true, value: circular }),
    ).not.toThrow();
    expect(formatLatestValuePreview({ found: true, value: circular })).toEqual({
      kind: "object",
      preview: "object",
    });
  });

  it("Symbol and function fall through to a type-name chip", () => {
    expect(
      formatLatestValuePreview({ found: true, value: Symbol("x") }),
    ).toEqual({ kind: "object", preview: "symbol" });
    expect(
      formatLatestValuePreview({ found: true, value: () => undefined }),
    ).toEqual({ kind: "object", preview: "function" });
  });
});
