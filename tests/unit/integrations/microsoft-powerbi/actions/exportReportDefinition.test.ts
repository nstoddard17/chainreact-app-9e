/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDownload = jest.fn();
const mockStageFileToStorage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/reports/reportExportDownload",
  () => ({
    reportExportDownload: (...args: unknown[]) => mockDownload(...args),
  }),
);

jest.mock("@/services/files/stageFileToStorage", () => ({
  stageFileToStorage: (...args: unknown[]) => mockStageFileToStorage(...args),
}));

import { exportReportDefinition } from "@/integrations/microsoft-powerbi/actions/reports/exportReportDefinition";

const PBIX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDownload.mockReset();
  mockStageFileToStorage.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockDownload.mockResolvedValue({
    bytes: PBIX_BYTES,
    contentType: "application/zip",
  });
  mockStageFileToStorage.mockResolvedValue({
    ref: {
      kind: "v2_storage",
      name: "report-rep-1.pbix",
      mimeType: "application/zip",
      storagePath: "u/w/r/n/report-rep-1.pbix",
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

describe("export_report_definition action", () => {
  it("downloads the .pbix, stages it, and returns FileRef + fileName", async () => {
    const result = await exportReportDefinition(
      baseInput({ workspaceId: "ws-1", reportId: "rep-1" }),
    );

    const call = mockDownload.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.reportId).toBe("rep-1");

    const stageCall = mockStageFileToStorage.mock.calls[0]![0];
    expect(stageCall.fileName).toBe("report-rep-1.pbix");
    expect(stageCall.bytes).toBe(PBIX_BYTES);
    expect(stageCall.provider).toBe("microsoft-powerbi");

    expect(result.output).toEqual({
      file: expect.objectContaining({ kind: "v2_storage" }),
      fileName: "report-rep-1.pbix",
    });
    expect(Object.keys(result.output)).toEqual(["file", "fileName"]);
  });

  it("rejects a missing reportId", async () => {
    await expect(
      exportReportDefinition(baseInput({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      exportReportDefinition(
        baseInput({
          workspaceId: "ws-1",
          reportId: "rep-1",
          downloadType: "IncludeModel",
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await exportReportDefinition({
      ...baseInput({ workspaceId: "ws-1", reportId: "rep-1" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures (e.g. incremental-refresh model) to the engine", async () => {
    mockDownload.mockRejectedValueOnce(
      new Error("Power BI report Export GET failed: PowerBIModelNotSupported"),
    );
    await expect(
      exportReportDefinition(baseInput({ workspaceId: "ws-1", reportId: "rep-1" })),
    ).rejects.toThrow(/PowerBIModelNotSupported/);
    expect(mockStageFileToStorage).not.toHaveBeenCalled();
  });

  it("never leaks the access token into the output", async () => {
    const result = await exportReportDefinition(
      baseInput({ workspaceId: "ws-1", reportId: "rep-1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
