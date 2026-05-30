/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockGetMetadata = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/filesGetMetadata", () => ({
  filesGetMetadata: (...a: unknown[]) => mockGetMetadata(...a),
}));

import { getFileMetadata } from "@/integrations/dropbox/actions/getFileMetadata";

function trigger(): TriggerEvent {
  return {
    provider: "dropbox",
    eventType: "manual",
    eventId: "e",
    occurredAt: "2026-05-24T00:00:00Z",
    providerAccountId: "dbid:1",
    payload: {},
  };
}
function input(config: Record<string, unknown>) {
  return { workflowId: "wf", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent: trigger() };
}

beforeEach(() => {
  mockRefresh.mockReset();
  mockGetMetadata.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropbox get_file_metadata", () => {
  it("normalizes the entry into the stable output shape", async () => {
    mockGetMetadata.mockResolvedValueOnce({
      ".tag": "file",
      id: "id:1",
      name: "report.pdf",
      path_display: "/Reports/report.pdf",
      size: 1024,
      rev: "rev1",
      content_hash: "abc",
    });
    const res = await getFileMetadata(input({ path: "/Reports/report.pdf" }));
    expect(res.output).toEqual({
      id: "id:1",
      name: "report.pdf",
      path: "/Reports/report.pdf",
      isFolder: false,
      sizeBytes: 1024,
      rev: "rev1",
      clientModified: null,
      serverModified: null,
      contentHash: "abc",
    });
  });

  it("threads accountId from the trigger event into refreshAndRetry", async () => {
    mockGetMetadata.mockResolvedValueOnce({ id: "id:1", name: "x" });
    await getFileMetadata(input({ path: "/x" }));
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      provider: "dropbox",
      accountId: "dbid:1",
    });
  });

  it("preserves the runtime field name `path`", async () => {
    mockGetMetadata.mockResolvedValueOnce({ id: "id:1", name: "x" });
    await getFileMetadata(input({ path: "/exact/path" }));
    expect(mockGetMetadata.mock.calls[0]![0]).toMatchObject({ path: "/exact/path" });
  });
});
