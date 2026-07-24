/** @jest-environment node */
import { PageRangeError } from "@/core/documents/pageRange";
import {
  DocumentTooLargeError,
  UnsupportedDocumentTypeError,
} from "@/services/documents/parsing/errors";
import {
  MAX_DOCUMENT_BYTES,
  PAGE_RANGE_UNSUPPORTED_WARNING_PREFIX,
  SHEET_NAME_UNSUPPORTED_WARNING,
  detectDocumentFormat,
  parseDocument,
} from "@/services/documents/parsing/parseDocument";

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const text = (s: string) => new TextEncoder().encode(s);

describe("detectDocumentFormat", () => {
  it("resolves by mime type first", () => {
    expect(
      detectDocumentFormat({ bytes: text("x"), mimeType: "application/pdf" }),
    ).toBe("pdf");
    expect(
      detectDocumentFormat({
        bytes: text("x"),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("docx");
    expect(
      detectDocumentFormat({
        bytes: text("x"),
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toBe("xlsx");
    expect(
      detectDocumentFormat({ bytes: text("x"), mimeType: "text/csv" }),
    ).toBe("csv");
    expect(
      detectDocumentFormat({ bytes: text("x"), mimeType: "TEXT/PLAIN" }),
    ).toBe("text");
  });

  it("falls back to the file extension for noncommittal mimes", () => {
    expect(
      detectDocumentFormat({
        bytes: text("x"),
        mimeType: "application/octet-stream",
        fileName: "report.XLSX",
      }),
    ).toBe("xlsx");
    expect(
      detectDocumentFormat({ bytes: text("x"), fileName: "notes.md" }),
    ).toBe("text");
    expect(
      detectDocumentFormat({ bytes: text("x"), fileName: "data.csv" }),
    ).toBe("csv");
  });

  it("falls back to the extension when the mime is specific but unknown", () => {
    expect(
      detectDocumentFormat({
        bytes: text("x"),
        mimeType: "application/x-wrong-but-committal",
        fileName: "doc.pdf",
      }),
    ).toBe("pdf");
  });

  it("uses PDF magic bytes as the last resort", () => {
    expect(detectDocumentFormat({ bytes: PDF_MAGIC })).toBe("pdf");
  });

  it("refuses to guess between DOCX and XLSX from ZIP magic alone", () => {
    expect(() => detectDocumentFormat({ bytes: ZIP_MAGIC })).toThrow(
      UnsupportedDocumentTypeError,
    );
  });

  it("throws typed unsupported errors — no silent fallback", () => {
    expect(() =>
      detectDocumentFormat({ bytes: text("plain but unlabeled") }),
    ).toThrow(UnsupportedDocumentTypeError);
    expect(() =>
      detectDocumentFormat({
        bytes: text("x"),
        mimeType: "image/png",
        fileName: "photo.png",
      }),
    ).toThrow(UnsupportedDocumentTypeError);
  });
});

describe("parseDocument dispatch behavior", () => {
  it("enforces the pre-parse byte cap with a typed error", async () => {
    const oversized = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    await expect(
      parseDocument({ bytes: oversized, mimeType: "text/plain" }),
    ).rejects.toThrow(DocumentTooLargeError);
  });

  it("rejects an invalid pageRange before parsing, for any format", async () => {
    await expect(
      parseDocument({
        bytes: text("a,b\n1,2"),
        mimeType: "text/csv",
        pageRange: "5-2",
      }),
    ).rejects.toThrow(PageRangeError);
  });

  it("warns and ignores pageRange on non-PDF formats", async () => {
    const parsed = await parseDocument({
      bytes: text("a,b\n1,2"),
      mimeType: "text/csv",
      pageRange: "1-2",
    });
    expect(parsed.warnings).toContain(
      `${PAGE_RANGE_UNSUPPORTED_WARNING_PREFIX}csv`,
    );
    expect(parsed.segments).toHaveLength(1);
  });

  it("warns and ignores sheetName on non-XLSX formats", async () => {
    const parsed = await parseDocument({
      bytes: text("hello world"),
      mimeType: "text/plain",
      sheetName: "Payroll",
    });
    expect(parsed.warnings).toContain(SHEET_NAME_UNSUPPORTED_WARNING);
  });

  it("treats a blank pageRange as absent", async () => {
    const parsed = await parseDocument({
      bytes: text("hello"),
      mimeType: "text/plain",
      pageRange: "   ",
    });
    expect(parsed.warnings).toEqual([]);
  });
});
