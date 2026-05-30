/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/filesDelete", () => ({
  filesDelete: (...a: unknown[]) => mockDelete(...a),
}));

import { deleteFile } from "@/integrations/dropbox/actions/deleteFile";

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
  mockDelete.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropbox delete_file", () => {
  it("emits STRUCTURAL-ONLY output (no name / content echoed)", async () => {
    // Even though Dropbox returns full metadata, we never echo it.
    mockDelete.mockResolvedValueOnce({
      ".tag": "file",
      id: "id:1",
      name: "confidential-quarterly.pdf",
      path_display: "/folder/doc.pdf",
    });
    const res = await deleteFile(input({ path: "/folder/doc.pdf" }));
    expect(Object.keys(res.output).sort()).toEqual([
      "deletedAt",
      "path",
      "success",
    ]);
    expect(res.output.success).toBe(true);
    expect(res.output.path).toBe("/folder/doc.pdf");
    expect(typeof res.output.deletedAt).toBe("string");
    // The deleted file's NAME (from Dropbox metadata) is never surfaced.
    expect(JSON.stringify(res.output)).not.toContain("confidential");
  });

  it("calls delete_v2 with the configured path", async () => {
    mockDelete.mockResolvedValueOnce({ id: "id:1" });
    await deleteFile(input({ path: "/x" }));
    expect(mockDelete.mock.calls[0]![0]).toMatchObject({ path: "/x" });
  });
});
