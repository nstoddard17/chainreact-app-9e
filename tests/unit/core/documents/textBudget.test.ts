/** @jest-environment node */
import {
  buildParsedDocument,
  countChars,
  toDocumentTextPayload,
} from "@/core/documents/parsedDocument";
import {
  DEFAULT_MAX_INPUT_CHARS,
  SEGMENT_SPLIT_WARNING,
  TRUNCATION_WARNING,
  applyTextBudget,
  overflowBehaviorForMode,
} from "@/core/documents/textBudget";

function doc(texts: string[], kind: "pages" | "text" = "pages") {
  return buildParsedDocument({
    kind,
    segments: texts.map((text, i) => ({ label: `Page ${i + 1}`, text })),
  });
}

describe("core/documents/parsedDocument", () => {
  it("buildParsedDocument computes charCount and defaults", () => {
    const parsed = doc(["abc", "defgh"]);
    expect(parsed.charCount).toBe(8);
    expect(parsed.totalSegments).toBe(2);
    expect(parsed.truncated).toBe(false);
    expect(parsed.warnings).toEqual([]);
    expect(countChars(parsed.segments)).toBe(8);
  });

  it("toDocumentTextPayload projects the wire shape without paths", () => {
    const payload = toDocumentTextPayload(doc(["hello"]), {
      name: "a.pdf",
      mimeType: "application/pdf",
    });
    expect(payload).toEqual({
      name: "a.pdf",
      mimeType: "application/pdf",
      truncated: false,
      segments: [{ label: "Page 1", text: "hello" }],
    });
  });
});

describe("core/documents/textBudget", () => {
  it("maps modes to their overflow behavior", () => {
    expect(overflowBehaviorForMode("summarize")).toBe("truncate");
    expect(overflowBehaviorForMode("classify")).toBe("truncate");
    expect(overflowBehaviorForMode("answer_questions")).toBe("truncate");
    expect(overflowBehaviorForMode("extract_fields")).toBe("reject");
    expect(overflowBehaviorForMode("extract_rows")).toBe("reject");
  });

  it("passes a within-budget document through untouched", () => {
    const parsed = doc(["12345"]);
    const result = applyTextBudget(parsed, { maxChars: 10, onOverflow: "truncate" });
    expect(result).toEqual({ ok: true, document: parsed });
  });

  it("rejects overflow when onOverflow=reject", () => {
    const result = applyTextBudget(doc(["123456"]), {
      maxChars: 5,
      onOverflow: "reject",
    });
    expect(result).toEqual({ ok: false, charCount: 6, maxChars: 5 });
  });

  it("truncates at a segment boundary and flags the result", () => {
    const result = applyTextBudget(doc(["aaaa", "bbbb", "cccc"]), {
      maxChars: 9,
      onOverflow: "truncate",
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.document.segments.map((s) => s.text)).toEqual([
      "aaaa",
      "bbbb",
    ]);
    expect(result.document.truncated).toBe(true);
    expect(result.document.charCount).toBe(8);
    expect(result.document.warnings).toContain(TRUNCATION_WARNING);
    expect(result.document.warnings).not.toContain(SEGMENT_SPLIT_WARNING);
    // totalSegments still reflects the full source
    expect(result.document.totalSegments).toBe(3);
  });

  it("splits the first segment rather than returning an empty payload", () => {
    const result = applyTextBudget(doc(["x".repeat(100)]), {
      maxChars: 10,
      onOverflow: "truncate",
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.document.segments).toHaveLength(1);
    expect(result.document.segments[0]!.text).toHaveLength(10);
    expect(result.document.warnings).toEqual(
      expect.arrayContaining([TRUNCATION_WARNING, SEGMENT_SPLIT_WARNING]),
    );
  });

  it("does not split later segments — only whole ones are kept after the first", () => {
    const result = applyTextBudget(doc(["aaaa", "b".repeat(50)]), {
      maxChars: 10,
      onOverflow: "truncate",
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.document.segments.map((s) => s.text)).toEqual(["aaaa"]);
  });

  it("throws on a non-positive budget", () => {
    expect(() =>
      applyTextBudget(doc(["a"]), { maxChars: 0, onOverflow: "truncate" }),
    ).toThrow(RangeError);
  });

  it("publishes the default ceiling used when env is unset", () => {
    expect(DEFAULT_MAX_INPUT_CHARS).toBe(150_000);
  });
});
