/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockExportJobRun = jest.fn();
const mockStageFileToStorage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/reports/exportJobRun", () => ({
  exportJobRun: (...args: unknown[]) => mockExportJobRun(...args),
}));

jest.mock("@/services/files/stageFileToStorage", () => ({
  stageFileToStorage: (...args: unknown[]) => mockStageFileToStorage(...args),
}));

import { exportPaginatedReportToFile } from "@/integrations/microsoft-powerbi/actions/reports/exportPaginatedReportToFile";

const XLSX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockExportJobRun.mockReset();
  mockStageFileToStorage.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockExportJobRun.mockResolvedValue({
    exportId: "exp-1",
    bytes: XLSX_BYTES,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    resourceFileExtension: ".xlsx",
    reportName: "Monthly Invoice",
  });
  mockStageFileToStorage.mockResolvedValue({
    ref: {
      kind: "v2_storage",
      name: "Monthly Invoice.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      storagePath: "u/w/r/n/Monthly Invoice.xlsx",
      provider: "microsoft-powerbi",
    },
    record: { id: "wf-file-1" },
  });
});

function trigger(provider = "native"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-15T12:00:00Z",
    providerAccountId:
      provider === "microsoft-powerbi" ? "alice@contoso.com" : "",
    payload: {},
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

describe("export_paginated_report_to_file action", () => {
  it("runs the export job against the paginated report and returns FileRef + fixed keys", async () => {
    const result = await exportPaginatedReportToFile(
      baseInput({
        workspaceId: "ws-1",
        paginatedReportId: "prep-1",
        format: "XLSX",
      }),
    );

    const jobCall = mockExportJobRun.mock.calls[0]![0];
    expect(jobCall.groupId).toBe("ws-1");
    expect(jobCall.reportId).toBe("prep-1");
    expect(jobCall.format).toBe("XLSX");
    expect(jobCall.parameterValues).toBeUndefined();

    expect(result.output).toEqual({
      file: expect.objectContaining({ kind: "v2_storage" }),
      fileName: "Monthly Invoice.xlsx",
      format: "XLSX",
      exportId: "exp-1",
    });
  });

  it("passes parameterValues through to the export job only when set", async () => {
    await exportPaginatedReportToFile(
      baseInput({
        workspaceId: "ws-1",
        paginatedReportId: "prep-1",
        format: "PDF",
        parameterValues: [{ name: "Region", value: "West" }],
      }),
    );
    expect(mockExportJobRun.mock.calls[0]![0].parameterValues).toEqual([
      { name: "Region", value: "West" },
    ]);
  });

  it("accepts every documented paginated format and rejects PNG (Power BI reports only)", async () => {
    for (const format of [
      "PDF",
      "PPTX",
      "XLSX",
      "DOCX",
      "CSV",
      "XML",
      "MHTML",
      "ACCESSIBLEPDF",
    ]) {
      await expect(
        exportPaginatedReportToFile(
          baseInput({ workspaceId: "ws-1", paginatedReportId: "prep-1", format }),
        ),
      ).resolves.toBeDefined();
    }
    await expect(
      exportPaginatedReportToFile(
        baseInput({
          workspaceId: "ws-1",
          paginatedReportId: "prep-1",
          format: "PNG",
        }),
      ),
    ).rejects.toThrow();
  });

  it("maps the ACCESSIBLEPDF fallback extension to .pdf when the provider omits it", async () => {
    mockExportJobRun.mockResolvedValueOnce({
      exportId: "exp-2",
      bytes: XLSX_BYTES,
      contentType: "application/pdf",
      resourceFileExtension: null,
      reportName: null,
    });
    const result = await exportPaginatedReportToFile(
      baseInput({
        workspaceId: "ws-1",
        paginatedReportId: "prep-9",
        format: "ACCESSIBLEPDF",
      }),
    );
    expect(result.output.fileName).toBe("report-prep-9.pdf");
  });

  it("rejects more than 50 parameter values (documented request bound)", async () => {
    const parameterValues = Array.from({ length: 51 }, (_, i) => ({
      name: `p${i}`,
      value: "v",
    }));
    await expect(
      exportPaginatedReportToFile(
        baseInput({
          workspaceId: "ws-1",
          paginatedReportId: "prep-1",
          format: "PDF",
          parameterValues,
        }),
      ),
    ).rejects.toThrow();
    expect(mockExportJobRun).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      exportPaginatedReportToFile(
        baseInput({
          workspaceId: "ws-1",
          paginatedReportId: "prep-1",
          format: "PDF",
          paginatedReportConfiguration: {},
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await exportPaginatedReportToFile({
      ...baseInput({
        workspaceId: "ws-1",
        paginatedReportId: "prep-1",
        format: "PDF",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockExportJobRun.mockRejectedValueOnce(
      new Error("Power BI export exp-1 failed: ExportDataCapacityError"),
    );
    await expect(
      exportPaginatedReportToFile(
        baseInput({
          workspaceId: "ws-1",
          paginatedReportId: "prep-1",
          format: "PDF",
        }),
      ),
    ).rejects.toThrow(/ExportDataCapacityError/);
    expect(mockStageFileToStorage).not.toHaveBeenCalled();
  });

  it("never leaks the access token into the output", async () => {
    const result = await exportPaginatedReportToFile(
      baseInput({
        workspaceId: "ws-1",
        paginatedReportId: "prep-1",
        format: "PDF",
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
