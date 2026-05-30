/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockMove = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/filesMove", () => ({
  filesMove: (...a: unknown[]) => mockMove(...a),
}));

import { moveFile } from "@/integrations/dropbox/actions/moveFile";

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
  mockMove.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropbox move_file", () => {
  it("moves fromPath → toPath and returns the moved entry", async () => {
    mockMove.mockResolvedValueOnce({
      ".tag": "file",
      id: "id:1",
      name: "b.txt",
      path_display: "/dest/b.txt",
    });
    const res = await moveFile(input({ fromPath: "/a.txt", toPath: "/dest/b.txt" }));
    expect(res.output).toEqual({
      id: "id:1",
      name: "b.txt",
      path: "/dest/b.txt",
      isFolder: false,
    });
    expect(mockMove.mock.calls[0]![0]).toMatchObject({
      fromPath: "/a.txt",
      toPath: "/dest/b.txt",
    });
  });

  it("preserves the runtime field names fromPath/toPath", async () => {
    mockMove.mockResolvedValueOnce({ id: "id:1", name: "x" });
    await moveFile(input({ fromPath: "/x", toPath: "/y" }));
    const args = mockMove.mock.calls[0]![0];
    expect(args.fromPath).toBe("/x");
    expect(args.toPath).toBe("/y");
  });
});
