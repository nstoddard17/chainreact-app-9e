/**
 * Slice 3.GDOCS-4 integration test — Google Docs `export_document`
 * config shape (FileRef-producing action) as it flows into the
 * WorkflowBuilder shell.
 *
 * Pins:
 *   - 3-field surface (`documentId / exportFormat / fileName`) — V1
 *     `destination` field intentionally absent (rejected per D-GD3).
 *   - 7-value exportFormat enum.
 *   - `producesFileRef: true` so the variable picker renders a file
 *     icon next to the `file` output and downstream FileRef-consuming
 *     actions (Gmail / Outlook attachments, Drive upload_file) can
 *     accept it.
 *   - Sensitive-flag posture: `fileName` sensitive, other structural
 *     output fields non-sensitive.
 */

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn();
const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { googleDocsExportDocumentMeta } from "@/integrations/google-docs/actions/exportDocument.meta";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeTriggers.mockReset();
  mockListProviderActions.mockReset();
  mockListProviderTriggers.mockReset();
  mockFetchOptionsSource.mockReset();
});

describe("Google Docs export_document meta — Builder shape", () => {
  it("preserves runtime camelCase field names verbatim (documentId / exportFormat / fileName)", () => {
    expect(googleDocsExportDocumentMeta.fields.map((f) => f.name)).toEqual([
      "documentId",
      "exportFormat",
      "fileName",
    ]);
  });

  it("does NOT declare a destination/folder field (V1 destination rejected per D-GD3 — compose via downstream actions)", () => {
    const names = googleDocsExportDocumentMeta.fields.map((f) => f.name);
    expect(names).not.toContain("destination");
    expect(names).not.toContain("folderId");
    expect(names).not.toContain("driveFolder");
    expect(names).not.toContain("email");
    expect(names).not.toContain("webhookUrl");
  });

  it("documentId picker wires google-docs:documents", () => {
    const field = googleDocsExportDocumentMeta.fields.find(
      (f) => f.name === "documentId",
    )!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("google-docs:documents");
    expect(field.required).toBe(true);
  });

  it("exportFormat is required select with the V1 7-value enum (pdf / docx / txt / html / rtf / epub / odt)", () => {
    const field = googleDocsExportDocumentMeta.fields.find(
      (f) => f.name === "exportFormat",
    )!;
    expect(field.type).toBe("select");
    expect(field.required).toBe(true);
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "docx",
      "epub",
      "html",
      "odt",
      "pdf",
      "rtf",
      "txt",
    ]);
  });

  it("fileName is optional text (handler defaults to document title when omitted)", () => {
    const field = googleDocsExportDocumentMeta.fields.find(
      (f) => f.name === "fileName",
    )!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(false);
  });

  it("risk: low, not destructive (export = read + file-generation)", () => {
    expect(googleDocsExportDocumentMeta.riskLevel).toBe("low");
    expect(googleDocsExportDocumentMeta.isDestructive).toBe(false);
    expect(googleDocsExportDocumentMeta.requiresConfirmation).toBe(false);
  });

  it("description surfaces Drive's 10MB export cap", () => {
    expect(googleDocsExportDocumentMeta.description).toMatch(/10mb/i);
  });
});

describe("Google Docs export_document meta — FileRef output", () => {
  it("declares producesFileRef: true (variable picker renders the file icon + downstream FileRef-consumers see the file output)", () => {
    expect(googleDocsExportDocumentMeta.producesFileRef).toBe(true);
    expect(googleDocsExportDocumentMeta.consumesFileRef).toBe(false);
  });

  it("the `file` output is typed `fileRef`", () => {
    const file = googleDocsExportDocumentMeta.outputs.find(
      (o) => o.name === "file",
    )!;
    expect(file).toBeDefined();
    expect(file.type).toBe("fileRef");
  });

  it("output names match the runtime handler (file / fileName / fileSize / format / mimeType / fileId)", () => {
    expect(googleDocsExportDocumentMeta.outputs.map((o) => o.name)).toEqual([
      "file",
      "fileName",
      "fileSize",
      "format",
      "mimeType",
      "fileId",
    ]);
  });

  it("fileName carries sensitive=true; fileSize / format / mimeType / fileId NOT sensitive", () => {
    const out = new Map(
      googleDocsExportDocumentMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("fileName")?.sensitive).toBe(true);
    expect(out.get("fileSize")?.sensitive).toBeUndefined();
    expect(out.get("format")?.sensitive).toBeUndefined();
    expect(out.get("mimeType")?.sensitive).toBeUndefined();
    expect(out.get("fileId")?.sensitive).toBeUndefined();
  });

  it("FileRef output description identifies kind=v2_storage + provider; no access-token leakage", () => {
    const file = googleDocsExportDocumentMeta.outputs.find(
      (o) => o.name === "file",
    )!;
    const desc = file.description?.toLowerCase() ?? "";
    expect(desc).toContain("v2_storage");
    expect(desc).toContain("google-docs");
    // FileRef metadata MUST NOT carry tokens. The description's
    // "no tokens" guarantee is documentation-level; the actual
    // type-level guarantee comes from the FileRef contract. Sanity
    // check that the description doesn't accidentally promote a
    // bearer-token field.
    expect(desc).not.toMatch(/access[_-]?token/);
    expect(desc).not.toMatch(/bearer/);
  });
});
