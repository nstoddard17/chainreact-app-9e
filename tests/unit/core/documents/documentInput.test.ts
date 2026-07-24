/** @jest-environment node */
/**
 * AI-PROVIDER-5 (CS-5) — "Document" input classification.
 *
 * The single config field accepts three real shapes and must REFUSE
 * everything else rather than stringify it into a paid model call.
 */
import {
  classifyDocumentInput,
  parsedDocumentFromText,
  readParsedDocumentInput,
} from "@/core/documents/documentInput";
import type { FileRef } from "@/contracts/file";

const STORAGE_REF: FileRef = {
  kind: "v2_storage",
  name: "payroll.pdf",
  mimeType: "application/pdf",
  storagePath: "u/w/r/n/payroll.pdf",
};

describe("classifyDocumentInput", () => {
  it("recognizes every FileRef arm", () => {
    expect(classifyDocumentInput(STORAGE_REF)).toEqual({
      kind: "file_ref",
      fileRef: STORAGE_REF,
    });
    const signed: FileRef = {
      kind: "signed_url",
      name: "a.csv",
      mimeType: "text/csv",
      url: "https://example.com/a.csv",
    };
    expect(classifyDocumentInput(signed).kind).toBe("file_ref");
    const providerRef: FileRef = {
      kind: "provider_url",
      name: "a.pdf",
      mimeType: "application/pdf",
      url: "https://provider.example/a.pdf",
      provider: "slack",
    };
    // Classified as a ref — the "download it first" refusal belongs to the
    // resolver, which can name the remedy.
    expect(classifyDocumentInput(providerRef).kind).toBe("file_ref");
  });

  it("treats a non-empty string as text", () => {
    expect(classifyDocumentInput("  invoice total: 42 ")).toEqual({
      kind: "text",
      text: "  invoice total: 42 ",
    });
  });

  it("recognizes an already-parsed document", () => {
    const result = classifyDocumentInput({
      kind: "pages",
      segments: [{ label: "Page 1", text: "hello" }],
      totalSegments: 4,
      truncated: true,
      charCount: 999,
      warnings: ["something"],
    });
    expect(result.kind).toBe("parsed_document");
    if (result.kind !== "parsed_document") throw new Error("unreachable");
    // charCount is RECOMPUTED from the segments, never trusted from input.
    expect(result.document.charCount).toBe(5);
    expect(result.document.totalSegments).toBe(4);
    expect(result.document.truncated).toBe(true);
    expect(result.document.warnings).toEqual(["something"]);
  });

  it.each([
    [undefined, "no document was provided"],
    [null, "no document was provided"],
    ["", "the text provided is empty"],
    ["   ", "the text provided is empty"],
  ])("refuses %p", (value, reason) => {
    const result = classifyDocumentInput(value);
    expect(result).toEqual({ kind: "unsupported", reason });
  });

  it("refuses numbers, booleans, arrays, and unrecognized objects", () => {
    for (const value of [42, true, [1, 2], { url: "https://x.example" }, {}]) {
      const result = classifyDocumentInput(value);
      expect(result.kind).toBe("unsupported");
    }
  });

  it("never echoes the value in the refusal reason", () => {
    const result = classifyDocumentInput({ secretSalary: "125000" });
    if (result.kind !== "unsupported") throw new Error("expected refusal");
    expect(result.reason).not.toContain("125000");
    expect(result.reason).not.toContain("secretSalary");
  });
});

describe("readParsedDocumentInput", () => {
  it("rejects shapes that are not a parsed document", () => {
    expect(readParsedDocumentInput({ kind: "nope", segments: [] })).toBeNull();
    expect(readParsedDocumentInput({ kind: "pages", segments: [] })).toBeNull();
    expect(readParsedDocumentInput({ kind: "pages" })).toBeNull();
    expect(readParsedDocumentInput({ kind: "pages", segments: [{ text: 5 }] })).toBeNull();
    // All-whitespace text carries nothing to analyze.
    expect(
      readParsedDocumentInput({ kind: "text", segments: [{ label: "", text: "  " }] }),
    ).toBeNull();
  });

  it("defaults a missing label and drops non-string warnings", () => {
    const parsed = readParsedDocumentInput({
      kind: "rows",
      segments: [{ text: "a,b" }],
      warnings: ["ok", 5, null],
    });
    expect(parsed?.segments).toEqual([{ label: "", text: "a,b" }]);
    expect(parsed?.warnings).toEqual(["ok"]);
  });

  it("ignores a totalSegments smaller than the segments it was given", () => {
    const parsed = readParsedDocumentInput({
      kind: "pages",
      segments: [{ label: "", text: "a" }, { label: "", text: "b" }],
      totalSegments: 1,
    });
    expect(parsed?.totalSegments).toBe(2);
  });
});

describe("parsedDocumentFromText", () => {
  it("wraps text as one unlabeled segment with a consistent char count", () => {
    const parsed = parsedDocumentFromText("hello world");
    expect(parsed).toEqual({
      kind: "text",
      segments: [{ label: "", text: "hello world" }],
      totalSegments: 1,
      truncated: false,
      charCount: 11,
      warnings: [],
    });
  });
});
