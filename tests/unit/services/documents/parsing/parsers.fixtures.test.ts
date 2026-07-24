/** @jest-environment node */
/**
 * Real-fixture round trips for every supported format plus the negative
 * fixtures. No mocked parsing — these run the actual libraries against
 * committed files in tests/fixtures/documents/.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DocumentHasNoTextError,
  DocumentParseError,
} from "@/services/documents/parsing/errors";
import { parseDocument } from "@/services/documents/parsing/parseDocument";
import { parseCsv } from "@/services/documents/parsing/parseCsv";
import { parsePdf, PAGES_OUT_OF_RANGE_WARNING } from "@/services/documents/parsing/parsePdf";
import { parseXlsx } from "@/services/documents/parsing/parseXlsx";
import {
  MAX_SCAN_COLUMNS,
  MAX_SCAN_ROWS,
  COLUMN_CAP_WARNING,
  ROW_CAP_WARNING,
} from "@/services/documents/parsing/tabular";

// Real parsing (PDF.js bundle init, zip inflation) is fast alone (~3s for
// the whole suite) but can exceed Jest's 5s default per-test timeout when
// the full tree runs and workers contend for CPU. Generous ceiling — these
// tests are deterministic, not slow by design.
jest.setTimeout(60_000);

const FIXTURES = join(__dirname, "../../../../fixtures/documents");
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(FIXTURES, name)));

describe("PDF parsing (multi-page.pdf)", () => {
  it("produces one labeled segment per page", async () => {
    const parsed = await parseDocument({
      bytes: fixture("multi-page.pdf"),
      mimeType: "application/pdf",
      fileName: "multi-page.pdf",
    });
    expect(parsed.kind).toBe("pages");
    expect(parsed.totalSegments).toBe(3);
    expect(parsed.segments.map((s) => s.label)).toEqual([
      "Page 1",
      "Page 2",
      "Page 3",
    ]);
    expect(parsed.segments[0]!.text).toContain("Alice Johnson");
    expect(parsed.segments[2]!.text).toContain("total overtime was 6 hours");
    expect(parsed.truncated).toBe(false);
  });

  it("honors a page range and reports totalSegments of the full source", async () => {
    const parsed = await parseDocument({
      bytes: fixture("multi-page.pdf"),
      mimeType: "application/pdf",
      pageRange: "1,3",
    });
    expect(parsed.segments.map((s) => s.label)).toEqual(["Page 1", "Page 3"]);
    expect(parsed.totalSegments).toBe(3);
    expect(parsed.warnings).toEqual([]);
  });

  it("warns about out-of-range pages but keeps existing ones", async () => {
    const parsed = await parsePdf(fixture("multi-page.pdf"), {
      pages: [2, 9],
    });
    expect(parsed.segments.map((s) => s.label)).toEqual(["Page 2"]);
    expect(parsed.warnings).toContain(PAGES_OUT_OF_RANGE_WARNING);
  });

  it("throws when the page range selects no existing pages", async () => {
    await expect(
      parsePdf(fixture("multi-page.pdf"), { pages: [7, 8] }),
    ).rejects.toThrow(DocumentParseError);
  });

  it("rejects an image-only PDF with DocumentHasNoTextError", async () => {
    await expect(
      parseDocument({ bytes: fixture("image-only.pdf"), mimeType: "application/pdf" }),
    ).rejects.toThrow(DocumentHasNoTextError);
  });

  it("rejects an encrypted PDF with a password-protected parse error", async () => {
    await expect(
      parseDocument({ bytes: fixture("encrypted.pdf"), mimeType: "application/pdf" }),
    ).rejects.toThrow(/password-protected/);
  });

  it("rejects a corrupt PDF with DocumentParseError", async () => {
    await expect(
      parseDocument({ bytes: fixture("corrupt.pdf"), mimeType: "application/pdf" }),
    ).rejects.toThrow(DocumentParseError);
  });
});

describe("DOCX parsing (sample.docx)", () => {
  it("extracts raw text as a single segment", async () => {
    const parsed = await parseDocument({
      bytes: fixture("sample.docx"),
      fileName: "sample.docx",
    });
    expect(parsed.kind).toBe("text");
    expect(parsed.segments).toHaveLength(1);
    expect(parsed.segments[0]!.text).toContain("BOL-4711");
    expect(parsed.segments[0]!.text).toContain("Acme Freight");
  });

  it("rejects a non-zip body labeled as docx", async () => {
    await expect(
      parseDocument({ bytes: fixture("bom.txt"), fileName: "fake.docx" }),
    ).rejects.toThrow(DocumentParseError);
  });
});

describe("XLSX parsing (sample.xlsx)", () => {
  it("produces one labeled segment per sheet with pipe-delimited rows", async () => {
    const parsed = await parseDocument({
      bytes: fixture("sample.xlsx"),
      fileName: "sample.xlsx",
    });
    expect(parsed.kind).toBe("sheets");
    expect(parsed.totalSegments).toBe(2);
    expect(parsed.segments.map((s) => s.label)).toEqual([
      "Sheet: Payroll",
      "Sheet: Notes",
    ]);
    const payroll = parsed.segments[0]!.text.split("\n");
    expect(payroll[0]!).toBe(
      "Employee | Regular Hours | Overtime Hours | Gross Pay",
    );
    expect(payroll[1]!).toContain("Alice Johnson | 40 | 2 | 1240.5");
  });

  it("filters to a named sheet case-insensitively", async () => {
    const parsed = await parseXlsx(fixture("sample.xlsx"), {
      sheetName: "payroll",
    });
    expect(parsed.segments.map((s) => s.label)).toEqual(["Sheet: Payroll"]);
    expect(parsed.totalSegments).toBe(2);
  });

  it("throws a typed error for an unknown sheet name", async () => {
    await expect(
      parseXlsx(fixture("sample.xlsx"), { sheetName: "Missing" }),
    ).rejects.toThrow(/Sheet "Missing" was not found/);
  });
});

describe("CSV parsing (sample.csv)", () => {
  it("handles embedded commas, escaped quotes, and newlines in cells", async () => {
    const parsed = await parseDocument({
      bytes: fixture("sample.csv"),
      mimeType: "text/csv",
    });
    expect(parsed.kind).toBe("rows");
    const lines = parsed.segments[0]!.text.split("\n");
    expect(lines[0]!).toBe("name | role | notes");
    expect(lines[1]!).toBe('Johnson, Alice | driver | Said "on time" twice');
    // Embedded newline collapsed to a space so one row stays one line.
    expect(lines[2]!).toBe("Bob Smith | dispatcher | line one line two");
    expect(lines[3]!).toBe("Carol Diaz | mechanic | plain");
  });

  it("caps rows and columns with explicit warnings", () => {
    const wideRow = Array.from({ length: MAX_SCAN_COLUMNS + 5 }, (_, i) => `c${i}`);
    const manyRows = Array.from({ length: MAX_SCAN_ROWS + 10 }, () => "a,b").join(
      "\n",
    );
    const capped = parseCsv(new TextEncoder().encode(manyRows));
    expect(capped.truncated).toBe(true);
    expect(capped.warnings).toContain(ROW_CAP_WARNING);
    expect(capped.segments[0]!.text.split("\n")).toHaveLength(MAX_SCAN_ROWS);

    const wide = parseCsv(new TextEncoder().encode(wideRow.join(",")));
    expect(wide.truncated).toBe(true);
    expect(wide.warnings).toContain(COLUMN_CAP_WARNING);
  });

  it("escapes pipe characters inside cells", () => {
    const parsed = parseCsv(new TextEncoder().encode('a|b,c\n"x|y",z'));
    const lines = parsed.segments[0]!.text.split("\n");
    expect(lines[0]!).toBe("a\\|b | c");
    expect(lines[1]!).toBe("x\\|y | z");
  });
});

describe("TXT parsing (bom.txt)", () => {
  it("strips the UTF-8 BOM and keeps the text", async () => {
    const parsed = await parseDocument({
      bytes: fixture("bom.txt"),
      mimeType: "text/plain",
    });
    expect(parsed.kind).toBe("text");
    expect(parsed.segments[0]!.text.startsWith("Plain text fixture")).toBe(true);
    expect(parsed.segments[0]!.text).toContain("Second line.");
  });

  it("rejects whitespace-only text with DocumentHasNoTextError", async () => {
    await expect(
      parseDocument({
        bytes: new TextEncoder().encode("   \n  \t "),
        mimeType: "text/plain",
      }),
    ).rejects.toThrow(DocumentHasNoTextError);
  });
});
