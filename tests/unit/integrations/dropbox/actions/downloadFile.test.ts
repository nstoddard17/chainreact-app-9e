/**
 * @jest-environment node
 *
 * dropbox:download_file — FileRef producer. Verifies bytes are staged to
 * v2 storage and the output is a FileRef (never base64 / inline bytes).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockDownload = jest.fn();
const mockStage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/filesDownload", () => ({
  filesDownload: (...a: unknown[]) => mockDownload(...a),
}));
jest.mock("@/services/files/stageFileToStorage", () => ({
  stageFileToStorage: (...a: unknown[]) => mockStage(...a),
}));

import { downloadFile } from "@/integrations/dropbox/actions/downloadFile";

function input(config: Record<string, unknown>) {
  const triggerEvent: TriggerEvent = {
    provider: "dropbox",
    eventType: "manual",
    eventId: "e",
    occurredAt: "2026-05-24T00:00:00Z",
    providerAccountId: "dbid:1",
    payload: {},
  };
  return { workflowId: "wf", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent };
}

const stagedRef = {
  kind: "v2_storage" as const,
  name: "a.txt",
  mimeType: "application/octet-stream",
  storagePath: "u/wf/r/n/a.txt",
  provider: "dropbox",
};

beforeEach(() => {
  mockRefresh.mockReset();
  mockDownload.mockReset();
  mockStage.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockStage.mockResolvedValue({ ref: stagedRef, record: {} });
});

describe("dropbox download_file — FileRef producer", () => {
  it("stages bytes and returns FileRef(v2_storage); no base64 in output", async () => {
    mockDownload.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 2, 3]),
      metadata: { name: "a.txt", path_display: "/a.txt", size: 3, rev: "rev1" },
    });
    const res = await downloadFile(input({ path: "/a.txt" }));
    expect(res.output.file).toBe(stagedRef);
    expect(res.output.name).toBe("a.txt");
    expect(res.output.path).toBe("/a.txt");
    expect(res.output.sizeBytes).toBe(3);
    expect(res.output.rev).toBe("rev1");
    expect(JSON.stringify(res.output)).not.toContain("base64");
  });

  it("stages with provider=dropbox + octet-stream mime + the resolved name", async () => {
    mockDownload.mockResolvedValueOnce({
      bytes: new Uint8Array([1]),
      metadata: { name: "report.pdf", path_display: "/report.pdf", size: 1 },
    });
    await downloadFile(input({ path: "/report.pdf" }));
    expect(mockStage.mock.calls[0]![0]).toMatchObject({
      provider: "dropbox",
      fileName: "report.pdf",
      mimeType: "application/octet-stream",
      userId: "u",
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
    });
  });

  it("derives a filename from the path when Dropbox omits the name", async () => {
    mockDownload.mockResolvedValueOnce({
      bytes: new Uint8Array([1]),
      metadata: {},
    });
    await downloadFile(input({ path: "/folder/derived.txt" }));
    expect(mockStage.mock.calls[0]![0].fileName).toBe("derived.txt");
  });
});
