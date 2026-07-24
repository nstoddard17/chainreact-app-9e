/** @jest-environment node */
/**
 * AI-PROVIDER-5 (CS-5) — document resolution for Analyze Document.
 *
 * Everything here happens BEFORE any spend, so the assertions are about
 * refusing early, warning honestly, and never silently dropping content
 * from an extraction.
 */
import { buildParsedDocument } from "@/core/documents/parsedDocument";
import { UnsupportedProviderFetchError } from "@/core/files/fetchFileBytes";
import { DocumentInputError } from "@/services/ai/processor/analysisErrors";
import {
  MAX_PAGES_WARNING,
  resolveAnalysisDocument,
  type ResolveAnalysisDocumentDeps,
} from "@/services/ai/processor/resolveAnalysisDocument";
import {
  DocumentHasNoTextError,
  UnsupportedDocumentTypeError,
} from "@/services/documents/parsing/errors";
import type { FileRef } from "@/contracts/file";

const createAdapter = jest.fn((_input: { reason: string }) => ({
  download: jest.fn(),
}));
jest.mock("@/services/files/createWorkflowFilesStorageAdapter", () => ({
  createWorkflowFilesStorageAdapter: (input: { reason: string }) => createAdapter(input),
}));

const PDF_REF: FileRef = {
  kind: "v2_storage",
  name: "payroll.pdf",
  mimeType: "application/pdf",
  storagePath: "u/w/r/n/payroll.pdf",
};

function pages(count: number, text = "abcde") {
  return buildParsedDocument({
    kind: "pages",
    segments: Array.from({ length: count }, (_, i) => ({
      label: `Page ${i + 1}`,
      text,
    })),
  });
}

function deps(overrides: ResolveAnalysisDocumentDeps = {}): ResolveAnalysisDocumentDeps {
  return {
    fetchBytes: jest.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      name: "payroll.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
    })) as unknown as ResolveAnalysisDocumentDeps["fetchBytes"],
    detectFormat: jest.fn(() => "pdf") as unknown as ResolveAnalysisDocumentDeps["detectFormat"],
    parse: jest.fn(async () => pages(3)) as unknown as ResolveAnalysisDocumentDeps["parse"],
    maxInputChars: 100_000,
    ...overrides,
  };
}

const BASE = {
  mode: "summarize" as const,
  storageReason: "ai:analyze_document run=r node=n",
};

beforeEach(() => {
  createAdapter.mockClear();
});

describe("file input", () => {
  it("fetches, parses, and reports the detected type + segment count", async () => {
    const d = deps();
    const resolved = await resolveAnalysisDocument({ ...BASE, value: PDF_REF }, d);
    expect(resolved.detectedType).toBe("pdf");
    expect(resolved.segmentsAnalyzed).toBe(3);
    expect(resolved.payload.name).toBe("payroll.pdf");
    expect(resolved.payload.segments[0]).toEqual({ label: "Page 1", text: "abcde" });
    expect(resolved.truncated).toBe(false);
  });

  it("builds a service-role storage adapter only for v2_storage refs", async () => {
    await resolveAnalysisDocument({ ...BASE, value: PDF_REF }, deps());
    expect(createAdapter).toHaveBeenCalledWith({
      reason: "ai:analyze_document run=r node=n",
    });

    createAdapter.mockClear();
    const signed: FileRef = {
      kind: "signed_url",
      name: "a.csv",
      mimeType: "text/csv",
      url: "https://example.com/a.csv",
    };
    await resolveAnalysisDocument({ ...BASE, value: signed }, deps());
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("forwards the page range and sheet name to the parser and reports application", async () => {
    const parse = jest.fn(async () => pages(2));
    const resolved = await resolveAnalysisDocument(
      { ...BASE, value: PDF_REF, pageRange: "1-2", sheetName: "June" },
      deps({ parse: parse as unknown as ResolveAnalysisDocumentDeps["parse"] }),
    );
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ pageRange: "1-2", sheetName: "June" }),
    );
    expect(resolved.pageRangeApplied).toBe(true);
  });

  it("reports pageRangeApplied false for a non-PDF format", async () => {
    const resolved = await resolveAnalysisDocument(
      { ...BASE, value: PDF_REF, pageRange: "1-2" },
      deps({
        detectFormat: jest.fn(
          () => "csv",
        ) as unknown as ResolveAnalysisDocumentDeps["detectFormat"],
      }),
    );
    expect(resolved.pageRangeApplied).toBe(false);
  });

  it("refuses a provider_url ref with the download-step remedy", async () => {
    const providerRef: FileRef = {
      kind: "provider_url",
      name: "a.pdf",
      mimeType: "application/pdf",
      url: "https://provider.example/a.pdf",
      provider: "slack",
    };
    await expect(
      resolveAnalysisDocument({ ...BASE, value: providerRef }, deps()),
    ).rejects.toThrow(/download step/i);
  });

  it("turns an UnsupportedProviderFetchError from the fetcher into the same remedy", async () => {
    const d = deps({
      fetchBytes: jest.fn(async () => {
        throw new UnsupportedProviderFetchError("slack");
      }) as unknown as ResolveAnalysisDocumentDeps["fetchBytes"],
    });
    await expect(
      resolveAnalysisDocument({ ...BASE, value: PDF_REF }, d),
    ).rejects.toThrow(/download step/i);
  });

  it("surfaces typed parser failures as author-facing config errors", async () => {
    for (const err of [
      new UnsupportedDocumentTypeError('mime "image/png"'),
      new DocumentHasNoTextError(),
    ]) {
      const d = deps({
        parse: jest.fn(async () => {
          throw err;
        }) as unknown as ResolveAnalysisDocumentDeps["parse"],
      });
      await expect(
        resolveAnalysisDocument({ ...BASE, value: PDF_REF }, d),
      ).rejects.toBeInstanceOf(DocumentInputError);
    }
  });

  it("turns an undetectable format into a config error before any fetch cost is wasted", async () => {
    const d = deps({
      detectFormat: jest.fn(() => {
        throw new UnsupportedDocumentTypeError("unknown mime and extension");
      }) as unknown as ResolveAnalysisDocumentDeps["detectFormat"],
    });
    await expect(
      resolveAnalysisDocument({ ...BASE, value: PDF_REF }, d),
    ).rejects.toThrow(/Unsupported file type/);
  });
});

describe("text and parsed-document input", () => {
  it("accepts plain text", async () => {
    const resolved = await resolveAnalysisDocument(
      { ...BASE, value: "Invoice total: $42" },
      deps(),
    );
    expect(resolved.detectedType).toBe("text");
    expect(resolved.payload.segments).toEqual([{ label: "", text: "Invoice total: $42" }]);
    expect(resolved.warnings).toEqual([]);
  });

  it("warns instead of silently ignoring a page range or sheet name on text", async () => {
    const resolved = await resolveAnalysisDocument(
      { ...BASE, value: "hello", pageRange: "1-2", sheetName: "June" },
      deps(),
    );
    expect(resolved.warnings).toEqual([
      "page_range_not_supported_for_text",
      "sheet_name_not_supported_for_text",
    ]);
    expect(resolved.pageRangeApplied).toBe(false);
  });

  it("accepts an already-parsed document without re-parsing", async () => {
    const parse = jest.fn();
    const resolved = await resolveAnalysisDocument(
      { ...BASE, value: pages(2, "text") },
      deps({ parse: parse as unknown as ResolveAnalysisDocumentDeps["parse"] }),
    );
    expect(parse).not.toHaveBeenCalled();
    expect(resolved.detectedType).toBe("parsed");
    expect(resolved.segmentsAnalyzed).toBe(2);
  });

  it("refuses an unusable value with a remedy, before any spend", async () => {
    await expect(
      resolveAnalysisDocument({ ...BASE, value: 42 }, deps()),
    ).rejects.toBeInstanceOf(DocumentInputError);
    await expect(
      resolveAnalysisDocument({ ...BASE, value: "   " }, deps()),
    ).rejects.toThrow(/needs a file from an earlier step or some text/);
  });
});

describe("limits", () => {
  it("applies the explicit page cap and says so", async () => {
    const resolved = await resolveAnalysisDocument(
      { ...BASE, value: PDF_REF, maxPages: 2 },
      deps({ parse: jest.fn(async () => pages(5)) as unknown as ResolveAnalysisDocumentDeps["parse"] }),
    );
    expect(resolved.segmentsAnalyzed).toBe(2);
    expect(resolved.truncated).toBe(true);
    expect(resolved.warnings).toContain(MAX_PAGES_WARNING);
  });

  it("truncates for summarize but REFUSES for extract modes", async () => {
    const big = deps({
      parse: jest.fn(async () => pages(4, "x".repeat(50))) as unknown as ResolveAnalysisDocumentDeps["parse"],
      maxInputChars: 60,
    });
    const summarized = await resolveAnalysisDocument(
      { ...BASE, value: PDF_REF, mode: "summarize" },
      big,
    );
    expect(summarized.truncated).toBe(true);
    expect(summarized.segmentsAnalyzed).toBe(1);
    expect(summarized.payload.truncated).toBe(true);

    for (const mode of ["extract_fields", "extract_rows"] as const) {
      await expect(
        resolveAnalysisDocument({ ...BASE, value: PDF_REF, mode }, big),
      ).rejects.toThrow(/too long to extract/);
    }
  });
});
