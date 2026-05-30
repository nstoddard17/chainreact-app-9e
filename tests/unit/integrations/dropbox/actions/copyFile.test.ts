/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockCopy = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/filesCopy", () => ({
  filesCopy: (...a: unknown[]) => mockCopy(...a),
}));

import { copyFile } from "@/integrations/dropbox/actions/copyFile";

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
  mockCopy.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropbox copy_file", () => {
  it("copies fromPath → toPath and returns the new entry", async () => {
    mockCopy.mockResolvedValueOnce({
      ".tag": "file",
      id: "id:2",
      name: "copy.txt",
      path_display: "/dest/copy.txt",
    });
    const res = await copyFile(input({ fromPath: "/a.txt", toPath: "/dest/copy.txt" }));
    expect(res.output).toEqual({
      id: "id:2",
      name: "copy.txt",
      path: "/dest/copy.txt",
      isFolder: false,
    });
    expect(mockCopy.mock.calls[0]![0]).toMatchObject({
      fromPath: "/a.txt",
      toPath: "/dest/copy.txt",
    });
  });
});
