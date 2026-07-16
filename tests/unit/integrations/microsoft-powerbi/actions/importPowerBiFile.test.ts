/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockImportPost = jest.fn();
const mockFetchFileBytes = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/imports/importPost", () => ({
  importPost: (...args: unknown[]) => mockImportPost(...args),
}));

jest.mock("@/core/files/fetchFileBytes", () => ({
  WORKFLOW_FILES_BUCKET: "workflow-files",
  fetchFileBytes: (...args: unknown[]) => mockFetchFileBytes(...args),
}));

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(),
}));

import {
  importPowerBiFile,
  PowerBiImportConfigError,
} from "@/integrations/microsoft-powerbi/actions/imports/importPowerBiFile";

const BYTES = new Uint8Array([1, 2, 3, 4]);

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockImportPost.mockReset();
  mockFetchFileBytes.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockFetchFileBytes.mockResolvedValue({
    bytes: BYTES,
    name: "Report.pbix",
    mimeType: "application/octet-stream",
    sizeBytes: BYTES.byteLength,
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

const signedUrlFile = {
  kind: "signed_url",
  name: "Report.pbix",
  mimeType: "application/octet-stream",
  url: "https://example.com/signed/report.pbix",
};

const v2StorageFile = {
  kind: "v2_storage",
  name: "Report.pbix",
  mimeType: "application/octet-stream",
  storagePath: "u/wf/r/n/Report.pbix",
};

const providerUrlFile = {
  kind: "provider_url",
  name: "Report.pbix",
  mimeType: "application/octet-stream",
  url: "https://provider.example.com/file",
  provider: "slack",
};

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "ws-1",
    file: signedUrlFile,
    datasetDisplayName: "Report.pbix",
    nameConflict: "Abort",
    ...overrides,
  };
}

describe("import_power_bi_file action", () => {
  it("resolves bytes and uploads via importPost, returning the import id", async () => {
    mockImportPost.mockResolvedValueOnce({
      importId: "imp-1",
      importState: null,
    });

    const result = await importPowerBiFile(baseInput(baseConfig()));

    const call = mockImportPost.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetDisplayName).toBe("Report.pbix");
    expect(call.nameConflict).toBe("Abort");
    expect(call.skipReport).toBeUndefined();
    expect(call.fileBytes).toBe(BYTES);
    expect(result.output).toEqual({ importId: "imp-1", importState: null });
  });

  it("forwards skipReport only when true", async () => {
    mockImportPost.mockResolvedValueOnce({
      importId: "imp-2",
      importState: null,
    });

    await importPowerBiFile(baseInput(baseConfig({ skipReport: true })));
    expect(mockImportPost.mock.calls[0]![0].skipReport).toBe(true);

    mockImportPost.mockResolvedValueOnce({
      importId: "imp-3",
      importState: null,
    });
    await importPowerBiFile(baseInput(baseConfig({ skipReport: false })));
    expect(mockImportPost.mock.calls[1]![0].skipReport).toBeUndefined();
  });

  it("rejects FileRef(kind=provider_url) with a structured config error + unblock hint", async () => {
    try {
      await importPowerBiFile(baseInput(baseConfig({ file: providerUrlFile })));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PowerBiImportConfigError);
      expect((err as PowerBiImportConfigError).code).toBe(
        "provider_url_unsupported",
      );
      expect((err as PowerBiImportConfigError).hint).toMatch(/stage bytes/i);
    }
    expect(mockFetchFileBytes).not.toHaveBeenCalled();
    expect(mockImportPost).not.toHaveBeenCalled();
  });

  it("passes a storage adapter for v2_storage refs; none for signed_url", async () => {
    mockImportPost.mockResolvedValue({ importId: "imp-4", importState: null });

    await importPowerBiFile(baseInput(baseConfig({ file: v2StorageFile })));
    expect(mockFetchFileBytes.mock.calls[0]![1]).toHaveProperty("storage");
    expect(
      (mockFetchFileBytes.mock.calls[0]![1] as { storage?: unknown }).storage,
    ).toBeDefined();

    await importPowerBiFile(baseInput(baseConfig()));
    expect(
      (mockFetchFileBytes.mock.calls[1]![1] as { storage?: unknown }).storage,
    ).toBeUndefined();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockImportPost.mockResolvedValueOnce({
      importId: "imp-5",
      importState: "Publishing",
    });

    await importPowerBiFile({
      ...baseInput(baseConfig()),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("rejects a missing nameConflict (Q11 — no hidden default)", async () => {
    const config = baseConfig();
    delete (config as Record<string, unknown>).nameConflict;
    await expect(importPowerBiFile(baseInput(config))).rejects.toThrow();
    expect(mockImportPost).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict()) — raw wire fields can't smuggle in", async () => {
    await expect(
      importPowerBiFile(baseInput(baseConfig({ fileUrl: "https://sas" }))),
    ).rejects.toThrow();
    expect(mockImportPost).not.toHaveBeenCalled();
  });

  it("rejects inline bytes in the FileRef (contract strictness)", async () => {
    await expect(
      importPowerBiFile(
        baseInput(baseConfig({ file: { ...signedUrlFile, base64: "AAAA" } })),
      ),
    ).rejects.toThrow();
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockImportPost.mockRejectedValueOnce(
      new Error("Power BI import POST failed: Invalid file"),
    );
    await expect(importPowerBiFile(baseInput(baseConfig()))).rejects.toThrow(
      /Invalid file/,
    );
  });

  it("never leaks the access token into the output", async () => {
    mockImportPost.mockResolvedValueOnce({
      importId: "imp-6",
      importState: null,
    });
    const result = await importPowerBiFile(baseInput(baseConfig()));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
