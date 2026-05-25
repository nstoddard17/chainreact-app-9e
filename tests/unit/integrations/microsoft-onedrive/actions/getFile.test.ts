/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onedrive/api/driveItemsGet", () => ({
  driveItemsGet: (...args: unknown[]) => mockGet(...args),
}));

import { getFile } from "@/integrations/microsoft-onedrive/actions/getFile";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-onedrive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("get_file action", () => {
  it("returns file metadata + downloadUrl on file items", async () => {
    mockGet.mockResolvedValueOnce({
      id: "i-1",
      name: "report.pdf",
      size: 8192,
      file: { mimeType: "application/pdf" },
      webUrl: "https://1drv.ms/w",
      "@microsoft.graph.downloadUrl": "https://public.bn.files.1drv.com/y4m",
      parentReference: { id: "p-1", path: "/drive/root:/Reports" },
      createdDateTime: "2026-05-08T10:00:00Z",
      lastModifiedDateTime: "2026-05-09T11:00:00Z",
    });

    const result = await getFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1" },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      itemId: "i-1",
      name: "report.pdf",
      kind: "file",
      size: 8192,
      mimeType: "application/pdf",
      webUrl: "https://1drv.ms/w",
      downloadUrl: "https://public.bn.files.1drv.com/y4m",
      parentReference: { id: "p-1", path: "/drive/root:/Reports" },
      createdDateTime: "2026-05-08T10:00:00Z",
      lastModifiedDateTime: "2026-05-09T11:00:00Z",
    });
  });

  it("returns kind: 'folder' and mimeType: null on folder items", async () => {
    mockGet.mockResolvedValueOnce({
      id: "f-1",
      name: "Reports",
      folder: { childCount: 7 },
      webUrl: "https://1drv.ms/x",
    });

    const result = await getFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "f-1" },
      triggerEvent: trigger(),
    });

    expect(result.output.kind).toBe("folder");
    expect(result.output.mimeType).toBeNull();
    expect(result.output.downloadUrl).toBeNull();
  });

  it("rejects empty itemId", async () => {
    await expect(
      getFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown fields (strict mode)", async () => {
    await expect(
      getFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { itemId: "i", path: "/foo" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
