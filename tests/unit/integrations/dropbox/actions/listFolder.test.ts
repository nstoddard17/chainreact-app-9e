/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/filesListFolder", () => ({
  filesListFolder: (...a: unknown[]) => mockList(...a),
}));

import { listFolder } from "@/integrations/dropbox/actions/listFolder";

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

beforeEach(() => {
  mockRefresh.mockReset();
  mockList.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropbox list_folder", () => {
  it("normalizes entries + surfaces cursor/hasMore", async () => {
    mockList.mockResolvedValueOnce({
      entries: [
        { ".tag": "folder", id: "id:f", name: "Sub", path_display: "/Sub" },
        { ".tag": "file", id: "id:1", name: "a.txt", path_display: "/a.txt", size: 3 },
      ],
      cursor: "cur-1",
      has_more: true,
    });
    const res = await listFolder(input({ path: "" }));
    expect(res.output.count).toBe(2);
    expect(res.output.cursor).toBe("cur-1");
    expect(res.output.hasMore).toBe(true);
    const entries = res.output.entries as Array<{ isFolder: boolean; path: string }>;
    expect(entries[0]!.isFolder).toBe(true);
    expect(entries[1]!.path).toBe("/a.txt");
  });

  it("defaults path to root '' and recursive false", async () => {
    mockList.mockResolvedValueOnce({ entries: [], cursor: "c", has_more: false });
    await listFolder(input({}));
    expect(mockList.mock.calls[0]![0]).toMatchObject({ path: "", recursive: false });
  });

  it("forwards a continuation cursor", async () => {
    mockList.mockResolvedValueOnce({ entries: [], cursor: "c2", has_more: false });
    await listFolder(input({ cursor: "prev" }));
    expect(mockList.mock.calls[0]![0]).toMatchObject({ cursor: "prev" });
  });
});
