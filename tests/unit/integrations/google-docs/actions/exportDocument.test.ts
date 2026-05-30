/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — google-docs:export_document action handler.
 *
 * Drive destination ONLY. FileRef(v2_storage) output.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDocumentsGet = jest.fn();
const mockFilesExport = jest.fn();
const mockStageFileToStorage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/google/api/docs/documentsGet", () => ({
  documentsGet: (...args: unknown[]) => mockDocumentsGet(...args),
}));

jest.mock("@/integrations/google-drive/api/filesExport", () => ({
  filesExport: (...args: unknown[]) => mockFilesExport(...args),
}));

jest.mock("@/services/files/stageFileToStorage", () => ({
  stageFileToStorage: (...args: unknown[]) => mockStageFileToStorage(...args),
}));

import { exportDocument } from "@/integrations/google-docs/actions/exportDocument";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDocumentsGet.mockReset();
  mockFilesExport.mockReset();
  mockStageFileToStorage.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
    apiCall("ya29.access"),
  );
  mockStageFileToStorage.mockResolvedValue({
    ref: {
      kind: "v2_storage",
      name: "out.pdf",
      mimeType: "application/pdf",
      storagePath: "u/w/r/n/out.pdf",
      provider: "google-docs",
    },
    record: { id: "wf-file-1" },
  });
});

function docsTrigger(): TriggerEvent {
  return {
    provider: "google-docs",
    eventType: "document_updated",
    eventId: "evt-1",
    occurredAt: "2026-05-23T12:00:00Z",
    providerAccountId: "alice@example.com",
    payload: {},
  };
}

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

describe("export_document — Drive destination + FileRef output", () => {
  it("calls files.export with the correct target mimeType for PDF", async () => {
    mockFilesExport.mockResolvedValueOnce({
      bytes: PDF_BYTES,
      contentType: "application/pdf",
    });
    await exportDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        exportFormat: "pdf",
        fileName: "Report",
      },
      triggerEvent: docsTrigger(),
    });
    const args = mockFilesExport.mock.calls[0]![0]! as { mimeType: string };
    expect(args.mimeType).toBe("application/pdf");
  });

  it("maps every supported exportFormat to the canonical Google mimeType", async () => {
    const formats: Array<[string, string]> = [
      ["pdf", "application/pdf"],
      [
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      ["txt", "text/plain"],
      ["html", "text/html"],
      ["rtf", "application/rtf"],
      ["epub", "application/epub+zip"],
      ["odt", "application/vnd.oasis.opendocument.text"],
    ];
    for (const [format, mime] of formats) {
      mockFilesExport.mockResolvedValueOnce({
        bytes: PDF_BYTES,
        contentType: mime,
      });
      await exportDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          exportFormat: format,
          fileName: "x",
        },
        triggerEvent: docsTrigger(),
      });
      const args = mockFilesExport.mock.calls.at(-1)![0]! as { mimeType: string };
      expect(args.mimeType).toBe(mime);
    }
  });

  it("appends extension to fileName (V1 parity behavior)", async () => {
    mockFilesExport.mockResolvedValueOnce({
      bytes: PDF_BYTES,
      contentType: "application/pdf",
    });
    await exportDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        exportFormat: "pdf",
        fileName: "Report",
      },
      triggerEvent: docsTrigger(),
    });
    const args = mockStageFileToStorage.mock.calls[0]![0]! as { fileName: string };
    expect(args.fileName).toBe("Report.pdf");
  });

  it("uses the document title when fileName is omitted", async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      documentId: "doc-1",
      title: "Quarterly Report",
    });
    mockFilesExport.mockResolvedValueOnce({
      bytes: PDF_BYTES,
      contentType: "application/pdf",
    });
    await exportDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { documentId: "doc-1", exportFormat: "pdf" },
      triggerEvent: docsTrigger(),
    });
    const args = mockStageFileToStorage.mock.calls[0]![0]! as { fileName: string };
    expect(args.fileName).toBe("Quarterly Report.pdf");
  });

  it("falls back to `document-<id>` when both fileName and title are missing", async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      documentId: "doc-1",
      title: "",
    });
    mockFilesExport.mockResolvedValueOnce({
      bytes: PDF_BYTES,
      contentType: "application/pdf",
    });
    await exportDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { documentId: "doc-1", exportFormat: "pdf" },
      triggerEvent: docsTrigger(),
    });
    const args = mockStageFileToStorage.mock.calls[0]![0]! as { fileName: string };
    expect(args.fileName).toBe("document-doc-1.pdf");
  });

  it("returns a FileRef(v2_storage) output with the staged ref + flat fields", async () => {
    mockFilesExport.mockResolvedValueOnce({
      bytes: PDF_BYTES,
      contentType: "application/pdf",
    });
    const result = await exportDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        exportFormat: "pdf",
        fileName: "Report",
      },
      triggerEvent: docsTrigger(),
    });
    const file = result.output.file as { kind: string; provider?: string };
    expect(file.kind).toBe("v2_storage");
    expect(file.provider).toBe("google-docs");
    expect(result.output.fileName).toBe("Report.pdf");
    expect(result.output.fileSize).toBe(PDF_BYTES.byteLength);
    expect(result.output.format).toBe("pdf");
    expect(result.output.mimeType).toBe("application/pdf");
    expect(result.output.fileId).toBe("doc-1");
  });

  it("stages with metadata containing sourceDocumentId + exportFormat", async () => {
    mockFilesExport.mockResolvedValueOnce({
      bytes: PDF_BYTES,
      contentType: "application/pdf",
    });
    await exportDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-source",
        exportFormat: "docx",
        fileName: "x",
      },
      triggerEvent: docsTrigger(),
    });
    const args = mockStageFileToStorage.mock.calls[0]![0]! as {
      metadata: Record<string, unknown>;
      provider: string;
    };
    expect(args.metadata.sourceDocumentId).toBe("doc-source");
    expect(args.metadata.exportFormat).toBe("docx");
    expect(args.provider).toBe("google-docs");
  });
});

describe("export_document — V1 destination fields rejected", () => {
  it("rejects `destination` field entirely (strict-mode unknown-field)", async () => {
    await expect(
      exportDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          exportFormat: "pdf",
          destination: "email",
        },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow();
    expect(mockFilesExport).not.toHaveBeenCalled();
  });

  it("rejects V1's webhookUrl / emailTo fields", async () => {
    await expect(
      exportDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          exportFormat: "pdf",
          webhookUrl: "https://example.com/hook",
        },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow();
  });
});

describe("export_document — schema validation", () => {
  it("rejects unknown exportFormat values", async () => {
    await expect(
      exportDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { documentId: "doc-1", exportFormat: "xls" },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects missing documentId", async () => {
    await expect(
      exportDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { exportFormat: "pdf" },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(/documentId is required/);
  });
});
