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

import { exportPowerBiReportToFile } from "@/integrations/microsoft-powerbi/actions/reports/exportPowerBiReportToFile";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockExportJobRun.mockReset();
  mockStageFileToStorage.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockExportJobRun.mockResolvedValue({
    exportId: "exp-1",
    bytes: PDF_BYTES,
    contentType: "application/pdf",
    resourceFileExtension: ".pdf",
    reportName: "Q4 Sales",
  });
  mockStageFileToStorage.mockResolvedValue({
    ref: {
      kind: "v2_storage",
      name: "Q4 Sales.pdf",
      mimeType: "application/pdf",
      storagePath: "u/w/r/n/Q4 Sales.pdf",
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

describe("export_power_bi_report_to_file action", () => {
  it("runs the export job, stages bytes, and returns FileRef + fixed keys", async () => {
    const result = await exportPowerBiReportToFile(
      baseInput({ workspaceId: "ws-1", reportId: "rep-1", format: "PDF" }),
    );

    const jobCall = mockExportJobRun.mock.calls[0]![0];
    expect(jobCall.groupId).toBe("ws-1");
    expect(jobCall.reportId).toBe("rep-1");
    expect(jobCall.format).toBe("PDF");
    expect(jobCall.pageName).toBeUndefined();

    const stageCall = mockStageFileToStorage.mock.calls[0]![0];
    expect(stageCall.fileName).toBe("Q4 Sales.pdf");
    expect(stageCall.mimeType).toBe("application/pdf");
    expect(stageCall.bytes).toBe(PDF_BYTES);
    expect(stageCall.provider).toBe("microsoft-powerbi");

    expect(result.output).toEqual({
      file: expect.objectContaining({ kind: "v2_storage" }),
      fileName: "Q4 Sales.pdf",
      format: "PDF",
      exportId: "exp-1",
    });
    // No bytes/base64 in the output.
    expect(Object.keys(result.output)).toEqual([
      "file",
      "fileName",
      "format",
      "exportId",
    ]);
  });

  it("passes pageName through to the export job only when set", async () => {
    await exportPowerBiReportToFile(
      baseInput({
        workspaceId: "ws-1",
        reportId: "rep-1",
        format: "PNG",
        pageName: "ReportSection7",
      }),
    );
    expect(mockExportJobRun.mock.calls[0]![0].pageName).toBe("ReportSection7");
  });

  it("falls back to report-<id> + format extension when Power BI omits name/extension", async () => {
    mockExportJobRun.mockResolvedValueOnce({
      exportId: "exp-2",
      bytes: PDF_BYTES,
      contentType: "application/pdf",
      resourceFileExtension: null,
      reportName: null,
    });

    const result = await exportPowerBiReportToFile(
      baseInput({ workspaceId: "ws-1", reportId: "rep-9", format: "PPTX" }),
    );
    expect(result.output.fileName).toBe("report-rep-9.pptx");
  });

  it("rejects an unknown format (Q11 — documented Power BI report set only)", async () => {
    await expect(
      exportPowerBiReportToFile(
        baseInput({ workspaceId: "ws-1", reportId: "rep-1", format: "XLSX" }),
      ),
    ).rejects.toThrow();
    expect(mockExportJobRun).not.toHaveBeenCalled();
  });

  it("rejects missing format (no hidden default)", async () => {
    await expect(
      exportPowerBiReportToFile(
        baseInput({ workspaceId: "ws-1", reportId: "rep-1" }),
      ),
    ).rejects.toThrow();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      exportPowerBiReportToFile(
        baseInput({
          workspaceId: "ws-1",
          reportId: "rep-1",
          format: "PDF",
          powerBIReportConfiguration: { pages: [] },
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await exportPowerBiReportToFile({
      ...baseInput({ workspaceId: "ws-1", reportId: "rep-1", format: "PDF" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates export-job failures (budget / Failed) to the engine", async () => {
    mockExportJobRun.mockRejectedValueOnce(
      new Error(
        "Power BI export exp-1 is still running after 40s — export fewer pages or a smaller report, then retry.",
      ),
    );
    await expect(
      exportPowerBiReportToFile(
        baseInput({ workspaceId: "ws-1", reportId: "rep-1", format: "PDF" }),
      ),
    ).rejects.toThrow(/still running after 40s/);
    expect(mockStageFileToStorage).not.toHaveBeenCalled();
  });

  it("never leaks the access token into the output", async () => {
    const result = await exportPowerBiReportToFile(
      baseInput({ workspaceId: "ws-1", reportId: "rep-1", format: "PDF" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
